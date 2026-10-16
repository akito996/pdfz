#!/usr/bin/env bash
# PDFz - build per Linux (AppImage x86_64).
#
# Di norma NON si lancia direttamente: ./packaging/copia-e-build.sh linux (su Linux / WSL)
# oppure, da Windows, .\packaging\copia-e-build.ps1 -Piattaforma linux (usa WSL).
#   ./packaging/build-linux.sh            build completa
#   SKIP_TESTS=1 ./packaging/build-linux.sh
#   USE_SYSTEM_PYTHON=1 ...               usa il Python del sistema invece di un ambiente virtuale
#
# Prerequisiti (Ubuntu 24.04, anche in WSL su Windows):
#   sudo apt install -y python3 python3-venv python3-pip rsync curl file
#   Node.js 20 o piu' recente (quello di apt e' spesso vecchio):
#     curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt install -y nodejs
# L'AppImage gira sulle distribuzioni con una glibc uguale o piu' recente di quella su cui e' stata compilata
# (compilata su Ubuntu 24.04: Ubuntu 24.04+, Debian 13+, Fedora 40+, Mint 22+).
# Sul PC dell'utente servono un browser (Chrome/Chromium/Edge consigliati) e, facoltativi:
#   tesseract-ocr tesseract-ocr-ita (OCR), ghostscript (compressione avanzata, PDF/A), libreoffice (conversioni Office).
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$(pwd)"
VERSION="$(sed -n 's/^__version__ = "\(.*\)"/\1/p' backend/hdpdf/__init__.py)"
ARCH="$(uname -m)"
step() { printf '\n\033[36m==> %s\033[0m\n' "$*"; }

step "PDFz $VERSION per Linux ($ARCH)"
die() { printf '\033[31mERRORE: %s\033[0m\n' "$*" >&2; exit 1; }
command -v node >/dev/null || die "manca Node.js 20+ (vedi i prerequisiti in cima allo script)"
[ "$(node -p 'process.versions.node.split(".")[0]')" -ge 20 ] || die "serve Node.js 20 o piu' recente (c'e' la $(node -v))"
python3 -c 'import sys; sys.exit(0 if sys.version_info >= (3, 11) else 1)' || die "serve Python 3.11 o piu' recente (Ubuntu 24.04 ha la 3.12)"
python3 -c 'import venv, ensurepip' 2>/dev/null || [ "${USE_SYSTEM_PYTHON:-0}" = "1" ] || die "manca python3-venv:  sudo apt install -y python3-venv"
if [ "${USE_SYSTEM_PYTHON:-0}" = "1" ]; then
  PY=python3
else
  step "Ambiente Python"
  python3 -m venv .venv-linux
  PY="$ROOT/.venv-linux/bin/python"
  "$PY" -m pip install -q --upgrade pip
  "$PY" -m pip install -q -r backend/requirements-dev.txt
fi

step "Interfaccia (frontend)"
( cd frontend && { if [ -d node_modules ]; then npm install --no-audit --no-fund; else npm ci --no-audit --no-fund; fi; } && npm run build )

step "Lingue OCR (Tesseract)"
mkdir -p vendor/tessdata
for l in ita eng fra deu spa; do   # stesse lingue OCR della versione Windows
  f="vendor/tessdata/$l.traineddata"
  [ -s "$f" ] && continue
  if [ -s "/usr/share/tesseract-ocr/5/tessdata/$l.traineddata" ]; then
    cp "/usr/share/tesseract-ocr/5/tessdata/$l.traineddata" "$f"
  else
    curl -fsSL -o "$f" "https://github.com/tesseract-ocr/tessdata_fast/raw/main/$l.traineddata"
  fi
done

if [ "${SKIP_TESTS:-0}" != "1" ]; then
  step "Test"
  ( cd backend && "$PY" -m pytest -q )
fi

step "Eseguibile (PyInstaller)"
"$PY" -m PyInstaller packaging/hdpdf.spec --noconfirm --clean --distpath dist --workpath build
du -sh dist/PDFz

step "AppDir"
APPDIR="build/PDFz.AppDir"
rm -rf "$APPDIR"
mkdir -p "$APPDIR/usr/lib" "$APPDIR/usr/share/applications" "$APPDIR/usr/share/icons/hicolor/256x256/apps"
cp -a dist/PDFz "$APPDIR/usr/lib/pdfz"
cp packaging/linux/AppRun "$APPDIR/AppRun"
chmod +x "$APPDIR/AppRun"
cp packaging/linux/pdfz.desktop "$APPDIR/pdfz.desktop"
cp packaging/linux/pdfz.desktop "$APPDIR/usr/share/applications/"
cp packaging/assets/pdfz-256.png "$APPDIR/pdfz.png"
cp packaging/assets/pdfz-256.png "$APPDIR/usr/share/icons/hicolor/256x256/apps/pdfz.png"
ln -sf pdfz.png "$APPDIR/.DirIcon"

step "AppImage"
TOOL="${APPIMAGETOOL:-build/appimagetool-$ARCH.AppImage}"
if [ ! -x "$TOOL" ] && ! command -v appimagetool >/dev/null; then
  curl -fsSL -o "$TOOL" "https://github.com/AppImage/appimagetool/releases/download/continuous/appimagetool-$ARCH.AppImage"
  chmod +x "$TOOL"
fi
command -v appimagetool >/dev/null && [ ! -x "$TOOL" ] && TOOL=appimagetool
OUT="dist/PDFz-$VERSION-$ARCH.AppImage"
# --appimage-extract-and-run: funziona anche dove FUSE non è disponibile (container, WSL)
ARCH="$ARCH" "$TOOL" --appimage-extract-and-run "$APPDIR" "$OUT"
chmod +x "$OUT"
step "Fatto"
echo "AppImage: $OUT  ($(du -h "$OUT" | cut -f1))"
echo "Avvio: chmod +x \"$(basename "$OUT")\" && ./$(basename "$OUT")"
