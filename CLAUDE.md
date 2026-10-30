# CLAUDE.md — PDFz

Editor PDF che lavora tutto in locale, per PC (Windows, macOS, Linux) e telefoni (Android, iPhone). Autore ed editore:
**agjin**. Utente e lingua di lavoro: **italiano** (risposte, commenti nel codice, testi dell'app, commit).

> **Questo file va tenuto aggiornato.** Dopo ogni modifica che cambia regole, flussi, versioni o punti aperti,
> aggiorna le sezioni "Stato attuale" e "Punti aperti" e inviale insieme al resto del lavoro (richiesta dell'utente, 2026-10-13).
> I dettagli stanno in `docs/`: qui solo quello che serve per ripartire.
> Ad ogni giro di modifiche si aggiorna anche la documentazione Word in `docs/` (nome: `PDFz_AAAAMMGG.docx`; dopo un
> passaggio di consegne `PDFz_AAAAMMGG_handoff_N.docx`).

## Struttura

| Cartella | Contenuto |
|---|---|
| `backend/hdpdf/` | Motore Python: server FastAPI locale (`server.py`), strumenti PDF (`tools/`), finestra desktop pywebview (`desktop.py`), versioni (`versione.py`), avviso aggiornamenti (`aggiornamenti.py`). Nome, ID e autore dell'app in `__init__.py` (`APP_NAME`, `APP_ID`, `APP_AUTHOR`, `APP_BUNDLE_ID`) |
| `backend/tests/` | Test pytest (circa 75; su Windows 2 saltati per LibreOffice) |
| `frontend/src/` | Interfaccia React + TypeScript + Vite. `App.tsx` (schede, salvataggi, chiusura, finestre di dialogo), `context.ts` (stato condiviso, `usePending`, `ask`/`askText`/`notify`), `panels/` (uno per strumento), `tools.ts` (elenco strumenti), `novita.json` (campanella), `components/ThemeMenu.tsx` (aspetto e 5 palette) |
| `branding/` | `genera_marchio.py` (unica fonte di icone, favicon, logo, splash, immagini dell'installer), proposte in `branding/proposte/` |
| `mobile/` | App Android/iPhone con Capacitor; il motore Python gira nell'app con Pyodide (`mobile/scripts/prepare-engine.mjs`) |
| `packaging/` | Script di build per piattaforma, PyInstaller (`hdpdf.spec`), installer WiX (`wix/`), `scrivi_versione.py` |
| `.github/workflows/release.yml` | Pipeline: build e pubblicazione nelle GitHub Releases a ogni tag |
| `docs/` | Documentazione tecnica (indice in `docs/README.md`), decisioni (`docs/decisioni.md`), marchio (`docs/branding.md`), problemi risolti |

## Comandi

```bash
# test (dalla cartella backend)
../.venv/Scripts/python -m pytest -q -p no:cacheprovider --basetemp ../build/pytest-tmp
# controllo TypeScript e build dell'interfaccia (dalla cartella frontend)
node node_modules/typescript/bin/tsc -b
node node_modules/vite/bin/vite.js build
# motore in modalita' server per provare l'interfaccia nel browser (dalla cartella backend; vite dev usa la porta 8765)
../.venv/Scripts/python -m hdpdf --server --port 8765
# marchio: proposte + applicazione di icona e favicon scelti (dalla radice)
.venv/Scripts/python branding/genera_marchio.py --serie 6 --icona 24 --favicon 24
```

Build locali: `packaging/build-windows.ps1`, `build-android.ps1`, `build-macos.sh`, `build-linux.sh`, `build-ios.sh`
(prerequisiti in testa a ogni script e in `docs/build-e-test.md`). `packaging/copia-e-build.ps1/.sh` compilano da una
copia pulita in `C:\Build\PDFz-<piattaforma>`.

## Regole del progetto (vedi `docs/decisioni.md` prima di cambiarle)

- **Nomi**: visibile `PDFz`; file e cartelle `PDFz` (es. `PDFz.exe`, `PDFz-1.0.0-x64.msi`, `%LOCALAPPDATA%\PDFz`);
  Android/iPhone/macOS `com.agjin.pdfz`; registro `Software\agjin\PDFz`. I nomi interni `hdpdf` (pacchetto Python,
  variabili `HDPDF_*`, `x-hdpdf-token`, `window.hdpdf*`, chiavi `hdpdf.*`) restano: sono nomi in codice.
- **Versioni `MAJOR.MINOR.PATCH`** (PDFz parte dalla 1.0.0). Unica fonte: `__version__` in `backend/hdpdf/__init__.py`.
  Calcoli per gli installer in `backend/hdpdf/versione.py`: MSI `(100+MAJOR).MINOR.PATCH`, versionCode Android e build iPhone
  `1000000000 + MAJOR*1000000 + MINOR*1000 + PATCH`. Devono solo crescere.
- **A ogni nuova versione** si aggiornano: `__init__.py`, `packaging/version_info.txt`, `mobile/android/app/build.gradle`,
  `frontend` e `mobile` `package.json` + `package-lock.json`, nomi file in `README.md`, `CHANGELOG.md` (intestazione
  esatta `## X.Y.Z`: la pipeline ne estrae le note), `frontend/src/novita.json`, `docs/`, la documentazione Word e **questo file**.
- **Release = tag git `vX.Y.Z`** uguale a `__version__` (la pipeline accetta anche `X.Y.Z`, ma in locale il vecchio tag
  `1.0.0` è della storia precedente: **mai `git push --tags`**, si invia solo il tag nuovo). La pipeline compila Windows (MSI),
  macOS Apple Silicon (DMG), Linux (AppImage) e Android (APK firmato) e crea la GitHub Release con installer e `versione-*.json`.
  Pubblica quello che si è compilato: un sistema fallito o Android senza chiave non bloccano gli altri (mai APK di prova in release).
  Niente build per Mac Intel (pikepdf e cryptography non hanno più pacchetti x86_64).
  **Ogni modifica si pubblica come nuova versione** (PATCH per correzioni, MINOR per funzioni nuove) e alla fine si
  mandano sempre all'utente i link diretti di download per ogni sistema, dal sito Cloudflare
  (`https://pdfz.agjin.com/download/vX.Y.Z/<file>`, pagina `https://pdfz.agjin.com/`, web app `…/app/`; finché il
  repository è pubblico valgono anche quelli di GitHub), verificati senza login (richiesta del 2026-10-22:
  "ogni volta che facciamo una modifica"). Il sito si aggiorna da solo dopo la release (`cloudflare.yml`, qualche minuto).
  **In ogni messaggio finale c'è sempre il link del sito https://pdfz.agjin.com/**, ben visibile, anche quando non esce
  una versione nuova (richiesta del 2026-10-30: "Inviami sempre il link per il sito cloudflare").
- **Aggiornamenti**: l'app legge `UPDATE_BASE_URL` (scritto prima della build da `packaging/imposta-url-aggiornamenti.sh`):
  variabile di repository `UPDATE_BASE_URL` oppure `https://github.com/akito996/pdfz/releases/latest/download/`
  (funziona solo con release pubbliche). Per il repository privato: sito su **Cloudflare** (`docs/cloudflare-aggiornamenti.md`,
  `.github/workflows/cloudflare.yml` dopo ogni release): pagina, `versione-*.json`, `/download/vX.Y.Z/<file>` dall'archivio
  R2 (funzione `cloudflare/functions/download`), web app in `/app/`; si accende con `CLOUDFLARE_PAGES` = `true`.
  **Mai rendere privato il repository prima della versione ponte** compilata con `UPDATE_BASE_URL` = sito Cloudflare.
- **Script di build su Windows: mai passare da cmd.exe** (niente `npm run`, `npx`, `.cmd`, `.bat`): node.exe/java.exe diretti,
  npm con `--ignore-scripts`. Non modificare la ricerca SDK/Java di `build-android.ps1`.
- **Avvisi e domande solo con le finestre dell'app** (`ConfirmDialog` tramite `ask`/`askText`/`notify` del contesto):
  mai `window.alert/confirm/prompt` né finestre di sistema. Gli errori dell'app desktop si sollevano in Python come
  `AvvisoUtente` (`desktop.py`) e la pagina li mostra (`desktopCall` in `api.ts`). Uniche eccezioni: la conferma di
  sistema quando la pagina non risponde alla chiusura (`_ask_quit`) e "Lasciare il sito?" del browser su Linux.
- **Finestrelle dei pulsanti in alto** (Tema, Notifiche, Download e future): solo con `components/Popover.tsx` (disegnate
  in `<body>`, posizione fissa). Mai `position: absolute` dentro `.topbar`: sul telefono la barra scorre e le taglia.
- **Niente "Applica"** (dalla 1.6.0, `docs/facilita-uso.md`): quello che si mette sulla pagina va subito sul foglio
  (firma, timbro, immagine, forma: al tocco, poi resta selezionato e si sposta come oggetto applicato); il testo quando
  si lascia la casella (`useApplicaLasciando`). Quello che resta nel pannello si registra con `usePending(dirty, label,
  apply)`: uscendo, cambiando scheda o salvando l'app lo porta sul foglio **senza domande** (solo Oscura e la firma
  digitale chiedono conferma). Gli strumenti con il modulo hanno il pulsante con il verbo (`submitLabel`, altrimenti il
  nome) e uscendo non eseguono niente. Mai più un pulsante "Applica".
- **Facilità d'uso**: schermata iniziale `components/Inizio.tsx` (sei compiti, file recenti `recenti.ts`), modalità
  Semplice/Completa (`components/Semplice.tsx`, `hdpdf.modalita`, menu ☀), guide 1-2-3 (`guide.ts`,
  `components/Guida.tsx`, offerte al primo uso, "?" nel pannello), indicazione sopra la pagina (`placeHint` →
  `suggerimento-foglio`), "Tocca"/"Clicca" con `useVerbo`. Nomi degli strumenti in parole semplici; i nomi vecchi
  restano cercabili (`ANCHE` in `tools.ts`).
- **Chiusura dell'app desktop**: `desktop.py` ferma la chiusura e chiama `window.hdpdfRequestClose` da un altro thread; la pagina
  chiede salva/applica e poi chiama `api.quit()`. Mai `evaluate_js` dentro l'evento `closing` (blocca la finestra).
  **Più finestre** (scheda trascinata fuori): `apri_finestra()` in `run()` crea ogni finestra con la sua `Api`; `quit()` chiude
  solo la sua, l'app termina con l'ultima. La scheda passa con un biglietto monouso (`/api/schede`), mai nell'indirizzo.
  Fra finestre già aperte (scheda trascinata su un'altra finestra, "Riunisci qui le altre finestre") le finestre si
  parlano con BroadcastChannel (`frontend/src/finestre.ts`); una finestra che ha ceduto tutte le schede si chiude.
- **Oggetti applicati** (`tools/applicati.py`, `docs/oggetti-applicati.md`): ogni strumento che scrive nel contenuto della
  pagina (firma grafica, timbro, testo aggiunto, filigrana, numeri di pagina e i prossimi) racchiude quello che aggiunge
  in `with marca(pagina, tipo, nome, riquadro, id):`, così si ritrova (`list_applied`) e si elimina (`remove_applied`)
  anche dopo "Applica", e si sposta o ridimensiona (`move_applied`, dalla 1.5.0). Nell'interfaccia: `panels/applicati.tsx`
  (riquadri sulla pagina da trascinare, "Elimina", elenco; `onObjectDrop` alla fine del trascinamento).
  Le firme digitali si eliminano per campo (`list_signatures`, `remove_signature` con `fields`).
- **Lettura e presentazione** (`components/Viewer.tsx`, `components/Presentazione.tsx`): pulsante Vista (una o due pagine,
  copertina da sola, verticale o "a libro"; `hdpdf.vista`), Ctrl+L = presentazione a schermo intero (app desktop:
  `Api.schermo_intero`, pywebview sa solo invertire lo stato). Le finestrelle dei pulsanti in basso (telefono) si aprono
  verso l'alto (`Popover`).
- **Immagini sulle pagine ruotate**: ogni `insert_image` vuole `rotate=page.rotation` (resta diritta come la si vede);
  `get_pixmap(clip=…)` vuole il riquadro visivo.
- **Modifica testo**: la riga originale si cancella con una fascia sottile all'altezza delle minuscole (`_area_da_cancellare`
  in `tools/content.py`), mai con il riquadro della riga: dipende dalle metriche del carattere e cancellava le righe vicine.
- **Colori**: solo variabili CSS (`--brand`, `--on-brand`, `rgba(var(--brand-rgb), …)`), mai codici del vecchio marchio o
  colori dell'interfaccia scritti a mano. Nuova palette: vedi `docs/branding.md`. Icone: solo da `branding/genera_marchio.py`
  (scrive anche le icone della web app: `icon-192`, `icon-maskable-*`, `apple-touch-icon`).
- **iPhone: ogni modifica vale anche per la web app** (richiesta dell'utente, 2026-10-22). La web app usa la stessa
  interfaccia (`vite --mode web`, `VITE_WEB_APP`) e lo stesso motore Pyodide dell'app Android: dopo ogni modifica si
  controlla anche lei (`mobile/scripts/build-web.mjs --out <cartella di prova>` e prova in vista telefono, 375 px).
  Si pubblica su Cloudflare in `/app/` con `.github/workflows/cloudflare.yml` dopo ogni release.
- **Firma Android**: chiave `pdfz-release.jks` (alias `pdfz`) dell'autore, **mai nel repository**. Nella pipeline arriva dai
  secrets `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`; in locale dalle variabili `HDPDF_KEYSTORE*`.
- **Git**: si lavora in `C:\Dev\10_PDFz` (GitHub: `akito996/pdfz`, ramo `main`). Autore dei commit `agjin`
  (email noreply di GitHub, impostata nel repository locale). Commit, push e tag: a fine di ogni modifica, con la nuova
  versione (l'utente l'ha chiesto il 2026-10-22, vedi Release); messaggi in italiano.
  In locale si lavora sul ramo `pdfz` (storia nuova, collegato a `origin/main`). Il ramo locale `main` contiene la storia
  del progetto precedente: **mai da pubblicare** (contiene il vecchio marchio); si può rinominare o eliminare quando non serve più.
  Sul PC Git Credential Manager ha due account GitHub (akito996 e ServicedeskHDgroup): per inviare si usa **akito996**,
  esplicito: `git push https://akito996@github.com/akito996/pdfz.git pdfz:main` (con l'altro account: errore 403).
  Il token di `gh` (akito996) legge i registri della pipeline ma non può annullarla.

## Stato attuale (2026-10-30)

- Versione nel codice: **1.6.1** di PDFz (sito degli aggiornamenti su https://pdfz.agjin.com/). Marchio applicato ovunque (2026-10-22, versione 1.3.0): **icona e favicon 24
  "Foglio senza fondo"** — documento bianco con contorno nero, piega d'oro, "PDF" rosso, "z" nera, nessun fondo attorno
  (iPhone e icona adattiva Android su fondo bianco); prima la 19 (2026-10-21) e la 17 "Foglio oro" (inviata), palette predefinita Rubino,
  5 palette selezionabili, avvisi solo con le finestre dell'app (provati nel browser: Oscura, domanda annidata dopo
  "Applica", Salva con nome Android, errore di salvataggio desktop simulato). Test: 73 passati, 2 saltati.
- Prova WiX riuscita (MSI compilato con i nomi nuovi); PyInstaller, Gradle, Xcode e AppImage non provati
  dopo il cambio di nome.
- Codice su GitHub `akito996/pdfz` (ramo `main`, storia nuova che parte dal commit iniziale di PDFz 1.0.0).
- **Release v1.0.0 pubblicata** (2026-10-16, pipeline riuscita in 12 minuti): Windows (MSI + 2 MSI lingue), macOS arm64 (DMG),
  Linux (AppImage) e i `versione-*.json`. **Android aggiunto** con "Re-run all jobs" dopo la chiave: APK firmato con la chiave
  di PDFz (61,6 MB, verificato nel registro della pipeline); note della release corrette. iPhone: nessuna build;
  si prepara una web app da aggiungere alla Home (sessione separata). Installer non provati su macchine vere.
- **Release v1.0.1 pubblicata** (2026-10-16, pipeline riuscita in 16 minuti, "Latest"): Windows (MSI + lingue), macOS, Linux,
  Android (APK firmato con la chiave di PDFz, verificato nel registro). Correzioni Android/tablet del menu Tema (tagliato dalla
  barra in alto) e della campanella (resta aperta, segna lette all'apertura, tutte le voci, messaggi recenti). Provate nel
  browser in vista telefono, non ancora su un telefono vero.
- **Release v1.0.2 pubblicata** (2026-10-16, pipeline 10 minuti, "Latest"): download diretto per piattaforma.
  `versione-<sistema>.json` contiene `url` (link diretto all'installer di quella versione: MSI, DMG, AppImage, APK), `size`
  e `pagina`; la campanella mostra sistema, file, dimensione, "Scarica", link da copiare e come installare.
  **Repository reso pubblico dall'utente**: verificato senza login che `releases/latest/download/versione-*.json` e i 4 link
  diretti rispondono (200, dimensioni giuste) e che un'app 1.0.1 vede la 1.0.2 con il link del proprio sistema.
- Marchio: serie 1 (icone 1-5) scartata dall'utente perché simile a marchi esistenti e tolta dallo script; serie 2
  (6-10) e 3 (11-15) non scelte ma ancora disponibili; all'utente è piaciuta la 11 ("PDF" a capo, "z" piccola),
  messa in un foglio PDF nella serie 4 (16-18): scelta e applicata la **17** (inviata su GitHub).
  **Serie 5** (2026-10-21): la 17 con più bianco (19 Foglio bianco, 20 Fondo bianco, 21 Contorno bianco, 22 Etichetta
  bianca, 23 Foglio rosso su bianco), perché la 17 era "fastidiosa per gli occhi": scelta e applicata la **19**.
  **Serie 6** (2026-10-22): la **24**, disegnata sulle indicazioni dell'utente ("la 19 ancora non ci siamo"), applicata.
- **Release v1.1.0 pubblicata** (2026-10-21, "Latest"), tag `v1.1.0` sul commit `1aaee3c`:
  - **traduzione tolta** per alleggerire l'app: strumento Traduci, `translate.py`, `tools/translate_pdf.py`, CTranslate2 e
    SentencePiece, MSI `PDFz-Lingue-*` (`Lingue.wxs`), opzioni lingue di `build-windows.ps1`, cache `vendor/lingue` nella
    pipeline. All'avvio l'app desktop cancella `<dati>\lingue` (`cleanup.rimuovi_modelli_traduzione`);
  - **schede in una nuova finestra**: con 2+ schede, trascinata fuori dalla finestra o "Sposta in una nuova finestra" dal
    tasto destro; trascinata su un'altra scheda cambia posto. Provato con pywebview vero su Windows (seconda finestra,
    chiusura della principale) e nel browser (menu, riordino, rilascio fuori simulato). Non su Android/iPhone.
  - **pubblicazione**: la prima pipeline (commit `8473e2f`) ha installato **PyMuPDF 2.0**, che rompe "Sblocca moduli"
    (`test_forms_unlock_flatten`): Windows, macOS e Linux falliti, release uscita con il solo Android. Correzione
    `pymupdf>=1.26,<2`, tag `v1.1.0` spostato su `1aaee3c` (scelta dell'utente), pipeline #5 riuscita in 6 minuti.
    Installer: MSI 116,6 MB (1.0.2: 136,8), DMG 137,4 MB, AppImage 162,9 MB (1.0.2: 199,7), APK 64,6 MB. Verificato
    senza login: i 4 link diretti rispondono, `latest` = 1.1.0, nessun MSI lingue; un'app 1.0.2 vede la 1.1.0 con
    l'installer del proprio sistema (Android senza voci di novità: le modifiche sono solo per i PC).

- **Release v1.2.0 pubblicata** (2026-10-21, "Latest", tag sul commit `6eb99ad`, pipeline #6 riuscita in 9 minuti con
  PyMuPDF 2.0). Installer: MSI 131,6 MB (1.1.0: 116,6), DMG 160,4 MB (137,4), AppImage 175,0 MB (162,9), APK 64,6 MB:
  più grandi per PyMuPDF 2.0. Verificato senza login: 4 link diretti, `latest` = 1.2.0, un'app 1.1.0 vede la 1.2.0
  con l'installer del proprio sistema (3 novità sui PC, 2 su Android).
  - **schede fra finestre**: una scheda si trascina su un'altra finestra di PDFz (anche l'unica scheda di una finestra) e
    "Riunisci qui le altre finestre" (tasto destro su una scheda) porta tutte le schede in una finestra; quelle rimaste
    vuote si chiudono. Provato con pywebview vero (finestre e canale veri, trascinamento simulato con eventi della pagina:
    il trascinamento con il mouse fra due finestre non è stato provato);
  - **correzioni di Modifica testo**: non spariscono più le righe attorno (fascia sottile invece del riquadro della riga,
    anteprima con casella trasparente) e sulle pagine ruotate il testo resta intero (stessa direzione dell'originale).
    Provato nel motore (2 test nuovi) e nella finestra desktop vera. Test: 77 passati, 2 saltati con PyMuPDF 1.28.2 e 2.0;
  - **PyMuPDF 2.0** unito dal ramo `claude/elastic-payne-8e66cf` (sessione separata): vedi punto aperto 7.

- **Release v1.2.1 pubblicata** (2026-10-21, "Latest", commit `ffc1e4e`, pipeline #7 riuscita in 6 minuti; è partita
  qualche minuto dopo il tag). Verificato senza login: 4 link diretti, `latest` = 1.2.1, un'app 1.2.0 vede la 1.2.1
  (1 novità sui PC, nessuna su Android). Correzione: trascinata in un'altra finestra la sua ultima scheda, la
  finestra di partenza si chiude in ogni ordine degli eventi (biglietto valido 5 s, rilascio accettato anche dopo la fine
  del trascinamento, chiusura senza aspettare l'evento di fine). Provato con pywebview vero in 3 ordini.
- **Web app per iPhone** (`docs/web-app-iphone.md`): dalla cartella `mobile`, `node scripts/build-web.mjs` → `www-web/`
  (`vite --mode web` + motore Pyodide + service worker `mobile/web/sw.js` scritto a mano) e `node scripts/serve.mjs www-web`
  per provarla su http://localhost:8790. Nell'interfaccia: `frontend/src/web/pwa.ts` (uso offline, avviso di nuova
  versione con `ask`) e `VITE_WEB_APP` in `frontend/.env.web`; manifest con icone 192/512/maskable da `genera_marchio.py`;
  salvataggio con `navigator.share({ files })` (finestra "File pronto" se iPhone chiede un tocco), altrimenti download.
  `prepare-engine.mjs` ora scrive archivi riproducibili (stesso codice = stessi byte). Provata nel browser del PC in
  vista telefono (apri, ruota, numeri di pagina, salva, ricarica senza rete, aggiornamento). Workflow
  pubblicazione su Cloudflare in `/app/` (`cloudflare.yml`; prima c'era `pages.yml` per GitHub Pages, tolto). **Unita al codice il 2026-10-22** (dal ramo `claude/heuristic-austin-71ab67`,
  file per file, non inviata): riprovata nel browser in vista telefono con il codice della 1.2.1 e l'icona 24; corretto
  il nome della scheda schiacciato sopra la campanella sui telefoni stretti. Mai provata su un iPhone vero.

- **Release v1.3.0 pubblicata** (2026-10-22, "Latest", commit `18569f7`, pipeline #8 riuscita in 6 minuti): icona 24,
  web app per iPhone unita, barra stretta corretta. Workflow della web app saltato (Pages non ancora acceso). Verificato
  senza login: 4 link diretti (MSI 131,6 MB, DMG 160,0 MB, AppImage 175,1 MB, APK 64,6 MB), `latest` = 1.3.0, un'app
  1.2.1 vede la 1.3.0 (1 novità sui PC, 2 su Android). Link mandati all'utente.

- **Sito degli aggiornamenti su Cloudflare ACCESO** (2026-10-23): **https://pdfz.pages.dev/** (pagina, `versione-*.json`,
  `/download/vX.Y.Z/<file>` da R2, web app in `/app/`), configurato dall'autore e provato con la 1.3.0 (vedi
  `docs/cloudflare-aggiornamenti.md`); la **1.3.1** è la versione ponte. Prima (2026-10-22): `cloudflare.yml` (al posto di
  `pages.yml`), `packaging/sito_aggiornamenti.py`, `cloudflare/functions/download`. Provati in locale pagina, file di
  versione e funzione dei download (R2 simulato); la pubblicazione vera aspetta la configurazione dell'autore.

- **Release v1.3.1 pubblicata** (2026-10-23, "Latest", commit `e06ae2c`, versione ponte): Release #9 riuscita in 7 minuti,
  poi `cloudflare.yml` partito da solo (workflow_run) e riuscito in 2 minuti. Le 4 app compilate con
  `UPDATE_BASE_URL` = `https://pdfz.pages.dev/` (nel registro Android si legge `***`: GitHub oscura "pdfz", che è anche il
  secret dell'alias della chiave). Verificato senza login: sito con la 1.3.1, 4 download da Cloudflare e da GitHub con le
  stesse dimensioni, sorgente, web app; un'app 1.3.0 vede la 1.3.1 sia da GitHub sia da Cloudflare. Link mandati.
  **Prossimo passo dell'autore**: installare la 1.3.1 su tutti i dispositivi, poi rendere privato il repository.

- **Versione 1.4.0** (2026-10-24): **firme, timbri, testi aggiunti, filigrane e numeri di pagina si eliminano anche dopo
  "Applica"** (Firma, Timbro, Aggiungi testo: si tocca l'oggetto sulla pagina → Elimina o ×; Filigrana e Numeri di
  pagina: elenco nel pannello), **firme digitali eliminabili una per volta**; sul telefono **pannello ingrandibile**
  (trascinando l'intestazione o con ⤢) e **caselle di Aggiungi testo grandi** (almeno 150×44 px, maniglie 16 px).
  Provato: 6 test nuovi del motore (anche pagine identiche al pixel dopo applica + elimina, risorse condivise, flussi
  condivisi fra pagine, pagina ruotata, dopo Oscura) con PyMuPDF 1.28.2 e 2.0 (81 passati, 2 saltati); nel browser
  con il motore desktop (anche in vista telefono con il tocco simulato) e con la web app per iPhone a 375 px (motore
  Pyodide): timbro, firma di testo, testo aggiunto, firma digitale e filigrana eliminati, pannello ingrandito e ridotto.
  Non provato su un telefono vero. **Release v1.4.0 pubblicata** (commit `9797d6e`): Release #10 riuscita in 7 minuti,
  sito Cloudflare aggiornato da solo 2 minuti dopo. Verificato senza login: 4 download da Cloudflare e da GitHub con
  le stesse dimensioni (MSI 131,6 MB, DMG 158,5 MB, AppImage 175,1 MB, APK 64,6 MB), sorgente, web app 1.4.0 in `/app/`,
  `versione-*.json` = 1.4.0 con le 4 novità. Link mandati.

- **Versione 1.5.0** (2026-10-30): **firme, timbri e testi già applicati si spostano e si ridimensionano** (trascinando
  sulla pagina; `move_applied`), **Vista** (una o due pagine, copertina da sola, verticale o orizzontale a libro) e
  **presentazione a schermo intero con Ctrl+L**; correzione delle immagini sulle pagine ruotate (firme, timbri,
  Immagini, filigrane di traverso; sfocato di Oscura della zona sbagliata). Provato: 11 test nuovi (88
  passati, 2 saltati con PyMuPDF 1.28.2 e 2.0); nel browser a 1280×800 (spostamento e ridimensionamento della firma,
  due pagine, libro con copertina, frecce, presentazione e uscita) e nella web app per iPhone a 375 px (menu Vista
  verso l'alto, libro, presentazione, firma spostata con il motore Pyodide); Ctrl+L nell'app desktop vera (finestra
  da 1440×900 a 1920×1080 e ritorno). Non provato su un telefono vero né lo scorrimento col dito vero nel libro.
  **Release v1.5.0 pubblicata** (commit `89d93ea`): Release riuscita in 7 minuti, sito Cloudflare aggiornato da solo
  subito dopo. Verificato senza login: 4 download da Cloudflare e da GitHub con le stesse dimensioni (MSI 131,8 MB,
  DMG 159,7 MB, AppImage 175,2 MB, APK 64,6 MB), sorgente, web app 1.5.0 in `/app/`. Link mandati, con l'analisi
  della facilità d'uso (pagina Artifact e capitolo 10 del Word: 5 proposte, consigliate la 5 e la 3, poi la 1).

- **Versione 1.6.0** (2026-10-30): l'autore ha scelto 💎 e le strade A, B, C, D, E (`docs/facilita-uso.md`):
  schermata "Cosa vuoi fare?" con sei compiti e file recenti, modalità Semplice (sei pulsanti con la scritta, sul
  telefono barra in basso) e Completa, guide 1-2-3 offerte la prima volta, niente "Applica" (firme, timbri, immagini,
  forme e spunte al tocco e selezionate; testo quando si lascia la casella, riapribile), Salva evidenziato, parole
  semplici, indicazione sopra la pagina, novità come avviso breve. Motore: testo aggiunto con testo e stile nel segno
  (`/X`), `add_text` con `remove`, immagini inserite come oggetti applicati (89 passati, 2 saltati con PyMuPDF 1.28.2
  e 2.0). Provato nel browser a 1280×800 e nella web app a 375 px (Pyodide). Non provato su un telefono vero.
  **Release v1.6.0 pubblicata** (commit `da51c94`): Release riuscita in 7 minuti, sito Cloudflare aggiornato da solo
  subito dopo. Verificato senza login: 4 download da Cloudflare e da GitHub con le stesse dimensioni (MSI 131,8 MB,
  DMG 159,8 MB, AppImage 175,2 MB, APK 64,1 MB), sorgente, web app 1.6.0 in `/app/`. Link mandati; pagina
  dell'analisi aggiornata con le scelte realizzate.

- **Dominio dell'autore** (2026-10-30): il sito degli aggiornamenti è su **https://pdfz.agjin.com/** (dominio
  personalizzato del progetto Pages, `UPDATE_BASE_URL` cambiata dall'autore); `https://pdfz.pages.dev/` resta attivo per le
  app dalla 1.3.1 alla 1.6.0 e **non va spento né reindirizzato**. La pagina ha link relativi (`sito_aggiornamenti.py`),
  così da iPhone e iPad la web app si apre sull'indirizzo da cui si è entrati. **Versione 1.6.1** compilata con il nuovo
  indirizzo (`docs/cloudflare-aggiornamenti.md`).

## Punti aperti

1. **Copia di riserva della chiave Android**: `C:\Dev\PDFz-chiave-android` (`pdfz-release.jks` + `password.txt`, creata
   il 2026-10-16, impronta SHA-256 `2D:2F:3F:BC:…:A6:83:D3:D6`, valida fino al 2054) va copiata in un posto sicuro;
   `keystore-base64.txt` si può cancellare. Secrets GitHub già impostati.
2. **Avviso e download provati solo dal motore**: manca la prova su un PC/telefono vero con la 1.0.1 installata
   (campanella → Scarica → installazione sopra).
3. **Repository privato e sito su Cloudflare** (preparati il 2026-10-22, `docs/cloudflare-aggiornamenti.md`): l'autore
   crea account, archivio R2 `pdfz-installer`, token, secrets `CLOUDFLARE_API_TOKEN`/`CLOUDFLARE_ACCOUNT_ID` e variabili
   `CLOUDFLARE_PAGES` = `true`, `UPDATE_BASE_URL` = `https://pdfz.pages.dev/`; prova con "Run workflow" (tag v1.3.0);
   poi **versione ponte** e solo dopo il repository privato. Web app per iPhone in `https://<sito>/app/`. Da provare su un iPhone vero (schermata Home, Condividi › "Salva in File",
   memoria con PDF grandi). L'indirizzo va deciso prima di distribuirla (i dati dell'app restano legati all'indirizzo).
4. **Verifica dei marchi registrati** per l'icona 24 e il nome PDFz prima di pubblicare (TMview, WIPO Global Brand
   Database, store: vedi `docs/branding.md`). Un foglio con "PDF" ricorda l'icona generica dei file PDF.
5. **Firma del codice** assente (Authenticode Windows, notarizzazione Apple): SmartScreen e Gatekeeper mostrano un avviso.
6. Non provate dopo le modifiche: chiusura nella finestra desktop vera e l'errore di salvataggio con pywebview vero.
7. **PyMuPDF 2.0** (unito per la 1.2.0): "Sblocca moduli" scrive `/Ff` direttamente sul widget e sui campi padre (la 2.0
   separa campo e widget e `Widget.update()` non salva `field_flags` sui widget figli); limite `pymupdf>=1.26,<3`.
   La pipeline installa la 2.0 (release 1.2.0); il venv del PC resta sulla 1.28.2 finché non lo si aggiorna. Android resta sulla 1.28.2:
   per la 2.0 non c'è la ruota WebAssembly. Dettagli in `docs/problemi-risolti.md`.
8. **Nuove finestre (1.1.0) e schede fra finestre** da provare su macOS (Cocoa) e Linux (finestra del browser), e con il
   mouse fra due finestre vere su Windows. La cartella locale
   `vendor/lingue` (2 GB, ignorata da git) non serve più e si può cancellare.
9. Note minori: negli strumenti che producono solo un file (conversioni) cambiare un'opzione e uscire fa comparire la domanda
   "applicare?"; nei Commenti non è coperto il testo di una nota ancora in scrittura sulla pagina.
10. Un hook del team (`hd-dev`) blocca i nuovi confronti con la modalità di build di Vite (`MODE`) nel codice, anche
   nei testi: usare variabili `VITE_*` nei file `frontend/.env.<modalità>` (come `VITE_WEB_APP`).
11. **Oggetti applicati prima della 1.4.0**: non hanno il segno e non si eliminano con "Elimina" (firme e timbri come
   immagine: strumento Immagini; firme e timbri di testo: Oscura). Dopo "Ridimensiona pagine" (la pagina diventa un
   oggetto dentro una pagina nuova) gli oggetti applicati prima non si ritrovano più. Pannello ingrandibile e caselle
   di testo grandi provati solo in vista telefono nel browser.
12. **Presentazione sull'iPhone**: Safari non ha lo schermo intero per le pagine (solo per i video): la presentazione
   copre la pagina dell'app ma restano le barre di Safari, salvo nella web app aggiunta alla Home. Il libro su
   Android/iPhone (scorrimento col dito con aggancio) è provato solo con il mouse in vista telefono.
13. **Facilità d'uso (1.6.0)**: da provare con persone non esperte (la parte "prova con 5 persone" della strada 💎 la fa
   l'autore). Compilare i moduli con campi veri (AcroForm) non c'è ancora: "Compila un modulo" usa Scrivi e Spunta.
   Le modifiche fatte prima della 1.6.0 a un testo aggiunto non si riaprono (manca lo stile nel segno): si spostano o
   si eliminano.
