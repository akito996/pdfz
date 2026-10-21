/**
 * Comunicazione fra le finestre di PDFz aperte sullo stesso motore (app desktop con più finestre, oppure finestre del
 * browser su Linux): schede trascinate da una finestra all'altra e "Riunisci qui le altre finestre".
 *
 * Si usa BroadcastChannel: ogni messaggio arriva a tutte le altre finestre della stessa app (provato anche fra le
 * finestre di pywebview). I documenti non passano di qui: solo i biglietti del motore (/api/schede), che la finestra
 * di arrivo usa per ritirare la scheda.
 */
export const MIA_FINESTRA = Math.random().toString(36).slice(2) + Date.now().toString(36);

export type Messaggio =
  | { tipo: "ciao" | "ci-sono" | "addio"; da: string }                       // quali altre finestre sono aperte
  | { tipo: "trascina" | "fine-trascina" | "presa"; da: string; biglietto: string }   // scheda trascinata fuori
  | { tipo: "riunisci"; da: string }                                          // tutte le schede nella finestra "da"
  | { tipo: "consegna"; da: string; verso: string; biglietti: string[] };    // risposta a "riunisci"

const canale = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("pdfz-finestre") : null;

export function invia(m: Messaggio) {
  canale?.postMessage(m);
}

export function ascolta(h: (m: Messaggio) => void): () => void {
  if (!canale) return () => {};
  const f = (e: MessageEvent) => h(e.data as Messaggio);
  canale.addEventListener("message", f);
  return () => canale.removeEventListener("message", f);
}
