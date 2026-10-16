import { createContext, useContext, useEffect, useRef } from "react";
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
  adoptVersion: (fromDocId: string, d: DocInfo) => void;
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
}

/** Modifiche fatte in uno strumento ma non ancora applicate al documento (pulsante "Applica").
 *  apply le applica e dice se ci è riuscito: false = errore o annullato, si resta dove si è. */
export interface Pending {
  label: string;
  apply: () => Promise<boolean>;
}

export const Ctx = createContext<AppCtx>(null as any);
export const useApp = () => useContext(Ctx);

/** Da chiamare nei pannelli con un pulsante "Applica": finché dirty è vero, cambiando strumento, scheda o
 *  chiudendo l'app compare la domanda "Applicare le modifiche?". apply deve restituire true se è andato a buon fine. */
export function usePending(dirty: boolean, label: string, apply: () => Promise<boolean> | boolean) {
  const app = useApp();
  const applyRef = useRef(apply);
  applyRef.current = apply;
  const setPending = app.setPending;
  useEffect(() => {
    if (!dirty) return;
    setPending({ label, apply: async () => !!(await applyRef.current()) });
    return () => setPending(null);
  }, [dirty, label, setPending]);
}
