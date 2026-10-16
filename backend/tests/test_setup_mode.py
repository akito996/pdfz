"""Scelta fatta nell'installer: mantenere tutto, solo le impostazioni o installazione pulita."""
import json

import pytest

from hdpdf import cleanup


def _fill(d):
    d.mkdir(parents=True, exist_ok=True)
    (d / "impostazioni.json").write_text(json.dumps({"hdpdf.preferiti": "[\"sign\"]"}), encoding="utf-8")
    (d / "lingue").mkdir(exist_ok=True)
    (d / "lingue" / "pacchetto.bin").write_bytes(b"x")
    (d / "app.log").write_text("log")


@pytest.fixture
def data(tmp_path, monkeypatch):
    d = tmp_path / "dati"
    monkeypatch.setenv("HDPDF_DATADIR", str(d))
    monkeypatch.setattr(cleanup, "_work_dirs", lambda: [tmp_path / "work"])
    _fill(d)
    (tmp_path / "work").mkdir()
    return d


def test_keep(data):
    assert cleanup.apply_setup_mode("keep")["removed"] == 0
    assert (data / "impostazioni.json").exists() and (data / "lingue" / "pacchetto.bin").exists()


def test_settings_only(data, tmp_path):
    r = cleanup.apply_setup_mode("settings")
    assert r["kept"] == 1
    assert json.loads((data / "impostazioni.json").read_text())["hdpdf.preferiti"] == "[\"sign\"]"
    assert not (data / "lingue").exists() and not (data / "app.log").exists()
    assert list(data.glob("impostazioni-backup-*.json"))
    assert not (tmp_path / "work").exists()


def test_clean(data):
    cleanup.apply_setup_mode("clean")
    assert not data.exists()


def test_unknown_mode_is_safe(data):
    assert cleanup.apply_setup_mode("boh")["mode"] == "keep"
    assert (data / "impostazioni.json").exists()


def test_localzone_fallback(monkeypatch):
    """Fuso orario non presente nel pacchetto: la firma usa l'ora locale invece di fermarsi."""
    import datetime as dt

    import hdpdf
    import tzlocal

    def broken():
        raise RuntimeError("fuso orario non trovato")

    monkeypatch.setattr(tzlocal, "get_localzone", broken)
    hdpdf._safe_localzone()
    tz = tzlocal.get_localzone()
    assert dt.datetime.now(tz=tz).utcoffset() is not None
