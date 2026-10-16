import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, FileText, Plus, RotateCcw, RotateCw, Trash2, Upload } from "lucide-react";
import { api, humanSize, type DocInfo } from "../api";
import { useApp } from "../context";
import type { ToolDef } from "../tools";
import { PanelShell } from "./ToolPanel";
import { CameraButton } from "../components/PhotoScan";
import { useEvent } from "../hooks";
import { loadPdf, type PDFDoc } from "../pdf";
import { PageGrid, SelectionTools, newKey, type Card } from "../components/PageGrid";
import { Advanced, FileInput, Seg, type AssetValue } from "./fields";

function useUploader() {
  const { toast } = useApp();
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const pick = (cb: (docs: DocInfo[]) => void) => {
    const input = ref.current!;
    input.onchange = async () => {
      const files = Array.from(input.files || []);
      input.value = "";
      if (!files.length) return;
      setBusy(true);
      try { cb(await api.open(files)); } catch (e: any) { toast(e.message, "err"); } finally { setBusy(false); }
    };
    input.click();
  };
  const el = <input ref={ref} type="file" multiple hidden />;
  // app Android: la foto diventa un PDF di una pagina
  const photo = async (f: File, cb: (docs: DocInfo[]) => void) => {
    setBusy(true);
    try { cb(await api.open([f])); } catch (e: any) { toast(e.message, "err"); } finally { setBusy(false); }
  };
  return { pick, el, busy, photo };
}

// ------------------------------------------------------------------ Unisci

type MergeView = "list" | "files" | "pages";

