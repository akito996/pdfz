import * as pdfjs from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export { pdfjs };
export type PDFDoc = pdfjs.PDFDocumentProxy;
export type PDFPage = pdfjs.PDFPageProxy;

export async function loadPdf(url: string, password?: string): Promise<PDFDoc> {
  if ((window as any).__HD_LOCAL__) {
    // app Android: il file arriva dal motore interno, non da un server
    const data = new Uint8Array(await (await fetch(url)).arrayBuffer());
    return pdfjs.getDocument({ data, password, isEvalSupported: false, enableXfa: false }).promise;
  }
  const task = pdfjs.getDocument({ url, password, isEvalSupported: false, enableXfa: false });
  return task.promise;
}

export interface PageSize { w: number; h: number }

export async function pageSizes(doc: PDFDoc): Promise<PageSize[]> {
  const out: PageSize[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const p = await doc.getPage(i);
    const vp = p.getViewport({ scale: 1 });
    out.push({ w: vp.width, h: vp.height });
  }
  return out;
}

/** Renderizza una pagina su canvas alla larghezza richiesta (px CSS). */
export async function renderThumb(doc: PDFDoc, pageIndex: number, canvas: HTMLCanvasElement, width: number) {
  const page = await doc.getPage(pageIndex + 1);
  const base = page.getViewport({ scale: 1 });
  const scale = width / base.width;
  const vp = page.getViewport({ scale: scale * (window.devicePixelRatio || 1) });
  canvas.width = vp.width;
  canvas.height = vp.height;
  canvas.style.width = `${width}px`;
  const ctx = canvas.getContext("2d")!;
  await page.render({ canvasContext: ctx, viewport: vp }).promise;
}
