/**
 * Motore dell'app Android: lo stesso codice Python della versione Windows, eseguito con Pyodide
 * (Python in WebAssembly) dentro un Web Worker, così l'interfaccia resta fluida mentre lavora.
 * Tutti i file arrivano dall'app stessa (cartelle pyodide/ e py/): non serve internet.
 */
const ctx = self as any;   // Web Worker

type Req = { id: number; method: string; path: string; query: string; headers: [string, string][]; body: ArrayBuffer | null; heavy: boolean };

let py: any = null;
let handle: any = null;
let basic: Promise<void> | null = null;   // sufficiente per aprire e vedere i documenti
let full: Promise<void> | null = null;    // tutte le librerie (conversioni, firma…)
let syncTimer: any;

const post = (m: any, t?: Transferable[]) => ctx.postMessage(m, t || []);
const progress = (label: string, pct: number) => post({ type: "progress", label, pct });

async function bytes(url: string): Promise<Uint8Array> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`File dell'app mancante: ${url}`);
  return new Uint8Array(await r.arrayBuffer());
}

async function boot(root: string) {
  progress("Avvio del motore PDF…", 5);
  // tutto quello che non dipende da Python si scarica in parallelo mentre Python parte
  const manP = fetch(`${root}py/manifest.json`).then((r) => r.json());
  const codeP = bytes(`${root}py/hdpdf.zip`);
  const { loadPyodide } = await import(/* @vite-ignore */ `${root}pyodide/pyodide-esm.js`);
  py = await loadPyodide({ indexURL: `${root}pyodide/`, stdout: () => {}, stderr: () => {} });
  const man = await manP;
  progress("Caricamento di MuPDF…", 30);
  // librerie di base + MuPDF in un colpo solo: Pyodide le scarica e prepara (compila) in parallelo
  const wheel = (w: string) => `${root}py/wheels/${w}`;
  await py.loadPackage([...man.packages.basic, ...man.wheels.basic.map(wheel)], { messageCallback: () => {}, checkIntegrity: false });
  py.unpackArchive(await codeP, "zip", { extractDir: "/app" });
  // lingue OCR: le legge direttamente Tesseract (ocr.ts); a Python basta sapere quali ci sono
  py.FS.mkdirTree("/app/vendor/tessdata");
  for (const t of man.tessdata) py.FS.writeFile(`/app/vendor/tessdata/${t}`, new Uint8Array(0));
  // dati che restano tra un avvio e l'altro (firme salvate, impostazioni): IndexedDB
  py.FS.mkdirTree("/data");
  py.FS.mount(py.FS.filesystems.IDBFS, {}, "/data");
  await new Promise<void>((ok) => py.FS.syncfs(true, () => ok()));
  progress("Preparazione degli strumenti…", 70);
  await py.runPythonAsync(`
import os, sys
sys.path.insert(0, "/app")
os.environ.setdefault("HDPDF_TSL_BUNDLED", "/app/vendor/tsl/TSL-IT.xml")
from hdpdf import pyodide_bridge
pyodide_bridge.init("/data")
`);
  handle = py.pyimport("hdpdf.pyodide_bridge").handle;
  progress("Pronto", 100);
  // il resto (OpenCV per Word, lxml, crittografia per le firme, elenco AgID…) si carica in sottofondo
  full = (async () => {
    await py.loadPackage([...man.packages.full, ...man.wheels.full.map(wheel)], { messageCallback: () => {}, checkIntegrity: false });
    // copia dell'elenco AgID presa durante la build: la verifica dei p7m funziona anche senza internet
    if (man.tsl) {
      py.FS.mkdirTree("/app/vendor/tsl");
      py.FS.writeFile("/app/vendor/tsl/TSL-IT.xml", await bytes(`${root}py/tsl/TSL-IT.xml`));
    }
    post({ type: "full" });
  })();
}

function persistSoon() {
  ctx.clearTimeout(syncTimer);
  syncTimer = ctx.setTimeout(() => py?.FS.syncfs(false, () => {}), 800);
}

async function serve(r: Req) {
  try {
    await basic;
    if (r.heavy) await full;
    const body = r.body ? new Uint8Array(r.body) : null;
    const call = async () => {
      const res = await handle(r.method, r.path, r.query, py.toPy(r.headers), body ? py.toPy(body) : null);
      const out = res.toJs({ create_proxies: false });
      res.destroy?.();
      return out;
    };
    let [status, headers, data] = await call();
    // serviva una libreria non ancora caricata (es. Word dentro "Crea PDF"): si aspetta e si ripete una volta
    if (status >= 400 && !r.heavy && full && new TextDecoder().decode(data as Uint8Array).includes("No module named")) {
      await full;
      [status, headers, data] = await call();
    }
    const buf = (data as Uint8Array).slice().buffer;
    post({ type: "response", id: r.id, status, headers, body: buf }, [buf]);
    if (r.method !== "GET") persistSoon();
  } catch (e: any) {
    const msg = JSON.stringify({ detail: `Errore del motore: ${String(e?.message || e).split("\n").slice(-3).join(" ")}` });
    const buf = new TextEncoder().encode(msg).buffer;
    post({ type: "response", id: r.id, status: 500, headers: [["content-type", "application/json"]], body: buf }, [buf]);
  }
}

ctx.onmessage = (ev: MessageEvent) => {
  const m = ev.data;
  if (m.type === "init") {
    basic = boot(m.root).catch((e) => { post({ type: "fatal", message: String(e?.message || e) }); throw e; });
  } else if (m.type === "request") {
    serve(m as Req);
  }
};
