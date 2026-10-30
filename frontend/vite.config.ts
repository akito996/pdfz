import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

/** Web app (--mode web, per l'iPhone: "Condividi › Aggiungi alla schermata Home"): manifest e indicazioni per Safari.
 *  Le icone sono quelle di frontend/public, scritte da branding/genera_marchio.py. Il service worker (sw.js) lo
 *  aggiunge mobile/scripts/build-web.mjs dopo il motore, perché deve conoscere tutti i file. */
function webApp(): Plugin {
  const manifest = {
    id: "./",
    name: "PDFz",
    short_name: "PDFz",
    description: "Editor PDF che lavora sul tuo dispositivo, anche senza internet.",
    lang: "it",
    dir: "ltr",
    start_url: "./",
    scope: "./",
    display: "standalone",
    orientation: "any",
    // colori del marchio (docs/branding.md): rosso dei pulsanti nella barra del sistema, fondo bianco all'avvio
    theme_color: "#B3122B",
    background_color: "#FFFFFF",
    categories: ["productivity", "utilities"],
    icons: [
      { src: "icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "icon-maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "icona.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
  };
  return {
    name: "pdfz-web-app",
    transformIndexHtml: () => [
      { tag: "link", attrs: { rel: "manifest", href: "./manifest.webmanifest" }, injectTo: "head" },
      // iPhone: a tutto schermo come un'app, barra di stato normale (il contenuto parte sotto l'ora e la batteria)
      { tag: "meta", attrs: { name: "apple-mobile-web-app-capable", content: "yes" }, injectTo: "head" },
      { tag: "meta", attrs: { name: "mobile-web-app-capable", content: "yes" }, injectTo: "head" },
      { tag: "meta", attrs: { name: "apple-mobile-web-app-status-bar-style", content: "default" }, injectTo: "head" },
      { tag: "meta", attrs: { name: "apple-mobile-web-app-title", content: "PDFz" }, injectTo: "head" },
      { tag: "meta", attrs: { name: "application-name", content: "PDFz" }, injectTo: "head" },
      // niente numeri trasformati in link "chiama" (pagine, misure, date)
      { tag: "meta", attrs: { name: "format-detection", content: "telephone=no" }, injectTo: "head" },
    ],
    generateBundle() {
      this.emitFile({ type: "asset", fileName: "manifest.webmanifest", source: JSON.stringify(manifest, null, 1) });
    },
  };
}

/** App Android (VITE_ANDROID in .env.android): viewport-fit=cover già nell'HTML. Capacitor 8 (SystemBars) lo legge
 *  quando la pagina compare: se lo trovasse solo dopo (scritto da main.tsx) il risultato cambierebbe da un avvio
 *  all'altro e la barra in alto finiva sotto l'ora e la batteria. Le zone del sistema le lascia libere .app (--sa-*). */
function androidApp(): Plugin {
  return {
    name: "pdfz-android",
    transformIndexHtml: (html) => html.replace(/<meta name="viewport" content="[^"]*"/,
      '<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover"'),
  };
}

export default defineConfig(({ mode }) => ({
  plugins: [react(), ...(mode === "web" ? [webApp()] : []),
    ...(loadEnv(mode, process.cwd()).VITE_ANDROID === "1" ? [androidApp()] : [])],
  base: "./",
  server: { proxy: { "/api": "http://127.0.0.1:8765" } },
  build: {
    outDir: "dist",
    chunkSizeWarningLimit: 2000,
    // i file .mjs (worker di pdf.js) diventano .js: alcuni WebView Android non servono .mjs come JavaScript
    rollupOptions: {
      output: { assetFileNames: (a) => (a.names?.[0] || a.name || "").endsWith(".mjs") ? "assets/[name]-[hash].js" : "assets/[name]-[hash][extname]" },
    },
  },
}));
