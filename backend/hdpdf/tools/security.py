"""Sicurezza: password, firma con certificato, rimozione firma, sanitizzazione,
sblocco moduli, appiattimento, convalida."""
from __future__ import annotations

import datetime as dt
import io
import shutil
import subprocess

import pymupdf

from .base import Ctx, Result, ToolError, boolean, num, parse_pages, rect_from, tool

# ------------------------------------------------------------ password

PERMS = {
    "print": pymupdf.PDF_PERM_PRINT,
    "print_hq": pymupdf.PDF_PERM_PRINT_HQ,
    "copy": pymupdf.PDF_PERM_COPY,
    "modify": pymupdf.PDF_PERM_MODIFY,
    "annotate": pymupdf.PDF_PERM_ANNOTATE,
    "forms": pymupdf.PDF_PERM_FORM,
    "assemble": pymupdf.PDF_PERM_ASSEMBLE,
    "accessibility": pymupdf.PDF_PERM_ACCESSIBILITY,
}


# ------------------------------------------------------------ protezioni fatte su questo dispositivo
# "Proprietario" = l'utente del dispositivo (Windows o Android) che ha messo la password con l'app.
# Si ricorda l'impronta della protezione (dizionario /Encrypt + /ID del PDF, leggibili anche senza password):
# resta uguale anche se il file viene copiato o rinominato, cambia se qualcuno lo ri-protegge.
def _prot_file():
    from ..config import data_dir
    return data_dir() / "protezioni.json"


def _current_user() -> str:
    try:
        import getpass
        return getpass.getuser()
    except Exception:  # noqa: BLE001
        return ""


def protection_key(path) -> str | None:
    import hashlib
    try:
        d = pymupdf.open(path)
        try:
            kind, enc = d.xref_get_key(-1, "Encrypt")
            if kind in ("null", "") or not enc:
                return None
            if kind == "xref":
                enc = d.xref_object(int(enc.split()[0]), compressed=True)
            _, ident = d.xref_get_key(-1, "ID")
        finally:
            d.close()
        return hashlib.sha256(f"{enc}|{ident}".encode()).hexdigest()
    except Exception:  # noqa: BLE001
        return None


def _read_protections() -> list[dict]:
    import json
    try:
        v = json.loads(_prot_file().read_text(encoding="utf-8"))
        return v.get("items", []) if isinstance(v, dict) else []
    except Exception:  # noqa: BLE001
        return []


def register_protection(path, name: str = "") -> None:
    import json
    import time
    key = protection_key(path)
    if not key:
        return
    items = [i for i in _read_protections() if i.get("key") != key]
    items.append({"key": key, "user": _current_user(), "name": name, "time": int(time.time())})
    try:
        _prot_file().write_text(json.dumps({"items": items[-1000:]}), encoding="utf-8")
    except OSError:
        pass


def is_own_protection(path) -> bool:
    key = protection_key(path)
    if not key:
        return False
    me = _current_user()
    return any(i.get("key") == key and i.get("user", me) == me for i in _read_protections())


def _protected(doc: pymupdf.Document) -> bool:
    """Vero anche per i file con sole restrizioni (password proprietario senza password di apertura):
    per quelli PyMuPDF dice is_encrypted=False."""
    return bool(doc.needs_pass or doc.is_encrypted or (doc.metadata or {}).get("encryption"))


