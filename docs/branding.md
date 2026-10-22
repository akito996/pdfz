# Marchio PDFz: icone, favicon, temi colore

Aggiornato il 2026-10-22. Nome dell'app: **PDFz**. Autore ed editore: **agjin**.

**In uso: icona e favicon 24 "Foglio senza fondo"** (serie 6, dal 2026-10-22, indicazioni dell'utente): documento
bianco con **contorno nero**, angolo piegato **d'oro**, "PDF" **rosso**, filo d'oro e sotto una "z" **nera** piccola;
**nessun fondo attorno** (niente quadrato rosso): il foglio sta da solo su trasparente. Dove serve un'immagine piena
(iPhone, icona adattiva di Android, icone "maskable" della web app) il fondo è bianco. Il favicon è lo stesso foglio.

## Colori del marchio

| Colore | Codice | Dove si usa |
|---|---|---|
| Rosso | `#C8102E` | fondo dell'icona, "PDF" e "z" sul foglio, "z" del logo, contatori e avvisi |
| Oro | `#D4AF37` (piega `#F1D27A`) | foglio PDF dell'icona |
| Nero | `#111111` | solo finiture: contorno e ombra del foglio, piega, filo; lettere "PDF" del logo |
| Bianco | `#FFFFFF` | fondi (schermata di avvio, installer) |

Nell'interfaccia il rosso dei pulsanti è un po' più scuro (`#B3122B`): il testo bianco si legge meglio (contrasto 6,9:1).

## Icone e favicon

Le proposte sono a **serie** di 5 icone, ognuna con il suo favicon (stesso numero). I disegni originali sono in
`branding/proposte/icona-N.svg` e `favicon-N.svg`; ogni serie ha la sua anteprima, alle varie dimensioni e su fondo
chiaro e scuro.

### Serie 6 (2026-10-22): indicazioni precise dell'utente — scelta la 24

Anteprima: [`branding/proposte/anteprima-serie-6.png`](../branding/proposte/anteprima-serie-6.png) (con la 19 per
confronto). Richiesta, dopo la 19: "la z deve essere nera, documento bianco con contorno nero, la piega della pagina oro,
PDF rosso, lo sfondo fuori non ci deve essere". `foglio_pdf` ha due parametri nuovi: `spessore` (contorno più marcato,
20 invece di 11) e `ombra` (qui spenta, per non sporcare il trasparente).

| N. | Icona | Favicon |
|---|---|---|
| 24 | **Foglio senza fondo** (in uso): documento bianco, contorno nero, piega d'oro, "PDF" rosso, "z" nera | lo stesso foglio |

### Serie 5 (2026-10-21): la 17 con più bianco — scelta la 19 (in uso fino al 2026-10-22)

Anteprima: [`branding/proposte/anteprima-serie-5.png`](../branding/proposte/anteprima-serie-5.png) (prima colonna: la 17
in uso, per confronto). Richiesta: la 17 è "fastidiosa per gli occhi" (rosso e oro pieni, molto saturi); stessa icona con
un po' di bianco. Il bianco prende il posto di una superficie grande (foglio o fondo) oppure fa da contorno o etichetta.
`foglio_pdf` ha due parametri nuovi: `finitura` (colore del contorno, nero di serie) ed `etichetta` (fascia dietro "PDF").

| N. | Icona | Favicon |
|---|---|---|
| 19 | **Foglio bianco** (in uso il 2026-10-21): foglio PDF bianco su rosso, "PDF" e "z" rossi, piega e filo d'oro | foglio bianco, scritte rosse |
| 20 | **Fondo bianco**: il foglio d'oro della 17 su fondo bianco con un contorno chiaro | foglio d'oro su quadrato bianco |
| 21 | **Contorno bianco**: la 17 con il contorno del foglio bianco invece che nero | foglio d'oro con contorno bianco |
| 22 | **Etichetta bianca**: la 17 con una fascia bianca dietro "PDF" | foglio d'oro con fascia bianca |
| 23 | **Foglio rosso su bianco**: foglio PDF rosso, "PDF" bianco e "z" d'oro, su fondo bianco | foglio rosso su quadrato bianco |

Per applicarne una: `.venv/Scripts/python branding/genera_marchio.py --serie 5 --icona N --favicon N`.

### Serie 4 (2026-10-16): la 11 dentro un foglio PDF — scelta la 17 (in uso fino al 2026-10-21)

Anteprima: [`branding/proposte/anteprima-serie-4.png`](../branding/proposte/anteprima-serie-4.png).
Richiesta: l'icona 11 ("PDF" su una riga, sotto al centro la "z" piccola) dentro l'icona di un file PDF, con più rosso
e oro; il nero solo per le finiture (contorno sottile, ombra, piega, filo tra "PDF" e "z"). Tre varianti di colore;
il favicon è il foglio da solo, senza fondo, così nelle schede del browser si vede come un file.

