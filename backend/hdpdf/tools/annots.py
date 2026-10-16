"""Forme (rettangolo, ovale, segmento, freccia, X, spunta) e commenti/revisioni.

Tutto è salvato come annotazioni PDF standard: restano modificabili qui e in Acrobat/Edge.
Le coordinate che arrivano dalla UI sono "visive" (pagina come la vede l'utente, rotazione applicata).
"""
from __future__ import annotations

import datetime as dt

import pymupdf

from .base import Ctx, Result, ToolError, boolean, color, num, point_from, rect_from, tool

SHAPE_KINDS = ("rect", "ellipse", "line", "arrow", "check", "cross")
LINE_DIRS = ("tl-br", "br-tl", "bl-tr", "tr-bl", "l-r", "r-l", "t-b", "b-t")
HD_KEY = "HDBox"           # riquadro originale della forma (chiave privata nel dizionario dell'annotazione)
MARKUP = {"highlight": "add_highlight_annot", "underline": "add_underline_annot",
          "strike": "add_strikeout_annot", "squiggly": "add_squiggly_annot"}
STATES = {"Accepted": "Accettato", "Rejected": "Rifiutato", "Cancelled": "Annullato", "Completed": "Completato", "None": "Nessuno"}


def _hex(rgb) -> str | None:
    if not rgb:
        return None
    return "#" + "".join(f"{round(max(0, min(1, c)) * 255):02x}" for c in rgb[:3])


def _to_visual(page: pymupdf.Page, r: pymupdf.Rect) -> dict:
    v = r * page.rotation_matrix
    v.normalize()
    return {"x": v.x0, "y": v.y0, "w": v.width, "h": v.height}


def _pt_visual(page: pymupdf.Page, p: pymupdf.Point) -> tuple[float, float]:
    q = p * page.rotation_matrix
    return q.x, q.y


def _line_points(box: dict, d: str) -> tuple[tuple[float, float], tuple[float, float]]:
    x0, y0, x1, y1 = box["x"], box["y"], box["x"] + box["w"], box["y"] + box["h"]
    ym, xm = (y0 + y1) / 2, (x0 + x1) / 2
    return {
        "tl-br": ((x0, y0), (x1, y1)), "br-tl": ((x1, y1), (x0, y0)),
        "bl-tr": ((x0, y1), (x1, y0)), "tr-bl": ((x1, y0), (x0, y1)),
        "l-r": ((x0, ym), (x1, ym)), "r-l": ((x1, ym), (x0, ym)),
        "t-b": ((xm, y0), (xm, y1)), "b-t": ((xm, y1), (xm, y0)),
    }[d if d in LINE_DIRS else "tl-br"]


def _ink_strokes(box: dict, kind: str) -> list[list[tuple[float, float]]]:
    x, y, w, h = box["x"], box["y"], box["w"], box["h"]
    if kind == "check":
        return [[(x + w * 0.06, y + h * 0.55), (x + w * 0.38, y + h * 0.88), (x + w * 0.95, y + h * 0.1)]]
    m = 0.1
    return [[(x + w * m, y + h * m), (x + w * (1 - m), y + h * (1 - m))],
            [(x + w * m, y + h * (1 - m)), (x + w * (1 - m), y + h * m)]]


def _store_box(doc: pymupdf.Document, annot: pymupdf.Annot, page: pymupdf.Page, box: dict, kind: str, d: str = "") -> None:
    r = rect_from(box, page)
    doc.xref_set_key(annot.xref, HD_KEY, f"[{r.x0:.3f} {r.y0:.3f} {r.x1:.3f} {r.y1:.3f}]")
    doc.xref_set_key(annot.xref, "HDKind", f"/{kind}" + (f"-{d}" if d else ""))


def _read_box(doc: pymupdf.Document, xref: int):
    t, v = doc.xref_get_key(xref, HD_KEY)
    if t != "array":
        return None
    try:
        return pymupdf.Rect(*[float(x) for x in v.strip("[]").split()])
    except ValueError:
        return None