@tool("add_password")
def add_password(ctx: Ctx) -> Result:
    doc = ctx.open()
    user_pw = ctx.params.get("user_password") or ""
    owner_pw = ctx.params.get("owner_password") or ""
    if not user_pw and not owner_pw:
        raise ToolError("Inserisci almeno una password.")
    if not owner_pw:
        owner_pw = user_pw
    allowed = ctx.params.get("permissions")
    if allowed is None:
        allowed = list(PERMS)
    perm = 0
    for k in allowed:
        perm |= PERMS.get(k, 0)
    algo = {"aes256": pymupdf.PDF_ENCRYPT_AES_256, "aes128": pymupdf.PDF_ENCRYPT_AES_128,
            "rc4": pymupdf.PDF_ENCRYPT_RC4_128}.get(ctx.params.get("algorithm", "aes256"),
                                                    pymupdf.PDF_ENCRYPT_AES_256)
    p = ctx.out()
    doc.save(p, encryption=algo, user_pw=user_pw, owner_pw=owner_pw, permissions=perm,
             garbage=3, deflate=True)
    doc.close()
    register_protection(p, ctx.item.name)   # chi ha messo la password su questo dispositivo è il proprietario
    return Result(pdf=p, message="Password impostata.")


@tool("remove_password")
def remove_password(ctx: Ctx) -> Result:
    it = ctx.item
    doc = pymupdf.open(it.path)
    if not _protected(doc):
        doc.close()
        raise ToolError("Il documento non è protetto: non ci sono password da togliere.")
    pw = ctx.params.get("password") or ""
    if doc.needs_pass:
        if not doc.authenticate(pw):
            doc.close()
            raise ToolError("Password errata.")
    elif pw:
        # doc apribile ma con restrizioni: la password proprietario serve per i permessi
        doc.authenticate(pw)
    p = ctx.out()
    doc.save(p, encryption=pymupdf.PDF_ENCRYPT_NONE, garbage=3, deflate=True)
    doc.close()
    return Result(pdf=p, message="Protezione rimossa.")


PERM_LABELS = {
    "print": "Stampa", "print_hq": "Stampa in alta qualità", "copy": "Copia testo e immagini",
    "modify": "Modifica", "annotate": "Commenti e annotazioni", "forms": "Compilazione moduli",
    "assemble": "Inserire/ruotare pagine", "accessibility": "Accessibilità",
}


@tool("password_info")
def password_info(ctx: Ctx) -> Result:
    """Quali password ha il PDF. Il valore delle password non è scritto nel file (c'è solo un'impronta
    cifrata): si può dire SE ci sono e, per la password che conosci, se è di apertura o del proprietario."""
    import re
    it = ctx.item
    doc = pymupdf.open(it.path)
    try:
        enc = _protected(doc)
        data: dict = {"encrypted": enc, "open_password": bool(doc.needs_pass), "owner_password": enc,
                      "method": None, "permissions": None, "known": None,
                      "owner": bool(enc and is_own_protection(it.path))}
        if not enc:
            return Result(data=data)
        try:
            kind, val = doc.xref_get_key(-1, "Encrypt")
            if kind == "xref":
                kind, val = "dict", doc.xref_object(int(val.split()[0]), compressed=True)
            m = re.search(r"/P\s*(-?\d+)", val or "")
            if m:
                p = int(m.group(1))
                data["permissions"] = {PERM_LABELS[k]: bool(p & v) for k, v in PERMS.items()}
                data["allowed"] = [k for k, v in PERMS.items() if p & v]
            m = re.search(r"/V\s*(\d+)", val or "")
            v = int(m.group(1)) if m else 0
            data["method"] = {5: "AES 256 bit", 4: "AES 128 bit" if "AESV2" in (val or "") else "RC4 128 bit",
                              2: "RC4 128 bit", 1: "RC4 40 bit"}.get(v)
        except Exception:  # noqa: BLE001 - informazione facoltativa
            pass
        pw = ctx.params.get("password") or it.extra.get("password") or ""
        if pw:
            code = pymupdf.open(it.path).authenticate(pw)
            role = {2: "open", 4: "owner", 6: "both"}.get(code & 6, "wrong")
            data["known"] = {"password": pw, "role": role}
        if not data["method"]:
            data["method"] = (doc.metadata or {}).get("encryption")
        return Result(data=data)
    finally:
        doc.close()


# ------------------------------------------------------------ firma digitale


