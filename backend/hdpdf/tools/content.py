"""Strumenti sul contenuto: modifica/aggiungi testo, immagini, allegati, filigrana,
timbri, firme grafiche, oscuramento."""
from __future__ import annotations

import datetime as dt
import io
import re

import pymupdf

from .. import fonts
from ..store import store
from .applicati import marca, nuovo_id
from .base import (MM, Ctx, Result, ToolError, boolean, color, num, parse_pages, point_from,
                   position_rect, rect_from, tool, visual_rect)

# ------------------------------------------------------------------ helper


def _vis(page: pymupdf.Page, r) -> list[float]:
    """Da coordinate interne (non ruotate) a coordinate visive per la UI."""
    rr = pymupdf.Rect(r) * page.rotation_matrix
    rr.normalize()
    return [round(v, 2) for v in rr]


def _rotazione(d: pymupdf.Point) -> int | None:
    """Rotazione di insert_text che scrive nella direzione d (solo multipli di 90°; None per righe oblique)."""
    for rot, (dx, dy) in ((0, (1, 0)), (90, (0, -1)), (180, (-1, 0)), (270, (0, 1))):
        if abs(d.x - dx) < 0.05 and abs(d.y - dy) < 0.05:
            return rot
    return None


def _fascia(r: pymupdf.Rect, origin: pymupdf.Point, d: pymupdf.Point, size: float, da: float, a: float) -> pymupdf.Rect:
    """Fascia lunga quanto la riga r, da «da» ad «a» volte il corpo sopra la linea di base (verso la parte alta delle
    lettere). Coordinate interne; d = direzione della riga."""
    su = pymupdf.Point(d.y, -d.x)   # verso la parte alta delle lettere
    p, q = origin + su * (size * da), origin + su * (size * a)
    if abs(d.x) >= abs(d.y):   # riga orizzontale
        return pymupdf.Rect(r.x0, min(p.y, q.y), r.x1, max(p.y, q.y))
    return pymupdf.Rect(min(p.x, q.x), r.y0, max(p.x, q.x), r.y1)


def write_lines(page: pymupdf.Page, box: pymupdf.Rect, text: str, font_id: str, size: float,
                col, opacity: float = 1.0, align: str = "left", line_spacing: float = 1.2,
                angle: float = 0, wrap: bool = True, font_override=None) -> float:
    """Scrive testo multilinea dentro un box in coordinate visive, con a capo
    automatico. Restituisce l'altezza usata. font_override=(nome risorsa, Font) per usare
    un carattere già registrato sulla pagina (es. quello originale del PDF)."""
    if font_override:
        fname, font = font_override
    else:
        fname = fonts.ensure_on_page(page, font_id)
        font = fonts.font_object(font_id)
    lines: list[str] = []
    for raw in str(text).split("\n"):
        if not wrap or box.width <= 0:
            lines.append(raw)
            continue
        words, cur = raw.split(" "), ""
        for w in words:
            cand = (cur + " " + w) if cur else w
            if font.text_length(cand, size) <= box.width or not cur:
                cur = cand
            else:
                lines.append(cur)
                cur = w
        lines.append(cur)
    y = box.y0 + size * font.ascender if font.ascender else box.y0 + size * 0.8
    center = pymupdf.Point((box.x0 + box.x1) / 2, (box.y0 + box.y1) / 2)
    for ln in lines:
        tw = font.text_length(ln, size)
        x = box.x0
        if align == "center":
            x = box.x0 + (box.width - tw) / 2
        elif align == "right":
            x = box.x1 - tw
        p = pymupdf.Point(x, y) * page.derotation_matrix
        morph = (center * page.derotation_matrix, pymupdf.Matrix(-angle)) if angle else None
        if ln:
            page.insert_text(p, ln, fontname=fname, fontsize=size, color=col, rotate=page.rotation,
                             fill_opacity=opacity, morph=morph)
        y += size * line_spacing
    return y - box.y0


def _image_bytes(item, opacity: float = 1.0, max_px: int | None = None) -> bytes:
    data = item.path.read_bytes()
    if opacity >= 1 and not max_px:
        return data
    from PIL import Image

    im = Image.open(io.BytesIO(data)).convert("RGBA")
    if max_px and max(im.size) > max_px:
        im.thumbnail((max_px, max_px))
    if opacity < 1:
        a = im.getchannel("A").point(lambda v: int(v * opacity))
        im.putalpha(a)
    buf = io.BytesIO()
    im.save(buf, "PNG")
    return buf.getvalue()


# ------------------------------------------------------------ testo


