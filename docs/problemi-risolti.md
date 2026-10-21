# Problemi risolti

Formato: **sintomo** (come lo si riconosce) → **causa** → **soluzione** → **da non rifare**.
Il più recente in cima.

> Le voci con numeri `AAAAMM.NNN` (es. 202610.014) sono della fase di sviluppo prima di PDFz 1.0.0, quando le versioni
> avevano quel formato. Restano perché spiegano cosa non rifare.

## 1.2.1 — La finestra di partenza resta aperta dopo aver ceduto la sua ultima scheda

- **Sintomo:** trascinata l'unica scheda di una finestra in un'altra finestra di PDFz, la finestra di partenza resta
  aperta (vuota o, a volte, con la scheda ancora lì, mentre l'altra segnala "La scheda non è più disponibile").
- **Causa:** con il mouse vero i due avvisi fra finestre possono arrivare in qualsiasi ordine. Se la fine del
  trascinamento arrivava alla finestra di partenza prima che l'altra prendesse la scheda, la finestra di partenza
  buttava il biglietto dopo 400 ms e la finestra di arrivo, ricevuto "fine-trascina", smetteva di aspettare la scheda.
  Riprodotto con pywebview vero (ordine "lento": fine del trascinamento 1,5 s prima del rilascio).
- **Soluzione:** `App.tsx` — il biglietto resta valido 5 s dopo la fine del trascinamento (si butta solo se nessuno
  l'ha preso); la finestra di arrivo accetta il rilascio anche dopo "fine-trascina" (`inArrivo.finito`); la finestra
  che cede l'ultima scheda si chiude da sola senza aspettare l'evento di fine (con il mouse la scheda sparisce mentre la
  si trascina e l'evento può non arrivare). Provato in tre ordini: veloce, lento, senza evento di fine.
- **Da non rifare:** contare sull'ordine degli eventi fra finestre diverse (drop, dragend, messaggi).

## 1.2.0 — Modifica testo fa sparire le righe attorno e perde lettere sulle pagine ruotate

- **Sintomo:**
  - inserito un testo nuovo e poi modificato con "Modifica testo" cambiando carattere e dimensione, spariscono le
    scritte attorno (anche intere righe sopra e sotto); già nell'anteprima la casella bianca, ingrandendosi, le copriva;
  - su una pagina ruotata il testo riscritto perde la parte finale (es. "Riga cambiat").
- **Causa:**
  - `edit_text` cancellava la riga con il suo riquadro (ristretto di 1,5 punti). L'altezza del riquadro viene da
    ascendente e discendente dichiarati dal carattere: in alcuni font di Windows (Segoe Print, Javanese Text, Dubai…)
    vale 1,7-2,7 volte il corpo, e anche Helvetica arriva a 1,37. MuPDF toglie ogni lettera il cui riquadro tocca l'area:
    le righe vicine sparivano (provato: con righe a 10-11 punti di distanza spariscono sia quella sopra sia quella sotto);
  - il testo nuovo si scriveva sempre "dritto per chi guarda" (rotazione della pagina). Se la riga originale era scritta
    in un altro verso (pagina ruotata dopo aver scritto il testo), il testo nuovo partiva dallo stesso punto nella
    direzione opposta e la fine usciva dal foglio;
  - anteprima: la casella in modifica aveva lo sfondo bianco (`cover`) e cresceva con carattere e dimensione.
- **Soluzione:** `content.py` — `_riga_di` ritrova la riga nel documento (direzione, linea di base, corpo);
  `_area_da_cancellare` usa una fascia tra 0,1 e 0,6 volte il corpo sopra la linea di base, e `_scansa` la allontana dai
  riquadri delle altre righe; il testo si riscrive con la rotazione della riga (`_rotazione`). `text_spans` restituisce
  `ink` (riquadro stretto delle lettere) e `TextPanels.tsx` copre di bianco solo quello, con la casella trasparente.
  Test: `test_text_edit_keeps_close_lines`, `test_text_edit_keeps_direction_on_rotated_page` (falliscono con il codice
  vecchio).
- **Da non rifare:** cancellare testo con il riquadro di riga o di span (`bbox`): dipende dalle metriche del carattere.

## 1.1.0 — La pipeline si ferma su Windows, macOS e Linux (PyMuPDF 2.0)

- **Sintomo:** release `v1.1.0` pubblicata con il solo APK Android; Windows, macOS e Linux falliti dopo 1-2 minuti, nei
  test: `FAILED tests/test_tools.py::test_forms_unlock_flatten - assert not (1 & 1)`. Sul PC di sviluppo i test passano.
- **Causa:** il 21 ottobre 2026 su PyPI c'era **PyMuPDF 2.0** e `requirements.txt` diceva solo `pymupdf>=1.26`: la pipeline
  ha installato la 2.0, il PC di sviluppo ha la 1.28.2. Con la 2.0 "Sblocca moduli" lascia i campi in sola lettura
  (flag `1` con la 2.0, `0` con la 1.28.2). Il motivo:
  - la 2.0 crea e gestisce i campi in due oggetti: il **campo** (`/T`, `/FT`, `/Ff`, `/V`) e il **widget** che lo
    disegna, figlio del campo (`/Parent`); la 1.28.2 li teneva in un oggetto solo;
  - `Widget.update()` della 2.0 scrive `/Ff` (e valore, tipo, azioni) solo sui widget **senza** `/Parent`: per gli altri
    `field_flags` viene ignorato in silenzio. `unlock_forms` faceva `w.field_flags &= ~1; w.update()`, quindi il flag
    restava. Anche con la 1.28.2 il codice vecchio non era giusto sui campi con padre (PDF di altri programmi, campi
    con più widget): scriveva `/Ff 0` sul widget e lasciava `/Ff 1` sul campo, che altri programmi possono leggere
    ancora come sola lettura (provato).

  Android non ne risente (Pyodide usa la 1.28.2 fissata in `prepare-engine.mjs`). La pipeline
  pubblica comunque i sistemi compilati, quindi è uscita una release con il solo Android, segnata come "Latest".
- **Soluzione:**
  - subito: `pymupdf>=1.26,<2` in `backend/requirements.txt` (commit `1aaee3c`); tag `v1.1.0` spostato su quel commit
    (`git push --force` del solo tag): la pipeline ha aggiunto Windows, macOS e Linux alla stessa release e ricompilato
    l'APK;
  - poi (passaggio alla 2.0, dopo la 1.1.0): `unlock_forms` in `tools/security.py` scrive `/Ff` direttamente
    (`_unlock_field`, con `doc.xref_get_key`/`xref_set_key`) sul widget **e sui campi padre**, perché il flag si eredita
    e può stare su uno qualsiasi; niente più `Widget.update()`. Il messaggio conta i campi (nomi), non i widget.
    `test_forms_unlock_flatten` prova anche un flag ereditato dal campo padre. Limite portato a `pymupdf>=1.26,<3`.
    Test: 73 passati, 2 saltati sia con la 1.28.2 sia con la 2.0 (Windows, venv di prova); con la 2.0 e il codice
    vecchio falliva solo `test_forms_unlock_flatten`.
  - Note sulla 2.0: ruote solo per Python 3.11+ e Windows x64, macOS arm64, Linux x86_64/aarch64 (bastano per la
    pipeline); **nessuna ruota WebAssembly** (per questo Android resta sulla 1.28.2). Il vecchio nome `fitz`, usato da
    pdf2docx, è deprecato (avviso `FutureWarning` nei test): finché esiste funziona, va ricontrollato a ogni nuova versione.
- **Da non rifare:** dipendenze principali senza limite superiore di versione (vedi anche `opencv-python-headless<5`).
  Con PyMuPDF non fidarsi di `Widget.update()` per le proprietà del campo (`field_flags`, `field_value`…): sui widget
  figli non le salva. Per i flag scrivere `/Ff` con `xref_set_key`.
  Per fermare una pipeline serve un token con il permesso Actions (quello di `gh` sul PC non ce l'ha): annullare
  dalla pagina della run.

## 1.0.1 — Android: il menu Tema "non si apre" e le notifiche spariscono

- **Sintomo:**
  - **menu Tema** (e, su tablet o in orizzontale, notifiche e download): toccando il pulsante non compare niente;
  - **campanella**: la finestra delle novità sparisce da sola dopo pochi secondi e il pallino rosso resta acceso;
    inoltre si vedevano solo le prime 3 novità e i messaggi brevi in basso sparivano senza poterli rileggere.
- **Causa:**
  - sul telefono la barra in alto scorre in orizzontale (`overflow-x: auto` in `styles.css`): in CSS questo taglia anche
    tutto ciò che sporge in verticale, e i menu erano disegnati *dentro* la barra (`position: absolute`). Il menu si apriva
    ma restava nascosto (verificato in vista telefono: al posto del menu c'era la pagina);
  - la campanella segnava le novità come lette solo alla chiusura con "Chiudi": se la finestra spariva per un altro
    motivo (ridisegno della barra, chiusura non voluta) il pallino restava. La chiusura dopo pochi secondi sul telefono
    vero non è stata riprodotta nel browser; la nuova struttura toglie le cause possibili.
- **Soluzione:**
  - `components/Popover.tsx`: le finestrelle dei pulsanti in alto (Tema, Notifiche, Download) si disegnano fuori dalla
    barra, in `<body>`, con posizione fissa sotto il pulsante, misure adattate allo schermo e contenuto che scorre;
    si chiudono toccando fuori (il tocco arriva comunque a ciò che si tocca), con Esc o con il pulsante stesso;
  - campanella: resta aperta finché la chiude l'utente (lo stato "aperta" sopravvive al ridisegno), le novità si segnano
    come lette **all'apertura** (niente pallino che resta), elenca **tutte** le voci della versione e in fondo i
    **messaggi recenti** della sessione (`messaggi.ts`: ogni messaggio breve finisce anche lì; ora restano 6 secondi
    sullo schermo, gli errori 10).
- **Da non rifare:** finestrelle o menu con `position: absolute` dentro la barra in alto (`.topbar`): usare `Popover`.
  Provando la versione mobile in `localhost:8790`, attenzione al service worker della web app: può servire la pagina vecchia
  (DevTools › Application › Service workers › Unregister).

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
