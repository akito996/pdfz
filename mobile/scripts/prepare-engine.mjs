// Prepara il motore dell'app Android dentro mobile/www:
//   www/pyodide/   Python in WebAssembly (Pyodide) con le sole librerie che servono
//   www/py/wheels  MuPDF (PyMuPDF per WebAssembly) e le librerie Python pure (Word, Excel, firma…)
//   www/py/hdpdf.zip  il codice degli strumenti, lo stesso della versione Windows
//   www/py/tessdata   lingue OCR
// I download restano in mobile/cache: le build successive non riscaricano niente.
//
//   node scripts/prepare-engine.mjs
//   node scripts/prepare-engine.mjs --www www-web                   (altra cartella: la web app, vedi build-web.mjs)
//   PYODIDE_DIR=/percorso/pyodide node scripts/prepare-engine.mjs   (cartella "pyodide" già estratta)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import crypto from "node:crypto";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MOBILE = path.resolve(HERE, "..");
const ROOT = path.resolve(MOBILE, "..");
const wwwArg = process.argv.indexOf("--www");
const WWW = wwwArg > 0 ? path.resolve(process.argv[wwwArg + 1]) : path.join(MOBILE, "www");
const CACHE = path.join(MOBILE, "cache");
const PYODIDE_VERSION = "0.29.5";   // Python 3.13, ABI pyemscripten_2025_0 (come la ruota WebAssembly di PyMuPDF)
const CDN = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;

// librerie di Pyodide: "basic" serve per aprire e vedere i documenti, "full" si carica in sottofondo, "word" (numpy,
// OpenCV e pdf2docx: solo "Trasforma in Word") quando serve. Prima "word" stava in "full": metà del caricamento in
// sottofondo a ogni avvio (misurato: 4,9 s e 130 MB di memoria in più) per un solo strumento
const PACKAGES = {
  basic: ["fastapi", "pydantic", "starlette", "anyio", "pillow", "tzdata"],
  full: ["lxml", "cryptography", "requests", "pyyaml", "fonttools", "charset-normalizer"],
  word: ["numpy", "opencv-python"],
};
// librerie da PyPI [nome, versione]; null = ultima. Le versioni sono quelle compatibili con le librerie di Pyodide.
const WHEELS = {
  basic: [["pymupdf", "1.28.2"], ["python-multipart", null], ["asn1crypto", null]],
  full: [
    ["python-docx", null], ["openpyxl", null], ["et-xmlfile", null], ["python-pptx", null], ["xlsxwriter", null],
    ["pdfplumber", "0.11.7"], ["pdfminer.six", "20250506"],
    ["pyhanko", "0.29.1"], ["pyhanko-certvalidator", "0.27.0"], ["tzlocal", null], ["uritools", null], ["oscrypto", null],
  ],
  word: [["pdf2docx", null]],
};
const TESSDATA = ["ita", "eng"];   // "osd" (riconoscimento orientamento, 10 MB) non serve: l'app non lo usa

const log = (...a) => console.log("  ", ...a);
const step = (s) => console.log(`\n==> ${s}`);
fs.mkdirSync(CACHE, { recursive: true });

