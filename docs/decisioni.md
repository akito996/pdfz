# Registro delle decisioni

**Non cancellare** le vecchie decisioni; se una decisione cambia, aggiungerne una nuova che la sostituisce.
Le decisioni per cui si sono valutate più strade hanno una sezione propria, con le tre opzioni
(💎 Prestazione / ⚖️ Qualità/Prezzo / 🆓 Economica), la scelta e il motivo. Le altre hanno una riga nella tabella più sotto.

## 2026-10-16 — PDFz 1.0.0

### a) Nuovo marchio PDFz e identificativi nuovi

- 💎 **Prestazione:** nuovo marchio e identificativi nuovi su tutte le piattaforme, più una migrazione guidata di
  impostazioni, preferiti e firme salvate dal vecchio programma.
- ⚖️ **Qualità/Prezzo:** nuovo marchio **PDFz** (autore/editore `agjin`) con identificativi nuovi: UpgradeCode MSI nuovo,
  applicationId Android e bundle id macOS/iPhone `com.agjin.pdfz`, chiave di firma Android `pdfz-release.jks` dell'autore,
  registro Windows `Software\agjin\PDFz`. Nessuna migrazione: PDFz si installa accanto al vecchio programma.
- 🆓 **Economica:** cambiare solo nomi e grafica, riusando UpgradeCode, applicationId e chiave di firma vecchi.
- **Scelta: ⚖️.** La chiave di firma Android vecchia non è dell'autore (e senza la stessa chiave Android non accetta
  comunque l'aggiornamento); un prodotto nuovo non deve sostituire quello vecchio sui dispositivi dove è installato.
  La migrazione non vale il lavoro: preferiti e impostazioni si rifanno in pochi minuti.
  Sostituisce la decisione del 2026-10-08 sulla chiave di firma Android. PDFz riparte dalla versione **1.0.0**
  (formule di MSI e versionCode invariate).

### b) Canale degli aggiornamenti

- 💎 **Prestazione:** sito proprio con CDN (dominio, pagina di download, file distribuiti in tutto il mondo): massimo
  controllo e velocità, ma costi fissi e manutenzione.
- ⚖️ **Qualità/Prezzo:** bucket cloud (Google Cloud Storage o Amazon S3) con lettura pubblica: affidabile e poco costoso,
  ma servono un account cloud, permessi e una chiave per la pipeline.
- 🆓 **Economica:** **GitHub Releases**: la pipeline le crea già a ogni tag; indirizzo fisso
  `https://github.com/akito996/pdfz/releases/latest/download/`.
- **Scelta: 🆓 GitHub Releases.** Gratuito, niente account o chiavi in più; installer e `versione-*.json` stanno nella
  stessa release, quindi sono sempre della stessa versione. Limite: funziona solo se il repository (o l'indirizzo scelto)
  è pubblico; con la variabile di repository `UPDATE_BASE_URL` si può cambiare indirizzo senza toccare il codice.
  Sostituisce la decisione del 2026-10-08 (bucket Google Cloud Storage).

### c) Storia git ripartita da zero nel nuovo repository

- 💎 **Prestazione:** riscrivere la storia vecchia (es. `git filter-repo`) togliendo marchio e dati da tutti i commit e
  pubblicarla: si conserva tutto, ma è lungo e rischioso (file vecchi, messaggi, autori: è facile dimenticare qualcosa).
- ⚖️ **Qualità/Prezzo:** nuovo repository `akito996/pdfz` con **un solo commit iniziale** firmato `agjin`; la storia
  vecchia resta solo in locale, nel repository precedente.
- 🆓 **Economica:** pubblicare il repository vecchio così com'è, cambiando solo i file attuali.
- **Scelta: ⚖️.** Non si pubblicano il marchio e i dati presenti nei commit vecchi; un solo commit pulito è facile da
  controllare. Se serve sapere perché una cosa è fatta così, la storia vecchia si consulta in locale.

### d) Nomi interni `hdpdf` tenuti

- 💎 **Prestazione:** rinominare anche i nomi interni (pacchetto Python `hdpdf`, variabili `HDPDF_*`, intestazione
  `x-hdpdf-token`, funzioni `window.hdpdf*`, impostazioni salvate) in `pdfz`, con migrazione delle impostazioni.
- ⚖️ **Qualità/Prezzo:** tenere i nomi interni `hdpdf` e cambiare tutto ciò che vede l'utente (nomi, icone, cartelle,
  file degli installer, identificativi).
