"""Punto di ingresso dell'eseguibile (PyInstaller)."""
import multiprocessing
import sys

if __name__ == "__main__":
    multiprocessing.freeze_support()
    from hdpdf.__main__ import main

    sys.exit(main())
