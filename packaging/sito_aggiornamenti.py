"""Sito degli aggiornamenti di PDFz per Cloudflare Pages (cartella statica, docs/cloudflare-aggiornamenti.md).

Scrive in --out:
  index.html             pagina degli aggiornamenti: ultima versione, download per ogni sistema, novità, codice sorgente
  versione-<sistema>.json avviso di nuova versione per le app (stesso formato di prima: scrivi_versione.py), con il
                         link diretto all'installer su questo sito: <base>download/vX.Y.Z/<file>
  _headers               intestazioni HTTP (file di versione e pagina sempre ricontrollati; regole della web app in /app/)
  icona.svg, favicon.svg, apple-touch-icon.png
La web app per iPhone, se compilata prima in <out>/app (mobile/scripts/build-web.mjs --out <out>/app), resta lì.
Gli installer non stanno nella cartella: li serve cloudflare/functions/download dall'archivio R2.

    python packaging/sito_aggiornamenti.py --out cloudflare/sito --base https://pdfz.agjin.com/ --tag v1.7.2 --installer assets
--radice: cartella del progetto alla versione del tag (versione, novità, icone); predefinita questa. Serve quando lo
script è più nuovo del tag (es. il flusso rilanciato a mano su una versione vecchia).
"""
from __future__ import annotations

import argparse
import html
import json
import re
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(Path(__file__).resolve().parent))
import scrivi_versione  # noqa: E402

SISTEMI = [   # (piattaforma, nome visibile, file, come installare)
    ("windows", "Windows 10/11", "PDFz-{v}-x64.msi",
     "Apri il file .msi scaricato: installa la nuova versione sopra quella attuale, impostazioni e firme restano."),
    ("macos", "macOS (Apple Silicon)", "PDFz-{v}-macOS-arm64.dmg",
     "Apri il file .dmg e trascina PDFz nella cartella Applicazioni, sostituendo quello vecchio."),
    ("linux", "Linux (x86_64)", "PDFz-{v}-x86_64.AppImage",
     "Rendi eseguibile il file .AppImage (tasto destro › Proprietà › Permessi, oppure chmod +x) e usalo al posto del vecchio."),
    ("android", "Android", "PDFz-{v}-android.apk",
     "Apri il file .apk scaricato e conferma l'aggiornamento (se richiesto, consenti l'installazione da questa fonte)."),
]
TIPI = {"nuovo": "Novità", "modifica": "Modifica", "correzione": "Correzione", "ottimizzazione": "Ottimizzazione",
        "installer": "Installer", "rimosso": "Eliminato"}
NOMI = {"windows": "Windows", "macos": "macOS", "linux": "Linux", "android": "Android", "ios": "iPhone", "web": "iPhone"}


def mb(n: int) -> str:
    return f"{n / 1e6:.1f} MB".replace(".", ",")


def data_it(d: str | None) -> str:
    m = re.fullmatch(r"(\d{4})-(\d{2})-(\d{2})", d or "")
    if not m:
        return ""
    mesi = "gennaio febbraio marzo aprile maggio giugno luglio agosto settembre ottobre novembre dicembre".split()
    return f"{int(m[3])} {mesi[int(m[2]) - 1]} {m[1]}"


def voci_html(voci: list[dict]) -> str:
    righe = []
    for x in voci:
        dove = f' <span class="dove">{html.escape(x["dove"])}</span>' if x.get("dove") else ""
        sistemi = ", ".join(dict.fromkeys(NOMI.get(p, p) for p in x.get("piattaforme") or []))
        su = f' <span class="su">({html.escape(sistemi)})</span>' if sistemi else ""
        dett = f'<div class="dett">{html.escape(x["dettaglio"])}</div>' if x.get("dettaglio") else ""
        righe.append(f'<li><span class="tipo t-{html.escape(x.get("tipo", ""))}">{TIPI.get(x.get("tipo"), "Modifica")}</span>'
                     f' <b>{html.escape(x["titolo"])}</b>{dove}{su}{dett}</li>')
    return "<ul class=\"voci\">" + "".join(righe) + "</ul>" if righe else ""


