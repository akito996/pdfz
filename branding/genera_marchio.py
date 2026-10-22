"""Marchio PDFz: icone, favicon, logo, splash e immagini dell'installer. Unica fonte del disegno.

Tutto è fatto di forme geometriche (nessun carattere esterno, quindi nessuna licenza da rispettare) nei colori
del marchio: rosso, oro, nero, bianco. Le proposte sono a serie (SERIE), ogni icona con il suo favicon (stesso
numero); con --icona/--favicon la scelta viene applicata a tutte le piattaforme (Windows, macOS, Linux, Android,
iPhone, interfaccia web). IN USO: icona e favicon 24 "Foglio senza fondo" (serie 6, 2026-10-22: indicazioni
dell'utente — z nera, documento bianco con contorno nero, piega d'oro, PDF rosso, nessun fondo attorno).
Le icone 1-5 (serie 1) sono state scartate e tolte da qui: restano solo come immagini in branding/proposte.

    python branding/genera_marchio.py                       # proposte dell'ultima serie in branding/proposte (+ anteprima)
    python branding/genera_marchio.py --serie 2             # rifà le proposte di una serie precedente
    python branding/genera_marchio.py --serie 6 --icona 24 --favicon 24   # applica la scelta ovunque

Richiede PyMuPDF (da SVG a PNG) e Pillow (ICO, ICNS, BMP): sono già nel .venv del progetto.
Nota: il motore SVG di PyMuPDF non gestisce sfumature né clipPath, per questo il disegno è piatto e le forme
"tagliate" (es. il foglio dell'icona 8) e i tratteggi (icona 13) sono calcolati qui.
"""
from __future__ import annotations

import argparse
import io
import math
import sys
from pathlib import Path

import pymupdf
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
PROPOSTE = ROOT / "branding" / "proposte"

# ------------------------------------------------------------------ colori del marchio
ROSSO = "#C8102E"
ORO = "#D4AF37"
NERO = "#111111"
BIANCO = "#FFFFFF"
BORDO_CHIARO = "#E5DFD6"   # contorno dell'icona bianca, per vederla anche su fondi bianchi

# ------------------------------------------------------------------ lettere geometriche (altezza 100)
# Z maiuscola (barre 22) e versione più spessa per i favicon (si legge anche a 16 px)
Z = "M0,0 H100 V22 L40,78 H100 V100 H0 V78 L60,22 H0 Z"
Z_SPESSA = "M0,0 H100 V27 L46,73 H100 V100 H0 V73 L54,27 H0 Z"
# scritta "PDFz": P, D, F con il buco (fill-rule evenodd) e z minuscola alta 70
LETTERE = {
    "P": (76, "M0,0 H46 A30,30 0 0 1 46,60 H20 V100 H0 Z M20,19 V41 H45 A11,11 0 0 0 45,19 Z"),
    "D": (92, "M0,0 H42 A50,50 0 0 1 42,100 H0 Z M20,19 V81 H42 A31,31 0 0 0 42,19 Z"),
    "F": (66, "M0,0 H66 V19 H20 V41 H58 V60 H20 V100 H0 Z"),
    "z": (72, "M0,30 H72 V47 L28,83 H72 V100 H0 V83 L44,47 H0 Z"),
}
SPAZIO = 12
LARGHEZZA_SCRITTA = sum(w for w, _ in LETTERE.values()) + SPAZIO * (len(LETTERE) - 1)   # 342


def glifo(d: str, x: float, y: float, s: float, fill: str) -> str:
    return f'<path transform="translate({x:.2f} {y:.2f}) scale({s:.4f})" fill-rule="evenodd" fill="{fill}" d="{d}"/>'


def scritta(x: float, y: float, altezza: float, pdf: str, z: str) -> str:
    """La scritta "PDFz" in geometria: x, y = angolo in alto a sinistra, altezza delle maiuscole."""
    s, out, cx = altezza / 100, [], x
    for k, (w, d) in LETTERE.items():
        out.append(glifo(d, cx, y, s, z if k == "z" else pdf))
        cx += (w + SPAZIO) * s
    return "".join(out)


def svg(inner: str, w: int = 1024, h: int = 1024, title: str = "PDFz") -> str:
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}">'
            f"<title>{title}</title>{inner}</svg>")


# ------------------------------------------------------------------ cornici
# app   = quadrato arrotondato con margine (Windows, macOS, Linux, web, Android "vecchio")
# pieno = tutta la tela, simbolo nella zona sicura (icona adattiva Android: il telefono ritaglia la forma)
# ios   = tutta la tela senza trasparenza (iPhone arrotonda da solo)
# tondo = cerchio (icona rotonda di Android)
CORNICI = {"app": ("squircle", 1.0), "pieno": ("quadrato", 0.68), "ios": ("quadrato", 0.86), "tondo": ("cerchio", 0.84)}
SQ = (64, 64, 960, 960, 200)          # x0, y0, x1, y1, raggio del quadrato arrotondato
FAV = (0, 0, 1024, 1024, 230)          # favicon: quadrato arrotondato a tutta tela


def forma(kind: str, fill: str, box=SQ) -> str:
    x0, y0, x1, y1, r = box
    if kind == "squircle":
        return f'<rect x="{x0}" y="{y0}" width="{x1 - x0}" height="{y1 - y0}" rx="{r}" fill="{fill}"/>'
    if kind == "cerchio":
        return f'<circle cx="512" cy="512" r="480" fill="{fill}"/>'
    return f'<rect x="0" y="0" width="1024" height="1024" fill="{fill}"/>'


def bordo(kind: str, stroke: str, w: float, box=SQ) -> str:
    x0, y0, x1, y1, r = box
    h = w / 2
    if kind == "squircle":
        return (f'<rect x="{x0 + h}" y="{y0 + h}" width="{x1 - x0 - w}" height="{y1 - y0 - w}" rx="{r - h}" '
                f'fill="none" stroke="{stroke}" stroke-width="{w}"/>')
    if kind == "cerchio":
        return f'<circle cx="512" cy="512" r="{480 - h}" fill="none" stroke="{stroke}" stroke-width="{w}"/>'
    return ""   # a tutta tela il bordo lo taglierebbe il telefono


