/*
 * PDFz, web app per iPhone: service worker. Questo è il MODELLO: mobile/scripts/build-web.mjs lo copia nella cartella
 * della web app e mette al posto di __VERSIONE__, __INTERFACCIA__ e __MOTORE__ la versione e l'elenco dei file
 * (percorso -> impronta del contenuto). Documentazione: docs/web-app-iphone.md.
 *
 *  - Installazione: salva tutta l'interfaccia (pochi MB), così l'app si apre anche senza internet.
 *  - Motore (Pyodide, librerie Python, codice di PDFz, lingue OCR: circa 70 MB): ogni file si salva la prima volta
 *    che serve; dopo l'avvio la pagina chiede ("motore") di scaricare anche quelli non ancora usati (OCR…).
 *  - Nuova versione: resta in attesa finché la pagina non manda "aggiorna" (l'utente ha scelto "Aggiorna ora"
 *    nella finestra dell'app) o finché l'app non viene chiusa del tutto. Si riscaricano solo i file cambiati:
 *    ogni file è salvato con la sua impronta (?v=...), quelli uguali restano.
 */
const VERSIONE = "__VERSIONE__";
const INTERFACCIA = __INTERFACCIA__;
const MOTORE = __MOTORE__;

const BASE = new URL("./", self.registration.scope).href;   // es. https://utente.github.io/pdfz/
const CACHE = `pdfz ${BASE}`;   // un nome per indirizzo: su github.io lo stesso sito ospita più progetti
const chiave = (rel, h) => `${BASE}${rel}?v=${h}`;
// la pagina si chiede con l'indirizzo della cartella: alcuni siti (Cloudflare Pages) rimandano index.html a "/"
const indirizzo = (rel) => (rel === "index.html" ? BASE : BASE + rel);

async function impronta(buf) {
  const d = new Uint8Array(await crypto.subtle.digest("SHA-256", buf));
  return Array.from(d.slice(0, 10), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Salva la risposta solo se il contenuto è proprio quello di questa versione (il sito può essere appena cambiato). */
async function salva(cache, rel, h, risposta) {
  const buf = await risposta.arrayBuffer();
  if ((await impronta(buf)) !== h) return false;
  // solo il tipo: lunghezza e compressione del sito non valgono più per il contenuto già decompresso
  const tipo = risposta.headers.get("content-type") || "application/octet-stream";
  await cache.put(chiave(rel, h), new Response(buf, { status: 200, headers: { "content-type": tipo } }));
  return true;
}

async function scarica(cache, rel, h) {
  const r = await fetch(indirizzo(rel), { cache: "no-cache" });
  if (!r.ok) throw new Error(`${rel}: ${r.status}`);
  if (!(await salva(cache, rel, h, r))) throw new Error(`${rel}: contenuto diverso da quello atteso`);
}

self.addEventListener("install", (e) => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await Promise.all(Object.entries(INTERFACCIA).map(async ([rel, h]) => {
      if (!(await cache.match(chiave(rel, h)))) await scarica(cache, rel, h);
    }));
  })());
});

self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    // via i file delle versioni precedenti (solo quelli di PDFz a questo indirizzo)
    const valide = new Set([...Object.entries(INTERFACCIA), ...Object.entries(MOTORE)].map(([rel, h]) => chiave(rel, h)));
    const cache = await caches.open(CACHE);
    for (const req of await cache.keys()) if (!valide.has(req.url)) await cache.delete(req);
    await self.clients.claim();   // primo avvio: da subito anche i file del motore passano di qui
  })());
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || !req.url.startsWith(BASE)) return;
  let rel = decodeURIComponent(new URL(req.url).pathname.slice(new URL(BASE).pathname.length));
  // ogni pagina dell'app è index.html (anche aperta senza internet)
  if (rel === "" || (req.mode === "navigate" && !(rel in INTERFACCIA) && !(rel in MOTORE))) rel = "index.html";
  const h = INTERFACCIA[rel] || MOTORE[rel];
  if (!h) return;   // non è un file dell'app: decide il browser
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const salvata = await cache.match(chiave(rel, h));
    if (salvata) return salvata;
    const r = await fetch(indirizzo(rel), { cache: "no-cache" });
    if (r.ok) {
      const copia = salva(cache, rel, h, r.clone()).catch(() => false);
      try { e.waitUntil(copia); } catch { /* il browser non aspetta: si salverà la prossima volta */ }
    }
    return r;
  })());
});

self.addEventListener("message", (e) => {
  const m = e.data || {};
  const rispondi = (x) => e.ports[0]?.postMessage(x);
  if (m.tipo === "versione") rispondi({ versione: VERSIONE });
  else if (m.tipo === "aggiorna") self.skipWaiting();
  else if (m.tipo === "motore") e.waitUntil(completaMotore().then(rispondi, () => rispondi({ nuovi: 0, mancanti: -1 })));
});

/** Scarica i file del motore non ancora salvati, 4 alla volta. mancanti = quanti non è stato possibile scaricare. */
async function completaMotore() {
  const cache = await caches.open(CACHE);
  const coda = Object.entries(MOTORE);
  let nuovi = 0;
  let mancanti = 0;
  await Promise.all(Array.from({ length: 4 }, async () => {
    for (let x = coda.shift(); x; x = coda.shift()) {
      const [rel, h] = x;
      if (await cache.match(chiave(rel, h))) continue;
      try { await scarica(cache, rel, h); nuovi++; } catch { mancanti++; }
    }
  }));
  return { nuovi, mancanti };
}
