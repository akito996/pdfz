"""Percorsi di lavoro e individuazione dei programmi esterni (Tesseract, Ghostscript,
LibreOffice, Microsoft Office).

Su Windows l'installer copia Tesseract e Ghostscript in <app>/vendor/...; in sviluppo
vengono cercati nel PATH. LibreOffice e Microsoft Office sono opzionali e usati solo
per le conversioni da/verso formati Office.
"""
from __future__ import annotations

import os
import shutil
import sys
import tempfile
from functools import lru_cache
from pathlib import Path

from . import APP_ID

IS_WINDOWS = sys.platform.startswith("win")
IS_MAC = sys.platform == "darwin"
FROZEN = getattr(sys, "frozen", False)

# su macOS un'app aperta dal Finder non vede il PATH del Terminale: si aggiungono le cartelle di Homebrew
# (Ghostscript, LibreOffice da riga di comando…)
if IS_MAC:
    _extra = [p for p in ("/opt/homebrew/bin", "/usr/local/bin", "/opt/local/bin") if Path(p).is_dir()]
    os.environ["PATH"] = os.pathsep.join([os.environ.get("PATH", "")] + _extra)


def app_dir() -> Path:
    """Cartella dell'applicazione (quella dell'eseguibile se impacchettata)."""
    if FROZEN:
        return Path(getattr(sys, "_MEIPASS", Path(sys.executable).parent))
    return Path(__file__).resolve().parent.parent


def data_dir() -> Path:
    if os.environ.get("HDPDF_DATADIR"):  # usato dai test, per non toccare i dati reali
        d = Path(os.environ["HDPDF_DATADIR"])
        d.mkdir(parents=True, exist_ok=True)
        return d
    if IS_WINDOWS:
        base = Path(os.environ.get("LOCALAPPDATA", Path.home() / "AppData" / "Local"))
    elif IS_MAC:
        base = Path.home() / "Library" / "Application Support"
    else:
        base = Path(os.environ.get("XDG_DATA_HOME", Path.home() / ".local" / "share"))
    d = base / APP_ID
    d.mkdir(parents=True, exist_ok=True)
    return d


def work_dir() -> Path:
    override = os.environ.get("HDPDF_WORKDIR")
    d = Path(override) if override else Path(tempfile.gettempdir()) / f"{APP_ID}-work"
    d.mkdir(parents=True, exist_ok=True)
    return d


def static_dir() -> Path:
    """Cartella con la UI compilata (frontend/dist)."""
    candidates = [
        app_dir() / "web",
        app_dir().parent / "frontend" / "dist",
        Path(__file__).resolve().parent.parent.parent / "frontend" / "dist",
    ]
    for c in candidates:
        if (c / "index.html").exists():
            return c
    return candidates[0]


def fonts_dirs() -> list[Path]:
    dirs = [app_dir() / "fonts"]
    if IS_WINDOWS:
        windir = Path(os.environ.get("WINDIR", r"C:\Windows"))
        dirs.append(windir / "Fonts")
        local = os.environ.get("LOCALAPPDATA")
        if local:
            dirs.append(Path(local) / "Microsoft" / "Windows" / "Fonts")
    elif sys.platform == "darwin":
        dirs += [Path("/Library/Fonts"), Path("/System/Library/Fonts"), Path.home() / "Library/Fonts"]
    else:
        dirs += [Path("/usr/share/fonts"), Path("/usr/local/share/fonts"), Path.home() / ".fonts"]
    return [d for d in dirs if d.exists()]


def _vendor(*parts: str) -> Path:
    return app_dir() / "vendor" / Path(*parts)


@lru_cache
def tesseract_cmd() -> str | None:
    env = os.environ.get("HDPDF_TESSERACT")
    if env and Path(env).exists():
        return env
    v = _vendor("tesseract", "tesseract.exe" if IS_WINDOWS else "tesseract")
    if v.exists():
        return str(v)
    found = shutil.which("tesseract")
    if found:
        return found
    if IS_WINDOWS:
        for p in (r"C:\Program Files\Tesseract-OCR\tesseract.exe",
                  r"C:\Program Files (x86)\Tesseract-OCR\tesseract.exe"):
            if Path(p).exists():
                return p
    return None


