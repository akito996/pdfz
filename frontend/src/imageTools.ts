/** Rende trasparente lo sfondo chiaro di una firma (foto o scansione) e la ritaglia sul tratto. */
export async function transparentSignature(dataUrl: string, maxSide = 1600): Promise<string> {
  const img = await new Promise<HTMLImageElement>((res, rej) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = () => rej(new Error("Immagine non leggibile"));
    im.src = dataUrl;
  });
  const k = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * k)), h = Math.max(1, Math.round(img.naturalHeight * k));
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, w, h);
  const im = ctx.getImageData(0, 0, w, h);
  const d = im.data;
  const n = w * h;

  // se l'immagine è già trasparente (PNG preparato) la si lascia com'è
  let transparent = 0;
  for (let i = 3; i < d.length; i += 4) if (d[i] < 250) transparent++;
  if (transparent / n > 0.02) return crop(c, ctx, d, w, h);

  // colore dello sfondo: mediana della luminosità sul bordo dell'immagine
  const lum = (i: number) => 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
  const border: number[] = [];
  const step = Math.max(1, Math.floor((w + h) / 400));
  for (let x = 0; x < w; x += step) { border.push(lum(x * 4), lum(((h - 1) * w + x) * 4)); }
  for (let y = 0; y < h; y += step) { border.push(lum(y * w * 4), lum((y * w + w - 1) * 4)); }
  border.sort((a, b) => a - b);
  const bg = Math.max(border[Math.floor(border.length / 2)] ?? 255, 150);

  // trasparenza graduale: più il pixel è vicino allo sfondo, più è trasparente (bordi del tratto morbidi)
  const lo = 12, hi = Math.max(40, (bg - 40) * 0.6);
  for (let p = 0; p < n; p++) {
    const i = p * 4;
    const diff = bg - lum(i);
    const a = diff <= lo ? 0 : diff >= hi ? 1 : (diff - lo) / (hi - lo);
    d[i + 3] = Math.round(a * 255);
    if (a > 0 && a < 1) {
      // toglie l'alone chiaro: scurisce il colore verso l'inchiostro
      for (let ch = 0; ch < 3; ch++) d[i + ch] = Math.max(0, Math.round((d[i + ch] - bg * (1 - a)) / a));
    }
  }
  ctx.putImageData(im, 0, 0);
  return crop(c, ctx, d, w, h);
}

function crop(c: HTMLCanvasElement, ctx: CanvasRenderingContext2D, d: Uint8ClampedArray, w: number, h: number): string {
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (d[(y * w + x) * 4 + 3] > 24) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  if (x1 < 0) return c.toDataURL("image/png");  // vuota: si lascia così
  const m = 4;
  x0 = Math.max(0, x0 - m); y0 = Math.max(0, y0 - m); x1 = Math.min(w - 1, x1 + m); y1 = Math.min(h - 1, y1 + m);
  const out = document.createElement("canvas");
  out.width = x1 - x0 + 1; out.height = y1 - y0 + 1;
  out.getContext("2d")!.drawImage(c, x0, y0, out.width, out.height, 0, 0, out.width, out.height);
  void ctx;
  return out.toDataURL("image/png");
}
