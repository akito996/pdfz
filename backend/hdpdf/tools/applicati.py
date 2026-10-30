"""Oggetti applicati che si possono eliminare dopo: firme grafiche, timbri, testo aggiunto, filigrane, numeri di pagina.

Questi strumenti scrivono nel contenuto della pagina. Per ritrovarli, tutto quello che ciascun oggetto aggiunge viene
racchiuso in una sequenza di contenuto marcato, che i lettori PDF ignorano:

    /PDFz <</Tipo /firma /Id (3fa2c1d0) /Nome <FEFF…> /R [x0 y0 x1 y1] /D (D:20261024…)>> BDC … EMC

Id è lo stesso su tutte le pagine dello stesso oggetto (firma ripetuta su ogni pagina, filigrana), R è il riquadro
nello spazio PDF della pagina (resta giusto se la pagina viene ruotata o ritagliata). "Elimina" toglie la sequenza e
poi ripulisce la pagina, così le immagini e i caratteri usati solo da lei non restano nascosti nel file.
Oscura, Modifica testo e Immagini riscrivono il contenuto della pagina ma mantengono le sequenze marcate.
Gli oggetti applicati con le versioni prima della 1.4.0 non hanno il segno e non compaiono qui.
"""
from __future__ import annotations

import datetime as dt
import re
import secrets
from contextlib import contextmanager
from dataclasses import dataclass

import pymupdf

from .base import Ctx, Result, ToolError, rect_from, tool

# tipo: (nome, plurale, femminile) per i messaggi
TIPI = {"firma": ("firma", "firme", True), "timbro": ("timbro", "timbri", False), "testo": ("testo", "testi", False),
        "filigrana": ("filigrana", "filigrane", True), "numeri": ("numerazione", "numerazioni", True)}
_ETICHETTA = b"PDFz"


def nuovo_id() -> str:
    return secrets.token_hex(4)


def _testo_pdf(s: str) -> bytes:
    """Stringa di testo PDF (UTF-16BE con BOM, in esadecimale: niente problemi di parentesi o accenti)."""
    return b"<FEFF" + s.encode("utf-16-be").hex().upper().encode() + b">"


@dataclass
class _Segno:
    rect: object = None   # riquadro visivo dell'oggetto (dict {x,y,w,h} o Rect); si può impostare anche dentro il blocco


@contextmanager
def marca(page: pymupdf.Page, tipo: str, nome: str = "", rect=None, gid: str | None = None):
    """Tutto il contenuto che il blocco aggiunge alla pagina diventa un oggetto applicato eliminabile.

        with marca(pg, "firma", "Firma disegnata", box, gid) as m:
            pg.insert_image(...)
    """
    doc = page.parent
    if not page.is_wrapped:
        page.wrap_contents()   # prima della foto dei flussi: wrap_contents ne aggiunge di suoi
    prima = set(page.get_contents())
    segno = _Segno(rect)
    yield segno
    nuovi = [x for x in page.get_contents() if x not in prima]
    if not nuovi:
        return
    props = b"<</Tipo /" + tipo.encode() + b" /Id (" + (gid or nuovo_id()).encode() + b")"
    if nome:
        props += b" /Nome " + _testo_pdf(nome[:120])
    if segno.rect is not None:
        r = rect_from(segno.rect, page) * ~page.transformation_matrix   # spazio PDF della pagina
        r.normalize()
        props += f" /R [{r.x0:.2f} {r.y0:.2f} {r.x1:.2f} {r.y1:.2f}]".encode()
    props += f" /D (D:{dt.datetime.now():%Y%m%d%H%M%S})>>".encode()
    for x in nuovi:
        doc.update_stream(x, b"/PDFz " + props + b" BDC\n" + doc.xref_stream(x) + b"\nEMC\n")


# ------------------------------------------------------------------ lettura del contenuto della pagina

