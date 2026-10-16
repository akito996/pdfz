import React from "react";
import ReactDOM from "react-dom/client";
import "pdfjs-dist/web/pdf_viewer.css";
import "./styles.css";
import App from "./App";
import { initSettings } from "./settings";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { applyStoredLook } from "./components/ThemeMenu";

/** Ultima rete di sicurezza: invece della schermata bianca, un messaggio e il pulsante per ripartire. */
const fallback = (e: Error) => (
  <div style={{ padding: 24, fontFamily: "system-ui, sans-serif", maxWidth: 640 }}>
    <h2 style={{ color: "var(--brand, #b3122b)", marginTop: 0 }}>PDFz ha avuto un problema</h2>
    <p>Qualcosa nell'interfaccia non ha funzionato. I file aperti non sono stati modificati.</p>
    <pre style={{ whiteSpace: "pre-wrap", background: "#f4f5f8", padding: 10, borderRadius: 6, fontSize: 12 }}>{e.message || String(e)}</pre>
    <button onClick={() => location.reload()} style={{ padding: "8px 16px", background: "var(--brand, #b3122b)", color: "var(--on-brand, #fff)", border: 0, borderRadius: 6 }}>Ricarica l'app</button>
  </div>
);

const root = ReactDOM.createRoot(document.getElementById("root")!);

async function start() {
  import("./touchdrag").then((m) => m.enableTouchDrag()).catch(() => {});
  // app mobile (motore Python nel telefono): stessa interfaccia per Android (--mode android) e iPhone (--mode ios)
  if (import.meta.env.MODE === "android" || import.meta.env.MODE === "ios") {
    // app Android / iPhone: l'interfaccia compare subito; il motore Python parte in sottofondo (barra sottile in alto).
    // Le richieste fatte prima che sia pronto aspettano da sole. Le impostazioni restano nella memoria
    // dell'app (localStorage), che su Android non si perde: non serve aspettare il motore per leggerle.
    // niente zoom "di sistema" del WebView (ingrandiva tutta l'app e restava bloccato dopo la rotazione):
    // il documento si ingrandisce con due dita dentro il visualizzatore o con il menu dello zoom
    document.querySelector('meta[name="viewport"]')?.setAttribute("content",
      "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover");
    const [{ startLocalEngine }, { EngineBar, setEngineState }] = await Promise.all([import("./android/bridge"), import("./android/EngineBar")]);
    const ready = startLocalEngine((label, pct) => setEngineState({ label, pct }));
    import("./android/intents").then((m) => { m.listenForFiles(); m.listenForBack(); }).catch(() => {});
    ready.catch((e: any) => setEngineState({ label: "", pct: 0, error: String(e?.message || e) }));
    applyStoredLook();
    root.render(
      <React.StrictMode>
        <ErrorBoundary fallback={fallback}><App /></ErrorBoundary>
        <EngineBar />
      </React.StrictMode>,
    );
    return;
  }
  // prima si caricano le impostazioni salvate (preferiti, etichette, tema…), poi si disegna l'app
  await initSettings().catch(() => {});
  applyStoredLook();   // aspetto e colori salvati, prima del primo disegno
  root.render(
    <React.StrictMode>
      <ErrorBoundary fallback={fallback}><App /></ErrorBoundary>
    </React.StrictMode>,
  );
}

start();