@tool("text_spans")
def text_spans(ctx: Ctx) -> Result:
    """Elenca le righe di testo di una pagina (per l'editor di testo).
    Ogni riga unisce i suoi span; carattere, corpo e colore sono quelli prevalenti."""
    doc = ctx.open()
    pno = int(num(ctx.params.get("page"), 0))
    pg = doc[pno]
    out = []
    d = pg.get_text("dict", flags=pymupdf.TEXT_PRESERVE_WHITESPACE)
    for b in d["blocks"]:
        for li, line in enumerate(b.get("lines", [])):
            spans = [sp for sp in line["spans"] if sp["text"]]
            text = "".join(sp["text"] for sp in spans)
            if not text.strip():
                continue
            main = max(spans, key=lambda sp: len(sp["text"].strip()))
            # bbox senza gli spazi iniziali/finali
            bbox = pymupdf.Rect()
            for sp in spans:
                if sp["text"].strip():
                    bbox |= pymupdf.Rect(sp["bbox"])
            first = next(sp for sp in spans if sp["text"].strip())
            # riquadro stretto delle lettere: quello della riga dipende da ascendente e discendente dichiarati dal
            # carattere (in alcuni font più del doppio del corpo) e coprirebbe le righe vicine nell'anteprima
            corpo = max(sp["size"] for sp in spans)
            ink = _fascia(bbox, pymupdf.Point(first["origin"]), pymupdf.Point(line["dir"]), corpo, -0.3, 1.0) & bbox
            out.append({
                "id": f"{b['number']}-{li}",
                "text": text.strip(),
                "bbox": _vis(pg, bbox),
                "origin": list(pymupdf.Point(first["origin"]) * pg.rotation_matrix),
                "font": main["font"],
                "size": round(main["size"], 2),
                "color": "#%06x" % main["color"],
                "flags": main["flags"],
                "dir": list(line["dir"]),
                "ink": _vis(pg, ink if not ink.is_empty else bbox),
                "suggested_font": fonts.match_system_font(main["font"], main["flags"]),
            })
    doc.close()
    return Result(data={"page": pno, "spans": out})


def _original_font(doc: pymupdf.Document, page: pymupdf.Page, fontname: str, text: str) -> str | None:
    """Prova a riusare il font incorporato originale se contiene tutti i glifi."""
    for f in page.get_fonts(full=True):
        xref, _, _, basefont = f[0], f[1], f[2], f[3]
        if basefont.split("+")[-1] != fontname.split("+")[-1]:
            continue
        try:
            name, ext, _, buf = doc.extract_font(xref)
            if not buf or ext in ("n/a", ""):
                return None
            fo = pymupdf.Font(fontbuffer=buf)
            if all(fo.has_glyph(ord(ch)) for ch in text if not ch.isspace()):
                return f"orig{xref}", buf  # type: ignore[return-value]
        except Exception:
            return None
    return None


def _righe(pg: pymupdf.Page) -> list[dict]:
    """Righe della pagina come le elenca text_spans: riquadro (senza spazi ai lati), direzione, linea di base della
    prima parte scritta e corpo più grande. Coordinate interne."""
    out = []
    for b in pg.get_text("dict", flags=pymupdf.TEXT_PRESERVE_WHITESPACE)["blocks"]:
        for line in b.get("lines", []):
            spans = [sp for sp in line["spans"] if sp["text"].strip()]
            if not spans:
                continue
            r = pymupdf.Rect()
            for sp in spans:
                r |= pymupdf.Rect(sp["bbox"])
            out.append({"bbox": r, "dir": pymupdf.Point(line["dir"]), "origin": pymupdf.Point(spans[0]["origin"]),
                        "size": max(sp["size"] for sp in spans)})
    return out


def _riga_di(pg: pymupdf.Page, e: dict, righe: list[dict]) -> dict | None:
    """La riga del documento che si sta modificando: quella con lo stesso riquadro."""
    r = rect_from(e["bbox"], pg)
    return next((x for x in righe if all(abs(u - v) < 1 for u, v in zip(x["bbox"], r))), None)


def _scansa(f: pymupdf.Rect, oriz: bool, altre: list[pymupdf.Rect]) -> pymupdf.Rect:
    """Toglie dalla fascia la parte che tocca i riquadri di altre righe (righe molto fitte o con caratteri «alti»),
    se ne resta un pezzo: ogni lettera della riga lo tocca comunque."""
    pezzi = [(f.y0, f.y1) if oriz else (f.x0, f.x1)]
    for o in altre:
        if not f.intersects(o):
            continue
        l0, l1 = (o.y0, o.y1) if oriz else (o.x0, o.x1)
        resto = []
        for p0, p1 in pezzi:
            if l1 <= p0 or l0 >= p1:
                resto.append((p0, p1))
                continue
            if l0 > p0:
                resto.append((p0, l0))
            if l1 < p1:
                resto.append((l1, p1))
        pezzi = resto
    pezzi = [x for x in pezzi if x[1] - x[0] > 0.2]
    if not pezzi:
        return f   # righe sovrapposte davvero: non si può evitare
    p0, p1 = max(pezzi, key=lambda x: x[1] - x[0])
    return pymupdf.Rect(f.x0, p0, f.x1, p1) if oriz else pymupdf.Rect(p0, f.y0, p1, f.y1)


def _area_da_cancellare(pg: pymupdf.Page, e: dict, riga: dict | None, righe: list[dict]) -> pymupdf.Rect:
    """Area con cui si cancella la riga originale (coordinate interne). MuPDF toglie ogni lettera il cui riquadro la
    tocca: basta una fascia sottile all'altezza delle minuscole. Non si usa il riquadro intero della riga: la sua
    altezza dipende da ascendente e discendente dichiarati dal carattere, che in alcuni font (Segoe Print, Javanese
    Text…) valgono più del doppio del corpo, e cancellerebbe anche le righe vicine.
    Direzione, linea di base e corpo si prendono dalla riga nel documento (_riga_di)."""
    r = rect_from(e["bbox"], pg)
    if riga:
        d, origin, corpo = riga["dir"], riga["origin"], riga["size"]
        oriz = abs(d.x) >= abs(d.y)
        f = _fascia(r, origin, d, corpo, 0.1, 0.6) & r
        if not f.is_empty:
            f += (0.3, 0, -0.3, 0) if oriz else (0, 0.3, 0, -0.3)
            return _scansa(f, oriz, [x["bbox"] for x in righe if x is not riga])
    # riga non trovata: riquadro ristretto un poco (vecchio metodo)
    shrink = min(r.height * 0.2, 1.5)
    return r + (0.3, shrink, -0.3, -shrink)