_SPAZI = b" \t\r\n\f\x00"
_DELIM = b"()<>[]{}/%"
_FINE_EI = re.compile(rb"[ \t\r\n\f\x00]EI(?=[ \t\r\n\f\x00]|$)")


class _Lettore:
    """Legge un flusso di contenuto: operandi (numeri, nomi, stringhe, array, dizionari) e operatori, con le posizioni."""

    def __init__(self, data: bytes):
        self.d, self.i, self.n = data, 0, len(data)

    def _spazi(self) -> None:
        d, n = self.d, self.n
        while self.i < n:
            c = d[self.i]
            if c in _SPAZI:
                self.i += 1
            elif c == 0x25:   # % commento fino a fine riga
                while self.i < n and d[self.i] not in b"\r\n":
                    self.i += 1
            else:
                break

    def _stringa(self) -> bytes:
        d, out, livello = self.d, bytearray(), 1
        self.i += 1
        while self.i < self.n:
            c = d[self.i]
            self.i += 1
            if c == 0x5C:   # backslash
                if self.i >= self.n:
                    break
                e = d[self.i]
                self.i += 1
                if e in b"nrtbf":
                    out += {0x6E: b"\n", 0x72: b"\r", 0x74: b"\t", 0x62: b"\b", 0x66: b"\f"}[e]
                elif 0x30 <= e <= 0x37:
                    v, k = e - 0x30, 1
                    while k < 3 and self.i < self.n and 0x30 <= d[self.i] <= 0x37:
                        v, k, self.i = v * 8 + d[self.i] - 0x30, k + 1, self.i + 1
                    out.append(v & 0xFF)
                elif e in b"\r\n":
                    if e == 0x0D and self.i < self.n and d[self.i] == 0x0A:
                        self.i += 1
                else:
                    out.append(e)
            elif c == 0x28:
                livello += 1
                out.append(c)
            elif c == 0x29:
                livello -= 1
                if not livello:
                    break
                out.append(c)
            else:
                out.append(c)
        return bytes(out)

    def prossimo(self):
        """(tipo, valore, inizio): tipo = "op" per gli operatori, "fine" a fine flusso, altrimenti un operando."""
        self._spazi()
        d, i = self.d, self.i
        if i >= self.n:
            return "fine", None, i
        c = d[i]
        if c == 0x28:
            return "str", self._stringa(), i
        if c == 0x3C:
            if d[i + 1:i + 2] == b"<":
                self.i += 2
                out = {}
                while True:
                    k, chiave, _ = self.prossimo()
                    if k in ("fine", ">>"):
                        return "dict", out, i
                    _k, val, _ = self.prossimo()
                    if _k in ("fine", ">>"):
                        return "dict", out, i
                    if k == "name":
                        out[chiave] = val
            j = d.find(b">", i)
            j = self.n if j < 0 else j
            esa = re.sub(rb"[^0-9A-Fa-f]", b"", d[i + 1:j])
            self.i = j + 1
            return "str", bytes.fromhex((esa + b"0" * (len(esa) % 2)).decode()), i
        if c == 0x3E and d[i + 1:i + 2] == b">":
            self.i += 2
            return ">>", None, i
        if c == 0x5B:
            self.i += 1
            out = []
            while True:
                k, val, _ = self.prossimo()
                if k in ("fine", "]"):
                    return "array", out, i
                out.append(val)
        if c == 0x5D:
            self.i += 1
            return "]", None, i
        if c == 0x2F:
            j = i + 1
            while j < self.n and d[j] not in _SPAZI and d[j] not in _DELIM:
                j += 1
            self.i = j
            return "name", d[i + 1:j].decode("latin-1"), i
        j = i
        while j < self.n and d[j] not in _SPAZI and d[j] not in _DELIM:
            j += 1
        if j == i:   # delimitatore isolato ({, }, > ...): si salta
            self.i = i + 1
            return self.prossimo()
        self.i = j
        parola = d[i:j]
        try:
            return "num", float(parola), i
        except ValueError:
            pass
        if parola in (b"true", b"false", b"null"):
            return "kw", parola, i
        if parola == b"ID":   # immagine in linea: dati binari fino a EI
            m = _FINE_EI.search(d, j + 1)
            self.i = m.end() if m else self.n
        return "op", parola, i


