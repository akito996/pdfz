// Prova dell'app Android nel browser del PC:  npm run serve  ->  http://localhost:8790
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const WWW = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "www");
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".wasm": "application/wasm",
  ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml", ".zip": "application/zip", ".whl": "application/zip" };
const port = Number(process.env.PORT || 8790);
http.createServer((req, res) => {
  const u = decodeURIComponent(new URL(req.url, "http://x").pathname);
  let f = path.join(WWW, u === "/" ? "index.html" : u);
  if (!f.startsWith(WWW) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { "content-type": TYPES[path.extname(f)] || "application/octet-stream" });
  fs.createReadStream(f).pipe(res);
}).listen(port, () => console.log(`App Android nel browser: http://localhost:${port}`));