- 🆓 **Economica:** cambiare solo i testi dell'interfaccia, lasciando vecchi anche cartelle, nomi dei file e identificativi.
- **Scelta: ⚖️.** Rinominare i nomi interni tocca centinaia di punti e le impostazioni salvate, senza nessun beneficio per
  l'utente (non li vede). Eventuale rinomina futura, in una versione dedicata.

### e) Temi colore come "palette" su variabili CSS

- 💎 **Prestazione:** editor dei temi nell'app (ogni colore scelto dall'utente, anteprima, temi salvati e condivisibili).
- ⚖️ **Qualità/Prezzo:** 5 palette (Rubino, Oro, Onice, Avorio, Bordeaux), ognuna in versione chiara e scura, fatte con
  variabili CSS; si scelgono dal menu **Tema** (insieme a chiaro/scuro/sistema) e restano salvate nelle impostazioni.
- 🆓 **Economica:** un solo tema con i colori del marchio, più chiaro/scuro.
- **Scelta: ⚖️.** Dà scelta senza complicare l'app: aggiungere una palette nuova = un blocco CSS + una riga nell'elenco
  (come si fa: `branding.md`).

### f) Avvisi e domande solo con le finestre dell'app

- 💎 **Prestazione:** finestre native di ogni piattaforma (Windows, macOS, Android, iPhone) con gli stessi testi: aspetto
  "di sistema", ma codice diverso per piattaforma e scelte multiple non sempre possibili.
- ⚖️ **Qualità/Prezzo:** solo la finestra dell'app (`ConfirmDialog`): niente `window.alert`/`confirm`/`prompt` né finestre
  di sistema; gli errori del motore desktop tornano alla pagina come eccezioni e li mostra la finestra dell'app.
- 🆓 **Economica:** lasciare `window.alert`/`confirm`/`prompt` e le finestre di pywebview dove ci sono già.
- **Scelta: ⚖️.** Stesso aspetto, tema e testi su tutte le piattaforme; le finestre del browser sembrano messaggi
  "JavaScript" e non si possono personalizzare (vedi `problemi-risolti.md`, 1.0.0). Restano due eccezioni che non si
  possono evitare: la finestra di sistema come riserva quando la pagina non risponde alla chiusura dell'app, e l'avviso
  del browser "Lasciare il sito?" nella versione Linux (che gira nel browser).

### g) iPhone senza App Store: web app da aggiungere alla schermata Home

- 💎 **Prestazione:** l'app iOS nativa già pronta (Capacitor + Pyodide) distribuita con TestFlight/App Store: serve un
  Mac e l'Apple Developer Program (99 €/anno); in cambio "Apri con", accesso ai file e più memoria.