@tool("edit_text")
def edit_text(ctx: Ctx) -> Result:
    """params.edits: [{page, bbox (visivo, testo originale), origin, rect (nuova casella, facoltativa),
    text, font, size, color, align, original_font, flags}]
    font = id di un font del catalogo oppure "original" per riusare quello del PDF.
    Se la casella non è stata spostata/ridimensionata e il testo sta su una riga, viene
    riscritto sulla stessa linea di base; altrimenti va a capo dentro la nuova casella."""
    doc = ctx.open()
    edits = ctx.params.get("edits") or []
    if not edits:
        raise ToolError("Nessuna modifica da applicare.")
    by_page: dict[int, list] = {}
    for e in edits:
        by_page.setdefault(int(e["page"]), []).append(e)
    for pno, items in by_page.items():
        pg = doc[pno]
        righe = _righe(pg)
        dirs = {}
        for i, e in enumerate(items):
            riga = _riga_di(pg, e, righe)
            pg.add_redact_annot(_area_da_cancellare(pg, e, riga, righe), fill=False)
            if riga:
                dirs[i] = riga["dir"]
        pg.apply_redactions(images=pymupdf.PDF_REDACT_IMAGE_NONE,
                            graphics=pymupdf.PDF_REDACT_LINE_ART_NONE)
        for i, e in enumerate(items):
            text = (e.get("text") or "").rstrip()
            if not text.strip():
                continue
            size = num(e.get("size"), 11)
            col = color(e.get("color"))
            font_id = e.get("font") or "original"
            fontname = None
            fo = None
            if font_id == "original":
                got = _original_font(doc, pg, e.get("original_font", ""), text)
                if got:
                    fontname, buf = got
                    pg.insert_font(fontname=fontname, fontbuffer=buf)
                    fo = pymupdf.Font(fontbuffer=buf)
                else:
                    font_id = fonts.match_system_font(e.get("original_font", ""), int(e.get("flags", 0)))
            if fontname is None:
                fontname = fonts.ensure_on_page(pg, font_id)
                fo = fonts.font_object(font_id)
            orig_box = rect_from(e["bbox"])
            new_box = rect_from(e["rect"]) if e.get("rect") else orig_box
            moved = abs(new_box.x0 - orig_box.x0) > 1 or abs(new_box.y0 - orig_box.y0) > 1 \
                or abs(new_box.width - orig_box.width) > 1
            wrap = boolean(e.get("wrap"), False) or "\n" in text
            if not moved and not wrap:
                tw = fo.text_length(text, size)
                if boolean(e.get("fit"), False) and tw > orig_box.width > 0:
                    # riduce il corpo per restare nella larghezza originale
                    size = max(size * orig_box.width / tw, size * 0.6)
                p = point_from(e["origin"], pg) if e.get("origin") else \
                    pymupdf.Point(orig_box.x0, orig_box.y1 - size * 0.22) * pg.derotation_matrix
                # stessa direzione della riga originale: su una pagina ruotata il testo può essere scritto in un
                # verso diverso da quello della pagina e, riscritto al contrario, finirebbe fuori dal foglio
                rot = _rotazione(dirs[i]) if i in dirs and e.get("origin") else None
                pg.insert_text(p, text, fontname=fontname, fontsize=size, color=col,
                               rotate=pg.rotation if rot is None else rot)
            elif not wrap:
                # casella spostata ma testo su una riga: stessa riga, nuova posizione
                write_lines(pg, new_box, text, font_id, size, col, align=e.get("align", "left"),
                            font_override=(fontname, fo), wrap=False)
            else:
                write_lines(pg, new_box, text, font_id, size, col, align=e.get("align", "left"),
                            font_override=(fontname, fo))
    return Result(pdf=ctx.save(doc, garbage=4), message=f"Modificati {len(edits)} blocchi di testo.")


@tool("add_text")
def add_text(ctx: Ctx) -> Result:
    """params.items: [{page, rect|x,y, text, font, size, color, opacity, align, angle}]"""
    doc = ctx.open()
    items = ctx.params.get("items") or ([ctx.params] if ctx.params.get("text") else [])
    if not items:
        raise ToolError("Scrivi il testo da aggiungere.")
    for it in items:
        pages = parse_pages(it.get("pages"), doc.page_count) if it.get("pages") else [int(num(it.get("page"), 0))]
        gid = nuovo_id()
        testo = " ".join(str(it.get("text", "")).split())
        for pno in pages:
            pg = doc[pno]
            if it.get("rect"):
                box = rect_from(it["rect"])
            else:
                x, y = num(it.get("x"), 50), num(it.get("y"), 50)
                box = pymupdf.Rect(x, y, visual_rect(pg).x1 - 20, visual_rect(pg).y1)
            # testo aggiunto: si può eliminare dopo (riquadro alto quanto le righe scritte)
            with marca(pg, "testo", testo, gid=gid) as m:
                h = write_lines(pg, box, it.get("text", ""), it.get("font") or "helv", num(it.get("size"), 12),
                                color(it.get("color")), num(it.get("opacity"), 1), it.get("align", "left"),
                                angle=num(it.get("angle"), 0), wrap=boolean(it.get("wrap"), True))
                m.rect = pymupdf.Rect(box.x0, box.y0, box.x1, box.y0 + max(h, 1))
    return Result(pdf=ctx.save(doc), message="Testo aggiunto.")


