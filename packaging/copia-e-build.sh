#!/usr/bin/env bash
# PDFz - "copia + build" per macOS, iPhone (iOS) e Linux: stesso flusso di copia-e-build.ps1 su Windows.
#
# Il progetto si MODIFICA nella cartella del repository (la radice sopra packaging/); si COMPILA in una copia locale
# (le cartelle sincronizzate come OneDrive e i percorsi con "&" bloccano la build):
#   macOS  -> ~/Build/PDFz-macOS     (sul Mac)       risultati in ~/Build/PDFz-macOS/dist
#   ios    -> ~/Build/PDFz-iOS       (sul Mac)       risultati in ~/Build/PDFz-iOS/dist
#   linux  -> ~/Build/PDFz-Linux     (Linux o WSL)   risultati in ~/Build/PDFz-Linux/dist
#
# Uso (dal Terminale, nella cartella del progetto):
#   ./packaging/copia-e-build.sh macos
#   ./packaging/copia-e-build.sh ios                     (OPEN=1 / IOS_TEAM_ID=... come in build-ios.sh)
#   ./packaging/copia-e-build.sh linux
#   SKIP_TESTS=1 ./packaging/copia-e-build.sh macos      (salta i test)
#   SOLO_COPIA=1 ./packaging/copia-e-build.sh linux      (aggiorna la copia senza compilare)
# Variabili facoltative:
#   HDPDF_BASE        cartella delle copie (predefinita ~/Build)
#   HDPDF_SORGENTE    cartella del progetto (predefinita: la radice del repository, sopra la cartella di questo script)
#   HDPDF_RISULTATI   cartella in cui copiare anche i risultati (usata da Windows/WSL: C:\Build\PDFz-Linux\dist)
#
# La copia e' uno specchio (rsync --delete) del codice. Le cartelle create o scaricate dalla build
# (.venv*, node_modules, dist, build, www, mobile/ios, cache, ...) non si copiano e nella copia non si cancellano.
set -euo pipefail
PIATTAFORMA="${1:-}"
case "$PIATTAFORMA" in
  macos) NOME="macOS" ;;
  ios)   NOME="iOS" ;;
  linux) NOME="Linux" ;;
  *) echo "Uso: $0 macos|ios|linux" >&2; exit 2 ;;
esac
SORGENTE="${HDPDF_SORGENTE:-$(cd "$(dirname "$0")/.." && pwd)}"
BASE="${HDPDF_BASE:-$HOME/Build}"
DEST="$BASE/PDFz-$NOME"
step() { printf '\n\033[36m==> %s\033[0m\n' "$*"; }

command -v rsync >/dev/null || { echo "Serve rsync (Linux: sudo apt install rsync)"; exit 1; }
[ -f "$SORGENTE/backend/hdpdf/__init__.py" ] || { echo "Progetto non trovato in: $SORGENTE"; exit 1; }

step "Copia del progetto in $DEST"
mkdir -p "$DEST"
rsync -a --delete \
  --exclude='.venv' --exclude='.venv-*' --exclude='node_modules' --exclude='dist' --exclude='build' \
  --exclude='www' --exclude='.gradle' --exclude='.kotlin' --exclude='__pycache__' --exclude='.pytest_cache' \
  --exclude='_work' --exclude='_data' --exclude='Claude outputs' --exclude='vendor' --exclude='cache' \
  --exclude='/mobile/ios/' --exclude='*.pyc' --exclude='tsconfig.tsbuildinfo' --exclude='.DS_Store' \
  "$SORGENTE/" "$DEST/"
# dati OCR gia' scaricati: si aggiungono senza mai cancellare (Ghostscript per Windows non serve)
if [ -d "$SORGENTE/vendor/tessdata" ]; then
  mkdir -p "$DEST/vendor/tessdata"
  rsync -a "$SORGENTE/vendor/tessdata/" "$DEST/vendor/tessdata/"
fi
# motore Pyodide gia' scaricato per Android: lo riusa anche l'iPhone
if [ "$PIATTAFORMA" = "ios" ] && [ -d "$SORGENTE/mobile/cache" ]; then
  mkdir -p "$DEST/mobile/cache"
  rsync -a "$SORGENTE/mobile/cache/" "$DEST/mobile/cache/"
fi
# script salvati da Windows possono avere gli "a capo" di Windows (CRLF), che bash non accetta
find "$DEST/packaging" -type f \( -name '*.sh' -o -name 'AppRun' \) -exec perl -pi -e 's/\r$//' {} +
chmod +x "$DEST"/packaging/*.sh "$DEST/packaging/linux/AppRun" 2>/dev/null || true
echo "  copia aggiornata"

[ "${SOLO_COPIA:-0}" = "1" ] && exit 0

cd "$DEST"
"./packaging/build-$PIATTAFORMA.sh"

if [ -n "${HDPDF_RISULTATI:-}" ]; then
  step "Copia dei risultati in $HDPDF_RISULTATI"
  mkdir -p "$HDPDF_RISULTATI"
  find dist -maxdepth 1 -type f \( -name '*.AppImage' -o -name '*.dmg' -o -name '*.ipa' -o -name '*.zip' -o -name 'versione-*.json' \) \
    -exec cp -f {} "$HDPDF_RISULTATI/" \;
  ls -l "$HDPDF_RISULTATI"
fi
echo "Risultati: $DEST/dist"