async function download(url, dest) {
  if (fs.existsSync(dest) && fs.statSync(dest).size > 0) return dest;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Download non riuscito (${r.status}): ${url}`);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest + ".part", Buffer.from(await r.arrayBuffer()));
  fs.renameSync(dest + ".part", dest);
  log("scaricato", path.basename(dest));
  return dest;
}

const norm = (n) => n.toLowerCase().replace(/[-_.]+/g, "-");
// data fissa nei file dentro gli archivi rifatti qui: con lo stesso codice due build danno gli stessi byte, così
// la web app (service worker, build-web.mjs) a ogni nuova versione riscarica solo i file cambiati davvero
const ZIP_DATA = new Date(2020, 0, 1);

// Alleggerisce una libreria (.whl): toglie i file che l'app non usa e aggiorna l'elenco RECORD.
function slimWheel(file, drop) {
  const files = unzipSync(new Uint8Array(fs.readFileSync(file)));
  let removed = 0;
  for (const name of Object.keys(files)) if (drop(name)) { removed += files[name].length; delete files[name]; }
  if (!removed) return 0;
  const rec = Object.keys(files).find((n) => n.endsWith(".dist-info/RECORD"));
  if (rec) files[rec] = strToU8(strFromU8(files[rec]).split("\n").filter((l) => !drop(l.split(",")[0])).join("\n"));
  const before = fs.statSync(file).size;
  fs.writeFileSync(file, zipSync(files, { level: 9, mtime: ZIP_DATA }));
  return before - fs.statSync(file).size;
}
const sha256 = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");

// ------------------------------------------------------------------ Pyodide
step(`Pyodide ${PYODIDE_VERSION}`);
const srcDir = process.env.PYODIDE_DIR || path.join(CACHE, `pyodide-${PYODIDE_VERSION}`);
const pyFile = async (name) => {
  const local = path.join(srcDir, name);
  if (fs.existsSync(local)) return local;
  return download(CDN + name, local);
};
const CORE = ["pyodide.mjs", "pyodide.asm.js", "pyodide.asm.wasm", "python_stdlib.zip", "pyodide-lock.json"];
const outPy = path.join(WWW, "pyodide");
fs.rmSync(outPy, { recursive: true, force: true });
fs.mkdirSync(outPy, { recursive: true });
for (const f of CORE) fs.copyFileSync(await pyFile(f), path.join(outPy, f));
// copia con estensione .js: alcuni WebView Android non servono i file .mjs come JavaScript
fs.copyFileSync(path.join(outPy, "pyodide.mjs"), path.join(outPy, "pyodide-esm.js"));
const lock = JSON.parse(fs.readFileSync(path.join(outPy, "pyodide-lock.json"), "utf8"));
const byNorm = Object.fromEntries(Object.keys(lock.packages).map((k) => [norm(k), k]));
const closure = new Set();
const add = (n) => {
  const k = byNorm[norm(n)];
  if (!k) throw new Error(`Pacchetto Pyodide sconosciuto: ${n}`);
  if (closure.has(k)) return;
  closure.add(k);
  for (const d of lock.packages[k].depends || []) add(d);
};
[...PACKAGES.basic, ...PACKAGES.full, ...PACKAGES.word].forEach(add);
let pyBytes = 0;
for (const k of closure) {
  const f = lock.packages[k].file_name;
  const dst = path.join(outPy, f);
  fs.copyFileSync(await pyFile(f), dst);
  pyBytes += fs.statSync(dst).size;
}
// OpenCV (serve solo a "PDF in Word"): via i modelli per il riconoscimento dei volti, mai usati
const cv = [...closure].find((k) => norm(k) === "opencv-python");
if (cv) {
  const f = path.join(outPy, lock.packages[cv].file_name);
  const saved = slimWheel(f, (n) => n.startsWith("cv2/data/"));
  lock.packages[cv].sha256 = sha256(f);
  pyBytes -= saved;
  log(`OpenCV alleggerito di ${(saved / 1e6).toFixed(1)} MB`);
}
// elenco pacchetti ridotto a quelli inclusi (il file completo descrive centinaia di librerie)
lock.packages = Object.fromEntries([...closure].map((k) => [k, lock.packages[k]]));
fs.writeFileSync(path.join(outPy, "pyodide-lock.json"), JSON.stringify(lock));
log(`${closure.size} librerie, ${(pyBytes / 1e6).toFixed(1)} MB`);

// ------------------------------------------------------------------ librerie da PyPI
step("Librerie Python (PyPI)");
const outWheels = path.join(WWW, "py", "wheels");
fs.rmSync(outWheels, { recursive: true, force: true });
fs.mkdirSync(outWheels, { recursive: true });
const ABI = lock.info?.abi_version || "2025_0";
async function wheelFor(name, version) {
  const meta = await (await fetch(`https://pypi.org/pypi/${name}/${version ? version + "/" : ""}json`)).json();
  const files = meta.urls || [];
  const pick = files.find((f) => f.filename.endsWith("-none-any.whl"))
    || files.find((f) => f.filename.includes(`pyemscripten_${ABI}_wasm32`))
    || files.find((f) => f.filename.includes("emscripten") && f.filename.endsWith(".whl"));
  if (!pick) throw new Error(`Nessuna versione WebAssembly o "pura" di ${name} ${meta.info.version}`);
  return download(pick.url, path.join(CACHE, "wheels", pick.filename));
}
const manifest = { packages: PACKAGES, wheels: { basic: [], full: [], word: [] }, tessdata: [], pyodide: PYODIDE_VERSION };
for (const group of ["basic", "full", "word"]) {
  for (const [name, version] of WHEELS[group]) {
    const f = await wheelFor(name, version);
    const dst = path.join(outWheels, path.basename(f));
    fs.copyFileSync(f, dst);
    // MuPDF: via i file per programmatori C (intestazioni .h), inutili nell'app
    if (name === "pymupdf") log(`MuPDF alleggerito di ${(slimWheel(dst, (n) => n.includes("/mupdf-devel/")) / 1e6).toFixed(1)} MB`);
    manifest.wheels[group].push(path.basename(f));
  }
}
log(`${manifest.wheels.basic.length + manifest.wheels.full.length + manifest.wheels.word.length} librerie`);

