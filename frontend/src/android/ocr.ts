/**
 * OCR nell'app Android. MuPDF per WebAssembly non contiene Tesseract, quindi:
 *  1. il motore prepara le immagini delle pagine senza testo ("ocr_prepare");
 *  2. qui Tesseract (tesseract.js, WebAssembly, offline) legge le parole;
 *  3. lo strumento "ocr" del motore le scrive come testo invisibile, come nella versione Windows.
 */
type Call = (path: string, body: any) => Promise<Response>;

let worker: any = null;
let workerLangs = "";

async function getWorker(langs: string[]) {
  const key = langs.join("+");
  if (worker && workerLangs === key) return worker;
  if (worker) await worker.terminate();
  const { createWorker } = await import("tesseract.js");
  const base = new URL(".", document.baseURI).href;
  worker = await createWorker(langs, 1 /* solo LSTM */, {
    workerPath: `${base}ocr/worker.min.js`,
    // una sola versione del motore (SIMD, supportata da tutti i WebView recenti): APK più leggero
    corePath: `${base}ocr/tesseract-core-simd-lstm.wasm.js`,
    langPath: `${base}py/tessdata`,
    gzip: false,
    workerBlobURL: false,
    cacheMethod: "none",
  });
  workerLangs = key;
  return worker;
}

export async function runOcr(body: any, call: Call): Promise<Response> {
  const params = body.params || {};
  const prep = await call("/api/tools/ocr_prepare", body);
  if (!prep.ok) return prep;
  const { pages } = (await prep.json()).data as { pages: { page: number; image: string; px: [number, number]; pt: [number, number] }[] };
  let langs: string[] = params.languages || ["ita", "eng"];
  if (typeof langs === "string") langs = (langs as string).split(/[+,]/).filter(Boolean);
  langs = langs.filter((l) => ["ita", "eng"].includes(l));
  if (!langs.length) langs = ["ita"];
  const words: Record<string, [number, number, number, number, string][]> = {};
  if (pages.length) {
    const w = await getWorker(langs);
    for (const p of pages) {
      const img = await (await call(`/api/items/${p.image}/file`, null)).blob();
      const { data } = await w.recognize(img, {}, { blocks: true });
      const sx = p.pt[0] / p.px[0], sy = p.pt[1] / p.px[1];
      const list: [number, number, number, number, string][] = [];
      for (const b of data.blocks || []) for (const par of b.paragraphs || []) for (const line of par.lines || []) for (const wd of line.words || []) {
        if (!wd.text?.trim() || wd.confidence < 30) continue;
        const bb = wd.bbox;
        list.push([bb.x0 * sx, bb.y0 * sy, bb.x1 * sx, bb.y1 * sy, wd.text]);
      }
      words[String(p.page)] = list;
    }
  }
  return call("/api/tools/ocr", { ...body, params: { ...params, ocr_words: words } });
}