def _add_shape(doc: pymupdf.Document, page: pymupdf.Page, it: dict) -> pymupdf.Annot:
    kind = it.get("kind")
    if kind not in SHAPE_KINDS:
        raise ToolError(f"Forma sconosciuta: {kind}")
    box = it["rect"]
    if box["w"] < 0.5 and box["h"] < 0.5:
        raise ToolError("La forma è troppo piccola.")
    stroke = color(it.get("stroke"), (0.12, 0.22, 0.42))
    fill = color(it.get("fill"), None) if it.get("fill") else None
    width = max(0.0, num(it.get("width"), 1.5))
    opacity = min(1.0, max(0.05, num(it.get("opacity"), 1.0)))
    # PyMuPDF accetta solo trattini interi
    dashes = [max(1, round(width * 3)), max(1, round(width * 2))] if boolean(it.get("dash")) else None
    d = it.get("dir") or "tl-br"
    if kind in ("rect", "ellipse"):
        r = rect_from(box, page)
        annot = page.add_rect_annot(r) if kind == "rect" else page.add_circle_annot(r)
        annot.set_colors(stroke=stroke if width > 0 else None, fill=fill)
    elif kind in ("line", "arrow"):
        a, b = _line_points(box, d)
        annot = page.add_line_annot(point_from(a, page), point_from(b, page))
        if kind == "arrow":
            annot.set_line_ends(pymupdf.PDF_ANNOT_LE_NONE, pymupdf.PDF_ANNOT_LE_CLOSED_ARROW)
        annot.set_colors(stroke=stroke, fill=stroke if kind == "arrow" else None)
    else:
        strokes = [[point_from(p, page) for p in s] for s in _ink_strokes(box, kind)]
        annot = page.add_ink_annot([[(p.x, p.y) for p in s] for s in strokes])
        annot.set_colors(stroke=stroke)
    annot.set_border(width=max(width, 0.1) if kind not in ("rect", "ellipse") or width > 0 else 0, dashes=dashes)
    annot.set_opacity(opacity)
    labels = {"rect": "Rettangolo", "ellipse": "Ovale", "line": "Segmento", "arrow": "Freccia", "check": "Spunta", "cross": "X"}
    annot.set_info(subject=labels[kind], title=it.get("author") or "")
    annot.update()
    _store_box(doc, annot, page, box, kind, d if kind in ("line", "arrow") else "")
    return annot


def _describe_shape(doc: pymupdf.Document, page: pymupdf.Page, a: pymupdf.Annot) -> dict | None:
    t = a.type[1]
    k_t, k_v = doc.xref_get_key(a.xref, "HDKind")
    hd = k_v.lstrip("/") if k_t == "name" else ""
    kind = hd.split("-", 1)[0] if hd else {"Square": "rect", "Circle": "ellipse", "Line": "line"}.get(t)
    if t == "Ink" and kind not in ("check", "cross"):
        return None  # disegni a mano libera: non sono forme di questo strumento
    if not kind:
        return None
    colors = a.colors or {}
    border = a.border or {}
    box_pdf = _read_box(doc, a.xref)
    d = hd.split("-", 1)[1] if hd and "-" in hd else ""
    vis = None
    if kind in ("line", "arrow"):
        verts = a.vertices or []
        if len(verts) >= 2:
            (ax, ay), (bx, by) = _pt_visual(page, pymupdf.Point(verts[0])), _pt_visual(page, pymupdf.Point(verts[-1]))
            if not d:
                if abs(ay - by) < 1:
                    d = "l-r" if ax < bx else "r-l"
                elif abs(ax - bx) < 1:
                    d = "t-b" if ay < by else "b-t"
                else:
                    d = ("tl-br" if ax < bx else "br-tl") if (ax < bx) == (ay < by) else ("bl-tr" if ax < bx else "tr-bl")
            if box_pdf is None:
                vis = {"x": min(ax, bx), "y": min(ay, by), "w": abs(bx - ax), "h": abs(by - ay)}
            le = a.line_ends or (0, 0)
            if not hd and (le[1] or le[0]):
                kind = "arrow"
                if le[0] and not le[1]:
                    d = {"tl-br": "br-tl", "br-tl": "tl-br", "bl-tr": "tr-bl", "tr-bl": "bl-tr",
                         "l-r": "r-l", "r-l": "l-r", "t-b": "b-t", "b-t": "t-b"}[d]
    if box_pdf is not None:
        vis = _to_visual(page, box_pdf)
    elif vis is None:
        r = pymupdf.Rect(a.rect)
        w = border.get("width") or 0
        r = pymupdf.Rect(r.x0 + w / 2, r.y0 + w / 2, r.x1 - w / 2, r.y1 - w / 2) if r.width > w and r.height > w else r
        vis = _to_visual(page, r)
    return {
        "xref": a.xref, "page": page.number, "kind": kind, "rect": vis, "dir": d or "tl-br",
        "stroke": _hex(colors.get("stroke")) or "#000000", "fill": _hex(colors.get("fill")) if kind in ("rect", "ellipse") else None,
        "width": border.get("width", 1) if border.get("width", -1) >= 0 else 1,
        "dash": bool(border.get("dashes")), "opacity": a.opacity if a.opacity is not None and a.opacity >= 0 else 1,
    }