# ------------------------------------------------------------ immagini


@tool("list_images")
def list_images(ctx: Ctx) -> Result:
    doc = ctx.open()
    out = []
    for pno, pg in enumerate(doc):
        for info in pg.get_image_info(xrefs=True):
            out.append({"page": pno, "xref": info.get("xref", 0), "bbox": _vis(pg, info["bbox"]),
                        "width": info.get("width"), "height": info.get("height")})
    doc.close()
    return Result(data={"images": out})


@tool("add_image")
def add_image(ctx: Ctx) -> Result:
    doc = ctx.open()
    asset = ctx.asset("image")
    opacity = num(ctx.params.get("opacity"), 1)
    data = _image_bytes(asset, opacity)
    pages = parse_pages(ctx.params.get("pages"), doc.page_count) if ctx.params.get("pages") \
        else [int(num(ctx.params.get("page"), 0))]
    keep = boolean(ctx.params.get("keep_proportion"), True)
    behind = boolean(ctx.params.get("behind"), False)
    for pno in pages:
        pg = doc[pno]
        if ctx.params.get("rect"):
            r = rect_from(ctx.params["rect"], pg)
        else:
            w = num(ctx.params.get("width"), 50) * MM
            pix = pymupdf.Pixmap(data)
            h = w * pix.height / pix.width
            r = rect_from(position_rect(visual_rect(pg), w, h, ctx.params.get("position", "centro"),
                                        num(ctx.params.get("margin"), 15) * MM), pg)
        pg.insert_image(r, stream=data, keep_proportion=keep, overlay=not behind,
                        rotate=int(num(ctx.params.get("rotate"), 0)) % 360)
    return Result(pdf=ctx.save(doc), message="Immagine aggiunta.")


@tool("remove_images")
def remove_images(ctx: Ctx) -> Result:
    """Rimuove tutte le immagini delle pagine scelte, oppure solo params.xrefs."""
    doc = ctx.open()
    pages = parse_pages(ctx.params.get("pages"), doc.page_count)
    only = {int(x) for x in ctx.params.get("xrefs") or []}
    removed = 0
    for pno in pages:
        pg = doc[pno]
        rects = []
        for img in pg.get_images(full=True):
            xref = img[0]
            if only and xref not in only:
                continue
            rects += pg.get_image_rects(xref)
            removed += 1
        for r in rects:
            pg.add_redact_annot(r, fill=False)
        if rects:
            pg.apply_redactions(images=pymupdf.PDF_REDACT_IMAGE_REMOVE,
                                graphics=pymupdf.PDF_REDACT_LINE_ART_NONE,
                                text=pymupdf.PDF_REDACT_TEXT_NONE)
    if not removed:
        raise ToolError("Nessuna immagine trovata nelle pagine selezionate.")
    return Result(pdf=ctx.save(doc, garbage=4), message=f"Rimosse {removed} immagini.")


@tool("images")
def images(ctx: Ctx) -> Result:
    """Strumento Immagini: rimuove le immagini indicate (params.remove [{page, xref}] o
    params.remove_all) e inserisce quelle nuove (params.items [{image, page, rect, opacity,
    behind, all_pages, keep_proportion}])."""
    doc = ctx.open()
    removed = 0
    targets: dict[int, set] = {}
    if boolean(ctx.params.get("remove_all")):
        for pno in range(doc.page_count):
            targets[pno] = {img[0] for img in doc[pno].get_images(full=True)}
    areas: dict[int, list] = {}
    for t in ctx.params.get("remove") or []:
        if t.get("rect"):
            areas.setdefault(int(t["page"]), []).append(t["rect"])
        else:
            targets.setdefault(int(t["page"]), set()).add(int(t["xref"]))
    for pno in set(targets) | set(areas):
        pg = doc[pno]
        xrefs = targets.get(pno, set())
        rects = [r for x in xrefs for r in pg.get_image_rects(x)]
        rects += [rect_from(a, pg) + (1, 1, -1, -1) for a in areas.get(pno, [])]
        if areas.get(pno):
            xrefs = xrefs | {f"a{i}" for i in range(len(areas[pno]))}
        for r in rects:
            pg.add_redact_annot(r, fill=False)
        if rects:
            pg.apply_redactions(images=pymupdf.PDF_REDACT_IMAGE_REMOVE,
                                graphics=pymupdf.PDF_REDACT_LINE_ART_NONE,
                                text=pymupdf.PDF_REDACT_TEXT_NONE)
            removed += len(xrefs)
    added = 0
    cache: dict[tuple, bytes] = {}
    for it in ctx.params.get("items") or []:
        aid = it.get("image")
        if not aid:
            continue
        opacity = num(it.get("opacity"), 1)
        key = (aid, round(opacity, 2))
        if key not in cache:
            cache[key] = _image_bytes(store.get(aid), opacity)
        data = cache[key]
        pages = range(doc.page_count) if boolean(it.get("all_pages")) else [int(num(it.get("page"), 0))]
        for pno in pages:
            pg = doc[pno]
            pg.insert_image(rect_from(it["rect"], pg), stream=data,
                            keep_proportion=boolean(it.get("keep_proportion"), True),
                            overlay=not boolean(it.get("behind"), False), rotate=0)
            added += 1
    if not removed and not added:
        raise ToolError("Nessuna modifica: inserisci o rimuovi almeno un'immagine.")
    parts = []
    if added:
        parts.append("1 immagine inserita" if added == 1 else f"{added} immagini inserite")
    if removed:
        parts.append("1 immagine rimossa" if removed == 1 else f"{removed} immagini rimosse")
    return Result(pdf=ctx.save(doc, garbage=4), message=", ".join(parts) + ".")


