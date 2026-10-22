// Web app per iPhone ("Condividi › Aggiungi alla schermata Home"): cartella statica da pubblicare su un sito https.
// Documentazione: docs/web-app-iphone.md.
//
//   node scripts/build-web.mjs                    (dalla cartella mobile)  ->  mobile/www-web
//   node scripts/build-web.mjs --out <cartella>
//   node scripts/build-web.mjs --solo-sw          solo il service worker (cartella già compilata)
//   node scripts/serve.mjs www-web                prova in locale: http://localhost:8790
//
// 1. interfaccia: vite build --mode web (manifest e indicazioni per Safari in frontend/vite.config.ts)
// 2. motore: prepare-engine.mjs (Pyodide, librerie, codice di PDFz, lingue OCR), lo stesso dell'app Android
// 3. service worker: web/sw.js con la versione e l'elenco dei file, ognuno con l'impronta del suo contenuto
// Tutto con node.exe direttamente: su Windows mai tramite cmd.exe (niente npm run / npx).
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MOBILE = path.resolve(HERE, "..");
const ROOT = path.resolve(MOBILE, "..");
const FRONTEND = path.join(ROOT, "frontend");
const outArg = process.argv.indexOf("--out");
const OUT = outArg > 0 ? path.resolve(process.argv[outArg + 1]) : path.join(MOBILE, "www-web");

function node(label, cwd, args) {
  console.log(`\n==> ${label}`);
  const r = spawnSync(process.execPath, args, { cwd, stdio: "inherit" });
  if (r.status !== 0) {
    console.error(`ERRORE: ${label} non riuscito (codice ${r.status ?? r.signal}).`);
    process.exit(r.status || 1);
  }
}

// --solo-sw: rifà solo il service worker su una cartella già pronta (dopo una modifica a web/sw.js)
if (!process.argv.includes("--solo-sw")) {
  node("Interfaccia (Vite, --mode web)", FRONTEND,
    [path.join(FRONTEND, "node_modules", "vite", "bin", "vite.js"), "build", "--mode", "web", "--outDir", OUT, "--emptyOutDir"]);
  node("Motore Python (prepare-engine.mjs)", MOBILE, [path.join(HERE, "prepare-engine.mjs"), "--www", OUT]);
}

// ------------------------------------------------------------------ service worker
console.log("\n==> Service worker");
const version = /__version__\s*=\s*"([^"]+)"/.exec(fs.readFileSync(path.join(ROOT, "backend", "hdpdf", "__init__.py"), "utf8"))?.[1];
if (!version) throw new Error("__version__ non trovato in backend/hdpdf/__init__.py");
// file per i siti che li leggono (GitHub Pages: niente Jekyll; Cloudflare Pages / Netlify: intestazioni HTTP)
fs.writeFileSync(path.join(OUT, ".nojekyll"), "");
fs.writeFileSync(path.join(OUT, "_headers"), [
  "# Cloudflare Pages / Netlify: intestazioni HTTP della web app (GitHub Pages ignora questo file).",
  "# Pagina, manifest e service worker sempre ricontrollati: cosi' la nuova versione si vede subito.",
  "/", "  Cache-Control: no-cache",
  "/index.html", "  Cache-Control: no-cache",
  "/sw.js", "  Cache-Control: no-cache",
  "/manifest.webmanifest", "  Cache-Control: no-cache",
  "/assets/*", "  Cache-Control: public, max-age=31536000, immutable",
  "",
].join("\n"));

const SALTA = new Set(["sw.js", ".nojekyll", "_headers"]);
const MOTORE_DIRS = ["pyodide/", "py/", "ocr/"];
const interfaccia = {};
const motore = {};
let byteUi = 0;
let byteMotore = 0;
(function walk(dir, rel) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const r = rel ? `${rel}/${e.name}` : e.name;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { walk(p, r); continue; }
    if (SALTA.has(r)) continue;
    const buf = fs.readFileSync(p);
    const h = crypto.createHash("sha256").update(buf).digest("hex").slice(0, 20);   // come impronta() in sw.js
    if (MOTORE_DIRS.some((d) => r.startsWith(d))) { motore[r] = h; byteMotore += buf.length; }
    else { interfaccia[r] = h; byteUi += buf.length; }
  }
})(OUT, "");
if (!interfaccia["index.html"] || !interfaccia["manifest.webmanifest"]) throw new Error("index.html o manifest.webmanifest mancanti");

// si sostituiscono le righe intere (i nomi dei segnaposto compaiono anche nel commento in testa al modello)
let sw = fs.readFileSync(path.join(MOBILE, "web", "sw.js"), "utf8").replace(/\r\n/g, "\n");
for (const [riga, valore] of [
  ['const VERSIONE = "__VERSIONE__";', JSON.stringify(version)],
  ["const INTERFACCIA = __INTERFACCIA__;", JSON.stringify(interfaccia, null, 1)],
  ["const MOTORE = __MOTORE__;", JSON.stringify(motore, null, 1)],
]) {
  if (!sw.includes(riga)) throw new Error(`web/sw.js: manca la riga ${riga}`);
  sw = sw.replace(riga, () => `${riga.slice(0, riga.indexOf("=") + 1)} ${valore};`);
}
fs.writeFileSync(path.join(OUT, "sw.js"), sw);
const mb = (n) => `${(n / 1e6).toFixed(1)} MB`;
console.log(`   versione ${version}: interfaccia ${Object.keys(interfaccia).length} file (${mb(byteUi)}, salvati all'installazione),`
  + ` motore ${Object.keys(motore).length} file (${mb(byteMotore)}, salvati al primo uso)`);
console.log(`\n==> Fatto: ${path.relative(process.cwd(), OUT) || OUT}`);