def gruppo(k: float, inner: str) -> str:
    return inner if k == 1 else f'<g transform="translate(512 512) scale({k}) translate(-512 -512)">{inner}</g>'


ICONE: dict[int, tuple] = {}   # numero -> (nome, descrizione, disegno, colore di fondo)


# ------------------------------------------------------------------ serie 2 (2026-10-16): forme proprie del nome PDFz
# La serie 1 (icone 1-5, tolta dallo script) è stata scartata: pagina con l'angolo piegato, lettera nel quadrato,
# sigillo e diagonale sono idee troppo comuni (esistono già marchi simili). Qui niente cliché delle app PDF: monogramma, controforma,
# taglio, pennino e piega a Z sono legati al nome e alle funzioni (firma, dividi/unisci, documenti).
ORO_SCURO = "#A8841C"


def icona_6(cornice: str) -> str:
    """Legatura: "p" e "z" minuscole unite sulla stessa base, in bianco su rosso, con il piede d'oro."""
    kind, k = CORNICI[cornice]
    segno = ('<g transform="translate(-13 -6)">'
             f'<rect x="250" y="330" width="80" height="500" fill="{BIANCO}"/>'
             f'<path fill-rule="evenodd" fill="{BIANCO}" d="M450,330 A160,160 0 1 1 449.9,330 Z M450,410 A80,80 0 1 0 450.1,410 Z"/>'
             f'<path fill="{BIANCO}" d="M580,330 H800 V410 H580 Z M700,410 H800 L680,570 H580 Z M450,570 H800 V650 H450 Z"/>'
             f'<rect x="250" y="760" width="80" height="70" fill="{ORO}"/>'
             '</g>')
    return forma(kind, ROSSO) + gruppo(k, segno)


def icona_7(cornice: str) -> str:
    """Controforma: P nera con una "z" rossa al posto del buco, su bianco, piede d'oro."""
    kind, k = CORNICI[cornice]
    segno = ('<g transform="translate(-18 0)">'
             f'<path fill="{NERO}" d="M300,212 H560 A208,208 0 0 1 560,628 H440 V812 H300 Z"/>'
             f'<path transform="translate(464 322) scale(1.92 1.96)" fill="{ROSSO}" d="{Z}"/>'
             f'<rect x="300" y="712" width="140" height="100" fill="{ORO}"/>'
             '</g>')
    return forma(kind, BIANCO) + bordo(kind, BORDO_CHIARO, 14) + gruppo(k, segno)


def icona_8(cornice: str) -> str:
    """Taglio: un foglio diviso da un taglio a Z, le due parti scostate (bianca e oro) su nero, righe rosse."""
    kind, k = CORNICI[cornice]
    alto = "M302,222 H722 V604 H424 L600,420 H302 Z"
    basso = "M302,420 H600 L424,604 H722 V802 H302 Z"
    tondo = 'stroke-width="44" stroke-linejoin="round"'
    segno = (f'<path transform="translate(26 -26)" fill="{BIANCO}" stroke="{BIANCO}" {tondo} d="{alto}"/>'
             f'<path transform="translate(-26 26)" fill="{ORO}" stroke="{ORO}" {tondo} d="{basso}"/>'
             f'<rect x="372" y="262" width="210" height="34" rx="17" fill="{ROSSO}"/>'
             f'<rect x="372" y="322" width="140" height="34" rx="17" fill="{ROSSO}"/>')
    return forma(kind, NERO) + gruppo(k, segno)


def icona_9(cornice: str) -> str:
    """Pennino: pennino d'oro con il foro a forma di z rossa e la fessura dritta, su nero (la firma)."""
    kind, k = CORNICI[cornice]
    pennino = "M322,196 H702 V300 C702,470 600,640 512,846 C424,640 322,470 322,300 Z"
    segno = (f'<path fill="{ORO}" d="{pennino}"/>'
             f'<rect x="322" y="196" width="380" height="74" fill="{ORO_SCURO}"/>'
             f'<rect x="500" y="540" width="24" height="320" fill="{NERO}"/>'
             f'<path transform="translate(447 352) scale(1.3)" fill="{ROSSO}" d="{Z}"/>')
    return forma(kind, NERO) + gruppo(k, segno)


def icona_10(cornice: str) -> str:
    """Piega: foglio piegato a fisarmonica (piega a Z) in bianco e oro, con le righe di testo, su rosso."""
    kind, k = CORNICI[cornice]

    def righe(y: int, w1: int, w2: int) -> str:
        return (f'<rect x="352" y="{y}" width="{w1}" height="26" rx="13" fill="{NERO}" opacity="0.8"/>'
                f'<rect x="352" y="{y + 56}" width="{w2}" height="26" rx="13" fill="{NERO}" opacity="0.8"/>')
    segno = (f'<path fill="{BIANCO}" d="M332,210 H692 L756,400 H268 Z"/>'
             f'<path fill="{ORO}" d="M268,400 H756 L692,590 H332 Z"/>'
             f'<path fill="{BIANCO}" d="M332,590 H692 L756,780 H268 Z"/>'
             + righe(270, 300, 200) + righe(652, 320, 230))
    return forma(kind, ROSSO) + gruppo(k, segno)


ICONE.update({
    6: ("Legatura", "p e z unite sulla stessa base: monogramma solo di PDFz", icona_6, ROSSO),
    7: ("Controforma", "P nera con una z rossa al posto del buco, piede d'oro", icona_7, BIANCO),
    8: ("Taglio", "Foglio diviso da un taglio a Z: richiama dividi e unisci PDF", icona_8, NERO),
    9: ("Pennino", "Pennino d'oro con il foro a forma di z: richiama la firma", icona_9, NERO),
    10: ("Piega", "Foglio piegato a fisarmonica: la piega a Z della carta", icona_10, ROSSO),
})
# serie di proposte (la 1, scartata, non c'è più)
SERIE = {2: [6, 7, 8, 9, 10]}


# ------------------------------------------------------------------ serie 3 (2026-10-16): richiesta "PDF a capo, z piccola"
GRIGIO_TESTO = "#E3DDD4"   # righe di testo finte (tinta chiara del nero)