@lru_cache
def tessdata_dir() -> str | None:
    env = os.environ.get("TESSDATA_PREFIX")
    if env and Path(env).exists():
        return env
    cmd = tesseract_cmd()
    candidates = [_vendor("tessdata")]
    if cmd:
        candidates.append(Path(cmd).parent / "tessdata")
    candidates += [Path("/usr/share/tesseract-ocr/5/tessdata"), Path("/usr/share/tesseract-ocr/4.00/tessdata"),
                   Path("/usr/share/tessdata"), Path("/usr/local/share/tessdata"), Path("/opt/homebrew/share/tessdata")]
    for c in candidates:
        if c.exists() and any(c.glob("*.traineddata")):
            return str(c)
    return None


def ocr_languages() -> list[str]:
    d = tessdata_dir()
    if not d:
        return []
    return sorted(p.stem for p in Path(d).glob("*.traineddata") if p.stem != "osd")


@lru_cache
def ghostscript_cmd() -> str | None:
    env = os.environ.get("HDPDF_GHOSTSCRIPT")
    if env and Path(env).exists():
        return env
    v = _vendor("ghostscript", "bin", "gswin64c.exe" if IS_WINDOWS else "gs")
    if v.exists():
        return str(v)
    for name in (["gswin64c", "gswin32c"] if IS_WINDOWS else ["gs"]):
        f = shutil.which(name)
        if f:
            return f
    if IS_WINDOWS:
        for root in (Path(r"C:\Program Files\gs"), Path(r"C:\Program Files (x86)\gs")):
            if root.exists():
                for exe in sorted(root.glob("*/bin/gswin*c.exe"), reverse=True):
                    return str(exe)
    return None


@lru_cache
def soffice_cmd() -> str | None:
    env = os.environ.get("HDPDF_SOFFICE")
    if env and Path(env).exists():
        return env
    for name in ("soffice", "libreoffice"):
        f = shutil.which(name)
        if f:
            return f
    if IS_MAC:
        for p in ("/Applications/LibreOffice.app/Contents/MacOS/soffice",
                  str(Path.home() / "Applications/LibreOffice.app/Contents/MacOS/soffice")):
            if Path(p).exists():
                return p
    if IS_WINDOWS:
        for p in (r"C:\Program Files\LibreOffice\program\soffice.exe",
                  r"C:\Program Files (x86)\LibreOffice\program\soffice.exe"):
            if Path(p).exists():
                return p
    return None


@lru_cache
def ms_office_available() -> bool:
    """True se Microsoft Office è installato e pilotabile via COM (solo Windows)."""
    if not IS_WINDOWS:
        return False
    try:
        import winreg  # type: ignore

        for prog in ("Word.Application", "Excel.Application", "PowerPoint.Application"):
            try:
                winreg.CloseKey(winreg.OpenKey(winreg.HKEY_CLASSES_ROOT, prog))
                return True
            except OSError:
                continue
    except Exception:
        pass
    return False


def _has_module(name: str) -> bool:
    import importlib.util
    try:
        return importlib.util.find_spec(name) is not None
    except Exception:  # noqa: BLE001
        return False


def capabilities() -> dict:
    return {
        # l'OCR usa il Tesseract integrato in MuPDF: bastano i file lingua
        "ocr": bool(tessdata_dir()),
        "ocr_languages": ocr_languages(),
        "ghostscript": bool(ghostscript_cmd()),
        "libreoffice": bool(soffice_cmd()),
        "ms_office": ms_office_available(),
        "platform": os.environ.get("HDPDF_PLATFORM") or sys.platform,
        # traduzione offline: serve il motore CTranslate2 (non disponibile nell'app Android)
        "translate": _has_module("ctranslate2"),
    }
