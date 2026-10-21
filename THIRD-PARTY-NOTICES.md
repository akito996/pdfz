# Componenti di terze parti

PDFz è distribuito con licenza **GNU AGPL-3.0** (vedi `LICENSE`), necessaria perché il motore
PDF (MuPDF/PyMuPDF) è rilasciato con la stessa licenza. Chi distribuisce l'applicazione (anche modificata)
o la offre come servizio web deve mettere a disposizione anche il codice sorgente (con le eventuali modifiche).

| Componente | Uso | Licenza |
|---|---|---|
| MuPDF / PyMuPDF (Artifex) | rendering, modifica, OCR integrato, oscuramento | AGPL-3.0 |
| Tesseract OCR – dati lingua `tessdata_fast` | riconoscimento testo | Apache-2.0 |
| pyHanko, pyhanko-certvalidator | firma digitale PAdES e convalida | MIT |
| pikepdf / qpdf | controllo strutturale | MPL-2.0 / Apache-2.0 |
| pdf2docx | PDF → Word | MIT |
| pdfplumber, pdfminer.six | estrazione tabelle (PDF → Excel) | MIT |
| openpyxl | file Excel | MIT |
| python-pptx | file PowerPoint | MIT |
| Pillow | immagini | MIT-CMU (HPND) |
| fontTools | lettura caratteri | MIT |
| cryptography | crittografia | Apache-2.0 / BSD |
| FastAPI, Starlette, Uvicorn | server locale | MIT / BSD |
| pywebview | finestra desktop (WebView2) | BSD-3-Clause |
| pywin32 | automazione Microsoft Office | PSF |
| PDF.js (Mozilla) | visualizzazione nell'interfaccia | Apache-2.0 |
| React | interfaccia | MIT |
| Lucide | icone | ISC |
| Ghostscript (facoltativo, se incluso nella build) | compressione avanzata, PDF/A | AGPL-3.0 |

Programmi usati solo se già installati sul PC: Microsoft Office (conversioni Office ↔ PDF),
LibreOffice (MPL-2.0), veraPDF (GPL-3.0/MPL-2.0, convalida PDF/A).
