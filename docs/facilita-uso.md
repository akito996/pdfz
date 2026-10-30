# Facilità d'uso (dalla 1.6.0)

Cinque cambiamenti decisi dopo l'analisi della facilità d'uso del 30 ottobre 2026 (capitolo 10 della documentazione
Word): **A** schermata iniziale, **B** modalità Semplice, **C** guide 1-2-3, **D** niente "Applica", **E** parole
semplici e piccoli difetti.

## A. Schermata iniziale "Cosa vuoi fare?"

`components/Inizio.tsx`, al posto di "Apri un documento" quando non c'è nessun documento aperto:

- sei riquadri (`COMPITI`, dalla 1.7.0 con l'icona a sinistra): Firma un documento, Compila o scrivi, Correggi un
  testo, Unisci più PDF, Riduci il peso, Trasforma in Word. Se il compito ha bisogno di un documento si apre prima la
  scelta del file, poi lo strumento (`dopoApertura` in `App.tsx`, valido 2 minuti);
- "Apri un PDF", "Tutti gli strumenti" (lo stesso menu della vista semplice: scelto uno strumento che ha bisogno di un
  documento, si apre prima il file), "Scatta foto" e i **file aperti di recente** (`recenti.ts`): nell'app desktop si ricorda il
  percorso; sul telefono, nella web app e per i file trascinati una copia resta sul dispositivo (IndexedDB
  `pdfz-recenti`, al massimo 6 file da 40 MB; dopo "Salva" sul telefono c'è la versione salvata). "Svuota l'elenco"
  cancella anche le copie.

## B. Vista semplice e vista completa

Si sceglie la prima volta (finestra "Come vuoi usare PDFz?") e si cambia con «Vista completa» (a destra della barra
della vista semplice), «Passa alla vista semplice» (sotto la ricerca del menu a sinistra) o dal menu ☀ (`ThemeMenu`,
voce Vista); chiave `hdpdf.modalita` (`semplice` | `completa`).

- **Vista semplice** (`components/Semplice.tsx`, aspetto della 1.7.0 preso dalle foto dell'autore): sei pulsanti con
  icona e nome, Firma · Scrivi · Modifica testo · Timbro · Evidenzia e note · Pagine, poi «Tutti gli strumenti».
  - computer: barra sotto quella in alto (`.app.con-barra`, righe `52px auto 1fr`), niente colonna a sinistra; sotto i
    1000 px i nomi corti (Correggi, Note, Tutti), sotto i 1120 px «Vista completa» solo icona;
  - telefono: barra in basso con i nomi corti e «Altro», sotto la barra pagina/zoom (`--barra-h`), nascosta mentre un
    pannello è aperto;
  - **«Tutti gli strumenti»** (`TuttiGliStrumenti`, in un `Popover` allineato a sinistra del pulsante, largo fino a
    960 px): ricerca in alto (cerca in nome, descrizione, `breve` e parole chiave; Invio apre il primo risultato; sul
    telefono niente tastiera all'apertura), poi le sezioni con nome e `breve` di ogni strumento, tre colonne sul
    computer e una sul telefono. Senza documento aperto, uno strumento che ne ha bisogno fa prima scegliere il file.
- **Vista completa**: il menu a sinistra di sempre (preferiti, etichette, sezioni) con «Passa alla vista semplice».
  Sul telefono il menu ☰ ha lo stesso pulsante («Passa alla vista completa» se si è nella semplice).

## C. Guide 1-2-3

`guide.ts` (contenuti) e `components/Guida.tsx` (riquadro con il passo e l'elemento evidenziato, classe `guida-qui`).
La prima volta che si apre uno strumento (o un compito della schermata iniziale) si chiede "Vuoi una guida veloce in
3 passi?" (No, grazie · Non chiedere più · Sì, mostrami); le guide viste sono in `hdpdf.guideViste`. Il "?" nella
testata del pannello riapre la guida in qualsiasi momento. Percorsi completi: firmare, compilare un modulo, unire;
guide brevi per gli altri strumenti principali; per gli altri una guida fatta dalla descrizione dello strumento.

## D. Niente "Applica"

Le modifiche vanno sul foglio da sole; resta solo **Salva**, che diventa un pulsante rosso con la scritta quando ci sono
modifiche da salvare.

| Strumento | Quando va sul foglio |
|---|---|
| Firma, Timbro, Immagini | appena si tocca la pagina; l'oggetto resta selezionato (si sposta e si ridimensiona: `move_applied`) |
| Forme, Spunta e X | appena disegnata; spostamento al rilascio, colore e spessore dopo mezzo secondo; resta selezionata |
| Aggiungi testo, Modifica testo | quando si lascia la casella (tocco fuori, un'altra casella, Esc): `useApplicaLasciando` in `context.ts` |
| Organizza pagine | con "Fatto" (che chiude lo strumento) o uscendo |
| Strumenti con il modulo (Comprimi, Ruota…) | con il pulsante con il verbo dell'azione; uscendo senza premerlo non succede niente |
| Oscura, Firma digitale | con il loro pulsante e la conferma: sono azioni da decidere |

Uscendo da uno strumento, cambiando scheda, salvando o chiudendo l'app, quello che si sta ancora scrivendo va sul
foglio senza domande (`resolvePending` in `App.tsx`). Il testo aggiunto ricorda testo e stile nel suo segno (`/X` in
`tools/applicati.py`): toccandolo si riapre nella casella e `add_text` con `remove` lo sostituisce. Le immagini inserite
sono oggetti applicati (tipo `immagine`) e non compaiono più tra le "immagini che c'erano nel documento".

## E. Parole semplici e piccoli difetti

- nomi degli strumenti in italiano di tutti i giorni (Pulisci prima di inviare, Blocca moduli e commenti, Testo
  ricercabile (OCR), Riduci dimensione, Controlla il PDF, Informazioni sul file, Titolo e autore, Segnalibri, Trasforma
  in Word, Excel…, Crea PDF da foto e file, Apri file firmati, Togli le firme digitali, Rendi compilabili i moduli,
  Nascondi dati (oscura), Aggiungi sommario); i nomi di prima restano nella ricerca (`ANCHE` in `tools.ts`);
- l'indicazione dello strumento ("Tocca la pagina dove vuoi la firma") si vede sopra la pagina (`suggerimento-foglio`
  in `Viewer.tsx`), con "Tocca" sugli schermi touch e "Clicca" con il mouse (`useVerbo`);
- le novità di una versione nuova sono un avviso breve, una volta, e il numero sulla campanella (prima la finestra delle
  novità copriva tutto il telefono);
- sul telefono la schermata iniziale non dice più "Trascina qui".

## Prove

Nel browser a 1280×800 e nella web app per iPhone a 375 px (motore Pyodide): scelta della modalità, schermata iniziale,
riapertura dai recenti, guida della Firma (tre passi evidenziati), firma di testo messa con un clic e selezionata,
testo aggiunto che va sul foglio toccando fuori, riaperto e corretto, spunta messa e selezionata, "Altro", "Fatto" in
Organizza pagine, "Salva" evidenziato. Motore: `test_testo_aggiunto_si_riapre_e_immagini_inserite_si_spostano`.
Non provato su un telefono vero.
