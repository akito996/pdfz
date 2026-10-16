"""Avvio: `python -m hdpdf` apre l'app desktop; `python -m hdpdf --server` avvia solo il server
(utile in sviluppo: http://127.0.0.1:8765)."""
import argparse
import sys


def main() -> None:
    ap = argparse.ArgumentParser(prog="hdpdf")
    ap.add_argument("--server", action="store_true", help="solo server HTTP locale, senza finestra")
    ap.add_argument("--port", type=int, default=8765)
    ap.add_argument("--cleanup-all-users", action="store_true",
                    help="usato dal disinstallatore: elimina dati e file temporanei di tutti gli utenti")
    ap.add_argument("--setup-data", metavar="MODO", choices=["keep", "settings", "clean"],
                    help="usato dall'installer: keep = mantieni tutto, settings = solo impostazioni, clean = pulita")
    ap.add_argument("--azione", metavar="AZIONE",
                    help="menu del tasto destro di Windows: apri, crea-pdf, p7m-estrai, p7m-verifica, p7m-marca, p7m-cifra")
    ap.add_argument("files", nargs="*", help="file da aprire")
    args = ap.parse_args()
    if args.cleanup_all_users:
        from .cleanup import cleanup_all_users

        cleanup_all_users()
        return
    if args.setup_data:
        from .cleanup import apply_setup_mode

        apply_setup_mode(args.setup_data)
        return
    if args.server:
        import uvicorn

        from .server import create_app

        uvicorn.run(create_app(), host="127.0.0.1", port=args.port, log_level="info")
    else:
        files = args.files
        if args.azione:
            # menu del tasto destro: un avvio per file selezionato; uno solo prosegue con tutti i file
            from pathlib import Path

            from .menu import ACTIONS, collect_selection
            if args.azione not in ACTIONS:
                args.azione = "apri"
            got = collect_selection(args.azione, [str(Path(f).resolve()) for f in files if Path(f).exists()])
            if got is None:
                return
            files = got
        from .desktop import run

        run(files, args.azione)


if __name__ == "__main__":
    sys.exit(main())