def pagina(versione: str, tag: str, presenti: dict[str, int], sorgente: str | None, novita: dict) -> str:
    """Pagina index.html. I link (download, web app, sorgente) sono relativi alla pagina: il sito risponde a più
    indirizzi (dominio dell'autore e <progetto>.pages.dev) e da ognuno si resta sullo stesso indirizzo."""
    vers = novita.get("versioni", [])
    cur = next((x for x in vers if x.get("versione") == versione), {"versione": versione, "voci": []})
    schede = []
    for pf, nome, modello, come in SISTEMI:
        f = modello.format(v=versione)
        if f not in presenti:
            schede.append(f'<div class="sist" data-pf="{pf}"><h3>{nome}</h3><p class="manca">Non disponibile in questa versione.</p></div>')
            continue
        url = f"download/{tag}/{f}"
        schede.append(
            f'<div class="sist" data-pf="{pf}"><h3>{nome}</h3>'
            f'<a class="scarica" href="{html.escape(url)}" download>Scarica <span>{html.escape(f)} · {mb(presenti[f])}</span></a>'
            f'<p class="come">{html.escape(come)}</p></div>')
    schede.append(
        '<div class="sist" data-pf="ios"><h3>iPhone e iPad</h3>'
        '<a class="scarica" href="app/">Apri la web app <span>da Safari</span></a>'
        '<p class="come">In Safari tocca Condividi › "Aggiungi alla schermata Home": PDFz si apre a tutto schermo e, '
        'dopo il primo avvio, funziona anche senza internet.</p></div>')
    vecchie = "".join(
        f'<details><summary>Versione {html.escape(x["versione"])}{" · " + data_it(x.get("data")) if x.get("data") else ""}'
        f'{" · " + html.escape(x["titolo"]) if x.get("titolo") else ""}</summary>{voci_html(x.get("voci", []))}</details>'
        for x in vers if x.get("versione") != versione)
    src = (f'<p class="sorgente">Codice sorgente di questa versione (licenza GNU AGPL-3.0): '
           f'<a href="{html.escape(f"download/{tag}/{sorgente}")}">{html.escape(sorgente)}</a></p>') if sorgente else ""
    return f"""<!doctype html>
<html lang="it">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>PDFz — aggiornamenti</title>
<meta name="description" content="Scarica PDFz {versione}: editor PDF che lavora tutto sul tuo dispositivo.">
<link rel="icon" href="favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="apple-touch-icon.png">
<style>
:root {{ --rosso: #C8102E; --oro: #D4AF37; --testo: #1c1917; --tenue: #6f6862; --fondo: #f6f4f1; --carta: #ffffff; --linea: #e5dfd6; }}
@media (prefers-color-scheme: dark) {{
  :root {{ --testo: #f3efe9; --tenue: #b8b0a6; --fondo: #161413; --carta: #211e1c; --linea: #3a3532; --rosso: #e0425b; }}
}}
* {{ box-sizing: border-box; }}
body {{ margin: 0; font: 16px/1.5 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color: var(--testo); background: var(--fondo); }}
main {{ max-width: 960px; margin: 0 auto; padding: 24px 16px 48px; }}
header {{ display: flex; align-items: center; gap: 14px; margin-bottom: 8px; }}
header img {{ width: 56px; height: 56px; }}
h1 {{ margin: 0; font-size: 28px; }}
h1 small {{ display: block; font-size: 15px; font-weight: 400; color: var(--tenue); }}
.ultima {{ margin: 18px 0 8px; font-size: 18px; }}
.ultima b {{ color: var(--rosso); }}
.sistemi {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 12px; margin: 16px 0 28px; }}
.sist {{ background: var(--carta); border: 1px solid var(--linea); border-radius: 12px; padding: 14px; }}
.sist.tuo {{ border-color: var(--rosso); box-shadow: 0 0 0 2px color-mix(in srgb, var(--rosso) 25%, transparent); }}
.sist.tuo h3::after {{ content: " · il tuo sistema"; color: var(--rosso); font-size: 13px; font-weight: 600; }}
.sist h3 {{ margin: 0 0 10px; font-size: 16px; }}
.scarica {{ display: block; text-decoration: none; background: var(--rosso); color: #fff; border-radius: 9px; padding: 10px 12px; font-weight: 700; }}
.scarica span {{ display: block; font-weight: 400; font-size: 12.5px; opacity: .9; word-break: break-all; }}
.come, .manca {{ margin: 10px 0 0; font-size: 13.5px; color: var(--tenue); }}
h2 {{ font-size: 20px; margin: 28px 0 8px; }}
.voci {{ padding-left: 18px; }}
.voci li {{ margin: 6px 0; }}
.tipo {{ font-size: 12px; font-weight: 700; border: 1px solid var(--linea); border-radius: 6px; padding: 0 6px; }}
.t-nuovo {{ color: #15803d; }} .t-correzione {{ color: #b45309; }} .t-rimosso {{ color: var(--tenue); }}
.dove, .su {{ color: var(--tenue); font-size: 14px; }}
.dett {{ color: var(--tenue); font-size: 14px; }}
details {{ background: var(--carta); border: 1px solid var(--linea); border-radius: 10px; padding: 8px 12px; margin: 8px 0; }}
summary {{ cursor: pointer; font-weight: 600; }}
.sorgente, footer {{ font-size: 13.5px; color: var(--tenue); }}
a {{ color: var(--rosso); }}
</style>
</head>
<body>
<main>
<header><img src="icona.svg" alt=""><h1>PDFz <small>Editor PDF che lavora tutto sul tuo dispositivo</small></h1></header>
<p class="ultima">Ultima versione: <b>{html.escape(versione)}</b>{" · " + data_it(cur.get("data")) if cur.get("data") else ""}
{"<br>" + html.escape(cur["titolo"]) if cur.get("titolo") else ""}</p>
<div class="sistemi">{"".join(schede)}</div>
<h2>Novità della versione {html.escape(versione)}</h2>
{voci_html(cur.get("voci", [])) or "<p>Correzioni minori.</p>"}
<h2>Versioni precedenti</h2>
{vecchie}
{src}
<footer><p>© agjin · PDFz è software libero (GNU AGPL-3.0). Le app cercano gli aggiornamenti qui
(<code>versione-&lt;sistema&gt;.json</code>).</p></footer>
</main>
<script>
// evidenzia la scheda del sistema di chi guarda
(function () {{
  var ua = navigator.userAgent, pf = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) ? "ios"
    : /Android/.test(ua) ? "android" : /Macintosh|Mac OS X/.test(ua) ? "macos" : /Linux/.test(ua) ? "linux" : /Windows/.test(ua) ? "windows" : "";
  var el = pf && document.querySelector('.sist[data-pf="' + pf + '"]');
  if (el) {{ el.classList.add("tuo"); el.parentNode.insertBefore(el, el.parentNode.firstChild); }}
}})();
</script>
</body>
</html>
"""