def _sequenze(data: bytes):
    """Sequenze /PDFz più esterne del flusso: (proprietà, inizio, fine, dopo BDC, inizio di EMC) in byte."""
    lt = _Lettore(data)
    operandi: list = []
    inizio = None
    aperte: list = []   # pila di (proprietà o None, inizio, fine di BDC)
    while True:
        k, v, pos = lt.prossimo()
        if k == "fine":
            return
        if k != "op":
            if inizio is None:
                inizio = pos
            operandi.append((k, v))
            continue
        if v in (b"BDC", b"BMC"):
            props = None
            if v == b"BDC" and len(operandi) >= 2 and operandi[-2] == ("name", _ETICHETTA.decode()) and operandi[-1][0] == "dict":
                props = operandi[-1][1]
            aperte.append((props, inizio if inizio is not None else pos, lt.i))
        elif v == b"EMC" and aperte:
            props, da, dopo = aperte.pop()
            if props is not None and not any(p is not None for p, _a, _b in aperte):
                yield props, da, lt.i, dopo, pos
        operandi, inizio = [], None


def _testo(v) -> str:
    if not isinstance(v, (bytes, bytearray)):
        return ""
    if v[:2] == b"\xfe\xff":
        return v[2:].decode("utf-16-be", "replace")
    return v.decode("latin-1")


def _nome(v) -> str:
    return v if isinstance(v, str) else _testo(v)


def _flussi(doc: pymupdf.Document, page: pymupdf.Page):
    for x in page.get_contents():
        data = doc.xref_stream(x) or b""
        if _ETICHETTA in data:
            yield x, data


def elenca(doc: pymupdf.Document, tipi=None) -> list[dict]:
    """Oggetti applicati, uno per pagina e Id: {page, id, tipo, nome, data, rect (visivo o None)}."""
    out: list[dict] = []
    for page in doc:
        visti: dict[str, dict] = {}
        for _x, data in _flussi(doc, page):
            for props, *_ in _sequenze(data):
                tipo, gid = _nome(props.get("Tipo")), _testo(props.get("Id"))
                if not gid or tipo not in TIPI or (tipi and tipo not in tipi):
                    continue
                rect = None
                r = props.get("R")
                if isinstance(r, list) and len(r) == 4 and all(isinstance(n, float) for n in r):
                    v = pymupdf.Rect(*r) * page.transformation_matrix * page.rotation_matrix
                    v.normalize()
                    rect = {"x": round(v.x0, 2), "y": round(v.y0, 2), "w": round(v.width, 2), "h": round(v.height, 2)}
                if gid in visti:
                    if rect and not visti[gid]["rect"]:
                        visti[gid]["rect"] = rect
                    continue
                data_iso = ""
                d = _testo(props.get("D"))
                try:
                    data_iso = dt.datetime.strptime(d[2:16], "%Y%m%d%H%M%S").isoformat() if d.startswith("D:") else ""
                except ValueError:
                    pass
                visti[gid] = {"page": page.number, "id": gid, "tipo": tipo, "nome": _testo(props.get("Nome")),
                              "data": data_iso, "rect": rect}
        out += visti.values()
    return out


def _copia_flusso(doc: pymupdf.Document, page: pymupdf.Page, x: int) -> int:
    """La pagina usa una copia sua del flusso di contenuto x (condiviso con altre pagine). Restituisce la copia."""
    nuovo = doc.get_new_xref()
    doc.update_object(nuovo, "<<>>")
    doc.update_stream(nuovo, doc.xref_stream(x))
    elenco = [nuovo if c == x else c for c in page.get_contents()]
    # sempre un array scritto nella pagina: anche l'array può essere un oggetto condiviso
    doc.xref_set_key(page.xref, "Contents", "[" + " ".join(f"{c} 0 R" for c in elenco) + "]")
    return nuovo


