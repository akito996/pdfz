# -*- mode: python ; coding: utf-8 -*-
# Build: pyinstaller packaging/hdpdf.spec --noconfirm   (dalla radice del progetto)
from pathlib import Path
from PyInstaller.utils.hooks import collect_data_files, collect_submodules

import sys

ROOT = Path(SPECPATH).parent
IS_WIN = sys.platform.startswith("win")
IS_MAC = sys.platform == "darwin"

# nomi e versione: unica fonte backend/hdpdf/__init__.py (APP_ID = "PDFz", APP_BUNDLE_ID = "com.agjin.pdfz", ...)
import re

_INIT = (ROOT / "backend" / "hdpdf" / "__init__.py").read_text(encoding="utf-8")


def _meta(name):
    return re.search(rf'^{name} = "([^"]*)"', _INIT, re.M).group(1)


APP_NAME, APP_ID, APP_AUTHOR, APP_BUNDLE_ID = (_meta(n) for n in ("APP_NAME", "APP_ID", "APP_AUTHOR", "APP_BUNDLE_ID"))
datas = [
    (str(ROOT / "frontend" / "dist"), "web"),
    (str(ROOT / "packaging" / "assets" / "icon.ico"), "."),
    (str(ROOT / "LICENSE"), "."),
    (str(ROOT / "THIRD-PARTY-NOTICES.md"), "."),
]
import os
for sub in ("tessdata", "ghostscript"):
    p = ROOT / "vendor" / sub
    if not p.exists():
        continue
    if sub == "ghostscript" and not IS_WIN:
        continue   # macOS e Linux: si usa il Ghostscript del sistema (Homebrew / apt), se c'è
    if sub == "ghostscript" and os.environ.get("HDPDF_GS_FULL") != "1" and (p / "bin").exists():
        # Ghostscript per Windows ha i suoi file di avvio (Resource, lib) gia' dentro gsdll64.dll:
        # basta la cartella bin (5 file invece di ~520). build-windows.ps1 lo verifica prima della build.
        datas.append((str(p / "bin"), "vendor/ghostscript/bin"))
    else:
        datas.append((str(p), f"vendor/{sub}"))
fonts_dir = ROOT / "fonts"
if fonts_dir.exists():
    datas.append((str(fonts_dir), "fonts"))

datas += collect_data_files("pyhanko")
datas += collect_data_files("pyhanko_certvalidator")
datas += collect_data_files("pdf2docx")
datas += collect_data_files("pptx")
if IS_WIN or IS_MAC:   # su Linux la finestra è il browser in modalità app (vedi desktop.ui_mode)
    datas += collect_data_files("webview")
binaries = []

hidden = (
    collect_submodules("hdpdf")
    + collect_submodules("pyhanko")
    + collect_submodules("uvicorn")
    + collect_submodules("pyhanko_certvalidator")  # fetcher OCSP/CRL caricati dinamicamente (verifica .p7m)
    + ["requests"]
    + (["win32com", "win32com.client", "pythoncom", "pywintypes", "clr", "webview.platforms.winforms",
        "webview.platforms.edgechromium"] if IS_WIN else [])
    + (["webview.platforms.cocoa"] if IS_MAC else [])
)

a = Analysis(
    [str(ROOT / "packaging" / "launcher.py")],
    pathex=[str(ROOT / "backend")],
    datas=datas,
    binaries=binaries,
    hiddenimports=hidden,
    excludes=["tkinter", "matplotlib", "IPython", "pytest", "scipy", "pandas", "PyQt5", "PyQt6",
              "PySide2", "PySide6", "notebook", "jupyter",
              # la traduzione e' stata tolta nella 1.1.0: niente motori di traduzione anche se installati sul PC di build
              "torch", "transformers", "stanza", "argostranslate", "tensorflow", "ctranslate2", "sentencepiece",
              # pdfplumber usa pypdfium2 solo per le anteprime (to_image), che l'app non usa
              "pypdfium2", "pypdfium2_raw",
              "huggingface_hub", "hf_xet", "safetensors", "tokenizers",
              # strumenti di sviluppo inclusi per sbaglio da alcune librerie
              "pip", "IPython", "pydoc_data", "lib2to3", "idlelib", "numpy.f2py", "numpy.distutils"],
    # python-pptx legge i modelli XML con percorsi relativi ai propri sorgenti
    module_collection_mode={"pptx": "pyz+py", "docx": "pyz+py"},
    noarchive=False,
)
# ---- file inutili a runtime (nessuna funzione persa) ----
_DROP = (
    "opencv_videoio_ffmpeg",   # OpenCV: lettura/scrittura video (~29 MB), pdf2docx usa solo le immagini
    "mupdf-devel",             # PyMuPDF: intestazioni e .lib per compilare estensioni C (~6 MB)
    "pypdfium2",               # vedi excludes
    "cv2/data/",               # OpenCV: modelli per riconoscere i volti (haarcascade, ~10 MB), non usati
    "opencv_python.libs",      # OpenCV "con finestre" installato insieme a quello headless: librerie Qt doppie
    "tessdata/osd.traineddata",  # OCR: rilevamento orientamento/scrittura (~10 MB), l'app non lo usa
    "/tests/", "/test/",       # test delle librerie
)
_DROP_EXT = (".pyi", ".h", ".lib", ".pdb")


