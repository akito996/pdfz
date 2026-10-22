"""Crea versione-<piattaforma>.json, il file letto dall'avviso "nuova versione" delle app già installate.

Stesso contenuto di scrivi-versione.ps1 (usato dalle build locali di Windows e Android), ma gira ovunque:
lo usa la pipeline di GitHub (.github/workflows/release.yml) per tutte le piattaforme.
Le novità vengono da frontend/src/novita.json (voce della versione attuale, filtrata per piattaforma).

Ogni piattaforma ha il suo file e il suo installer: Windows l'MSI, macOS il DMG, Linux l'AppImage, Android l'APK.
Campi per il download:
  file   nome dell'installer (le app vecchie lo scaricano da UPDATE_BASE_URL + file)
  url    link DIRETTO all'installer di questa versione (--link-base + file), es.
         https://github.com/<proprietario>/<repository>/releases/download/v1.0.1/PDFz-1.0.1-x64.msi
         resta valido anche quando escono versioni nuove; l'app lo usa al posto di UPDATE_BASE_URL + file
  size   dimensione in byte (--installer = percorso del file, per leggerla)
  pagina pagina della versione (es. la GitHub Release), per chi preferisce scaricare da lì

  python packaging/scrivi_versione.py windows PDFz-1.0.1-x64.msi dist/ \\
      --installer dist/PDFz-1.0.1-x64.msi \\
      --link-base https://github.com/akito996/pdfz/releases/download/v1.0.1/ \\
      --pagina https://github.com/akito996/pdfz/releases/tag/v1.0.1
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PLATFORMS = ("windows", "macos", "linux", "android")


def main(platform: str, file: str, out_dir: str, installer: str | None = None, link_base: str | None = None,
         pagina: str | None = None, root: Path = ROOT) -> Path:
    if platform not in PLATFORMS:
        raise SystemExit(f"Piattaforma '{platform}' non valida: usa {', '.join(PLATFORMS)}")
    init = (root / "backend" / "hdpdf" / "__init__.py").read_text(encoding="utf-8")
    version = re.search(r'__version__ = "(.*)"', init).group(1)
    data = json.loads((root / "frontend" / "src" / "novita.json").read_text(encoding="utf-8-sig"))
    v = next((x for x in data["versioni"] if x.get("versione") == version), None)
    if v is None:
        print(f"Avviso: novita.json non ha la voce della versione {version}: l'avviso mostrerà solo il numero di versione.")
        v = {"versione": version, "data": dt.date.today().isoformat(), "titolo": "", "voci": []}
    voci = [x for x in v.get("voci", []) if not x.get("piattaforme") or platform in x["piattaforme"]]
    info: dict = {"version": version, "date": v.get("data"), "titolo": v.get("titolo", ""), "file": file}
    if link_base:
        if not link_base.startswith("https://"):
            raise SystemExit(f"--link-base deve iniziare con https:// (c'è '{link_base}')")
        info["url"] = link_base.rstrip("/") + "/" + file
    if installer:
        info["size"] = Path(installer).stat().st_size
    if pagina:
        info["pagina"] = pagina
    info["novita"] = voci
    out = Path(out_dir) / f"versione-{platform}.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    # UTF-8 senza BOM (il BOM darebbe fastidio ad alcuni lettori JSON)
    out.write_text(json.dumps(info, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"File della versione: {out}  ({len(voci)} novità){'  link: ' + info['url'] if 'url' in info else ''}")
    return out


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("piattaforma", choices=PLATFORMS)
    ap.add_argument("file", help="nome dell'installer, es. PDFz-1.0.1-x64.msi")
    ap.add_argument("cartella", help="dove scrivere versione-<piattaforma>.json")
    ap.add_argument("--installer", help="percorso dell'installer, per scriverne la dimensione")
    ap.add_argument("--link-base", help="indirizzo (https) della cartella con l'installer: link diretto = indirizzo + file")
    ap.add_argument("--pagina", help="pagina della versione (es. la GitHub Release)")
    a = ap.parse_args()
    main(a.piattaforma, a.file, a.cartella, a.installer, a.link_base, a.pagina)
