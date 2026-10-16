"""OCR: rende ricercabile/selezionabile il testo dei PDF scansionati.

Usa il motore Tesseract integrato in MuPDF: servono solo i file lingua
(*.traineddata), distribuiti con l'installer. Il contenuto originale della pagina
resta intatto; viene aggiunto un livello di testo invisibile sopra l'immagine."""
from __future__ import annotations

import pymupdf

from ..config import ocr_languages, tessdata_dir
from .base import Ctx, Result, ToolError, boolean, num, parse_pages, tool


def _ocr_page_words(page: pymupdf.Page, dpi: int, lang: str, tessdata: str):
    pix = page.get_pixmap(dpi=dpi)
    ocr_pdf = pymupdf.open("pdf", pix.pdfocr_tobytes(language=lang, tessdata=tessdata))
    op = ocr_pdf[0]
    sx = page.rect.width / op.rect.width
    sy = page.rect.height / op.rect.height
    words = [(pymupdf.Rect(w[0] * sx, w[1] * sy, w[2] * sx, w[3] * sy), w[4])
             for w in op.get_text("words")]
    ocr_pdf.close()
    return words


def _pages_to_do(ctx: Ctx, doc: pymupdf.Document) -> list[int]:
    skip_text = ctx.params.get("mode", "skip") == "skip"
    return [p for p in parse_pages(ctx.params.get("pages"), doc.page_count)
            if not (skip_text and doc[p].get_text("text").strip())]


@tool("ocr_prepare")
def ocr_prepare(ctx: Ctx) -> Result:
    """App Android: MuPDF per WebAssembly non ha Tesseract. Qui si preparano le immagini delle pagine da leggere;
    il riconoscimento lo fa Tesseract (WebAssembly) nell'app, poi le parole tornano allo strumento "ocr" (ocr_words)."""
    from ..store import store

    dpi = int(num(ctx.params.get("dpi"), 300))
    doc = ctx.open()
    out = []
    for pno in _pages_to_do(ctx, doc):
        pg = doc[pno]
        pix = pg.get_pixmap(dpi=dpi)
        it = store.add_bytes(pix.tobytes("png"), f"ocr-{pno + 1}.png", kind="asset")
        out.append({"page": pno, "image": it.id, "px": [pix.width, pix.height], "pt": [pg.rect.width, pg.rect.height]})
    total = doc.page_count
    doc.close()
    return Result(data={"pages": out, "total": total})


@tool("ocr")
def ocr(ctx: Ctx) -> Result:
    given = ctx.params.get("ocr_words")   # {"<pagina>": [[x0, y0, x1, y1, "parola"], ...]} in punti, pagina vista
    if given is not None:
        return _ocr_with_words(ctx, given)
    tessdata = tessdata_dir()
    if not tessdata:
        raise ToolError("Dati OCR non trovati: reinstalla l'applicazione (cartella tessdata).")
    langs = ctx.params.get("languages") or ["ita", "eng"]
    if isinstance(langs, str):
        langs = [l for l in langs.replace(",", "+").split("+") if l]
    available = set(ocr_languages())
    langs = [l for l in langs if l in available] or sorted(available)[:1]
    lang = "+".join(langs)
    dpi = int(num(ctx.params.get("dpi"), 300))
    skip_text = ctx.params.get("mode", "skip") == "skip"
    doc = ctx.open()
    pages = parse_pages(ctx.params.get("pages"), doc.page_count)
    font = pymupdf.Font("helv")
    done, skipped, n_words = 0, 0, 0
    for pno in pages:
        pg = doc[pno]
        if skip_text and pg.get_text("text").strip():
            skipped += 1
            continue
        if ctx.params.get("mode") == "force":
            # rimuove il testo esistente (es. OCR precedente di cattiva qualità)
            pg.add_redact_annot(pg.rect, fill=False)
            pg.apply_redactions(images=pymupdf.PDF_REDACT_IMAGE_NONE,
                                graphics=pymupdf.PDF_REDACT_LINE_ART_NONE)
        words = _ocr_page_words(pg, dpi, lang, tessdata)
        if not words:
            continue
        n_words += _write_words(pg, words, font)
        done += 1
    if boolean(ctx.params.get("strict")) and not done:
        raise ToolError("Nessuna pagina da elaborare: tutte contengono già testo.")
    msg = f"OCR completato su {done} pagine ({n_words} parole riconosciute, lingue: {lang})."
    if skipped:
        msg += f" {skipped} pagine avevano già testo e sono state saltate."
    return Result(pdf=ctx.save(doc), message=msg)


def _write_words(pg: pymupdf.Page, words, font: pymupdf.Font) -> int:
    """Testo invisibile (render mode 3) sopra l'immagine: si può cercare, selezionare e copiare."""
    pg.insert_font(fontname="hocr", fontbuffer=font.buffer)
    n = 0
    # coordinate "visive" della pagina renderizzata -> interne
    for r, text in words:
        r = r * pg.derotation_matrix
        r.normalize()
        size = max(r.height * 0.85, 1)
        tw = font.text_length(text, size)
        if tw <= 0:
            continue
        sx = r.width / tw
        origin = pymupdf.Point(r.x0, r.y1 - r.height * 0.18)
        pg.insert_text(origin, text, fontname="hocr", fontsize=size, render_mode=3,
                       rotate=pg.rotation, morph=(origin, pymupdf.Matrix(sx, 1)))
        n += 1
    return n


def _ocr_with_words(ctx: Ctx, given: dict) -> Result:
    doc = ctx.open()
    font = pymupdf.Font("helv")
    force = ctx.params.get("mode") == "force"
    done = n_words = 0
    for key, items in given.items():
        pno = int(key)
        if not 0 <= pno < doc.page_count:
            continue
        pg = doc[pno]
        if force:
            pg.add_redact_annot(pg.rect, fill=False)
            pg.apply_redactions(images=pymupdf.PDF_REDACT_IMAGE_NONE, graphics=pymupdf.PDF_REDACT_LINE_ART_NONE)
        words = [(pymupdf.Rect(w[0], w[1], w[2], w[3]), str(w[4])) for w in items if len(w) >= 5 and str(w[4]).strip()]
        if words:
            n_words += _write_words(pg, words, font)
            done += 1
    total = doc.page_count
    msg = f"OCR completato su {done} pagine ({n_words} parole riconosciute)."
    if done < total and not force:
        msg += f" {total - done} pagine avevano già testo o erano vuote."
    return Result(pdf=ctx.save(doc), message=msg)
