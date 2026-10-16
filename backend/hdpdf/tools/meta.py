"""Revisione documento: proprietà, segnalibri/indice, informazioni complete."""
from __future__ import annotations

import datetime as dt
import os

import pymupdf

from .base import MM, Ctx, Result, ToolError, tool


def _pdf_date(d: str | None) -> str | None:
    if not d:
        return None
    s = d[2:] if d.startswith("D:") else d
    try:
        return dt.datetime.strptime(s[:14], "%Y%m%d%H%M%S").isoformat(sep=" ")
    except ValueError:
        return d


def _to_pdf_date(value: str | None) -> str:
    if not value:
        return ""
    try:
        t = dt.datetime.fromisoformat(value)
    except ValueError:
        return value
    return t.strftime("D:%Y%m%d%H%M%S")


@tool("get_properties")
def get_properties(ctx: Ctx) -> Result:
    doc = ctx.open()
    m = doc.metadata or {}
    data = {k: m.get(k) or "" for k in ("title", "author", "subject", "keywords", "creator", "producer")}
    data["creationDate"] = _pdf_date(m.get("creationDate")) or ""
    data["modDate"] = _pdf_date(m.get("modDate")) or ""
    data["toc"] = [{"level": l, "title": t, "page": p} for l, t, p, *_ in doc.get_toc()]
    data["page_count"] = doc.page_count
    doc.close()
    return Result(data=data)


@tool("set_properties")
def set_properties(ctx: Ctx) -> Result:
    doc = ctx.open()
    P = ctx.params
    m = dict(doc.metadata or {})
    for k in ("title", "author", "subject", "keywords", "creator", "producer"):
        if k in P:
            m[k] = P[k] or ""
    if "creationDate" in P:
        m["creationDate"] = _to_pdf_date(P["creationDate"])
    m["modDate"] = _to_pdf_date(P["modDate"]) if P.get("modDate") else dt.datetime.now().strftime("D:%Y%m%d%H%M%S")
    m.pop("format", None), m.pop("encryption", None), m.pop("trapped", None)
    doc.set_metadata(m)
    if P.get("sync_xmp", True):
        doc.del_xml_metadata()
    return Result(pdf=ctx.save(doc), message="Proprietà aggiornate.")


@tool("set_toc")
def set_toc(ctx: Ctx) -> Result:
    """Sostituisce i segnalibri (indice di navigazione) con params.toc [{level,title,page}]."""
    doc = ctx.open()
    toc = ctx.params.get("toc") or []
    fixed, prev = [], 0
    for e in toc:
        title = str(e.get("title", "")).strip()
        if not title:
            continue
        lvl = max(1, int(e.get("level", 1)))
        lvl = min(lvl, prev + 1)
        page = int(e.get("page", 1))
        if not 1 <= page <= doc.page_count:
            raise ToolError(f"La voce \"{title}\" punta alla pagina {page} che non esiste.")
        fixed.append([lvl, title, page])
        prev = lvl
    doc.set_toc(fixed)
    return Result(pdf=ctx.save(doc), message=f"Indice aggiornato ({len(fixed)} voci).")


