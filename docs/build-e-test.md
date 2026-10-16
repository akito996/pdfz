# Build e test

Aggiornato alla versione **1.0.0** (2026-10-16).

## Flusso di lavoro: si modifica nel repository, si compila in C:\Build

| Cosa | Dove |
|---|---|
| **Repository** (sorgente "ufficiale", git) | `C:\Dev\10_PDFz` — GitHub `https://github.com/akito996/pdfz`, ramo `main` |
| **Build Windows** (copia + compilazione) | `C:\Build\PDFz-Windows` → risultati in `C:\Build\PDFz-Windows\dist` |
| **Build Android** (copia + compilazione) | `C:\Build\PDFz-Android` → risultati in `C:\Build\PDFz-Android\dist` |
| **Build Linux** (da Windows, in WSL) | copia in `~/Build/PDFz-Linux` dentro Ubuntu → AppImage in `C:\Build\PDFz-Linux\dist` |
| **Build macOS / iPhone** (sul Mac) | `~/Build/PDFz-macOS` / `~/Build/PDFz-iOS` → risultati in `.../dist` (vedi `macos-linux-iphone.md`) |

Perché si compila in una copia:
1. la build crea e scarica migliaia di file (`.venv`, `node_modules`, PyInstaller, Gradle, `dist`) che non devono finire
   nel repository; nella copia restano fra una build e l'altra (build più veloci);
2. il percorso della build deve essere **senza "&"** (per `cmd.exe` "&" vuol dire "nuovo comando": `npm run`, `npx`,
   file `.cmd`/`.bat`, script `postinstall`, `gradlew.bat` si rompono) e **fuori da cartelle sincronizzate nel cloud**
   (che bloccano i file appena creati: EBUSY, `PermissionError`, "Accesso negato").

Anche il repository `C:\Dev\10_PDFz` rispetta le due condizioni. Le regole "senza cmd.exe" negli script restano comunque
(non costano niente e proteggono da percorsi con "&").

## Script

| Script | Cosa fa | Produce in |
|---|---|---|
| `packaging\copia-e-build.ps1` | **Da lanciare dalla radice del repository.** Copia il progetto in `C:\Build\PDFz-<Windows/Android>` (robocopy /MIR, solo file cambiati) e lancia lo script di build **dalla copia**; con `linux` copia e compila in WSL | — |
| `packaging\build-windows.ps1` | dipendenze Python → **test** → interfaccia (TypeScript + Vite) → PyInstaller → MSI (WiX v5) → `versione-windows.json` | `<copia>\dist\`: `PDFz-<ver>-x64.msi`, `PDFz-Lingue-<gruppo>-<ver>-x64.msi`, `versione-windows.json`, app compilata `PDFz\` |
| `packaging\build-android.ps1` | interfaccia in modalità android → motore Pyodide (`mobile\scripts\prepare-engine.mjs`) → Capacitor sync → Gradle | `<copia>\dist\`: `PDFz-<ver>-android.apk`, `versione-android.json` |
| `packaging\scrivi-versione.ps1` | crea `versione-<piattaforma>.json` da `frontend\src\novita.json` | accanto a MSI/APK (`-OutDir`; senza, `<copia>\dist`) |

Opzioni di `copia-e-build.ps1`: `-Piattaforma windows|android|linux|tutte` (`tutte` = Windows, Android e, se c'è WSL, Linux), `-SkipTests`, `-OnlyMsi`, `-WithGhostscript` (Windows),
`-Open` (Android Studio), `-SoloCopia` (aggiorna la copia senza compilare), `-Base` (default `C:\Build`).
`build-windows.ps1` / `build-android.ps1` hanno anche `-OutDir`; se il percorso contiene "&" o è in una cartella
sincronizzata nel cloud mostrano un avviso.

**Cosa copia `copia-e-build.ps1`:** tutto il codice, con `/MIR` (aggiunge i file cambiati, toglie quelli cancellati nel progetto).
**Non** copia e **non** cancella nella copia le cartelle che la build crea o scarica: `.venv`, `node_modules`, `dist`, `build`, `www`,
`.gradle`, `.kotlin`, `__pycache__`, `.pytest_cache`, `_work`, `_data`, `Claude outputs` → restano fra una build e l'altra (build più veloci).
`vendor` (OCR, lingue) e `mobile\cache` (motore Pyodide) si copiano con `/E /XO`, senza mai cancellare nella copia.
Attenzione: una modifica fatta **dentro** `C:\Build\...` viene sovrascritta alla build successiva: si modifica solo nel repository.

Cartelle dentro ogni copia:
- `dist\` risultati (MSI/APK, `versione-*.json`, app compilata `dist\PDFz\` per Windows);
- `build\` file di lavoro (PyInstaller `build\pyinstaller`, test `build\pytest-tmp`, `build\lingue-msi`, Android `build\android-tmp`, `build\npm-cache`): cancellabili.

```powershell
cd C:\Dev\10_PDFz
Set-ExecutionPolicy -Scope Process Bypass -Force
.\packaging\copia-e-build.ps1 -Piattaforma windows
.\packaging\copia-e-build.ps1 -Piattaforma android
explorer C:\Build\PDFz-Windows\dist
explorer C:\Build\PDFz-Android\dist
```

## Build automatica su GitHub (a ogni tag)

`.github/workflows/release.yml` parte quando si pubblica un tag `MAJOR.MINOR.PATCH` (`1.0.0` o `v1.0.0`):
1. controlla che il tag sia uguale a `__version__` in `backend\hdpdf\__init__.py` (se no si ferma);
2. scrive l'indirizzo degli aggiornamenti in `UPDATE_BASE_URL` di `aggiornamenti.py` (`packaging/imposta-url-aggiornamenti.sh`):
   la variabile di repository `UPDATE_BASE_URL` se c'è, altrimenti `https://github.com/akito996/pdfz/releases/latest/download/`;
