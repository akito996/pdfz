"""Infrastruttura comune degli strumenti: registro, parsing parametri, utility."""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable

import pymupdf

from ..store import Item, store

# oltre questi oggetti nel PDF (circa 150 pagine) il salvataggio dopo una modifica usa garbage=1 (vedi Ctx.save)
OGGETTI_RIORDINO_COMPLETO = 5000


class ToolError(Exception):
    """Errore mostrato all'utente così com'è (in italiano)."""


@dataclass
class Result:
    pdf: Path | None = None          # nuova versione del documento
    output: Path | None = None       # file prodotto non PDF (docx, zip, ...)
    output_name: str | None = None
    message: str | None = None
    data: Any = None                 # dati da mostrare (info, confronto, convalida)
    name: str | None = None          # nuovo nome del documento (facoltativo)


@dataclass
class Ctx:
    items: list[Item]
    params: dict
    assets: dict[str, Item] = field(default_factory=dict)

    @property
    def item(self) -> Item:
        if not self.items:
            raise ToolError("Nessun documento aperto.")
        return self.items[0]

    def open(self, index: int = 0, password: str | None = None) -> pymupdf.Document:
        it = self.items[index]
        doc = pymupdf.open(it.path)
        if doc.needs_pass:
            pw = password if password is not None else self.params.get("password") or it.extra.get("password")
            if not pw or not doc.authenticate(pw):
                doc.close()
                raise ToolError("Il documento è protetto da password: usa prima \"Rimuovi password\".")
        return doc

    def asset(self, key: str, required: bool = True) -> Item | None:
        aid = self.params.get(key)
        if not aid:
            if required:
                raise ToolError(f"Manca il file richiesto ({key}).")
            return None
        return store.get(aid)

    def out(self, suffix: str = ".pdf") -> Path:
        return store.new_path(suffix)

    def save(self, doc: pymupdf.Document, **kw) -> Path:
        p = self.out()
        opts = dict(garbage=3, deflate=True)
        opts.update(kw)
        # documenti grandi: il riordino completo (garbage 3-4, cerca gli oggetti doppi) diventa lentissimo a ogni modifica
        # e non cambia il file (PyMuPDF non duplica le immagini). 800 pagine: 11 s con garbage=3, 0,4 s con garbage=1.
        # garbage=1 toglie comunque gli oggetti non più usati, quello che conta dopo Oscura o Elimina.
        if opts.get("garbage", 0) > 1 and doc.xref_length() > OGGETTI_RIORDINO_COMPLETO:
            opts["garbage"] = 1
        doc.save(p, **opts)
        doc.close()
        return p


ToolFn = Callable[[Ctx], Result]
REGISTRY: dict[str, dict] = {}


def tool(name: str, multi: bool = False, needs_doc: bool = True):
    def deco(fn: ToolFn):
        REGISTRY[name] = {"fn": fn, "multi": multi, "needs_doc": needs_doc}
        return fn
    return deco


# ---------------------------------------------------------------- parametri

def parse_pages(spec: Any, count: int) -> list[int]:
    """"1-3,5,8-" -> [0,1,2,4,7,...]. Vuoto/"all"/"tutte" = tutte le pagine.
    Supporta anche "pari", "dispari", "ultima"."""
    if spec is None or spec == "" or (isinstance(spec, str) and spec.strip().lower() in ("all", "tutte", "*")):
        return list(range(count))
    if isinstance(spec, list):
        return [int(p) for p in spec if 0 <= int(p) < count]
    s = str(spec).strip().lower()
    if s in ("pari", "even"):
        return [i for i in range(count) if (i + 1) % 2 == 0]
    if s in ("dispari", "odd"):
        return [i for i in range(count) if (i + 1) % 2 == 1]
    out: list[int] = []
    for part in re.split(r"[,;\s]+", s):
        if not part:
            continue
        part = part.replace("ultima", str(count)).replace("last", str(count))
        if "-" in part:
            a, b = part.split("-", 1)
            start = int(a) if a else 1
            end = int(b) if b else count
            if start > end:
                rng = range(start, end - 1, -1)
            else:
                rng = range(start, end + 1)
            out += [n - 1 for n in rng if 1 <= n <= count]
        else:
            n = int(part)
            if not 1 <= n <= count:
                raise ToolError(f"La pagina {n} non esiste (il documento ha {count} pagine).")
            out.append(n - 1)
    if not out:
        raise ToolError("Nessuna pagina valida selezionata.")
    return out


