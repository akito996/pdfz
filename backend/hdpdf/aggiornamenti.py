"""Avviso "è disponibile una nuova versione".

A ogni release la pipeline di GitHub (.github/workflows/release.yml) pubblica nella GitHub Release della versione,
accanto agli installer, un file per piattaforma con la versione e le novità:
  versione-windows.json  (PDFz-X.Y.Z-x64.msi)
  versione-macos.json    (PDFz-X.Y.Z-macOS-arm64.dmg)
  versione-linux.json    (PDFz-X.Y.Z-x86_64.AppImage)
  versione-android.json  (PDFz-X.Y.Z-android.apk)
L'app li legge da UPDATE_BASE_URL e, se trova una versione più recente, lo segnala nella campanella delle notifiche;
il link per scaricare è UPDATE_BASE_URL + nome dell'installer (campo "file" del JSON).
Con le GitHub Releases UPDATE_BASE_URL è https://github.com/<proprietario>/<repository>/releases/latest/download/:
GitHub lo manda all'ultima release pubblicata (non "pre-release"), quindi JSON e installer sono sempre della stessa
versione. Funziona solo se il repository (o almeno le sue release) è pubblico: le release private chiedono l'accesso.
Finché UPDATE_BASE_URL è vuoto il controllo è spento (nessuna connessione). La pipeline lo scrive qui prima della build
(packaging/imposta-url-aggiornamenti.sh: variabile UPDATE_BASE_URL del repository GitHub, altrimenti le sue release).
Per le prove la variabile d'ambiente HDPDF_UPDATE_URL ha la precedenza.
"""
from __future__ import annotations

import json
import os
import time
import urllib.request

from . import APP_ID
from .versione import newer

# Cartella pubblica degli aggiornamenti, con la "/" finale. Esempio con le GitHub Releases:
#   UPDATE_BASE_URL = "https://github.com/akito996/pdfz/releases/latest/download/"
UPDATE_BASE_URL = ""

# iPhone escluso: gli aggiornamenti passano da TestFlight / App Store
PLATFORMS = ("windows", "macos", "linux", "android")
_cache: dict[str, tuple[float, dict]] = {}


def base_url() -> str:
    u = (os.environ.get("HDPDF_UPDATE_URL") or UPDATE_BASE_URL or "").strip()
    if u and not u.endswith("/"):
        u += "/"
    return u if u.startswith(("https://", "http://")) else ""


def check(platform: str, current: str, max_age: float = 6 * 3600) -> dict:
    base = base_url()
    if not base:
        return {"configured": False, "available": False}
    # ogni piattaforma legge solo il suo file: non si propone mai l'installer di un'altra
    if platform not in PLATFORMS:
        return {"configured": False, "available": False}
    hit = _cache.get(platform)
    if hit and time.time() - hit[0] < max_age:
        info = hit[1]
    else:
        url = f"{base}versione-{platform}.json"
        try:
            req = urllib.request.Request(url, headers={"User-Agent": APP_ID, "Cache-Control": "no-cache"})
            with urllib.request.urlopen(req, timeout=6) as r:
                info = json.loads(r.read().decode("utf-8-sig"))
        except Exception as ex:  # noqa: BLE001 - senza rete si riprova più tardi
            return {"configured": True, "available": False, "error": str(ex)[:200]}
        _cache[platform] = (time.time(), info)
    latest = str(info.get("version") or "")
    file = str(info.get("file") or "")
    # link diretto all'installer di questa piattaforma ("url" nei file nuovi; nei vecchi: indirizzo + nome del file)
    download = str(info.get("url") or (base + file if file else ""))
    size = info.get("size")
    return {"configured": True, "available": newer(latest, current), "latest": latest, "date": info.get("date"),
            "title": info.get("titolo") or "", "novita": info.get("novita") or [],
            "download": download if download.startswith(("https://", "http://")) else "",
            "file": file or download.rsplit("/", 1)[-1], "size": size if isinstance(size, int) and size > 0 else None,
            "page": str(info.get("pagina") or "")}
