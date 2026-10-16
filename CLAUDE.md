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
.venv/Scripts/python branding/genera_marchio.py --serie 4 --icona 17 --favicon 17
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
- **Aggiornamenti**: l'app legge `UPDATE_BASE_URL` (scritto prima della build da `packaging/imposta-url-aggiornamenti.sh`):
  variabile di repository `UPDATE_BASE_URL` oppure `https://github.com/akito996/pdfz/releases/latest/download/`.
  Funziona solo con release pubbliche.
- **Script di build su Windows: mai passare da cmd.exe** (niente `npm run`, `npx`, `.cmd`, `.bat`): node.exe/java.exe diretti,
  npm con `--ignore-scripts`. Non modificare la ricerca SDK/Java di `build-android.ps1`.
- **Avvisi e domande solo con le finestre dell'app** (`ConfirmDialog` tramite `ask`/`askText`/`notify` del contesto):
  mai `window.alert/confirm/prompt` né finestre di sistema. Gli errori dell'app desktop si sollevano in Python come
  `AvvisoUtente` (`desktop.py`) e la pagina li mostra (`desktopCall` in `api.ts`). Uniche eccezioni: la conferma di
  sistema quando la pagina non risponde alla chiusura (`_ask_quit`) e "Lasciare il sito?" del browser su Linux.
- **Finestrelle dei pulsanti in alto** (Tema, Notifiche, Download e future): solo con `components/Popover.tsx` (disegnate
  in `<body>`, posizione fissa). Mai `position: absolute` dentro `.topbar`: sul telefono la barra scorre e le taglia.
- **Strumenti con "Applica"**: ogni pannello registra le modifiche non applicate con `usePending(dirty, def.label, apply)`
  (`apply` restituisce `true` se riuscito). L'app chiede Applica / Non applicare / Annulla quando si lascia lo strumento.
- **Chiusura dell'app desktop**: `desktop.py` ferma la chiusura e chiama `window.hdpdfRequestClose` da un altro thread; la pagina
  chiede salva/applica e poi chiama `api.quit()`. Mai `evaluate_js` dentro l'evento `closing` (blocca la finestra).
- **Colori**: solo variabili CSS (`--brand`, `--on-brand`, `rgba(var(--brand-rgb), …)`), mai codici del vecchio marchio o
  colori dell'interfaccia scritti a mano. Nuova palette: vedi `docs/branding.md`. Icone: solo da `branding/genera_marchio.py`.
- **Firma Android**: chiave `pdfz-release.jks` (alias `pdfz`) dell'autore, **mai nel repository**. Nella pipeline arriva dai
  secrets `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`; in locale dalle variabili `HDPDF_KEYSTORE*`.
- **Git**: si lavora in `C:\Dev\10_PDFz` (GitHub: `akito996/pdfz`, ramo `main`). Autore dei commit `agjin`
  (email noreply di GitHub, impostata nel repository locale). Commit e push solo quando l'utente lo chiede; messaggi in italiano.
  In locale si lavora sul ramo `pdfz` (storia nuova, collegato a `origin/main`). Il ramo locale `main` contiene la storia
  del progetto precedente: **mai da pubblicare** (contiene il vecchio marchio); si può rinominare o eliminare quando non serve più.

## Stato attuale (2026-10-16)

- Versione nel codice: **1.0.1** di PDFz. Marchio applicato ovunque: **icona e favicon 17 "Foglio oro"** (foglio PDF d'oro
  su rosso con "PDF" e la "z" piccola, nero solo per le finiture), palette predefinita Rubino,
  5 palette selezionabili, avvisi solo con le finestre dell'app (provati nel browser: Oscura, domanda annidata dopo
  "Applica", Salva con nome Android, errore di salvataggio desktop simulato). Test: 74 passati, 2 saltati.
- Prova WiX riuscita (MSI e pacchetto lingue compilano con i nomi nuovi); PyInstaller, Gradle, Xcode e AppImage non provati
  dopo il cambio di nome.
- Codice su GitHub `akito996/pdfz` (ramo `main`, storia nuova che parte dal commit iniziale di PDFz 1.0.0).
- **Release v1.0.0 pubblicata** (2026-10-16, pipeline riuscita in 12 minuti): Windows (MSI + 2 MSI lingue), macOS arm64 (DMG),
  Linux (AppImage) e i `versione-*.json`. **Android aggiunto** con "Re-run all jobs" dopo la chiave: APK firmato con la chiave
  di PDFz (61,6 MB, verificato nel registro della pipeline); note della release corrette. iPhone: nessuna build;
  si prepara una web app da aggiungere alla Home (sessione separata). Installer non provati su macchine vere.
- **Versione 1.0.1** (2026-10-16, tag `v1.0.1`): correzioni Android/tablet del menu Tema (tagliato dalla barra in alto) e
  della campanella (resta aperta, segna lette all'apertura, tutte le voci, messaggi recenti). Provate nel browser in vista
  telefono, non ancora su un telefono vero.
- Marchio: serie 1 (icone 1-5) scartata dall'utente perché simile a marchi esistenti e tolta dallo script; serie 2
  (6-10) e 3 (11-15) non scelte ma ancora disponibili; all'utente è piaciuta la 11 ("PDF" a capo, "z" piccola),
  messa in un foglio PDF nella serie 4 (16-18): scelta e applicata la **17** (inviata su GitHub).

## Punti aperti

1. **Copia di riserva della chiave Android**: `C:\Dev\PDFz-chiave-android` (`pdfz-release.jks` + `password.txt`, creata
   il 2026-10-16, impronta SHA-256 `2D:2F:3F:BC:…:A6:83:D3:D6`, valida fino al 2054) va copiata in un posto sicuro;
   `keystore-base64.txt` si può cancellare. Secrets GitHub già impostati.
2. **Repository pubblico o privato**: l'avviso di nuova versione funziona solo se le release sono pubbliche.
3. **Web app per iPhone** pronta sul ramo `claude/heuristic-austin-71ab67` (commit 79f9323, sessione separata): non ancora
   unita in `pdfz`/`main` né pubblicata; con repository privato niente GitHub Pages (vedi `docs/web-app-iphone.md` sul ramo).
4. **Verifica dei marchi registrati** per l'icona 17 e il nome PDFz prima di pubblicare (TMview, WIPO Global Brand
   Database, store: vedi `docs/branding.md`). Un foglio con "PDF" ricorda l'icona generica dei file PDF.
5. **Firma del codice** assente (Authenticode Windows, notarizzazione Apple): SmartScreen e Gatekeeper mostrano un avviso.
6. Non provate dopo le modifiche: chiusura nella finestra desktop vera e l'errore di salvataggio con pywebview vero.
7. Note minori: negli strumenti che producono solo un file (conversioni) cambiare un'opzione e uscire fa comparire la domanda
   "applicare?"; nei Commenti non è coperto il testo di una nota ancora in scrittura sulla pagina.