| N. | Icona | Favicon |
|---|---|---|
| 16 | **Foglio rosso**: foglio PDF rosso su fondo oro, "PDF" e "z" in oro chiaro | foglio rosso, scritte oro |
| 17 | **Foglio oro** (in uso fino al 2026-10-21, poi sostituita dalla 19): foglio PDF d'oro su fondo rosso, "PDF" e "z" rossi | foglio d'oro, scritte rosse |
| 18 | **Cornice d'oro**: foglio PDF rosso con bordo d'oro su fondo rosso scuro, "PDF" e "z" in oro | foglio rosso con bordo d'oro |

Nota: un foglio con la scritta "PDF" ricorda l'icona generica dei file PDF usata da molti programmi; la "z", l'oro e il
filo nero lo distinguono, ma la verifica dei marchi (sotto) resta necessaria.

### Serie 3 (2026-10-16): non scelta (la 11 è diventata la serie 4)

Anteprima: [`branding/proposte/anteprima-serie-3.png`](../branding/proposte/anteprima-serie-3.png).
La 11 è quella richiesta: "PDF" su una riga e sotto, al centro, una "z" piccola.

| N. | Icona | Favicon | Idea |
|---|---|---|---|
| 11 | **A capo**: "PDF" bianco su una riga, filo d'oro e sotto, al centro, una "z" rossa piccola, su nero | PDF e z a capo | il nome scritto su due righe |
| 12 | **Evidenziato**: righe di testo in cui le parti evidenziate in rosso disegnano una z, su bianco con bordo d'oro | z evidenziata | evidenziare e annotare il testo |
| 13 | **Cucitura**: foglio bianco con una z cucita a punti rossi e il filo d'oro, su nero | foglio con la z cucita | unire i documenti |
| 14 | **Goccia**: goccia d'inchiostro rossa con la z bianca, su oro | goccia rossa con la z | l'inchiostro della firma (attenzione: una goccia rossa ricorda anche le app sul sangue) |
| 15 | **Ventaglio**: tre fogli aperti a ventaglio, nero, oro e bianco, con la z rossa, su rosso | tre fogli a ventaglio | più documenti insieme |

### Serie 2 (2026-10-16): non scelta

Anteprima: [`branding/proposte/anteprima-serie-2.png`](../branding/proposte/anteprima-serie-2.png).
Idee lontane dai cliché delle app PDF, legate al nome e alle funzioni dell'app.

| N. | Icona | Favicon | Idea |
|---|---|---|---|
| 6 | **Legatura**: "p" e "z" bianche unite sulla stessa base, su rosso, piede d'oro | "pz" bianca su rosso | monogramma che esiste solo per il nome PDFz |
| 7 | **Controforma**: P nera con una "z" rossa al posto del buco, su bianco | P nera con la z rossa | P di PDF + z nello stesso segno |
| 8 | **Taglio**: foglio diviso da un taglio a Z, parte bianca e parte oro, su nero | foglio tagliato a Z | dividere e unire i PDF |
| 9 | **Pennino**: pennino d'oro con il foro a forma di z rossa, su nero | pennino d'oro | firma dei documenti |
| 10 | **Piega**: foglio piegato a fisarmonica, bianco e oro con righe di testo, su rosso | piega a Z | la "piega a Z" della carta |

Le serie 2 e 3 restano nello script come alternative: si possono applicare con lo stesso comando.

### Serie 1 (2026-10-16): scartata

Anteprima: [`branding/proposte/anteprima-serie-1.png`](../branding/proposte/anteprima-serie-1.png).
Scartata perché troppo simile a marchi esistenti: pagina con l'angolo piegato, lettera dentro un quadrato, sigillo e
diagonale sono idee molto usate. Icone 1-5: Rubino, Onice, Sigillo, Fulmine, Scritta. Tolte dallo script dopo la
scelta della 17: restano solo l'anteprima e i disegni SVG in `branding/proposte/`.

### Prima di adottare un marchio: verifica dei marchi già registrati

Un disegno nuovo può comunque assomigliare a un marchio registrato: va controllato prima di pubblicare l'app.

- 💎 **Prestazione**: ricerca di anteriorità fatta da un consulente in proprietà industriale (marchi UE, nazionali e
  internazionali, anche figurativi), poi deposito del marchio all'EUIPO.
