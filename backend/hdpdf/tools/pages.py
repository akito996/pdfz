"""Strumenti sulle pagine: unisci, estrai, rimuovi, organizza, ritaglia, ruota,
ridimensiona, numeri di pagina, indice."""
from __future__ import annotations

import pymupdf

from .. import fonts
from ..store import store
from .base import (MM, PAPER, Ctx, Result, ToolError, boolean, color, num, parse_pages,
                   position_rect, rect_from, tool, visual_rect)


@tool("merge", multi=True)
def merge(ctx: Ctx) -> Result:
    """Unisce i file nell'ordine dato. Con params.order ([{doc: indice del file, page, rotate}])
    si scelgono anche le singole pagine e il loro ordine (vista "Pagine" del pannello Unisci)."""
    if len(ctx.items) < 2:
        raise ToolError("Seleziona almeno due file da unire.")
    out = pymupdf.open()
    toc = []
    add_bookmarks = boolean(ctx.params.get("bookmarks"), True)
    order = ctx.params.get("order")
    srcs = [ctx.open(i) for i in range(len(ctx.items))]
    try:
        if order:
            seen: set[int] = set()
            for entry in order:
                di = int(entry.get("doc", 0))
                if not 0 <= di < len(srcs):
                    raise ToolError("Ordine pagine non valido.")
                src = srcs[di]
                p = entry.get("page")
                if p is None:
                    ref = src[0].rect if src.page_count else pymupdf.paper_rect("a4")
                    out.new_page(width=ref.width, height=ref.height)
                    continue
                if not 0 <= int(p) < src.page_count:
                    raise ToolError(f"Pagina {int(p) + 1} inesistente in \"{ctx.items[di].name}\".")
                out.insert_pdf(src, from_page=int(p), to_page=int(p))
                rot = int(entry.get("rotate", 0)) % 360
                if rot:
                    out[-1].set_rotation((out[-1].rotation + rot) % 360)
                if add_bookmarks and di not in seen:
                    seen.add(di)
                    toc.append([1, ctx.items[di].name.rsplit(".", 1)[0], out.page_count])
        else:
            for i, it in enumerate(ctx.items):
                src = srcs[i]
                start = out.page_count
                out.insert_pdf(src)
                if add_bookmarks:
                    toc.append([1, it.name.rsplit(".", 1)[0], start + 1])
                    for lvl, title, page, *_ in src.get_toc():
                        toc.append([lvl + 1, title, page + start])
    finally:
        for d in srcs:
            d.close()
    if not out.page_count:
        raise ToolError("Nessuna pagina da unire.")
    if add_bookmarks and toc:
        out.set_toc(toc)
    n = out.page_count
    return Result(pdf=ctx.save(out), message=f"Uniti {len(ctx.items)} file ({n} pagine).", name="Uniti.pdf")


@tool("extract_pages")
def extract_pages(ctx: Ctx) -> Result:
    doc = ctx.open()
    pages = parse_pages(ctx.params.get("pages"), doc.page_count)
    doc.select(pages)
    n = doc.page_count
    return Result(pdf=ctx.save(doc), message=f"Estratte {n} pagine.",
                  name=ctx.item.name.replace(".pdf", "") + " (estratto).pdf")


@tool("remove_pages")
def remove_pages(ctx: Ctx) -> Result:
    doc = ctx.open()
    pages = set(parse_pages(ctx.params.get("pages"), doc.page_count))
    keep = [i for i in range(doc.page_count) if i not in pages]
    if not keep:
        raise ToolError("Non puoi rimuovere tutte le pagine.")
    doc.select(keep)
    return Result(pdf=ctx.save(doc), message=f"Rimosse {len(pages)} pagine.")


