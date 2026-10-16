# Novità

## 1.0.2
Aggiornamenti più semplici: il link diretto all'installer giusto per ogni sistema.

- **Download diretto per sistema** (novità): quando esce una versione nuova, la campanella propone l'installer del
  sistema che stai usando, con il link diretto: **Windows** l'MSI, **macOS** il DMG, **Linux** l'AppImage, **Android**
  l'APK. Nel riquadro: nome del file e dimensione, pulsante "Scarica la versione", link da copiare, "Pagina della
  versione" e come installare su quel sistema.
- Il link punta all'installer di quella versione precisa: resta valido anche quando escono versioni più nuove.
- Il repository e le release di PDFz sono pubblici: l'avviso di nuova versione e i download funzionano senza account GitHub.

## 1.0.1
Correzioni per telefono e tablet (soprattutto Android).

- **Menu Tema** (correzione): sul telefono e sul tablet si apriva ma restava nascosto sotto la barra in alto. Ora si
  vede e si scelgono aspetto (chiaro, scuro, sistema) e colori. Stessa correzione per la campanella e per il pannello
  Download, che sui tablet e in orizzontale potevano restare tagliati.
- **Campanella delle notifiche** (correzione): la finestra resta aperta finché la chiudi (prima poteva sparire dopo pochi
  secondi lasciando acceso il pallino rosso); il pallino si spegne appena la apri.
- **Tutte le notifiche** (novità): nella campanella si leggono tutte le novità della versione, non solo le prime tre, e in
  fondo i **messaggi recenti** della sessione (quelli che compaiono in basso e spariscono dopo qualche secondo), con l'ora.
- I messaggi in basso restano sullo schermo più a lungo: 6 secondi, gli errori 10.

## 1.0.0
Prima versione di **PDFz**: editor PDF che lavora **tutto sul dispositivo** (nessun file lascia il PC o il telefono),
per Windows, macOS, Linux, Android e iPhone/iPad.

**Novità di questa versione**
- **Nuovo nome e nuovo marchio: PDFz**, con i colori rosso, oro, nero e bianco. Nuova icona dell'app (Windows, macOS,
  Linux, Android, iPhone) e nuovo logo (barra in alto, schermata di avvio, installer).
- **5 temi colore** da scegliere nel menu **Tema**: Rubino, Oro, Onice, Avorio e Bordeaux, oltre a chiaro, scuro e tema
  del sistema. La scelta resta salvata nelle impostazioni.
- **Avvisi e domande sempre nelle finestre dell'app** (correzione): prima "Salva con nome" su Android, la conferma di
  "Oscura" e gli errori di salvataggio o di file bloccato dell'app desktop usavano le finestre del browser o di sistema.
- **Aggiornamenti dalle GitHub Releases**: quando esce una versione nuova l'app (Windows, macOS, Linux, Android) la
  segnala nella campanella, con le novità e il pulsante Scarica.
- **Identificativi nuovi** (installer Windows, app Android `com.agjin.pdfz`, app macOS e iPhone): PDFz si installa
  **accanto** a eventuali installazioni precedenti del vecchio programma, senza sostituirle.

**Modifica**
- Modifica testo e Aggiungi testo: si scrive direttamente sulla pagina; caselle spostabili (maniglia ✥) e ridimensionabili,
  carattere, dimensione, colore e allineamento; suggerimenti dei testi già usati.
- Forme (rettangolo, ovale, segmento, freccia), Spunta e X per i moduli, Immagini (dimensione originale, ridimensionamento,
  opacità, ripetizione su tutte le pagine, rimozione), Allega file, Filigrana, Timbro (anteprima, clic sulla pagina, più timbri).
- Oscura: copri, sfoca leggera o forte; aree, parole, email, IBAN, codici fiscali, P.IVA, telefoni, espressioni regolari.

**Pagine**
- Unisci (viste Elenco, File, Pagine), Organizza (selezione multipla, trascina, ruota, duplica, elimina, estrai, pagina
  bianca, pagine da altri PDF), Estrai, Rimuovi, Ruota, Ritaglia, Ridimensiona, Numeri di pagina, Crea indice.

