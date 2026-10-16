import { useEffect, useRef, useState } from "react";
import { ArrowRight, ChevronDown, Columns2, Download, FileText, FolderOpen, Languages, Link2, Link2Off, Plus, RefreshCw, Replace, Trash2, Upload, ZoomIn, ZoomOut } from "lucide-react";
import { api, download, type DocInfo } from "../api";
import { useApp } from "../context";
import { useEvent, useStored } from "../hooks";
import { loadPdf, pageSizes, pdfjs, type PDFDoc, type PageSize } from "../pdf";
import type { ToolDef } from "../tools";
import { PanelShell } from "./ToolPanel";
import { Advanced } from "./fields";

interface Lang { code: string; name: string }
interface Result { doc: DocInfo; data: any; original: DocInfo; password?: string }

const jobId = () => `tr${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export function TranslatePanel({ def, onClose }: { def: ToolDef; onClose: () => void }) {
  const app = useApp();
  const [langs, setLangs] = useState<{ languages: Lang[]; pairs: string[]; installed: any[] } | null>(null);
  const [src, setSrc] = useState("auto");
  const [dst, setDst] = useStored("hdpdf.linguaTraduzione", "en");
  const [detected, setDetected] = useState<Lang | null>(null);
  const [pages, setPages] = useState("");
  const [busy, setBusy] = useState(false);
  const [prog, setProg] = useState<{ label?: string; done?: number; total?: number }>({});
  const [result, setResult] = useState<Result | null>(null);
  const [showPacks, setShowPacks] = useState(false);
  const docId = app.doc?.id;

  const reload = () => api.trLanguages().then(setLangs).catch(() => {});
  useEffect(() => { reload(); }, []);
  useEffect(() => {
    setDetected(null);
    if (docId) api.trDetect(docId).then((d) => d.code && setDetected({ code: d.code, name: d.name })).catch(() => {});
  }, [docId]);

  const pairs = new Set(langs?.pairs || []);
  const can = (a: string, b: string) => a !== b && (pairs.has(`${a}-${b}`) || (pairs.has(`${a}-en`) && pairs.has(`en-${b}`)));
  const from = src === "auto" ? detected?.code || "" : src;
  const targets = (langs?.languages || []).filter((l) => !from || can(from, l.code));
  const sources = (langs?.languages || []).filter((l) => (langs?.languages || []).some((t) => can(l.code, t.code)));
  const ready = !!app.doc && !!dst && (!from || can(from, dst));

  const start = async () => {
    if (!app.doc) return;
    const original = app.doc;
    const tab = app.tabs.find((t) => t.history[t.index]?.id === original.id);
    const job = jobId();
    setBusy(true); setResult(null); setProg({ label: "Preparazione…" });
    const timer = window.setInterval(() => { api.progress(job).then(setProg).catch(() => {}); }, 600);
    try {
      const r = await api.tool("translate", { doc: original.id, params: { src, dst, pages, job } });
      if (r.doc) setResult({ doc: r.doc, data: r.data, original, password: tab?.password });
      app.toast(r.message || "Traduzione completata.", "ok");
    } catch (e: any) {
      app.toast(e.message, "err");
    } finally {
      window.clearInterval(timer);
      setBusy(false);
    }
  };

  const openTab = useEvent(() => { if (result) app.openDoc(result.doc); });
  const adopt = useEvent(() => {
    if (!result) return;
    app.adoptVersion(result.original.id, result.doc);
    app.toast("Ora lavori sul documento tradotto. Con Annulla (Ctrl+Z) torni all'originale.", "ok");
  });
  const saveText = useEvent(async (format: "txt" | "docx", layout: "translation" | "bilingual") => {
    if (!result) return;
    try {
      const r = await api.tool("translation_export", { params: { text_id: result.data.text_id, format, layout } });
      if (!r.output) return;
      const path = await download(r.output.id, r.output.name);
      if (path) app.addDownload({ itemId: r.output.id, name: String(path).split(/[\\/]/).pop() || r.output.name, size: r.output.size, status: "saved", path: String(path) });
      else app.addDownload({ itemId: r.output.id, name: r.output.name, size: r.output.size, status: "ready" });
    } catch (e: any) { app.toast(e.message, "err"); }
  });
  const save = useEvent(async () => {
    if (!result) return;
    const path = await download(result.doc.id, result.doc.name);
    if (path) app.addDownload({ itemId: result.doc.id, name: String(path).split(/[\\/]/).pop() || result.doc.name, size: result.doc.size, status: "saved", path: String(path) });
  });
  useEffect(() => {
    if (busy) { app.setMainView(<div className="p7m-view"><div className="p7m-busy"><div className="spin" /> Traduzione in corso… il primo avvio di una lingua può richiedere qualche secondo.</div></div>); return; }
    if (!result) { app.setMainView(null); return; }
    app.setMainView(<CompareView result={result} onOpen={openTab} onSave={save} onAdopt={adopt} onSaveText={saveText} />);
  }, [result, busy]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => app.setMainView(null), []); // eslint-disable-line react-hooks/exhaustive-deps

  const pct = prog.total ? Math.min(100, Math.round(((prog.done || 0) / prog.total) * 100)) : 0;
  const noPacks = langs && !langs.pairs.length;

  return (
    <PanelShell def={def} onClose={onClose}
      footer={<button className="btn primary block" disabled={!ready || busy} onClick={start}><Languages size={15} /> {busy ? "Traduzione…" : "Traduci"}</button>}>
      {noPacks && <div className="note warn">Nessun pacchetto lingua installato. Aggiungine uno da "Pacchetti lingua" qui sotto.</div>}
      <div className="field">
        <label>Lingua del documento</label>
        <select className="input" value={src} onChange={(e) => setSrc(e.target.value)}>
          <option value="auto">Rileva automaticamente{detected ? ` (${detected.name})` : ""}</option>
          {sources.map((l) => <option key={l.code} value={l.code}>{l.name}</option>)}
        </select>
      </div>
      <div className="field">
        <label>Traduci in</label>
        <select className="input" value={dst} onChange={(e) => setDst(e.target.value)}>
          {!targets.some((t) => t.code === dst) && <option value={dst}>{langs?.languages.find((l) => l.code === dst)?.name || dst} (pacchetto mancante)</option>}
          {targets.filter((l) => l.code !== from).map((l) => <option key={l.code} value={l.code}>{l.name}</option>)}
        </select>
      </div>
      {from && dst && !can(from, dst) && from !== dst && (
        <div className="note warn">Manca il pacchetto per tradurre da {langs?.languages.find((l) => l.code === from)?.name || from}. Aggiungilo da "Pacchetti lingua".</div>
      )}
      {busy && (
        <div className="field">
          <label>{prog.label || "Traduzione…"}</label>
          <div className="progress"><div style={{ width: `${pct}%` }} /></div>
          <div className="hint">{prog.total ? `${prog.done || 0} di ${prog.total} frasi` : ""}</div>
        </div>
      )}
      {result && !busy && (
        <div className="note ok">
          Tradotto da {result.data.src_name} a {result.data.dst_name}. A sinistra l'originale, a destra la traduzione.
          <div className="btn-row" style={{ marginTop: 6 }}>
            <button className="btn small primary" onClick={adopt} title="Il documento della scheda diventa quello tradotto: puoi continuare a lavorarci (modifiche, firma, …)"><Replace size={13} /> Usa la traduzione</button>
            <button className="btn small" onClick={openTab}><FolderOpen size={13} /> Apri in una scheda</button>
            <button className="btn small" onClick={save}><Download size={13} /> Salva PDF…</button>
          </div>
          <div className="label" style={{ marginTop: 8 }}>Salva il testo tradotto</div>
          <div className="btn-row">
            <button className="btn small" onClick={() => saveText("docx", "translation")}><FileText size={13} /> Word</button>
            <button className="btn small" onClick={() => saveText("docx", "bilingual")}><Columns2 size={13} /> Word bilingue</button>
            <button className="btn small" onClick={() => saveText("txt", "translation")}><FileText size={13} /> Testo .txt</button>
            <button className="btn small" onClick={() => saveText("txt", "bilingual")}><Columns2 size={13} /> .txt bilingue</button>
          </div>
        </div>
      )}
      <Advanced>
      <div className="field">
        <label>Pagine</label>
        <input className="input" value={pages} onChange={(e) => setPages(e.target.value)} placeholder="Vuoto = tutte · es. 1-3, 5" />
      </div>
      <div className="hint">La traduzione avviene su questo PC, senza inviare il documento su internet. È automatica: per documenti ufficiali va riletta.</div>

      <button className="btn small ghost" style={{ alignSelf: "flex-start" }} onClick={() => setShowPacks((v) => !v)}>
        <Plus size={13} /> Pacchetti lingua ({langs?.installed.length || 0})
      </button>
      {showPacks && <PacksManager installed={langs?.installed || []} onChange={reload} />}
      </Advanced>
    </PanelShell>
  );
}

function PacksManager({ installed, onChange }: { installed: any[]; onChange: () => void }) {
  const app = useApp();
  const [avail, setAvail] = useState<any[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [working, setWorking] = useState<string | null>(null);
  const [prog, setProg] = useState<{ done?: number; total?: number }>({});
  const fileRef = useRef<HTMLInputElement>(null);

  const load = (refresh = false) => {
    setErr(null);
    api.trAvailable(refresh).then(setAvail).catch((e) => setErr(e.message));
  };
  const install = async (key: string) => {
    const job = jobId();
    setWorking(key); setProg({});
    const t = window.setInterval(() => api.progress(job).then(setProg).catch(() => {}), 500);
    try {
      await api.trInstall({ key, job });
      app.toast("Pacchetto lingua installato.", "ok");
      onChange(); load();
    } catch (e: any) { app.toast(e.message, "err"); } finally { window.clearInterval(t); setWorking(null); }
  };
  const importFile = async (f: File) => {
    setWorking("file");
    try {
      const a = await api.asset(f);
      await api.trInstall({ asset: a.id });
      app.toast("Pacchetto lingua installato.", "ok");
      onChange();
    } catch (e: any) { app.toast(e.message, "err"); } finally { setWorking(null); }
  };
  const remove = async (key: string) => {
    try { await api.trRemove(key); onChange(); if (avail) load(); } catch (e: any) { app.toast(e.message, "err"); }
  };
  const ql = q.trim().toLowerCase();
  const list = (avail || []).filter((a) => !a.installed && (!ql || `${a.from_name} ${a.to_name} ${a.key}`.toLowerCase().includes(ql)));

  return (
    <div className="packs">
      <div className="label">Installati</div>
      <div className="list">
        {installed.map((p) => (
          <div key={p.key} className="list-item">
            <span className="grow">{p.from_name} <ArrowRight size={11} /> {p.to_name}</span>
            {p.bundled ? <span className="badge">incluso</span>
              : <button className="btn icon ghost small" title="Rimuovi" aria-label={`Rimuovi ${p.from_name} → ${p.to_name}`} onClick={() => remove(p.key)}><Trash2 size={13} /></button>}
          </div>
        ))}
        {!installed.length && <div className="list-item" style={{ color: "var(--muted)" }}>Nessuno</div>}
      </div>
      <div className="btn-row">
        {!avail && <button className="btn small" onClick={() => load()}><RefreshCw size={13} /> Mostra lingue scaricabili</button>}
        <button className="btn small" onClick={() => fileRef.current?.click()} disabled={!!working}><Upload size={13} /> Importa .argosmodel…</button>
      </div>
      <input ref={fileRef} type="file" hidden accept=".argosmodel,.zip" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) importFile(f); }} />
      {err && <div className="note err">{err}</div>}
      {avail && (
        <>
          <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cerca lingua…" aria-label="Cerca lingua" />
          <div className="list packs-list">
            {list.map((a) => (
              <div key={a.key} className="list-item">
                <span className="grow">{a.from_name} <ArrowRight size={11} /> {a.to_name}</span>
                {working === a.key
                  ? <span className="hint">{prog.total ? `${Math.round(((prog.done || 0) / prog.total) * 100)}%` : "…"}</span>
                  : <button className="btn small" disabled={!!working} onClick={() => install(a.key)}><Download size={13} /> Scarica</button>}
              </div>
            ))}
            {!list.length && <div className="list-item" style={{ color: "var(--muted)" }}>Nessun altro pacchetto</div>}
          </div>
          <div className="hint">Ogni pacchetto è una direzione (es. Italiano → Inglese) e pesa circa 60–100 MB. Le lingue senza pacchetto diretto passano dall'inglese.</div>
        </>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ vista affiancata

type CmpView = "side" | "translation" | "text";

function CompareView({ result, onOpen, onSave, onAdopt, onSaveText }: {
  result: Result; onOpen: () => void; onSave: () => void; onAdopt: () => void;
  onSaveText: (format: "txt" | "docx", layout: "translation" | "bilingual") => void;
}) {
  const [docs, setDocs] = useState<{ a: PDFDoc; b: PDFDoc; sizes: PageSize[] } | null>(null);
  const [view, setView] = useStored<CmpView>("hdpdf.vistaTraduzione", "side");
  const [showOrig, setShowOrig] = useStored("hdpdf.traduzioneMostraOriginale", true);
  // "fit" = Adatta: la pagina occupa la larghezza della colonna (predefinito); un numero = 1 è la dimensione reale
  const [zoom, setZoom] = useState<number | "fit">("fit");
  const [sync, setSync] = useState(true);
  const [colW, setColW] = useState(500);
  const [menu, setMenu] = useState(false);
  const left = useRef<HTMLDivElement>(null);
  const right = useRef<HTMLDivElement>(null);
  const lock = useRef(false);
  const shown: number[] = result.data.pages.map((p: number) => p - 1);

  useEffect(() => {
    let alive = true;
    Promise.all([loadPdf(api.fileUrl(result.original.id), result.password), loadPdf(api.fileUrl(result.doc.id), result.password)])
      .then(async ([a, b]) => { if (alive) setDocs({ a, b, sizes: await pageSizes(a) }); })
      .catch(() => {});
    return () => { alive = false; };
  }, [result]);
  useEffect(() => {
    const el = view === "side" ? left.current : right.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setColW(el.clientWidth));
    ro.observe(el);
    setColW(el.clientWidth);
    return () => ro.disconnect();
  }, [docs, view]);
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(false);
    const t = window.setTimeout(() => document.addEventListener("click", close, { once: true }), 0);
    return () => { window.clearTimeout(t); document.removeEventListener("click", close); };
  }, [menu]);

  const onScroll = (from: HTMLDivElement | null, to: HTMLDivElement | null) => {
    if (!sync || !from || !to || lock.current) return;
    lock.current = true;
    to.scrollTop = from.scrollTop * ((to.scrollHeight - to.clientHeight) / Math.max(1, from.scrollHeight - from.clientHeight));
    to.scrollLeft = from.scrollLeft;
    requestAnimationFrame(() => { lock.current = false; });
  };
  const maxW = docs ? Math.max(...shown.map((i) => docs.sizes[i]?.w || 595)) : 595;
  const fitW = Math.max(120, colW - 40);
  const realW = maxW * 96 / 72;   // 100% = dimensione reale sullo schermo
  const width = zoom === "fit" ? fitW : Math.max(120, realW * zoom);
  const pct = Math.round((width / realW) * 100);
  const zoomBy = (k: number) => setZoom(Math.min(4, Math.max(0.25, (width / realW) * k)));
  const cols: ("a" | "b")[] = view === "side" ? ["a", "b"] : ["b"];

  return (
    <div className="cmp-wrap">
      <div className="viewer-bar">
        <span className="cmp-title"><Columns2 size={16} /> {result.data.src_name} → {result.data.dst_name}</span>
        <div className="sep" />
        <div className="seg" role="radiogroup" aria-label="Vista">
          <button type="button" className={view === "side" ? "on" : ""} onClick={() => setView("side")} title="Originale e traduzione affiancati">Affiancate</button>
          <button type="button" className={view === "translation" ? "on" : ""} onClick={() => setView("translation")} title="Solo il documento tradotto">Traduzione</button>
          <button type="button" className={view === "text" ? "on" : ""} onClick={() => setView("text")} title="Testo frase per frase">Testo</button>
        </div>
        {view !== "text" ? (
          <>
            <button className="btn icon ghost" title="Riduci" aria-label="Riduci" onClick={() => zoomBy(1 / 1.2)}><ZoomOut size={17} /></button>
            <span style={{ minWidth: 44, textAlign: "center", color: "var(--muted)" }}>{pct}%</span>
            <button className="btn icon ghost" title="Ingrandisci" aria-label="Ingrandisci" onClick={() => zoomBy(1.2)}><ZoomIn size={17} /></button>
            <button className={`btn small ghost ${zoom === "fit" ? "on" : ""}`} onClick={() => setZoom("fit")} title="Adatta alla larghezza">Adatta</button>
            <button className={`btn small ghost ${zoom === 1 ? "on" : ""}`} onClick={() => setZoom(1)} title="Dimensione reale">100%</button>
            {view === "side" && (
              <button className={`btn small ghost ${sync ? "on" : ""}`} onClick={() => setSync((x) => !x)} title="Scorrimento sincronizzato">
                {sync ? <Link2 size={14} /> : <Link2Off size={14} />} Sincronizza
              </button>
            )}
          </>
        ) : (
          <label className="check" style={{ margin: 0 }}><input type="checkbox" checked={showOrig} onChange={(e) => setShowOrig(e.target.checked)} /> Mostra l'originale</label>
        )}
        <div className="cmp-actions">
        <button className="btn small primary" onClick={onAdopt} title="Il documento della scheda diventa quello tradotto (Annulla per tornare all'originale)"><Replace size={14} /> Usa la traduzione</button>
        <button className="btn small" onClick={onOpen}><FolderOpen size={14} /> Apri in una scheda</button>
        <button className="btn small" onClick={onSave}><Download size={14} /> Salva PDF…</button>
        <div className="menu-anchor">
          <button className="btn small" aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu((m) => !m)}><FileText size={14} /> Salva testo <ChevronDown size={13} /></button>
          {menu && (
            <div className="menu menu-down" role="menu" onClick={(e) => e.stopPropagation()}>
              <button role="menuitem" onClick={() => { setMenu(false); onSaveText("docx", "translation"); }}><FileText size={15} /> Word (.docx) — solo traduzione</button>
              <button role="menuitem" onClick={() => { setMenu(false); onSaveText("docx", "bilingual"); }}><Columns2 size={15} /> Word (.docx) — originale e traduzione</button>
              <button role="menuitem" onClick={() => { setMenu(false); onSaveText("txt", "translation"); }}><FileText size={15} /> Testo (.txt) — solo traduzione</button>
              <button role="menuitem" onClick={() => { setMenu(false); onSaveText("txt", "bilingual"); }}><Columns2 size={15} /> Testo (.txt) — originale e traduzione</button>
            </div>
          )}
        </div>
        </div>
      </div>
      {view !== "text" ? (
        <div className={`cmp-cols ${view === "side" ? "" : "single"}`}>
          {cols.map((k) => (
            <div key={k} className="cmp-col">
              <div className="cmp-head">{k === "a" ? `Originale · ${result.data.src_name}` : `Traduzione · ${result.data.dst_name}`}</div>
              <div className="cmp-scroll" ref={k === "a" ? left : right}
                onScroll={() => (k === "a" ? onScroll(left.current, right.current) : onScroll(right.current, left.current))}>
                {docs ? shown.map((i) => (
                  <ComparePage key={i} pdf={k === "a" ? docs.a : docs.b} index={i} size={docs.sizes[i]} width={width * ((docs.sizes[i]?.w || maxW) / maxW)} />
                )) : <div className="p7m-busy"><div className="spin" /></div>}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className={`cmp-text ${showOrig ? "" : "single"}`}>
          <div className="cmp-row head">{showOrig && <div>Originale · {result.data.src_name}</div>}<div>Traduzione · {result.data.dst_name}</div></div>
          {result.data.pairs.map((p: any, i: number) => (
            <div key={i} className="cmp-row">
              {showOrig && <div><span className="cmp-pg">p. {p.page + 1}</span>{p.src}</div>}
              <div>{!showOrig && <span className="cmp-pg">p. {p.page + 1}</span>}{p.dst}</div>
            </div>
          ))}
          {result.data.blocks > result.data.pairs.length && <div className="hint" style={{ padding: 12 }}><FileText size={13} /> Mostrati i primi {result.data.pairs.length} blocchi: il testo salvato è completo.</div>}
        </div>
      )}
    </div>
  );
}

function ComparePage({ pdf, index, size, width }: { pdf: PDFDoc; index: number; size?: PageSize; width: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const holder = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const h = size ? (width * size.h) / size.w : width * 1.414;
  useEffect(() => {
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { rootMargin: "600px" });
    if (holder.current) io.observe(holder.current);
    return () => io.disconnect();
  }, []);
  useEffect(() => {
    if (!visible || !canvas.current) return;
    let task: any = null;
    let cancelled = false;
    const t = window.setTimeout(async () => {
      const page = await pdf.getPage(index + 1);
      if (cancelled || !canvas.current) return;
      const base = page.getViewport({ scale: 1 });
      const dpr = window.devicePixelRatio || 1;
      const vp = page.getViewport({ scale: (width / base.width) * dpr });
      const c = canvas.current;
      c.width = vp.width; c.height = vp.height;
      task = page.render({ canvasContext: c.getContext("2d")!, viewport: vp, annotationMode: pdfjs.AnnotationMode.ENABLE_FORMS });
      task.promise.catch(() => {});
    }, 80);   // piccola attesa: durante lo zoom non si ridisegna a ogni passo
    return () => { cancelled = true; window.clearTimeout(t); task?.cancel?.(); };
  }, [visible, pdf, index, width]);
  return (
    <div ref={holder} className="cmp-page" style={{ width, height: h }} data-page={index}>
      <canvas ref={canvas} style={{ width, height: h }} />
      <span className="cmp-num">{index + 1}</span>
    </div>
  );
}