def _pdf_box(page: pymupdf.Page, visual) -> tuple[int, int, int, int]:
    r = rect_from(visual, page)  # coordinate MuPDF non ruotate
    r = r * ~page.transformation_matrix  # -> spazio utente PDF (origine in basso)
    r.normalize()
    return (int(r.x0), int(r.y0), int(r.x1), int(r.y1))


@tool("sign_cert")
def sign_cert(ctx: Ctx) -> Result:
    """Firma digitale PAdES con certificato PKCS#12 (.pfx/.p12), visibile o invisibile,
    con marca temporale facoltativa. Deve essere l'ultima operazione sul documento."""
    try:
        from pyhanko import stamp as hstamp
        from pyhanko.pdf_utils.incremental_writer import IncrementalPdfFileWriter
        from pyhanko.sign import fields, signers, timestamps
    except ImportError as ex:  # pragma: no cover
        raise ToolError(f"Modulo di firma non disponibile: {ex}")

    cert = ctx.asset("certificate")
    passphrase = (ctx.params.get("cert_password") or "").encode() or None
    try:
        signer = signers.SimpleSigner.load_pkcs12(str(cert.path), passphrase=passphrase)
    except Exception as ex:
        raise ToolError(f"Impossibile aprire il certificato: password errata o file non valido ({ex}).")
    if signer is None:
        raise ToolError("Impossibile aprire il certificato: password errata o file non valido.")

    doc = ctx.open()
    if doc.is_encrypted:
        raise ToolError("Rimuovi la password prima di firmare.")
    visible = boolean(ctx.params.get("visible"), True)
    pno = int(num(ctx.params.get("page"), 0))
    existing = {w.field_name for pg in doc for w in pg.widgets() or []}
    field_name = ctx.params.get("field_name") or "Firma"
    k = 1
    base = field_name
    while field_name in existing:
        k += 1
        field_name = f"{base}{k}"
    box = None
    if visible:
        if not ctx.params.get("rect"):
            raise ToolError("Indica sulla pagina dove mostrare la firma (oppure scegli firma invisibile).")
        box = _pdf_box(doc[pno], ctx.params["rect"])
    doc.close()

    subject = signer.signing_cert.subject.native
    signer_name = subject.get("common_name") or ctx.params.get("name") or "Firmatario"
    meta = signers.PdfSignatureMetadata(
        field_name=field_name,
        reason=ctx.params.get("reason") or None,
        location=ctx.params.get("location") or None,
        name=signer_name,
        contact_info=ctx.params.get("contact") or None,
        subfilter=fields.SigSeedSubFilter.PADES,
        md_algorithm="sha256",
        certify=boolean(ctx.params.get("certify"), False),
    )
    tsa_url = ctx.params.get("tsa_url")
    timestamper = timestamps.HTTPTimeStamper(tsa_url) if tsa_url else None
    lines = ["Firmato digitalmente da:", "%(signer)s", "Data: %(ts)s"]
    if ctx.params.get("reason"):
        lines.append(f"Motivo: {ctx.params['reason']}")
    style = hstamp.TextStampStyle(stamp_text="\n".join(lines),
                                  timestamp_format="%d/%m/%Y %H:%M:%S %Z",
                                  border_width=1)
    out = ctx.out()
    with open(ctx.item.path, "rb") as inf:
        w = IncrementalPdfFileWriter(inf, strict=False)
        if box:
            fields.append_signature_field(w, fields.SigFieldSpec(field_name, on_page=pno, box=box))
        pdf_signer = signers.PdfSigner(meta, signer, timestamper=timestamper,
                                       stamp_style=style if box else None)
        with open(out, "wb") as outf:
            try:
                pdf_signer.sign_pdf(w, output=outf)
            except Exception as ex:
                if "stack switching" in str(ex):   # app Android con WebView vecchio (serve Chrome/WebView 137 o più recente)
                    raise ToolError("Per la firma con certificato aggiorna \"Android System WebView\" e Chrome dal Play Store, poi riapri l'app.")
                raise ToolError(f"Firma non riuscita: {ex}")
    return Result(pdf=out, message=f"Documento firmato digitalmente da {signer_name}.")


