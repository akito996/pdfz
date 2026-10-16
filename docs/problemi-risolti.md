# Problemi risolti

Formato: **sintomo** (come lo si riconosce) → **causa** → **soluzione** → **da non rifare**.
Il più recente in cima.

> Le voci con numeri `AAAAMM.NNN` (es. 202610.014) sono della fase di sviluppo prima di PDFz 1.0.0, quando le versioni
> avevano quel formato. Restano perché spiegano cosa non rifare.

## 1.0.0 — Avvisi "come JavaScript" invece delle finestre dell'app

- **Sintomo:** alcuni avvisi e domande comparivano in finestre grigie del browser o di sistema, diverse da quelle dell'app
  (aspetto da "messaggio JavaScript", con l'indirizzo della pagina o il titolo del programma al posto del testo dell'app):
  - **Salva con nome su Android**: il nome del file si scriveva in una finestra del browser;
  - **Oscura**: la conferma prima di applicare l'oscuramento;
  - **app desktop** (Windows, macOS): gli errori di salvataggio e di file bloccato (es. file aperto in un altro programma).
- **Causa:**
  - Salva con nome su Android usava `window.prompt`;
  - Oscura usava `window.confirm`;
  - il motore desktop (`desktop.py`) mostrava gli errori con `create_confirmation_dialog` di pywebview, cioè una finestra di sistema.
- **Soluzione:** tutte le domande e gli avvisi passano dalla finestra dell'app (`components/ConfirmDialog.tsx`, aperta da
  `App.tsx` tramite il contesto condiviso; supporta anche un campo di testo, al posto di `window.prompt`). Gli errori del
  motore desktop non aprono più finestre: vengono restituiti alla pagina come eccezioni e la pagina li mostra nella
  finestra dell'app.
- **Eccezioni volute:** resta la finestra di sistema solo come riserva quando la pagina non risponde alla chiusura dell'app;
  nella versione Linux, che gira nel browser, resta l'avviso "Lasciare il sito?" (non si può personalizzare).
- **Da non rifare:** usare `window.alert`, `window.confirm`, `window.prompt` o le finestre di pywebview (`create_confirmation_dialog`)
  per avvisi e domande; chiamare `evaluate_js` dentro l'evento di chiusura della finestra (la blocca).

## 202610.014 — "Info complete" → schermata bianca (tutte le piattaforme)

- **Sintomo:** cliccando "Info complete" l'intera app diventa bianca (Windows, macOS, Android; riprodotto anche su Linux con l'AppImage). Nella console: `TypeError: Cannot read properties of undefined (reading 'version')` in `InfoPanels`.
- **Causa:** `InfoPanel` (frontend/src/panels/InfoPanels.tsx) aveva una sezione "Struttura" che leggeva `data.info.version`; il motore (`backend/hdpdf/tools/meta.py`, strumento `info`) non restituisce `info` ma `file`, `document`, `security`, `content`, `page_formats`, `pages`. Un errore durante il disegno in React, senza "rete di sicurezza", smonta tutta l'app.
- **Soluzione:** tolta la sezione "Struttura" (dati già presenti in File/Documento/Sicurezza); nuovo `components/ErrorBoundary.tsx` attorno a ogni pannello (`ToolPanel`) e a tutta l'app (`main.tsx`).
- **Verifica:** Playwright su desktop e su schermo da telefono; controllo di tutti i 38 strumenti con `scripts/controllo-pannelli.py` → nessun problema; con il vecchio pannello l'ErrorBoundary mostra l'avviso invece della schermata bianca.
- **Da non rifare:** leggere nel frontend campi che il motore non restituisce senza controllarli; pannelli senza ErrorBoundary.

## 202610.013 — Android: campanella con le novità di Windows

- **Sintomo:** nell'app Android la campanella mostrava anche novità "solo Windows" e l'etichetta "App Windows".
- **Causa:** `Notifiche.tsx` calcolava la piattaforma con `isLocalEngine()` al caricamento del modulo, cioè prima che `main.tsx` avviasse il motore (`__HD_LOCAL__` ancora falso).
- **Soluzione:** piattaforma dal tipo di build (`import.meta.env.MODE` = `android`/`ios`), per il desktop dal browser (Windows/macOS/Linux).
- **Da non rifare:** leggere a livello di modulo valori che si impostano solo all'avvio dell'app.

## 202610.012 — Build nel posto sbagliato (cartella sincronizzata invece di C:\Build)

