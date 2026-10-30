import type * as PdfjsLib from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

/** pdf.js (circa 350 KB) si carica quando serve il primo PDF (e in sottofondo poco dopo l'avvio, caricaPdfjs in
 *  App): era metà del JavaScript iniziale e ritardava la schermata iniziale, soprattutto sui telefoni. */
let lib: typeof PdfjsLib | null = null;
let caricamento: Promise<typeof PdfjsLib> | null = null;
export function caricaPdfjs(): Promise<typeof PdfjsLib> {
  if (!caricamento) {
    caricamento = import("pdfjs-dist").then((m) => { m.GlobalWorkerOptions.workerSrc = workerUrl; lib = m; return m; });
    caricamento.catch(() => { caricamento = null; });   // non riuscito (es. aggiornamento in corso): si riprova
  }
  return caricamento;
}
/** pdf.js già pronto: c'è un PDF aperto (loadPdf l'ha caricato), quindi è così. */
export function pdfjs(): typeof PdfjsLib {
  if (!lib) throw new Error("pdf.js non è ancora caricato");
  return lib;
}

export type PDFDoc = PdfjsLib.PDFDocumentProxy;
export type PDFPage = PdfjsLib.PDFPageProxy;

export async function loadPdf(url: string, password?: string): Promise<PDFDoc> {
  const pdfjs = await caricaPdfjs();
  if ((window as any).__HD_LOCAL__) {
    // app Android: il file arriva dal motore interno, non da un server
    const data = new Uint8Array(await (await fetch(url)).arrayBuffer());
    return pdfjs.getDocument({ data, password, isEvalSupported: false, enableXfa: false }).promise;
  }
  const task = pdfjs.getDocument({ url, password, isEvalSupported: false, enableXfa: false });
  return task.promise;
}

export interface PageSize { w: number; h: number }

/** Misure di tutte le pagine: richieste insieme al worker di pdf.js (una alla volta, un PDF di centinaia di pagine
 *  restava fermo prima di mostrare la prima). */
export async function pageSizes(doc: PDFDoc): Promise<PageSize[]> {
  return Promise.all(Array.from({ length: doc.numPages }, (_, i) => doc.getPage(i + 1).then((p) => {
    const vp = p.getViewport({ scale: 1 });
    return { w: vp.width, h: vp.height };
  })));
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
  canvas.style.height = `${vp.height / (window.devicePixelRatio || 1)}px`;
  const ctx = canvas.getContext("2d")!;
  await page.render({ canvasContext: ctx, viewport: vp }).promise;
}
