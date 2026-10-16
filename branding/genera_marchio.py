"""Marchio PDFz: icone, favicon, logo, splash e immagini dell'installer. Unica fonte del disegno.

Tutto è fatto di forme geometriche (nessun carattere esterno, quindi nessuna licenza da rispettare) nei colori
del marchio: rosso, oro, nero, bianco. Le proposte sono 5 icone e 5 favicon; con --icona/--favicon la scelta
viene applicata a tutte le piattaforme (Windows, macOS, Linux, Android, iPhone, interfaccia web).

    python branding/genera_marchio.py                       # solo le proposte in branding/proposte (+ anteprima)
    python branding/genera_marchio.py --icona 1 --favicon 1 # proposte + applica la scelta ovunque

Richiede PyMuPDF (da SVG a PNG) e Pillow (ICO, ICNS, BMP): sono già nel .venv del progetto.
Nota: il motore SVG di PyMuPDF non gestisce sfumature né clipPath, per questo il disegno è piatto e le forme
"tagliate" (es. la diagonale dell'icona 4) sono calcolate qui.
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
Z_PEZZI = {"alto": "M0,0 H100 V22 H0 Z", "diagonale": "M60,22 H100 L40,78 H0 Z", "basso": "M0,78 H100 V100 H0 Z"}
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


def meta_diagonale(kind: str, fill: str, box=SQ) -> str:
    """Metà in alto a sinistra della forma, tagliata dalla diagonale (alto-destra -> basso-sinistra)."""
    if kind == "quadrato":
        return f'<path fill="{fill}" d="M1024,0 H0 V1024 Z"/>'
    if kind == "cerchio":
        a = 480 * math.cos(math.pi / 4)
        return f'<path fill="{fill}" d="M{512 + a:.2f},{512 - a:.2f} A480,480 0 0 0 {512 - a:.2f},{512 + a:.2f} Z"/>'
    x0, y0, x1, y1, r = box
    k = r * (1 - math.cos(math.pi / 4))   # la diagonale passa per i centri degli archi: li taglia a metà
    return (f'<path fill="{fill}" d="M{x1 - k:.2f},{y0 + k:.2f} A{r},{r} 0 0 0 {x1 - r},{y0} H{x0 + r} '
            f'A{r},{r} 0 0 0 {x0},{y0 + r} V{y1 - r} A{r},{r} 0 0 0 {x0 + k:.2f},{y1 - k:.2f} Z"/>')


def gruppo(k: float, inner: str) -> str:
    return inner if k == 1 else f'<g transform="translate(512 512) scale({k}) translate(-512 -512)">{inner}</g>'


# ------------------------------------------------------------------ le 5 icone
def icona_1(cornice: str) -> str:
    """Rubino: pagina bianca con l'angolo piegato in oro e la Z nera, su fondo rosso."""
    kind, k = CORNICI[cornice]
    pagina = ('<path fill="#FFFFFF" stroke="#FFFFFF" stroke-width="40" stroke-linejoin="round" '
              'd="M300,200 H574 L724,350 V824 H300 Z"/>'
              f'<path fill="{ORO}" stroke="{ORO}" stroke-width="40" stroke-linejoin="round" d="M574,200 V350 H724 Z"/>'
              + glifo(Z, 367, 455, 2.9, NERO))
    return forma(kind, ROSSO) + gruppo(k, pagina)


def icona_2(cornice: str) -> str:
    """Onice: monogramma Z in oro con cornice sottile e punto rosso, su fondo nero."""
    kind, k = CORNICI[cornice]
    segno = (f'<rect x="144" y="144" width="736" height="736" rx="128" fill="none" stroke="{ORO}" stroke-width="20"/>'
             + glifo(Z, 265, 322, 3.8, ORO)
             + f'<rect x="673" y="616" width="86" height="86" rx="14" fill="{ROSSO}"/>')
    return forma(kind, NERO) + gruppo(k, segno)


def icona_3(cornice: str) -> str:
    """Sigillo: timbro rosso dentellato con anello oro e Z bianca, su fondo bianco (richiama la firma)."""
    kind, k = CORNICI[cornice]
    punti = []
    for i in range(48):
        a = -math.pi / 2 + i * math.pi / 24
        r = 350 if i % 2 == 0 else 322
        punti.append(f"{512 + r * math.cos(a):.2f},{512 + r * math.sin(a):.2f}")
    timbro = (f'<path fill="{ROSSO}" stroke="{ROSSO}" stroke-width="10" stroke-linejoin="round" d="M{" L".join(punti)} Z"/>'
              f'<circle cx="512" cy="512" r="276" fill="none" stroke="{ORO}" stroke-width="18"/>'
              + glifo(Z, 377, 377, 2.7, BIANCO))
    return forma(kind, BIANCO) + bordo(kind, BORDO_CHIARO, 14) + gruppo(k, timbro)