# ------------------------------------------------------------ allegati


@tool("attach")
def attach(ctx: Ctx) -> Result:
    doc = ctx.open()
    ids = ctx.params.get("files") or []
    if isinstance(ids, str):
        ids = [ids]
    if not ids and not ctx.params.get("remove"):
        raise ToolError("Scegli almeno un file da allegare.")
    existing = set(doc.embfile_names())
    for name in ctx.params.get("remove") or []:
        if name in existing:
            doc.embfile_del(name)
    for aid in ids:
        it = store.get(aid)
        name = it.name
        k = 2
        while name in doc.embfile_names():
            stem, _, ext = it.name.rpartition(".")
            name = f"{stem} ({k}).{ext}" if stem else f"{it.name} ({k})"
            k += 1
        doc.embfile_add(name, it.path.read_bytes(), filename=it.name,
                        desc=ctx.params.get("description") or "")
    return Result(pdf=ctx.save(doc), message=f"Allegati {len(ids)} file.")


# ------------------------------------------------------------ filigrana


@tool("watermark")
def watermark(ctx: Ctx) -> Result:
    doc = ctx.open()
    kind = ctx.params.get("type", "text")
    pages = parse_pages(ctx.params.get("pages"), doc.page_count)
    opacity = num(ctx.params.get("opacity"), 0.3)
    angle = num(ctx.params.get("angle"), 45)
    tiled = ctx.params.get("layout", "center") == "tiled"
    behind = boolean(ctx.params.get("behind"), False)
    gid = nuovo_id()
    if kind == "text":
        text = ctx.params.get("text") or "RISERVATO"
        font_id = ctx.params.get("font") or "hebo"
        size = num(ctx.params.get("size"), 60)
        col = color(ctx.params.get("color"), (0.6, 0.6, 0.6))
        font = fonts.font_object(font_id)
        tw = font.text_length(text, size)
        for pno in pages:
            pg = doc[pno]
            fname = fonts.ensure_on_page(pg, font_id)
            vr = visual_rect(pg)
            centers = []
            if tiled:
                gap_x = tw + num(ctx.params.get("spacing"), 40)
                gap_y = size * 3 + num(ctx.params.get("spacing"), 40)
                y = vr.y0 - gap_y / 2
                row = 0
                while y < vr.y1 + gap_y:
                    x = vr.x0 - gap_x / 2 + (gap_x / 2 if row % 2 else 0)
                    while x < vr.x1 + gap_x:
                        centers.append(pymupdf.Point(x, y))
                        x += gap_x
                    y += gap_y
                    row += 1
            else:
                centers.append(pymupdf.Point(vr.width / 2, vr.height / 2))
            with marca(pg, "filigrana", text, gid=gid):
                for c in centers:
                    start = pymupdf.Point(c.x - tw / 2, c.y + size * 0.35)
                    p = start * pg.derotation_matrix
                    pc = c * pg.derotation_matrix
                    pg.insert_text(p, text, fontname=fname, fontsize=size, color=col, rotate=pg.rotation,
                                   fill_opacity=opacity, stroke_opacity=opacity,
                                   morph=(pc, pymupdf.Matrix(-angle)), overlay=not behind)
    else:
        asset = ctx.asset("image")
        data = _image_bytes(asset, opacity)
        scale = num(ctx.params.get("scale"), 50) / 100
        pix = pymupdf.Pixmap(data)
        for pno in pages:
            pg = doc[pno]
            vr = visual_rect(pg)
            w = vr.width * scale
            h = w * pix.height / pix.width
            spots = []
            if tiled:
                y = vr.y0 + 10
                while y < vr.y1:
                    x = vr.x0 + 10
                    while x < vr.x1:
                        spots.append(pymupdf.Rect(x, y, x + w, y + h))
                        x += w * 1.3
                    y += h * 1.5
            else:
                spots.append(position_rect(vr, w, h, "centro", 0))
            with marca(pg, "filigrana", "Immagine", gid=gid):
                for r in spots:
                    pg.insert_image(rect_from(r, pg), stream=data, overlay=not behind,
                                    rotate=int(round(angle / 90) * 90) % 360 if angle % 90 == 0 else 0)
    flatten = boolean(ctx.params.get("to_image"), False)
    if flatten:
        from .security import rasterize_doc
        doc = rasterize_doc(doc, int(num(ctx.params.get("dpi"), 150)))
    return Result(pdf=ctx.save(doc), message="Filigrana applicata.")


# ------------------------------------------------------------ timbro

STAMP_PRESETS = {
    "approvato": ("APPROVATO", "#1a7f37"),
    "respinto": ("RESPINTO", "#cf222e"),
    "bozza": ("BOZZA", "#6e7781"),
    "ricevuto": ("RICEVUTO", "#0969da"),
    "riservato": ("RISERVATO", "#cf222e"),
    "copia": ("COPIA CONFORME", "#0969da"),
    "pagato": ("PAGATO", "#1a7f37"),
    "annullato": ("ANNULLATO", "#cf222e"),
    "visto": ("VISTO", "#8250df"),
}


