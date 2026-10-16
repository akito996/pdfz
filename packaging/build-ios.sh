#!/usr/bin/env bash
# PDFz - build dell'app per iPhone/iPad (iOS) con Capacitor. Funziona SOLO su un Mac.
#
# Stessa app di Android: interfaccia + motore Python (Pyodide) dentro l'app, tutto offline.
#
# Prerequisiti sul Mac (una volta sola):
#   1. Xcode dall'App Store (aprilo una volta e accetta la licenza), poi:   sudo xcode-select -s /Applications/Xcode.app
#   2. Node.js 20 o piu' recente:   brew install node
#   3. Per installare sull'iPhone: un Apple ID in Xcode (Xcode > Impostazioni > Account).
#      - Apple ID gratuito: l'app si installa solo sui TUOI dispositivi collegati al Mac e scade dopo 7 giorni.
#      - Apple Developer Program (99 EUR/anno): TestFlight, installazione su altri iPhone, nessuna scadenza a 7 giorni.
#
# Uso (dal Terminale). Di norma NON si lancia direttamente: ./packaging/copia-e-build.sh ios
#   ./packaging/build-ios.sh                         prova sul simulatore (nessun account Apple necessario)
#   OPEN=1 ./packaging/build-ios.sh                  prepara il progetto e apre Xcode (per installare sull'iPhone collegato)
#   IOS_TEAM_ID=ABCDE12345 ./packaging/build-ios.sh  crea l'IPA firmato (serve l'account Apple Developer del team)
#   IOS_EXPORT_METHOD=release-testing|app-store-connect|enterprise|debugging   tipo di IPA (predefinito: debugging)
#
# Risultati in dist/: PDFz-<versione>-iOS.ipa (firmato) oppure PDFz-<versione>-iOS-simulatore.zip
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$(pwd)"
step() { printf '\n\033[36m==> %s\033[0m\n' "$*"; }
die() { printf '\033[31mERRORE: %s\033[0m\n' "$*" >&2; exit 1; }