def togli(doc: pymupdf.Document, voci: list[dict]) -> list[tuple[int, str]]:
    """Elimina gli oggetti indicati ([{page, id}], page assente = tutte le pagine). Restituisce le coppie (pagina, Id) tolte."""
    per_pagina: dict[int | None, set[str]] = {}
    for v in voci:
        per_pagina.setdefault(None if v.get("page") is None else int(v["page"]), set()).add(str(v["id"]))
    tutte = per_pagina.pop(None, set())
    tolti: list[tuple[int, str]] = []
    # salvando, i flussi uguali di pagine diverse diventano uno solo (stessa sigla su ogni pagina): quelli condivisi
    # si copiano prima di cambiarli, altrimenti l'oggetto sparirebbe anche dalle altre pagine
    usi: dict[int, int] = {}
    for page in doc:
        for x in page.get_contents():
            usi[x] = usi.get(x, 0) + 1
    for page in doc:
        ids = per_pagina.get(page.number, set()) | tutte
        if not ids:
            continue
        trovati: set[str] = set()
        for x, data in list(_flussi(doc, page)):
            tagli = []
            for props, a, b, *_ in _sequenze(data):
                gid = _testo(props.get("Id"))
                if gid in ids:
                    tagli.append((a, b))
                    trovati.add(gid)
            if not tagli:
                continue
            resto, pos = bytearray(), 0
            for a, b in tagli:
                resto += data[pos:a]
                pos = b
            resto += data[pos:]
            if usi.get(x, 1) > 1:
                usi[x] -= 1
                x = _copia_flusso(doc, page, x)
            doc.update_stream(x, bytes(resto))
        if trovati:
            tolti += [(page.number, g) for g in sorted(trovati)]
            # pagina ripulita: le risorse (immagine della firma, caratteri) che non usa più escono dal file al salvataggio
            page.clean_contents(sanitize=True)
    return tolti


def messaggio(tipi: set[str], tolti: list[tuple[int, str]]) -> str:
    """«Firma eliminata.», «Eliminati 2 timbri.», «Filigrana eliminata da 12 pagine.»"""
    ids = {g for _p, g in tolti}
    pagine = len({p for p, _g in tolti})
    nome, plurale, f = TIPI[tipi.pop()] if len(tipi) == 1 and next(iter(tipi)) in TIPI else ("oggetto", "oggetti", False)
    if len(ids) == 1:
        testo = f"{nome[0].upper()}{nome[1:]} eliminat{'a' if f else 'o'}"
    else:
        testo = f"Eliminat{'e' if f else 'i'} {len(ids)} {plurale}"
    return testo + (f" da {pagine} pagine." if pagine > 1 else ".")


def _oggetto_pdf(v) -> bytes:
    """Valore letto da _Lettore di nuovo in sintassi PDF (per riscrivere le proprietà della sequenza)."""
    if isinstance(v, str):
        return b"/" + v.encode("latin-1")
    if isinstance(v, (bytes, bytearray)):
        return b"<" + bytes(v).hex().upper().encode() + b">"
    if isinstance(v, float):
        return f"{v:.2f}".rstrip("0").rstrip(".").encode() or b"0"
    if isinstance(v, list):
        return b"[" + b" ".join(_oggetto_pdf(x) for x in v) + b"]"
    if isinstance(v, dict):
        return b"<<" + b" ".join(b"/" + k.encode("latin-1") + b" " + _oggetto_pdf(x) for k, x in v.items()) + b">>"
    return v if isinstance(v, bytes) else b"null"


