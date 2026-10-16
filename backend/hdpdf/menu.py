"""Menu del tasto destro di Windows (voce "PDFz" in Esplora risorse).

Modulo leggero di proposito: viene eseguito PRIMA di caricare il resto dell'app, perché con più file selezionati
Esplora risorse avvia il programma una volta per file e quasi tutti gli avvii devono solo lasciare il loro file e uscire.
"""
from __future__ import annotations

import json
import os
import time

from . import config

# azioni del menu del tasto destro di Windows (voce "PDFz" in Esplora risorse)
ACTIONS = ("apri", "crea-pdf", "p7m-estrai", "p7m-verifica", "p7m-marca", "p7m-cifra")


def collect_selection(action: str, files: list[str], quiet: float = 1.2, limit: float = 8.0) -> list[str] | None:
    """Con più file selezionati Esplora risorse avvia il programma una volta PER FILE, quasi insieme.
    Ogni avvio lascia il suo file in una coda; il primo che prende il "turno" aspetta che gli altri abbiano finito
    (nessun file nuovo per `quiet` secondi), li raccoglie tutti e prosegue; gli altri escono subito (None)."""
    qdir = config.data_dir() / "coda-menu"
    qdir.mkdir(parents=True, exist_ok=True)
    now = time.time()
    for old in qdir.glob("*.json"):            # resti di avvii interrotti
        try:
            if now - old.stat().st_mtime > 60:
                old.unlink()
        except OSError:
            pass
    (qdir / f"{action}-{os.getpid()}-{time.time_ns()}.json").write_text(json.dumps(files), encoding="utf-8")
    lock = qdir / f"{action}.lock"
    for _ in range(2):
        try:
            os.close(os.open(lock, os.O_CREAT | os.O_EXCL | os.O_WRONLY))
            break
        except FileExistsError:
            try:
                if time.time() - lock.stat().st_mtime > 30:   # turno rimasto da un avvio interrotto
                    lock.unlink()
                    continue
            except OSError:
                continue
            return None
    else:
        return None
    try:
        seen, last_new, start = set(), time.time(), time.time()
        while time.time() - start < limit:
            names = {q.name for q in qdir.glob(f"{action}-*.json")}
            if names - seen:
                seen |= names
                last_new = time.time()
            elif time.time() - last_new >= quiet:
                break
            time.sleep(0.15)
        out: list[str] = []
        for q in sorted(qdir.glob(f"{action}-*.json")):
            try:
                out += json.loads(q.read_text(encoding="utf-8"))
                q.unlink()
            except (OSError, ValueError):
                pass
        return list(dict.fromkeys(out))
    finally:
        lock.unlink(missing_ok=True)