def parola(testo: str, x: float, y: float, altezza: float, colore: str) -> str:
    """Lettere geometriche di LETTERE (es. "PDF") una dopo l'altra: x, y = angolo in alto a sinistra."""
    s, out, cx = altezza / 100, [], x
    for k in testo:
        w, d = LETTERE[k]
        out.append(glifo(d, cx, y, s, colore))
        cx += (w + SPAZIO) * s
    return "".join(out)


def larghezza(testo: str, altezza: float) -> float:
    return (sum(LETTERE[k][0] for k in testo) + SPAZIO * (len(testo) - 1)) * altezza / 100


def z_piccola(cx: float, top: float, altezza: float, colore: str) -> str:
    """La "z" minuscola centrata su cx, con la parte alta a top (la z occupa le righe 30-100 del suo riquadro)."""
    s = altezza / 70
    return glifo(LETTERE["z"][1], cx - LETTERE["z"][0] * s / 2, top - 30 * s, s, colore)


def tratteggio(punti: list[tuple[float, float]], tratto: float, vuoto: float, w: float, colore: str) -> str:
    """Linea tratteggiata calcolata qui: il motore SVG di PyMuPDF ignora stroke-dasharray."""
    out, on, resto = [], True, tratto
    for (x0, y0), (x1, y1) in zip(punti, punti[1:]):
        lung, t = math.hypot(x1 - x0, y1 - y0), 0.0
        while t < lung - 1e-6:
            passo = min(resto, lung - t)
            if on:
                a, b = t / lung, (t + passo) / lung
                out.append(f'<path fill="none" stroke="{colore}" stroke-width="{w}" stroke-linecap="round" '
                           f'd="M{x0 + (x1 - x0) * a:.1f},{y0 + (y1 - y0) * a:.1f} L{x0 + (x1 - x0) * b:.1f},{y0 + (y1 - y0) * b:.1f}"/>')
            t += passo
            resto -= passo
            if resto <= 1e-6:
                on = not on
                resto = tratto if on else vuoto
    return "".join(out)


def icona_11(cornice: str) -> str:
    """A capo: "PDF" bianco su una riga e sotto, al centro, una "z" rossa piccola; filo d'oro in mezzo. Su nero."""
    kind, k = CORNICI[cornice]
    h = 200
    segno = (parola("PDF", 512 - larghezza("PDF", h) / 2, 300, h, BIANCO)
             + f'<rect x="432" y="548" width="160" height="18" rx="9" fill="{ORO}"/>'
             + z_piccola(512, 604, 108, ROSSO))
    return forma(kind, NERO) + gruppo(k, segno)


def icona_12(cornice: str) -> str:
    """Evidenziato: righe di testo in cui le parti evidenziate in rosso disegnano una z. Su bianco, bordo d'oro."""
    kind, k = CORNICI[cornice]
    x0, x1, seg, alto, passo, h = 272, 752, 190, 232, 84, 56
    out = []
    for i in range(7):
        y = alto + i * passo
        if i in (0, 6):
            out.append(f'<rect x="{x0}" y="{y}" width="{x1 - x0}" height="{h}" rx="{h / 2}" fill="{ROSSO}"/>')
            continue
        xr = x1 - seg - (i - 1) * (x1 - seg - x0) / 4
        yt = y + (h - 28) / 2
        if xr - 18 - x0 > 30:
            out.append(f'<rect x="{x0}" y="{yt}" width="{xr - 18 - x0:.1f}" height="28" rx="14" fill="{GRIGIO_TESTO}"/>')
        if x1 - (xr + seg + 18) > 30:
            out.append(f'<rect x="{xr + seg + 18:.1f}" y="{yt}" width="{x1 - (xr + seg + 18):.1f}" height="28" rx="14" fill="{GRIGIO_TESTO}"/>')
        out.append(f'<rect x="{xr:.1f}" y="{y}" width="{seg}" height="{h}" rx="{h / 2}" fill="{ROSSO}"/>')
    return forma(kind, BIANCO) + bordo(kind, ORO, 18) + gruppo(k, "".join(out))


def icona_13(cornice: str) -> str:
    """Cucitura: foglio bianco con una z cucita a punti rossi e il filo d'oro, su nero (unire documenti)."""
    kind, k = CORNICI[cornice]
    segno = (f'<rect x="302" y="222" width="420" height="580" rx="44" fill="{BIANCO}"/>'
             + tratteggio([(382, 330), (642, 330), (382, 694), (642, 694)], 40, 42, 36, ROSSO)
             + f'<path fill="none" stroke="{ORO}" stroke-width="16" stroke-linecap="round" d="M642,694 C700,700 704,758 664,778"/>')
    return forma(kind, NERO) + gruppo(k, segno)


GOCCIA = "M512,186 C540,262 724,430 724,598 A212,212 0 0 1 300,598 C300,430 484,262 512,186 Z"


def icona_14(cornice: str) -> str:
    """Goccia: goccia d'inchiostro rossa con la z bianca e un riflesso, su oro (inchiostro, firma)."""
    kind, k = CORNICI[cornice]
    segno = (f'<path fill="{ROSSO}" d="{GOCCIA}"/>'
             f'<path fill="none" stroke="{BIANCO}" stroke-width="26" stroke-linecap="round" opacity="0.55" '
             'd="M372,566 C372,506 398,456 438,414"/>'
             + z_piccola(512, 560, 160, BIANCO))
    return forma(kind, ORO) + gruppo(k, segno)


def carte(colori: tuple[str, str, str], z: bool) -> str:
    """Tre fogli a ventaglio (nero a sinistra, oro a destra, bianco davanti)."""
    foglio_ = 'x="347" y="280" width="330" height="460" rx="40"'
    out = (f'<rect transform="rotate(-20 512 790)" {foglio_} fill="{colori[0]}"/>'
           f'<rect transform="rotate(20 512 790)" {foglio_} fill="{colori[1]}"/>'
           f'<rect {foglio_} fill="{colori[2]}"/>')
    return out + (z_piccola(512, 440, 150, ROSSO) if z else "")


def icona_15(cornice: str) -> str:
    """Ventaglio: tre fogli aperti a ventaglio (nero, oro, bianco) con la z rossa, su rosso (più documenti)."""
    kind, k = CORNICI[cornice]
    return forma(kind, ROSSO) + gruppo(k, carte((NERO, ORO, BIANCO), True))


