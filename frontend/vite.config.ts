import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
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
});
