"""Server locale (FastAPI) usato dall'interfaccia. Ascolta solo su 127.0.0.1."""
from __future__ import annotations

import base64
import logging
import secrets
import time
import traceback
from pathlib import Path

import pymupdf
from fastapi import Body, FastAPI, File, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from . import APP_NAME, __version__, config, fonts, p7m
from .fileutil import wait_readable
from .store import store
from .tools import REGISTRY, Ctx, ToolError
from .tools.convert import SUPPORTED_INPUT, any_to_pdf

log = logging.getLogger("hdpdf")

# token casuale: impedisce ad altre pagine web aperte nel browser di usare l'API locale
API_TOKEN = secrets.token_urlsafe(24)


def create_app(require_token: bool = False) -> FastAPI:
    app = FastAPI(title=APP_NAME, version=__version__, docs_url=None, redoc_url=None)
    app.state.require_token = require_token

    @app.middleware("http")
    async def guard(request: Request, call_next):
        if request.url.path.startswith("/api/") and app.state.require_token:
            tok = request.headers.get("x-hdpdf-token") or request.query_params.get("t")
            if tok != API_TOKEN:
                return JSONResponse({"detail": "Non autorizzato"}, status_code=401)
        return await call_next(request)

    _ALL_PERMS = (pymupdf.PDF_PERM_PRINT | pymupdf.PDF_PERM_MODIFY | pymupdf.PDF_PERM_COPY | pymupdf.PDF_PERM_ANNOTATE
                  | pymupdf.PDF_PERM_FORM | pymupdf.PDF_PERM_ACCESSIBILITY | pymupdf.PDF_PERM_ASSEMBLE | pymupdf.PDF_PERM_PRINT_HQ)

    def doc_info(item) -> dict:
        from .tools.security import is_own_protection
        d = pymupdf.open(item.path)
        needs = d.needs_pass
        locked = bool(needs)
        pw = item.extra.get("password")
        if needs and pw:
            d.authenticate(pw)
            needs = False
        encrypted = bool(d.is_encrypted or d.needs_pass or (d.metadata or {}).get("encryption"))
        # "sole restrizioni" solo se qualcosa è davvero bloccato: molti PDF (banche, scanner, Office) sono cifrati
        # senza password e con tutti i permessi, oppure con password del proprietario vuota. Per l'utente sono PDF
        # senza password: non si chiede niente.
        restricted = False
        if encrypted and not locked:
            restricted = (d.permissions & _ALL_PERMS) != _ALL_PERMS
            if restricted:
                probe = pymupdf.open(item.path)
                restricted = not probe.authenticate("") & 4    # password del proprietario vuota = nessun limite reale
                probe.close()
        info = {"id": item.id, "name": item.name, "pages": d.page_count if not needs else None,
                "encrypted": encrypted,
                "needs_password": needs,
                # sole restrizioni: si apre senza password, ma c'è una password del proprietario (stampa/copia/modifica)
                "restricted": restricted,
                "unlocked": bool(pw),
                "owner_unlocked": bool(item.extra.get("owner_unlocked")),
                # protezione messa con l'app dall'utente di questo dispositivo
                "owner": encrypted and is_own_protection(item.path),
                "size": item.path.stat().st_size, "parent": item.parent}
        d.close()
        return info

    app.state.on_open_paths = None

    @app.post("/api/instance/open")
    def instance_open(payload: dict = Body(...)):
        """Usato da una seconda istanza avviata con "Apri con": passa i file alla finestra già aperta."""
        cb = app.state.on_open_paths
        if cb:
            # action: cosa fare con i file (menu del tasto destro di Windows); vuota = aprirli
            cb([str(p) for p in payload.get("paths", [])], str(payload.get("action") or "apri"))
        return {"ok": bool(cb)}

    # versione nel browser (Linux): la pagina "batte" ogni pochi secondi; qui riceve i file da aprire
    app.state.last_beat = 0.0
    app.state.pending_open = []
    app.state.pending_actions = []

    @app.get("/api/heartbeat")
    def heartbeat():
        app.state.last_beat = time.time()
        out, app.state.pending_open = app.state.pending_open, []
        acts, app.state.pending_actions = app.state.pending_actions, []
        return {"open": out, "actions": acts}

    @app.get("/api/health")
    def health():
        return {"app": APP_NAME, "version": __version__}

    @app.get("/api/capabilities")
    def caps():
        c = config.capabilities()
        c["input_formats"] = SUPPORTED_INPUT
        c["version"] = __version__
        from . import aggiornamenti
        c["update_url"] = aggiornamenti.base_url()   # vuoto = avviso di nuova versione spento
        return c

    @app.get("/api/update/check")
    def update_check(platform: str = "windows"):
        """È uscita una versione più recente? (app desktop; l'app Android lo chiede direttamente, il motore non ha rete)"""
        from . import aggiornamenti
        return aggiornamenti.check(platform, __version__)

    @app.get("/api/fonts")
    def list_fonts():
        return fonts.list_fonts()

    @app.get("/api/fonts/{font_id}/file")
    def font_file(font_id: str):
        f = fonts.get(font_id)
        if not f.path:
            raise HTTPException(404, "Font standard PDF: nessun file")
        return FileResponse(f.path)

    @app.post("/api/open")
    async def open_files(files: list[UploadFile] = File(...)):
        out = []
        for uf in files:
            data = await uf.read()
            name = Path(uf.filename or "documento.pdf").name
            raw = store.add_bytes(data, name, kind="asset")
            try:
                pdf_path = any_to_pdf(raw.path, name)
            except ToolError as ex:
                raise HTTPException(400, str(ex))
            finally:
                store.delete(raw.id)  # any_to_pdf produce sempre un file nuovo
            pdf_name = name if name.lower().endswith(".pdf") else Path(name).stem + ".pdf"
            item = store.add(pdf_path, pdf_name, kind="pdf")
            out.append(doc_info(item))
        return out

    @app.post("/api/open-path")
    def open_path(payload: dict = Body(...)):
        """Apre un file dal disco (usato dall'app desktop: 'Apri con', trascina file)."""
        p = Path(payload["path"])
        if not p.exists():
            raise HTTPException(404, "File non trovato")
        try:
            pdf_path = any_to_pdf(p, p.name)
        except ToolError as ex:
            raise HTTPException(400, str(ex))
        name = p.name if p.suffix.lower() == ".pdf" else p.stem + ".pdf"
        item = store.add(pdf_path, name, kind="pdf", source=str(p))
        return doc_info(item)

    @app.post("/api/docs/{doc_id}/password")
    def unlock(doc_id: str, payload: dict = Body(...)):
        item = store.get(doc_id)
        pw = payload.get("password", "")
        d = pymupdf.open(item.path)
        restricted = not d.needs_pass
        code = d.authenticate(pw) if pw else 0
        d.close()
        # sole restrizioni: senza password si apre già; qui serve proprio la password del proprietario
        if not code or (restricted and not code & 4):
            raise HTTPException(400, "Password del proprietario errata." if restricted else "Password errata.")
        item.extra["password"] = pw
        item.extra["owner_unlocked"] = bool(code & 4)
        return doc_info(item)

    @app.get("/api/docs/{doc_id}")
    def get_doc(doc_id: str):
        try:
            return doc_info(store.get(doc_id))
        except KeyError as ex:
            raise HTTPException(404, str(ex))

    @app.get("/api/items/{item_id}/file")
    def item_file(item_id: str, download: bool = False):
        try:
            it = store.get(item_id)
        except KeyError as ex:
            raise HTTPException(404, str(ex))
        try:
            # un file appena creato può essere ancora bloccato da Word, OneDrive o dall'antivirus: si aspetta un po'
            wait_readable(it.path, timeout=10)
        except PermissionError:
            raise HTTPException(423, "Il file è ancora in uso da un altro programma (Word, OneDrive o antivirus). "
                                     "Riprova tra qualche secondo.")
        return FileResponse(it.path, media_type=it.mime, filename=it.name if download else None,
                            headers={"Cache-Control": "no-store"})

    @app.post("/api/assets")
    async def upload_asset(file: UploadFile = File(...)):
        data = await file.read()
        it = store.add_bytes(data, Path(file.filename or "file").name, kind="asset")
        return {"id": it.id, "name": it.name, "size": len(data), "mime": it.mime}

    @app.post("/api/assets/path")
    def asset_from_paths(payload: dict = Body(...)):
        """App desktop: file scelti in Esplora risorse (menu del tasto destro) come allegati per gli strumenti."""
        out = []
        for raw in payload.get("paths") or []:
            p = Path(raw)
            if not p.is_file():
                continue
            it = store.add_bytes(p.read_bytes(), p.name, kind="asset")
            out.append({"id": it.id, "name": it.name, "size": it.path.stat().st_size, "mime": it.mime})
        return out

    @app.post("/api/assets/dataurl")
    def upload_dataurl(payload: dict = Body(...)):
        header, _, b64 = payload["data"].partition(",")
        data = base64.b64decode(b64)
        name = payload.get("name") or ("firma.png" if "png" in header else "immagine.jpg")
        it = store.add_bytes(data, name, kind="asset")
        return {"id": it.id, "name": it.name, "size": len(data)}

    # ---- firme salvate (fino a 3 immagini + l'ultima disegnata), nella cartella dati utente
    SIG_SLOTS = ("1", "2", "3", "disegnata")

    def sig_dir() -> Path:
        d = config.data_dir() / "firme"
        d.mkdir(parents=True, exist_ok=True)
        return d

    @app.get("/api/signatures")
    def list_signatures():
        out = []
        for slot in SIG_SLOTS:
            p = sig_dir() / f"{slot}.png"
            data = "data:image/png;base64," + base64.b64encode(p.read_bytes()).decode() if p.exists() else None
            out.append({"slot": slot, "data": data})
        return out

    @app.put("/api/signatures/{slot}")
    def save_signature(slot: str, payload: dict = Body(...)):
        if slot not in SIG_SLOTS:
            raise HTTPException(400, "Posizione firma non valida")
        _, _, b64 = payload.get("data", "").partition(",")
        try:
            import io as _io

            from PIL import Image

            im = Image.open(_io.BytesIO(base64.b64decode(b64)))
            im = im.convert("RGBA")
            im.thumbnail((1400, 1400))
            buf = _io.BytesIO()
            im.save(buf, "PNG")
        except Exception:
            raise HTTPException(400, "Immagine della firma non valida")
        (sig_dir() / f"{slot}.png").write_bytes(buf.getvalue())
        return {"ok": True}

    @app.delete("/api/signatures/{slot}")
    def delete_signature(slot: str):
        if slot not in SIG_SLOTS:
            raise HTTPException(400, "Posizione firma non valida")
        (sig_dir() / f"{slot}.png").unlink(missing_ok=True)
        return {"ok": True}

    # ------------------------------------------------------------ file firmati .p7m / .p7s
    def _p7m_response(data: bytes, name: str, detached: bytes | None, online: bool) -> dict:
        try:
            a = p7m.analyze(data, name, detached=detached, online=online)
        except p7m.P7mError as ex:
            raise HTTPException(400, str(ex))
        content = store.add_bytes(a.content, a.content_name, kind="output", mime=a.content_mime)
        body = {"report": a.report, "content": {"id": content.id, "name": content.name, "size": len(a.content),
                                                 "mime": a.content_mime}}
        if a.content_mime == "application/pdf":
            pdf = store.add_bytes(a.content, a.content_name, kind="pdf")
            body["doc"] = doc_info(pdf)
        return body

    @app.post("/api/p7m/analyze")
    def p7m_analyze(payload: dict = Body(...)):
        """Verifica una busta firmata: da un file caricato (asset) o da un percorso (app desktop)."""
        online = bool(payload.get("online", True))
        if payload.get("path"):
            p = Path(payload["path"])
            if not p.exists():
                raise HTTPException(404, "File non trovato")
            data, name = p.read_bytes(), p.name
        elif payload.get("asset"):
            it = store.get(payload["asset"])
            data, name = it.path.read_bytes(), it.name
        else:
            raise HTTPException(400, "Nessun file da verificare.")
        detached = store.get(payload["detached"]).path.read_bytes() if payload.get("detached") else None
        try:
            return _p7m_response(data, name, detached, online)
        except HTTPException:
            raise
        except Exception as ex:  # noqa: BLE001
            log.error("Errore verifica p7m: %s", traceback.format_exc())
            raise HTTPException(500, f"Errore imprevisto durante la verifica: {ex}")

    @app.post("/api/p7m/report")
    def p7m_report(payload: dict = Body(...)):
        rep = payload.get("report") or {}
        base = rep.get("content", {}).get("name") or "documento"
        out = store.add_bytes(p7m.report_pdf(rep), f"Rapporto verifica - {base.rsplit('.', 1)[0]}.pdf", kind="output")
        return {"id": out.id, "name": out.name, "size": out.path.stat().st_size}

    # ---- azioni sui file firmati: estrai, marca temporale, cifra (anche dal menu del tasto destro)
    def _p7m_src(payload: dict) -> tuple[Path | None, bytes, str]:
        if payload.get("path"):
            p = Path(payload["path"])
            if not p.is_file():
                raise HTTPException(404, f"File non trovato: {p.name}")
            return p, p.read_bytes(), p.name
        if payload.get("asset"):
            it = store.get(payload["asset"])
            return None, it.path.read_bytes(), it.name
        raise HTTPException(400, "Nessun file indicato.")

    @app.post("/api/p7m/extract")
    def p7m_extract(payload: dict = Body(...)):
        """Estrae il documento nella stessa cartella del file firmato (app desktop)."""
        from . import p7m_tools
        p, _, _ = _p7m_src(payload)
        if p is None:
            raise HTTPException(400, "Serve il percorso del file.")
        try:
            dest = p7m_tools.extract_to_folder(p)
        except p7m.P7mError as ex:
            raise HTTPException(400, str(ex))
        return {"path": str(dest), "name": dest.name}

    @app.post("/api/p7m/timestamp")
    def p7m_timestamp(payload: dict = Body(...)):
        from . import p7m_tools
        p, data, name = _p7m_src(payload)
        url = (payload.get("url") or "").strip() or p7m_tools.DEFAULT_TSA
        fetch = p7m_tools._http_tsa(url, payload.get("user") or "", payload.get("password") or "")
        try:
            out, n = p7m_tools.add_timestamp(data, fetch)
        except p7m.P7mError as ex:
            raise HTTPException(400, str(ex))
        base = p7m._strip_ext(name)
        new_name = f"{Path(base).stem} (marcato){Path(base).suffix}.p7m"
        body: dict = {"count": n, "default_tsa": url == p7m_tools.DEFAULT_TSA}
        if p is not None:
            dest = p7m_tools.unique_path(p.with_name(new_name))
            dest.write_bytes(out)
            body.update(path=str(dest), name=dest.name)
        else:
            it = store.add_bytes(out, new_name, kind="output")
            body.update(output={"id": it.id, "name": it.name, "size": len(out)}, name=it.name)
        return body

    @app.post("/api/p7m/encrypt")
    def p7m_encrypt(payload: dict = Body(...)):
        from . import p7m_tools
        try:
            certs = [p7m_tools.load_certificate(store.get(c).path.read_bytes()) for c in payload.get("certs") or []]
            results = []
            for src in payload.get("files") or [payload]:
                p, data, name = _p7m_src(src)
                out, warnings = p7m_tools.encrypt(data, certs)
                if p is not None:
                    dest = p7m_tools.unique_path(p.with_name(p.name + ".p7e"))
                    dest.write_bytes(out)
                    results.append({"path": str(dest), "name": dest.name, "warnings": warnings})
                else:
                    it = store.add_bytes(out, name + ".p7e", kind="output")
                    results.append({"output": {"id": it.id, "name": it.name, "size": len(out)}, "name": it.name,
                                    "warnings": warnings})
        except p7m.P7mError as ex:
            raise HTTPException(400, str(ex))
        return {"results": results, "recipients": [p7m_tools.cert_label(c) for c in certs]}

    @app.get("/api/p7m/trust")
    def p7m_trust():
        return p7m.trust_list(allow_download=False).info()

    @app.post("/api/p7m/trust/refresh")
    def p7m_trust_refresh():
        return p7m.trust_list(refresh=True).info()

    @app.post("/api/p7m/trust/upload")
    async def p7m_trust_upload(request: Request):
        raw = await request.body()
        try:
            return p7m.install_trust_list(raw, request.query_params.get("source") or "file").info()
        except p7m.P7mError as ex:
            raise HTTPException(400, str(ex)) from ex

    # impostazioni dell'interfaccia (preferiti, etichette, tema, misure dei pannelli…) salvate su disco:
    # la finestra usa una porta diversa a ogni avvio, quindi la memoria del browser non basta.
    settings_file = config.data_dir() / "impostazioni.json"

    def _read_settings() -> dict:
        try:
            import json
            v = json.loads(settings_file.read_text(encoding="utf-8"))
            return v if isinstance(v, dict) else {}
        except FileNotFoundError:
            return {}
        except Exception:  # noqa: BLE001 - file rovinato: se ne tiene una copia e si riparte dai valori predefiniti
            try:
                settings_file.replace(settings_file.with_name("impostazioni-rovinato.json"))
            except OSError:
                pass
            return {}

    @app.get("/api/settings")
    def settings_get():
        return _read_settings()

    @app.put("/api/settings")
    def settings_put(payload: dict = Body(...)):
        import json
        cur = _read_settings()
        for k, v in payload.items():
            if not isinstance(k, str) or not k.startswith("hdpdf.") or len(k) > 100:
                continue
            if v is None:
                cur.pop(k, None)
            elif isinstance(v, str) and len(v) <= 5_000_000:
                cur[k] = v
        settings_file.parent.mkdir(parents=True, exist_ok=True)
        tmp = settings_file.with_suffix(".tmp")
        tmp.write_text(json.dumps(cur, ensure_ascii=False, indent=1), encoding="utf-8")
        tmp.replace(settings_file)   # scrittura atomica: un arresto improvviso non rovina il file
        return {"ok": True}

    @app.get("/api/user")
    def current_user():
        """Nome da usare come autore dei commenti (nome visualizzato di Windows, se disponibile)."""
        import getpass
        name = ""
        try:
            if config.IS_WINDOWS:
                import ctypes
                size = ctypes.c_ulong(0)
                ctypes.windll.secur32.GetUserNameExW(3, None, ctypes.byref(size))  # 3 = NameDisplay
                if size.value:
                    buf = ctypes.create_unicode_buffer(size.value)
                    if ctypes.windll.secur32.GetUserNameExW(3, buf, ctypes.byref(size)):
                        name = buf.value
        except Exception:  # noqa: BLE001
            name = ""
        try:
            login = getpass.getuser()
        except Exception:  # noqa: BLE001
            login = ""
        return {"name": name or login, "login": login}

    # ------------------------------------------------------------ scheda spostata in una nuova finestra
    # La finestra di partenza deposita la scheda (versioni del documento, percorso, password…) e riceve un biglietto;
    # la nuova finestra lo ritira UNA volta. Così niente dati nell'indirizzo; il biglietto scade dopo 2 minuti.
    schede: dict[str, tuple[float, dict]] = {}

    @app.post("/api/schede")
    def scheda_deposita(payload: dict = Body(...)):
        import json as _json

        if len(_json.dumps(payload)) > 256_000:
            raise HTTPException(413, "Scheda troppo grande")
        now = time.time()
        for k, (t, _) in list(schede.items()):
            if now - t > 120:
                schede.pop(k, None)
        k = secrets.token_urlsafe(16)
        schede[k] = (now, payload)
        return {"biglietto": k}

    @app.get("/api/schede/{biglietto}")
    def scheda_ritira(biglietto: str):
        v = schede.pop(biglietto, None)
        if not v or time.time() - v[0] > 120:
            raise HTTPException(404, "La scheda non è più disponibile: riprova a spostarla.")
        return v[1]

    @app.get("/api/tools")
    def tools_list():
        return sorted(REGISTRY)

    @app.post("/api/tools/{name}")
    def run_tool(name: str, payload: dict = Body(default={})):
        spec = REGISTRY.get(name)
        if not spec:
            raise HTTPException(404, f"Strumento sconosciuto: {name}")
        ids = payload.get("docs") or ([payload["doc"]] if payload.get("doc") else [])
        try:
            items = [store.get(i) for i in ids]
        except KeyError as ex:
            raise HTTPException(404, str(ex))
        if spec["needs_doc"] and not items:
            raise HTTPException(400, "Nessun documento aperto.")
        ctx = Ctx(items=items, params=payload.get("params") or {})
        try:
            res = spec["fn"](ctx)
        except ToolError as ex:
            raise HTTPException(400, str(ex))
        except Exception as ex:  # errore imprevisto: log completo, messaggio breve
            log.error("Errore in %s: %s", name, traceback.format_exc())
            raise HTTPException(500, f"Errore imprevisto durante \"{name}\": {ex}")
        body: dict = {"message": res.message, "data": res.data}
        if res.pdf:
            parent = items[0] if items else None
            new_name = res.name or (parent.name if parent else "Documento.pdf")
            new = store.add(res.pdf, new_name, kind="pdf", parent=parent.id if parent else None)
            # dopo "Aggiungi password" il documento resta bloccato: la password va inserita (anche dal proprietario)
            if parent and parent.extra.get("password") and name != "add_password":
                new.extra["password"] = parent.extra["password"]
                new.extra["owner_unlocked"] = parent.extra.get("owner_unlocked", False)
            body["doc"] = doc_info(new)
        if res.output:
            out = store.add(res.output, res.output_name or res.output.name, kind="output")
            body["output"] = {"id": out.id, "name": out.name, "size": out.path.stat().st_size}
        return body

    static = config.static_dir()
    if (static / "index.html").exists():
        app.mount("/", StaticFiles(directory=static, html=True), name="ui")
    return app


app = create_app()