ICONE.update({
    11: ("A capo", "PDF bianco su una riga e sotto, al centro, una z rossa piccola, su nero", icona_11, NERO),
    12: ("Evidenziato", "Righe di testo: le parti evidenziate in rosso disegnano una z", icona_12, BIANCO),
    13: ("Cucitura", "Foglio con una z cucita a punti rossi e filo d'oro: unire i documenti", icona_13, NERO),
    14: ("Goccia", "Goccia d'inchiostro rossa con la z bianca, su oro: la firma", icona_14, ORO),
    15: ("Ventaglio", "Tre fogli a ventaglio nero, oro e bianco con la z rossa", icona_15, ROSSO),
})
SERIE[3] = [11, 12, 13, 14, 15]


# ------------------------------------------------------------------ serie 4 (2026-10-16): la 11 dentro un foglio PDF
# Richiesta: "PDF" a capo con la "z" piccola (icona 11) dentro l'icona di un file PDF, più rosso e oro, il nero
# solo per le finiture (contorno sottile, ombra, piega, filo). Tre varianti di colore.
ORO_CHIARO = "#F1D27A"
ROSSO_SCURO = "#8E0B20"


def foglio_pdf(pagina: str, piega: str, testo: str, filo: str, z: str, cornice_oro: bool = False,
               box=(290, 196, 734, 830), c: float = 140, h: float = 140, con_filo: bool = True,
               finitura: str = NERO, etichetta: str | None = None, spessore: float = 11, ombra: bool = True) -> str:
    """Foglio con l'angolo piegato e, dentro, "PDF" su una riga e la "z" piccola centrata sotto.
    Angoli morbidi: il foglio ha un contorno dello stesso colore con gli spigoli arrotondati; sotto, un contorno
    sottile (finitura, nero salvo indicazione, larga «spessore») e un'ombra nera leggera (ombra=False: niente ombra).
    etichetta = fascia colorata dietro "PDF"."""
    x0, y0, x1, y1 = box
    sc = (x1 - x0) / 480                         # proporzioni del disegno di base (foglio largo 480)
    d = f"M{x0},{y0} H{x1 - c} L{x1},{y0 + c} V{y1} H{x0} Z"
    dp = f"M{x1 - c},{y0} V{y0 + c} H{x1} Z"
    t, nero = 36 * sc, 36 * sc + 2 * spessore * sc   # contorno morbido e contorno della finitura
    out = [f'<path transform="translate({14 * sc:.1f} {22 * sc:.1f})" fill="{NERO}" stroke="{NERO}" stroke-width="{nero:.1f}" '
           f'stroke-linejoin="round" opacity="0.28" d="{d}"/>'] if ombra else []
    out.append(f'<path fill="{finitura}" stroke="{finitura}" stroke-width="{nero:.1f}" stroke-linejoin="round" d="{d}"/>')
    if cornice_oro:                              # bordo d'oro largo dentro il contorno nero
        out.append(f'<path fill="{ORO}" stroke="{ORO}" stroke-width="{t:.1f}" stroke-linejoin="round" d="{d}"/>')
        k = 30 * sc
        di = f"M{x0 + k},{y0 + k} H{x1 - c - k * 0.41} L{x1 - k},{y0 + c + k * 0.41} V{y1 - k} H{x0 + k} Z"
        out.append(f'<path fill="{pagina}" stroke="{pagina}" stroke-width="{t * 0.5:.1f}" stroke-linejoin="round" d="{di}"/>')
    else:
        out.append(f'<path fill="{pagina}" stroke="{pagina}" stroke-width="{t:.1f}" stroke-linejoin="round" d="{d}"/>')
    out.append(f'<path fill="{finitura}" stroke="{finitura}" stroke-width="{nero:.1f}" stroke-linejoin="round" d="{dp}"/>')
    out.append(f'<path fill="{piega}" stroke="{piega}" stroke-width="{t:.1f}" stroke-linejoin="round" d="{dp}"/>')
    cx = (x0 + x1) / 2
    ty = y0 + 220 * sc
    if etichetta:
        m = 34 * sc
        out.append(f'<rect x="{x0 + m:.1f}" y="{ty - m:.1f}" width="{x1 - x0 - 2 * m:.1f}" height="{h + 2 * m:.1f}" '
                   f'rx="{26 * sc:.1f}" fill="{etichetta}"/>')
    out.append(parola("PDF", cx - larghezza("PDF", h) / 2, ty, h, testo))
    if con_filo:
        out.append(f'<rect x="{cx - 60 * sc:.1f}" y="{ty + h + 32 * sc:.1f}" width="{120 * sc:.1f}" height="{14 * sc:.1f}" '
                   f'rx="{7 * sc:.1f}" fill="{filo}"/>')
    out.append(z_piccola(cx, ty + h + 66 * sc, 0.6 * h, z))
    return "".join(out)


def icona_16(cornice: str) -> str:
    """Foglio rosso su oro: foglio PDF rosso con "PDF" e la z in oro chiaro; nero solo nelle finiture."""
    kind, k = CORNICI[cornice]
    return forma(kind, ORO) + gruppo(k, foglio_pdf(ROSSO, ORO_CHIARO, ORO_CHIARO, NERO, ORO_CHIARO))


def icona_17(cornice: str) -> str:
    """Foglio oro su rosso: foglio PDF d'oro con "PDF" e la z rossi; nero solo nelle finiture."""
    kind, k = CORNICI[cornice]
    return forma(kind, ROSSO) + gruppo(k, foglio_pdf(ORO, ORO_CHIARO, ROSSO, NERO, ROSSO))


def icona_18(cornice: str) -> str:
    """Cornice d'oro: foglio PDF rosso con bordo d'oro, su rosso scuro; "PDF" e z in oro, finiture nere."""
    kind, k = CORNICI[cornice]
    return forma(kind, ROSSO_SCURO) + gruppo(k, foglio_pdf(ROSSO, ORO, ORO_CHIARO, NERO, ORO_CHIARO, cornice_oro=True))


ICONE.update({
    16: ("Foglio rosso", "Foglio PDF rosso su oro, PDF e z in oro chiaro, finiture nere", icona_16, ORO),
    17: ("Foglio oro", "Foglio PDF d'oro su rosso, PDF e z rossi, finiture nere", icona_17, ROSSO),
    18: ("Cornice d'oro", "Foglio PDF rosso con bordo d'oro su rosso scuro, finiture nere", icona_18, ROSSO_SCURO),
})
SERIE[4] = [16, 17, 18]


