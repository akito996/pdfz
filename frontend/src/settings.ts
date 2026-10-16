/** Le impostazioni dell'interfaccia (chiavi "hdpdf.*" del localStorage) vengono copiate anche su disco tramite il server.
 *  Serve perché l'app desktop apre la finestra su una porta diversa a ogni avvio e il browser interno
 *  considera ogni porta un "sito" diverso: senza questa copia preferiti, etichette e tema andrebbero persi alla chiusura. */
const PREFIX = "hdpdf.";
const token = new URLSearchParams(location.search).get("t") || "";
const headers: Record<string, string> = { "Content-Type": "application/json", ...(token ? { "x-hdpdf-token": token } : {}) };

let pending: Record<string, string | null> = {};
let timer: number | undefined;

function flush(keepalive = false) {
  window.clearTimeout(timer);
  timer = undefined;
  if (!Object.keys(pending).length) return;
  const body = JSON.stringify(pending);
  pending = {};
  fetch("api/settings", { method: "PUT", headers, body, keepalive }).catch(() => { /* riprova alla prossima modifica */ });
}

function queue(key: string, value: string | null) {
  pending[key] = value;
  window.clearTimeout(timer);
  timer = window.setTimeout(() => flush(), 250);
}

/** Da chiamare prima di disegnare l'app: carica le impostazioni salvate e intercetta le modifiche. */
export async function initSettings() {
  let ls: Storage;
  try { ls = window.localStorage; } catch { return; }
  try {
    const r = await fetch("api/settings", { headers });
    if (r.ok) {
      const saved = (await r.json()) as Record<string, string>;
      const keys = Object.keys(saved);
      for (const k of keys) {
        try { ls.setItem(k, saved[k]); } catch { /* spazio esaurito */ }
      }
      if (!keys.length) {
        // primo avvio con questa versione: porta sul disco quello che il browser ricorda già
        for (let i = 0; i < ls.length; i++) {
          const k = ls.key(i);
          if (k?.startsWith(PREFIX)) pending[k] = ls.getItem(k);
        }
        flush();
      }
    }
    else return;   // file non leggibile: non si salva niente, così le impostazioni sul disco non vengono sovrascritte
  } catch { return; /* server non raggiungibile: si usa solo la memoria del browser, senza toccare il file */ }

  const proto = Object.getPrototypeOf(ls) as Storage;
  const set = proto.setItem, remove = proto.removeItem;
  proto.setItem = function (this: Storage, key: string, value: string) {
    set.call(this, key, value);
    if (this === ls && key.startsWith(PREFIX)) queue(key, String(value));
  };
  proto.removeItem = function (this: Storage, key: string) {
    remove.call(this, key);
    if (this === ls && key.startsWith(PREFIX)) queue(key, null);
  };
  window.addEventListener("pagehide", () => flush(true));
  window.addEventListener("beforeunload", () => flush(true));
}