@tool("info")
def info(ctx: Ctx) -> Result:
    it = ctx.item
    raw = pymupdf.open(it.path)
    encrypted = raw.is_encrypted
    needs_pass = raw.needs_pass
    raw.close()
    doc = ctx.open()
    m = doc.metadata or {}
    size = os.path.getsize(it.path)
    pages = []
    sizes_summary: dict[str, int] = {}
    total_images = 0
    fonts: dict[str, dict] = {}
    annots: dict[str, int] = {}
    links_ext = 0
    text_pages = 0
    for i, pg in enumerate(doc):
        w_mm, h_mm = round(pg.rect.width / MM), round(pg.rect.height / MM)
        label = _paper_name(w_mm, h_mm)
        sizes_summary[label] = sizes_summary.get(label, 0) + 1
        imgs = pg.get_images(full=True)
        total_images += len(imgs)
        has_text = bool(pg.get_text("text").strip())
        text_pages += has_text
        for f in pg.get_fonts(full=True):
            name = f[3].split("+")[-1]
            fonts.setdefault(name, {"name": name, "type": f[2], "embedded": f[1] not in ("n/a", ""),
                                    "subset": "+" in f[3], "encoding": f[4], "pages": 0})
            fonts[name]["pages"] += 1
        for a in pg.annots() or []:
            annots[a.type[1]] = annots.get(a.type[1], 0) + 1
        for ln in pg.get_links():
            if ln["kind"] in (pymupdf.LINK_URI, pymupdf.LINK_LAUNCH, pymupdf.LINK_GOTOR):
                links_ext += 1
        if i < 2000:
            pages.append({"n": i + 1, "width_mm": w_mm, "height_mm": h_mm, "format": label,
                          "rotation": pg.rotation, "images": len(imgs), "text": has_text,
                          "label": pg.get_label() or None})
    widgets = []
    sig_count = 0
    for pg in doc:
        for w in pg.widgets() or []:
            if w.field_type == pymupdf.PDF_WIDGET_TYPE_SIGNATURE:
                sig_count += 1
            widgets.append({"name": w.field_name, "type": w.field_type_string, "page": pg.number + 1,
                            "value": str(w.field_value)[:100] if w.field_value is not None else "",
                            "readonly": bool(w.field_flags & 1)})
    attachments = []
    for name in doc.embfile_names():
        e = doc.embfile_info(name)
        attachments.append({"name": name, "filename": e.get("filename"), "size": e.get("size"),
                            "description": e.get("desc")})
    xmp = doc.get_xml_metadata() or ""
    has_js = False
    for x in range(1, min(doc.xref_length(), 20000)):
        try:
            if "/JavaScript" in doc.xref_object(x, compressed=False) or "/JS " in doc.xref_object(x):
                has_js = True
                break
        except Exception:
            continue
    perms = doc.permissions
    perm_names = {
        "Stampa": pymupdf.PDF_PERM_PRINT, "Modifica": pymupdf.PDF_PERM_MODIFY,
        "Copia testo": pymupdf.PDF_PERM_COPY, "Annotazioni": pymupdf.PDF_PERM_ANNOTATE,
        "Compilazione moduli": pymupdf.PDF_PERM_FORM, "Assemblaggio": pymupdf.PDF_PERM_ASSEMBLE,
        "Stampa alta qualità": pymupdf.PDF_PERM_PRINT_HQ,
    }
    layers = []
    try:
        layers = [v.get("text") for v in (doc.layer_ui_configs() or [])]
    except Exception:
        pass
    data = {
        "file": {"name": it.name, "size_bytes": size, "size": _human(size)},
        "document": {
            "pdf_version": m.get("format"), "pages": doc.page_count,
            "title": m.get("title"), "author": m.get("author"), "subject": m.get("subject"),
            "keywords": m.get("keywords"), "creator": m.get("creator"), "producer": m.get("producer"),
            "created": _pdf_date(m.get("creationDate")), "modified": _pdf_date(m.get("modDate")),
            "tagged": "StructTreeRoot" in (doc.xref_object(doc.pdf_catalog()) or ""),
            "linearized": bool(doc.is_fast_webaccess),
            "pdfa": "pdfaid:part" in xmp,
            "xmp": bool(xmp), "repaired": bool(doc.is_repaired),
            "page_labels": bool(doc.get_page_labels()),
        },
        "security": {
            "encrypted": bool(encrypted), "password_to_open": bool(needs_pass),
            "encryption": m.get("encryption"),
            "permissions": {k: bool(perms & v) for k, v in perm_names.items()},
            "javascript": has_js, "signatures": sig_count, "external_links": links_ext,
        },
        "content": {
            "images": total_images, "pages_with_text": text_pages,
            "pages_scanned_likely": doc.page_count - text_pages,
            "fonts": sorted(fonts.values(), key=lambda f: f["name"]),
            "annotations": annots, "form_fields": widgets[:500], "attachments": attachments,
            "bookmarks": len(doc.get_toc()), "layers": layers,
        },
        "page_formats": sizes_summary,
        "pages": pages,
    }
    doc.close()
    return Result(data=data)


def _paper_name(w: int, h: int) -> str:
    from .base import PAPER

    a, b = sorted((w, h))
    for name, (pw, ph) in PAPER.items():
        if abs(a - pw) <= 3 and abs(b - ph) <= 3:
            return f"{name} {'orizzontale' if w > h else 'verticale'}"
    return f"{w}×{h} mm"


def _human(n: float) -> str:
    for unit in ("B", "KB", "MB", "GB"):
        if n < 1024:
            return f"{n:.0f} {unit}" if unit == "B" else f"{n:.1f} {unit}"
        n /= 1024
    return f"{n:.1f} TB"