**Firma e sicurezza**
- Firma disegnata, da immagine (sfondo reso trasparente, 3 firme salvate) o da testo; firma digitale con certificato
  .pfx/.p12 (PAdES).
- File firmati .p7m/.p7s: verifica con l'elenco CA AgID, revoca OCSP/CRL, marca temporale (CAdES-T), cifratura per
  destinatari (.p7e), estrazione del documento, rapporto di verifica in PDF.
- Aggiungi/Rimuovi password, "Password del PDF" (cifratura, permessi, prova delle password), Rimuovi firma digitale,
  Sanitizza, Sblocca moduli, Appiattisci. La password si chiede solo ai PDF che hanno restrizioni reali.

**Ottimizza, analizza e revisione**
- Comprimi, Confronta, OCR, Info complete, Convalida.
- Commenti e revisioni (note scritte sulla pagina, evidenzia/sottolinea/barra come in Word, proposte di modifica,
  risposte, stati), compatibili con Acrobat.
- Traduci offline mantenendo l'impaginazione (vista affiancata, solo traduzione, testo; "Usa la traduzione", "Salva testo").
- Modifica proprietà e segnalibri.

**Converti**
- PDF → Word, Excel, PowerPoint, ODT/ODS/ODP, RTF, CSV, TXT, HTML, PNG/JPG, PDF/A.
- Office, immagini, testo, HTML, XPS, EPUB → PDF. Con Microsoft Office installato si usa Office (massima fedeltà),
  altrimenti LibreOffice o il motore integrato.

**Interfaccia**
- Schede multiple, annulla/ripeti illimitato, ricerca, miniature, stampa, zoom "Adatta".
- Menu strumenti con Preferiti in ordine libero, etichette colorate e sezioni comprimibili; pannello download.
- Campanella con le novità di ogni versione e l'avviso di nuova versione.
- **Modifiche non applicate**: lasciando uno strumento con modifiche senza "Applica" l'app chiede
  **Applica / Non applicare / Annulla**.
- **Chiusura dell'app (Windows, macOS)**: con documenti non salvati chiede **Salva / Esci senza salvare / Annulla**;
  una scheda non salvata si può salvare anche mentre la si chiude.
- Se uno strumento va in errore compare un avviso nel pannello e il documento resta aperto (niente schermata bianca).
- Impostazioni (preferiti, etichette, tema, misure dei pannelli) salvate su disco.

**Windows**
- Installer MSI in italiano: "Per tutti gli utenti" o "Solo per me", aggiornamento guidato (mantieni tutto / solo le
  impostazioni / installazione pulita), casella "Avvia PDFz" a fine installazione, disinstallazione completa.
- Voce "PDFz" nel menu del tasto destro di Esplora risorse (Crea PDF, Modifica, azioni sui file .p7m) e "Apri con".
- Pacchetti di traduzione in MSI separati (`PDFz-Lingue-<gruppo>-1.0.0-x64.msi`), da installare solo dove servono.

**macOS, Linux, Android e iPhone/iPad**
- macOS: app in DMG per Apple Silicon. Linux: AppImage (la finestra è Chrome/Chromium/Edge in modalità app).
- Android e iPhone/iPad: tutto offline, il motore PDF gira dentro l'app; interfaccia per telefono e tablet, "Scatta foto"
  per creare un PDF dalle foto, "Apri con" e Condividi, salvataggio in Documenti/PDFz. APK firmato: le versioni
  successive si installano sopra. Mancano traduzione, PDF/A, compressione Ghostscript e conversioni Office → PDF.

**Versioni e pubblicazione**
- Numerazione `MAJOR.MINOR.PATCH` (si parte da 1.0.0).
- Build automatica su GitHub a ogni tag: Windows (MSI + MSI lingue), macOS (DMG Apple Silicon), Linux (AppImage) e
  Android (APK firmato), pubblicati nella GitHub Release della versione.
