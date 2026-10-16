"""Archivio temporaneo dei file di lavoro.

Ogni operazione produce una *nuova* versione del documento (nuovo id), così la UI
può offrire annulla/ripeti semplicemente tenendo la lista delle versioni.
I file vivono solo nella cartella temporanea locale: nulla lascia il PC.
"""
from __future__ import annotations

import mimetypes
import shutil
import threading
import time
import uuid
from dataclasses import dataclass, field
from pathlib import Path

from .config import work_dir


@dataclass
class Item:
    id: str
    name: str
    path: Path
    kind: str  # "pdf" | "asset" | "output"
    mime: str = "application/pdf"
    parent: str | None = None
    created: float = field(default_factory=time.time)
    extra: dict = field(default_factory=dict)


class Store:
    def __init__(self, root: Path | None = None):
        # una sottocartella per sessione: all'uscita viene eliminata
        self.base = work_dir()
        self.root = root or (self.base / f"sessione-{uuid.uuid4().hex[:8]}")
        self.root.mkdir(parents=True, exist_ok=True)
        self._items: dict[str, Item] = {}
        self._lock = threading.Lock()

    def new_path(self, suffix: str = ".pdf") -> Path:
        return self.root / f"{uuid.uuid4().hex}{suffix}"

    def add(self, path: Path, name: str, kind: str = "pdf", parent: str | None = None,
            mime: str | None = None, **extra) -> Item:
        item_id = uuid.uuid4().hex[:16]
        if mime is None:
            mime = mimetypes.guess_type(name)[0] or "application/octet-stream"
        item = Item(item_id, name, Path(path), kind, mime, parent, extra=extra)
        with self._lock:
            self._items[item_id] = item
        return item

    def add_bytes(self, data: bytes, name: str, kind: str = "asset", **kw) -> Item:
        suffix = Path(name).suffix or ".bin"
        p = self.new_path(suffix)
        p.write_bytes(data)
        return self.add(p, name, kind, **kw)

    def get(self, item_id: str) -> Item:
        try:
            return self._items[item_id]
        except KeyError:
            raise KeyError(f"Elemento non trovato: {item_id}") from None

    def delete(self, item_id: str) -> None:
        with self._lock:
            item = self._items.pop(item_id, None)
        if item:
            item.path.unlink(missing_ok=True)

    def close(self) -> None:
        """Elimina tutti i file temporanei di questa sessione."""
        shutil.rmtree(self.root, ignore_errors=True)

    def cleanup(self, max_age_s: float = 24 * 3600) -> None:
        """Rimuove i residui di sessioni precedenti (es. dopo un arresto anomalo)."""
        now = time.time()
        for p in self.base.glob("*"):
            if p == self.root:
                continue
            try:
                if now - p.stat().st_mtime > max_age_s:
                    if p.is_dir():
                        shutil.rmtree(p, ignore_errors=True)
                    else:
                        p.unlink(missing_ok=True)
            except OSError:
                pass


store = Store()