def intestazioni(out: Path) -> str:
    righe = ["# Cloudflare Pages: intestazioni HTTP (scritto da packaging/sito_aggiornamenti.py)",
             "# pagina e file di versione sempre ricontrollati: la nuova versione si vede subito",
             "/", "  Cache-Control: no-cache", "/index.html", "  Cache-Control: no-cache",
             "/versione-*", "  Cache-Control: no-cache", "  Access-Control-Allow-Origin: *", ""]
    app = out / "app" / "_headers"
    if app.exists():   # regole della web app (build-web.mjs), spostate sotto /app
        righe.append("# web app per iPhone (/app)")
        for r in app.read_text(encoding="utf-8").splitlines():
            righe.append("/app" + r if r.startswith("/") else r)
        app.unlink()
    return "\n".join(righe) + "\n"


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--out", required=True, help="cartella del sito (la web app, se c'è, è già in <out>/app)")
    ap.add_argument("--base", required=True, help="indirizzo del sito, https://… con la / finale (UPDATE_BASE_URL)")
    ap.add_argument("--tag", required=True, help="tag della versione, es. v1.4.0")
    ap.add_argument("--installer", required=True, help="cartella con gli installer della versione")
    ap.add_argument("--radice", default=str(ROOT), help="progetto alla versione del tag (predefinito: questo)")
    a = ap.parse_args(argv)
    radice = Path(a.radice).resolve()
    base = a.base if a.base.endswith("/") else a.base + "/"
    if not base.startswith("https://"):
        ap.error("--base deve iniziare con https://")
    versione = re.search(r'__version__ = "(.*)"', (radice / "backend/hdpdf/__init__.py").read_text(encoding="utf-8"))[1]
    if a.tag.lstrip("v") != versione:
        ap.error(f"il tag {a.tag} non corrisponde alla versione nel codice ({versione})")
    out, cartella = Path(a.out), Path(a.installer)
    out.mkdir(parents=True, exist_ok=True)
    presenti = {f.name: f.stat().st_size for f in cartella.iterdir() if f.is_file()}
    for pf, _, modello, _ in SISTEMI:
        f = modello.format(v=versione)
        if f in presenti:
            scrivi_versione.main(pf, f, str(out), installer=str(cartella / f), link_base=f"{base}download/{a.tag}/",
                                 pagina=base, root=radice)
        else:
            print(f"Avviso: manca {f}: {pf} non avrà l'avviso di questa versione")
    sorgente = next((n for n in presenti if n == f"PDFz-{versione}-sorgente.zip"), None)
    novita = json.loads((radice / "frontend/src/novita.json").read_text(encoding="utf-8-sig"))
    (out / "index.html").write_text(pagina(versione, a.tag, presenti, sorgente, novita), encoding="utf-8")
    (out / "_headers").write_text(intestazioni(out), encoding="utf-8")
    shutil.copyfile(radice / "branding/icona.svg", out / "icona.svg")
    shutil.copyfile(radice / "branding/favicon.svg", out / "favicon.svg")
    shutil.copyfile(radice / "frontend/public/apple-touch-icon.png", out / "apple-touch-icon.png")
    print(f"Sito degli aggiornamenti in {out} (base {base})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
