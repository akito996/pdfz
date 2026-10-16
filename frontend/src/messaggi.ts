import { useSyncExternalStore } from "react";

/** Messaggi brevi dell'app (quelli che compaiono in basso e spariscono dopo qualche secondo: "Salvato…", errori…).
 *  Restano qui per tutta la sessione, così si possono rileggere dalla campanella delle notifiche. */
export interface Messaggio { id: number; testo: string; tipo: "ok" | "err" | "info"; ora: number }

const MAX = 30;
let elenco: Messaggio[] = [];
let seq = 0;
const iscritti = new Set<() => void>();
const avvisa = () => iscritti.forEach((f) => f());

export function aggiungiMessaggio(testo: string, tipo: Messaggio["tipo"]) {
  elenco = [{ id: ++seq, testo, tipo, ora: Date.now() }, ...elenco].slice(0, MAX);
  avvisa();
}

export function svuotaMessaggi() {
  elenco = [];
  avvisa();
}

/** Elenco dei messaggi, dal più recente. */
export function useMessaggi(): Messaggio[] {
  return useSyncExternalStore((f) => { iscritti.add(f); return () => { iscritti.delete(f); }; }, () => elenco);
}
