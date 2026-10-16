"""Pulizia completa usata dal disinstallatore MSI (`PDFz.exe --cleanup-all-users`).

Il disinstallatore gira come SYSTEM: per ogni profilo utente di Windows elimina
  %LOCALAPPDATA%\\PDFz              (log, firme salvate, cache dell'interfaccia)
  %LOCALAPPDATA%\\Temp\\PDFz-work   (file di lavoro temporanei)
così sul PC non resta traccia dell'applicazione.
"""
from __future__ import annotations

import os
import shutil
import sys
import tempfile
from pathlib import Path

from . import APP_ID

WORK_DIR_NAME = f"{APP_ID}-work"


def _profiles() -> list[Path]:
    homes: set[Path] = {Path.home()}
    if sys.platform.startswith("win"):
        try:
            import winreg  # type: ignore

            key = winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE,
                                 r"SOFTWARE\Microsoft\Windows NT\CurrentVersion\ProfileList")
            i = 0
            while True:
                try:
                    sid = winreg.EnumKey(key, i)
                except OSError:
                    break
                i += 1
                try:
                    with winreg.OpenKey(key, sid) as sk:
                        path, _ = winreg.QueryValueEx(sk, "ProfileImagePath")
                        homes.add(Path(os.path.expandvars(path)))
                except OSError:
                    continue
        except OSError:
            pass
        users = Path(os.environ.get("SystemDrive", "C:") + "\\") / "Users"
        if users.exists():
            homes.update(p for p in users.iterdir() if p.is_dir())
    return sorted(homes)


def targets() -> list[Path]:
    out = [Path(tempfile.gettempdir()) / WORK_DIR_NAME]
    for home in _profiles():
        local = home / "AppData" / "Local"
        out += [local / APP_ID, local / "Temp" / WORK_DIR_NAME]
        out.append(home / ".local" / "share" / APP_ID)  # Linux/sviluppo
    return [p for p in dict.fromkeys(out)]


def cleanup_all_users() -> int:
    removed = 0
    for p in targets():
        if p.exists():
            shutil.rmtree(p, ignore_errors=True)
            removed += 1
    return removed


# ---------------------------------------------------------------- scelta fatta nell'installer
SETTINGS_FILE = "impostazioni.json"
SETUP_MODES = ("keep", "settings", "clean")


def _data_dirs() -> list[Path]:
    out = []
    for home in _profiles():
        out += [home / "AppData" / "Local" / APP_ID, home / ".local" / "share" / APP_ID]
    if os.environ.get("HDPDF_DATADIR"):   # test
        out = [Path(os.environ["HDPDF_DATADIR"])]
    return [p for p in dict.fromkeys(out)]


def _work_dirs() -> list[Path]:
    out = [Path(tempfile.gettempdir()) / WORK_DIR_NAME]
    for home in _profiles():
        out.append(home / "AppData" / "Local" / "Temp" / WORK_DIR_NAME)
    return [p for p in dict.fromkeys(out)]


def apply_setup_mode(mode: str) -> dict:
    """Chiamato dall'installer MSI (`PDFz.exe --setup-data <modo>`) per tutti i profili del PC:
    * keep     → aggiornamento: non si tocca niente (impostazioni, preferiti, lingue scaricate, firme…);
    * settings → si tiene SOLO il file delle impostazioni (preferiti, etichette, tema…), tutto il resto
                 della versione vecchia viene eliminato; una copia di sicurezza resta nella cartella;
    * clean    → installazione pulita: si elimina tutto.
    """
    mode = (mode or "keep").strip().lower()
    if mode not in SETUP_MODES:
        mode = "keep"
    done = {"mode": mode, "kept": 0, "removed": 0}
    if mode == "keep":
        return done
    for d in _data_dirs():
        if not d.exists():
            continue
        saved = None
        f = d / SETTINGS_FILE
        if mode == "settings" and f.is_file():
            try:
                saved = f.read_bytes()
            except OSError:
                saved = None
        shutil.rmtree(d, ignore_errors=True)
        done["removed"] += 1
        if saved is not None:
            try:
                d.mkdir(parents=True, exist_ok=True)
                (d / SETTINGS_FILE).write_bytes(saved)
                import time
                (d / f"impostazioni-backup-{time.strftime('%Y%m%d-%H%M%S')}.json").write_bytes(saved)
                done["kept"] += 1
            except OSError:
                pass
    for w in _work_dirs():
        if w.exists():
            shutil.rmtree(w, ignore_errors=True)
    return done
