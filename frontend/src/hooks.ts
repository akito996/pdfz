import { useCallback, useLayoutEffect, useRef, useState } from "react";

/** Restituisce una funzione con identità stabile che chiama sempre l'ultima versione di `fn`.
 *  Serve per passare gestori di eventi all'App senza creare cicli di aggiornamento:
 *  gli effetti possono dipendere solo dai dati, non dalle funzioni. */
export function useEvent<T extends (...args: any[]) => any>(fn: T): T {
  const ref = useRef(fn);
  useLayoutEffect(() => { ref.current = fn; });
  return useCallback(((...args: any[]) => ref.current(...args)) as T, []);
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
