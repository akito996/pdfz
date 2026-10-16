# Conversioni

Aggiornato alla versione **1.0.0**. Codice: `backend\hdpdf\tools\convert.py`, `backend\hdpdf\fileutil.py`.

## Motori (in ordine di preferenza)

| Motore | Quando | Note |
|---|---|---|
| Microsoft Office via COM | Windows con Office installato (`ms_office_available()`) | Massima fedeltà. PDF→Word con "PDF Reflow" di Word (`_word_pdf_to`); Office→PDF con `_office_to_pdf` |
| LibreOffice headless | Se installato (`soffice_cmd()`) o con `engine=libreoffice` | Profilo temporaneo separato |
| Librerie integrate | Sempre (anche Android) | pdf2docx (Word), pdfplumber+openpyxl (Excel), python-pptx (PowerPoint), PyMuPDF (testo, html, immagini) |

Parametro `engine`: `auto` (predefinito), `office`, `libreoffice`. Con `auto`, se Word fallisce si passa a pdf2docx.

## PDF → Word con Microsoft Word

Problema risolto: il `.docx` appena creato poteva restare **bloccato** (`PermissionError [Errno 13]`) da Word che si chiude,
da un programma di sincronizzazione cloud (se la cartella è sincronizzata) o dall'antivirus. Il download falliva a caso.

Flusso attuale di `_word_pdf_to`:
1. Word salva in una cartella temporanea propria `%TEMP%\hdpdf-word-*` (fuori da cartelle sincronizzate).
2. Si rilasciano subito gli oggetti COM (`d = None`, `app = None`) prima di `CoUninitialize`.
3. `wait_readable()` aspetta che il file sia leggibile, `move_when_free()` lo sposta al suo posto (riprova fino a 20 s).
4. Se qualcosa fallisce: con `engine=auto` si cancella l'eventuale file parziale e si usa pdf2docx.

## Aiuti per i file bloccati — `backend\hdpdf\fileutil.py`

- `retry_locked(fn, timeout=20)`: riprova `fn` se dà `PermissionError`, attese 0,1 → 0,2 → … → 1 s.
- `wait_readable(path, timeout)`: aspetta che il file si possa aprire in lettura.
- `move_when_free(src, dst, timeout)`: sposta il file riprovando se è bloccato.

Usati anche dal download `GET /api/items/{id}/file`: aspetta fino a **10 s**, poi risponde **HTTP 423**
con il messaggio "Il file è ancora in uso da un altro programma (…). Riprova tra qualche secondo."
Nell'app desktop gli errori di salvataggio e di file bloccato compaiono nella finestra dell'app, non in una finestra
di sistema (vedi `problemi-risolti.md`, 1.0.0).

Su Android il modulo è incluso nel motore (`prepare-engine.mjs` impacchetta tutta `backend\hdpdf`); lì non ci sono blocchi, le funzioni passano subito.

## Test collegati

- `test_convert_from_pdf[docx|xlsx|pptx|txt|html|png|csv]`
- `test_wait_readable_retries_locked_file` (file bloccato 3 volte, poi libero; timeout rispettato)
- `test_convert_docx_word_fails_falls_back` (Word finto che fallisce lasciando un file a metà → pdf2docx)
