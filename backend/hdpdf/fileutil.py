"""Piccoli aiuti per i file su Windows.

Su Windows un file appena scritto può restare "bloccato" per qualche secondo da un altro programma:
Microsoft Word/Excel/PowerPoint che si stanno chiudendo, OneDrive che lo sincronizza, l'antivirus che lo controlla.
In quel momento aprirlo o spostarlo dà PermissionError [Errno 13]. Qui si riprova per un po' invece di fallire subito.
"""
from __future__ import annotations

import shutil
import time
from pathlib import Path
from typing import Callable, TypeVar

T = TypeVar("T")

DEFAULT_TIMEOUT = 20.0


def retry_locked(fn: Callable[[], T], timeout: float = DEFAULT_TIMEOUT) -> T:
    """Esegue fn(); se il file è bloccato (PermissionError) riprova con attese crescenti fino a `timeout` secondi."""
    deadline = time.monotonic() + timeout
    delay = 0.1
    while True:
        try:
            return fn()
        except PermissionError:
            if time.monotonic() + delay > deadline:
                raise
            time.sleep(delay)
            delay = min(delay * 2, 1.0)


def wait_readable(path: Path | str, timeout: float = DEFAULT_TIMEOUT) -> None:
    """Aspetta che il file si possa leggere (nessun altro programma lo tiene bloccato)."""
    def _probe() -> None:
        with open(path, "rb") as f:
            f.read(1)
    retry_locked(_probe, timeout)


def move_when_free(src: Path | str, dst: Path | str, timeout: float = DEFAULT_TIMEOUT) -> None:
    """Sposta src in dst, riprovando finché il file è bloccato da un altro programma."""
    retry_locked(lambda: shutil.move(str(src), str(dst)), timeout)
