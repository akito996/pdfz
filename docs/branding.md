# Marchio PDFz: icone, favicon, temi colore

Aggiornato il 2026-10-16. Nome dell'app: **PDFz**. Autore ed editore: **agjin**.

## Colori del marchio

| Colore | Codice | Dove si usa |
|---|---|---|
| Rosso | `#C8102E` | fondo dell'icona, "z" del logo, contatori e avvisi |
| Oro | `#D4AF37` | angolo piegato della pagina, dettagli |
| Nero | `#111111` | lettere, Z dell'icona |
| Bianco | `#FFFFFF` | pagina dell'icona, fondi |

Nell'interfaccia il rosso dei pulsanti è un po' più scuro (`#B3122B`): il testo bianco si legge meglio (contrasto 6,9:1).

## Icone e favicon: 5 proposte ciascuno

Anteprima di tutte le proposte, alle varie dimensioni e su fondo chiaro e scuro: [`branding/proposte/anteprima.png`](../branding/proposte/anteprima.png).
I disegni originali sono in `branding/proposte/icona-N.svg` e `favicon-N.svg`.

| N. | Icona | Favicon |
|---|---|---|
| 1 | **Rubino** (in uso): pagina bianca con angolo oro e Z nera su rosso | **Z bianca su rosso** (in uso) |
| 2 | Onice: monogramma Z oro con punto rosso su nero | Z oro su nero |
| 3 | Sigillo: timbro rosso con anello oro e Z bianca su bianco | Z nera su oro |
| 4 | Fulmine: diagonale nero/rosso, Z bianca con base oro | Sigillo rosso con anello oro |
| 5 | Scritta: "PDF" nero e "z" rossa su oro | Diagonale nero/rosso con Z bianca |

Perché la 1 come predefinita: la pagina con l'angolo piegato si riconosce subito come "documento", e la Z si legge
anche a 32 px. Il favicon 1 è la stessa idea semplificata per le schede del browser (16 px).

### Cambiare icona o favicon

```bash
.venv/Scripts/python branding/genera_marchio.py --icona 2 --favicon 2
```

Lo script (`branding/genera_marchio.py`) è l'unica fonte del disegno: forme geometriche, nessun carattere esterno,
quindi nessuna licenza da rispettare. Scrive tutti i file, nelle dimensioni giuste per ogni piattaforma:

| Dove | File |
|---|---|
| `branding/` | `icona.svg`, `icona-16…1024.png`, `favicon.svg`, `logo.svg`, `logo-negativo.svg`, `logo.png` |
| Interfaccia (`frontend/public/`) | `icona.svg` (logo nella barra in alto), `favicon.svg`, `favicon-16/32.png`, `icon-512.png`, `apple-touch-icon.png` |
| Windows / macOS / Linux / iPhone (`packaging/assets/`) | `icon.ico`, `icon.icns`, `icon.png`, `icon.svg`, `pdfz-256.png`, `icon-ios-1024.png` |
| Installer Windows (`packaging/wix/`) | `banner.bmp` (493×58), `dialog.bmp` (493×312) |
| Android (`mobile/android/app/src/main/res/`) | `mipmap-*/ic_launcher*.png` (normale, tonda, adattiva), colore di fondo, `drawable*/splash.png` |

Dopo il cambio: ricompilare (le build copiano i file da qui).

Senza argomenti lo script rifà solo le proposte e l'anteprima. Limite noto: il motore SVG di PyMuPDF non gestisce
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
