// Prova dell'app Android nel browser del PC:  node scripts/serve.mjs  ->  http://localhost:8790
// Web app per iPhone (cartella di build-web.mjs):  node scripts/serve.mjs www-web
// localhost conta come sito sicuro: service worker e "installa l'app" funzionano anche qui.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const MOBILE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const WWW = path.resolve(MOBILE, process.argv[2] || "www");
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".wasm": "application/wasm",
  ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml", ".zip": "application/zip", ".whl": "application/zip",
  ".webmanifest": "application/manifest+json", ".xml": "application/xml" };
const port = Number(process.env.PORT || 8790);
http.createServer((req, res) => {
  const u = decodeURIComponent(new URL(req.url, "http://x").pathname);
  let f = path.join(WWW, u === "/" ? "index.html" : u);
  if (!f.startsWith(WWW) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
  // sempre ricontrollati: la prova vede subito ogni nuova build (anche il service worker)
  res.writeHead(200, { "content-type": TYPES[path.extname(f)] || "application/octet-stream", "cache-control": "no-cache" });
  fs.createReadStream(f).pipe(res);
}).listen(port, () => console.log(`${path.basename(WWW)} nel browser: http://localhost:${port}`));