def icona_4(cornice: str) -> str:
    """Fulmine: fondo diviso in diagonale nero/rosso, Z bianca con la barra in basso d'oro."""
    kind, k = CORNICI[cornice]
    s, x, y = 4.4, 292, 292
    z = (glifo(Z_PEZZI["alto"], x, y, s, BIANCO) + glifo(Z_PEZZI["diagonale"], x, y, s, BIANCO)
         + glifo(Z_PEZZI["basso"], x, y, s, ORO))
    return forma(kind, ROSSO) + meta_diagonale(kind, NERO) + gruppo(k, z)


def icona_5(cornice: str) -> str:
    """Scritta: "PDF" nero e "z" rossa su fondo oro, con una barra bianca sotto."""
    kind, k = CORNICI[cornice]
    h = 200
    x0 = 512 - LARGHEZZA_SCRITTA * h / 100 / 2
    parola = (scritta(x0, 400, h, NERO, ROSSO)
              + f'<rect x="{x0:.2f}" y="652" width="{LARGHEZZA_SCRITTA * h / 100:.2f}" height="28" rx="14" fill="{BIANCO}"/>')
    return forma(kind, ORO) + gruppo(k, parola)


ICONE = {
    1: ("Rubino", "Pagina bianca con angolo oro e Z nera su rosso", icona_1, ROSSO),
    2: ("Onice", "Monogramma Z oro con punto rosso su nero", icona_2, NERO),
    3: ("Sigillo", "Timbro rosso con anello oro e Z bianca su bianco", icona_3, BIANCO),
    4: ("Fulmine", "Diagonale nero/rosso, Z bianca con base oro", icona_4, ROSSO),
    5: ("Scritta", "PDF nero e z rossa su oro", icona_5, ORO),
}


# ------------------------------------------------------------------ i 5 favicon (pensati per 16-32 px)
def favicon(n: int) -> str:
    if n == 1:
        return forma("squircle", ROSSO, FAV) + glifo(Z_SPESSA, 232, 232, 5.6, BIANCO)
    if n == 2:
        return forma("squircle", NERO, FAV) + glifo(Z_SPESSA, 232, 232, 5.6, ORO)
    if n == 3:
        return forma("squircle", ORO, FAV) + glifo(Z_SPESSA, 232, 232, 5.6, NERO)
    if n == 4:
        return (f'<circle cx="512" cy="512" r="500" fill="{ROSSO}"/>'
                f'<circle cx="512" cy="512" r="430" fill="none" stroke="{ORO}" stroke-width="48"/>'
                + glifo(Z_SPESSA, 287, 287, 4.5, BIANCO))
    return forma("squircle", ROSSO, FAV) + meta_diagonale("squircle", NERO, FAV) + glifo(Z_SPESSA, 232, 232, 5.6, BIANCO)


FAVICON = {
    1: "Z bianca su rosso",
    2: "Z oro su nero",
    3: "Z nera su oro",
    4: "Sigillo rosso con anello oro",
    5: "Diagonale nero/rosso con Z bianca",
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
def proposte() -> None:
    print("Proposte in branding/proposte")
    for n in ICONE:
        scrivi(PROPOSTE / f"icona-{n}.svg", svg(ICONE[n][2]("app"), title=f"PDFz - icona {n} ({ICONE[n][0]})"))
    for n in FAVICON:
        scrivi(PROPOSTE / f"favicon-{n}.svg", svg(favicon(n), title=f"PDFz - favicon {n}"))
    scrivi(PROPOSTE / "logo.svg", logo(1))
    scrivi(PROPOSTE / "logo-negativo.svg", logo(1, negativo=True))
    salva(foglio(), PROPOSTE / "anteprima.png", optimize=True)


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


def foglio() -> Image.Image:
    """Foglio di confronto: le 5 icone (256, 64, 32 px, su chiaro e scuro) e i 5 favicon (64, 32, 16 px)."""
    W, col = 1500, 290
    im = Image.new("RGB", (W, 1050), "#F6F4F1")
    d = ImageDraw.Draw(im)
    f_t, f_n, f_s = carattere(30), carattere(22), carattere(16)
    d.text((40, 24), "PDFz - proposte di icona (in alto) e favicon (in basso)", fill=NERO, font=f_t)
    for i, n in enumerate(ICONE):
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
            if cor == "pieno":
                mask = Image.new("L", (80, 80), 0)
                ImageDraw.Draw(mask).ellipse((0, 0, 79, 79), fill=255)
                ic.putalpha(mask)
            im.paste(ic, (x + j * 95, 530), ic)
        d.text((x, 615), "Android: tonda e adattiva", fill="#6f6862", font=f_s)
    d.line((40, 655, W - 40, 655), fill="#d4cec7", width=2)
    for i, n in enumerate(FAVICON):
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
    ap.add_argument("--icona", type=int, choices=sorted(ICONE), help="icona da applicare (1-5)")
    ap.add_argument("--favicon", type=int, choices=sorted(FAVICON), help="favicon da applicare (1-5)")
    args = ap.parse_args(argv)
    proposte()
    if args.icona or args.favicon:
        if not (args.icona and args.favicon):
            ap.error("servono sia --icona sia --favicon")
        applica(args.icona, args.favicon)
    return 0


if __name__ == "__main__":
    sys.exit(main())