def draw_stamp(page: pymupdf.Page, box: pymupdf.Rect, lines: list[str], col, font_id: str,
               opacity: float, angle: float, border: bool = True, double: bool = True) -> None:
    """Disegna un timbro vettoriale (riquadro + testo centrato) in coordinate visive."""
    font = fonts.font_object(font_id)
    fname = fonts.ensure_on_page(page, font_id)
    center = pymupdf.Point((box.x0 + box.x1) / 2, (box.y0 + box.y1) / 2) * page.derotation_matrix
    morph = (center, pymupdf.Matrix(-angle)) if angle else None
    r = rect_from(box, page)
    if border:
        page.draw_rect(r, color=col, width=2.2, stroke_opacity=opacity, morph=morph, radius=0.08)
        if double:
            page.draw_rect(r + (3.5, 3.5, -3.5, -3.5), color=col, width=0.8, stroke_opacity=opacity,
                           morph=morph, radius=0.06)
    main, *rest = lines
    pad = 10
    size_main = min(box.height * (0.55 if rest else 0.7), 200)
    while font.text_length(main, size_main) > box.width - 2 * pad and size_main > 4:
        size_main -= 0.5
    size_sub = size_main * 0.38
    total_h = size_main + sum(size_sub * 1.25 for _ in rest)
    y = box.y0 + (box.height - total_h) / 2 + size_main * 0.8
    for i, ln in enumerate([main] + rest):
        s = size_main if i == 0 else size_sub
        while font.text_length(ln, s) > box.width - 2 * pad and s > 4:
            s -= 0.5
        tw = font.text_length(ln, s)
        p = pymupdf.Point(box.x0 + (box.width - tw) / 2, y) * page.derotation_matrix
        page.insert_text(p, ln, fontname=fname, fontsize=s, color=col, rotate=page.rotation,
                         fill_opacity=opacity, morph=morph)
        y += (size_sub * 1.25) if i == 0 else s * 1.25
        if i == 0:
            y += size_sub * 0.2


def _stamp_lines(params: dict) -> tuple[list[str], tuple]:
    preset = STAMP_PRESETS.get(params.get("preset", ""), None)
    text = params.get("text") or (preset[0] if preset else "APPROVATO")
    col = color(params.get("color") or (preset[1] if preset else "#cf222e"))
    lines = [text]
    sub = params.get("subtext")
    if sub:
        lines += str(sub).split("\n")
    if boolean(params.get("date"), True):
        fmt = params.get("date_format") or "%d/%m/%Y"
        lines.append(dt.datetime.now().strftime(fmt))
    return lines, col


@tool("stamp")
def stamp(ctx: Ctx) -> Result:
    """Timbro di testo o immagine. Una posizione (page/rect o posizione predefinita) oppure, come per la firma,
    più timbri: params.items = [{page, rect, all_pages}] con le stesse impostazioni."""
    doc = ctx.open()
    kind = ctx.params.get("type", "text")
    opacity = num(ctx.params.get("opacity"), 0.85)
    angle = num(ctx.params.get("angle"), 0)
    w = num(ctx.params.get("width"), 70) * MM
    h = num(ctx.params.get("height"), 25) * MM
    # elenco (pagina, riquadro o None)
    places: list[tuple[int, object]] = []
    if ctx.params.get("items"):
        for it in ctx.params["items"]:
            pgs = range(doc.page_count) if boolean(it.get("all_pages"), False) else [int(num(it.get("page"), 0))]
            places += [(p, it.get("rect")) for p in pgs]
    else:
        pages = parse_pages(ctx.params.get("pages"), doc.page_count) if ctx.params.get("pages") \
            else [int(num(ctx.params.get("page"), 0))]
        places = [(p, ctx.params.get("rect")) for p in pages]
    if not places:
        raise ToolError("Tocca la pagina per posizionare il timbro.")
    lines, col = _stamp_lines(ctx.params)
    image = _image_bytes(ctx.asset("image"), opacity) if kind == "image" else None
    # stesso Id per le copie dello stesso timbro (Ripeti su tutte le pagine): si eliminano anche tutte insieme
    gids: dict = {}
    nome = "Immagine" if kind == "image" else " · ".join(lines)
    for pno, rect in places:
        if not 0 <= pno < doc.page_count:
            continue
        pg = doc[pno]
        if rect:
            box = rect_from(rect)
        else:
            box = position_rect(visual_rect(pg), w, h, ctx.params.get("position", "alto-destra"),
                                num(ctx.params.get("margin"), 15) * MM)
        gid = gids.setdefault(repr(rect), nuovo_id())
        with marca(pg, "timbro", nome, box, gid):
            if image is not None:
                pg.insert_image(rect_from(box, pg), stream=image, keep_proportion=True)
            else:
                draw_stamp(pg, box, lines, col, ctx.params.get("font") or "hebo", opacity, angle,
                           border=boolean(ctx.params.get("border"), True))
    n = len({p for p, _ in places})
    return Result(pdf=ctx.save(doc), message=f"Timbro applicato a {n} {'pagina' if n == 1 else 'pagine'}.")


