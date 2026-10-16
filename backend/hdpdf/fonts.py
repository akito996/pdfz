"""Catalogo dei caratteri disponibili: i 14 standard PDF più i font installati sul PC
(C:\\Windows\\Fonts su Windows) e quelli nella cartella fonts/ dell'applicazione."""
from __future__ import annotations

import hashlib
import threading
from dataclasses import asdict, dataclass
from pathlib import Path

import pymupdf

from .config import fonts_dirs

BASE14 = [
    ("helv", "Helvetica", "Helvetica", "Normale"),
    ("hebo", "Helvetica Grassetto", "Helvetica", "Grassetto"),
    ("heit", "Helvetica Corsivo", "Helvetica", "Corsivo"),
    ("hebi", "Helvetica Grassetto Corsivo", "Helvetica", "Grassetto Corsivo"),
    ("tiro", "Times", "Times", "Normale"),
    ("tibo", "Times Grassetto", "Times", "Grassetto"),
    ("tiit", "Times Corsivo", "Times", "Corsivo"),
    ("tibi", "Times Grassetto Corsivo", "Times", "Grassetto Corsivo"),
    ("cour", "Courier", "Courier", "Normale"),
    ("cobo", "Courier Grassetto", "Courier", "Grassetto"),
    ("coit", "Courier Corsivo", "Courier", "Corsivo"),
    ("cobi", "Courier Grassetto Corsivo", "Courier", "Grassetto Corsivo"),
]


@dataclass
class FontInfo:
    id: str
    name: str
    family: str
    style: str
    source: str  # base14 | system | app
    path: str | None = None
    bold: bool = False
    italic: bool = False
    serif: bool = False
    mono: bool = False


_cache: dict[str, FontInfo] | None = None
_lock = threading.Lock()


def _read_names(path: Path) -> tuple[str, str] | None:
    try:
        from fontTools.ttLib import TTFont

        f = TTFont(str(path), lazy=True, fontNumber=0)
        name = f["name"]
        fam = name.getDebugName(16) or name.getDebugName(1)
        sub = name.getDebugName(17) or name.getDebugName(2) or "Regular"
        f.close()
        if fam:
            return fam, sub
    except Exception:
        pass
    try:
        fo = pymupdf.Font(fontfile=str(path))
        return fo.name, "Regular"
    except Exception:
        return None


def _scan() -> dict[str, FontInfo]:
    fonts: dict[str, FontInfo] = {}
    for fid, name, fam, style in BASE14:
        fonts[fid] = FontInfo(fid, name, fam, style, "base14", None,
                              bold="Grassetto" in style, italic="Corsivo" in style,
                              serif=fam == "Times", mono=fam == "Courier")
    app_fonts = fonts_dirs()[0] if fonts_dirs() else None
    for d in fonts_dirs():
        for p in d.rglob("*"):
            if p.suffix.lower() not in (".ttf", ".otf"):
                continue
            names = _read_names(p)
            if not names:
                continue
            fam, sub = names
            fid = "f" + hashlib.sha1(str(p).encode()).hexdigest()[:12]
            low = sub.lower()
            fonts[fid] = FontInfo(
                fid, f"{fam} {sub}".replace(" Regular", "").strip(), fam, sub,
                "app" if app_fonts and d == app_fonts else "system", str(p),
                bold="bold" in low or "black" in low, italic="italic" in low or "oblique" in low,
                mono="mono" in fam.lower() or "courier" in fam.lower(),
            )
    return fonts


def catalog() -> dict[str, FontInfo]:
    global _cache
    with _lock:
        if _cache is None:
            _cache = _scan()
        return _cache


def list_fonts() -> list[dict]:
    items = sorted(catalog().values(), key=lambda f: (f.source != "base14", f.family.lower(), f.style))
    return [asdict(f) for f in items]


def get(font_id: str | None) -> FontInfo:
    cat = catalog()
    if font_id and font_id in cat:
        return cat[font_id]
    # ricerca per nome (comodo per API/script)
    if font_id:
        low = font_id.lower()
        for f in cat.values():
            if f.name.lower() == low:
                return f
    return cat["helv"]


def font_object(font_id: str | None) -> pymupdf.Font:
    f = get(font_id)
    if f.path:
        return pymupdf.Font(fontfile=f.path)
    return pymupdf.Font(f.id)


def ensure_on_page(page: pymupdf.Page, font_id: str | None) -> str:
    """Registra il font sulla pagina e restituisce il nome risorsa da usare in insert_text."""
    f = get(font_id)
    if not f.path:
        return f.id
    fontname = "HD" + f.id[1:9]
    page.insert_font(fontname=fontname, fontfile=f.path)
    return fontname


def closest_base14(fontname: str, flags: int) -> str:
    """Sceglie il font standard più simile a quello originale di uno span."""
    low = (fontname or "").lower()
    bold = bool(flags & 16) or "bold" in low or "black" in low
    italic = bool(flags & 2) or "italic" in low or "oblique" in low
    mono = bool(flags & 8) or "courier" in low or "mono" in low
    serif = bool(flags & 4) or any(s in low for s in ("times", "serif", "garamond", "georgia", "cambria", "book"))
    if "sans" in low:
        serif = False
    base = "co" if mono else ("ti" if serif else "he")
    if base == "ti":
        suffix = {(False, False): "ro", (True, False): "bo", (False, True): "it", (True, True): "bi"}
    else:
        suffix = {(False, False): ("ur" if base == "co" else "lv"), (True, False): "bo",
                  (False, True): "it", (True, True): "bi"}
    return base + suffix[(bold, italic)]


def match_system_font(fontname: str, flags: int) -> str:
    """Cerca tra i font installati uno con lo stesso nome dell'originale (es. Calibri,
    Arial); altrimenti ricade sul font standard più simile."""
    clean = (fontname or "").split("+")[-1]
    fam = clean.split("-")[0].split(",")[0].replace("MT", "").replace("PS", "").strip().lower()
    style_low = clean.lower()
    want_bold = bool(flags & 16) or "bold" in style_low
    want_italic = bool(flags & 2) or "italic" in style_low or "oblique" in style_low
    if fam:
        best = None
        for f in catalog().values():
            if f.source == "base14":
                continue
            if f.family.lower().replace(" ", "") == fam.replace(" ", ""):
                if f.bold == want_bold and f.italic == want_italic:
                    return f.id
                best = best or f.id
        if best:
            return best
    return closest_base14(fontname, flags)
