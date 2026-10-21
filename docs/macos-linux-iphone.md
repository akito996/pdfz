# macOS, Linux e iPhone

Aggiornato alla versione **1.0.0** (2026-10-16). Stesso flusso di Windows e Android: **si modifica nel repository,
si compila in una copia** (`~/Build/PDFz-<macOS|iOS|Linux>`).

| Piattaforma | Dove si compila | Comando (dalla radice del repository) | Risultato |
|---|---|---|---|
| **macOS** | sul Mac | `./packaging/copia-e-build.sh macos` | `~/Build/PDFz-macOS/dist/PDFz-<ver>-macOS-<arm64/x86_64>.dmg` |
| **iPhone / iPad** | sul Mac (serve Xcode) | `./packaging/copia-e-build.sh ios` | `~/Build/PDFz-iOS/dist/PDFz-<ver>-iOS.ipa` (firmato) o `...-iOS-simulatore.zip` |
| **Linux** | sul PC Windows con WSL, o su un PC Linux | Windows: `.\packaging\copia-e-build.ps1 -Piattaforma linux` · Linux: `./packaging/copia-e-build.sh linux` | `C:\Build\PDFz-Linux\dist\PDFz-<ver>-x86_64.AppImage` (da Windows) o `~/Build/PDFz-Linux/dist` |

La pipeline di GitHub (a ogni tag, vedi `build-e-test.md`) compila da sola macOS Apple Silicon e Linux; la build a mano
serve per provare prima del tag, per i Mac Intel e per l'iPhone.

Script:
- `packaging/copia-e-build.sh` — copia (rsync, solo file cambiati) in `~/Build/PDFz-<macOS|iOS|Linux>` e lancia la build dalla copia.
  Non copia e non cancella nella copia: `.venv*`, `node_modules`, `dist`, `build`, `www`, `mobile/ios`, `cache`, `vendor`
  (di `vendor` copia solo `tessdata`; per iOS copia anche `mobile/cache`, il motore Pyodide già scaricato).
  Toglie da solo gli "a capo" di Windows (CRLF) dagli script. Variabili: `SKIP_TESTS=1`, `SOLO_COPIA=1`, `HDPDF_BASE`,
  `HDPDF_SORGENTE`, `HDPDF_RISULTATI`.
- `packaging/build-macos.sh`, `packaging/build-linux.sh`, `packaging/build-ios.sh` — le build vere e proprie (da lanciare
  nella copia, non in cartelle sincronizzate nel cloud).

## macOS

