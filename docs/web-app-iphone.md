# Web app per iPhone (PDFz senza App Store)

Aggiornato il 2026-10-22 (codice della 1.2.1, unita al progetto). Per l'iPhone non c'è una build pubblicata: l'app iOS con Xcode richiede un
Mac e, per distribuirla, l'Apple Developer Program (`macos-linux-iphone.md`). La **web app** è la stessa app mobile
(interfaccia + motore Python con Pyodide, quella di Android) servita come sito statico in https: su iPhone si aggiunge
alla schermata Home, si apre a tutto schermo come un'app e, dopo il primo avvio, funziona **senza internet**.

Stato: **unita al progetto, non ancora pubblicata**. Dal 2026-10-22 la web app sta nello stesso codice delle altre app
e **ogni modifica vale anche per lei** (richiesta dell'utente): stessa interfaccia (`vite --mode web`) e stesso motore
dell'app Android. Si pubblica su **Cloudflare**, insieme alla pagina degli aggiornamenti, in `https://<sito>/app/`
(`.github/workflows/cloudflare.yml`, vedi `cloudflare-aggiornamenti.md`): il repository diventerà privato e GitHub Pages
non sarebbe più gratuito.

## Come si installa sull'iPhone

1. Apri l'indirizzo della web app con **Safari** (da iOS 16.4 anche Chrome, Edge e Firefox per iPhone possono
   aggiungere alla schermata Home).
2. Tocca **Condividi** (il quadrato con la freccia) → **Aggiungi alla schermata Home** → **Aggiungi**.
   Il nome proposto è "PDFz" e l'icona è la 17 "Foglio oro".
3. Apri PDFz **dall'icona** e aspetta che la barra sottile in alto arrivi in fondo. Al primo avvio scarica circa
   **79 MB** (meglio con il Wi-Fi). Quando compare "PDFz è pronto anche senza internet." il motore è tutto nel telefono.

Safari e l'app aggiunta alla schermata Home hanno **memorie separate**: quello che si è scaricato aprendo il sito in
Safari non vale per l'app sulla Home. Conviene aggiungerla subito e fare il primo avvio dall'icona.
Aprendo il sito in Safari su iPhone l'app ricorda una volta, con un avviso, come aggiungerla alla schermata Home.

## Come si usa

- **Aprire un file**: pulsante **Apri** / **Scegli file** (app File, Foto o Fotocamera) oppure **Scatta foto**.
  Su iPhone le web app non compaiono nel menu "Apri con" delle altre app: i PDF si aprono solo da qui.
- **Salvare**: **Salva** e **Salva con nome** aprono il menu **Condividi** del sistema con il file: "Salva in File"
  (si sceglie la cartella, es. *Sul mio iPhone*), un'altra app, Mail, **Stampa**… Se il file ha richiesto un po' di
  tempo, iPhone non apre il menu da solo (serve un tocco recente): l'app mostra "File pronto" e basta toccare
  **Condividi**. Nel browser di un PC il file si scarica come al solito.
- **Aggiornamenti**: l'app controlla se c'è una versione nuova all'avvio, quando torna in primo piano e ogni ora. Se
  c'è, lo chiede con la sua finestra "Nuova versione di PDFz": **Aggiorna ora** ricarica l'app (i documenti aperti si
  chiudono: se ci sono modifiche non salvate la finestra lo dice), **Più tardi** la lascia partire da sola la volta
  dopo che l'app viene chiusa del tutto. Si riscaricano solo i file cambiati (di solito pochi MB).

## Limiti

- **Primo caricamento di circa 79 MB**: 2,5 MB di interfaccia (salvata subito) e 76 MB di motore (Pyodide, MuPDF,
  librerie Python, lingue OCR italiano e inglese), salvato al primo uso. Dopo, l'app si apre anche in aereo.
- **Niente "Apri con"** e niente PDFz nel menu Condividi delle altre app: iOS non lo permette alle web app.
- **Memoria limitata**: Safari dà a ogni pagina molta meno memoria di un'app installata. Con PDF molto grandi
  (centinaia di pagine, scansioni pesanti) l'app può ricaricarsi da sola e perdere i documenti aperti: dividere il
  PDF in parti o usare PDFz sul PC.
- **Documenti aperti solo in memoria**: se si passa a un'altra app per molto tempo iOS può chiudere PDFz; i documenti
  non salvati si perdono. Salvare prima di cambiare app.
- **Dati locali che iOS può cancellare**: impostazioni, firme salvate e file del motore stanno nella memoria del sito.
  Per un sito aperto solo in Safari iOS li cancella dopo 7 giorni di utilizzo di Safari senza visitarlo; per l'app
  sulla schermata Home contano solo i giorni in cui la si usa, ma iOS può comunque liberare spazio se il telefono è
  pieno o se l'app non si usa per molto tempo. L'app chiede di conservarli (`navigator.storage.persist`). Se spariscono,
  al primo avvio con internet il motore si riscarica; impostazioni e firme salvate vanno rifatte: tenere una copia dei
  certificati di firma fuori dall'app.