- **Sintomo:** le build finivano in `dist\` del progetto, che allora stava in una cartella sincronizzata nel cloud; tutti gli errori 008–010 (EBUSY, file bloccati, WinError 5, "&").
- **Causa:** il flusso deciso ("modifiche nella cartella del progetto, build in una copia in `C:\Build`") non era stato scritto nell'handoff, quindi gli script compilavano direttamente nel progetto.
- **Soluzione:** `packaging\copia-e-build.ps1` (copia + build); avviso negli script di build se lanciati da un percorso con "&" o sincronizzato; flusso scritto in handoff, `docs\build-e-test.md` e `decisioni.md`. Oggi il repository è in `C:\Dev\10_PDFz` e le copie in `C:\Build\PDFz-*`.
- **Da non rifare:** compilare dentro una cartella sincronizzata nel cloud; perdere una decisione dell'utente non scrivendola nell'handoff.

## 202610.010 — `PermissionError [WinError 5]` su `build\hdpdf\localpycs` (PyInstaller)

- **Sintomo:** `PermissionError: [WinError 5] Accesso negato: '...\build\hdpdf\localpycs'`, poi "PyInstaller non riuscito" (`build-windows.ps1` riga del comando PyInstaller). I test erano passati.
- **Causa:** `--workpath build` → cartella di lavoro `build\hdpdf` dentro la cartella sincronizzata. Con `--clean` PyInstaller la cancella e ricrea migliaia di file; il programma di sincronizzazione li stava caricando e ne bloccava alcuni.
- **Soluzione:** workpath fuori dalla cartella sincronizzata (oggi `build\pyinstaller` nella copia `C:\Build\PDFz-Windows`), cartella alternativa con data-ora se bloccata; `Remove-DirRobust` + `Stop-ProjectLocks` prima di sostituire `dist\PDFz`.
- **Da non rifare:** cartella di lavoro di PyInstaller dentro una cartella sincronizzata nel cloud.

## 202610.009 — `PermissionError` sul .docx nei test (build Windows interrotta)

- **Sintomo:** `FAILED tests/test_tools.py::test_convert_from_pdf[docx] - PermissionError: [Errno 13] Permission denied: '...\backend\tests\_work\sessione-...\<id>.docx'`; `1 failed, 65 passed, 2 skipped`; "Test falliti: build interrotta". Intermittente.
- **Causa:** sul PC c'è Microsoft Word → PDF→Word usa Word via COM, che salvava direttamente nella cartella del progetto (sincronizzata nel cloud); Word, la sincronizzazione o l'antivirus tenevano il file bloccato quando il test lo scaricava.
- **Soluzione:** Word salva in `%TEMP%\hdpdf-word-*`, poi `wait_readable` + `move_when_free`; ripiego su pdf2docx; download con attesa 10 s / HTTP 423; `_work` svuotata a ogni test. Dettagli in `conversioni.md`.
- **Da non rifare:** far salvare Word (COM) direttamente in una cartella sincronizzata nel cloud.

## 202610.008 — "&" nel percorso

- **Sintomo:** "`<parte del percorso dopo &>` non è riconosciuto come comando interno o esterno", `Cannot find module 'C:\Users\<utente>\typescript\bin\tsc'`.
- **Causa:** il percorso del progetto conteneva "&"; `npm run`, script `postinstall`, `tsc.cmd`/`vite.cmd`, `gradlew.bat` passano da cmd.exe, che spezza il percorso su "&".
- **Soluzione:** node.exe/java.exe lanciati direttamente; `npm --ignore-scripts`; esbuild preparato con `node node_modules\esbuild\install.js`.
- **Da non rifare:** `npm ci` + `npm run build` (o qualunque `.cmd`/`.bat`) in percorsi con "&".

## 202610.008 — EBUSY su `node_modules\esbuild`

- **Sintomo:** `EBUSY: resource busy or locked` durante `npm ci`.
- **Causa:** la sincronizzazione cloud o un processo esbuild aperto bloccano la cartella mentre npm la cancella.
- **Soluzione:** non cancellare `node_modules` (`npm install` se esiste), chiudere esbuild.exe del progetto prima (`Stop-ProjectLocks`). Se ricompare: chiudere VS Code e mettere in pausa la sincronizzazione.

## 202610.007 — 11 test con `FileNotFoundError [WinError 3] ...build\pytest-tmp`

- **Causa:** pytest crea solo l'ultima cartella di `--basetemp`, non `build`.
- **Soluzione:** lo script crea `build` prima dei test (Android anche `build\npm-cache`).

## 202610.006 — "Installazione dipendenze Python non riuscita" (falso errore)

- **Causa:** `pip show opencv-python` esce con codice 1 se il pacchetto non c'è, scambiato per errore dell'installazione.
- **Soluzione:** `pip list --format=freeze` e controllo del codice di uscita subito dopo `pip install`.
- **Da non rifare:** usare `pip show` per controlli.

## Altri tentativi falliti

- Escludere `aiohttp` da PyInstaller → rompe firma/p7m (pyhanko).
- `ProgressText` duplicati in `Product.wxs` → conflitto con WixUI; i testi vanno in `Testi.it-IT.wxl`.
- 202610.003: password chiesta anche su PDF senza password → ora chiede solo per restrizioni reali.