@tool("remove_signature")
def remove_signature(ctx: Ctx) -> Result:
    doc = ctx.open()
    removed = 0
    for pg in doc:
        for w in list(pg.widgets() or []):
            if w.field_type == pymupdf.PDF_WIDGET_TYPE_SIGNATURE:
                pg.delete_widget(w)
                removed += 1
    # campi firma senza widget e flag
    cat = doc.pdf_catalog()
    acro = doc.xref_get_key(cat, "AcroForm")
    if acro[0] == "xref":
        axref = int(acro[1].split()[0])
        doc.xref_set_key(axref, "SigFlags", "null")
    elif acro[0] == "dict":
        pass
    doc.xref_set_key(cat, "Perms", "null")
    if not removed:
        raise ToolError("Il documento non contiene firme digitali.")
    return Result(pdf=ctx.save(doc, garbage=4), message=f"Rimosse {removed} firme digitali.")


# ------------------------------------------------------------ sanitizza


@tool("sanitize")
def sanitize(ctx: Ctx) -> Result:
    doc = ctx.open()
    P = ctx.params
    js = boolean(P.get("javascript"), True)
    embedded = boolean(P.get("embedded_files"), True)
    xmp = boolean(P.get("xmp_metadata"), True)
    meta = boolean(P.get("metadata"), False)
    links = boolean(P.get("links"), False)
    font_opt = boolean(P.get("fonts"), False)
    report = []
    doc.scrub(attached_files=embedded, clean_pages=True, embedded_files=embedded,
              hidden_text=False, javascript=js, metadata=meta, redactions=False,
              remove_links=False, reset_fields=False, reset_responses=False,
              thumbnails=True, xml_metadata=xmp)
    if js:
        report.append("JavaScript rimosso")
        # azioni automatiche all'apertura
        cat = doc.pdf_catalog()
        doc.xref_set_key(cat, "OpenAction", "null")
        doc.xref_set_key(cat, "AA", "null")
    if embedded:
        report.append("file incorporati rimossi")
    if xmp:
        doc.del_xml_metadata()
        report.append("metadati XMP rimossi")
    if meta:
        doc.set_metadata({})
        report.append("metadati documento rimossi")
    if links:
        n = 0
        for pg in doc:
            for ln in pg.get_links():
                if ln["kind"] in (pymupdf.LINK_URI, pymupdf.LINK_LAUNCH, pymupdf.LINK_GOTOR):
                    pg.delete_link(ln)
                    n += 1
        report.append(f"{n} collegamenti esterni rimossi")
    if font_opt:
        n = 0
        for xref in range(1, doc.xref_length()):
            try:
                if doc.xref_get_key(xref, "Type")[1] == "/FontDescriptor":
                    for k in ("FontFile", "FontFile2", "FontFile3"):
                        if doc.xref_get_key(xref, k)[0] != "null":
                            doc.xref_set_key(xref, k, "null")
                            n += 1
            except Exception:
                continue
        report.append(f"{n} caratteri incorporati rimossi")
    return Result(pdf=ctx.save(doc, garbage=4, clean=True),
                  message="Sanitizzazione completata: " + ", ".join(report) + ".")


# ------------------------------------------------------------ moduli


def _unlock_field(doc: pymupdf.Document, xref: int) -> bool:
    """Toglie "sola lettura" (bit 1 di /Ff) dal widget e dai campi padre: il valore si eredita, quindi
    il flag può stare su uno qualsiasi. Si scrive /Ff direttamente: con PyMuPDF 2.0 `Widget.update()`
    non salva più `field_flags` e i campi restavano bloccati."""
    changed = False
    seen = set()
    while xref and xref not in seen:
        seen.add(xref)
        kind, val = doc.xref_get_key(xref, "Ff")
        if kind == "int" and int(val) & 1:
            doc.xref_set_key(xref, "Ff", str(int(val) & ~1))
            changed = True
        kind, val = doc.xref_get_key(xref, "Parent")
        xref = int(val.split()[0]) if kind == "xref" else 0
    return changed