- **Elenco AgID** (verifica dei file firmati .p7m): il sito AgID non permette il download da una pagina web (CORS),
  quindi la web app usa la copia inclusa nella build, aggiornata a ogni nuova versione pubblicata.
- **Strumenti**: gli stessi dell'app Android (niente traduzione offline).
- **Indirizzo fisso**: i dati restano legati all'indirizzo della web app (`https://pdfz.agjin.com/app/` dalla 1.6.2;
  prima `https://pdfz.pages.dev/app/`, che resta attivo).
  Cambiare indirizzo dopo vuol dire reinstallarla sui telefoni e perdere impostazioni e firme salvate.

## Compilare e provare in locale

Prerequisiti: gli stessi dell'app Android (Node.js 20+, `npm ci --ignore-scripts` in `frontend` e in `mobile`).

```bash
# dalla cartella mobile (su Windows con node.exe diretto, mai npm run)
node scripts/build-web.mjs          # -> mobile/www-web (circa 79 MB)
node scripts/serve.mjs www-web      # -> http://localhost:8790
node scripts/build-web.mjs --solo-sw   # rifà solo sw.js dopo una modifica a mobile/web/sw.js
```

Nel browser del PC (Chrome o Edge): strumenti per sviluppatori → vista telefono; **Application → Manifest** mostra
nome, colori e icone; **Service workers** lo stato; **Cache storage** la cache `pdfz http://localhost:8790/` (52 file
di interfaccia + 59 del motore). Per la prova senza rete: spegnere `serve.mjs` (o "Offline" in Network) e ricaricare.

Per provarla su un iPhone vero serve **https** (il service worker funziona solo in https o su localhost): pubblicarla
(anche solo come anteprima su Cloudflare Pages) oppure aprire un tunnel https verso il PC, es.
`cloudflared tunnel --url http://localhost:8790`.

## Come è fatta