@tool("organize")
def organize(ctx: Ctx) -> Result:
    """params.order: lista di {page: indice originale (0-based) | null per pagina bianca,
    rotate: gradi aggiuntivi}. Oppure params.mode: reverse|odd_even|duplex|dispari|pari."""
    doc = ctx.open()
    n = doc.page_count
    order = ctx.params.get("order")
    mode = ctx.params.get("mode")
    if not order and mode:
        idx = list(range(n))
        if mode == "reverse":
            idx = idx[::-1]
        elif mode == "odd_even":
            idx = idx[0::2] + idx[1::2]
        elif mode == "duplex":  # prima metà fronti, seconda metà retri al contrario
            half = (n + 1) // 2
            fronts, backs = idx[:half], idx[half:][::-1]
            idx = [p for pair in zip(fronts, backs + [None] * (len(fronts) - len(backs))) for p in pair if p is not None]
        elif mode == "dispari":
            idx = idx[0::2]
        elif mode == "pari":
            idx = idx[1::2]
        order = [{"page": i} for i in idx]
    if not order:
        raise ToolError("Nessun ordine di pagine indicato.")
    out = pymupdf.open()
    others: dict[str, pymupdf.Document] = {}
    for entry in order:
        if isinstance(entry, int):
            entry = {"page": entry}
        p = entry.get("page")
        if p is None:  # pagina bianca
            ref = doc[0].rect if n else pymupdf.paper_rect("a4")
            out.new_page(width=ref.width, height=ref.height)
            continue
        src_doc = doc
        if entry.get("src"):  # pagina presa da un altro PDF (inserimento/unione)
            sid = entry["src"]
            if sid not in others:
                it = store.get(sid)
                od = pymupdf.open(it.path)
                if od.needs_pass and not od.authenticate(it.extra.get("password", "")):
                    raise ToolError(f"\"{it.name}\" è protetto da password.")
                others[sid] = od
            src_doc = others[sid]
        if not 0 <= int(p) < src_doc.page_count:
            raise ToolError(f"Pagina {int(p) + 1} inesistente.")
        out.insert_pdf(src_doc, from_page=int(p), to_page=int(p))
        rot = int(entry.get("rotate", 0)) % 360
        if rot:
            pg = out[-1]
            pg.set_rotation((pg.rotation + rot) % 360)
    # conserva segnalibri che puntano a pagine ancora presenti
    mapping = {}
    for new_i, entry in enumerate(order):
        p = entry.get("page") if isinstance(entry, dict) else entry
        if isinstance(entry, dict) and entry.get("src"):
            continue
        if p is not None and p not in mapping:
            mapping[int(p)] = new_i
    toc = [[l, t, mapping[pg - 1] + 1] for l, t, pg, *_ in doc.get_toc() if pg - 1 in mapping]
    if toc:
        try:
            out.set_toc(toc)
        except Exception:
            pass
    doc.close()
    for od in others.values():
        od.close()
    msg = f"Creato documento di {out.page_count} pagine." if ctx.params.get("new_doc") else "Pagine riorganizzate."
    return Result(pdf=ctx.save(out), message=msg, name=ctx.params.get("name") or None)


@tool("rotate")
def rotate(ctx: Ctx) -> Result:
    doc = ctx.open()
    angle = int(num(ctx.params.get("angle"), 90))
    if angle % 90:
        raise ToolError("La rotazione deve essere un multiplo di 90°.")
    pages = parse_pages(ctx.params.get("pages"), doc.page_count)
    for i in pages:
        pg = doc[i]
        pg.set_rotation((pg.rotation + angle) % 360)
    return Result(pdf=ctx.save(doc), message=f"Ruotate {len(pages)} pagine di {angle}°.")


@tool("crop")
def crop(ctx: Ctx) -> Result:
    """params.rect: area da mantenere (coordinate della pagina di riferimento),
    oppure params.auto=true per eliminare i margini bianchi, o params.margins in mm."""
    doc = ctx.open()
    pages = parse_pages(ctx.params.get("pages"), doc.page_count)
    auto = boolean(ctx.params.get("auto"))
    margins = ctx.params.get("margins")
    pad = num(ctx.params.get("padding"), 5) * MM
    for i in pages:
        pg = doc[i]
        if auto:
            bbox = pymupdf.Rect()
            for b in pg.get_bboxlog():
                bbox |= pymupdf.Rect(b[1])
            if bbox.is_empty:
                continue
            bbox = (bbox + (-pad, -pad, pad, pad)) & pymupdf.Rect(0, 0, pg.rect.width, pg.rect.height)
            target = bbox
        elif margins:
            m = [num(margins.get(k), 0) * MM for k in ("left", "top", "right", "bottom")]
            v = visual_rect(pg)
            target = rect_from([v.x0 + m[0], v.y0 + m[1], v.x1 - m[2], v.y1 - m[3]], pg)
        else:
            if not ctx.params.get("rect"):
                raise ToolError("Disegna sulla pagina l'area da mantenere.")
            target = rect_from(ctx.params["rect"], pg)
        # coordinate della pagina non ruotata; set_cropbox gestisce la conversione
        # verso il sistema del mediabox (origine in basso a sinistra)
        cur = pg.cropbox
        target = target + (cur.x0, cur.y0, cur.x0, cur.y0)
        target = target & pg.mediabox
        if target.is_empty or target.width < 10 or target.height < 10:
            raise ToolError("Area di ritaglio troppo piccola.")
        pg.set_cropbox(target)
    return Result(pdf=ctx.save(doc), message=f"Ritagliate {len(pages)} pagine.")