export function MergePanel({ def, onClose }: { def: ToolDef; onClose: () => void }) {
  const app = useApp();
  const [list, setList] = useState<DocInfo[]>(() => (app.doc ? [app.doc] : []));
  const [bookmarks, setBookmarks] = useState(true);
  const [view, setView] = useState<MergeView>("list");
  const [pdfs, setPdfs] = useState<Record<string, PDFDoc>>({});
  const [pageCards, setPageCards] = useState<Card[]>([]);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const up = useUploader();
  const openTabs = app.tabs.map((t) => t.history[t.index]).filter((d) => !list.some((x) => x.id === d.id));
  const passwordOf = (id: string) => app.tabs.find((t) => t.history.some((h) => h.id === id))?.password;

  const addDocs = (docs: DocInfo[]) => {
    const ok = docs.filter((d) => {
      if (d.needs_password && !passwordOf(d.id)) { app.toast(`"${d.name}" è protetto da password: aprilo prima in una scheda.`, "err"); return false; }
      return true;
    });
    setList((l) => [...l, ...ok]);
  };
  const move = (i: number, d: number) => setList((l) => {
    const c = [...l];
    const j = i + d;
    if (j < 0 || j >= c.length) return l;
    [c[i], c[j]] = [c[j], c[i]];
    return c;
  });
  const removeDoc = (id: string) => setList((l) => l.filter((d) => d.id !== id));

  // miniature: si caricano solo nelle viste a griglia
  useEffect(() => {
    if (view === "list") return;
    let alive = true;
    for (const d of list) {
      if (pdfs[d.id]) continue;
      loadPdf(api.fileUrl(d.id), passwordOf(d.id)).then((p) => { if (alive) setPdfs((m) => ({ ...m, [d.id]: p })); }).catch(() => {});
    }
    return () => { alive = false; };
  }, [view, list]); // eslint-disable-line react-hooks/exhaustive-deps

  // vista Pagine: tiene le pagine già sistemate, aggiunge quelle dei file nuovi, toglie quelle dei file rimossi
  useEffect(() => {
    setPageCards((cs) => {
      const ids = new Set(list.map((d) => d.id));
      const kept = cs.filter((c) => c.src && ids.has(c.src));
      const have = new Set(kept.map((c) => c.src));
      const added: Card[] = [];
      for (const d of list) if (!have.has(d.id)) for (let i = 0; i < (d.pages || 0); i++) added.push({ key: newKey(), src: d.id, page: i, rotate: 0 });
      return [...kept, ...added];
    });
  }, [list]);

  const nameOf = (id?: string) => list.find((d) => d.id === id)?.name.replace(/\.pdf$/i, "") || "";
  const fileCards: Card[] = list.map((d, i) => ({ key: d.id, src: d.id, page: 0, rotate: 0, label: `${i + 1}. ${d.name} · ${d.pages} p.`, title: d.name }));
  const shownPages: Card[] = pageCards.map((c) => ({ ...c, label: `${nameOf(c.src)} · ${(c.page ?? 0) + 1}`, title: `${nameOf(c.src)} – pagina ${(c.page ?? 0) + 1}` }));

  const onCardClick = useEvent((k: string, e: React.MouseEvent) => {
    setSel((s) => {
      const next = new Set(e.ctrlKey || e.metaKey || view === "pages" ? s : []);
      if (next.has(k)) next.delete(k); else next.add(k);
      return next;
    });
  });
  const reorder = useEvent((dragKey: string, targetKey: string | null) => {
    if (dragKey === targetKey) return;
    if (view === "files") {
      setList((l) => {
        const moving = l.find((d) => d.id === dragKey)!;
        const rest = l.filter((d) => d.id !== dragKey);
        const idx = targetKey ? rest.findIndex((d) => d.id === targetKey) : rest.length;
        rest.splice(idx < 0 ? rest.length : idx, 0, moving);
        return rest;
      });
    } else {
      setPageCards((cs) => {
        const moving = sel.has(dragKey) ? cs.filter((c) => sel.has(c.key)) : cs.filter((c) => c.key === dragKey);
        const rest = cs.filter((c) => !moving.includes(c));
        const idx = targetKey ? rest.findIndex((c) => c.key === targetKey) : rest.length;
        rest.splice(idx < 0 ? rest.length : idx, 0, ...moving);
        return rest;
      });
    }
  });
  const onAdd = useEvent(() => up.pick(addDocs));

  useEffect(() => { setSel(new Set()); }, [view]);
  useEffect(() => {
    if (view === "list") { app.setMainView(null); return; }
    app.setMainView(
      <PageGrid cards={view === "files" ? fileCards : shownPages} pdfs={pdfs} selected={sel} multi={view === "pages"}
        onCardClick={onCardClick} reorderable onReorder={reorder} onAdd={onAdd} addLabel="Aggiungi file" />,
    );
  }, [view, list, pdfs, pageCards, sel]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => app.setMainView(null), []); // eslint-disable-line react-hooks/exhaustive-deps

  const pagesChanged = view === "pages" && (pageCards.length !== list.reduce((s, d) => s + (d.pages || 0), 0)
    || pageCards.some((c) => c.rotate) || pageCards.some((c, i, a) => i > 0 && list.findIndex((d) => d.id === a[i - 1].src) > list.findIndex((d) => d.id === c.src))
    || pageCards.some((c, i, a) => i > 0 && a[i - 1].src === c.src && (a[i - 1].page ?? 0) > (c.page ?? 0)));
  const total = view === "pages" ? pageCards.length : list.reduce((s, d) => s + (d.pages || 0), 0);
  const merge = () => {
    const params: Record<string, any> = { bookmarks };
    if (view === "pages") params.order = pageCards.map((c) => ({ doc: list.findIndex((d) => d.id === c.src), page: c.page, rotate: c.rotate }));
    app.run("merge", params, { docs: list.map((d) => d.id) });
  };
  const selPages = pageCards.filter((c) => sel.has(c.key));

  return (
    <PanelShell def={def} onClose={onClose}
      footer={<button className="btn primary block" disabled={list.length < 2 || !total} onClick={merge}>Unisci {list.length} file · {total} pagine</button>}>
      {up.el}
      {view === "list" && (
        <div className="list">
          {list.map((d, i) => (
            <div key={d.id + i} className="list-item">
              <span style={{ color: "var(--muted)", width: 16 }}>{i + 1}</span>
              <FileText size={15} />
              <span className="grow" title={d.name}>{d.name}</span>
              <span style={{ color: "var(--muted)" }}>{d.pages} p.</span>
              <button className="btn icon ghost small" title="Sposta su" onClick={() => move(i, -1)} disabled={i === 0}><ArrowUp size={14} /></button>
              <button className="btn icon ghost small" title="Sposta giù" onClick={() => move(i, 1)} disabled={i === list.length - 1}><ArrowDown size={14} /></button>
              <button className="btn icon ghost small" title="Togli" onClick={() => removeDoc(d.id)}><Trash2 size={14} /></button>
            </div>
          ))}
          {!list.length && <div className="list-item" style={{ color: "var(--muted)" }}>Nessun file</div>}
        </div>
      )}
      {view === "files" && (
        <>
          <div className="hint">Trascina le copertine per cambiare l'ordine dei file. Clicca su un file per selezionarlo.</div>
          <div className="btn-row">
            <button className="btn small danger" disabled={!sel.size} onClick={() => { setList((l) => l.filter((d) => !sel.has(d.id))); setSel(new Set()); }}>
              <Trash2 size={14} /> Togli {sel.size > 1 ? `${sel.size} file` : "file"}
            </button>
          </div>
        </>
      )}
      {view === "pages" && (
        <>
          <SelectionTools count={pageCards.length} selected={new Set(pageCards.map((c, i) => (sel.has(c.key) ? i : -1)).filter((i) => i >= 0))}
            onChange={(s) => setSel(new Set(pageCards.filter((_, i) => s.has(i)).map((c) => c.key)))} />
          <div className="btn-row">
            <button className="btn small" disabled={!selPages.length} onClick={() => setPageCards((cs) => cs.map((c) => (sel.has(c.key) ? { ...c, rotate: (c.rotate + 270) % 360 } : c)))}><RotateCcw size={14} /> Ruota</button>
            <button className="btn small" disabled={!selPages.length} onClick={() => setPageCards((cs) => cs.map((c) => (sel.has(c.key) ? { ...c, rotate: (c.rotate + 90) % 360 } : c)))}><RotateCw size={14} /> Ruota</button>
            <button className="btn small danger" disabled={!selPages.length} onClick={() => { setPageCards((cs) => cs.filter((c) => !sel.has(c.key))); setSel(new Set()); }}><Trash2 size={14} /> Elimina</button>
            <button className="btn small ghost" disabled={!pagesChanged} onClick={() => { setPageCards([]); setTimeout(() => setList((l) => [...l]), 0); }}>Ripristina</button>
          </div>
          <div className="hint">Trascina le pagine per mescolarle tra i file; le pagine eliminate qui non finiscono nel PDF unito.</div>
        </>
      )}
      <div className="btn-row">
        <button className="btn" onClick={() => up.pick(addDocs)} disabled={up.busy}>
          <Upload size={15} /> {up.busy ? "Caricamento…" : "Aggiungi file"}
        </button>
        <CameraButton onPhoto={(f) => up.photo(f, addDocs)} disabled={up.busy} title="Fotografa un foglio e aggiungilo come pagina" />
      </div>
      <Advanced>
      <div className="field">
        <label>Vista</label>
        <Seg value={view} onChange={(v) => setView(v as MergeView)}
          options={[{ value: "list", label: "Elenco" }, { value: "files", label: "File" }, { value: "pages", label: "Pagine" }]} />
      </div>
      {openTabs.length > 0 && (
        <div className="field">
          <label>Documenti aperti</label>
          <div className="list">
            {openTabs.map((d) => (
              <div key={d.id} className="list-item">
                <span className="grow">{d.name}</span>
                <button className="btn small" onClick={() => setList((l) => [...l, d])}><Plus size={14} /> Aggiungi</button>
              </div>
            ))}
          </div>
        </div>
      )}
      <label className="check"><input type="checkbox" checked={bookmarks} onChange={(e) => setBookmarks(e.target.checked)} /> Crea un segnalibro per ogni file</label>
      {list.length > 1 && <div className="hint">Il risultato si aprirà in una nuova scheda.</div>}
      </Advanced>
    </PanelShell>
  );
}