@tool("unlock_forms")
def unlock_forms(ctx: Ctx) -> Result:
    doc = ctx.open()
    unlocked = set()
    for pg in doc:
        for w in pg.widgets() or []:
            if _unlock_field(doc, w.xref):
                unlocked.add(w.field_name)
    n = len(unlocked)
    # rimuove anche eventuali XFA che bloccano la compilazione
    cat = doc.pdf_catalog()
    acro = doc.xref_get_key(cat, "AcroForm")
    if acro[0] == "xref":
        axref = int(acro[1].split()[0])
        doc.xref_set_key(axref, "XFA", "null")
        doc.xref_set_key(axref, "NeedAppearances", "true")
    if not doc.is_form_pdf:
        raise ToolError("Il documento non contiene moduli compilabili.")
    return Result(pdf=ctx.save(doc), message=f"Sbloccati {n} campi in sola lettura.")


# ------------------------------------------------------------ appiattisci


def rasterize_doc(doc: pymupdf.Document, dpi: int = 150, pages: list[int] | None = None,
                  grayscale: bool = False, jpeg_quality: int = 85) -> pymupdf.Document:
    """Converte le pagine in immagini (testo non più selezionabile/modificabile)."""
    out = pymupdf.open()
    target = set(pages) if pages is not None else None
    for i, pg in enumerate(doc):
        if target is not None and i not in target:
            out.insert_pdf(doc, from_page=i, to_page=i)
            continue
        pix = pg.get_pixmap(dpi=dpi, colorspace=pymupdf.csGRAY if grayscale else pymupdf.csRGB,
                            annots=True)
        np_ = out.new_page(width=pg.rect.width, height=pg.rect.height)
        np_.insert_image(np_.rect, stream=pix.tobytes("jpeg", jpg_quality=jpeg_quality))
    doc.close()
    return out


@tool("flatten")
def flatten(ctx: Ctx) -> Result:
    doc = ctx.open()
    mode = ctx.params.get("mode", "forms")
    if mode == "forms":
        doc.bake(annots=boolean(ctx.params.get("annots"), True), widgets=True)
        return Result(pdf=ctx.save(doc), message="Moduli e annotazioni appiattiti.")
    dpi = int(num(ctx.params.get("dpi"), 150))
    if not 36 <= dpi <= 600:
        raise ToolError("DPI tra 36 e 600.")
    pages = parse_pages(ctx.params.get("pages"), doc.page_count)
    doc = rasterize_doc(doc, dpi, pages, boolean(ctx.params.get("grayscale")),
                        int(num(ctx.params.get("quality"), 85)))
    return Result(pdf=ctx.save(doc), message=f"Documento appiattito a {dpi} DPI.")


# ------------------------------------------------------------ convalida


def _signatures_report(path) -> list[dict]:
    out = []
    try:
        from pyhanko.pdf_utils.reader import PdfFileReader
        from pyhanko.sign.validation import validate_pdf_signature
        from pyhanko_certvalidator import ValidationContext
    except ImportError:
        return out
    with open(path, "rb") as f:
        try:
            r = PdfFileReader(f, strict=False)
            sigs = list(r.embedded_signatures)
        except Exception as ex:
            return [{"error": f"Lettura firme non riuscita: {ex}"}]
        for s in sigs:
            entry = {"field": s.field_name}
            try:
                st = validate_pdf_signature(s, ValidationContext(allow_fetching=False))
                cert = st.signing_cert
                entry.update({
                    "signer": cert.subject.human_friendly,
                    "issuer": cert.issuer.human_friendly,
                    "intact": st.intact,
                    "valid": st.valid,
                    "trusted": st.trusted,
                    "signing_time": str(st.signer_reported_dt) if st.signer_reported_dt else None,
                    "timestamp": bool(st.timestamp_validity),
                    "coverage": str(st.coverage).split(".")[-1],
                    "modified_after": str(st.modification_level).split(".")[-1] if st.modification_level else None,
                    "summary": st.summary(),
                })
            except Exception as ex:
                entry["error"] = str(ex)
            out.append(entry)
    return out