def sposta(doc: pymupdf.Document, pagina: int, gid: str, rect) -> bool:
    """Sposta (e ridimensiona) l'oggetto gid della pagina nel riquadro visivo rect: il suo contenuto viene racchiuso
    in "q a 0 0 d e f cm … Q", che porta il riquadro vecchio (R) su quello nuovo, e R viene aggiornato.
    Le copie sulle altre pagine restano dove sono. Restituisce False se l'oggetto non c'è o non ha il riquadro."""
    page = doc[pagina]
    nuovo = rect_from(rect, page) * ~page.transformation_matrix
    nuovo.normalize()
    usi: dict[int, int] = {}
    for pg in doc:
        for x in pg.get_contents():
            usi[x] = usi.get(x, 0) + 1
    fatto = False
    for x, data in list(_flussi(doc, page)):
        pezzi = [s for s in _sequenze(data) if _testo(s[0].get("Id")) == gid]
        if not pezzi:
            continue
        out, pos = bytearray(), 0
        for props, da, _fine, dopo, emc in pezzi:
            r = props.get("R")
            if not (isinstance(r, list) and len(r) == 4 and all(isinstance(n, float) for n in r)):
                return False
            vecchio = pymupdf.Rect(*r)
            if vecchio.width <= 0 or vecchio.height <= 0:
                return False
            a, d = nuovo.width / vecchio.width, nuovo.height / vecchio.height
            e, f = nuovo.x0 - a * vecchio.x0, nuovo.y0 - d * vecchio.y0
            props = {**props, "R": [nuovo.x0, nuovo.y0, nuovo.x1, nuovo.y1]}
            out += data[pos:da] + b"/PDFz " + _oggetto_pdf(props) + b" BDC\n"
            out += f"q {a:.6f} 0 0 {d:.6f} {e:.3f} {f:.3f} cm\n".encode() + data[dopo:emc] + b"\nQ\nEMC"
            pos = emc + 3
        out += data[pos:]
        if usi.get(x, 1) > 1:
            usi[x] -= 1
            x = _copia_flusso(doc, page, x)
        doc.update_stream(x, bytes(out))
        fatto = True
    return fatto


# ------------------------------------------------------------------ strumenti


@tool("move_applied")
def move_applied(ctx: Ctx) -> Result:
    """params: page, id, rect (riquadro visivo nuovo). Sposta o ridimensiona un oggetto applicato su quella pagina."""
    p = ctx.params
    if p.get("id") is None or p.get("page") is None or not p.get("rect"):
        raise ToolError("Indica che cosa spostare e dove.")
    doc = ctx.open()
    tipo = next((v["tipo"] for v in elenca(doc) if v["id"] == str(p["id"]) and v["page"] == int(p["page"])), None)
    if not tipo or not sposta(doc, int(p["page"]), str(p["id"]), p["rect"]):
        doc.close()
        raise ToolError("Non l'ho trovato nel documento: forse è già stato eliminato.")
    nome, _plurale, f = TIPI[tipo]
    return Result(pdf=ctx.save(doc), message=f"{nome[0].upper()}{nome[1:]} spostat{'a' if f else 'o'}.")


@tool("list_applied")
def list_applied(ctx: Ctx) -> Result:
    """params.tipi: elenco dei tipi da mostrare (vuoto = tutti)."""
    doc = ctx.open()
    voci = elenca(doc, ctx.params.get("tipi") or None)
    doc.close()
    return Result(data={"items": voci})


@tool("remove_applied")
def remove_applied(ctx: Ctx) -> Result:
    """params.items: [{page, id}] (senza page: su tutte le pagine)."""
    voci = ctx.params.get("items") or []
    if not voci:
        raise ToolError("Scegli che cosa eliminare.")
    doc = ctx.open()
    tipo_di = {v["id"]: v["tipo"] for v in elenca(doc)}
    tolti = togli(doc, voci)
    if not tolti:
        doc.close()
        raise ToolError("Non l'ho trovato nel documento: forse è già stato eliminato.")
    msg = messaggio({tipo_di.get(g, "") for _p, g in tolti}, tolti)
    return Result(pdf=ctx.save(doc, garbage=4), message=msg)