// ------------------------------------------------------------------ codice degli strumenti
step("Codice di PDFz (backend/hdpdf)");
const files = {};
(function walk(dir, rel) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
    if (e.name === "__pycache__" || e.name.endsWith(".pyc")) continue;
    const p = path.join(dir, e.name);
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) walk(p, r);
    else files[r] = new Uint8Array(fs.readFileSync(p));
  }
})(path.join(ROOT, "backend", "hdpdf"), "hdpdf");
const fontsDir = path.join(ROOT, "fonts");
if (fs.existsSync(fontsDir)) for (const f of fs.readdirSync(fontsDir)) files[`fonts/${f}`] = new Uint8Array(fs.readFileSync(path.join(fontsDir, f)));
fs.writeFileSync(path.join(WWW, "py", "hdpdf.zip"), zipSync(files, { level: 6, mtime: ZIP_DATA }));
log(`${Object.keys(files).length} file`);

// ------------------------------------------------------------------ OCR
step("Lingue OCR");
const outTess = path.join(WWW, "py", "tessdata");
fs.rmSync(outTess, { recursive: true, force: true });
fs.mkdirSync(outTess, { recursive: true });
for (const l of TESSDATA) {
  const name = `${l}.traineddata`;
  const vendor = path.join(ROOT, "vendor", "tessdata", name);
  const cached = path.join(CACHE, "tessdata", name);
  const src = fs.existsSync(vendor) ? vendor
    : await download(`https://github.com/tesseract-ocr/tessdata_fast/raw/main/${name}`, cached);
  fs.copyFileSync(src, path.join(outTess, name));
  manifest.tessdata.push(name);
}
// Tesseract per WebAssembly (tesseract.js): MuPDF per WebAssembly non ha l'OCR integrato
const NM = path.join(ROOT, "frontend", "node_modules");
const outOcr = path.join(WWW, "ocr");
fs.rmSync(outOcr, { recursive: true, force: true });
fs.mkdirSync(outOcr, { recursive: true });
fs.copyFileSync(path.join(NM, "tesseract.js", "dist", "worker.min.js"), path.join(outOcr, "worker.min.js"));
for (const f of fs.readdirSync(path.join(NM, "tesseract.js-core"))) {
  // una sola versione (SIMD): le altre due (4 MB l'una) servono solo a browser molto vecchi
  if (f === "tesseract-core-simd-lstm.wasm.js") fs.copyFileSync(path.join(NM, "tesseract.js-core", f), path.join(outOcr, f));
}
// ------------------------------------------------------------------ elenco AgID (certificatori qualificati)
// Una copia va dentro l'app: così la verifica dei file firmati (p7m) riconosce le CA anche senza internet.
// L'app poi la aggiorna da sola quando è online. Se il download non riesce la build continua lo stesso.
step("Elenco certificatori AgID (TSL-IT)");
manifest.tsl = false;
try {
  const cached = path.join(CACHE, "tsl", "TSL-IT.xml");
  const old = fs.existsSync(cached) ? Date.now() - fs.statSync(cached).mtimeMs : Infinity;
  if (old > 7 * 864e5) fs.rmSync(cached, { force: true });
  await download("https://eidas.agid.gov.it/TL/TSL-IT.xml", cached);
  if (!fs.readFileSync(cached, "utf8").includes("TrustServiceStatusList")) throw new Error("file non valido");
  fs.mkdirSync(path.join(WWW, "py", "tsl"), { recursive: true });
  fs.copyFileSync(cached, path.join(WWW, "py", "tsl", "TSL-IT.xml"));
  manifest.tsl = true;
  log(`incluso (${(fs.statSync(cached).size / 1e6).toFixed(1)} MB)`);
} catch (e) {
  log(`ATTENZIONE: elenco AgID non scaricato (${e.message}). L'app lo scaricherà al primo avvio con internet.`);
}