# fusi orari (tzdata, ~600 file): servono solo per l'ora della firma digitale (pyhanko -> tzlocal).
# Si tengono l'Europa, UTC/Etc e i file di indice; per gli altri fusi l'app usa l'ora locale del PC
# (vedi hdpdf/__init__.py), quindi la firma funziona ovunque.
_TZ_KEEP_DIRS = ("europe/", "etc/")
_TZ_KEEP_FILES = ("utc", "gmt", "universal", "zulu", "cet", "eet", "met", "wet")


def _keep_tz(dest):
    rest = dest.split("tzdata/zoneinfo/", 1)[1]
    if "/" in rest:
        return rest.startswith(_TZ_KEEP_DIRS)
    return "." in rest or rest in _TZ_KEEP_FILES   # tzdata.zi, zone.tab, iso3166.tab… restano


def _keep(entry):
    dest = entry[0].replace("\\", "/").lower()
    if "tzdata/zoneinfo/" in dest and not _keep_tz(dest):
        return False
    return not any(k in dest for k in _DROP) and not dest.endswith(_DROP_EXT)


a.binaries = [b for b in a.binaries if _keep(b)]
a.datas = [d for d in a.datas if _keep(d)]

pyz = PYZ(a.pure)
exe = EXE(
    pyz, a.scripts, [],
    exclude_binaries=True,
    name=APP_ID,   # PDFz.exe (Windows), PDFz (Linux): gli script di build e l'MSI usano questo nome
    icon=str(ROOT / "packaging" / "assets" / "icon.ico"),
    console=False,
    version=str(ROOT / "packaging" / "version_info.txt") if IS_WIN else None,
    argv_emulation=IS_MAC,   # macOS: i file aperti dal Finder ("Apri con") arrivano come argomenti
)
coll = COLLECT(exe, a.binaries, a.datas, strip=False, upx=False, name=APP_ID)

if IS_MAC:
    _version = _meta("__version__")
    _short = _version   # MAJOR.MINOR.PATCH: già nel formato a punti che vuole macOS
    _doc = lambda name, exts, utis: {"CFBundleTypeName": name, "CFBundleTypeRole": "Editor", "LSHandlerRank": "Alternate",
                                     "CFBundleTypeExtensions": exts, "LSItemContentTypes": utis}
    app = BUNDLE(
        coll,
        name=f"{APP_NAME}.app",                 # PDFz.app (build-macos.sh usa questo nome)
        icon=str(ROOT / "packaging" / "assets" / "icon.icns"),
        bundle_identifier=APP_BUNDLE_ID,        # com.agjin.pdfz
        version=_short,
        info_plist={
            "CFBundleDisplayName": APP_NAME,
            "CFBundleShortVersionString": _short,
            "NSHighResolutionCapable": True,
            "LSMinimumSystemVersion": "11.0",
            "NSHumanReadableCopyright": f"© 2026 {APP_AUTHOR}",
            # compare in "Apri con" per PDF e file firmati, senza cambiare l'app predefinita
            "CFBundleDocumentTypes": [
                _doc("Documento PDF", ["pdf"], ["com.adobe.pdf"]),
                _doc("File firmato digitalmente", ["p7m", "p7s"], ["public.data"]),
            ],
        },
    )