- ⚖️ **Qualità/Prezzo:** **web app installabile** (PWA) fatta con la stessa build mobile: manifest, service worker
  scritto a mano (uso offline dopo il primo avvio, avviso di nuova versione con la finestra dell'app), salvataggio
  con il menu Condividi (`navigator.share` con il file). Gratuita, aggiornamenti senza revisione di Apple.
- 🆓 **Economica:** lo stesso sito da aprire in Safari, senza installazione né uso offline.
- **Scelta: ⚖️** (richiesta dell'utente). Limiti accettati: niente "Apri con", primo caricamento di circa 79 MB,
  memoria di Safari, dati locali che iOS può cancellare (`web-app-iphone.md`). Il service worker è scritto a mano
  (circa 120 righe) invece di usare Workbox: nessuna libreria in più. L'app nativa resta possibile in seguito.
  Dove pubblicarla è ancora da decidere (sotto, "Decisioni ancora aperte").

### Altre decisioni del 2026-10-16

- **Repository in `C:\Dev\10_PDFz`** (GitHub `akito996/pdfz`, ramo `main`): percorso senza "&" e fuori da cartelle
  sincronizzate nel cloud. `copia-e-build.ps1` / `.sh` copiano dalla radice del repository in `C:\Build\PDFz-Windows`,
  `C:\Build\PDFz-Android`, `~/Build/PDFz-Linux` (WSL), `~/Build/PDFz-macOS`, `~/Build/PDFz-iOS` e compilano lì.
  Restano le regole degli script (niente cmd.exe, node.exe/java.exe diretti, npm `--ignore-scripts`).
  Sostituisce il flusso del 2026-10-05 "si modifica nella cartella sincronizzata, si compila in una copia".
- **Web app riconosciuta con `VITE_WEB_APP`** (`frontend/.env.web`, build `vite build --mode web`) e non con un nuovo
  confronto su `import.meta.env.MODE`: una regola del team (hook `hd-dev`) blocca i nuovi rami di codice sulla modalità
  di build; i rami già esistenti per `android` e `ios` restano come sono.

## Registro (fino al 2026-10-08)

| Data | Versione | Decisione | Motivo |
|---|---|---|---|
| 2026-10 | 202610.001 | Versioni nel formato `AAAAMM.NNN` (+1 a ogni richiesta implementata, riparte da 001 ogni mese) | Scelta dell'utente: leggibile e sempre crescente (superata dalla 1.0.0) |
| 2026-10 | — | A ogni versione: `CHANGELOG.md` + `frontend\src\novita.json` (campanella) | Gli utenti vedono le novità nell'app |
| 2026-10 | — | Non modificare la ricerca SDK/Java di `build-android.ps1` | Modifica di auto-rilevamento rifiutata dall'utente |
| 2026-10 | — | Owner di un PDF protetto = utente del dispositivo/OS che lo ha protetto | Non esistono ruoli applicativi |
| 2026-10 | 202610.005 | Esclusi da PyInstaller pacchetti inutili; OpenCV solo headless; `aiohttp` NON escluso | App ~50 MB più leggera; aiohttp serve alla firma |
| 2026-10 | 202610.007 | Cartelle temporanee di build dentro il progetto (`build\...`), non in AppData | In `%TEMP%\pytest-of-<utente>` Windows poteva negare l'accesso |
| 2026-10-05 | 202610.008 | Negli script mai passare da cmd.exe; node.exe/java.exe diretti; npm con `--ignore-scripts` | "&" nel percorso rompe cmd.exe |
| 2026-10-05 | 202610.008 | Avviso aggiornamenti pronto ma spento; destinazione futura: bucket Google Cloud Storage | L'utente creerà lo spazio più avanti (superata il 2026-10-16: GitHub Releases) |
| 2026-10-05 | 202610.009 | Word (COM) salva in `%TEMP%`, poi si sposta il file quando è libero; download con attesa fino a 10 s | File .docx bloccati da Word, sincronizzazione cloud o antivirus |
| 2026-10-05 | 202610.009 | `backend\tests\_work` svuotata a ogni esecuzione dei test | ~600 file vecchi nella cartella sincronizzata |
| 2026-10-05 | 202610.009 | Installazione sempre **per tutti gli utenti**; "solo per me" solo senza permessi admin; negli aggiornamenti vale la scelta della prima installazione e non si passa `HDSCOPE` | Evitare doppie installazioni (soluzione Qualità/Prezzo, nessun codice) |
| 2026-10-05 | 202610.009 | Documentazione tecnica in `docs\` aggiornata a ogni modifica | Richiesta dell'utente: ritrovare facilmente le informazioni |
| 2026-10-05 | 202610.010 | Cartella di lavoro di PyInstaller in `%LOCALAPPDATA%` (eccezione alla regola "temp di build nel progetto", che resta valida per pytest e Android) | La sincronizzazione cloud bloccava `build\hdpdf` → WinError 5 (superata dalla 012) |
| 2026-10-05 | 202610.011 | Risultati e file di lavoro delle build in `C:\Build\<app>-Windows` e `C:\Build\<app>-Android`; cambiabile con `-OutDir` | Superata dalla 012 (interpretazione incompleta della richiesta) |
| 2026-10-05 | 202610.012 | **Si modifica nella cartella del progetto, si compila in una copia**: `copia-e-build.ps1` copia il progetto in `C:\Build\<app>-Windows` / `-Android` e compila lì; risultati in `<copia>\dist`. Sostituisce la 011 | Flusso già deciso dall'utente in una chat precedente (non era nell'handoff); il progetto stava in una cartella sincronizzata con "&" nel percorso (superata il 2026-10-16: repository in `C:\Dev\10_PDFz`, copie `C:\Build\PDFz-*`) |
| 2026-10-05 | 202610.013 | Mac, Linux e iPhone con lo stesso flusso "copia + build": `copia-e-build.sh` → `~/Build/<app>-<macOS/iOS/Linux>`; Linux da Windows in WSL (risultati in `C:\Build\<app>-Linux\dist`) | Richiesta dell'utente; WSL evita un PC Linux dedicato |
| 2026-10-05 | 202610.013 | iPhone = stessa app di Android (Capacitor iOS + Pyodide), versione `AAAA.M.N` e build `AAAAMM*1000+N` | Un solo codice per i due telefoni (numeri sostituiti dalla 1.0.0) |
| 2026-10-05 | 202610.013 | Avviso di nuova versione solo per Windows e Android; spento su macOS, Linux e iPhone | Non proporre mai il file di un'altra piattaforma; su iPhone gli aggiornamenti passano da TestFlight/App Store (superata dalla 1.0.0) |
| 2026-10-08 | 1.0.0 | Versioni `MAJOR.MINOR.PATCH` (si parte da 1.0.0; sostituisce `AAAAMM.NNN`). MSI `(100+MAJOR).MINOR.PATCH`, versionCode/build iPhone `1000000000+MAJOR*1000000+MINOR*1000+PATCH` | Scelta dell'utente; numeri degli installer sempre crescenti |
| 2026-10-08 | 1.0.0 | Build e pubblicazione con GitHub Actions a ogni tag (Windows, macOS Apple Silicon, Linux, Android); niente build per Mac Intel | Richiesta dell'utente; pikepdf e cryptography non hanno più pacchetti per Mac Intel |
| 2026-10-08 | 1.0.0 | Avviso di nuova versione dal bucket Google Cloud Storage per Windows, macOS, Linux e Android (iPhone escluso). Il repository GitHub resta privato | Un'app installata non può leggere le release di un repository privato senza token; sostituisce la decisione della 202610.013 (superata il 2026-10-16: GitHub Releases) |
| 2026-10-08 | 1.0.0 | APK firmato con una chiave di firma fissa (keystore fuori dal repository, nei secrets di GitHub) | Con la firma debug ogni build ha una firma diversa e i telefoni rifiutano l'aggiornamento (la chiave è diventata `pdfz-release.jks` il 2026-10-16) |
| 2026-10-08 | 1.0.0 | Modifiche non applicate e chiusura: la domanda la fa la pagina (finestra dell'app), non una finestra di sistema; la finestra desktop ferma la chiusura e chiama `window.hdpdfRequestClose` da un altro thread | Servono 3 scelte (Salva/Applica e salva, Esci senza salvare, Annulla) e il salvataggio passa dalla pagina; `evaluate_js` dentro l'evento di chiusura bloccherebbe la finestra |

| 2026-10-21 | 1.1.0 | Tolta la traduzione offline: strumento Traduci, motore CTranslate2/SentencePiece, pacchetti e MSI `PDFz-Lingue-*`. All'avvio l'app desktop cancella i modelli già scaricati in `<dati dell'app>\lingue` | Richiesta dell'utente: alleggerire l'app (installer, build e cartella `vendor` più piccoli) |
| 2026-10-21 | 1.1.0 | Scheda in una nuova finestra (con 2 o più schede: trascinata fuori dalla finestra o "Sposta in una nuova finestra" dal tasto destro). Il documento passa così com'è (modifiche non salvate, Annulla/Ripeti, percorso, password) con un **biglietto monouso** del motore (`POST/GET /api/schede`, scade in 2 minuti), mai nell'indirizzo. App desktop: ogni finestra ha la sua `Api` (modifiche e chiusura per finestra), `quit()` chiude solo la sua, l'app termina con l'ultima; "Apri con" va alla finestra aperta più vecchia. Linux (browser): `window.open`. Non su Android/iPhone (una sola finestra) | Richiesta dell'utente; password e documenti non devono finire nell'URL o nella cronologia |
| 2026-10-21 | 1.2.0 | Schede fra finestre già aperte: scheda trascinata su un'altra finestra di PDFz e "Riunisci qui le altre finestre" (tasto destro su una scheda). Le finestre si parlano con **BroadcastChannel** (`frontend/src/finestre.ts`, provato fra finestre pywebview); il documento passa dal motore con i biglietti di `/api/schede`. Una finestra rimasta senza schede perché le ha cedute si chiude. Con modifiche non applicate nello strumento la scheda attiva non si trascina (la domanda non si può fare durante il trascinamento) | Richiesta dell'utente ("reinserire e unificare in una sola finestra"); nessun canale nuovo nel motore |
| 2026-10-22 | 1.3.0 | Icona **24 "Foglio senza fondo"**: documento bianco con contorno nero, piega d'oro, "PDF" rosso, "z" nera, nessun fondo attorno (iPhone e icone adattive su bianco) | Indicazioni precise dell'utente dopo la 19 |
| 2026-10-22 | 1.3.0 | **Web app per iPhone unita al codice** e regola: ogni modifica vale anche per lei (stessa interfaccia e stesso motore; controllo con `build-web.mjs`); pubblicazione con GitHub Pages (`pages.yml`, variabile `PAGES_WEB_APP`), gratuita ora che il repository è pubblico | Richiesta dell'utente: "ogni modifica eseguita qui deve essere eseguita anche per iPhone" |
| 2026-10-22 | dopo 1.3.0 | **Aggiornamenti su Cloudflare** per il repository privato: pagina, `versione-*.json` e web app su Cloudflare Pages, installer nell'archivio R2 (serviti da una funzione, ultime 5 versioni), codice sorgente per l'AGPL; GitHub Pages tolto. Passaggio con una versione ponte prima di rendere privato il repository | Richiesta dell'utente (repository privato + pagina degli aggiornamenti su Cloudflare); ⚖️ gratuita, 💎 dominio proprio possibile in seguito |
| 2026-10-22 | 1.3.0 | A ogni release si mandano all'utente i link diretti di download di ogni sistema | Richiesta dell'utente |
| 2026-10-21 | 1.2.0 | Modifica testo cancella la riga originale con una **fascia sottile** all'altezza delle minuscole (dalla linea di base e dal corpo della riga, letti nel documento), non con il riquadro della riga; la fascia evita i riquadri delle altre righe. Il testo si riscrive nella stessa direzione della riga originale. Nell'anteprima la casella è trasparente e il bianco copre solo le lettere originali (`ink` di `text_spans`) | MuPDF toglie ogni lettera il cui riquadro tocca l'area: con caratteri dall'altezza dichiarata grande (Segoe Print, Javanese Text) o righe fitte spariva il testo attorno |

## Decisioni ancora aperte

- Repository `akito996/pdfz`: pubblico dalla 1.0.2 (serve all'avviso di nuova versione). Alternativa valutata: tornare
  privato e pubblicare gli installer da un secondo repository pubblico solo per i download.
- iPhone: come distribuirlo (TestFlight con Apple Developer Program 99 €/anno, oppure solo prove con Apple ID gratuito);
  intanto c'è la web app (decisione g).
- macOS/Linux: includere Tesseract nell'app invece di chiederlo installato sul computer.
- Voci solo tecniche fuori dalla campanella (piattaforma `"build"` in `novita.json`).
- Rendere impossibile la doppia installazione anche passando `HDSCOPE` a mano (modifica WiX).
- Eventuale rinomina dei nomi interni `hdpdf` (vedi d).
