import { TabsMenu } from "./components/TabsMenu";
import { OpenMenu, PhotoScan } from "./components/PhotoScan";
import { useIsMobile, useMedia } from "./panels/fields";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppWindow, ChevronUp, FolderOpen, Menu, Merge, Printer, Redo2, Save, Undo2, X, FilePlus2, Lock } from "lucide-react";
import { api, desktop, download, humanSize, isLocalEngine, onDesktopError, type Capabilities, type DocInfo, type FontInfo, type ToolResponse } from "./api";
import { loadPdf, pageSizes, type PDFDoc, type PageSize } from "./pdf";
import { Ctx, type AppCtx, type Pending, type Tab } from "./context";
import { ConfirmDialog, type DialogButton, type DialogRequest, type DialogResult } from "./components/ConfirmDialog";
import { NO_INTERACTION, type Interaction, type NoteInfo, type Overlay } from "./types";
import { TOOLS, TOOL_BY_ID } from "./tools";
import { Viewer } from "./components/Viewer";
import { Logo } from "./components/Logo";
import { ToolPanel } from "./panels/ToolPanel";
import { Downloads, type DownloadEntry } from "./components/Downloads";
import { Sidebar } from "./components/Sidebar";
import { SaveAsIcon } from "./components/SaveAsIcon";
import { isSignedContent, isSignedFile, sendToP7m } from "./panels/p7mInbox";
import { sendToCreatePdf } from "./panels/createInbox";
import { Popover } from "./components/Popover";
import { ThemeMenu, useTheme } from "./components/ThemeMenu";
import { Notifiche } from "./components/Notifiche";
import { useEvent, useStored } from "./hooks";
import { MIA_FINESTRA, ascolta, invia, type Messaggio } from "./finestre";
import { aggiungiMessaggio } from "./messaggi";

interface Toast { id: number; msg: string; kind: "ok" | "err" | "info" }

let tabSeq = 0;
// tipo dei dati trascinati quando si sposta una scheda (riordino, nuova finestra, altra finestra di PDFz)
const TAB_DRAG = "application/x-pdfz-tab";
const datiScheda = (t: Tab) => ({ history: t.history, index: t.index, savedIndex: t.savedIndex, savedPath: t.savedPath, password: t.password });
let dialogSeq = 0;
const loadedFonts = new Set<string>();
const isDirtyTab = (t: Tab) => t.index !== t.savedIndex && t.history.length > 1;

