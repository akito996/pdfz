"""Compressione PDF."""
from __future__ import annotations

import os
import subprocess

import pymupdf

from ..config import ghostscript_cmd
from .base import Ctx, Result, ToolError, boolean, num, tool

LEVELS = {
    # livello: (dpi soglia, dpi destinazione, qualità jpeg)
    "leggera": None,          # solo ottimizzazioni senza perdita
    "media": (180, 150, 75),
    "forte": (130, 110, 60),
    "massima": (90, 72, 45),
}


@tool("compress")
def compress(ctx: Ctx) -> Result:
    level = ctx.params.get("level", "media")
    if level not in LEVELS and level != "personalizzata":
        raise ToolError("Livello di compressione non valido.")
    grayscale = boolean(ctx.params.get("grayscale"), False)
    use_gs = boolean(ctx.params.get("ghostscript"), False)
    before = os.path.getsize(ctx.item.path)
    doc = ctx.open()
    if level == "personalizzata":
        dpi = int(num(ctx.params.get("dpi"), 150))
        cfg = (int(dpi * 1.2), dpi, int(num(ctx.params.get("quality"), 70)))
    else:
        cfg = LEVELS[level]
    if cfg or grayscale:
        th, tgt, q = cfg or (10_000, 0, 0)
        doc.rewrite_images(dpi_threshold=th, dpi_target=tgt, quality=q, set_to_gray=grayscale,
                           lossy=True, lossless=True, bitonal=True, color=True, gray=True)
    try:
        doc.subset_fonts()
    except Exception:
        pass
    doc.scrub(attached_files=False, clean_pages=False, embedded_files=False, hidden_text=False,
              javascript=False, metadata=False, redactions=False, remove_links=False,
              reset_fields=False, reset_responses=False, thumbnails=True, xml_metadata=False)
    out = ctx.out()
    doc.save(out, garbage=4, deflate=True, deflate_images=True, deflate_fonts=True, clean=True,
             use_objstms=1, compression_effort=int(num(ctx.params.get("effort"), 60)))
    doc.close()
    gs = ghostscript_cmd()
    if use_gs and gs:
        preset = {"leggera": "/printer", "media": "/ebook", "forte": "/ebook", "massima": "/screen"}.get(level, "/ebook")
        gs_out = ctx.out()
        args = [gs, "-sDEVICE=pdfwrite", "-dCompatibilityLevel=1.7", f"-dPDFSETTINGS={preset}",
                "-dNOPAUSE", "-dQUIET", "-dBATCH", "-dDetectDuplicateImages=true",
                f"-sOutputFile={gs_out}", str(out)]
        if grayscale:
            args[1:1] = ["-sColorConversionStrategy=Gray", "-dProcessColorModel=/DeviceGray"]
        try:
            subprocess.run(args, check=True, timeout=600, capture_output=True)
            if os.path.getsize(gs_out) < os.path.getsize(out):
                out = gs_out
        except Exception:
            pass
    after = os.path.getsize(out)
    if after >= before and level == "leggera":
        # nessun guadagno: si restituisce comunque il file ottimizzato ma lo si segnala
        pass
    saved = (1 - after / before) * 100 if before else 0
    return Result(pdf=out, data={"before": before, "after": after, "saved_percent": round(saved, 1)},
                  message=f"Da {before / 1024:.0f} KB a {after / 1024:.0f} KB ({saved:.0f}% in meno)."
                  if saved > 0 else "Il file era già ottimizzato: nessuna riduzione significativa.")