Prerequisiti (una volta): `xcode-select --install`, [Homebrew](https://brew.sh), `brew install python@3.12 node tesseract tesseract-lang`
(facoltativo `brew install ghostscript`).

- App: `PDFz.app` (PyInstaller, bundle id `com.agjin.pdfz`) dentro un DMG; finestra integrata WebKit (pywebview).
- È per il tipo di Mac su cui la compili: Apple Silicon → `arm64`, Intel → `x86_64`. La pipeline di GitHub fa solo `arm64`: su Mac Intel le ultime pikepdf e cryptography non si installano più.
- Firma: senza account Apple la firma è "ad hoc": sugli altri Mac il primo avvio si fa con tasto destro → Apri → Apri.
  Con Apple Developer: `MAC_SIGN_IDENTITY="Developer ID Application: … (TEAMID)" NOTARY_PROFILE=… ./packaging/copia-e-build.sh macos`.
- OCR e Ghostscript **non sono dentro l'app**: sui Mac dove si installa servono `brew install tesseract tesseract-lang` (OCR)
  e, facoltativo, `brew install ghostscript`. Senza, quelle funzioni restano spente (l'app lo segnala).
- Avviso di nuova versione: **attivo** (DMG dalle GitHub Releases, vedi `avviso-nuova-versione.md`).

### Passo passo sul Mac (prima volta)

1. **Che Mac è**: `uname -m` → `arm64` (Apple Silicon) o `x86_64` (Intel); `sw_vers -productVersion` (serve macOS 11 o più recente).
2. **Strumenti Apple**: `xcode-select --install` (finestra → Installa).
3. **Homebrew**: `/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"`, poi
   (Apple Silicon) `echo 'eval "$(/opt/homebrew/bin/brew shellenv)"' >> ~/.zprofile && eval "$(/opt/homebrew/bin/brew shellenv)"`.
4. **Programmi**: `brew install python@3.12 node tesseract tesseract-lang` (facoltativo `ghostscript`); controllo:
   `python3.12 --version`, `node -v` (20 o più), `tesseract --version`.
5. **Repository**: `git clone https://github.com/akito996/pdfz.git ~/Dev/pdfz` (in una cartella normale del disco,
   non sincronizzata nel cloud); per le build successive `git pull` nella stessa cartella.
6. **Build**: `cd ~/Dev/pdfz`, poi `bash packaging/copia-e-build.sh macos`
   (con `bash` davanti non servono i permessi di esecuzione degli script). Prima volta 10–20 minuti.
7. **Risultato**: `open ~/Build/PDFz-macOS/dist` → `PDFz-<ver>-macOS-<arm64|x86_64>.dmg`.
8. **Installazione**: apri il DMG e trascina l'app in Applicazioni. Sullo stesso Mac si apre subito; su altri Mac (firma "ad hoc"):
   macOS 14 o precedente → tasto destro sull'app → Apri → Apri; macOS 15 → prova ad aprirla, poi Impostazioni di Sistema →
   Privacy e sicurezza → **Apri comunque**.

Build successive: solo i passi 6–8 (`bash packaging/copia-e-build.sh macos`; `SKIP_TESTS=1` davanti per saltare i test).

## iPhone / iPad (iOS)

È la **stessa app di Android** (Capacitor + motore Python Pyodide nell'app, tutto offline), compilata per iOS.

Prerequisiti (sul Mac, una volta): Xcode dall'App Store (aprirlo una volta), `sudo xcode-select -s /Applications/Xcode.app`,
`brew install node`. La prima build crea il progetto Xcode in `mobile/ios` **dentro la copia** (`~/Build/PDFz-iOS`), che resta lì.

Tre modi:

| Modo | Comando | Serve | Risultato |
|---|---|---|---|
| Prova sul simulatore | `./packaging/copia-e-build.sh ios` | solo Xcode | `dist/PDFz-<ver>-iOS-simulatore.zip` |
| Sul tuo iPhone collegato | `OPEN=1 ./packaging/copia-e-build.sh ios` → Xcode → Team = tuo Apple ID → Play | Apple ID **gratuito** | app installata; **scade dopo 7 giorni**, solo dispositivi tuoi |
| IPA da distribuire | `IOS_TEAM_ID=<ID team> ./packaging/copia-e-build.sh ios` | **Apple Developer Program** (99 €/anno) | `dist/PDFz-<ver>-iOS.ipa` |

`IOS_EXPORT_METHOD`: `debugging` (predefinito, dispositivi registrati), `release-testing` (ad hoc), `app-store-connect` (TestFlight/App Store),
`enterprise` (solo con Apple Developer Enterprise). Per dare l'app ad altre persone il modo più semplice è **TestFlight**.

Cosa imposta `build-ios.sh` a ogni build (Info.plist e progetto):
- versione `MAJOR.MINOR.PATCH` (es. 1.0.0) e build `1000000000 + MAJOR*1000000 + MINOR*1000 + PATCH` (es. 1001000000, sempre crescente
  come il versionCode Android);
- nome "PDFz", bundle id `com.agjin.pdfz`, icona `packaging/assets/icon-ios-1024.png` (1024×1024, senza trasparenza come vuole Apple);
- file salvati visibili nell'app **File** (`UIFileSharingEnabled`, `LSSupportsOpeningDocumentsInPlace`);
- "Apri con" per PDF e `.p7m`/`.p7s` (`CFBundleDocumentTypes`); permessi fotocamera/foto con spiegazione in italiano.

Differenze rispetto ad Android: niente tasto "indietro"; i file si salvano in *File → Sul mio iPhone → PDFz*;
avviso di nuova versione **spento** (gli aggiornamenti passano da TestFlight/App Store/Xcode). Come su Android mancano
PDF/A, compressione Ghostscript e conversioni Office → PDF.

**Da verificare alla prima prova sul dispositivo** (non provabile senza un Mac): avvio del motore Pyodide nel WebView di iOS
(WebAssembly servito da `capacitor://localhost`), memoria sugli iPhone più vecchi (il motore occupa qualche centinaio di MB),
apertura di un PDF da "Condividi → PDFz".

## Linux

- Pacchetto **AppImage** x86_64 (un solo file, nessuna installazione: `chmod +x` e doppio clic).
- La finestra è Chrome/Chromium/Edge in modalità app (o il browser predefinito). Chiudendo con documenti non salvati
  compare l'avviso del browser "Lasciare il sito?", che non si può personalizzare.
- Sul PC Linux dell'utente, facoltativi: `tesseract-ocr tesseract-ocr-ita` (OCR), `ghostscript`, `libreoffice`.
- Compatibilità: gira sulle distribuzioni con glibc uguale o più recente di quella dove è stata compilata
  (compilata su Ubuntu 24.04 → Ubuntu 24.04+, Debian 13+, Fedora 40+, Mint 22+). Per distribuzioni più vecchie: compilare su Ubuntu 22.04.
- Avviso di nuova versione: **attivo** (AppImage dalle GitHub Releases).

### Linux da Windows con WSL (consigliato)

Una volta sola (PowerShell **da amministratore**), poi riavviare:
```powershell
wsl --install -d Ubuntu-24.04
```
Al primo avvio di Ubuntu scegli nome utente e password, poi dentro Ubuntu:
```bash
sudo apt update && sudo apt install -y python3 python3-venv python3-pip rsync curl file
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt install -y nodejs
```
Poi da Windows, nella radice del repository: `.\packaging\copia-e-build.ps1 -Piattaforma linux`. La copia e la compilazione
stanno nel disco di Linux (`~/Build/PDFz-Linux`, più veloce); solo l'AppImage arriva in `C:\Build\PDFz-Linux\dist`.

**Verifica fatta (prima della 1.0.0):** il flusso `copia-e-build.sh linux` è stato eseguito per intero su Linux x86_64 nel cloud:
71 test passati, AppImage da 175 MB creata; l'AppImage avviata in modalità server ha aperto un PDF, convertito in Word/testo/PNG,
fatto l'OCR e servito l'interfaccia. Simulato anche il comando usato da Windows (script con "a capo" CRLF).
