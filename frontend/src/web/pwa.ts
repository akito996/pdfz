/**
 * Web app per iPhone ("Condividi › Aggiungi alla schermata Home", docs/web-app-iphone.md).
 *  - Registra il service worker (sw.js, scritto da mobile/scripts/build-web.mjs): l'interfaccia resta salvata nel
 *    telefono dal primo avvio e il motore (Pyodide, librerie, lingue OCR) dal primo uso: poi funziona senza internet.
 *  - Quando è pronta una nuova versione lo chiede con le finestre dell'app (mai window.confirm).
 *  - Chiede al browser di non cancellare i dati dell'app (navigator.storage.persist).
 */
export interface WebAppHooks {
  /** È pronta una nuova versione (null se il numero non è noto): true = aggiorna adesso (l'app si ricarica). */
  nuovaVersione: (versione: string | null) => Promise<boolean>;
  /** Il motore è salvato tutto nel telefono: da adesso funziona anche senza internet (detto una volta sola). */
  prontoOffline: () => void;
  /** Consiglio da mostrare una volta sola (es. come aggiungerla alla schermata Home). */
  consiglio: (testo: string) => void;
}

const standalone = () => matchMedia("(display-mode: standalone)").matches || (navigator as any).standalone === true;
const iPhone = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);

/** Una volta sola per telefono (memoria dell'app; se non è disponibile si ripete, pazienza). */
function primaVolta(chiave: string): boolean {
  try {
    if (localStorage.getItem(chiave)) return false;
    localStorage.setItem(chiave, new Date().toISOString());
  } catch { /* memoria non disponibile */ }
  return true;
}

/** Domanda al service worker con risposta (MessageChannel); null se non risponde in tempo. */
function chiedi(sw: ServiceWorker, tipo: string, attesa: number): Promise<any> {
  return new Promise((ok) => {
    const ch = new MessageChannel();
    const t = window.setTimeout(() => ok(null), attesa);
    ch.port1.onmessage = (e) => { window.clearTimeout(t); ok(e.data); };
    sw.postMessage({ tipo }, [ch.port2]);
  });
}

export function avviaWebApp(h: WebAppHooks): () => void {
  if (iPhone() && !standalone() && primaVolta("hdpdf.consiglioHome")) {
    h.consiglio("Per usare PDFz come un'app, anche senza internet: tocca Condividi e poi \"Aggiungi alla schermata Home\".");
  }
  const sw = navigator.serviceWorker;
  if (!sw || !window.isSecureContext) return () => {};   // serve https (o localhost)
  const via: (() => void)[] = [];
  const on = (t: EventTarget, ev: string, f: EventListener) => { t.addEventListener(ev, f); via.push(() => t.removeEventListener(ev, f)); };

  // nuova versione: il service worker nuovo resta in attesa finché non si sceglie "Aggiorna ora"; se si rimanda,
  // parte da solo la volta dopo che l'app viene chiusa del tutto e riaperta
  let ricarica = false;
  const offerte = new WeakSet<ServiceWorker>();   // una domanda per versione finché l'app resta aperta
  const offri = async (nuovo: ServiceWorker) => {
    if (offerte.has(nuovo) || !sw.controller) return;   // primo avvio: non c'è niente da aggiornare
    offerte.add(nuovo);
    const info = await chiedi(nuovo, "versione", 3000);
    if (!(await h.nuovaVersione(info?.versione ?? null))) return;
    ricarica = true;
    nuovo.postMessage({ tipo: "aggiorna" });   // prende il posto del vecchio: poi "controllerchange" e si ricarica
  };
  on(sw, "controllerchange", () => { if (ricarica) location.reload(); });

  let reg: ServiceWorkerRegistration | null = null;
  sw.register("./sw.js", { scope: "./" }).then((r) => {
    reg = r;
    if (r.waiting) offri(r.waiting);
    r.addEventListener("updatefound", () => {
      const n = r.installing;
      n?.addEventListener("statechange", () => { if (n.state === "installed") offri(n); });
    });
  }).catch(() => { /* niente service worker (es. navigazione privata): l'app funziona, ma solo con internet */ });
  // controllo della nuova versione: all'avvio (register), quando l'app torna in primo piano e ogni ora
  const controlla = () => { reg?.update().catch(() => {}); };
  on(document, "visibilitychange", () => { if (document.visibilityState === "visible") controlla(); });
  const timer = window.setInterval(controlla, 3600e3);
  via.push(() => window.clearInterval(timer));

  // motore caricato tutto: il service worker salva i file che mancano (lingue OCR, Tesseract…) per l'uso offline
  const completa = async () => {
    const r = await sw.ready;
    if (!r.active) return;
    const esito = await chiedi(r.active, "motore", 15 * 60e3);
    if (esito?.mancanti === 0 && primaVolta("hdpdf.offlinePronto")) h.prontoOffline();
  };
  on(window, "hdpdf-motore-completo", completa);
  if ((window as any).__HD_FULL__) completa();   // il motore era già pronto prima di arrivare qui

  // dati dell'app (impostazioni, firme salvate, file del motore): si chiede di non cancellarli quando serve spazio
  if (standalone()) navigator.storage?.persist?.().catch(() => {});
  return () => via.forEach((f) => f());
}