3. compila, con i test, **Windows** (`build-windows.ps1`: MSI + MSI lingue), **macOS** (`build-macos.sh`, DMG `arm64` per Mac
   Apple Silicon; niente versione per Mac Intel), **Linux** (`build-linux.sh`, AppImage x86_64, su Ubuntu 24.04) e
   **Android** (`build-android.ps1` su Windows, APK firmato con la chiave `pdfz-release.jks`);
4. crea `versione-<piattaforma>.json` (`packaging/scrivi_versione.py`);
5. crea la **GitHub Release** del tag con installer e `versione-*.json` e, come note, la sezione della versione in
   `CHANGELOG.md` (la riga deve essere esattamente `## X.Y.Z`).

```powershell
git tag v1.0.1
git push origin v1.0.1
```

La release è una release normale (non bozza, non pre-release): l'indirizzo `releases/latest/download/` punta sempre
all'ultima release normale, ed è lì che le app installate cercano la versione nuova (vedi `avviso-nuova-versione.md`).
Si può lanciare anche a mano (Actions → Release → Run workflow) per provare la build: i file restano negli artifact, niente pubblicazione.
I DMG non sono firmati Apple (firma "ad hoc"), l'MSI non ha firma Authenticode.

### Impostazioni del repository GitHub (una volta sola)

Settings → Secrets and variables → Actions:

| Tipo | Nome | Valore |
|---|---|---|
| Variable | `UPDATE_BASE_URL` | **facoltativa**: indirizzo (con `/` finale) da cui l'app legge `versione-*.json` e scarica gli installer; vuota = `https://github.com/akito996/pdfz/releases/latest/download/` |
| Secret | `ANDROID_KEYSTORE_BASE64` | contenuto di `pdfz-release.jks` in base64 (file `keystore-base64.txt`, vedi sotto) |
| Secret | `ANDROID_KEYSTORE_PASSWORD` | password del keystore e della chiave |
| Secret | `ANDROID_KEY_ALIAS` | `pdfz` |

### Chiave di firma Android

La chiave `pdfz-release.jks` (alias `pdfz`) la crea l'autore **una volta sola** e **non va mai nel repository**.
Esempio (keytool è nel JDK; con Android Studio: `C:\Program Files\Android\Android Studio\jbr\bin\keytool.exe`):

```powershell
keytool -genkeypair -v -keystore pdfz-release.jks -alias pdfz -keyalg RSA -keysize 4096 -validity 10000
# contenuto per il secret ANDROID_KEYSTORE_BASE64
[Convert]::ToBase64String([IO.File]::ReadAllBytes("pdfz-release.jks")) | Set-Content -NoNewline keystore-base64.txt
```

Su Linux: `base64 -w0 pdfz-release.jks > keystore-base64.txt`; su macOS: `base64 -i pdfz-release.jks -o keystore-base64.txt`.
Dopo aver copiato il testo nel secret, cancellare `keystore-base64.txt`.