@tool("resize")
def resize(ctx: Ctx) -> Result:
    """Porta le pagine a un formato (A4, A3, ... o personalizzato in mm), adattando
    il contenuto (fit) o ridimensionando solo il foglio senza scalare."""
    doc = ctx.open()
    fmt = ctx.params.get("format", "A4")
    if fmt == "custom":
        w, h = num(ctx.params.get("width"), 210) * MM, num(ctx.params.get("height"), 297) * MM
    else:
        if fmt not in PAPER:
            raise ToolError(f"Formato non supportato: {fmt}")
        w, h = (v * MM for v in PAPER[fmt])
    orientation = ctx.params.get("orientation", "auto")  # auto|portrait|landscape
    scale_content = ctx.params.get("mode", "fit") != "none"
    pages = set(parse_pages(ctx.params.get("pages"), doc.page_count))
    out = pymupdf.open()
    for i, pg in enumerate(doc):
        if i not in pages:
            out.insert_pdf(doc, from_page=i, to_page=i)
            continue
        pw, ph = w, h
        landscape = pg.rect.width > pg.rect.height
        if orientation == "landscape" or (orientation == "auto" and landscape):
            pw, ph = max(w, h), min(w, h)
        elif orientation == "portrait" or orientation == "auto":
            pw, ph = min(w, h), max(w, h)
        np_ = out.new_page(width=pw, height=ph)
        if scale_content:
            np_.show_pdf_page(np_.rect, doc, i, keep_proportion=True)
        else:
            r = pg.rect
            x0 = (pw - r.width) / 2
            y0 = (ph - r.height) / 2
            np_.show_pdf_page(pymupdf.Rect(x0, y0, x0 + r.width, y0 + r.height), doc, i)
    doc.close()
    return Result(pdf=ctx.save(out), message=f"Pagine ridimensionate a {fmt}.")


def _insert_text_visual(page: pymupdf.Page, point: pymupdf.Point, text: str, fontname: str,
                        size: float, col, opacity: float = 1.0, angle: float = 0) -> None:
    """Scrive testo in coordinate visive, dritto anche su pagine ruotate."""
    p = point * page.derotation_matrix
    morph = None
    if angle:
        morph = (p, pymupdf.Matrix(-angle))
    page.insert_text(p, text, fontname=fontname, fontsize=size, color=col,
                     rotate=page.rotation, fill_opacity=opacity, morph=morph)


@tool("page_numbers")
def page_numbers(ctx: Ctx) -> Result:
    doc = ctx.open()
    pages = parse_pages(ctx.params.get("pages"), doc.page_count)
    fmt = ctx.params.get("format") or "{n}"
    start = int(num(ctx.params.get("start"), 1))
    size = num(ctx.params.get("size"), 10)
    col = color(ctx.params.get("color"), (0, 0, 0))
    position = ctx.params.get("position", "basso-centro")
    margin = num(ctx.params.get("margin"), 10) * MM
    font_id = ctx.params.get("font") or "helv"
    font = fonts.font_object(font_id)
    total = len(pages) + start - 1
    for k, i in enumerate(pages):
        pg = doc[i]
        fname = fonts.ensure_on_page(pg, font_id)
        label = fmt.replace("{n}", str(start + k)).replace("{total}", str(total)) \
                   .replace("{N}", str(total)).replace("{page}", str(i + 1))
        tw = font.text_length(label, size)
        box = position_rect(visual_rect(pg), tw, size, position, margin)
        _insert_text_visual(pg, pymupdf.Point(box.x0, box.y1 - size * 0.2), label, fname, size, col)
    return Result(pdf=ctx.save(doc), message=f"Numerate {len(pages)} pagine.")


