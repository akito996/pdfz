"""App desktop: server locale + finestra nativa (WebView2 su Windows, tramite pywebview).

* Il server ascolta solo su 127.0.0.1 su una porta casuale e richiede un token
  generato a ogni avvio: altri programmi o siti web non possono usarlo.
* Istanza singola: se l'app è già aperta, "Apri con…" passa il file alla finestra
  esistente invece di aprirne un'altra.
"""
from __future__ import annotations

import json
import logging
import os
import re
import shutil
import socket
import sys
import threading
import time
import urllib.request
from pathlib import Path

from . import APP_ID, APP_NAME, config
from .server import API_TOKEN, create_app
from .store import store

log = logging.getLogger("hdpdf.desktop")
INSTANCE_FILE = config.data_dir() / "istanza.json"


# file eseguibili: mai aperti direttamente (possono arrivare da un .p7m o da un allegato)
_BLOCKED_EXT = {".exe", ".com", ".bat", ".cmd", ".msi", ".msp", ".scr", ".pif", ".js", ".jse", ".vbs", ".vbe",
                ".wsf", ".wsh", ".ps1", ".psm1", ".hta", ".lnk", ".jar", ".cpl", ".reg", ".dll", ".application"}


class AvvisoUtente(Exception):
    """Errore da mostrare all'utente. pywebview lo passa alla pagina come eccezione JavaScript e la pagina lo mostra
    con la sua finestra (vedi desktopCall in frontend/src/api.ts): niente finestre di sistema durante l'uso."""


def _free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


from .menu import ACTIONS  # noqa: E402  (azioni del menu del tasto destro)


def _forward_to_running_instance(paths: list[str], action: str = "apri") -> bool:
    try:
        info = json.loads(INSTANCE_FILE.read_text())
        req = urllib.request.Request(
            f"http://127.0.0.1:{info['port']}/api/instance/open",
            data=json.dumps({"paths": [str(Path(p).resolve()) for p in paths], "action": action}).encode(),
            headers={"Content-Type": "application/json", "x-hdpdf-token": info["token"]},
        )
        with urllib.request.urlopen(req, timeout=2) as r:
            return json.loads(r.read()).get("ok", False)
    except Exception:
        return False


