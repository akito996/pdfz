/**
 * App Android: le richieste "api/..." dell'interfaccia non vanno in rete ma al motore Python
 * che gira nel Web Worker (vedi engine.worker.ts). Il resto dell'interfaccia è identico a Windows.
 */
type Pending = { resolve: (r: Response) => void };

// richieste che servono le librerie caricate in sottofondo (Word/Excel, firma digitale, file firmati…):
// aspettano che siano pronte. Tutte le altre (aprire, modificare, creare PDF da foto…) partono subito.
// Se una richiesta "leggera" scopre di aver bisogno di una libreria non ancora caricata, il motore la ripete da solo.
const HEAVY = /^\/api\/p7m\/|^\/api\/tools\/(convert_from_pdf|file_to_pdf|sign_cert|validate)$/;

export function startLocalEngine(onProgress: (label: string, pct: number) => void): Promise<void> {
  const worker = new Worker(new URL("./engine.worker.ts", import.meta.url), { type: "module" });
  const pending = new Map<number, Pending>();
  let next = 1;
  let readyResolve!: () => void;
  let readyReject!: (e: Error) => void;
  const ready = new Promise<void>((ok, ko) => { readyResolve = ok; readyReject = ko; });

  worker.onmessage = (ev) => {
    const m = ev.data;
    if (m.type === "progress") {
      onProgress(m.label, m.pct);
      if (m.pct >= 100) readyResolve();
    } else if (m.type === "fatal") {
      readyReject(new Error(m.message));
    } else if (m.type === "response") {
      const p = pending.get(m.id);
      pending.delete(m.id);
      p?.resolve(new Response(m.status === 204 || m.status === 304 ? null : m.body, { status: m.status, headers: m.headers }));
    }
  };
  worker.postMessage({ type: "init", root: new URL(".", document.baseURI).href });

  const original = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const req = new Request(input, init);
    const u = new URL(req.url);
    const at = u.pathname.indexOf("/api/");
    if (u.origin !== location.origin || at < 0) return original(input, init);
    const path = u.pathname.slice(at);
    const body = req.method === "GET" || req.method === "HEAD" ? null : await req.arrayBuffer();
    const headers: [string, string][] = [];
    req.headers.forEach((v, k) => headers.push([k, v]));
    // OCR: le parole le legge Tesseract qui nell'app (vedi ocr.ts)
    if (path === "/api/tools/ocr" && req.method === "POST" && !(window as any).__HD_OCR_INNER__) {
      const { runOcr } = await import("./ocr");
      const json = JSON.parse(new TextDecoder().decode(body!));
      const inner = async (p: string, b: any) => {
        (window as any).__HD_OCR_INNER__ = true;
        try {
          return await window.fetch(p.slice(1), b == null ? undefined
            : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) });
        } finally { (window as any).__HD_OCR_INNER__ = false; }
      };
      try { return await runOcr(json, inner); } catch (e: any) {
        return new Response(JSON.stringify({ detail: `OCR non riuscito: ${e?.message || e}` }), { status: 500, headers: { "content-type": "application/json" } });
      }
    }
    // elenco AgID: lo scarica l'app (connessione nativa, senza i limiti del browser) e lo passa al motore
    if (path === "/api/p7m/trust/refresh" && req.method === "POST") {
      const xml = await downloadTsl();
      if (xml) return window.fetch("api/p7m/trust/upload?source=online", { method: "POST", headers: { "Content-Type": "application/xml" }, body: xml });
    }
    const id = next++;
    return new Promise<Response>((resolve) => {
      pending.set(id, { resolve });
      worker.postMessage({ type: "request", id, method: req.method, path, query: u.search.slice(1), headers, body, heavy: HEAVY.test(path) },
        body ? [body] : []);
    });
  };
  (window as any).__HD_LOCAL__ = true;
  // all'avvio: se l'elenco AgID è quello incluso nell'app o ha più di 7 giorni, lo aggiorna in sottofondo (se c'è internet)
  ready.then(() => setTimeout(async () => {
    try {
      const t = await (await window.fetch("api/p7m/trust")).json();
      const age = t.fetched ? Date.now() - new Date(t.fetched).getTime() : Infinity;
      if (!t.available || t.source === "app" || age > 7 * 864e5) await window.fetch("api/p7m/trust/refresh", { method: "POST" });
    } catch { /* senza internet resta l'elenco che c'è */ }
  }, 8000));
  return ready;
}

const TSL_URL = "https://eidas.agid.gov.it/TL/TSL-IT.xml";

/** Scarica l'elenco AgID con la connessione nativa di Android (CapacitorHttp): il sito AgID non permette
 *  il download dalle pagine web (CORS), l'app sì. Restituisce null se non riesce. */
async function downloadTsl(): Promise<Blob | null> {
  try {
    const { Capacitor, CapacitorHttp } = await import("@capacitor/core");
    if (!Capacitor.isNativePlatform()) return null;
    const r = await CapacitorHttp.get({ url: TSL_URL, responseType: "text", connectTimeout: 20000, readTimeout: 60000 });
    if (r.status !== 200 || typeof r.data !== "string" || !r.data.includes("TrustServiceStatusList")) return null;
    return new Blob([r.data], { type: "application/xml" });
  } catch {
    return null;
  }
}
