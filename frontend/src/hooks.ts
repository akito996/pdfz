import { useCallback, useLayoutEffect, useRef, useState } from "react";

/** Restituisce una funzione con identità stabile che chiama sempre l'ultima versione di `fn`.
 *  Serve per passare gestori di eventi all'App senza creare cicli di aggiornamento:
 *  gli effetti possono dipendere solo dai dati, non dalle funzioni. */
export function useEvent<T extends (...args: any[]) => any>(fn: T): T {
  const ref = useRef(fn);
  useLayoutEffect(() => { ref.current = fn; });
  return useCallback(((...args: any[]) => ref.current(...args)) as T, []);
}

/** Tasto "indietro" di Android (evento hdpdf-back, android/intents.ts) per ciò che è aperto sopra il resto: lo
 *  prende l'ultimo aperto (pila), poi chi viene prima nell'App (menu ☰, strumento); se nessuno lo prende l'app va in
 *  secondo piano. Prima finestrelle, domande, guida e presentazione lo ignoravano: l'app spariva o si chiudeva lo
 *  strumento nascosto sotto. */
const pilaIndietro: { chiudi: () => void }[] = [];
let ascoltoIndietro = false;
export function useIndietro(attivo: boolean, chiudi: () => void) {
  const f = useRef(chiudi);
  f.current = chiudi;
  useLayoutEffect(() => {
    if (!attivo) return;
    const voce = { chiudi: () => f.current() };
    pilaIndietro.push(voce);
    if (!ascoltoIndietro) {
      ascoltoIndietro = true;
      window.addEventListener("hdpdf-back", (e) => {
        const v = pilaIndietro[pilaIndietro.length - 1];
        if (!v) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        v.chiudi();
      }, true);
    }
    return () => { const i = pilaIndietro.indexOf(voce); if (i >= 0) pilaIndietro.splice(i, 1); };
  }, [attivo]);
}

/** Stato ricordato tra un avvio e l'altro (preferenze dell'interfaccia). */
export function useStored<T>(key: string, initial: T): [T, (v: T) => void] {
  const [v, setV] = useState<T>(() => {
    try { const raw = localStorage.getItem(key); return raw == null ? initial : (JSON.parse(raw) as T); } catch { return initial; }
  });
  const set = useCallback((nv: T) => {
    setV(nv);
    try { localStorage.setItem(key, JSON.stringify(nv)); } catch { /* archiviazione non disponibile */ }
  }, [key]);
  return [v, set];
}
