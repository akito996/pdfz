"""Numero di versione di PDFz: MAJOR.MINOR.PATCH (Semantic Versioning), es. 1.0.0, 1.2.3.

Fino alla 202610.015 le versioni erano AAAAMM.NNN: i numeri per gli installer devono restare PIÙ ALTI di quelli
di allora, altrimenti Windows e Android rifiutano l'aggiornamento ("è già installata una versione più recente").
  * MSI (Windows):        (100+MAJOR).MINOR.PATCH        (1.0.0 -> 101.0.0; le vecchie erano 26.10.N)
                          il primo numero non può superare 255 -> MAJOR fino a 155
  * Android versionCode:  1000000000 + MAJOR*1000000 + MINOR*1000 + PATCH
                          (1.0.0 -> 1001000000; le vecchie erano 202610NNN) - deve sempre crescere
  * iPhone (build):       come il versionCode di Android
  * macOS / npm:          la versione così com'è (1.0.0)
Gli stessi calcoli sono ripetuti negli script di build (build-windows.ps1, build-android.ps1, build-ios.sh).
"""
from __future__ import annotations

import re

PATTERN = re.compile(r"^(\d+)\.(\d+)\.(\d+)$")


def parse(v: str) -> tuple[int, int, int]:
    m = PATTERN.match((v or "").strip())
    if not m:
        raise ValueError(f"Versione non valida: {v!r} (formato MAJOR.MINOR.PATCH, es. 1.0.0)")
    major, minor, patch = (int(x) for x in m.groups())
    if major > 155 or minor > 255 or patch > 999:
        raise ValueError(f"Versione non valida: {v!r} (MAJOR fino a 155, MINOR fino a 255, PATCH fino a 999)")
    return major, minor, patch


def key(v: str) -> tuple[int, ...]:
    """Chiave per confrontare due versioni. Le vecchie AAAAMM.NNN (e qualsiasi altra cosa) contano come più vecchie."""
    try:
        return (1, *parse(v))
    except ValueError:
        return (0,)


def newer(remote: str, local: str) -> bool:
    """True se remote è una versione MAJOR.MINOR.PATCH più recente di local."""
    return PATTERN.match((remote or "").strip()) is not None and key(remote) > key(local)


def msi(v: str) -> str:
    major, minor, patch = parse(v)
    return f"{100 + major}.{minor}.{patch}"


def android_code(v: str) -> int:
    major, minor, patch = parse(v)
    return 1_000_000_000 + major * 1_000_000 + minor * 1_000 + patch


def next_version(v: str, part: str = "patch") -> str:
    """Versione successiva: part = "major" | "minor" | "patch"."""
    major, minor, patch = parse(v)
    if part == "major":
        return f"{major + 1}.0.0"
    if part == "minor":
        return f"{major}.{minor + 1}.0"
    return f"{major}.{minor}.{patch + 1}"
