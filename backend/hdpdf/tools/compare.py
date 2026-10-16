"""Comparazione tra due PDF: differenze di testo (parola per parola) e visive."""
from __future__ import annotations

import difflib
import io

import pymupdf

from .base import Ctx, Result, ToolError, boolean, num, tool

RED = (0.85, 0.15, 0.15)
GREEN = (0.1, 0.6, 0.2)
ORANGE = (0.95, 0.55, 0.0)


def _words(doc: pymupdf.Document):
    out = []
    for pno, pg in enumerate(doc):
        for w in pg.get_text("words", sort=True):
            out.append((w[4], pno, pymupdf.Rect(w[:4])))
    return out


def _visual_diff(a: pymupdf.Page, b: pymupdf.Page, dpi: int = 60) -> list[pymupdf.Rect]:
    from PIL import Image, ImageChops

    pa = a.get_pixmap(dpi=dpi)
    pb = b.get_pixmap(dpi=dpi)
    ia = Image.open(io.BytesIO(pa.tobytes("png"))).convert("L")
    ib = Image.open(io.BytesIO(pb.tobytes("png"))).convert("L").resize(ia.size)
    diff = ImageChops.difference(ia, ib).point(lambda v: 255 if v > 40 else 0)
    # griglia di celle per individuare più aree distinte
    rects = []
    cell = 24
    W, H = diff.size
    scale = 72 / dpi
    for y in range(0, H, cell):
        for x in range(0, W, cell):
            box = diff.crop((x, y, min(x + cell, W), min(y + cell, H)))
            if box.getbbox():
                bx = box.getbbox()
                rects.append(pymupdf.Rect((x + bx[0]) * scale, (y + bx[1]) * scale,
                                          (x + bx[2]) * scale, (y + bx[3]) * scale))
    # unisce rettangoli vicini
    merged: list[pymupdf.Rect] = []
    for r in rects:
        for m in merged:
            if (m + (-8, -8, 8, 8)).intersects(r):
                m |= r
                break
        else:
            merged.append(pymupdf.Rect(r))
    return merged


@tool("compare", multi=True)
def compare(ctx: Ctx) -> Result:
    if len(ctx.items) != 2:
        raise ToolError("Seleziona esattamente due documenti da confrontare.")
    a, b = ctx.open(0), ctx.open(1)
    mode = ctx.params.get("mode", "text")
    wa, wb = _words(a), _words(b)
    sm = difflib.SequenceMatcher(a=[w[0] for w in wa], b=[w[0] for w in wb], autojunk=False)
    changes = []
    marks_a: dict[int, list] = {}
    marks_b: dict[int, list] = {}
    if mode in ("text", "both"):
        for op, i1, i2, j1, j2 in sm.get_opcodes():
            if op == "equal":
                continue
            ta = " ".join(w[0] for w in wa[i1:i2])
            tb = " ".join(w[0] for w in wb[j1:j2])
            kind = {"replace": "modificato", "delete": "eliminato", "insert": "aggiunto"}[op]
            changes.append({"type": kind, "old": ta[:500], "new": tb[:500],
                            "page_a": wa[i1][1] + 1 if i2 > i1 else None,
                            "page_b": wb[j1][1] + 1 if j2 > j1 else None})
            for w in wa[i1:i2]:
                marks_a.setdefault(w[1], []).append((w[2], RED if op != "replace" else ORANGE))
            for w in wb[j1:j2]:
                marks_b.setdefault(w[1], []).append((w[2], GREEN if op != "replace" else ORANGE))
    visual = []
    if mode in ("visual", "both"):
        for pno in range(min(a.page_count, b.page_count)):
            rs = _visual_diff(a[pno], b[pno], int(num(ctx.params.get("dpi"), 60)))
            if rs:
                visual.append({"page": pno + 1, "areas": len(rs)})
                for r in rs:
                    marks_a.setdefault(pno, []).append((r, ORANGE))
                    marks_b.setdefault(pno, []).append((r, ORANGE))
    # rapporto affiancato: A a sinistra, B a destra
    out = pymupdf.open()
    n = max(a.page_count, b.page_count)
    for pno in range(n):
        ra = a[pno].rect if pno < a.page_count else b[pno].rect
        rb = b[pno].rect if pno < b.page_count else a[pno].rect
        gap, head = 20, 28
        W = ra.width + rb.width + gap * 3
        H = max(ra.height, rb.height) + head + gap
        pg = out.new_page(width=W, height=H)
        pg.insert_text((gap, 18), f"{ctx.items[0].name} — pag. {pno + 1}", fontsize=9, color=(0.3, 0.3, 0.3))
        pg.insert_text((gap * 2 + ra.width, 18), f"{ctx.items[1].name} — pag. {pno + 1}", fontsize=9,
                       color=(0.3, 0.3, 0.3))
        box_a = pymupdf.Rect(gap, head, gap + ra.width, head + ra.height)
        box_b = pymupdf.Rect(gap * 2 + ra.width, head, gap * 2 + ra.width + rb.width, head + rb.height)
        for src, box, marks, idx in ((a, box_a, marks_a, pno), (b, box_b, marks_b, pno)):
            pg.draw_rect(box, color=(0.8, 0.8, 0.8), width=0.5)
            if idx < src.page_count:
                pg.show_pdf_page(box, src, idx)
                sp = src[idx]
                sx, sy = box.width / sp.rect.width, box.height / sp.rect.height
                for r, col in marks.get(idx, []):
                    rr = r * sp.rotation_matrix
                    rr = pymupdf.Rect(box.x0 + rr.x0 * sx, box.y0 + rr.y0 * sy,
                                      box.x0 + rr.x1 * sx, box.y0 + rr.y1 * sy)
                    pg.draw_rect(rr, color=None, fill=col, fill_opacity=0.28, overlay=True)
                    pg.draw_line(rr.bl, rr.br, color=col, width=0.8)
            else:
                pg.insert_text((box.x0 + 20, box.y0 + 40), "(pagina assente)", fontsize=14,
                               color=(0.6, 0.6, 0.6))
    ratio = sm.ratio() if (wa or wb) else 1.0
    summary = {
        "similarity": round(ratio * 100, 1),
        "added": sum(1 for c in changes if c["type"] == "aggiunto"),
        "deleted": sum(1 for c in changes if c["type"] == "eliminato"),
        "modified": sum(1 for c in changes if c["type"] == "modificato"),
        "pages_a": a.page_count, "pages_b": b.page_count,
        "visual_pages": visual,
    }
    a.close(), b.close()
    p = ctx.out()
    out.save(p, garbage=3, deflate=True)
    out.close()
    msg = ("I documenti hanno lo stesso testo." if not changes and not visual
           else f"Somiglianza {summary['similarity']}%: {len(changes)} differenze di testo"
                + (f", differenze visive su {len(visual)} pagine" if visual else "") + ".")
    return Result(pdf=p, name="Confronto.pdf", data={"summary": summary, "changes": changes[:2000]},
                  message=msg)