export default function App() {
  // contatore diagnostico dei render (utile per individuare cicli di aggiornamento)
  (window as any).__hdRenders = ((window as any).__hdRenders || 0) + 1; // diagnostica: numero di render
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [pdf, setPdf] = useState<PDFDoc | null>(null);
  const [sizes, setSizes] = useState<PageSize[]>([]);
  const [currentPage, setCurrentPage] = useState(0);
  const [goto, setGoto] = useState<{ page: number; n: number } | null>(null);
  const [tool, setTool] = useState<string | null>(null);
  const [interaction, setInteraction] = useState<Interaction>(NO_INTERACTION);
  const [overlays, setOverlays] = useState<Overlay[]>([]);
  const [notes, setNotes] = useState<NoteInfo[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [fonts, setFonts] = useState<FontInfo[]>([]);
  const [caps, setCaps] = useState<Capabilities | null>(null);
  const [filter, setFilter] = useState("");
  const [dragOver, setDragOver] = useState(false);
  // after: richiesta subito dopo "Aggiungi password" (anche il proprietario deve inserirla)
  const [pwPrompt, setPwPrompt] = useState<{ tabKey: string; doc: DocInfo; error?: string; after?: boolean } | null>(null);
  const askPassword = (d: DocInfo) => !!d.needs_password || (!!d.restricted && !d.unlocked);
  const [mainView, setMainView] = useState<React.ReactNode | null>(null);
  const [theme, setTheme] = useTheme();
  // disposizione: menu a sinistra (anche solo icone) e pannello a destra (larghezza regolabile, comprimibile)
  const [sideCompactPref, setSideCompact] = useStored("hdpdf.menuCompatto", false);
  // tablet in orizzontale non molto largo (es. 1024-1199 px): menu strumenti solo icone, più spazio al documento
  const tabletNarrow = useMedia("(pointer: coarse) and (orientation: landscape) and (min-width: 761px) and (max-width: 1199px)");
  const sideCompact = sideCompactPref || tabletNarrow;
  const [panelW, setPanelWRaw] = useStored("hdpdf.larghezzaPannello", 340);
  const [panelCollapsed, setPanelCollapsed] = useStored("hdpdf.pannelloCompresso", false);
  const setPanelW = useCallback((w: number) => setPanelWRaw(Math.round(Math.min(Math.max(w, 280), Math.max(320, window.innerWidth * 0.6)))), [setPanelWRaw]);
  const fileInput = useRef<HTMLInputElement>(null);
  const [downloads, setDownloads] = useState<DownloadEntry[]>([]);
  const [dlFlash, setDlFlash] = useState(0);
  const addDownload = (e: Omit<DownloadEntry, "id" | "time">) => {
    setDownloads((l) => [{ ...e, id: Date.now() + Math.random(), time: Date.now() }, ...l].slice(0, 30));
    setDlFlash((f) => f + 1);
  };

  const [, setDesktopReady] = useState(desktop.available());
  useEffect(() => {
    const on = () => setDesktopReady(true);
    window.addEventListener("pywebviewready", on);
    return () => window.removeEventListener("pywebviewready", on);
  }, []);
  const tab = tabs.find((t) => t.key === active) || null;
  const doc = tab ? tab.history[tab.index] : null;
  // le schede come sono adesso (per chi deve leggerle dopo un'attesa, es. la chiusura dell'app)
  const tabsRef = useRef(tabs);
  tabsRef.current = tabs;
  // attesa del prossimo aggiornamento della pagina (es. dopo "Applica" prima di salvare la nuova versione)
  const commitWaiters = useRef<(() => void)[]>([]);
  useEffect(() => { const w = commitWaiters.current; commitWaiters.current = []; w.forEach((f) => f()); });
  const nextCommit = () => new Promise<void>((r) => { commitWaiters.current.push(r); setTimeout(r, 400); });

  // finestre dell'app per avvisi e domande (al posto di window.alert/confirm/prompt). Sono in pila: una domanda
  // aperta mentre ce n'è già un'altra (es. "Oscurare?" dopo "Applicare le modifiche?") compare sopra, poi si torna alla prima.
  const [dialogs, setDialogs] = useState<(DialogRequest & { id: number; resolve: (r: DialogResult) => void })[]>([]);
  const openDialog = useCallback((req: DialogRequest) =>
    new Promise<DialogResult>((resolve) => setDialogs((l) => [...l, { ...req, id: ++dialogSeq, resolve }])), []);
  /** Domanda con più scelte: restituisce il valore del pulsante premuto. */
  const ask = useCallback(async (title: string, body: React.ReactNode, buttons: DialogButton[]) =>
    (await openDialog({ title, body, buttons })).value, [openDialog]);
  /** Domanda con un campo di testo: restituisce il testo scritto, oppure null se si annulla. */
  const askText = useCallback<AppCtx["askText"]>(async (title, body, value, opts = {}) => {
    const r = await openDialog({ title, body, input: { value, placeholder: opts.placeholder, suffix: opts.suffix },
      buttons: [{ label: "Annulla", value: "cancel" }, { label: opts.ok || "OK", value: "ok", kind: "primary" }] });
    return r.value === "ok" ? r.text.trim() : null;
  }, [openDialog]);
  /** Avviso con il solo pulsante OK. */
  const notify = useCallback(async (title: string, body: React.ReactNode) => {
    await openDialog({ title, body, buttons: [{ label: "OK", value: "ok", kind: "primary" }] });
  }, [openDialog]);
  // errori dell'app desktop (file aperto in un altro programma, cartella protetta, file bloccato per sicurezza…)
  useEffect(() => onDesktopError((title, msg) => { notify(title, msg); }), [notify]);

  // modifiche dello strumento aperto non ancora applicate (le registra il pannello con usePending)
  const pendingRef = useRef<Pending | null>(null);
  const [hasPending, setHasPending] = useState(false);
  const setPending = useCallback((p: Pending | null) => { pendingRef.current = p; setHasPending(!!p); }, []);
  /** Prima di lasciare lo strumento: se ci sono modifiche non applicate chiede se applicarle.
   *  true = si può proseguire (applicate o scartate), false = l'utente resta dov'è. */
  const resolvePending = useCallback(async (): Promise<boolean> => {
    const p = pendingRef.current;
    if (!p) return true;
    const c = await ask("Modifiche non applicate",
      <>Hai fatto delle modifiche in <b>{p.label}</b> ma non hai premuto "Applica". Vuoi applicarle al documento?</>,
      [{ label: "Annulla", value: "cancel" }, { label: "Non applicare", value: "discard", kind: "danger" }, { label: "Applica", value: "apply", kind: "primary" }]);
    if (c === "cancel") return false;
    if (c === "apply" && !(await p.apply())) return false;
    if (pendingRef.current === p) setPending(null);
    return true;
  }, [ask, setPending]);
  const guard = (go: () => void) => { resolvePending().then((ok) => { if (ok) go(); }); };

  useEffect(() => {
    api.fonts().then(setFonts).catch(() => {});
    api.caps().then(setCaps).catch(() => {});
  }, []);

  const toast = useCallback((msg: string, kind: Toast["kind"] = "info") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t.slice(-3), { id, msg, kind }]);
    aggiungiMessaggio(msg, kind);   // si rilegge dalla campanella anche dopo che è sparito
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === "err" ? 10000 : 6000);
  }, []);

  // carica il PDF della versione corrente
  useEffect(() => {
    let cancel = false;
    if (!doc || doc.needs_password) { setPdf(null); setSizes([]); return; }
    (async () => {
      try {
        const p = await loadPdf(api.fileUrl(doc.id), tab?.password);
        const s = await pageSizes(p);
        if (cancel) return;
        setPdf(p);
        setSizes(s);
        setCurrentPage((c) => Math.min(c, s.length - 1));
      } catch (e: any) {
        if (!cancel) toast(`Impossibile visualizzare il documento: ${e.message || e}`, "err");
      }
    })();
    return () => { cancel = true; };
  }, [doc?.id, tab?.password]); // eslint-disable-line react-hooks/exhaustive-deps
  // note del documento: sulla pagina c'è l'icona, al clic si apre il testo
  useEffect(() => {
    let alive = true;
    setNotes([]);
    if (!doc || doc.needs_password) return;
    api.tool("list_comments", { doc: doc.id })
      .then((r: any) => {
        if (!alive) return;
        setNotes((r.data?.comments || []).filter((c: any) => c.type === "Text" && !c.irt)
          .map((c: any) => ({ nm: c.nm, xref: c.xref, page: c.page, rect: c.rect, content: c.content, author: c.author, date: c.date, color: c.color })));
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [doc?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const addTab = (d: DocInfo, savedPath?: string) => {
    const key = `t${++tabSeq}`;
    setTabs((ts) => [...ts, { key, history: [d], index: 0, savedIndex: savedPath ? 0 : -1, savedPath }]);
    setActive(key);
    setCurrentPage(0);
    // la password si chiede sempre, anche al proprietario e anche per i PDF con sole restrizioni
    if (askPassword(d)) setPwPrompt({ tabKey: key, doc: d });
    return key;
  };

  const openFiles = useCallback(async (files: File[]) => {
    if (!files.length) return;
    if (!(await resolvePending())) return;
    // i file firmati (.p7m/.p7s) vanno al pannello di verifica, gli altri si aprono come documenti
    // i file firmati si riconoscono anche dal contenuto (su Android possono arrivare senza estensione)
    const kinds = await Promise.all(files.map(isSignedContent));
    let signed = files.filter((_, i) => kinds[i]);
    files = files.filter((_, i) => !kinds[i]);
    signed = signed.map((f) => (isSignedFile(f.name) ? f : new File([f], `${f.name.replace(/\.pdf$/i, "") || "documento"}.p7m`, { type: f.type })));
    if (signed.length) {
      try {
        const a = await api.asset(signed[0]);
        sendToP7m({ asset: a.id, name: signed[0].name });
        setTool("p7m"); setInteraction(NO_INTERACTION); setOverlays([]);
      } catch (e: any) {
        toast(e.message, "err");
      }
      if (signed.length > 1) toast("I file firmati si verificano uno alla volta: aperto il primo.", "info");
    }
    if (!files.length) return;
    setBusy("Apertura…");
    try {
      const docs = await api.open(files);
      docs.forEach((d) => addTab(d));
      // un PDF aperto mentre si guarda un file firmato: si chiude il rapporto p7m e si mostra il PDF
      setTool((t) => { if (t === "p7m") { setMainView(null); return null; } return t; });
    } catch (e: any) {
      toast(e.message, "err");
    } finally {
      setBusy(null);
    }
  }, [toast, resolvePending]);

  // menu del tasto destro di Windows (voce "PDFz" in Esplora risorse)
  const runAction = async ({ action, paths }: { action: string; paths: string[] }) => {
    if (!paths?.length) return;
    if (!(await resolvePending())) return;
    if (action === "crea-pdf") {
      setBusy("Preparazione dei file…");
      try {
        // in ordine di nome, come in Esplora risorse (2 prima di 10)
        const sorted = [...paths].sort((a, b) => a.localeCompare(b, "it", { numeric: true, sensitivity: "base" }));
        const assets = await api.assetsFromPaths(sorted);
        setTool("create_pdf"); setInteraction(NO_INTERACTION); setOverlays([]); setMainView(null);
        sendToCreatePdf(assets.map((a) => ({ id: a.id, name: a.name, size: a.size })));
      } catch (e: any) { toast(e.message, "err"); } finally { setBusy(null); }
      return;
    }
    const p7 = { "p7m-estrai": "estrai", "p7m-marca": "marca", "p7m-cifra": "cifra", "p7m-verifica": undefined } as const;
    if (action in p7) {
      const name = paths[0].split(/[\\/]/).pop() || paths[0];
      sendToP7m({ path: paths[0], name, paths, action: p7[action as keyof typeof p7] });
      setTool("p7m"); setInteraction(NO_INTERACTION); setOverlays([]);
      return;
    }
    openPaths(paths);
  };

  const openPaths = async (paths: string[]) => {
    if (!(await resolvePending())) return;
    setBusy("Apertura…");
    try {
      for (const p of paths) {
        if (isSignedFile(p)) {
          sendToP7m({ path: p, name: p.split(/[\\/]/).pop() || p });
          setTool("p7m"); setInteraction(NO_INTERACTION); setOverlays([]); setInteraction(NO_INTERACTION); setOverlays([]);
          continue;
        }
        const d = await api.openPath(p);
        addTab(d, p.toLowerCase().endsWith(".pdf") ? p : undefined);
      }
    } catch (e: any) {
      toast(e.message, "err");
    } finally {
      setBusy(null);
    }
  };

  // file passati all'avvio dall'app desktop ("Apri con…") e controllo modifiche all'uscita
  useEffect(() => {
    const w = window as any;
    w.hdpdfHasUnsaved = () => tabs.some(isDirtyTab) || !!pendingRef.current;
    w.hdpdfRequestClose = () => { requestClose(); return true; };
    w.hdpdfOpenPaths = (paths: string[]) => openPaths(paths);
    w.hdpdfAction = (r: { action: string; paths: string[] }) => runAction(r);
    w.hdpdfOpenFiles = (files: File[]) => openFiles(files);   // app Android: "Apri con"
    if (w.__hdpdfPendingFiles?.length) { openFiles(w.__hdpdfPendingFiles); w.__hdpdfPendingFiles = []; }
    if (w.__hdpdfPending?.length) { openPaths(w.__hdpdfPending); w.__hdpdfPending = []; }
    if (w.__hdpdfPendingActions?.length) { const a = w.__hdpdfPendingActions; w.__hdpdfPendingActions = []; a.forEach(runAction); }
  }); // eslint-disable-line react-hooks/exhaustive-deps

  // l'app desktop chiede conferma alla chiusura solo se ci sono modifiche non salvate o non applicate:
  // lo stato le viene comunicato qui; alla chiusura l'app ferma la finestra e chiama window.hdpdfRequestClose
  const unsaved = tabs.some(isDirtyTab) || hasPending;
  useEffect(() => {
    const send = () => { try { (window as any).pywebview?.api?.set_unsaved?.(unsaved); } catch { /* browser */ } };
    send();
    window.addEventListener("pywebviewready", send);
    return () => window.removeEventListener("pywebviewready", send);
  }, [unsaved]);
  // versione nel browser (Linux): avviso se si chiude con modifiche non salvate e "battito" verso il motore,
  // che così sa che la finestra è aperta (e si spegne quando la chiudi) e passa i file da aprire
  useEffect(() => {
    if (!unsaved || (window as any).pywebview) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [unsaved]);
  useEffect(() => {
    const beat = async () => {
      if ((window as any).pywebview) return;
      try {
        const r = await api.heartbeat();
        if (r.open?.length) (window as any).hdpdfOpenPaths?.(r.open);
        r.actions?.forEach((a) => (window as any).hdpdfAction?.(a));
      } catch { /* motore non raggiungibile */ }
    };
    beat();
    const t = window.setInterval(beat, 5000);
    return () => window.clearInterval(t);
  }, []);

  const pushVersion = (d: DocInfo) => {
    setTabs((ts) => ts.map((t) => t.key === active
      ? { ...t, history: [...t.history.slice(0, t.index + 1), d], index: t.index + 1 }
      : t));
  };

  const run: AppCtx["run"] = async (name, params = {}, opts = {}) => {
    if (!doc && !opts.docs && !opts.noDoc) return null;
    const def = TOOL_BY_ID[name];
    setBusy(def ? `${def.label}…` : "Elaborazione…");
    try {
      // app Android: "Rimuovi password" su un file già sbloccato non richiede di riscrivere la password
      if (name === "remove_password" && isLocalEngine() && !params.password && tab?.password) params = { ...params, password: tab.password };
      const body: any = { params };
      if (opts.docs) body.docs = opts.docs;
      else if (!opts.noDoc && doc) body.doc = doc.id;
      const res: ToolResponse = await api.tool(name, body);
      if (res.doc) {
        const d = res.doc;
        // dopo "Aggiungi password" il documento resta bloccato: la password si chiede subito, anche a chi l'ha appena messa
        const pw = name === "add_password" ? params.user_password || params.owner_password : "";
        if (opts.newTab || opts.docs || opts.noDoc) addTab(d);
        else pushVersion(d);
        if (pw) setTabs((ts) => ts.map((t) => t.key === active ? { ...t, password: undefined, protect: isLocalEngine() ? params : t.protect } : t));
        if (pw && !opts.silent && active && askPassword(d)) setPwPrompt({ tabKey: active, doc: d, after: true });
        if (name === "remove_password") setTabs((ts) => ts.map((t) => t.key === active ? { ...t, protect: undefined } : t));
        if (pw && isLocalEngine() && !opts.silent) {
          toast("Password impostata. Premi Salva: il PDF salvato chiederà la password ogni volta che lo apri.", "ok");
          res.message = null;
        }
      }
      if (res.output) {
        addDownload({ itemId: res.output.id, name: res.output.name, size: res.output.size, status: "ready" });
        // Android: il file si salva in Documenti e si apre subito il menu per aprirlo o condividerlo
        if (isLocalEngine()) download(res.output.id, res.output.name).catch(() => {});
      }
      if (res.message && !opts.silent) toast(res.message, "ok");
      return res;
    } catch (e: any) {
      toast(e.message || String(e), "err");
      return null;
    } finally {
      setBusy(null);
    }
  };

  const undo = () => tab && tab.index > 0 && guard(() => setTabs((ts) => ts.map((t) => t.key === active ? { ...t, index: t.index - 1 } : t)));
  const redo = () => tab && tab.index < tab.history.length - 1 && guard(() => setTabs((ts) => ts.map((t) => t.key === active ? { ...t, index: t.index + 1 } : t)));

  // app Android: "Salva" scrive in Documenti/PDFz con lo stesso nome (sostituisce), senza aprire "Condividi";
  // "Salva con nome" chiede il nome. savedPath qui contiene il nome scelto.
  const saveAndroid = async (askName: boolean) => {
    if (!doc || !tab) return;
    let name = tab.savedPath || doc.name;
    if (askName) {
      const typed = await askText("Salva con nome", "Scegli il nome del file: viene salvato in Documenti/PDFz.",
        name.replace(/\.pdf$/i, ""), { suffix: ".pdf", ok: "Salva", placeholder: "Nome del file" });
      if (!typed) return;
      name = typed.replace(/[\\/:*?"<>|]+/g, "-").replace(/\.pdf$/i, "") + ".pdf";
    }
    let id = doc.id;
    // una modifica fatta dopo "Aggiungi password" produce un PDF senza password: la protezione si rimette qui
    if (tab.protect && !doc.encrypted) {
      const r = await run("add_password", tab.protect, { silent: true });
      if (!r?.doc) return;
      id = r.doc.id;
    }
    setBusy("Salvataggio…");
    try {
      const { saveFile } = await import("./android/files");
      const path = await saveFile(api.fileUrl(id, true), name, false);
      if (path) {
        setTabs((ts) => ts.map((t) => t.key === active ? { ...t, savedIndex: t.index, savedPath: name } : t));
        toast(`Salvato: ${path}${tab.protect ? " (protetto da password)" : ""}`, "ok");
      }
    } catch (e: any) {
      toast(`Salvataggio non riuscito: ${e?.message || e}`, "err");
    } finally {
      setBusy(null);
    }
  };
  /** Salva una scheda (anche non attiva) su desktop o nel browser: con il percorso noto lo sovrascrive,
   *  altrimenti chiede dove salvare. false = annullato o non riuscito. */
  const saveTab = async (t: Tab): Promise<boolean> => {
    const d = t.history[t.index];
    let path: string | undefined = t.savedPath;
    if (desktop.available() && t.savedPath) {
      if (!(await desktop.save(d.id, t.savedPath))) return false;
    } else {
      const p = await download(d.id, d.name);
      if (!p) return false;
      if (typeof p === "string" && desktop.available()) path = p;
    }
    setTabs((ts) => ts.map((x) => x.key === t.key ? { ...x, savedIndex: x.index, savedPath: path } : x));
    const shown = desktop.available() && path ? path.split(/[\\/]/).pop()! : d.name;
    addDownload({ itemId: d.id, name: shown, size: d.size, status: "saved", path: desktop.available() ? path || null : null });
    return true;
  };
  const saveAs = async () => {
    if (!doc) return;
    if (isLocalEngine()) return saveAndroid(true);
    const path = await download(doc.id, doc.name);
    if (path) {
      setTabs((ts) => ts.map((t) => t.key === active ? { ...t, savedIndex: t.index, savedPath: typeof path === "string" && desktop.available() ? path : t.savedPath } : t));
      const shown = desktop.available() ? String(path).split(/[\\/]/).pop()! : doc.name;
      addDownload({ itemId: doc.id, name: shown, size: doc.size, status: "saved", path: desktop.available() ? String(path) : null });
    }
  };
  const save = async () => {
    if (!doc || !tab) return;
    if (isLocalEngine()) return saveAndroid(false);
    if (desktop.available() && tab.savedPath) {
      const ok = await desktop.save(doc.id, tab.savedPath);
      if (ok) {
        setTabs((ts) => ts.map((t) => t.key === active ? { ...t, savedIndex: t.index } : t));
        addDownload({ itemId: doc.id, name: tab.savedPath.split(/[\\/]/).pop()!, size: doc.size, status: "saved", path: tab.savedPath });
      }
    } else saveAs();
  };
  const closeTab = async (key: string) => {
    if (key === active && !(await resolvePending())) return;
    const t = tabsRef.current.find((x) => x.key === key);
    if (t && isDirtyTab(t)) {
      // app Android: si può salvare solo la scheda aperta (Salva usa il documento attivo)
      const canSave = !isLocalEngine() || key === active;
      const c = await ask("Modifiche non salvate", <>"<b>{t.history[t.index].name}</b>" contiene modifiche non salvate. Vuoi salvarle prima di chiudere?</>,
        [{ label: "Annulla", value: "cancel" }, { label: "Non salvare", value: "discard", kind: "danger" },
         ...(canSave ? [{ label: "Salva", value: "save", kind: "primary" as const }] : [])]);
      if (c === "cancel") return;
      if (c === "save") {
        if (isLocalEngine()) {
          await saveAndroid(false);
          await nextCommit();
          const now = tabsRef.current.find((x) => x.key === key);
          if (now && isDirtyTab(now)) return;   // salvataggio non riuscito
        } else if (!(await saveTab(t))) return;
      }
    }
    dropTab(key);
  };
  const dropTab = (key: string) => setTabs((ts) => {
    const rest = ts.filter((x) => x.key !== key);
    setActive((a) => (a === key ? (rest.length ? rest[rest.length - 1].key : null) : a));
    return rest;
  });

  // Scheda spostata in una nuova finestra (trascinata fuori dalla finestra o dal menu del tasto destro), con almeno
  // 2 schede aperte, oppure in un'altra finestra di PDFz già aperta (trascinata lì: vedi finestre.ts).
  // Il documento passa così com'è: modifiche non salvate, Annulla/Ripeti, percorso e password.
  // I dati vanno al motore, che dà un biglietto da usare una volta sola; la finestra di arrivo lo ritira.
  // Nell'app Android c'è una sola finestra.
  const [altre, setAltre] = useState<string[]>([]);   // altre finestre di PDFz aperte
  const canDetach = !isLocalEngine() && tabs.length >= 2;
  const canDrag = !isLocalEngine() && (tabs.length >= 2 || altre.length > 0);
  const moveToNewWindow = async (key: string, at?: { x: number; y: number }, gia?: string) => {
    if (key === active && !gia) {
      const hadPending = !!pendingRef.current;
      if (!(await resolvePending())) return;
      if (hadPending) await nextCommit();   // la versione appena applicata deve essere nella scheda che si sposta
    }
    const t = tabsRef.current.find((x) => x.key === key);
    if (!t) return;
    try {
      const biglietto = gia || await api.depositaScheda(datiScheda(t));
      const opened = desktop.available() ? await desktop.newWindow(`scheda=${biglietto}`) : openBrowserWindow(biglietto, at);
      if (!opened) {
        if (!desktop.available()) notify("Nuova finestra bloccata", "Il browser non ha aperto la nuova finestra: consenti le finestre a comparsa per PDFz e riprova.");
        return;   // la scheda resta qui
      }
    } catch (e: any) {
      toast(e.message, "err");
      return;
    }
    dropTab(key);
  };
  // riordino trascinando una scheda sopra un'altra
  const moveTabTo = (from: string, to: string) => setTabs((ts) => {
    const i = ts.findIndex((x) => x.key === from), j = ts.findIndex((x) => x.key === to);
    if (i < 0 || j < 0 || i === j) return ts;
    const r = [...ts];
    r.splice(j, 0, r.splice(i, 1)[0]);
    return r;
  });
  const dragTab = useRef<string | null>(null);
  const [tabMenu, setTabMenu] = useState<string | null>(null);
  const tabMenuAnchor = useRef<HTMLElement | null>(null);

  /** Ritira dal motore una scheda arrivata da un'altra finestra e la apre qui. */
  const prendiScheda = async (biglietto: string) => {
    try {
      const s = await api.ritiraScheda(biglietto);
      if (!Array.isArray(s.history) || !s.history[s.index]) throw new Error("La scheda spostata non è valida.");
      const key = `t${++tabSeq}`;
      setTabs((ts) => [...ts, { key, history: s.history, index: s.index, savedIndex: s.savedIndex, savedPath: s.savedPath, password: s.password }]);
      setActive(key);
      setCurrentPage(0);
    } catch (e: any) {
      toast(e.message, "err");
    }
  };

  // finestra aperta da una scheda spostata: ritira la scheda (una sola volta) e toglie il biglietto dall'indirizzo
  useEffect(() => {
    const q = new URLSearchParams(location.search);
    const biglietto = q.get("scheda");
    if (!biglietto) return;
    q.delete("scheda");
    const rest = q.toString();
    window.history.replaceState(null, "", `${location.pathname}${rest ? `?${rest}` : ""}${location.hash}`);
    prendiScheda(biglietto);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- schede fra finestre già aperte (finestre.ts)
  // trascino: scheda che sta uscendo da questa finestra; inArrivo: scheda che un'altra finestra sta trascinando
  // (finito: l'altra finestra ha già visto la fine del trascinamento, ma il rilascio qui può arrivare dopo);
  // cedute: biglietto → scheda di questa finestra consegnata a un'altra (si toglie quando l'altra la prende)
  const trascino = useRef<{ key: string; biglietto?: string; presa: boolean } | null>(null);
  const inArrivo = useRef<{ biglietto: string; finito: boolean } | null>(null);
  const cedute = useRef(new Map<string, string>());
  const [dropScheda, setDropScheda] = useState(false);
  const chiudiFinestra = () => {
    if (desktop.available()) window.pywebview!.api.quit();
    else window.close();   // nel browser si chiudono solo le finestre aperte dall'app
  };
  /** Un'altra finestra ha preso una scheda di questa: la scheda si toglie; senza più schede la finestra si chiude.
   *  La chiusura non aspetta la fine del trascinamento: con il mouse la scheda sparisce dalla pagina mentre la si
   *  trascina ancora, e l'evento di fine può non arrivare più. */
  const schedaCeduta = (biglietto: string) => {
    if (trascino.current?.biglietto === biglietto) trascino.current.presa = true;
    const key = cedute.current.get(biglietto);
    if (!key) return;
    cedute.current.delete(biglietto);
    dropTab(key);
    setTimeout(() => { if (!tabsRef.current.length && !pendingRef.current) chiudiFinestra(); }, 600);
  };
  /** "Riunisci": tutte le schede di questa finestra vanno nella finestra «verso». */
  const cediTutte = async (verso: string) => {
    const hadPending = !!pendingRef.current;
    if (!(await resolvePending())) return;   // l'utente ha scelto di restare: questa finestra resta com'è
    if (hadPending) await nextCommit();
    const biglietti: string[] = [];
    for (const t of tabsRef.current) {
      try {
        const b = await api.depositaScheda(datiScheda(t));
        cedute.current.set(b, t.key);
        biglietti.push(b);
      } catch (e: any) { toast(e.message, "err"); }
    }
    if (biglietti.length) invia({ tipo: "consegna", da: MIA_FINESTRA, verso, biglietti });
    else if (!tabsRef.current.length) chiudiFinestra();
  };
  /** Scheda di un'altra finestra lasciata qui: si avvisa subito l'altra finestra (che la toglie) e si ritira. */
  const arrivaScheda = async () => {
    for (let i = 0; i < 30 && !inArrivo.current; i++) await new Promise((r) => setTimeout(r, 50));   // biglietto in viaggio
    const b = inArrivo.current?.biglietto;
    inArrivo.current = null;
    if (!b) { toast("La scheda non è arrivata: riprova a trascinarla.", "err"); return; }
    invia({ tipo: "presa", da: MIA_FINESTRA, biglietto: b });
    await prendiScheda(b);
  };
  const onMessaggio = useEvent(async (m: Messaggio) => {
    if (m.tipo === "ciao" || m.tipo === "ci-sono") {
      if (m.tipo === "ciao") invia({ tipo: "ci-sono", da: MIA_FINESTRA });
      setAltre((a) => (a.includes(m.da) ? a : [...a, m.da]));
    } else if (m.tipo === "addio") setAltre((a) => a.filter((x) => x !== m.da));
    else if (m.tipo === "trascina") inArrivo.current = { biglietto: m.biglietto, finito: false };
    else if (m.tipo === "fine-trascina") {
      if (inArrivo.current?.biglietto === m.biglietto) inArrivo.current.finito = true;
      setDropScheda(false);
    }
    else if (m.tipo === "presa") schedaCeduta(m.biglietto);
    else if (m.tipo === "riunisci") cediTutte(m.da);
    else if (m.tipo === "consegna" && m.verso === MIA_FINESTRA) {
      for (const b of m.biglietti) {
        invia({ tipo: "presa", da: MIA_FINESTRA, biglietto: b });
        await prendiScheda(b);
      }
    }
  });
  useEffect(() => {
    if (isLocalEngine()) return;
    const stop = ascolta(onMessaggio);
    invia({ tipo: "ciao", da: MIA_FINESTRA });
    const addio = () => invia({ tipo: "addio", da: MIA_FINESTRA });
    window.addEventListener("pagehide", addio);
    return () => { stop(); window.removeEventListener("pagehide", addio); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // chiusura dell'app desktop (X della finestra): l'app ferma la chiusura e chiede qui cosa fare delle modifiche
  const closingRef = useRef(false);
  const requestClose = async () => {
    if (closingRef.current) return;
    closingRef.current = true;
    const quit = () => { try { (window as any).pywebview?.api?.quit?.(); } catch { /* browser */ } };
    try {
      const p = pendingRef.current;
      if (p) {
        const c = await ask("Modifiche non applicate",
          <>Hai fatto delle modifiche in <b>{p.label}</b> ma non hai premuto "Applica". Vuoi applicarle e salvare prima di uscire?</>,
          [{ label: "Annulla", value: "cancel" }, { label: "Esci senza salvare", value: "discard", kind: "danger" }, { label: "Applica e salva", value: "save", kind: "primary" }]);
        if (c === "cancel") return;
        if (c === "discard") return quit();
        if (!(await p.apply())) return;
        if (pendingRef.current === p) setPending(null);
        await nextCommit();   // la nuova versione del documento deve essere nelle schede prima di salvarla
      } else {
        const names = tabsRef.current.filter(isDirtyTab).map((t) => t.history[t.index].name);
        if (!names.length) return quit();
        const c = await ask("Modifiche non salvate",
          <>{names.length === 1
            ? <>"<b>{names[0]}</b>" contiene modifiche non salvate.</>
            : <>Ci sono {names.length} documenti con modifiche non salvate: {names.map((n, i) => <span key={i}>{i ? ", " : ""}"<b>{n}</b>"</span>)}.</>} Vuoi salvare prima di uscire?</>,
          [{ label: "Annulla", value: "cancel" }, { label: "Esci senza salvare", value: "discard", kind: "danger" }, { label: "Salva", value: "save", kind: "primary" }]);
        if (c === "cancel") return;
        if (c === "discard") return quit();
      }
      for (const t of tabsRef.current.filter(isDirtyTab)) {
        setActive(t.key);
        if (!(await saveTab(t))) return;   // salvataggio annullato: l'app resta aperta
      }
      quit();
    } finally {
      closingRef.current = false;
    }
  };

  const onOpenClick = async () => {
    if (desktop.available()) {
      const paths = await desktop.openDialog();
      if (paths.length) openPaths(paths);
    } else fileInput.current?.click();
  };

  // scorciatoie da tastiera
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const k = e.key.toLowerCase();
      if (k === "o") { e.preventDefault(); onOpenClick(); }
      else if (k === "p" && doc) { e.preventDefault(); printDoc(doc.id); }
      else if (k === "s" && e.shiftKey) { e.preventDefault(); saveAs(); }
      else if (k === "s") { e.preventDefault(); save(); }
      else if (k === "z" && !e.shiftKey && !(e.target as HTMLElement).closest("input,textarea")) { e.preventDefault(); undo(); }
      else if ((k === "y" || (k === "z" && e.shiftKey)) && !(e.target as HTMLElement).closest("input,textarea")) { e.preventDefault(); redo(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // telefono: il menu degli strumenti è un cassetto che si apre dal pulsante ☰
  const [drawer, setDrawer] = useState(false);
  const mobile = useIsMobile();
  // tasto "indietro" di Android: chiude il menu, poi il pannello dello strumento
  useEffect(() => {
    const onBack = (e: Event) => {
      if (drawer) { setDrawer(false); e.preventDefault(); }
      else if (tool) { pickTool(null); e.preventDefault(); }
    };
    window.addEventListener("hdpdf-back", onBack);
    return () => window.removeEventListener("hdpdf-back", onBack);
  });

  // telefono: il pannello si può abbassare (freccia giù) e riaprire (freccia su); si ricorda l'ultimo strumento
  const [sheetDown, setSheetDown] = useState(false);
  const [lastTool, setLastTool] = useState<string | null>(null);

  // cambio strumento: prima le modifiche non applicate, poi azzera interazioni
  const pickTool = (id: string | null) => {
    if (mobile && sheetDown && id && id === tool) return pickToolNow(id);   // strumento abbassato: si riapre com'era
    guard(() => pickToolNow(id));
  };
  const pickToolNow = (id: string | null) => {
    setDrawer(false);
    setSheetDown(false);
    if (id) setLastTool(id);
    if (mobile && sheetDown && id && id === tool) return;   // strumento abbassato: si riapre com'era
    setTool((cur) => (cur === id ? null : id));
    setInteraction(NO_INTERACTION);
    setOverlays([]);
    setMainView(null);
  };

  const fontCss = useCallback((fontId: string) => {
    const f = fonts.find((x) => x.id === fontId);
    if (!f) return "Helvetica, Arial, sans-serif";
    if (f.source === "base14") {
      return f.family === "Times" ? '"Times New Roman", Times, serif' : f.family === "Courier" ? '"Courier New", Courier, monospace' : "Helvetica, Arial, sans-serif";
    }
    const fam = `hdf-${f.id}`;
    if (!loadedFonts.has(f.id)) {
      loadedFonts.add(f.id);
      const src = isLocalEngine()   // app Android: il carattere arriva dal motore interno
        ? fetch(api.fontFileUrl(f.id)).then((r) => r.arrayBuffer())
        : Promise.resolve(`url(${api.fontFileUrl(f.id)})`);
      src.then((data) => new FontFace(fam, data).load()).then((x) => (document as any).fonts.add(x)).catch(() => {});
    }
    return `"${fam}", sans-serif`;
  }, [fonts]);

  const fontStyle = useCallback((fontId: string): React.CSSProperties => {
    const f = fonts.find((x) => x.id === fontId);
    return { fontFamily: fontCss(fontId), fontWeight: f?.bold ? 700 : 400, fontStyle: f?.italic ? "italic" : "normal" };
  }, [fonts, fontCss]);

  const onSearch = async (q: string) => {
    if (!doc) return [];
    try {
      const res = await api.tool("redact_find", { doc: doc.id, params: { terms: q } });
      const m = res.data?.matches || [];
      if (!m.length) toast("Nessun risultato.", "info");
      return m;
    } catch (e: any) {
      toast(e.message, "err");
      return [];
    }
  };

  const ctx: AppCtx = {
    doc, pdf, sizes, currentPage, tabs, fonts, caps, run, setInteraction, setOverlays,
    gotoPage: (p) => setGoto({ page: p, n: Date.now() }), openFiles, toast, fontCss, fontStyle, setMainView,
    openDoc: (d) => addTab(d), addDownload, pickTool: (id) => pickTool(id), setPending, ask, askText, notify,
    panelLayout: { width: panelW, collapsed: panelCollapsed, setWidth: setPanelW, setCollapsed: setPanelCollapsed, sheetDown, setSheetDown },
  };

  const q = filter.trim().toLowerCase();
  // strumenti solo per l'app Android (es. Scatta foto)
  const available = (t: (typeof TOOLS)[number]) => !t.androidOnly || isLocalEngine();
  const visibleTools = useMemo(() => TOOLS.filter((t) => available(t) && (!q || `${t.label} ${t.description} ${t.keywords || ""}`.toLowerCase().includes(q))), [q]); // eslint-disable-line react-hooks/exhaustive-deps
  const toolDef = tool ? TOOL_BY_ID[tool] : null;
  const noDocTools = new Set(["create_pdf", "merge", "compare", "p7m"]);
  const dirty = tab ? isDirtyTab(tab) : false;
  const pickTab = (k: string) => { if (k !== active) guard(() => { setActive(k); setCurrentPage(0); }); };

  // una scheda trascinata da un'altra finestra di PDFz (non da questa: quella si riordina sulle schede). Al rilascio
  // vale anche se l'altra finestra ha già finito il trascinamento: i due avvisi possono arrivare in qualsiasi ordine
  const schedaDaFuori = (e: React.DragEvent, rilascio = false) => !dragTab.current &&
    ((!!inArrivo.current && (rilascio || !inArrivo.current.finito)) || e.dataTransfer.types.includes(TAB_DRAG));
  const onDragOverApp = (e: React.DragEvent) => {
    if (e.dataTransfer.types.includes("Files")) { e.preventDefault(); setDragOver(true); return; }
    if (!schedaDaFuori(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDropScheda(true);
  };
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    setDropScheda(false);
    if (schedaDaFuori(e, true)) { arrivaScheda(); return; }
    const files = Array.from(e.dataTransfer.files || []);
    if (files.length) openFiles(files);
  };

  return (
    <Ctx.Provider value={ctx}>
      <div className="app" onDragOver={onDragOverApp} onDragLeave={() => { setDragOver(false); setDropScheda(false); }} onDrop={onDrop}>
        {dropScheda && <div className="drop-scheda" aria-hidden>Rilascia qui per spostare la scheda in questa finestra</div>}
        <header className="topbar">
          <button className="btn icon ghost mobile-only" onClick={() => setDrawer(true)} title="Strumenti" aria-label="Apri il menu degli strumenti"><Menu size={20} /></button>
          <Logo />
          <OpenMenu onPickFile={onOpenClick} />
          <button className="btn icon ghost" onClick={save} disabled={!doc} title="Salva (Ctrl+S)"><Save size={17} /></button>
          <button className={`btn icon ghost ${isLocalEngine() ? "" : "desktop-only"}`} onClick={saveAs} disabled={!doc} title="Salva con nome (Ctrl+Shift+S)" aria-label="Salva con nome"><SaveAsIcon size={17} /></button>
          <button className="btn icon ghost desktop-only" onClick={() => doc && printDoc(doc.id)} disabled={!doc} title="Stampa (Ctrl+P)"><Printer size={17} /></button>
          <div className="sep" />
          <button className="btn icon ghost" onClick={undo} disabled={!tab || tab.index === 0} title="Annulla (Ctrl+Z)"><Undo2 size={17} /></button>
          <button className="btn icon ghost" onClick={redo} disabled={!tab || tab.index >= tab.history.length - 1} title="Ripeti (Ctrl+Y)"><Redo2 size={17} /></button>
          <div className="sep" />
          {mobile ? (
            <TabsMenu active={active} onPick={pickTab} onClose={closeTab}
              tabs={tabs.map((t) => ({ key: t.key, name: t.history[t.index].name, dirty: isDirtyTab(t),
                locked: isLocalEngine() && (!!t.protect || t.history[t.index].encrypted) }))} />
          ) : <div className="tabs">
            {tabs.map((t) => {
              const d = t.history[t.index];
              const isDirty = isDirtyTab(t);
              return (
                <div key={t.key} className={`tab ${t.key === active ? "active" : ""}`} onClick={() => pickTab(t.key)}
                  title={[d.name, canDetach && "Trascinala fuori dalla finestra per aprirla in una nuova finestra",
                    altre.length > 0 && "Trascinala su un'altra finestra di PDFz per spostarla lì"].filter(Boolean).join("\n")}
                  draggable={canDrag}
                  onDragStart={(e) => {
                    // con modifiche non applicate nello strumento la scheda attiva non si sposta (la domanda non si può fare qui)
                    if (t.key === active && pendingRef.current) {
                      e.preventDefault();
                      toast(`Prima applica o scarta le modifiche in "${pendingRef.current.label}".`, "info");
                      return;
                    }
                    dragTab.current = t.key;
                    e.dataTransfer.setData(TAB_DRAG, MIA_FINESTRA);
                    e.dataTransfer.effectAllowed = "move";
                    const tr = { key: t.key, biglietto: undefined as string | undefined, presa: false };
                    trascino.current = tr;
                    // altre finestre aperte: la scheda va al motore subito, così può arrivare dove la si lascia
                    if (altre.length) api.depositaScheda(datiScheda(t)).then((b) => {
                      if (trascino.current !== tr) { api.buttaScheda(b); return; }   // trascinamento già finito
                      tr.biglietto = b;
                      cedute.current.set(b, t.key);
                      invia({ tipo: "trascina", da: MIA_FINESTRA, biglietto: b });
                    }).catch(() => {});
                  }}
                  onDragOver={(e) => { if (dragTab.current && dragTab.current !== t.key) { e.preventDefault(); e.dataTransfer.dropEffect = "move"; } }}
                  onDrop={(e) => { if (!dragTab.current) return; e.preventDefault(); e.stopPropagation(); moveTabTo(dragTab.current, t.key); }}
                  onDragEnd={(e) => {
                    const tr = trascino.current;
                    trascino.current = null;
                    dragTab.current = null;
                    if (!tr) return;
                    if (tr.biglietto) invia({ tipo: "fine-trascina", da: MIA_FINESTRA, biglietto: tr.biglietto });
                    const nessuno = e.dataTransfer.dropEffect === "none";
                    const out = e.clientX <= 0 || e.clientY <= 0 || e.clientX >= window.innerWidth || e.clientY >= window.innerHeight;
                    const at = { x: e.screenX, y: e.screenY };
                    // un'altra finestra di PDFz può averla presa: la risposta arriva dopo il rilascio
                    const b = tr.biglietto;
                    setTimeout(() => {
                      if (tr.presa) return;
                      // lasciata fuori dalla finestra (nessuno l'ha presa): nuova finestra
                      if (nessuno && out && tabsRef.current.length >= 2) {
                        if (b) cedute.current.delete(b);
                        moveToNewWindow(tr.key, at, b);
                        return;
                      }
                      // il rilascio in un'altra finestra può arrivare ancora: il biglietto resta valido qualche secondo,
                      // poi, se nessuno l'ha preso, si butta (Map.delete è vero solo se c'era ancora)
                      if (b) setTimeout(() => { if (cedute.current.delete(b)) api.buttaScheda(b); }, 5000);
                    }, tr.biglietto ? 700 : 0);
                  }}
                  onContextMenu={(e) => { if (!canDrag) return; e.preventDefault(); tabMenuAnchor.current = e.currentTarget; setTabMenu(t.key); }}>
                  {isDirty && <span className="dot" title="Modifiche non salvate" />}
                  <span className="name">{d.name}</span>
                  <span className="x" onClick={(e) => { e.stopPropagation(); closeTab(t.key); }}><X size={14} /></span>
                </div>
              );
            })}
          </div>}
          {tabMenu && (
            <Popover anchor={tabMenuAnchor} onClose={() => setTabMenu(null)} width={260} className="menu tab-pop" role="menu" label="Scheda">
              {canDetach && <button role="menuitem" onClick={() => { setTabMenu(null); moveToNewWindow(tabMenu); }}><AppWindow size={15} /> Sposta in una nuova finestra</button>}
              {altre.length > 0 && <button role="menuitem" onClick={() => { setTabMenu(null); invia({ tipo: "riunisci", da: MIA_FINESTRA }); }}>
                <Merge size={15} /> Riunisci qui le altre finestre</button>}
              <button role="menuitem" onClick={() => { setTabMenu(null); closeTab(tabMenu); }}><X size={15} /> Chiudi la scheda</button>
            </Popover>
          )}
          {doc && <span style={{ color: "var(--muted)", whiteSpace: "nowrap" }}>{humanSize(doc.size)}{dirty ? " · non salvato" : ""}</span>}
          {/* app Android: niente elenco dei download (i file vanno in Documenti/PDFz e si apre "Condividi") */}
          {!isLocalEngine() && <Downloads entries={downloads} setEntries={setDownloads} flash={dlFlash} />}
          <Notifiche version={caps?.version} updateUrl={caps?.update_url} />
          <ThemeMenu theme={theme} setTheme={setTheme} />
          <input ref={fileInput} type="file" multiple hidden onChange={(e) => { openFiles(Array.from(e.target.files || [])); e.target.value = ""; }} />
        </header>

        <div className={`main ${drawer ? "drawer-open" : ""} ${toolDef ? "has-panel" : ""}`} style={{ gridTemplateColumns: `${sideCompact ? 56 : 232}px minmax(0, 1fr)${toolDef ? ` ${panelCollapsed ? 52 : panelW}px` : ""}` }}>
          <Sidebar compact={sideCompact} onToggleCompact={() => setSideCompact(!sideCompact)} tools={visibleTools} filter={filter} setFilter={setFilter} activeTool={tool}
            isDisabled={(t) => !doc && !noDocTools.has(t.id)}
            onPick={(t) => (!doc && !noDocTools.has(t.id) ? toast("Apri prima un documento.", "info") : pickTool(t.id))} />
          <div className="drawer-back" onClick={() => setDrawer(false)} aria-hidden />

          <section style={{ minWidth: 0, minHeight: 0, display: "grid" }}>
            {mainView ? mainView : pdf && doc ? (
              <Viewer key={doc.id.slice(0, 0) + active} pdf={pdf} sizes={sizes} overlays={overlays} interaction={interaction} notes={notes}
                currentPage={currentPage} onPageChange={setCurrentPage} goto={goto} onSearch={onSearch} />
            ) : doc && doc.needs_password && tab ? (
              <div className="empty">
                <div className="drop">
                  <Lock size={40} color="var(--brand)" />
                  <h1>Documento bloccato</h1>
                  <p>"{doc.name}" è protetto da password: inseriscila per vederlo e modificarlo.</p>
                  <div className="btn-row" style={{ justifyContent: "center" }}>
                    <button className="btn primary" onClick={() => setPwPrompt({ tabKey: tab.key, doc })}><Lock size={16} /> Sblocca</button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="empty">
                <div className={`drop ${dragOver ? "over" : ""}`}>
                  <FilePlus2 size={40} color="var(--brand)" />
                  <h1>Apri un documento</h1>
                  <p>Trascina qui un PDF, oppure documenti Word, Excel, PowerPoint e immagini da convertire. Tutto viene elaborato {isLocalEngine() ? "su questo dispositivo, anche senza internet" : "su questo PC"}.</p>
                  <div className="btn-row" style={{ justifyContent: "center" }}>
                    <button className="btn primary" onClick={onOpenClick}><FolderOpen size={16} /> Scegli file</button>
                    <PhotoScan />
                  </div>
                  <p className="kbd-hint" style={{ fontSize: 12 }}><kbd>Ctrl</kbd>+<kbd>O</kbd> apri · <kbd>Ctrl</kbd>+<kbd>S</kbd> salva · <kbd>Ctrl</kbd>+<kbd>Z</kbd> annulla</p>
                </div>
              </div>
            )}
          </section>

          {toolDef && <ToolPanel key={toolDef.id} def={toolDef} onClose={() => pickTool(null)} />}
          {/* telefono: freccia su per riaprire lo strumento abbassato, o l'ultimo usato */}
          {mobile && ((toolDef && sheetDown) || (!toolDef && lastTool && TOOL_BY_ID[lastTool])) && (() => {
            const t = toolDef || TOOL_BY_ID[lastTool!];
            const Icon = t.icon;
            return (
              <button className={`sheet-up ${pdf && doc && !mainView ? "" : "no-bar"}`} title={`Riapri ${t.label}`} aria-label={`Riapri il pannello ${t.label}`}
                onClick={() => (toolDef ? setSheetDown(false) : !doc && !noDocTools.has(t.id) ? toast("Apri prima un documento.", "info") : pickTool(t.id))}>
                <ChevronUp size={18} /> <Icon size={15} /> <span>{t.label}</span>
              </button>
            );
          })()}
        </div>

        <div className="toasts">
          {toasts.map((t) => (
            <div key={t.id} className={`toast ${t.kind}`}>
              <div className="grow">{t.msg}</div>
              <button className="btn icon ghost small" onClick={() => setToasts((x) => x.filter((y) => y.id !== t.id))}><X size={14} /></button>
            </div>
          ))}
        </div>

        {dialogs.length > 0 && (() => {
          const d = dialogs[dialogs.length - 1];
          return <ConfirmDialog key={d.id} req={d} onChoose={(r) => { setDialogs((l) => l.filter((x) => x.id !== d.id)); d.resolve(r); }} />;
        })()}

        {busy && <div className="busy"><div className="box"><div className="spin" /> {busy}</div></div>}

        {pwPrompt && (
          <PasswordModal doc={pwPrompt.doc} error={pwPrompt.error} after={pwPrompt.after}
            onCancel={() => {
              // file appena aperto e bloccato: si chiude; dopo "Aggiungi password" o con sole restrizioni resta aperto
              if (pwPrompt.doc.needs_password && !pwPrompt.after) closeTab(pwPrompt.tabKey);
              setPwPrompt(null);
            }}
            onSubmit={async (pw) => {
              try {
                const d = await api.unlock(pwPrompt.doc.id, pw);
                let protect: Record<string, any> | undefined;
                if (isLocalEngine()) {
                  // si ricorda la protezione del file (password e permessi) per rimetterla quando si salva
                  const info: any = await api.tool("password_info", { doc: d.id, params: { password: pw } }).then((r: any) => r.data).catch(() => null);
                  const role = info?.known?.role;
                  protect = { user_password: role === "owner" ? "" : pw, owner_password: role === "owner" || role === "both" ? pw : "",
                    ...(info?.allowed ? { permissions: info.allowed } : {}) };
                  if (!protect.owner_password && !protect.user_password) protect = undefined;
                }
                setTabs((ts) => ts.map((t) => t.key === pwPrompt.tabKey
                  ? { ...t, password: pw, protect: protect || t.protect, history: t.history.map((h) => (h.id === d.id ? d : h)) } : t));
                if (d.owner_unlocked) toast("Sbloccato con la password del proprietario: hai tutti i permessi.", "ok");
                setPwPrompt(null);
              } catch (e: any) {
                setPwPrompt({ ...pwPrompt, error: e.message });
              }
            }} />
        )}
      </div>
    </Ctx.Provider>
  );
}

/** Versione nel browser: apre la nuova finestra con il biglietto della scheda, della stessa misura e dove è stata
 *  lasciata la scheda. false se il browser l'ha bloccata. */
function openBrowserWindow(biglietto: string, at?: { x: number; y: number }) {
  const q = new URLSearchParams(location.search);
  q.set("scheda", biglietto);
  const pos = at ? `,left=${Math.max(0, Math.round(at.x - 120))},top=${Math.max(0, Math.round(at.y - 20))}` : "";
  const size = `width=${Math.max(1024, window.outerWidth || window.innerWidth)},height=${Math.max(640, window.outerHeight || window.innerHeight)}`;
  return !!window.open(`${location.pathname}?${q}`, "_blank", `popup,${size}${pos}`);
}

/** Stampa con il visualizzatore PDF integrato del motore web (finestra di stampa di sistema). */
function printDoc(id: string) {
  if (isLocalEngine()) {   // Android: Stampa dal menu Condividi del sistema
    import("./android/files").then((m) => m.printFile(api.fileUrl(id, true), "stampa.pdf"));
    return;
  }
  const old = document.getElementById("hdpdf-print");
  old?.remove();
  const f = document.createElement("iframe");
  f.id = "hdpdf-print";
  f.style.cssText = "position:fixed;right:0;bottom:0;width:1px;height:1px;border:0;opacity:0";
  f.src = api.fileUrl(id);
  f.onload = () => setTimeout(() => { try { f.contentWindow?.focus(); f.contentWindow?.print(); } catch { window.open(api.fileUrl(id)); } }, 400);
  document.body.appendChild(f);
}

function PasswordModal({ doc, error, after, onSubmit, onCancel }: {
  doc: DocInfo; error?: string; after?: boolean; onSubmit: (pw: string) => void; onCancel: () => void;
}) {
  const [pw, setPw] = useState("");
  const [show, setShow] = useState(false);
  const restricted = !doc.needs_password && !!doc.restricted;
  return (
    <div className="modal-back">
      <form className="modal" onSubmit={(e) => { e.preventDefault(); onSubmit(pw); }}>
        <h3>{after ? "Prova la password" : restricted ? "Documento con restrizioni" : "Documento protetto"}</h3>
        <div style={{ color: "var(--muted)" }}>
          {after
            ? <>Hai protetto "{doc.name}". Come chiunque lo aprirà, inserisci la password per sbloccarlo{restricted ? " (password del proprietario)" : ""}.</>
            : restricted
              ? <>"{doc.name}" si può leggere, ma stampa, copia o modifica sono limitate. Inserisci la <b>password del proprietario</b> per sbloccarle.</>
              : <>"{doc.name}" richiede una password per essere aperto.</>}
        </div>
        {doc.owner && <div className="hint">Questa protezione l'hai messa tu, su questo dispositivo.</div>}
        <div className="row">
          <input className="input" type={show ? "text" : "password"} autoFocus value={pw} onChange={(e) => setPw(e.target.value)}
            placeholder={restricted ? "Password del proprietario" : "Password"} />
          <button type="button" className="btn small ghost" onClick={() => setShow((v) => !v)}>{show ? "Nascondi" : "Mostra"}</button>
        </div>
        {error && <div className="note err">{error}</div>}
        <div className="btn-row" style={{ justifyContent: "flex-end" }}>
          <button type="button" className="btn" onClick={onCancel}>
            {restricted ? "Continua senza password" : after ? "Più tardi" : "Annulla"}
          </button>
          <button type="submit" className="btn primary" disabled={!pw}>Sblocca</button>
        </div>
      </form>
    </div>
  );
}