- ⚖️ **Qualità/Prezzo**: servizio online di ricerca marchi con confronto delle immagini, poi deposito in proprio all'EUIPO.
- 🆓 **Economica/Gratuita**: ricerca in proprio su [TMview](https://www.tmdn.org/tmview/) (marchi UE e nazionali,
  anche per immagine), [WIPO Global Brand Database](https://branddb.wipo.int/) (ricerca per immagine) e negli store
  (Google Play, App Store) per le parole "PDFz" e "PDF z".

### Cambiare icona o favicon

```bash
.venv/Scripts/python branding/genera_marchio.py --serie 6 --icona 24 --favicon 24
```

Lo script (`branding/genera_marchio.py`) è l'unica fonte del disegno: forme geometriche, nessun carattere esterno,
quindi nessuna licenza da rispettare. Scrive tutti i file, nelle dimensioni giuste per ogni piattaforma:

| Dove | File |
|---|---|
| `branding/` | `icona.svg`, `icona-16…1024.png`, `favicon.svg`, `logo.svg`, `logo-negativo.svg`, `logo.png` |
| Interfaccia (`frontend/public/`) | `icona.svg` (logo nella barra in alto), `favicon.svg`, `favicon-16/32.png`, `icon-192.png`, `icon-512.png`, `apple-touch-icon.png` (180×180, iPhone); per il manifest della web app anche `icon-maskable-192/512.png` (a tutta tela, senza trasparenza: il telefono la ritaglia nella sua forma; vedi `web-app-iphone.md`) |
| Windows / macOS / Linux / iPhone (`packaging/assets/`) | `icon.ico`, `icon.icns`, `icon.png`, `icon.svg`, `pdfz-256.png`, `icon-ios-1024.png` |
| Installer Windows (`packaging/wix/`) | `banner.bmp` (493×58), `dialog.bmp` (493×312) |
| Android (`mobile/android/app/src/main/res/`) | `mipmap-*/ic_launcher*.png` (normale, tonda, adattiva), colore di fondo, `drawable*/splash.png` |

Dopo il cambio: ricompilare (le build copiano i file da qui).

Senza argomenti lo script rifà solo le proposte e l'anteprima dell'ultima serie (`--serie 2` o `3` per le precedenti). Limite noto: il motore SVG di PyMuPDF non gestisce
sfumature né `clipPath`, per questo il disegno è piatto e le forme tagliate sono calcolate nello script.

## Temi colore: 5 palette

Si scelgono dal menu **Tema** (in alto a destra), insieme all'aspetto chiaro, scuro o quello del sistema.
La scelta resta salvata (chiave `hdpdf.colori` delle impostazioni).

| Palette | Idea | Pulsanti (chiaro / scuro) | Accento | Fondo chiaro |
|---|---|---|---|---|
| **Rubino** (predefinita) | rosso e oro | `#B3122B` / `#D42A43` | oro `#C9A227` | bianco caldo `#F6F4F1` |
| Oro | oro antico e nero | `#8A6914` / `#D4AF37` (testo nero) | oro chiaro | avorio `#F7F3EA` |
| Onice | nero e rosso | `#1A1A1A` / `#ECECEC` (testo nero) | rosso | grigio perla `#F2F2F2`; scuro = nero pieno (OLED) |
| Avorio | bianco, rosso e nero | `#C8102E` / `#D7263F` | nero | bianco pieno `#FFFFFF` |
| Bordeaux | bordeaux e oro | `#7A1626` / `#B23A4B` | oro `#B8912A` | avorio caldo `#F8F4EC` |

Il testo sui pulsanti ha sempre contrasto di almeno 4,5:1 (regola WCAG AA).

### Come sono fatte (per chi aggiunge una palette)

- I colori stanno in `frontend/src/styles.css`. Ogni palette è un blocco `:root[data-palette="nome"]` con i valori
  `-l` (aspetto chiaro) e `-d` (aspetto scuro): `--brand`, `--brand-strong`, `--brand-soft`, `--brand-rgb`,
  `--on-brand` (colore del testo sui pulsanti), `--accent`, `--accent-rgb` e, se servono, i neutri
  (`--bg`, `--panel`, `--line`, `--text`, `--muted`, `--viewer-bg`…).
- Due blocchi comuni copiano i valori `-l` o `-d` nelle variabili usate dall'interfaccia: per una palette nuova
  non serve toccarli.
- In `frontend/src/components/ThemeMenu.tsx` si aggiunge una riga a `PALETTES` (nome, descrizione, 3 campioni).
- Nei colori trasparenti si usa `rgba(var(--brand-rgb), 0.1)`, mai il codice del colore scritto a mano.

Tre strade per il futuro (se servisse):

- 💎 **Prestazione**: palette create dall'utente con un selettore di colore e controllo automatico del contrasto.
- ⚖️ **Qualità/Prezzo** (attuale): palette fisse in CSS, una riga per aggiungerne una.
- 🆓 **Economica**: un solo tema chiaro/scuro, senza scelta dei colori.
