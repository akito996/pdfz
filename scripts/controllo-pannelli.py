"""Controllo automatico dell'interfaccia: apre un PDF e tutti gli strumenti uno per uno, e segnala quelli che
vanno in errore (schermata bianca o "Questo strumento ha avuto un problema").

Serve dopo modifiche all'interfaccia (frontend/src). Uso, dalla cartella del progetto, con l'app avviata in modalita' server:
    python -m pip install playwright pymupdf && python -m playwright install chromium     (una volta)
    cd backend && python -m hdpdf --server --port 8811                                      (in un'altra finestra)
    python scripts/controllo-pannelli.py [http://127.0.0.1:8811/]
Nato dal bug 202610.014 (Info complete -> schermata bianca su tutte le piattaforme).
"""
import re
import sys
import tempfile
from pathlib import Path

import pymupdf
from playwright.sync_api import sync_playwright

URL = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8811/"
ROOT = Path(__file__).resolve().parent.parent
labels = re.findall(r'id: "[a-z_0-9]+", label: "([^"]+)"', (ROOT / "frontend" / "src" / "tools.ts").read_text(encoding="utf-8"))

pdf = Path(tempfile.gettempdir()) / "hdpdf-controllo.pdf"
d = pymupdf.open()
for i in range(2):
    d.new_page().insert_text((72, 72), f"Pagina {i + 1} di prova", fontsize=20)
d.set_toc([[1, "Uno", 1], [1, "Due", 2]])
d.save(pdf)

with sync_playwright() as pw:
    b = pw.chromium.launch()
    pg = b.new_page(viewport={"width": 1400, "height": 900})
    pg.set_default_timeout(5000)
    errs: list[str] = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto(URL)
    pg.wait_for_timeout(2500)
    pg.keyboard.press("Escape")
    if pg.locator(".notif-back").count():
        pg.locator(".notif-back").first.click(force=True)
    with pg.expect_file_chooser() as fc:
        pg.locator("input[type=file]").first.evaluate("e => e.click()")
    fc.value.set_files(str(pdf))
    pg.wait_for_timeout(3000)
    problemi = []
    for n in labels:
        prima = len(errs)
        try:
            pg.get_by_text(n, exact=True).first.evaluate("e => e.click()")
            pg.wait_for_timeout(1500)
        except Exception as ex:  # noqa: BLE001
            problemi.append((n, f"non cliccabile: {str(ex)[:80]}"))
            continue
        bianca = pg.evaluate("document.getElementById('root').innerHTML.length") < 1000
        avviso = pg.locator("text=Questo strumento ha avuto un problema").count() > 0
        if bianca or avviso or len(errs) > prima:
            problemi.append((n, "schermata bianca" if bianca else "errore nel pannello", errs[prima:]))
            if bianca:
                pg.reload()
                pg.wait_for_timeout(2500)
    b.close()

print(f"{len(labels)} strumenti controllati")
for p in problemi:
    print("PROBLEMA:", *p)
print("OK: nessun problema" if not problemi else f"{len(problemi)} strumenti con problemi")
sys.exit(1 if problemi else 0)