@tool("stamp_preview", needs_doc=False)
def stamp_preview(ctx: Ctx) -> Result:
    """Anteprima del timbro di testo (PNG trasparente) per posizionarlo sulla pagina prima di applicarlo."""
    import base64
    w = num(ctx.params.get("width"), 70) * MM
    h = num(ctx.params.get("height"), 25) * MM
    lines, col = _stamp_lines(ctx.params)
    tmp = pymupdf.open()
    pg = tmp.new_page(width=w, height=h)
    draw_stamp(pg, pg.rect, lines, col, ctx.params.get("font") or "hebo", 1.0, num(ctx.params.get("angle"), 0),
               border=boolean(ctx.params.get("border"), True))
    png = pg.get_pixmap(dpi=144, alpha=True).tobytes("png")
    tmp.close()
    return Result(data={"image": "data:image/png;base64," + base64.b64encode(png).decode(), "w": w, "h": h})


# ------------------------------------------------------------ firma grafica


def _place_signature(pg: pymupdf.Page, it: dict, image_cache: dict, gid: str | None = None) -> None:
    box = rect_from(it["rect"])
    kind = it.get("type", "draw")
    nome = {"draw": "Firma disegnata", "image": "Firma da immagine"}.get(kind) or f"Firma: {it.get('text') or ''}"
    caption = boolean(it.get("caption"), False)
    area = box | pymupdf.Rect(box.x0, box.y1, box.x1 + 80, box.y1 + 20) if caption else box
    with marca(pg, "firma", nome, area, gid):
        _draw_signature(pg, it, box, kind, image_cache, caption)


def _draw_signature(pg: pymupdf.Page, it: dict, box: pymupdf.Rect, kind: str, image_cache: dict, caption: bool) -> None:
    if kind in ("draw", "image"):
        aid = it.get("image")
        if not aid:
            raise ToolError("Manca l'immagine della firma.")
        if aid not in image_cache:
            image_cache[aid] = _image_bytes(store.get(aid), 1.0)
        pg.insert_image(rect_from(box, pg), stream=image_cache[aid], keep_proportion=True)
    else:
        text = it.get("text") or ""
        if not text.strip():
            raise ToolError("Scrivi il nome da usare come firma.")
        font_id = it.get("font") or "tiit"
        font = fonts.font_object(font_id)
        size = num(it.get("size"), 0) or box.height * 0.7
        while font.text_length(text, size) > box.width * 1.02 and size > 5:
            size -= 0.5
        y_box = pymupdf.Rect(box.x0, box.y0 + max((box.height - size * 1.2) / 2, 0), box.x1, box.y1)
        write_lines(pg, y_box, text, font_id, size, color(it.get("color"), (0.05, 0.1, 0.45)),
                    align=it.get("align", "center"), wrap=False)
    if caption:
        cap = it.get("caption_text") or f"Firmato il {dt.datetime.now():%d/%m/%Y %H:%M}"
        write_lines(pg, pymupdf.Rect(box.x0, box.y1 + 2, box.x1 + 80, box.y1 + 20), cap, "helv", 7,
                    (0.3, 0.3, 0.3), wrap=False)


@tool("sign_visual")
def sign_visual(ctx: Ctx) -> Result:
    """Firme grafiche (disegnate, da immagine o da testo). params.items: [{type, image, text,
    font, size, color, page, rect, all_pages, caption}] oppure i campi di una sola firma."""
    doc = ctx.open()
    items = ctx.params.get("items")
    if not items:
        if not ctx.params.get("rect"):
            raise ToolError("Indica sulla pagina dove posizionare la firma.")
        items = [{**ctx.params, "all_pages": bool(ctx.params.get("pages"))}]
    cache: dict = {}
    count = 0
    for it in items:
        if it.get("pages"):
            pages = parse_pages(it["pages"], doc.page_count)
        elif boolean(it.get("all_pages")):
            pages = list(range(doc.page_count))
        else:
            pages = [int(num(it.get("page"), 0))]
        gid = nuovo_id()   # la sigla ripetuta su tutte le pagine è un oggetto solo
        for p in pages:
            _place_signature(doc[p], it, cache, gid)
            count += 1
    return Result(pdf=ctx.save(doc), message="Firma inserita." if count == 1 else f"Inserite {count} firme.")


# ------------------------------------------------------------ oscuramento

REDACT_PRESETS = {
    "email": r"[\w.+-]+@[\w-]+\.[\w.-]+",
    "telefono": r"(?:\+39[\s.]?)?(?:3\d{2}|0\d{1,3})[\s.-]?\d{3,4}[\s.-]?\d{3,4}",
    "codice_fiscale": r"\b[A-Z]{6}\d{2}[A-EHLMPR-T]\d{2}[A-Z]\d{3}[A-Z]\b",
    "partita_iva": r"\b(?:IT)?\d{11}\b",
    "iban": r"\b[A-Z]{2}\d{2}(?:\s?[A-Z0-9]{4}){3,7}(?:\s?[A-Z0-9]{1,4})?\b",
    "carta": r"\b(?:\d[ -]?){13,19}\b",
    "data": r"\b\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}\b",
}