[ "$(uname -s)" = "Darwin" ] || die "l'app per iPhone si compila solo su un Mac (serve Xcode)."
VERSION="$(sed -n 's/^__version__ = "\(.*\)"/\1/p' backend/hdpdf/__init__.py)"
[[ "$VERSION" =~ ^([0-9]+)\.([0-9]+)\.([0-9]+)$ ]] || die "versione '$VERSION' non valida (formato MAJOR.MINOR.PATCH, es. 1.0.0)"
MA=$((10#${BASH_REMATCH[1]})); MI=$((10#${BASH_REMATCH[2]})); PA=$((10#${BASH_REMATCH[3]}))
MARKETING="$MA.$MI.$PA"
# build sempre crescente, come il versionCode di Android (regola in backend/hdpdf/versione.py):
# 1.0.0 -> 1001000000, piu' alto delle vecchie AAAAMM.NNN (202610NNN)
BUILDNUM=$(( 1000000000 + MA * 1000000 + MI * 1000 + PA ))
# nome e bundle id: unica fonte backend/hdpdf/__init__.py (PDFz, com.agjin.pdfz; uguale ad appId di mobile/capacitor.config.json)
APP_NAME="$(sed -n 's/^APP_NAME = "\([^"]*\)".*/\1/p' backend/hdpdf/__init__.py)"
BUNDLE_ID="$(sed -n 's/^APP_BUNDLE_ID = "\([^"]*\)".*/\1/p' backend/hdpdf/__init__.py)"
[ -n "$APP_NAME" ] && [ -n "$BUNDLE_ID" ] || die "APP_NAME o APP_BUNDLE_ID non trovati in backend/hdpdf/__init__.py"
step "$APP_NAME $VERSION per iPhone (versione $MARKETING, build $BUILDNUM, $BUNDLE_ID)"

command -v xcodebuild >/dev/null || die "manca Xcode: installalo dall'App Store, poi  sudo xcode-select -s /Applications/Xcode.app"
xcodebuild -version | head -1
command -v node >/dev/null || die "manca Node.js:  brew install node"
NODE_MAJOR=$(node -p 'process.versions.node.split(".")[0]')
[ "$NODE_MAJOR" -ge 20 ] || die "serve Node.js 20 o piu' recente (c'e' la $(node -v)):  brew upgrade node"

step "Interfaccia per iPhone (TypeScript + Vite)"
( cd frontend
  if [ -d node_modules ]; then npm install --no-audit --no-fund; else npm ci --no-audit --no-fund; fi
  node node_modules/typescript/bin/tsc -b
  node node_modules/vite/bin/vite.js build --mode ios --outDir ../mobile/www --emptyOutDir )

step "Motore Python (Pyodide) dentro l'app"
( cd mobile
  if [ -d node_modules ]; then npm install --no-audit --no-fund; else npm ci --no-audit --no-fund; fi
  node scripts/prepare-engine.mjs )

step "Progetto Xcode (Capacitor)"
IOS_DIR="mobile/ios/App"
if [ ! -d "$IOS_DIR/App.xcodeproj" ]; then
  # la prima volta Capacitor crea il progetto Xcode (Swift Package Manager, niente CocoaPods)
  ( cd mobile && node node_modules/@capacitor/cli/bin/capacitor add ios )
fi
( cd mobile && node node_modules/@capacitor/cli/bin/capacitor sync ios )

PLIST="$IOS_DIR/App/Info.plist"
pset() { plutil -replace "$1" "$2" "$3" "$PLIST"; }   # pset <chiave> <-string|-bool|-json> <valore>: imposta o sostituisce
pset CFBundleDisplayName -string "$APP_NAME"
# file salvati dall'app visibili nell'app "File" (Sul mio iPhone > PDFz)
pset UIFileSharingEnabled -bool YES
pset LSSupportsOpeningDocumentsInPlace -bool YES
# fotocamera (scansione documenti) e foto
pset NSCameraUsageDescription -string "Serve per fotografare documenti e trasformarli in PDF."
pset NSPhotoLibraryUsageDescription -string "Serve per scegliere foto da trasformare in PDF."
pset NSPhotoLibraryAddUsageDescription -string "Serve per salvare immagini create dai PDF."
# compare in "Apri con" / "Condividi" per i PDF e per i file firmati (.p7m, .p7s)
pset CFBundleDocumentTypes -json '[
  {"CFBundleTypeName": "Documento PDF", "LSHandlerRank": "Alternate", "LSItemContentTypes": ["com.adobe.pdf"]},
  {"CFBundleTypeName": "File firmato digitalmente", "LSHandlerRank": "Alternate", "LSItemContentTypes": ["public.data"]}
]'
plutil -lint "$PLIST" >/dev/null || die "Info.plist non valido dopo le modifiche"

# numero di versione, bundle id (anche per un progetto Xcode creato prima con un altro id) e icona dell'app
sed -i '' -E "s/MARKETING_VERSION = [^;]+;/MARKETING_VERSION = $MARKETING;/g; s/CURRENT_PROJECT_VERSION = [^;]+;/CURRENT_PROJECT_VERSION = $BUILDNUM;/g; s/PRODUCT_BUNDLE_IDENTIFIER = [^;]+;/PRODUCT_BUNDLE_IDENTIFIER = $BUNDLE_ID;/g" \
  "$IOS_DIR/App.xcodeproj/project.pbxproj"
ICONSET="$IOS_DIR/App/Assets.xcassets/AppIcon.appiconset"
if [ -d "$ICONSET" ] && [ -f packaging/assets/icon-ios-1024.png ]; then
  ICON_FILE="$(sed -n 's/.*"filename" *: *"\([^"]*\)".*/\1/p' "$ICONSET/Contents.json" | head -1)"
  cp packaging/assets/icon-ios-1024.png "$ICONSET/${ICON_FILE:-AppIcon-512@2x.png}"
fi
echo "  Info.plist, versione, bundle id e icona aggiornati"

if [ "${OPEN:-0}" = "1" ]; then
  step "Apro Xcode"
  echo "In Xcode: seleziona 'App' a sinistra > Signing & Capabilities > Team = il tuo Apple ID,"
  echo "collega l'iPhone (sbloccato, 'Autorizza questo computer'), sceglilo in alto e premi Play."
  echo "Sull'iPhone la prima volta: Impostazioni > Generali > VPN e gestione dispositivi > autorizza lo sviluppatore;"
  echo "e Impostazioni > Privacy e sicurezza > Modalita' sviluppatore = attiva."
  ( cd mobile && node node_modules/@capacitor/cli/bin/capacitor open ios )
  exit 0
fi

mkdir -p dist build/ios
if [ -n "${IOS_TEAM_ID:-}" ]; then
  METHOD="${IOS_EXPORT_METHOD:-debugging}"
  step "Archivio firmato (team $IOS_TEAM_ID, tipo $METHOD)"
  ARCHIVE="build/ios/PDFz.xcarchive"
  rm -rf "$ARCHIVE" build/ios/export
  xcodebuild -project "$IOS_DIR/App.xcodeproj" -scheme App -configuration Release \
    -destination "generic/platform=iOS" -archivePath "$ARCHIVE" \
    DEVELOPMENT_TEAM="$IOS_TEAM_ID" CODE_SIGN_STYLE=Automatic -allowProvisioningUpdates archive
  cat > build/ios/ExportOptions.plist <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>method</key><string>$METHOD</string>
  <key>teamID</key><string>$IOS_TEAM_ID</string>
  <key>signingStyle</key><string>automatic</string>
  <key>compileBitcode</key><false/>
</dict></plist>
EOF
  xcodebuild -exportArchive -archivePath "$ARCHIVE" -exportPath build/ios/export \
    -exportOptionsPlist build/ios/ExportOptions.plist -allowProvisioningUpdates
  IPA="dist/PDFz-$VERSION-iOS.ipa"
  cp "$(ls build/ios/export/*.ipa | head -1)" "$IPA"
  step "Fatto"
  echo "IPA: $IPA  ($(du -h "$IPA" | cut -f1))"
  echo "Installazione: TestFlight (tipo app-store-connect) oppure Apple Configurator / Xcode (Finestra > Dispositivi)."
else
  step "Prova sul simulatore (nessun account Apple necessario)"
  xcodebuild -project "$IOS_DIR/App.xcodeproj" -scheme App -configuration Debug \
    -sdk iphonesimulator -destination "generic/platform=iOS Simulator" -derivedDataPath build/ios/sim \
    CODE_SIGNING_ALLOWED=NO build
  APP="$(ls -d build/ios/sim/Build/Products/Debug-iphonesimulator/*.app | head -1)"
  ZIP="dist/PDFz-$VERSION-iOS-simulatore.zip"
  rm -f "$ZIP"
  ( cd "$(dirname "$APP")" && zip -qry "$ROOT/$ZIP" "$(basename "$APP")" )
  step "Fatto"
  echo "App per il simulatore: $ZIP"
  echo "Prova:  open -a Simulator  poi trascina l'app (dopo averla estratta) sulla finestra del simulatore."
  echo "Per l'iPhone vero:  OPEN=1 ./packaging/build-ios.sh   (Xcode + tuo Apple ID)"
  echo "        oppure      IOS_TEAM_ID=<ID del team Apple Developer> ./packaging/build-ios.sh"
fi