def color(value: Any, default=(0, 0, 0)) -> tuple[float, float, float]:
    if value is None or value == "":
        return default
    if isinstance(value, (list, tuple)):
        v = [float(x) for x in value[:3]]
        return tuple(x / 255 if max(v) > 1 else x for x in v)  # type: ignore
    s = str(value).lstrip("#")
    if len(s) == 3:
        s = "".join(c * 2 for c in s)
    try:
        return tuple(int(s[i:i + 2], 16) / 255 for i in (0, 2, 4))  # type: ignore
    except ValueError:
        return default


def num(value: Any, default: float) -> float:
    try:
        if value is None or value == "":
            return default
        return float(value)
    except (TypeError, ValueError):
        return default


def boolean(value: Any, default: bool = False) -> bool:
    if value is None or value == "":
        return default
    if isinstance(value, bool):
        return value
    return str(value).lower() in ("1", "true", "si", "sì", "yes", "on")


def rect_from(value: Any, page: pymupdf.Page | None = None) -> pymupdf.Rect:
    """Rettangolo in coordinate PDF 'visive' (origine in alto a sinistra, punti),
    come inviato dalla UI: {x, y, w, h} oppure [x0, y0, x1, y1]."""
    if isinstance(value, dict):
        r = pymupdf.Rect(value["x"], value["y"], value["x"] + value["w"], value["y"] + value["h"])
    else:
        r = pymupdf.Rect(*value)
    if page is not None:
        # la UI lavora sulla pagina così come la vede (rotazione applicata)
        r = r * page.derotation_matrix
        r.normalize()
    return r


def point_from(value: Any, page: pymupdf.Page | None = None) -> pymupdf.Point:
    p = pymupdf.Point(value["x"], value["y"]) if isinstance(value, dict) else pymupdf.Point(*value)
    if page is not None:
        p = p * page.derotation_matrix
    return p


MM = 72 / 25.4

PAPER = {
    "A0": (841, 1189), "A1": (594, 841), "A2": (420, 594), "A3": (297, 420), "A4": (210, 297),
    "A5": (148, 210), "A6": (105, 148), "B4": (250, 353), "B5": (176, 250),
    "Letter": (215.9, 279.4), "Legal": (215.9, 355.6), "Tabloid": (279.4, 431.8),
}


def position_rect(page_rect: pymupdf.Rect, w: float, h: float, position: str, margin: float) -> pymupdf.Rect:
    """Posiziona un box w x h in uno dei 9 punti della pagina (es. "basso-destra")."""
    position = (position or "centro").lower()
    v, _, hz = position.partition("-")
    if v in ("centro", "center") and not hz:
        hz = "centro"
    x = {"sinistra": page_rect.x0 + margin, "centro": page_rect.x0 + (page_rect.width - w) / 2,
         "destra": page_rect.x1 - margin - w}.get(hz or "centro", page_rect.x0 + (page_rect.width - w) / 2)
    y = {"alto": page_rect.y0 + margin, "centro": page_rect.y0 + (page_rect.height - h) / 2,
         "basso": page_rect.y1 - margin - h}.get(v, page_rect.y0 + (page_rect.height - h) / 2)
    return pymupdf.Rect(x, y, x + w, y + h)


def visual_rect(page: pymupdf.Page) -> pymupdf.Rect:
    """Rettangolo della pagina come la vede l'utente (0,0 in alto a sinistra)."""
    return pymupdf.Rect(0, 0, page.rect.width, page.rect.height)
