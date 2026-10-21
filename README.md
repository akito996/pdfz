# PDFz

Editor PDF open source che lavora **interamente in locale**: visualizza, modifica, firma, converte e protegge i PDF
senza che nessun file lasci il dispositivo (niente cloud, niente account). Per Windows, macOS, Linux, Android e iPhone/iPad.

Autore: **agjin** · Licenza: **GNU AGPL-3.0** · Codice: <https://github.com/akito996/pdfz>

## Scaricare

Gli installer di ogni versione sono nella pagina **Releases**: <https://github.com/akito996/pdfz/releases/latest>

| Piattaforma | File | Note |
|---|---|---|
| Windows 10/11 (64 bit) | `PDFz-X.Y.Z-x64.msi` | l'applicazione, con tutte le funzioni |
| macOS (Apple Silicon) | `PDFz-X.Y.Z-macOS-arm64.dmg` | trascinare l'app in Applicazioni; il primo avvio su un altro Mac va confermato (vedi sotto) |
| Linux (x86_64) | `PDFz-X.Y.Z-x86_64.AppImage` | un solo file: `chmod +x` e doppio clic |
| Android | `PDFz-X.Y.Z-android.apk` | da installare consentendo le "origini sconosciute" |
| iPhone / iPad | `PDFz-X.Y.Z-iOS.ipa` | non è nelle Releases: si compila su un Mac con Xcode (`docs/macos-linux-iphone.md`) |

Quando esce una versione nuova l'app la segnala nella **campanella** (Windows, macOS, Linux, Android), con le novità
e il pulsante Scarica. Le novità di ogni versione sono in `CHANGELOG.md`.

## Requisiti

| Piattaforma | Serve | Facoltativo |
|---|---|---|
| Windows 10/11 x64 | Edge WebView2 Runtime (già presente in Windows 10 aggiornato e Windows 11) | Microsoft Office (conversioni più fedeli), LibreOffice |
| macOS 11 o più recente, Apple Silicon | — | OCR: `brew install tesseract tesseract-lang`; `brew install ghostscript` (compressione avanzata, PDF/A) |
| Linux x86_64 (glibc come Ubuntu 24.04 o più recente: Debian 13+, Fedora 40+, Mint 22+) | Chrome, Chromium o Edge (altrimenti si apre il browser predefinito) | `tesseract-ocr tesseract-ocr-ita`, `ghostscript`, `libreoffice` |
| Android | "Android System WebView" aggiornato (137 o più recente per la firma con certificato) | — |

## Funzioni

| Area | Strumenti |
|---|---|
| **Modifica** | Forme (rettangolo, ovale, segmento, freccia), Spunta e X per i moduli, Modifica testo e Aggiungi testo stile Acrobat (clic sulla pagina, si scrive direttamente nella casella, spostabile e ridimensionabile; carattere, dimensione, colore e allineamento dal pannello), Immagini (inserimento a dimensione originale, ridimensionamento sul foglio o in px/cm/%, opacità, ripetizione su tutte le pagine, dietro al contenuto, rimozione di quelle già presenti), Allega file, Filigrana, Timbro, Oscura (copri, sfoca leggera o sfoca forte; aree, parole, email, IBAN, codici fiscali, P.IVA, telefoni, regex) |
| **Pagine** | Unisci, Organizza (griglia con selezione multipla, trascina, ruota, duplica, elimina, estrai, pagina bianca, inserisci pagine da altri PDF col riquadro **+**), Estrai, Rimuovi, Ruota, Ritaglia, Ridimensiona (con vista a miniature e selezione tutte/nessuna/pari/dispari/intervalli), Numeri di pagina, Crea indice |
| **Firma e sicurezza** | File firmati .p7m/.p7s (verifica stile ArubaSign con elenco CA AgID, revoca OCSP/CRL, marca temporale, estrazione del documento, rapporto PDF), Firma disegnata, da immagine (3 firme salvate sul dispositivo) o da testo, inserita con un clic alla sua dimensione e ridimensionabile; firma digitale con certificato .pfx/.p12 (PAdES), Aggiungi/Rimuovi password, Rimuovi firma digitale, Sanitizza, Sblocca moduli, Appiattisci |
| **Ottimizza e analizza** | Comprimi, Confronta, OCR, Info complete, Convalida |
| **Revisione** | Commenti e revisioni (note, evidenziazioni, proposte di modifica, risposte, stati), Modifica proprietà, Modifica indice (segnalibri) |
| **Converti** | PDF → Word, Excel, PowerPoint, ODT/ODS/ODP, RTF, CSV, TXT, HTML, PNG/JPG, PDF/A. Office/immagini/testo/HTML/XPS/EPUB → PDF |