# ------------------------------------------------------------------ serie 5 (2026-10-21): la 17 con più bianco
# Richiesta: l'icona 17 è "fastidiosa per gli occhi" (rosso e oro pieni, molto saturi): stessa icona con un po' di
# bianco. Il bianco prende il posto di una delle superfici grandi (foglio, fondo) o fa da cornice e respiro.
def icona_19(cornice: str) -> str:
    """Foglio bianco: foglio PDF bianco su rosso, "PDF" e z rossi, piega d'oro; finiture nere."""
    kind, k = CORNICI[cornice]
    return forma(kind, ROSSO) + gruppo(k, foglio_pdf(BIANCO, ORO, ROSSO, ORO, ROSSO))


def icona_20(cornice: str) -> str:
    """Fondo bianco: il foglio d'oro della 17, con "PDF" e z rossi, su fondo bianco con un contorno chiaro."""
    kind, k = CORNICI[cornice]
    return forma(kind, BIANCO) + bordo(kind, BORDO_CHIARO, 24) + gruppo(k, foglio_pdf(ORO, ORO_CHIARO, ROSSO, NERO, ROSSO))


def icona_21(cornice: str) -> str:
    """Contorno bianco: la 17 con il contorno del foglio bianco invece che nero (stacca dal rosso senza durezza)."""
    kind, k = CORNICI[cornice]
    return forma(kind, ROSSO) + gruppo(k, foglio_pdf(ORO, ORO_CHIARO, ROSSO, ROSSO, ROSSO, finitura=BIANCO))


def icona_22(cornice: str) -> str:
    """Etichetta bianca: la 17 con una fascia bianca dietro "PDF" (scritta rossa più leggibile, meno oro)."""
    kind, k = CORNICI[cornice]
    return forma(kind, ROSSO) + gruppo(k, foglio_pdf(ORO, ORO_CHIARO, ROSSO, BIANCO, ROSSO, etichetta=BIANCO))


def icona_23(cornice: str) -> str:
    """Fondo bianco, foglio rosso: foglio PDF rosso con "PDF" bianco e z d'oro, su fondo bianco."""
    kind, k = CORNICI[cornice]
    return forma(kind, BIANCO) + bordo(kind, BORDO_CHIARO, 24) + gruppo(k, foglio_pdf(ROSSO, ORO, BIANCO, ORO, ORO))


ICONE.update({
    19: ("Foglio bianco", "Foglio PDF bianco su rosso, PDF e z rossi, piega d'oro", icona_19, ROSSO),
    20: ("Fondo bianco", "Il foglio d'oro della 17 su fondo bianco", icona_20, BIANCO),
    21: ("Contorno bianco", "La 17 con il contorno del foglio bianco invece che nero", icona_21, ROSSO),
    22: ("Etichetta bianca", "La 17 con una fascia bianca dietro la scritta PDF", icona_22, ROSSO),
    23: ("Foglio rosso su bianco", "Foglio PDF rosso, PDF bianco e z d'oro, su fondo bianco", icona_23, BIANCO),
})
SERIE[5] = [17, 19, 20, 21, 22, 23]   # la 17 (in uso) per confronto


# ------------------------------------------------------------------ serie 6 (2026-10-22): indicazioni precise dell'utente
# "z nera, documento bianco con contorno nero, piega della pagina oro, PDF rosso, lo sfondo fuori non ci deve essere".
# Niente quadrato di fondo: il foglio da solo su trasparente (solo l'iPhone vuole un'immagine piena: lì fondo bianco).
FOGLIO_24 = dict(box=(206, 64, 818, 932), c=190, h=190, spessore=20, ombra=False)


def foglio_24() -> str:
    return foglio_pdf(BIANCO, ORO, ROSSO, ORO, NERO, **FOGLIO_24)


def icona_24(cornice: str) -> str:
    """Foglio bianco con contorno nero, piega d'oro, "PDF" rosso e z nera; nessun fondo attorno."""
    kind, k = CORNICI[cornice]
    if cornice == "ios":
        return forma(kind, BIANCO) + gruppo(k, foglio_24())
    return gruppo(k, foglio_24())


ICONE[24] = ("Foglio senza fondo", "Foglio bianco con contorno nero, piega d'oro, PDF rosso, z nera; nessun fondo", icona_24, BIANCO)
SERIE[6] = [19, 24]   # la 19 per confronto