@tool("list_shapes")
def list_shapes(ctx: Ctx) -> Result:
    doc = ctx.open()
    shapes = []
    for page in doc:
        for a in page.annots() or []:
            s = _describe_shape(doc, page, a)
            if s:
                shapes.append(s)
    doc.close()
    return Result(data={"shapes": shapes})


@tool("shapes")
def shapes(ctx: Ctx) -> Result:
    """params.items: forme nuove o modificate (con xref = sostituisce quella esistente); params.remove: [{page, xref}]."""
    doc = ctx.open()
    items = ctx.params.get("items") or []
    remove = ctx.params.get("remove") or []
    added = changed = deleted = 0

    def drop(page_no: int, xref: int) -> None:
        page = doc[int(page_no)]
        for a in page.annots() or []:
            if a.xref == int(xref):
                page.delete_annot(a)
                return

    for r in remove:
        drop(r["page"], r["xref"])
        deleted += 1
    for it in items:
        if it.get("xref"):
            drop(it.get("orig_page", it["page"]), it["xref"])
            changed += 1
        else:
            added += 1
        page = doc[int(it["page"])]
        copies = range(doc.page_count) if boolean(it.get("all_pages")) else [int(it["page"])]
        for pn in copies:
            _add_shape(doc, doc[pn], it)
        del page
    if not (added or changed or deleted):
        doc.close()
        raise ToolError("Nessuna forma da applicare.")
    parts = []
    if added:
        parts.append(f"{added} {'forma aggiunta' if added == 1 else 'forme aggiunte'}")
    if changed:
        parts.append(f"{changed} {'modificata' if changed == 1 else 'modificate'}")
    if deleted:
        parts.append(f"{deleted} {'eliminata' if deleted == 1 else 'eliminate'}")
    return Result(pdf=ctx.save(doc), message=(", ".join(parts) + ".").capitalize())


# ------------------------------------------------------------------ commenti e revisioni

COMMENT_TYPES = {"Text": "Nota", "FreeText": "Casella di testo", "Highlight": "Evidenziato", "Underline": "Sottolineato",
                 "StrikeOut": "Barrato", "Squiggly": "Ondulato", "Caret": "Inserimento"}


def _pdf_date(v: str) -> str:
    """D:20260101120000+01'00' -> ISO."""
    v = (v or "").strip()
    if v.startswith("D:"):
        v = v[2:]
    try:
        d = dt.datetime.strptime(v[:14], "%Y%m%d%H%M%S")
        return d.isoformat()
    except ValueError:
        return ""