Inoltre: menu strumenti con **Preferiti**, etichette e sezioni comprimibili; tema chiaro/scuro/sistema e **5 temi colore**
(Rubino, Oro, Onice, Avorio, Bordeaux) dal menu **Tema**; pannello **download** in alto a destra (come in Chrome) con i file
salvati e convertiti; schede multiple (con 2 o più schede, una scheda trascinata fuori dalla finestra, o "Sposta in una
nuova finestra" dal tasto destro, si apre in una finestra nuova; trascinata su un'altra scheda cambia posto); annulla/ripeti illimitato (<kbd>Ctrl</kbd>+<kbd>Z</kbd>/<kbd>Y</kbd>); ricerca nel testo;
miniature; stampa; apertura di PDF protetti; "Apri con" da Esplora file; istanza singola.

Le conversioni Office usano **Microsoft Office** se è installato (massima fedeltà); se manca, LibreOffice;
per PDF → Word/Excel/PowerPoint c'è comunque un motore integrato.

**Android e iPhone/iPad.** Ci sono quasi tutti gli strumenti: modifica, pagine, firma (immagine e certificato), commenti,
OCR (Tesseract WebAssembly), conversioni in Word/Excel/PowerPoint/testo/immagini, protezione, oscuramento, confronto, file `.p7m`,
"Scatta foto" per creare un PDF dalle foto. Mancano **PDF/A** e la compressione con Ghostscript, le conversioni **ODT/ODS/ODP** e da Office a PDF (servono LibreOffice o Office).
L'APK pesa circa 90 MB.

## Architettura

```
┌──────────────────── PDFz.exe ────────────────────┐
│  Finestra nativa (pywebview + Edge WebView2)      │
│   └─ Interfaccia React + PDF.js  (frontend/)      │
│         │ HTTP su 127.0.0.1, porta casuale,       │
│         │ token segreto generato a ogni avvio     │
│  Server locale FastAPI  (backend/hdpdf/)          │
│   └─ strumenti: PyMuPDF · pyHanko · pdf2docx ·    │
│      pdfplumber · openpyxl · python-pptx · OCR    │
│      Tesseract integrato · Office COM · Ghostscript│
└───────────────────────────────────────────────────┘
```

* Ogni operazione crea una nuova versione del documento: così funzionano annulla/ripeti e il
  documento originale su disco non viene mai toccato finché non si salva.
* I file di lavoro stanno in `%TEMP%\PDFz-work\sessione-*` e vengono cancellati alla chiusura.
* Log: `%LOCALAPPDATA%\PDFz\hdpdf.log`.
* Su Android e iPhone lo stesso motore Python gira dentro l'app con Pyodide (WebAssembly), tutto offline.
* Nel codice il nome interno resta `hdpdf` (pacchetto Python, variabili `HDPDF_*`): non è visibile agli utenti.

```
backend/hdpdf/
  server.py        API locale
  desktop.py       finestra, dialoghi Apri/Salva, istanza singola
  fonts.py         catalogo caratteri (14 standard PDF + font installati in Windows)
  tools/pages.py   unisci, estrai, rimuovi, organizza, ruota, ritaglia, ridimensiona, numeri, indice
  tools/content.py modifica/aggiungi testo, immagini, allegati, filigrana, timbro, firma grafica, oscura
  tools/security.py password, firma digitale, rimozione firma, sanitizza, moduli, appiattisci, convalida
  tools/optimize.py compressione
  tools/compare.py confronto
  tools/meta.py    proprietà, segnalibri, info
  tools/convert.py conversioni
  tools/ocr.py     OCR
  tools/annots.py  forme, commenti e revisioni
  p7m.py           file firmati CAdES (.p7m/.p7s), elenco CA AgID, rapporto di verifica
  aggiornamenti.py avviso di nuova versione (GitHub Releases)
backend/tests/     test automatici di tutti gli strumenti
frontend/src/      interfaccia (tools.ts = elenco strumenti e relativi campi)
mobile/            app Android/iPhone (Capacitor + Pyodide)
packaging/         PyInstaller, WiX (MSI), script di build, icone
```

## Compilare

Il repository di lavoro è in `C:\Dev\10_PDFz` (percorso senza "&" e fuori da cartelle sincronizzate nel cloud).
Gli script copiano il progetto in una cartella di build e compilano lì:

```powershell
# Windows (prerequisiti: Python 3.11/3.12 x64, Node.js 20+, .NET SDK 8 per WiX)
.\packaging\copia-e-build.ps1 -Piattaforma windows      # → C:\Build\PDFz-Windows\dist\PDFz-<versione>-x64.msi
.\packaging\copia-e-build.ps1 -Piattaforma android      # → C:\Build\PDFz-Android\dist\PDFz-<versione>-android.apk
.\packaging\copia-e-build.ps1 -Piattaforma linux        # in WSL → C:\Build\PDFz-Linux\dist\PDFz-<versione>-x86_64.AppImage
```

La build Windows produce un solo MSI. Opzione di `build-windows.ps1`: `-WithGhostscript` (compressione avanzata e PDF/A).

```bash
# sul Mac
./packaging/copia-e-build.sh macos                      # → ~/Build/PDFz-macOS/dist/PDFz-<versione>-macOS-arm64.dmg
./packaging/copia-e-build.sh ios                        # → ~/Build/PDFz-iOS/dist/
```

A ogni tag `X.Y.Z` (o `vX.Y.Z`, uguale a `__version__` in `backend/hdpdf/__init__.py`) la pipeline di GitHub
(`.github/workflows/release.yml`) compila Windows, macOS Apple Silicon, Linux e Android e pubblica la GitHub Release.

Dettagli, opzioni e prerequisiti:
- `docs/build-e-test.md`: build Windows e Android, test, pipeline, chiave di firma Android;
- `docs/macos-linux-iphone.md`: Mac, Linux (anche da Windows con WSL), iPhone;
- `docs/avviso-nuova-versione.md`: come l'app trova le versioni nuove;
- `docs/installer-e-aggiornamenti.md`: come si comporta l'installer Windows.

## Distribuzione sui PC Windows

```bat
msiexec /i PDFz-1.1.0-x64.msi /qn                    :: silenziosa
msiexec /i PDFz-1.1.0-x64.msi /qn DESKTOPSHORTCUT=0  :: senza icona sul desktop
msiexec /i PDFz-1.1.0-x64.msi /qn HDSCOPE=user       :: solo per l'utente corrente
msiexec /i PDFz-1.1.0-x64.msi /qn HDCONTEXTMENU=0    :: senza la voce nel menu del tasto destro
msiexec /x PDFz-1.1.0-x64.msi /qn                    :: disinstallazione
```

* Installazione per tutti gli utenti in `C:\Program Files\PDFz`, collegamento nel menu Start.
* **Disinstallazione completa**: oltre ai file del programma vengono eliminati, per tutti i profili utente,
  `%LOCALAPPDATA%\PDFz` (log, firme salvate, cache) e `%LOCALAPPDATA%\Temp\PDFz-work`.
  Durante un aggiornamento questi dati vengono invece mantenuti.
* Le versioni nuove di PDFz sostituiscono quella installata (stesso UpgradeCode, versione più alta).
  PDFz ha identificativi propri: eventuali installazioni del vecchio programma da cui deriva restano accanto e si
  disinstallano a parte.
* Reti gestite (Intune, GPO): app "Line-of-business" con l'MSI, oppure Win32 app con i comandi sopra.
* **Programma predefinito per i PDF**: Windows non lo consente agli installer. Usare
  `packaging\default-app-associations.xml` via GPO, Intune o `Dism /Online /Import-DefaultAppAssociations`.

## Sviluppo

```bash
# backend
cd backend && python -m venv .venv && . .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements-dev.txt
python -m pytest -q                      # test di tutti gli strumenti
python -m hdpdf --server                 # API + UI su http://127.0.0.1:8765

# frontend (in un altro terminale)
cd frontend && npm install && npm run dev   # http://localhost:5173 con proxy verso l'API
npm run build                               # produce frontend/dist, servita dal backend

# app Android provata nel browser del PC
cd mobile && npm run build && npm run serve  # http://localhost:8790
```

Le novità mostrate nella campanella vengono da `frontend/src/novita.json`: a ogni versione si aggiunge in cima una voce
con il tipo di modifica (`nuovo`, `modifica`, `correzione`, `installer`, `ottimizzazione`, `rimosso`), le piattaforme e
il punto dell'app (`dove`).

Sugli script di build Windows valgono regole precise (niente cmd.exe, `node.exe`/`java.exe` diretti, npm con
`--ignore-scripts`): vedi `docs/build-e-test.md`.

Per aggiungere uno strumento: una funzione con `@tool("nome")` in `backend/hdpdf/tools/`, un test in
`backend/tests/`, e una voce in `frontend/src/tools.ts` (i campi del pannello sono generati da lì).

**Marchio**: colori, icone, favicon e temi colore (e come cambiarli) sono descritti in `docs/branding.md`.
**Caratteri personalizzati**: mettere i file .ttf/.otf nella cartella `fonts/` alla radice prima della build.

## Limiti noti e sviluppi possibili

* **Modifica testo**: lavora per blocchi di testo (span). Se il carattere originale è incorporato solo
  in parte (subset) e mancano lettere, viene usato il font installato più simile. I PDF scansionati
  vanno prima passati all'OCR.
* **Firma digitale**: supporta certificati software .pfx/.p12. Smart card e token (CNS, firma remota
  dei provider italiani) richiedono un'estensione PKCS#11 o l'integrazione con l'API del provider.
* **File .p7m**: l'attendibilità si basa sull'elenco italiano AgID (TSL-IT); firme di certificatori esteri risultano
  "valide con avvisi". La firma XML dell'elenco non viene verificata (lo si scarica in HTTPS dal sito AgID).
  Le controfirme vengono segnalate ma non verificate. Serve internet per aggiornare l'elenco e per il controllo di revoca.
* **Convalida firme**: verifica integrità e validità crittografica; l'attendibilità della catena
  rispetto alla lista europea dei certificatori (EUTL) non è ancora implementata.
* **PDF/A**: la conversione usa Ghostscript; la convalida formale richiede veraPDF installato.
* **Moduli XFA** (dinamici): vengono convertiti in moduli standard alla rimozione del blocco.
* **macOS**: il DMG non ha la firma Apple (firma "ad hoc"): su un altro Mac il primo avvio si fa con tasto destro → Apri
  (macOS 15: Impostazioni di Sistema → Privacy e sicurezza → **Apri comunque**). L'MSI non ha firma Authenticode.

## Licenza

GNU AGPL-3.0 (vedi `LICENSE` e `THIRD-PARTY-NOTICES.md`): richiesta dal motore PDF MuPDF.
Chi distribuisce l'app (anche modificata) o la offre come servizio in rete deve rendere disponibile il codice sorgente
(repository <https://github.com/akito996/pdfz>).

© 2026 agjin
