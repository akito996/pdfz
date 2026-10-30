import { createContext, useCallback, useContext, useEffect, useRef } from "react";
import type { Capabilities, DocInfo, FontInfo, ToolResponse } from "./api";
import type { PDFDoc, PageSize } from "./pdf";
import type { Interaction, Overlay } from "./types";
import type { DownloadEntry } from "./components/Downloads";

export interface Tab {
  key: string;
  history: DocInfo[];
  index: number;
  savedIndex: number; // versione salvata su disco
  savedPath?: string;
  password?: string;
  protect?: Record<string, any>;   // app Android: protezione da rimettere al salvataggio se una modifica l'ha tolta
}

export interface AppCtx {
  doc: DocInfo | null;
  pdf: PDFDoc | null;
  sizes: PageSize[];
  currentPage: number;
  tabs: Tab[];
  fonts: FontInfo[];
  caps: Capabilities | null;
  run: (tool: string, params?: any, opts?: { docs?: string[]; newTab?: boolean; silent?: boolean; noDoc?: boolean }) => Promise<ToolResponse | null>;
  setInteraction: (i: Interaction) => void;
  setOverlays: (o: Overlay[]) => void;
  gotoPage: (p: number) => void;
  openFiles: (files: File[]) => Promise<void>;
  toast: (msg: string, kind?: "ok" | "err" | "info") => void;
  fontCss: (fontId: string) => string;
  fontStyle: (fontId: string) => React.CSSProperties;
  setMainView: (v: React.ReactNode | null) => void;
  openDoc: (d: DocInfo) => void;
  panelLayout: { width: number; collapsed: boolean; setWidth: (w: number) => void; setCollapsed: (c: boolean) => void;
    sheetDown: boolean; setSheetDown: (d: boolean) => void };   // sheetDown: telefono, pannello abbassato (strumento ancora attivo)
  pickTool: (id: string) => void;
  addDownload: (e: Omit<DownloadEntry, "id" | "time">) => void;
  /** Modifiche dello strumento aperto non ancora applicate (null = nessuna). Lo usa usePending. */
  setPending: (p: Pending | null) => void;
  /** Finestre dell'app (mai window.alert/confirm/prompt): domanda con più scelte, restituisce il valore del pulsante premuto.
   *  L'ultimo pulsante è il predefinito (Invio), il primo risponde a Esc. */
  ask: (title: string, body: React.ReactNode, buttons: { label: string; value: string; kind?: "primary" | "danger" }[]) => Promise<string>;
  /** Domanda con un campo di testo: il testo scritto (senza spazi ai lati) oppure null se si annulla. */
  askText: (title: string, body: React.ReactNode, value: string, opts?: { ok?: string; suffix?: string; placeholder?: string }) => Promise<string | null>;
  /** Avviso con il solo pulsante OK. */
  notify: (title: string, body: React.ReactNode) => Promise<void>;
  /** Guida passo passo di uno strumento (guide.ts), anche se è già stata vista. */
  mostraGuida: (chiave: string) => void;
}

/** Modifiche fatte in uno strumento ma non ancora applicate al documento (pulsante "Applica").
 *  apply le applica e dice se ci è riuscito: false = errore o annullato, si resta dove si è. */
export interface Pending {
  label: string;
  apply: () => Promise<boolean>;
}

export const Ctx = createContext<AppCtx>(null as any);
export const useApp = () => useContext(Ctx);

/** Modifiche che stanno ancora nel pannello (per esempio il testo che si sta scrivendo): finché dirty è vero, cambiando
 *  strumento o scheda, salvando o chiudendo l'app, apply le porta sul foglio da sola (dalla 1.6.0 niente "Applica" e
 *  niente domanda). apply deve restituire true se è andato a buon fine. */
export function usePending(dirty: boolean, label: string, apply: () => Promise<boolean> | boolean): () => Promise<boolean> {
  const app = useApp();
  const applyRef = useRef(apply);
  applyRef.current = apply;
  const setPending = app.setPending;
  useEffect(() => {
    if (!dirty) return;
    setPending({ label, apply: async () => !!(await applyRef.current()) });
    return () => setPending(null);
  }, [dirty, label, setPending]);
  // per il pulsante dello strumento (es. "Fatto"): applica e toglie subito la modifica in sospeso. Altrimenti, chiudendo
  // lo strumento subito dopo, la si applicava una seconda volta sulla versione di prima (Organizza pagine: due volte
  // l'operazione, il messaggio doppio e Annulla da premere due volte)
  return useCallback(async () => {
    const ok = !!(await applyRef.current());
    if (ok) setPending(null);
    return ok;
  }, [setPending]);
}

/** Senza "Applica" (dalla 1.6.0): quando si lascia un oggetto (se ne seleziona un altro, nessuno, o si preme Esc) le sue
 *  modifiche vanno subito sul foglio. applica(id) decide se c'è qualcosa da scrivere. */
export function useApplicaLasciando(selectedId: string | null, applica: (id: string) => void) {
  const prima = useRef(selectedId);
  const fn = useRef(applica);
  fn.current = applica;
  useEffect(() => {
    const p = prima.current;
    prima.current = selectedId;
    if (p && p !== selectedId) fn.current(p);
  }, [selectedId]);
}
