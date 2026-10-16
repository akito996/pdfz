"""Ponte per l'app Android (e per la versione che gira tutta nel browser).

Il motore Python gira dentro l'app grazie a Pyodide (Python compilato in WebAssembly): niente server e niente rete.
La pagina intercetta le sue richieste "api/..." e le passa a `handle()`, che le consegna all'app FastAPI
come farebbe uvicorn. Così Windows, macOS, Linux e Android usano lo stesso identico codice degli strumenti.
"""
from __future__ import annotations

import asyncio
import os

_app = None


def _no_threads() -> None:
    """In WebAssembly non ci sono thread: le funzioni che FastAPI/Starlette manderebbero in un thread
    separato vengono eseguite subito (il motore gira già in un Web Worker, quindi la pagina resta reattiva)."""
    import anyio.to_thread

    async def run_sync(func, *args, abandon_on_cancel=False, cancellable=None, limiter=None):  # noqa: ARG001
        return func(*args)

    anyio.to_thread.run_sync = run_sync
    import starlette.concurrency as sc

    async def run_in_threadpool(func, *args, **kwargs):
        return func(*args, **kwargs)

    sc.run_in_threadpool = run_in_threadpool
    try:
        import fastapi.concurrency as fc
        import fastapi.routing as fr

        fc.run_in_threadpool = run_in_threadpool
        fr.run_in_threadpool = run_in_threadpool
    except Exception:  # noqa: BLE001
        pass
    try:
        import starlette.routing as sr
        sr.run_in_threadpool = run_in_threadpool
    except Exception:  # noqa: BLE001
        pass


def init(data_dir: str = "/data") -> dict:
    global _app
    os.environ.setdefault("HDPDF_DATADIR", data_dir)
    os.environ.setdefault("HDPDF_PLATFORM", "android")
    _no_threads()
    from . import __version__
    from .server import create_app

    _app = create_app(require_token=False)
    return {"version": __version__}


async def handle(method: str, path: str, query: str, headers: list, body) -> tuple[int, list, bytes]:
    """Una richiesta HTTP "finta": restituisce (stato, intestazioni, corpo)."""
    if _app is None:
        init()
    if body is None or type(body).__name__ in ("JsNull", "JsUndefined"):
        body = b""
    elif not isinstance(body, (bytes, bytearray)):
        body = bytes(body.to_py() if hasattr(body, "to_py") else body)
    headers = headers.to_py() if hasattr(headers, "to_py") else headers
    scope = {
        "type": "http", "asgi": {"version": "3.0"}, "http_version": "1.1",
        "method": method.upper(), "scheme": "https", "path": path, "raw_path": path.encode(),
        "query_string": (query or "").encode(), "root_path": "",
        "headers": [(str(k).lower().encode(), str(v).encode()) for k, v in (headers or [])],
        "client": ("127.0.0.1", 0), "server": ("localhost", 443),
    }
    state = {"sent": False, "status": 500, "headers": [], "chunks": []}

    async def receive():
        if state["sent"]:
            await asyncio.sleep(3600)
            return {"type": "http.disconnect"}
        state["sent"] = True
        return {"type": "http.request", "body": bytes(body or b""), "more_body": False}

    async def send(msg):
        if msg["type"] == "http.response.start":
            state["status"] = msg["status"]
            state["headers"] = [(k.decode("latin-1"), v.decode("latin-1")) for k, v in msg.get("headers", [])]
        elif msg["type"] == "http.response.body":
            state["chunks"].append(msg.get("body", b""))

    await _app(scope, receive, send)
    return state["status"], state["headers"], b"".join(state["chunks"])
