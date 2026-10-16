"""Crea versione-<piattaforma>.json, il file letto dall'avviso "nuova versione" delle app già installate.

Stesso contenuto di scrivi-versione.ps1 (usato dalle build locali di Windows e Android), ma gira ovunque:
lo usa la pipeline di GitHub (.github/workflows/release.yml) per tutte le piattaforme.
Le novità vengono da frontend/src/novita.json (voce della versione attuale, filtrata per piattaforma).
Il campo "file" è solo il nome dell'installer: l'app lo scarica da UPDATE_BASE_URL + nome, cioè con le GitHub Releases
https://github.com/<proprietario>/<repository>/releases/latest/download/<file> (stessa release del JSON).

  python packaging/scrivi_versione.py windows PDFz-1.0.0-x64.msi dist/
"""
from __future__ import annotations

import datetime as dt
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PLATFORMS = ("windows", "macos", "linux", "android")


def main(platform: str, file: str, out_dir: str) -> Path:
    if platform not in PLATFORMS:
        raise SystemExit(f"Piattaforma '{platform}' non valida: usa {', '.join(PLATFORMS)}")
    init = (ROOT / "backend" / "hdpdf" / "__init__.py").read_text(encoding="utf-8")
    version = re.search(r'__version__ = "(.*)"', init).group(1)
    data = json.loads((ROOT / "frontend" / "src" / "novita.json").read_text(encoding="utf-8-sig"))
    v = next((x for x in data["versioni"] if x.get("versione") == version), None)
    if v is None:
        print(f"Avviso: novita.json non ha la voce della versione {version}: l'avviso mostrerà solo il numero di versione.")
        v = {"versione": version, "data": dt.date.today().isoformat(), "titolo": "", "voci": []}
    voci = [x for x in v.get("voci", []) if not x.get("piattaforme") or platform in x["piattaforme"]]
    info = {"version": version, "date": v.get("data"), "titolo": v.get("titolo", ""), "file": file, "novita": voci}
    out = Path(out_dir) / f"versione-{platform}.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    # UTF-8 senza BOM (il BOM darebbe fastidio ad alcuni lettori JSON)
    out.write_text(json.dumps(info, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"File della versione: {out}  ({len(voci)} novità)")
    return out


if __name__ == "__main__":
    if len(sys.argv) != 4:
        raise SystemExit(__doc__)
    main(*sys.argv[1:])