# ------------------------------------------------------------------ favicon (pensati per 16-32 px), uno per icona
def favicon(n: int) -> str:
    # serie 2: lo stesso disegno dell'icona, più grande, con tratti più spessi e senza i dettagli invisibili a 16 px
    if n == 6:
        return forma("squircle", ROSSO, FAV) + (
            '<g transform="translate(512 512) scale(1.22) translate(-525 -580)">'
            f'<rect x="250" y="330" width="90" height="500" fill="{BIANCO}"/>'
            f'<path fill-rule="evenodd" fill="{BIANCO}" d="M450,330 A160,160 0 1 1 449.9,330 Z M450,420 A70,70 0 1 0 450.1,420 Z"/>'
            f'<path fill="{BIANCO}" d="M580,330 H800 V420 H580 Z M690,420 H800 L690,560 H580 Z M450,560 H800 V650 H450 Z"/></g>')
    if n == 7:
        return forma("squircle", BIANCO, FAV) + bordo("squircle", BORDO_CHIARO, 40, FAV) + (
            '<g transform="translate(512 512) scale(1.12) translate(-530 -512)">'
            f'<path fill="{NERO}" d="M290,200 H560 A212,212 0 0 1 560,624 H450 V824 H290 Z"/>'
            f'<path transform="translate(470 318) scale(1.9 1.98)" fill="{ROSSO}" d="{Z_SPESSA}"/></g>')
    if n == 8:
        alto, basso = "M302,222 H722 V604 H424 L600,420 H302 Z", "M302,420 H600 L424,604 H722 V802 H302 Z"
        tondo = 'stroke-width="50" stroke-linejoin="round"'
        return forma("squircle", NERO, FAV) + (
            '<g transform="translate(512 512) scale(1.18) translate(-512 -512)">'
            f'<path transform="translate(34 -34)" fill="{BIANCO}" stroke="{BIANCO}" {tondo} d="{alto}"/>'
            f'<path transform="translate(-34 34)" fill="{ORO}" stroke="{ORO}" {tondo} d="{basso}"/></g>')
    if n == 9:
        return forma("squircle", NERO, FAV) + (
            '<g transform="translate(512 512) scale(1.14) translate(-512 -521)">'
            f'<path fill="{ORO}" d="M322,196 H702 V300 C702,470 600,640 512,846 C424,640 322,470 322,300 Z"/>'
            f'<rect x="494" y="560" width="36" height="300" fill="{NERO}"/>'
            f'<path transform="translate(432 340) scale(1.6)" fill="{ROSSO}" d="{Z_SPESSA}"/></g>')
    if n == 24:
        return foglio_24()
    if n in (19, 21, 22):
        box, c = (190, 44, 834, 952), 200
        if n == 19:
            return foglio_pdf(BIANCO, ORO, ROSSO, ORO, ROSSO, box=box, c=c, h=200, con_filo=False)
        if n == 21:
            return foglio_pdf(ORO, ORO_CHIARO, ROSSO, ROSSO, ROSSO, box=box, c=c, h=200, con_filo=False, finitura=BIANCO)
        return foglio_pdf(ORO, ORO_CHIARO, ROSSO, BIANCO, ROSSO, box=box, c=c, h=200, con_filo=False, etichetta=BIANCO)
    if n in (20, 23):   # fondo bianco: quadrato arrotondato a tutta tela con il foglio dentro
        box, c = (236, 110, 788, 914), 170
        sheet = (foglio_pdf(ORO, ORO_CHIARO, ROSSO, NERO, ROSSO, box=box, c=c, h=170, con_filo=False) if n == 20 else
                 foglio_pdf(ROSSO, ORO, BIANCO, ORO, ORO, box=box, c=c, h=170, con_filo=False))
        return forma("squircle", BIANCO, FAV) + bordo("squircle", BORDO_CHIARO, 40, FAV) + sheet
    if n in (16, 17, 18):
        box, c = (190, 44, 834, 952), 200
        if n == 16:
            return foglio_pdf(ROSSO, ORO_CHIARO, ORO_CHIARO, NERO, ORO_CHIARO, box=box, c=c, h=200, con_filo=False)
        if n == 17:
            return foglio_pdf(ORO, ORO_CHIARO, ROSSO, NERO, ROSSO, box=box, c=c, h=200, con_filo=False)
        return foglio_pdf(ROSSO, ORO, ORO_CHIARO, NERO, ORO_CHIARO, cornice_oro=True, box=box, c=c, h=200, con_filo=False)
    if n == 11:
        return forma("squircle", NERO, FAV) + parola("PDF", 512 - larghezza("PDF", 300) / 2, 190, 300, BIANCO) + z_piccola(512, 600, 190, ROSSO)
    if n == 12:
        out = []
        for i in range(5):
            y, w = 152 + i * 150, 300
            x = 200 if i in (0, 4) else 524 - (i - 1) * 162
            out.append(f'<rect x="{x}" y="{y}" width="{624 if i in (0, 4) else w}" height="110" rx="55" fill="{ROSSO}"/>')
        return forma("squircle", BIANCO, FAV) + bordo("squircle", ORO, 48, FAV) + "".join(out)
    if n == 13:
        return (forma("squircle", NERO, FAV) + f'<rect x="222" y="140" width="580" height="744" rx="70" fill="{BIANCO}"/>'
                + tratteggio([(330, 300), (694, 300), (330, 724), (694, 724)], 70, 62, 66, ROSSO))
    if n == 14:
        return forma("squircle", ORO, FAV) + (
            '<g transform="translate(512 512) scale(1.22) translate(-512 -498)">'
            + f'<path fill="{ROSSO}" d="{GOCCIA}"/>' + z_piccola(512, 560, 170, BIANCO) + '</g>')
    if n == 15:
        return forma("squircle", ROSSO, FAV) + '<g transform="translate(512 512) scale(1.25) translate(-512 -510)">' + carte((NERO, ORO, BIANCO), False) + '</g>'
    return forma("squircle", ROSSO, FAV) + (
        '<g transform="translate(512 512) scale(1.2) translate(-512 -495)">'
        f'<path fill="{BIANCO}" d="M332,210 H692 L756,400 H268 Z"/>'
        f'<path fill="{ORO}" d="M268,400 H756 L692,590 H332 Z"/>'
        f'<path fill="{BIANCO}" d="M332,590 H692 L756,780 H268 Z"/></g>')


FAVICON = {
    6: "Legatura pz bianca su rosso",
    7: "P nera con la z rossa",
    8: "Foglio tagliato a Z su nero",
    9: "Pennino d'oro su nero",
    10: "Piega a Z bianca e oro su rosso",
    11: "PDF bianco e z rossa a capo, su nero",
    12: "z evidenziata in rosso, bordo d'oro",
    13: "Foglio con la z cucita",
    14: "Goccia rossa con la z, su oro",
    15: "Tre fogli a ventaglio su rosso",
    16: "Foglio PDF rosso, scritte oro",
    17: "Foglio PDF d'oro, scritte rosse",
    18: "Foglio PDF rosso con bordo d'oro",
    19: "Foglio PDF bianco, scritte rosse, piega d'oro",
    20: "Foglio d'oro su quadrato bianco",
    21: "Foglio d'oro con contorno bianco",
    22: "Foglio d'oro con fascia bianca dietro PDF",
    23: "Foglio rosso su quadrato bianco",
    24: "Foglio bianco, contorno nero, z nera, senza fondo",
}


# ------------------------------------------------------------------ disegno su file
def png(svg_text: str, size: int | tuple[int, int], rgb: str | None = None) -> Image.Image:
    """Da SVG a immagine Pillow (RGBA). rgb = colore di fondo per le immagini senza trasparenza."""
    doc = pymupdf.open(stream=svg_text.encode(), filetype="svg")
    page = doc[0]
    w, h = (size, size) if isinstance(size, int) else size
    pix = page.get_pixmap(matrix=pymupdf.Matrix(w / page.rect.width, h / page.rect.height), alpha=True)
    im = Image.open(io.BytesIO(pix.tobytes("png"))).convert("RGBA")
    if im.size != (w, h):
        im = im.resize((w, h), Image.LANCZOS)
    if rgb:
        base = Image.new("RGBA", im.size, rgb)
        base.alpha_composite(im)
        im = base.convert("RGB")
    return im