class Api:
    """Funzioni esposte alla UI come window.pywebview.api.*

    ATTENZIONE: pywebview espone a JavaScript, ricorsivamente, tutti gli attributi
    pubblici di questo oggetto. La finestra deve restare in un attributo privato
    (con "_"), altrimenti pywebview prova a esporre l'intero oggetto finestra e l'app
    si blocca a ogni clic."""

    def __init__(self):
        self._window = None
        self._unsaved = False
        self._quit_ok = False
        self._apri_finestra = None   # funzione di run(): apre un'altra finestra di PDFz

    def set_unsaved(self, value: bool) -> bool:
        """La UI comunica se ci sono modifiche non salvate o non applicate (usato alla chiusura)."""
        self._unsaved = bool(value)
        return True

    def nuova_finestra(self, query: str) -> bool:
        """Apre un'altra finestra di PDFz (scheda trascinata fuori). query = parametri dell'indirizzo, es. "scheda=<biglietto>";
        i dati della scheda li ritira la nuova finestra dal server con il biglietto."""
        if not self._apri_finestra or not re.fullmatch(r"[A-Za-z0-9_=&-]{1,200}", query or ""):
            return False
        self._apri_finestra(query)
        return True

    def quit(self) -> bool:
        """La UI ha deciso di chiudere la finestra (dopo aver salvato o scelto di non salvare). Chiude solo questa
        finestra: l'app termina quando si chiude l'ultima."""
        self._quit_ok = True
        # in un thread: destroy() dentro una chiamata da JavaScript bloccherebbe la finestra
        threading.Thread(target=self._window.destroy, daemon=True, name="quit").start()
        return True

    # --- finestre di dialogo native
    def open_dialog(self):
        import webview

        types = ("Documenti supportati (*.pdf;*.docx;*.doc;*.xlsx;*.xls;*.pptx;*.ppt;*.odt;*.ods;*.odp;*.rtf;*.txt;*.html;*.png;*.jpg;*.jpeg;*.tif;*.tiff;*.bmp;*.gif;*.webp;*.p7m;*.p7s)",
                 "PDF (*.pdf)", "File firmati (*.p7m;*.p7s)", "Tutti i file (*.*)")
        res = self._window.create_file_dialog(webview.OPEN_DIALOG, allow_multiple=True, file_types=types)
        return list(res or [])

    def save_as(self, item_id: str, suggested: str):
        import webview

        it = store.get(item_id)
        ext = Path(suggested).suffix.lower() or Path(it.name).suffix.lower()
        types = (f"File {ext[1:].upper()} (*{ext})", "Tutti i file (*.*)") if ext else ("Tutti i file (*.*)",)
        res = self._window.create_file_dialog(webview.SAVE_DIALOG, save_filename=suggested, file_types=types)
        if not res:
            return None
        target = res if isinstance(res, str) else res[0]
        if ext and not target.lower().endswith(ext):
            target += ext
        self.save_to(item_id, target)
        return target

    def save_to(self, item_id: str, path: str) -> bool:
        """Copia il file elaborato in path. Se non riesce solleva AvvisoUtente (la pagina mostra il motivo)."""
        it = store.get(item_id)
        tmp = Path(path).with_suffix(Path(path).suffix + ".tmp")
        try:
            shutil.copyfile(it.path, tmp)
            os.replace(tmp, path)  # scrittura atomica: niente file a metà
            return True
        except PermissionError:
            raise AvvisoUtente(f"\"{Path(path).name}\" è aperto in un altro programma oppure la cartella è protetta. "
                               "Chiudilo nell'altro programma e riprova, oppure usa \"Salva con nome\" e scegli un'altra cartella.") from None
        except OSError as ex:
            raise AvvisoUtente(f"Non è stato possibile scrivere \"{Path(path).name}\": {ex.strerror or ex}") from None
        finally:
            tmp.unlink(missing_ok=True)

    def open_external(self, item_id: str) -> bool:
        """Apre un file prodotto (es. .docx) con il programma predefinito di Windows."""
        it = store.get(item_id)
        if Path(it.name).suffix.lower() in _BLOCKED_EXT:
            raise AvvisoUtente(f"Per sicurezza \"{it.name}\" non viene aperto direttamente: salvalo e controllalo con l'antivirus.")
        target = store.root / "aperti" / it.name
        target.parent.mkdir(exist_ok=True)
        shutil.copyfile(it.path, target)
        if sys.platform.startswith("win"):
            os.startfile(target)  # type: ignore[attr-defined]
        else:
            import subprocess

            subprocess.Popen(["xdg-open" if sys.platform != "darwin" else "open", str(target)])
        return True

    def open_path(self, path: str) -> bool:
        """Apre un file già salvato con il programma predefinito."""
        if not Path(path).exists():
            return False
        if sys.platform.startswith("win"):
            os.startfile(path)  # type: ignore[attr-defined]
        else:
            import subprocess

            subprocess.Popen(["open" if sys.platform == "darwin" else "xdg-open", path])
        return True

    def open_url(self, url: str) -> bool:
        """Apre un indirizzo web nel browser (es. per scaricare la nuova versione). Solo http/https."""
        import webbrowser

        if not str(url).startswith(("https://", "http://")):
            return False
        return webbrowser.open(url)

    def reveal(self, path: str) -> bool:
        """Apre Esplora file con il file selezionato ("Mostra nella cartella")."""
        import subprocess

        p = Path(path)
        if sys.platform.startswith("win"):
            subprocess.Popen(["explorer", "/select,", str(p)])
        elif sys.platform == "darwin":
            subprocess.Popen(["open", "-R", str(p)])   # Finder con il file selezionato
        else:
            subprocess.Popen(["xdg-open", str(p.parent)])
        return True