@tool("validate")
def validate(ctx: Ctx) -> Result:
    it = ctx.item
    issues, info = [], {}
    pymupdf.TOOLS.reset_mupdf_warnings()
    doc = pymupdf.open(it.path)
    if doc.needs_pass:
        doc.close()
        raise ToolError("Documento protetto: inserisci la password per convalidarlo.")
    for pg in doc:
        pg.get_text("text")
        pg.get_pixmap(dpi=20)
    warns = pymupdf.TOOLS.mupdf_warnings()
    if warns:
        issues += [f"MuPDF: {w}" for w in warns.splitlines()[:50]]
    info["version"] = doc.metadata.get("format")
    info["pages"] = doc.page_count
    info["repaired"] = bool(doc.is_repaired)
    if doc.is_repaired:
        issues.append("La struttura del file è danneggiata ed è stata riparata in lettura (xref non valida).")
    xmp = doc.get_xml_metadata() or ""
    pdfa = None
    if "pdfaid:part" in xmp:
        import re
        part = re.search(r"pdfaid:part[>=\"']+\s*(\d)", xmp)
        conf = re.search(r"pdfaid:conformance[>=\"']+\s*([ABUabu])", xmp)
        pdfa = f"PDF/A-{part.group(1) if part else '?'}{(conf.group(1).lower() if conf else '')}"
    info["pdfa_claim"] = pdfa
    fonts_missing = set()
    for pg in doc:
        for f in pg.get_fonts(full=True):
            if f[1] in ("n/a", "") and f[2] not in ("Type3",):
                fonts_missing.add(f[3])
    if fonts_missing:
        issues.append("Caratteri non incorporati: " + ", ".join(sorted(fonts_missing)[:20]))
    has_js = False
    for x in range(1, min(doc.xref_length(), 20000)):
        try:
            if "/JavaScript" in (doc.xref_object(x) or ""):
                has_js = True
                break
        except Exception:
            continue
    info["javascript"] = has_js
    if has_js:
        issues.append("Contiene JavaScript (potenziale rischio sicurezza).")
    doc.close()
    # controllo strutturale qpdf (se disponibile tramite pikepdf)
    try:
        import pikepdf

        with pikepdf.open(it.path) as pdf:
            probs = pdf.check_pdf_syntax() if hasattr(pdf, "check_pdf_syntax") else pdf.check()
            issues += [f"Struttura: {p}" for p in probs[:50]]
    except ImportError:
        pass
    except Exception as ex:
        issues.append(f"Struttura: {ex}")
    sigs = _signatures_report(it.path)
    for s in sigs:
        if s.get("error"):
            issues.append(f"Firma {s.get('field')}: {s['error']}")
        elif not s.get("intact") or not s.get("valid"):
            issues.append(f"Firma {s.get('field')} NON valida: il documento è stato alterato o la firma è corrotta.")
    verapdf = shutil.which("verapdf") or shutil.which("verapdf.bat")
    vera = None
    if pdfa and verapdf and boolean(ctx.params.get("pdfa"), True):
        try:
            r = subprocess.run([verapdf, "--format", "text", str(it.path)], capture_output=True,
                               text=True, timeout=180)
            vera = r.stdout.strip()[-4000:]
        except Exception as ex:
            vera = f"veraPDF non eseguito: {ex}"
    ok = not [i for i in issues if not i.startswith("Caratteri")]
    return Result(data={"ok": ok, "issues": issues, "info": info, "signatures": sigs, "verapdf": vera,
                        "checked_at": dt.datetime.now().isoformat(timespec="seconds")},
                  message="Nessun problema rilevato." if ok else f"Rilevati {len(issues)} problemi.")