// ------------------------------------------------------------------ precompilazione (avvio più veloce)
// Python, al primo import, deve "tradurre" ogni file .py in bytecode (.pyc): sul telefono costa secondi a ogni avvio,
// perché la memoria dell'app non conserva il risultato. Qui lo si fa una volta sola, con lo stesso Python dell'app
// (Pyodide eseguito da Node), e nelle librerie restano solo i .pyc. "optimize=2" toglie i testi di documentazione
// (docstring) e i controlli interni (assert): file più piccoli.
step("Precompilazione del codice Python");
try {
  const { loadPyodide } = await import(pathToFileURL(path.join(outPy, "pyodide.mjs")).href);
  const pyo = await loadPyodide({ indexURL: outPy + path.sep });
  pyo.runPython(`
import zipfile, importlib._bootstrap_external as be
def voce(name, info):
    # stessa data e attributi del file originale (non l'ora della build): archivio uguale a ogni build
    z = zipfile.ZipInfo(name, date_time=info.date_time)
    z.external_attr = info.external_attr
    return z
def precompile(src, dst):
    n = 0
    with zipfile.ZipFile(src) as zin, zipfile.ZipFile(dst, "w") as zout:
        scrivi = lambda name, info, data: zout.writestr(voce(name, info), data, zipfile.ZIP_DEFLATED, 9)
        for info in zin.infolist():
            data = zin.read(info)
            name = info.filename
            if name.endswith(".py") and ".dist-info/" not in name:
                try:
                    code = compile(data, name, "exec", dont_inherit=True, optimize=2)
                except SyntaxError:
                    scrivi(name, info, data)
                    continue
                scrivi(name + "c", info, bytes(be._code_to_timestamp_pyc(code, 0, 0)))
                n += 1
            else:
                scrivi(name, info, data)
    return n
`);
  const precompile = (file) => {
    pyo.FS.writeFile("/tmp/in.zip", new Uint8Array(fs.readFileSync(file)));
    const n = pyo.runPython(`precompile("/tmp/in.zip", "/tmp/out.zip")`);
    if (n) fs.writeFileSync(file, pyo.FS.readFile("/tmp/out.zip"));
    return n;
  };
  let files = 0, before = 0, after = 0;
  const run = (file) => { before += fs.statSync(file).size; files += precompile(file); after += fs.statSync(file).size; };
  // solo ciò che serve all'avvio (le librerie "full" si compilano la prima volta che servono): APK quasi invariato
  const startup = new Set();
  const addStart = (n) => { const k = byNorm[norm(n)]; if (!k || startup.has(k)) return; startup.add(k); for (const d of lock.packages[k].depends || []) addStart(d); };
  PACKAGES.basic.forEach(addStart);
  for (const k of startup) {
    const f = path.join(outPy, lock.packages[k].file_name);
    if (!f.endsWith(".whl")) continue;
    run(f);
    lock.packages[k].sha256 = sha256(f);
  }
  fs.writeFileSync(path.join(outPy, "pyodide-lock.json"), JSON.stringify(lock));
  for (const w of manifest.wheels.basic) run(path.join(outWheels, w));
  run(path.join(WWW, "py", "hdpdf.zip"));
  log(`${files} file compilati (${after >= before ? "+" : "-"}${(Math.abs(after - before) / 1e6).toFixed(1)} MB)`);
} catch (e) {
  // non blocca la build: l'app funziona lo stesso, solo con un avvio un po' più lento
  log(`ATTENZIONE: precompilazione non riuscita (${e.message}). L'app funziona lo stesso, con avvio più lento.`);
}

fs.writeFileSync(path.join(WWW, "py", "manifest.json"), JSON.stringify(manifest, null, 1));

const total = (function du(d) { return fs.readdirSync(d, { withFileTypes: true }).reduce((s, e) => s + (e.isDirectory() ? du(path.join(d, e.name)) : fs.statSync(path.join(d, e.name)).size), 0); })(WWW);
step(`Fatto: www = ${(total / 1e6).toFixed(0)} MB`);