def _setup_logging() -> None:
    """Nell'eseguibile senza console sys.stdout/sys.stderr sono None: librerie come uvicorn
    che scrivono sulla console andrebbero in errore. Si reindirizza tutto sul file di log."""
    log_path = config.data_dir() / "hdpdf.log"
    try:
        if log_path.exists() and log_path.stat().st_size > 5 * 1024 * 1024:
            log_path.replace(log_path.with_suffix(".log.1"))
    except OSError:
        pass
    stream = open(log_path, "a", encoding="utf-8", buffering=1)
    if sys.stdout is None:
        sys.stdout = stream
    if sys.stderr is None:
        sys.stderr = stream
    logging.basicConfig(stream=stream, level=logging.INFO, force=True,
                        format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    try:
        import faulthandler

        faulthandler.enable(stream)
    except Exception:
        pass
    sys.excepthook = lambda t, v, tb: log.error("Errore non gestito", exc_info=(t, v, tb))
    threading.excepthook = lambda a: log.error("Errore nel thread %s", a.thread, exc_info=(a.exc_type, a.exc_value, a.exc_traceback))


def _ask_quit() -> bool:
    """Riserva quando la pagina non risponde alla chiusura (non caricata o bloccata): conferma di uscita con la finestra
    di sistema, che non usa il motore web e quindi non può bloccarsi. Di norma la domanda la fa la pagina (hdpdfRequestClose)."""
    msg = "Ci sono documenti con modifiche non salvate.\n\nUscire comunque?"
    if sys.platform.startswith("win"):
        import ctypes

        MB_YESNO, MB_ICONWARNING, MB_TOPMOST, IDYES = 0x4, 0x30, 0x40000, 6
        return ctypes.windll.user32.MessageBoxW(None, msg, APP_NAME, MB_YESNO | MB_ICONWARNING | MB_TOPMOST) == IDYES
    import subprocess

    try:
        if sys.platform == "darwin":
            script = (f'display dialog "{msg}" with title "{APP_NAME}" buttons {{"Annulla", "Esci"}} '
                      f'default button "Annulla" cancel button "Annulla" with icon caution')
            return subprocess.run(["osascript", "-e", script], capture_output=True).returncode == 0
        for cmd in (["zenity", "--question", f"--title={APP_NAME}", f"--text={msg}", "--ok-label=Esci", "--cancel-label=Annulla"],
                    ["kdialog", "--title", APP_NAME, "--warningyesno", msg]):
            if shutil.which(cmd[0]):
                return subprocess.run(cmd).returncode == 0
    except Exception:  # noqa: BLE001 - senza finestra di conferma si esce
        log.warning("Conferma di uscita non disponibile", exc_info=True)
    return True


# ---------------------------------------------------------------- versione nel browser (Linux)
_CHROMIUM = ("google-chrome", "google-chrome-stable", "chromium", "chromium-browser", "microsoft-edge",
             "microsoft-edge-stable", "brave-browser", "vivaldi")


def ui_mode() -> str:
    """"webview" = finestra dell'app (Windows, macOS); "browser" = finestra del browser in modalità app.
    Su Linux la finestra integrata richiede librerie di sistema (GTK/WebKit o Qt) che non stanno in un AppImage:
    si usa Chrome/Chromium/Edge in modalità app (senza barre), oppure il browser predefinito."""
    forced = os.environ.get("HDPDF_UI", "").lower()
    if forced in ("browser", "webview"):
        return forced
    if not sys.platform.startswith("linux"):
        return "webview"
    try:
        import webview  # noqa: F401
        try:
            import gi  # noqa: F401
            gi.require_version("WebKit2", "4.1")
            return "webview"
        except Exception:  # noqa: BLE001
            import qtpy  # noqa: F401
            return "webview"
    except Exception:  # noqa: BLE001
        return "browser"


def find_app_browser() -> str | None:
    env = os.environ.get("HDPDF_BROWSER")
    if env and shutil.which(env):
        return shutil.which(env)
    for name in _CHROMIUM:
        f = shutil.which(name)
        if f:
            return f
    return None


def run_browser(app, port: int, files: list[str], action: str = "apri") -> None:
    """Apre l'interfaccia in una finestra del browser; il motore si spegne quando la finestra si chiude."""
    import subprocess
    import webbrowser

    url = f"http://127.0.0.1:{port}/?t={API_TOKEN}"
    def on_open(paths: list[str], act: str = "apri") -> None:
        if act == "apri":
            app.state.pending_open.extend(paths)
        else:
            app.state.pending_actions.append({"action": act, "paths": paths})

    app.state.on_open_paths = on_open
    if files:
        on_open([str(Path(f).resolve()) for f in files], action)
    exe = find_app_browser()
    if exe:
        profile = config.data_dir() / "finestra"
        args = [exe, f"--app={url}", f"--user-data-dir={profile}", "--no-first-run", "--no-default-browser-check",
                "--window-size=1440,900", f"--class={APP_ID}", "--disable-features=Translate"]
        if hasattr(os, "geteuid") and os.geteuid() == 0:
            args.append("--no-sandbox")   # Chrome non parte come root senza questa opzione
        args += os.environ.get("HDPDF_BROWSER_FLAGS", "").split()
        log.info("Finestra nel browser: %s", exe)
        t0 = time.time()
        # Chromium senza chiavi Google mostra un avviso inutile: queste variabili lo nascondono
        env = {**os.environ, "GOOGLE_API_KEY": "no", "GOOGLE_DEFAULT_CLIENT_ID": "no", "GOOGLE_DEFAULT_CLIENT_SECRET": "no"}
        proc = subprocess.Popen(args, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, env=env)
        proc.wait()
        # se il browser ha passato la finestra a un processo già aperto (esce subito), si segue il "battito" della pagina
        if time.time() - t0 > 10:
            return
    else:
        log.info("Nessun Chrome/Chromium/Edge: si usa il browser predefinito")
        webbrowser.open(url)
    started = time.time()
    while True:
        time.sleep(3)
        beat = app.state.last_beat
        if (beat and time.time() - beat > 45) or (not beat and time.time() - started > 120):
            log.info("Finestra chiusa: arresto del motore")
            return


def run(files: list[str] | None = None, action: str | None = None) -> None:
    files = [f for f in (files or []) if Path(f).exists()]
    # menu del tasto destro: i file di tutti gli avvii sono già stati raccolti in __main__ (menu.collect_selection)
    action = action if action in ACTIONS else "apri"
    if files and _forward_to_running_instance(files, action):
        return

    _setup_logging()
    import uvicorn

    mode = ui_mode()
    log.info("Avvio %s (%s, interfaccia: %s)", APP_NAME, sys.platform, mode)
    store.cleanup()
    try:
        from .cleanup import rimuovi_modelli_traduzione
        if rimuovi_modelli_traduzione():
            log.info("Modelli di traduzione delle versioni precedenti cancellati (funzione tolta)")
    except Exception:  # noqa: BLE001 - spazio da liberare, non deve fermare l'avvio
        log.warning("Pulizia dei modelli di traduzione non riuscita", exc_info=True)

    port = _free_port()
    app = create_app(require_token=True)
    # log_config=None: niente configurazione di logging di uvicorn (che scrive sulla console)
    server = uvicorn.Server(uvicorn.Config(app, host="127.0.0.1", port=port, log_level="warning",
                                           log_config=None, access_log=False))
    threading.Thread(target=server.run, daemon=True, name="server").start()
    for _ in range(200):
        if server.started:
            break
        time.sleep(0.05)
    if not server.started:
        log.error("Il server locale non si è avviato sulla porta %s", port)
    INSTANCE_FILE.write_text(json.dumps({"port": port, "token": API_TOKEN, "pid": os.getpid()}))

    def _prefetch_trust_list():
        # elenco CA AgID per i file .p7m: aggiornato in background (al massimo una volta a settimana)
        try:
            from . import p7m
            p7m.trust_list()
        except Exception:  # noqa: BLE001
            log.warning("Aggiornamento elenco CA AgID non riuscito", exc_info=True)

    threading.Thread(target=_prefetch_trust_list, daemon=True, name="tsl").start()

    if mode == "browser":
        try:
            run_browser(app, port, files, action)
        finally:
            server.should_exit = True
            INSTANCE_FILE.unlink(missing_ok=True)
            store.close()
            log.info("Chiusura")
        return

    import webview

    base_url = f"http://127.0.0.1:{port}/?t={API_TOKEN}"
    finestre: list = []   # finestre aperte, dalla più vecchia: la prima ancora aperta riceve i file da "Apri con"

    def apri_finestra(query: str = ""):
        """Una finestra di PDFz: la principale all'avvio, poi una per ogni scheda trascinata fuori.
        Ognuna ha la sua Api (modifiche non salvate e chiusura sono per finestra)."""
        api = Api()
        api._apri_finestra = apri_finestra
        w = webview.create_window(
            APP_NAME, base_url + (f"&{query}" if query else ""), js_api=api,
            width=1440, height=900, min_size=(1024, 640), text_select=True,
        )
        api._window = w
        finestre.append(w)

        def ask_ui_to_close():
            # la UI chiede "Salvare / applicare le modifiche?" con la sua finestra e poi chiama api.quit();
            # se la pagina non risponde (non caricata, bloccata) si usa la conferma di sistema
            try:
                handled = w.evaluate_js("window.hdpdfRequestClose ? window.hdpdfRequestClose() : false")
            except Exception:  # noqa: BLE001
                log.warning("Richiesta di chiusura alla pagina non riuscita", exc_info=True)
                handled = False
            if not handled and _ask_quit():
                api.quit()

        def on_closing():
            # niente evaluate_js qui: durante la chiusura bloccherebbe la finestra (deadlock).
            # Con modifiche non salvate o non applicate la chiusura si ferma e la domanda la fa la pagina, da un altro thread.
            if api._quit_ok or not api._unsaved:
                return True
            threading.Thread(target=ask_ui_to_close, daemon=True, name="chiusura").start()
            return False

        def on_closed():
            if w in finestre:
                finestre.remove(w)

        w.events.closing += on_closing
        w.events.closed += on_closed
        return w

    window = apri_finestra()

    def push_paths(paths: list[str], act: str = "apri") -> None:
        # alla finestra principale se è ancora aperta, altrimenti alla più vecchia rimasta
        target = finestre[0] if finestre else None
        if target is None:
            return
        try:
            req = json.dumps({"action": act, "paths": paths})
            target.evaluate_js(f"window.hdpdfAction ? window.hdpdfAction({req}) : "
                               f"(window.__hdpdfPendingActions = (window.__hdpdfPendingActions || []).concat([{req}]))")
            target.restore()
            target.show()
        except Exception:
            log.exception("Apertura file dalla seconda istanza non riuscita")

    app.state.on_open_paths = push_paths

    def on_loaded():
        if files:
            # in un thread separato: l'evento "loaded" non deve attendere il JavaScript
            threading.Thread(target=push_paths, args=([str(Path(f).resolve()) for f in files], action), daemon=True).start()

    window.events.loaded += on_loaded
    try:
        gui = "edgechromium" if sys.platform.startswith("win") else None
        webview.start(gui=gui, private_mode=False, storage_path=str(config.data_dir() / "webview"))
    except Exception:
        log.exception("Errore della finestra")
        raise
    finally:
        server.should_exit = True
        INSTANCE_FILE.unlink(missing_ok=True)
        store.close()
        log.info("Chiusura")