def _now_pdf() -> str:
    off = dt.datetime.now().astimezone().utcoffset() or dt.timedelta()
    m = int(off.total_seconds() // 60)
    return dt.datetime.now().strftime("D:%Y%m%d%H%M%S") + f"{'+' if m >= 0 else '-'}{abs(m) // 60:02d}'{abs(m) % 60:02d}'"


def _state_of(doc: pymupdf.Document, xref: int) -> tuple[str, str]:
    t, v = doc.xref_get_key(xref, "State")
    m_t, m = doc.xref_get_key(xref, "StateModel")
    return (v.lstrip("/") if t == "name" else "", (m or "").strip("()/") if m_t != "null" else "")


def _words_in(page: pymupdf.Page, r: pymupdf.Rect) -> list[pymupdf.Quad]:
    """Quadrilateri, una riga alla volta, delle parole che cadono nel riquadro."""
    lines: dict[tuple, pymupdf.Rect] = {}
    for x0, y0, x1, y1, _w, b, ln, _n in page.get_text("words"):
        wr = pymupdf.Rect(x0, y0, x1, y1)
        inter = wr & r
        if inter.is_empty or inter.get_area() < 0.4 * wr.get_area():
            continue
        key = (b, ln)
        lines[key] = lines[key] | wr if key in lines else wr
    return [q.quad for q in sorted(lines.values(), key=lambda q: (q.y0, q.x0))]


@tool("page_words")
def page_words(ctx: Ctx) -> Result:
    """Parole di una pagina in ordine di lettura (per selezionare il testo come in Word): r = riquadro visivo, l = riga, t = testo."""
    doc = ctx.open()
    page = doc[int(ctx.params.get("page", 0))]
    words = []
    lines: dict[tuple, int] = {}
    for x0, y0, x1, y1, w, b, ln, _n in page.get_text("words", sort=False):
        if not w.strip():
            continue
        key = (b, ln)
        if key not in lines:
            lines[key] = len(lines)
        words.append({"r": _to_visual(page, pymupdf.Rect(x0, y0, x1, y1)), "l": lines[key], "t": w})
    doc.close()
    return Result(data={"page": page.number, "words": words})


@tool("list_comments")
def list_comments(ctx: Ctx) -> Result:
    doc = ctx.open()
    out = []
    for page in doc:
        for a in page.annots() or []:
            t = a.type[1]
            if t not in COMMENT_TYPES:
                continue
            info = a.info or {}
            state, model = _state_of(doc, a.xref)
            text = ""
            if t in ("Highlight", "Underline", "StrikeOut", "Squiggly"):
                try:
                    text = page.get_textbox(a.rect).strip()
                except Exception:  # noqa: BLE001
                    text = ""
            out.append({
                "xref": a.xref, "nm": info.get("id") or f"x{a.xref}", "page": page.number, "type": t, "label": info.get("subject") or COMMENT_TYPES[t],
                "rect": _to_visual(page, pymupdf.Rect(a.rect)), "author": info.get("title", ""),
                "content": info.get("content", ""), "subject": info.get("subject", ""),
                "date": _pdf_date(info.get("modDate") or info.get("creationDate") or ""),
                "irt": a.irt_xref or 0, "state": state, "state_model": model,
                "color": _hex((a.colors or {}).get("stroke")), "text": " ".join(text.split()),
            })
    doc.close()
    # le risposte di stato (Accettato, Rifiutato…) aggiornano lo stato del commento a cui si riferiscono
    by_xref = {c["xref"]: c for c in out}
    for c in sorted(out, key=lambda c: c["date"]):
        if c["state"] and c["irt"] in by_xref and (c["state_model"] or "Review") == "Review":
            by_xref[c["irt"]]["review"] = c["state"]
            by_xref[c["irt"]]["review_by"] = c["author"]
    return Result(data={"comments": out, "states": STATES})


def _find(doc: pymupdf.Document, xref: int) -> tuple[pymupdf.Page, pymupdf.Annot]:
    for page in doc:
        for a in page.annots() or []:
            if a.xref == int(xref):
                return page, a
    raise ToolError("Commento non trovato (forse è già stato eliminato).")


def _finish(annot: pymupdf.Annot, author: str, content: str, subject: str = "") -> None:
    now = _now_pdf()
    annot.set_info(title=author or "", content=content or "", subject=subject or annot.info.get("subject", ""),
                   modDate=now, creationDate=annot.info.get("creationDate") or now)
    annot.update()


@tool("comments")
def comments(ctx: Ctx) -> Result:
    """Una operazione per chiamata: params.op = note | markup | replace | insert | reply | state | edit | delete."""
    doc = ctx.open()
    p = ctx.params
    op = p.get("op")
    author = (p.get("author") or "").strip()
    text = p.get("text") or ""
    col = color(p.get("color"), None) if p.get("color") else None
    msg = ""
    if op == "note":
        page = doc[int(p["page"])]
        a = page.add_text_annot(point_from(p["point"], page), text, icon=p.get("icon") or "Comment")
        if col:
            a.set_colors(stroke=col)
        _finish(a, author, text, "Nota")
        msg = "Nota aggiunta."
    elif op in ("markup", "replace"):
        page = doc[int(p["page"])]
        if "rects" in p:
            # testo selezionato come in Word: un riquadro per riga, già calcolato sulle parole
            quads = [rect_from(r, page).quad for r in p["rects"] if r.get("w", 0) > 0 and r.get("h", 0) > 0]
        elif p.get("rect"):
            quads = _words_in(page, rect_from(p["rect"], page))
        else:
            quads = []
        if not quads:
            doc.close()
            raise ToolError("Qui non c'è testo da selezionare. Se il PDF è una scansione, esegui prima l'OCR.")
        kind = "strike" if op == "replace" else p.get("kind", "highlight")
        if kind not in MARKUP:
            raise ToolError("Tipo di evidenziazione sconosciuto.")
        a = getattr(page, MARKUP[kind])(quads)
        if col:
            a.set_colors(stroke=col)
        if op == "replace":
            _finish(a, author, f"Sostituire con: {text}" if text else "Eliminare", "Sostituisci testo" if text else "Elimina testo")
            msg = "Proposta di modifica aggiunta."
        else:
            _finish(a, author, text, {"highlight": "Evidenziato", "underline": "Sottolineato", "strike": "Barrato",
                                      "squiggly": "Ondulato"}[kind])
            msg = "Commento aggiunto."
    elif op == "insert":
        page = doc[int(p["page"])]
        pt = point_from(p["point"], page)
        a = page.add_caret_annot(pt)
        if col:
            a.set_colors(stroke=col)
        _finish(a, author, f"Inserire: {text}", "Inserisci testo")
        msg = "Proposta di inserimento aggiunta."
    elif op in ("reply", "state"):
        page, parent = _find(doc, p["xref"])
        r = parent.rect
        a = page.add_text_annot(r.tl, "")
        a.set_irt_xref(parent.xref)
        if op == "state":
            st = p.get("state", "None")
            if st not in STATES:
                raise ToolError("Stato non valido.")
            a.set_flags(pymupdf.PDF_ANNOT_IS_HIDDEN | pymupdf.PDF_ANNOT_IS_NO_VIEW)
            _finish(a, author, f"{author or 'Revisore'} ha impostato lo stato: {STATES[st]}", "Stato revisione")
            # gli stati si salvano come nome PDF (/Accepted…)
            doc.xref_set_key(a.xref, "State", f"/{st}")
            doc.xref_set_key(a.xref, "StateModel", "/Review")
            msg = f"Stato: {STATES[st]}."
        else:
            if not text.strip():
                raise ToolError("Scrivi il testo della risposta.")
            a.set_flags(pymupdf.PDF_ANNOT_IS_HIDDEN | pymupdf.PDF_ANNOT_IS_NO_VIEW)
            _finish(a, author, text, "Risposta")
            msg = "Risposta aggiunta."
    elif op == "edit":
        _page, a = _find(doc, p["xref"])
        _finish(a, author or a.info.get("title", ""), text)
        msg = "Commento modificato."
    elif op == "delete":
        page, a = _find(doc, p["xref"])
        target = a.xref
        # elimina anche risposte e stati collegati
        for pg in doc:
            for r in list(pg.annots() or []):
                if r.irt_xref == target:
                    pg.delete_annot(r)
        page, a = _find(doc, target)
        page.delete_annot(a)
        msg = "Commento eliminato."
    else:
        doc.close()
        raise ToolError("Operazione sui commenti sconosciuta.")
    return Result(pdf=ctx.save(doc), message=msg)