def scrivi(path: Path, data: str | bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if isinstance(data, str):
        path.write_text(data, encoding="utf-8", newline="\n")
    else:
        path.write_bytes(data)
    print("  ", path.relative_to(ROOT))


def salva(im: Image.Image, path: Path, **kw) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    im.save(path, **kw)
    print("  ", path.relative_to(ROOT))


def logo(n: int, negativo: bool = False) -> str:
    """Logo orizzontale: icona + scritta PDFz (negativo = per fondi scuri, scritta bianca)."""
    inner = (f'<g transform="scale({200 / 1024})">{ICONE[n][2]("app")}</g>'
             + scritta(232, 50, 100, BIANCO if negativo else NERO, ROSSO))
    return svg(inner, 232 + LARGHEZZA_SCRITTA + 20, 200, "PDFz")


def splash(n: int, w: int, h: int) -> Image.Image:
    """Schermata di avvio dell'app mobile: fondo bianco, icona e scritta al centro."""
    s = 0.30 * min(w, h)
    hs = 0.30 * s
    tot = s + 0.14 * s + hs
    y = (h - tot) / 2
    ws = LARGHEZZA_SCRITTA * hs / 100
    inner = (f'<rect width="{w}" height="{h}" fill="{BIANCO}"/>'
             f'<g transform="translate({(w - s) / 2:.2f} {y:.2f}) scale({s / 1024:.5f})">{ICONE[n][2]("app")}</g>'
             + scritta((w - ws) / 2, y + s * 1.14, hs, NERO, ROSSO))
    return png(svg(inner, w, h), (w, h), rgb=BIANCO)


def wix_banner(n: int) -> Image.Image:
    """Striscia in alto nelle finestre dell'installer (493x58): icona e scritta a destra."""
    w, h, ic, hs = 493, 58, 38, 24
    ws = LARGHEZZA_SCRITTA * hs / 100
    x = w - 12 - (ic + 8 + ws)
    inner = (f'<rect width="{w}" height="{h}" fill="{BIANCO}"/>'
             f'<g transform="translate({x:.2f} 10) scale({ic / 1024:.5f})">{ICONE[n][2]("app")}</g>'
             + scritta(x + ic + 8, (h - hs) / 2, hs, NERO, ROSSO))
    return png(svg(inner, w, h), (w, h), rgb=BIANCO)


def wix_dialog(n: int) -> Image.Image:
    """Sfondo della prima e dell'ultima finestra dell'installer (493x312): fascia nera a sinistra con il marchio."""
    w, h, fascia, ic, hs = 493, 312, 164, 88, 30
    ws = LARGHEZZA_SCRITTA * hs / 100
    inner = (f'<rect width="{w}" height="{h}" fill="{BIANCO}"/><rect width="{fascia}" height="{h}" fill="{NERO}"/>'
             f'<rect y="{h - 6}" width="{fascia}" height="6" fill="{ORO}"/>'
             f'<g transform="translate({(fascia - ic) / 2} 56) scale({ic / 1024:.5f})">{ICONE[n][2]("app")}</g>'
             + scritta((fascia - ws) / 2, 166, hs, BIANCO, ROSSO))
    return png(svg(inner, w, h), (w, h), rgb=BIANCO)


# ------------------------------------------------------------------ proposte e anteprima
def proposte(serie: int) -> None:
    numeri = SERIE[serie]
    print(f"Proposte della serie {serie} in branding/proposte")
    for n in numeri:
        scrivi(PROPOSTE / f"icona-{n}.svg", svg(ICONE[n][2]("app"), title=f"PDFz - icona {n} ({ICONE[n][0]})"))
        scrivi(PROPOSTE / f"favicon-{n}.svg", svg(favicon(n), title=f"PDFz - favicon {n}"))
    salva(foglio(numeri, f"PDFz - serie {serie}: icone (in alto) e favicon abbinati (in basso)"),
          PROPOSTE / f"anteprima-serie-{serie}.png", optimize=True)


def carattere(size: int):
    try:
        return ImageFont.truetype("segoeui.ttf", size)
    except OSError:
        try:
            return ImageFont.load_default(size=size)
        except TypeError:
            return ImageFont.load_default()


def a_capo(d: ImageDraw.ImageDraw, testo: str, font, larghezza: int) -> list[str]:
    righe, cur = [], ""
    for parola in testo.split():
        prova = f"{cur} {parola}".strip()
        if cur and d.textlength(prova, font=font) > larghezza:
            righe.append(cur); cur = parola
        else:
            cur = prova
    return righe + [cur]


def foglio(numeri: list[int], titolo: str) -> Image.Image:
    """Foglio di confronto: 5 icone (256, 64, 32 px, su chiaro e scuro) e i 5 favicon (64, 32, 16 px)."""
    col = 290
    W = max(80 + col * len(numeri), 900)
    im = Image.new("RGB", (W, 1050), "#F6F4F1")
    d = ImageDraw.Draw(im)
    f_t, f_n, f_s = carattere(30), carattere(22), carattere(16)
    d.text((40, 24), titolo, fill=NERO, font=f_t)
    for i, n in enumerate(numeri):
        x = 40 + i * col
        nome, desc, fn, _ = ICONE[n]
        big = png(svg(fn("app")), 230)
        im.paste(big, (x, 80), big)
        d.text((x, 320), f"{n}. {nome}", fill=NERO, font=f_n)
        for r, riga in enumerate(a_capo(d, desc, f_s, col - 30)):
            d.text((x, 350 + r * 20), riga, fill="#6f6862", font=f_s)
        for j, (bg, y) in enumerate(((None, 410), (NERO, 410))):
            bx = x + j * 120
            if bg:
                d.rounded_rectangle((bx - 8, y - 8, bx + 112, y + 92), 10, fill=bg)
            for sz, dx, dy in ((64, 0, 0), (32, 70, 0), (16, 70, 40)):
                ic = png(svg(fn("app")), sz)
                im.paste(ic, (bx + dx, y + dy), ic)
        # icona rotonda e adattiva Android, come le vede il telefono
        for j, cor in enumerate(("tondo", "pieno")):
            ic = png(svg(fn(cor)), 80)
            if cor == "pieno":   # sul telefono sotto c'è il colore di fondo dell'icona adattiva
                ic = Image.alpha_composite(Image.new("RGBA", (80, 80), ICONE[n][3]), ic)
                mask = Image.new("L", (80, 80), 0)
                ImageDraw.Draw(mask).ellipse((0, 0, 79, 79), fill=255)
                ic.putalpha(mask)
            im.paste(ic, (x + j * 95, 530), ic)
        d.text((x, 615), "Android: tonda e adattiva", fill="#6f6862", font=f_s)
    d.line((40, 655, W - 40, 655), fill="#d4cec7", width=2)
    for i, n in enumerate(numeri):
        x = 40 + i * col
        for j, (bg, fg) in enumerate((("#FFFFFF", NERO), ("#202124", BIANCO))):
            y = 690 + j * 120
            d.rounded_rectangle((x - 8, y - 8, x + 250, y + 84), 10, fill=bg, outline="#d4cec7")
            for sz, dx in ((64, 0), (32, 84), (16, 130)):
                ic = png(svg(favicon(n)), sz)
                im.paste(ic, (x + dx, y + (64 - sz) // 2), ic)
            d.text((x + 156, y + 22), "PDFz", fill=fg, font=f_n)
        for r, riga in enumerate(a_capo(d, f"{n}. {FAVICON[n]}", f_s, col - 30)):
            d.text((x, 935 + r * 20), riga, fill=NERO, font=f_s)
    d.text((40, 1000), "Applica la scelta: python branding/genera_marchio.py --icona N --favicon M", fill="#6f6862", font=f_s)
    return im


# ------------------------------------------------------------------ applicazione a tutte le piattaforme
def applica(n: int, m: int) -> None:
    nome, _, fn, fondo = ICONE[n]
    print(f"Applico icona {n} ({nome}) e favicon {m}")
    app_svg = svg(fn("app"))
    base = png(app_svg, 1024)

    # branding/ (originali)
    b = ROOT / "branding"
    scrivi(b / "icona.svg", app_svg)
    scrivi(b / "favicon.svg", svg(favicon(m)))
    scrivi(b / "logo.svg", logo(n))
    scrivi(b / "logo-negativo.svg", logo(n, negativo=True))
    salva(png(logo(n), (1124, 400)), b / "logo.png", optimize=True)
    for sz in (16, 24, 32, 48, 128, 180, 512, 1024):
        salva(png(app_svg, sz), b / f"icona-{sz}.png", optimize=True)

    # interfaccia (web, desktop, app mobile)
    pub = ROOT / "frontend" / "public"
    scrivi(pub / "icona.svg", app_svg)                      # logo nella barra in alto
    scrivi(pub / "favicon.svg", svg(favicon(m)))
    for sz in (16, 32):
        salva(png(svg(favicon(m)), sz), pub / f"favicon-{sz}.png", optimize=True)
    salva(png(app_svg, 512), pub / "icon-512.png", optimize=True)
    salva(png(svg(fn("ios")), 180, rgb=fondo), pub / "apple-touch-icon.png", optimize=True)
    # web app (manifest): 192 e 512 come l'icona dell'app, più la versione "maskable" a tutta tela e senza trasparenza,
    # che il telefono ritaglia nella sua forma: il disegno della cornice "pieno" (68%) sta nel cerchio sicuro (80%)
    salva(png(app_svg, 192), pub / "icon-192.png", optimize=True)
    for sz in (192, 512):
        salva(png(svg(fn("pieno")), sz, rgb=fondo), pub / f"icon-maskable-{sz}.png", optimize=True)

    # installer desktop
    a = ROOT / "packaging" / "assets"
    scrivi(a / "icon.svg", app_svg)
    salva(png(app_svg, 512), a / "icon.png", optimize=True)
    salva(png(app_svg, 256), a / "pdfz-256.png", optimize=True)          # Linux (AppImage)
    salva(png(svg(fn("ios")), 1024, rgb=fondo), a / "icon-ios-1024.png", optimize=True)
    ico_sizes = [(s, s) for s in (16, 24, 32, 48, 64, 128, 256)]
    salva(png(app_svg, 256), a / "icon.ico", sizes=ico_sizes,
          append_images=[png(app_svg, s) for s, _ in ico_sizes[:-1]])
    salva(base, a / "icon.icns")
    w = ROOT / "packaging" / "wix"
    salva(wix_banner(n), w / "banner.bmp")
    salva(wix_dialog(n), w / "dialog.bmp")

    # Android: icone (le dimensioni sono quelle dei file già presenti) e schermate di avvio
    res = ROOT / "mobile" / "android" / "app" / "src" / "main" / "res"
    for f in sorted(res.glob("mipmap-*/ic_launcher*.png")):
        sz = Image.open(f).size[0]
        cornice = {"ic_launcher.png": "app", "ic_launcher_round.png": "tondo", "ic_launcher_foreground.png": "pieno"}[f.name]
        salva(png(svg(fn(cornice)), sz), f, optimize=True)
    scrivi(res / "values" / "ic_launcher_background.xml",
           '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n'
           f'    <color name="ic_launcher_background">{fondo}</color>\n</resources>\n')
    for f in sorted(res.glob("drawable*/splash.png")):
        salva(splash(n, *Image.open(f).size), f, optimize=True)


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--serie", type=int, choices=sorted(SERIE), default=max(SERIE),
                    help="serie di proposte da rifare (predefinita: l'ultima)")
    ap.add_argument("--icona", type=int, choices=sorted(ICONE), help="icona da applicare")
    ap.add_argument("--favicon", type=int, choices=sorted(FAVICON), help="favicon da applicare")
    args = ap.parse_args(argv)
    proposte(args.serie)
    if args.icona or args.favicon:
        if not (args.icona and args.favicon):
            ap.error("servono sia --icona sia --favicon")
        applica(args.icona, args.favicon)
    return 0


if __name__ == "__main__":
    sys.exit(main())
