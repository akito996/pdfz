#!/usr/bin/env bash
# PDFz - build per macOS: crea "PDFz.app" e il DMG da distribuire.
#
# Prerequisiti sul Mac (una volta sola):
#   1. Strumenti da riga di comando di Apple:   xcode-select --install
#   2. Homebrew (https://brew.sh), poi:         brew install python@3.12 node
#   3. OCR (lettura del testo nelle scansioni):  brew install tesseract tesseract-lang
#   4. Facoltativo, per compressione avanzata e PDF/A:   brew install ghostscript
#      (OCR e Ghostscript servono anche sui Mac dove si installa l'app; senza, quelle funzioni restano spente)
#
# Uso (dal Terminale). Di norma NON si lancia direttamente: ./packaging/copia-e-build.sh macos
#   ./packaging/build-macos.sh
#   SKIP_TESTS=1 ./packaging/build-macos.sh
# Firma Apple (facoltativa, serve l'account Apple Developer):
#   MAC_SIGN_IDENTITY="Developer ID Application: agjin (TEAMID)" NOTARY_PROFILE=pdfz ./packaging/build-macos.sh
#   (NOTARY_PROFILE si crea una volta con:  xcrun notarytool store-credentials pdfz)
#
# L'app e' per il tipo di Mac su cui la compili: Apple Silicon (M1, M2…) -> arm64, Intel -> x86_64.
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$(pwd)"
VERSION="$(sed -n 's/^__version__ = "\(.*\)"/\1/p' backend/hdpdf/__init__.py)"
ARCH="$(uname -m)"
APP="dist/PDFz.app"
step() { printf '\n\033[36m==> %s\033[0m\n' "$*"; }

step "PDFz $VERSION per macOS ($ARCH)"
PYBIN="${PYTHON:-}"
if [ -z "$PYBIN" ]; then
  for c in python3.12 python3.13 python3.11 python3; do
    if command -v "$c" >/dev/null && "$c" -c 'import sys; sys.exit(0 if sys.version_info >= (3, 11) else 1)'; then PYBIN="$c"; break; fi
  done
fi
[ -n "$PYBIN" ] || { echo "Serve Python 3.11 o piu' recente:  brew install python@3.12"; exit 1; }
command -v npm >/dev/null || { echo "Serve Node.js:  brew install node"; exit 1; }
[ "$(node -p 'process.versions.node.split(".")[0]')" -ge 20 ] || { echo "Serve Node.js 20 o piu' recente:  brew upgrade node"; exit 1; }
command -v tesseract >/dev/null || echo "Avviso: Tesseract non installato (brew install tesseract tesseract-lang): l'OCR non funzionera' su questo Mac."

step "Ambiente Python ($PYBIN)"
"$PYBIN" -m venv .venv-mac
PY="$ROOT/.venv-mac/bin/python"
"$PY" -m pip install -q --upgrade pip
"$PY" -m pip install -q -r backend/requirements-dev.txt

step "Interfaccia (frontend)"
( cd frontend && { if [ -d node_modules ]; then npm install --no-audit --no-fund; else npm ci --no-audit --no-fund; fi; } && npm run build )

step "Lingue OCR (Tesseract)"
mkdir -p vendor/tessdata
for l in ita eng fra deu spa; do   # stesse lingue OCR della versione Windows
  f="vendor/tessdata/$l.traineddata"
  [ -s "$f" ] || curl -fsSL -o "$f" "https://github.com/tesseract-ocr/tessdata_fast/raw/main/$l.traineddata"
done

if [ "${SKIP_TESTS:-0}" != "1" ]; then
  step "Test"
  ( cd backend && "$PY" -m pytest -q )
fi

step "App (PyInstaller)"
rm -rf "$APP"
"$PY" -m PyInstaller packaging/hdpdf.spec --noconfirm --clean --distpath dist --workpath build
[ -d "$APP" ] || { echo "L'app non e' stata creata"; exit 1; }
du -sh "$APP"

step "Firma"
if [ -n "${MAC_SIGN_IDENTITY:-}" ]; then
  codesign --force --deep --timestamp --options runtime --entitlements packaging/macos/entitlements.plist \
           --sign "$MAC_SIGN_IDENTITY" "$APP"
else
  # firma "ad hoc": obbligatoria sui Mac Apple Silicon; senza account Apple il primo avvio va confermato
  codesign --force --deep --sign - "$APP"
fi
codesign --verify --deep --strict "$APP" && echo "  firma OK"

step "DMG"
DMG="dist/PDFz-$VERSION-macOS-$ARCH.dmg"
STAGE="build/dmg"
rm -rf "$STAGE" "$DMG"
mkdir -p "$STAGE"
cp -R "$APP" "$STAGE/"
ln -s /Applications "$STAGE/Applicazioni"
# In due passi: immagine non compressa, poi compressione ULMO (LZMA, macOS 10.15 e successivi; PDFz chiede gia'
# macOS 11: DMG di 30-40 MB piu' piccolo di UDZO). Sui Mac di GitHub hdiutil a volte risponde "Resource busy"
# (il disco temporaneo e' ancora occupato: release 1.7.1 senza Mac): si riprova, e se ULMO non riesce si fa UDZO
# come prima, cosi' l'installer per Mac c'e' sempre.
RAW="build/PDFz-raw.dmg"
riprova() { local n; for n in 1 2 3; do "$@" && return 0; echo "  hdiutil non riuscito (tentativo $n), riprovo tra 10 s"; sleep 10; done; return 1; }
rm -f "$RAW"
riprova hdiutil create -volname "PDFz" -srcfolder "$STAGE" -ov -format UDRW "$RAW" >/dev/null
if ! riprova hdiutil convert "$RAW" -format ULMO -ov -o "$DMG" >/dev/null; then
  echo "  ULMO non riuscito: DMG compresso come prima (UDZO)"
  riprova hdiutil convert "$RAW" -format UDZO -ov -o "$DMG" >/dev/null
fi
rm -f "$RAW"
if [ -n "${MAC_SIGN_IDENTITY:-}" ]; then
  codesign --sign "$MAC_SIGN_IDENTITY" --timestamp "$DMG"
  if [ -n "${NOTARY_PROFILE:-}" ]; then
    step "Notarizzazione Apple (qualche minuto)"
    xcrun notarytool submit "$DMG" --keychain-profile "$NOTARY_PROFILE" --wait
    xcrun stapler staple "$DMG"
  fi
fi

step "Fatto"
echo "App: $APP"
echo "DMG: $DMG  ($(du -h "$DMG" | cut -f1))"
if [ -z "${MAC_SIGN_IDENTITY:-}" ]; then
  echo "Senza firma Apple: sugli altri Mac il primo avvio si fa con tasto destro sull'app -> Apri -> Apri."
fi