def _find_matches(doc: pymupdf.Document, pages: list[int], terms: list[str], patterns: list[str],
                  case: bool) -> list[dict]:
    found = []
    for pno in pages:
        pg = doc[pno]
        for t in terms:
            t = t.strip()
            if not t:
                continue
            rects = pg.search_for(t)  # sempre case-insensitive in MuPDF
            if case:
                rects = [r for r in rects if t in pg.get_textbox(r + (-1, -1, 1, 1))]
            for r in rects:
                found.append({"page": pno, "rect": _vis(pg, r), "text": t})
        if patterns:
            words = pg.get_text("words")
            # ricostruisce righe con posizioni carattere per regex multi-parola
            lines: dict[tuple, list] = {}
            for w in words:
                lines.setdefault((w[5], w[6]), []).append(w)
            for ws in lines.values():
                text, spans = "", []
                for w in ws:
                    if text:
                        text += " "
                    spans.append((len(text), len(text) + len(w[4]), pymupdf.Rect(w[:4])))
                    text += w[4]
                for pat in patterns:
                    try:
                        rx = re.compile(pat, 0 if case else re.IGNORECASE)
                    except re.error as ex:
                        raise ToolError(f"Espressione regolare non valida: {pat} ({ex})")
                    for m in rx.finditer(text):
                        r = pymupdf.Rect()
                        for a, b, wr in spans:
                            if b > m.start() and a < m.end():
                                # porzione del riquadro della parola coinvolta
                                frac0 = max(0, (m.start() - a) / max(b - a, 1))
                                frac1 = min(1, (m.end() - a) / max(b - a, 1))
                                part = pymupdf.Rect(wr.x0 + wr.width * frac0, wr.y0,
                                                    wr.x0 + wr.width * frac1, wr.y1)
                                r |= part
                        if not r.is_empty:
                            found.append({"page": pno, "rect": _vis(pg, r), "text": m.group(0)})
    return found


def _redact_params(ctx: Ctx, doc):
    pages = parse_pages(ctx.params.get("pages"), doc.page_count)
    terms = ctx.params.get("terms") or []
    if isinstance(terms, str):
        terms = [t for t in terms.split("\n") if t.strip()]
    patterns = list(ctx.params.get("patterns") or [])
    if isinstance(ctx.params.get("patterns"), str):
        patterns = [p for p in ctx.params["patterns"].split("\n") if p.strip()]
    for pre in ctx.params.get("presets") or []:
        if pre in REDACT_PRESETS:
            patterns.append(REDACT_PRESETS[pre])
    return pages, terms, patterns, boolean(ctx.params.get("case_sensitive"), False)


def _blur_area(page: pymupdf.Page, rect: pymupdf.Rect, heavy: bool) -> bytes:
    """Rende l'area come immagine pixelata/sfocata (il testo originale viene comunque
    eliminato dal file: resta solo questa immagine)."""
    from PIL import Image, ImageFilter

    dpi = 110
    pix = page.get_pixmap(clip=rect, dpi=dpi, annots=False)
    im = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
    factor = 14 if heavy else 5
    small = im.resize((max(1, im.width // factor), max(1, im.height // factor)), Image.BILINEAR)
    im = small.resize(im.size, Image.BILINEAR).filter(ImageFilter.GaussianBlur(8 if heavy else 2.5))
    buf = io.BytesIO()
    im.save(buf, "PNG")
    return buf.getvalue()


@tool("redact_find")
def redact_find(ctx: Ctx) -> Result:
    doc = ctx.open()
    pages, terms, patterns, case = _redact_params(ctx, doc)
    found = _find_matches(doc, pages, terms, patterns, case)
    doc.close()
    return Result(data={"matches": found}, message=f"Trovate {len(found)} occorrenze.")


@tool("redact")
def redact(ctx: Ctx) -> Result:
    """Oscuramento definitivo: il contenuto sotto le aree viene eliminato dal file."""
    doc = ctx.open()
    pages, terms, patterns, case = _redact_params(ctx, doc)
    areas = list(ctx.params.get("areas") or [])
    if terms or patterns:
        areas += _find_matches(doc, pages, terms, patterns, case)
    if not areas:
        raise ToolError("Nessuna area da oscurare: disegna dei riquadri o cerca del testo.")
    fill = color(ctx.params.get("color"), (0, 0, 0))
    label = ctx.params.get("label") or None
    effect = ctx.params.get("effect", "cover")  # cover | blur_light | blur_heavy
    touched = set()
    blurred: list[tuple[int, pymupdf.Rect, bytes]] = []
    for a in areas:
        pno = int(a["page"])
        pg = doc[pno]
        r = rect_from(a["rect"], pg)
        if effect.startswith("blur"):
            # l'immagine sfocata viene presa PRIMA di eliminare il contenuto
            blurred.append((pno, r, _blur_area(pg, r, heavy=effect == "blur_heavy")))
            pg.add_redact_annot(r, fill=False)
        else:
            pg.add_redact_annot(r, text=label, fill=fill,
                                text_color=(1, 1, 1) if sum(fill) < 1.5 else (0, 0, 0), fontsize=8)
        touched.add(pno)
    for pno in touched:
        doc[pno].apply_redactions(images=pymupdf.PDF_REDACT_IMAGE_PIXELS,
                                  graphics=pymupdf.PDF_REDACT_LINE_ART_REMOVE_IF_COVERED)
    for pno, r, data in blurred:
        pg = doc[pno]
        pg.insert_image(r, stream=data, keep_proportion=False, rotate=(-pg.rotation) % 360)
    if boolean(ctx.params.get("remove_metadata"), True):
        doc.set_metadata({})
        doc.del_xml_metadata()
    if boolean(ctx.params.get("to_image"), False):
        from .security import rasterize_doc
        doc = rasterize_doc(doc, int(num(ctx.params.get("dpi"), 200)), pages=sorted(touched))
    return Result(pdf=ctx.save(doc, garbage=4, clean=True),
                  message=f"Oscurate {len(areas)} aree su {len(touched)} pagine.")
