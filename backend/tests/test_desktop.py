"""App desktop: gli errori di salvataggio e i file bloccati arrivano alla pagina come eccezioni (AvvisoUtente),
che li mostra nella sua finestra. Niente finestre di sistema (create_confirmation_dialog) durante l'uso."""
from __future__ import annotations

import os
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
os.environ.setdefault("HDPDF_WORKDIR", str(Path(__file__).parent / "_work"))
os.environ.setdefault("HDPDF_DATADIR", str(Path(__file__).parent / "_data"))


@pytest.fixture
def d():
    """Il motore si carica qui e non all'import: test_tools.py svuota la cartella di lavoro quando viene raccolto,
    e un archivio dei file creato prima resterebbe senza cartella."""
    from hdpdf import desktop
    from hdpdf.store import store
    store.root.mkdir(parents=True, exist_ok=True)
    return desktop, store


def test_save_to_ok(d, tmp_path):
    desktop, store = d
    it = store.add_bytes(b"%PDF-1.4 prova", "prova.pdf", kind="pdf")
    dest = tmp_path / "copia.pdf"
    assert desktop.Api().save_to(it.id, str(dest)) is True
    assert dest.read_bytes() == b"%PDF-1.4 prova"
    assert not dest.with_suffix(".pdf.tmp").exists()


@pytest.mark.parametrize("target", ["manca/copia.pdf", "cartella.pdf"])
def test_save_to_error_goes_to_page(d, tmp_path, target):
    desktop, store = d
    # cartella che non esiste, oppure al posto del file c'è una cartella (Windows: accesso negato)
    (tmp_path / "cartella.pdf").mkdir()
    it = store.add_bytes(b"x", "prova.pdf", kind="pdf")
    api = desktop.Api()   # senza finestra: se si tentasse una finestra di sistema il test fallirebbe
    with pytest.raises(desktop.AvvisoUtente, match=Path(target).name):
        api.save_to(it.id, str(tmp_path / target))
    assert not list(tmp_path.rglob("*.tmp"))


def test_open_external_blocks_executables(d):
    desktop, store = d
    it = store.add_bytes(b"MZ", "programma.exe", kind="output")
    with pytest.raises(desktop.AvvisoUtente, match="antivirus"):
        desktop.Api().open_external(it.id)


def test_schermo_intero_inverte_solo_se_cambia(d):
    """Presentazione: pywebview sa solo invertire lo schermo intero; chiederlo due volte non lo deve spegnere."""
    desktop, _ = d
    api = desktop.Api()
    assert api.schermo_intero(True) is True   # senza finestra non succede niente
    chiamate = []
    api._window = type("Finestra", (), {"toggle_fullscreen": lambda self: chiamate.append(1)})()
    for v in (True, True, False, False, True):
        api.schermo_intero(v)
    assert len(chiamate) == 3 and api._intero is True


def test_nuova_finestra_solo_parametri_sicuri(d):
    """Scheda trascinata fuori: la pagina chiede un'altra finestra passando solo il biglietto nell'indirizzo."""
    desktop, _ = d
    api = desktop.Api()
    assert api.nuova_finestra("scheda=abc") is False   # senza run() (nessuna finestra) non succede niente
    aperte = []
    api._apri_finestra = aperte.append
    assert api.nuova_finestra("scheda=Ab3_-x9") is True
    for cattivo in ("", "scheda=a b", "x=1#y", "scheda=<script>", "a" * 201, "../file"):
        assert api.nuova_finestra(cattivo) is False
    assert aperte == ["scheda=Ab3_-x9"]