| File | Cosa fa |
|---|---|
| `frontend/.env.web` | `VITE_WEB_APP=1`: l'interfaccia sa di essere la web app (build `vite build --mode web`) |
| `frontend/vite.config.ts` | con `--mode web` scrive `manifest.webmanifest` (nome PDFz, `display: standalone`, colori, icone) e aggiunge in `index.html` le indicazioni per Safari (`apple-mobile-web-app-capable`, barra di stato, titolo) |
| `frontend/src/main.tsx` | avvio come l'app mobile (motore Pyodide in un Web Worker); nella web app senza `viewport-fit=cover`, così Safari lascia libere tacca e barra Home |
| `frontend/src/web/pwa.ts` | registra il service worker, avviso di nuova versione (finestra dell'app), completamento del motore per l'uso offline, `storage.persist()` |
| `frontend/src/android/files.ts` | salvataggio: menu Condividi con il file (`navigator.share({ files })`) sul telefono, download altrimenti |
| `frontend/src/App.tsx` | collega `pwa.ts` e `files.ts` alle finestre dell'app (`ask`) e agli avvisi (`toast`) |
| `mobile/web/sw.js` | modello del service worker |
| `mobile/scripts/build-web.mjs` | build completa: interfaccia (Vite) → motore (`prepare-engine.mjs --www`) → `sw.js` con versione ed elenco dei file; scrive anche `.nojekyll` e `_headers` (Cloudflare/Netlify) |
| `branding/genera_marchio.py` | icone `icon-192.png`, `icon-512.png`, `icon-maskable-192/512.png` (a tutta tela, per Android) e `apple-touch-icon.png` |
| `.github/workflows/cloudflare.yml` | pubblicazione su Cloudflare Pages in `/app/` dopo ogni release (vedi `cloudflare-aggiornamenti.md`) |

**Service worker** (`sw.js`): conosce ogni file della versione con l'impronta del suo contenuto (SHA-256) e lo salva
in una cache con la chiave `percorso?v=impronta`. All'installazione salva l'interfaccia; i file del motore li salva la
prima volta che servono e, quando il motore ha finito di caricarsi, la pagina gli chiede di scaricare anche quelli non
ancora usati (OCR…). Un file si salva solo se il contenuto ricevuto è quello atteso. Una versione nuova resta in attesa
finché l'utente non sceglie "Aggiorna ora"; quando si attiva cancella solo le voci che non esistono più, quindi i file
uguali non si riscaricano. Scritto a mano (circa 120 righe) invece di usare Workbox: nessuna libreria in più.
Perché funzioni, due build dello stesso codice devono dare gli stessi byte: `prepare-engine.mjs` scrive gli archivi che
rifà (librerie alleggerite e precompilate, `hdpdf.zip`) con una data fissa (`problemi-risolti.md`).

## Pubblicazione: 3 strade

Serve un sito **https** che serva file statici fino a 18 MB l'uno (il più grande è la libreria MuPDF per WebAssembly).

- 💎 **Prestazione: dominio proprio + CDN.** Es. `pdfz.<dominio>` (un dominio costa circa 10-15 €/anno) su una CDN
  (Cloudflare Pages o R2, Netlify, Vercel…). L'indirizzo non dipende da GitHub né dal servizio scelto: si può cambiare
  servizio senza che gli utenti reinstallino l'app. Si controllano le intestazioni HTTP (`_headers` è già nella build).
  Costo: il dominio e la configurazione del DNS.
- ⚖️ **Qualità/Prezzo: Cloudflare Pages, gratuito.** Indirizzo `https://<progetto>.pages.dev`.
  Limiti del piano gratuito adatti: file fino a 25 MB (il più grande è 18 MB), fino a 20.000 file (sono circa 110),
  500 build al mese. Due modi:
  1. *Collegamento a GitHub* (Cloudflare → Workers & Pages → Create → Pages → Connect to Git, autorizzando solo il
     repository `pdfz`): comando di build
     `cd frontend && npm ci --ignore-scripts && cd ../mobile && npm ci --ignore-scripts && node scripts/build-web.mjs`,
     cartella da pubblicare `mobile/www-web`, variabile `NODE_VERSION=22`.
  2. *Caricamento dalla pipeline* (il repository non viene collegato a Cloudflare): nel job di pubblicazione (ora `cloudflare.yml`), al posto di
     `upload-pages-artifact`/`deploy-pages`, il passo
     `npx wrangler@3 pages deploy mobile/www-web --project-name=pdfz --branch=main` con i secrets
     `CLOUDFLARE_API_TOKEN` (permesso "Cloudflare Pages: Edit") e `CLOUDFLARE_ACCOUNT_ID`.
  In seguito si può aggiungere un dominio proprio (strada 💎), ma l'indirizzo cambia: meglio deciderlo prima di
  distribuirla.
- 🆓 **Economica/Gratuita: GitHub Pages** (il repository è pubblico dalla 1.0.2). Indirizzo
  `https://akito996.github.io/pdfz/`. Il workflow `.github/workflows/pages.yml` è pronto: compila e pubblica a ogni tag
  `vX.Y.Z`. Per accenderlo (una volta, lo fa l'autore):
  1. Settings → Pages → Build and deployment → Source: **GitHub Actions**;
  2. Settings → Secrets and variables → Actions → Variables: `PAGES_WEB_APP` = `true`;
  3. al tag successivo (o con "Run workflow") la web app viene pubblicata.

**Scelta (2026-10-22): Cloudflare Pages** (⚖️), perché il repository diventa privato: la web app sta in `/app/` del sito degli aggiornamenti (`cloudflare-aggiornamenti.md`). Le altre strade restano descritte qui sopra.

Licenza: come per l'APK, la web app contiene MuPDF (AGPL-3.0): chi la usa ha diritto al codice sorgente
(`THIRD-PARTY-NOTICES.md`): con il repository pubblico il sorgente è già disponibile.

## Cosa è stato provato e cosa no

Provato il 2026-10-16 nel browser del PC in vista telefono (Chrome, 375×812), con la cartella servita da `serve.mjs`:
installazione del service worker e cache di tutti i 111 file; apertura di un PDF dal pulsante Apri; "Ruota PDF" e
"Numeri di pagina" applicati; salvataggio con il menu Condividi (simulato: il browser del PC non ce l'ha), anche con
il rifiuto "serve un tocco" e la finestra "File pronto"; download quando Condividi non c'è; server spento e pagina
ricaricata: l'app si apre, il motore riparte dalla cache, apre, modifica e salva; nuova versione → finestra
"Nuova versione di PDFz" → "Aggiorna ora": ricarica e solo il file cambiato riscaricato; manifest e icone letti dal browser.

**Da provare su un iPhone vero** (non disponibile): aggiunta alla schermata Home e aspetto a tutto schermo, menu
Condividi con il PDF e "Salva in File", spazio disponibile per i 79 MB, memoria con PDF grandi, barra di stato.
Pubblicazione su GitHub Pages o Cloudflare non eseguita.

Riprovato il 2026-10-22 dopo l'unione con il codice della 1.2.1 (build in una cartella di prova, browser del PC,
375×812): manifest con le icone della 24, service worker registrato, "PDFz è pronto anche senza internet", apertura di
un PDF, "Modifica testo" del motore nuovo (con `ink`) e `/api/schede` presenti, strumento Traduci assente. Corretto un
difetto dei telefoni stretti (anche Android): il nome della scheda nella barra in alto veniva schiacciato a 15 px e
finiva sopra la campanella (`styles.css`, fino a 420 px).