@tool("create_index")
def create_index(ctx: Ctx) -> Result:
    """Crea una pagina di indice (sommario) cliccabile all'inizio del documento.
    Voci da params.entries [{title, page, level}] oppure dai segnalibri esistenti,
    oppure (source=headings) dai titoli rilevati per dimensione del carattere."""
    doc = ctx.open()
    entries = ctx.params.get("entries")
    source = ctx.params.get("source", "bookmarks")
    if not entries:
        if source == "headings":
            entries = _detect_headings(doc)
        else:
            entries = [{"level": l, "title": t, "page": p} for l, t, p, *_ in doc.get_toc()]
    if not entries:
        raise ToolError("Nessuna voce: il documento non ha segnalibri. Aggiungi le voci manualmente "
                        "o usa \"Rileva titoli\".")
    title = ctx.params.get("title") or "Indice"
    font_id = ctx.params.get("font") or "helv"
    size = num(ctx.params.get("size"), 11)
    add_bm = boolean(ctx.params.get("bookmarks"), True)
    font = fonts.font_object(font_id)
    ref = doc[0].rect
    W, H = ref.width, ref.height
    margin = 25 * MM
    line_h = size * 1.7
    per_page = int((H - 2 * margin - size * 3) // line_h)
    n_index_pages = max(1, -(-len(entries) // per_page))
    # le voci puntano a pagine che si spostano in avanti di n_index_pages
    for k in range(n_index_pages):
        doc.new_page(pno=k, width=W, height=H)
    for k in range(n_index_pages):
        pg = doc[k]
        fname = fonts.ensure_on_page(pg, font_id)
        y = margin + size * 2
        if k == 0:
            pg.insert_text((margin, margin + size), title, fontname=fname, fontsize=size * 1.8)
            y += size * 1.5
        for e in entries[k * per_page:(k + 1) * per_page]:
            lvl = max(1, int(e.get("level", 1)))
            target = int(e["page"]) + n_index_pages
            indent = margin + (lvl - 1) * 14
            text = str(e["title"])
            num_s = str(target)
            maxw = W - margin - indent - font.text_length(num_s, size) - 20
            while font.text_length(text, size) > maxw and len(text) > 4:
                text = text[:-2]
            if text != str(e["title"]):
                text = text.rstrip() + "…"
            pg.insert_text((indent, y), text, fontname=fname, fontsize=size)
            tw = font.text_length(text, size)
            nw = font.text_length(num_s, size)
            dots_start, dots_end = indent + tw + 6, W - margin - nw - 6
            seg_w = font.text_length(". ", size) or 1
            if dots_end > dots_start + seg_w:
                pg.insert_text((dots_start, y), ". " * int((dots_end - dots_start) / seg_w),
                               fontname=fname, fontsize=size, color=(0.55, 0.55, 0.55))
            pg.insert_text((W - margin - nw, y), num_s, fontname=fname, fontsize=size)
            if 1 <= target <= doc.page_count:
                pg.insert_link({"kind": pymupdf.LINK_GOTO, "page": target - 1,
                                "from": pymupdf.Rect(indent, y - size, W - margin, y + size * 0.3),
                                "to": pymupdf.Point(0, 0)})
            y += line_h
    if add_bm:
        toc = [[1, title, 1]] + [[max(1, int(e.get("level", 1))), str(e["title"]), int(e["page"]) + n_index_pages]
                                 for e in entries]
        # set_toc richiede livelli coerenti (salto massimo di 1)
        fixed, prev = [], 0
        for l, t, p in toc:
            l = min(l, prev + 1)
            fixed.append([l, t, min(max(p, 1), doc.page_count)])
            prev = l
        doc.set_toc(fixed)
    return Result(pdf=ctx.save(doc), message=f"Indice creato con {len(entries)} voci.")


def _detect_headings(doc: pymupdf.Document, max_entries: int = 200) -> list[dict]:
    sizes: dict[float, int] = {}
    spans = []
    for pno, pg in enumerate(doc):
        for b in pg.get_text("dict")["blocks"]:
            for line in b.get("lines", []):
                text = "".join(s["text"] for s in line["spans"]).strip()
                if not text or not line["spans"]:
                    continue
                if abs(line["dir"][1]) > 0.01:  # testo ruotato (filigrane, timbri)
                    continue
                s = round(max(sp["size"] for sp in line["spans"]), 1)
                bold = any(sp["flags"] & 16 for sp in line["spans"])
                sizes[s] = sizes.get(s, 0) + len(text)
                spans.append((pno, s, bold, text))
    if not sizes:
        return []
    body = max(sizes, key=sizes.get)  # corpo del testo = dimensione più usata
    # testi ripetuti su molte pagine (intestazioni, piè di pagina, filigrane) non sono titoli
    from collections import Counter
    rep = Counter(t for _, t in {(p, t) for p, _, _, t in spans})
    limit = max(2, -(-doc.page_count // 2)) if doc.page_count >= 2 else 99
    spans = [sp for sp in spans if rep[sp[3]] < limit or sp[1] <= body]
    sizes = {}
    for _, s_, _, t in spans:
        sizes[s_] = sizes.get(s_, 0) + len(t)
    heading_sizes = sorted({s for s in sizes if s > body * 1.15}, reverse=True)[:3]
    out = []
    for pno, s, bold, text in spans:
        if s in heading_sizes and len(text) < 120:
            out.append({"level": heading_sizes.index(s) + 1, "title": text, "page": pno + 1})
    if not out:  # fallback: righe in grassetto isolate
        out = [{"level": 1, "title": t, "page": p + 1} for p, s, b, t in spans if b and len(t) < 80 and s >= body]
    return out[:max_entries]


@tool("detect_headings")
def detect_headings(ctx: Ctx) -> Result:
    doc = ctx.open()
    entries = _detect_headings(doc)
    doc.close()
    return Result(data={"entries": entries}, message=f"Rilevati {len(entries)} titoli.")