// ------------------------------------------------------------------ Confronta

export function ComparePanel({ def, onClose }: { def: ToolDef; onClose: () => void }) {
  const app = useApp();
  const [a, setA] = useState<DocInfo | null>(app.doc);
  const [b, setB] = useState<DocInfo | null>(null);
  const [mode, setMode] = useState("text");
  const [result, setResult] = useState<any>(null);
  const up = useUploader();
  const all = app.tabs.map((t) => t.history[t.index]);

  const DocPick = ({ label, value, set }: { label: string; value: DocInfo | null; set: (d: DocInfo) => void }) => (
    <div className="field">
      <label>{label}</label>
      <select className="input" value={value?.id || ""} onChange={(e) => { const d = all.find((x) => x.id === e.target.value); if (d) set(d); }}>
        <option value="">— scegli —</option>
        {all.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        {value && !all.some((d) => d.id === value.id) && <option value={value.id}>{value.name}</option>}
      </select>
      <div className="btn-row">
        <button className="btn small" onClick={() => up.pick((docs) => set(docs[0]))}><Upload size={13} /> Carica da file</button>
        <CameraButton className="btn small" onPhoto={(f) => up.photo(f, (docs) => set(docs[0]))} />
      </div>
    </div>
  );

  const run = async () => {
    if (!a || !b) return;
    const res = await app.run("compare", { mode }, { docs: [a.id, b.id] });
    if (res) setResult(res.data);
  };

  return (
    <PanelShell def={def} onClose={onClose}
      footer={<button className="btn primary block" disabled={!a || !b || a.id === b.id} onClick={run}>Confronta</button>}>
      {up.el}
      <DocPick label="Documento originale (A)" value={a} set={setA} />
      <DocPick label="Documento modificato (B)" value={b} set={setB} />
      {result && (
        <>
          <div className="note ok">
            Somiglianza del testo: <b>{result.summary.similarity}%</b><br />
            {result.summary.modified} modifiche · {result.summary.added} aggiunte · {result.summary.deleted} eliminazioni
            {result.summary.visual_pages?.length ? <><br />Differenze grafiche su {result.summary.visual_pages.length} pagine</> : null}
          </div>
          <div className="hint">Il rapporto affiancato (A a sinistra, B a destra) è aperto in una nuova scheda: arancione = modificato, rosso = eliminato, verde = aggiunto.</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {result.changes.slice(0, 300).map((c: any, i: number) => (
              <div key={i} className={`diff-item ${c.type}`}>
                <div style={{ color: "var(--muted)", fontSize: 11 }}>{c.type} · A p.{c.page_a ?? "–"} → B p.{c.page_b ?? "–"}</div>
                {c.old && <del>{c.old}</del>} {c.old && c.new && " → "} {c.new && <ins>{c.new}</ins>}
              </div>
            ))}
          </div>
        </>
      )}
      <Advanced>
      <div className="field">
        <label>Tipo di confronto</label>
        <Seg value={mode} onChange={setMode} options={[{ value: "text", label: "Testo" }, { value: "visual", label: "Grafico" }, { value: "both", label: "Entrambi" }]} />
      </div>
      </Advanced>
    </PanelShell>
  );
}

// ------------------------------------------------------------------ Crea PDF

import { createInbox } from "./createInbox";
export { sendToCreatePdf } from "./createInbox";

export function CreatePdfPanel({ def, onClose }: { def: ToolDef; onClose: () => void }) {
  const app = useApp();
  const [files, setFiles] = useState<AssetValue[]>([]);
  useEffect(() => {
    const drain = () => {
      if (!createInbox.items.length) return;
      const add = createInbox.items.splice(0);
      setFiles((f) => [...f, ...add]);
    };
    createInbox.notify = drain;
    drain();
    return () => { createInbox.notify = null; };
  }, []);
  const [single, setSingle] = useState(true);
  const [pageSize, setPageSize] = useState("image");
  const caps = app.caps;
  useEffect(() => { app.setInteraction({ mode: "none" }); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const create = async () => {
    if (single) await app.run("images_to_pdf", { files: files.map((f) => f.id), page_size: pageSize }, { noDoc: true });
    else for (const f of files) await app.run("file_to_pdf", { file: f.id }, { noDoc: true });
    setFiles([]);
  };
  const size = files.reduce((s, f) => s + (f.size || 0), 0);
  return (
    <PanelShell def={def} onClose={onClose}
      footer={<button className="btn primary block" disabled={!files.length} onClick={create}>Crea PDF</button>}>
      <FileInput value={files} onChange={setFiles} multiple />
      {files.length > 0 && <div className="hint">{files.length} file · {humanSize(size)}</div>}
      {caps && !caps.ms_office && !caps.libreoffice && (
        <div className="note warn">Per convertire documenti Office serve Microsoft Office o LibreOffice installato. Immagini e testo funzionano comunque.</div>
      )}
      <Advanced>
      <div className="field">
        <label>Risultato</label>
        <Seg value={single ? "1" : "n"} onChange={(v) => setSingle(v === "1")} options={[{ value: "1", label: "Un unico PDF" }, { value: "n", label: "Un PDF per file" }]} />
      </div>
      {single && (
        <div className="field">
          <label>Formato pagina (immagini)</label>
          <Seg value={pageSize} onChange={setPageSize} options={[{ value: "image", label: "Come l'immagine" }, { value: "A4", label: "A4" }]} />
        </div>
      )}
      <div className="note">
        Formati: Word, Excel, PowerPoint, OpenDocument, RTF, CSV, testo, HTML, immagini (JPG, PNG, TIFF, BMP, GIF, WebP), XPS, EPUB, SVG.
        <br />Conversione Office con: <b>{caps?.ms_office ? "Microsoft Office" : caps?.libreoffice ? "LibreOffice" : "non disponibile"}</b>
      </div>
      <div className="hint">Puoi anche trascinare i file direttamente nella finestra.</div>
      </Advanced>
    </PanelShell>
  );
}