La chiave e la sua password vanno conservate al sicuro, con una copia di riserva: **se si perde la chiave i telefoni non
accettano più gli aggiornamenti** (bisognerebbe disinstallare l'app e reinstallarla).
Per una build Android locale firmata: variabili `HDPDF_KEYSTORE` (percorso del `.jks`), `HDPDF_KEYSTORE_PASSWORD`,
`HDPDF_KEY_ALIAS` (`pdfz`), `HDPDF_KEY_PASSWORD` (se manca vale la password del keystore). Senza, `build-android.ps1`
fa l'APK di prova (debug), che non si installa sopra quello firmato.

## Regole degli script (non cambiarle senza leggere `decisioni.md`)

- **Mai passare da cmd.exe**: niente `npm run`, `npx`, `.cmd`, `.bat`. Si usano direttamente:
  - `node node_modules\typescript\bin\tsc -b`
  - `node node_modules\vite\bin\vite.js build` (Android: `--mode android --outDir ../mobile/www --emptyOutDir`)
  - `node scripts\prepare-engine.mjs`
  - `node node_modules\@capacitor\cli\bin\capacitor sync android`
  - Gradle: `java.exe -Xmx64m -Xms64m -Dorg.gradle.appname=gradlew -jar mobile\android\gradle\wrapper\gradle-wrapper.jar assembleDebug -Dorg.gradle.java.home=$env:JAVA_HOME`
    (`assembleRelease` quando c'è la chiave di firma)
- Funzioni negli script: `Stop-ProjectLocks` (chiude esbuild.exe del progetto), `Install-NodeModules`
  (`npm install --ignore-scripts` se `node_modules` c'è, altrimenti `npm ci --ignore-scripts`, poi `node node_modules\esbuild\install.js`),
  `Invoke-Node` (lancia node.exe e controlla il codice di uscita).
- `npm` sempre con `--ignore-scripts` (l'unico script utile è quello di esbuild, lanciato a mano).
- **Cartelle temporanee in `build\` della copia** (mai in AppData\Temp, mai in cartelle sincronizzate): pytest `--basetemp build\pytest-tmp`;
  Android `TEMP/TMP = build\android-tmp`, `npm_config_cache = build\npm-cache`. Gli script creano prima le cartelle.
- Controllo pacchetti Python con `pip list --format=freeze` (non `pip show`, che esce con errore se il pacchetto manca).
- OpenCV solo `opencv-python-headless`; `aiohttp` NON va escluso da PyInstaller (serve alla firma con pyhanko).
- PyInstaller: `--distpath dist --workpath build\pyinstaller` (nella copia; se bloccata: `pyinstaller-<data-ora>`). Prima di PyInstaller:
  `Stop-ProjectLocks` (chiude esbuild e PDFz.exe avviati dalla copia) e `Remove-DirRobust` su `dist\PDFz`
  (5 tentativi, toglie "sola lettura").
- **Non toccare** la logica di ricerca SDK/Java di `build-android.ps1` (modifica rifiutata dall'utente).

## Test automatici

- Comando (dentro lo script): `python -m pytest -q -p no:cacheprovider --basetemp build\pytest-tmp` nella cartella `backend` della copia.
- File: `tests\test_tools.py`, `test_p7m.py`, `test_setup_mode.py`, `test_translate.py`.
- Risultato atteso su Windows: **69 passed, 2 skipped** (71 test; i 2 saltati richiedono LibreOffice o simili). Su Linux con LibreOffice: 71 passed.
- `tests\test_tools.py` usa `HDPDF_WORKDIR = backend\tests\_work` e `HDPDF_DATADIR = backend\tests\_data`;
  `_work` viene **svuotata a ogni esecuzione**.
- Sul PC di build c'è Microsoft Word: il test `test_convert_from_pdf[docx]` usa quindi **Word via COM** (vedi `conversioni.md`).
  In cloud/Linux lo stesso test usa pdf2docx: alcuni comportamenti si vedono solo su Windows.

## Controllo dell'interfaccia (dopo modifiche a frontend/src)

`scripts/controllo-pannelli.py` apre un PDF di prova e tutti gli strumenti uno per uno (Playwright + Chromium) e segnala schermate
bianche o pannelli in errore. Serve l'app avviata in modalità server (`cd backend && python -m hdpdf --server --port 8811`).
Prima volta: `python -m pip install playwright pymupdf && python -m playwright install chromium`.

## File da aggiornare a ogni nuova versione

`backend\hdpdf\__init__.py` (`__version__`, unica fonte) · `packaging\version_info.txt` · `mobile\android\app\build.gradle`
(versionCode/versionName) · `frontend\package.json` + `package-lock.json` · `mobile\package.json` + `package-lock.json` ·
`README.md` (nomi MSI) · `CHANGELOG.md` (voce `## X.Y.Z`) · `frontend\src\novita.json` · **questa cartella `docs\`** · `CLAUDE.md`.

Formati (regole in `backend\hdpdf\versione.py`): `MAJOR.MINOR.PATCH` (app, package.json, tag git) ·
MSI `(100+MAJOR).MINOR.PATCH` · versionCode Android e build iPhone `1000000000 + MAJOR*1000000 + MINOR*1000 + PATCH`.
PDFz parte dalla **1.0.0** (MSI 101.0.0, versionCode 1001000000) con identificativi nuovi; da una versione all'altra
i numeri devono solo salire.

## Se qualcosa va storto

- "PyInstaller non riuscito" con `...\PDFz e' bloccata`: chiudere l'app avviata da `C:\Build\PDFz-Windows\dist\PDFz` e le finestre di Esplora risorse su quella cartella.
- "Non riesco a creare C:\Build\...": `New-Item C:\Build -ItemType Directory` da PowerShell come amministratore, poi rilanciare.
- Copia non riuscita (robocopy codice 8 o più): un file del progetto è aperto o bloccato da un altro programma; chiuderlo e riprovare.
- Copia "sporca" (file strani nella copia): cancellare `C:\Build\PDFz-<piattaforma>` e rilanciare (la prima build sarà più lenta).
- Build Android firmata che si ferma con "HDPDF_KEYSTORE punta a un file che non esiste": controllare il percorso del `.jks`.
- Errori già visti e soluzioni: [problemi-risolti.md](problemi-risolti.md).
