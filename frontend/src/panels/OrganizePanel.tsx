import { useEffect, useRef, useState } from "react";
import { CheckSquare, Copy, FileOutput, FilePlus, FileStack, FileText, Plus, RotateCcw, RotateCw, Trash2 } from "lucide-react";
import { api, type DocInfo } from "../api";
import { useApp, usePending } from "../context";
import { useEvent } from "../hooks";
import type { ToolDef } from "../tools";
import { loadPdf, type PDFDoc } from "../pdf";
import { PageGrid, SelectionTools, initialCards, newKey, type Card } from "../components/PageGrid";
import { PanelShell } from "./ToolPanel";
import { CameraButton } from "../components/PhotoScan";
import { Advanced } from "./fields";

/** Organizza pagine: riordina, ruota, duplica, elimina, estrai, inserisci pagine bianche
 *  o pagine di altri PDF (unione). */
export function OrganizePanel({ def, onClose }: { def: ToolDef; onClose: () => void }) {
  const app = useApp();
  const n = app.sizes.length;
  const [cards, setCards] = useState<Card[]>(() => initialCards(n));
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [multi, setMulti] = useState(false);
  const [pdfs, setPdfs] = useState<Record<string, PDFDoc>>({});
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const insertAt = useRef<number | null>(null);
  const lastClicked = useRef<string | null>(null);

  useEffect(() => { setCards(initialCards(n)); setSel(new Set()); }, [app.doc?.id, n]);
  useEffect(() => { if (app.pdf) setPdfs((p) => ({ ...p, "": app.pdf! })); }, [app.pdf]);

  const changed = cards.length !== n || cards.some((c, i) => c.page !== i || c.rotate || c.src);
  const hasSel = sel.size > 0;
  const selectedCards = cards.filter((c) => sel.has(c.key));

  const onCardClick = (k: string, e: React.MouseEvent) => {
    setSel((s) => {
      const additive = multi || e.ctrlKey || e.metaKey;
      const next = new Set(additive ? s : []);
      if (e.shiftKey && lastClicked.current) {
        const keys = cards.map((c) => c.key);
        const a = keys.indexOf(lastClicked.current), b = keys.indexOf(k);
        keys.slice(Math.min(a, b), Math.max(a, b) + 1).forEach((x) => next.add(x));
      } else if (additive && next.has(k)) next.delete(k);
      else if (!additive && s.size === 1 && s.has(k)) next.clear();
      else next.add(k);
      return next;
    });
    lastClicked.current = k;
  };

  const reorder = (dragKey: string, targetKey: string | null) => {
    if (dragKey === targetKey) return;
    setCards((cs) => {
      const moving = sel.has(dragKey) ? cs.filter((c) => sel.has(c.key)) : cs.filter((c) => c.key === dragKey);
      const rest = cs.filter((c) => !moving.includes(c));
      const idx = targetKey ? rest.findIndex((c) => c.key === targetKey) : rest.length;
      rest.splice(idx < 0 ? rest.length : idx, 0, ...moving);
      return [...rest];
    });
  };

  const afterSelection = () => {
    const idxs = cards.map((c, i) => (sel.has(c.key) ? i : -1)).filter((i) => i >= 0);
    return idxs.length ? Math.max(...idxs) + 1 : cards.length;
  };
  const insertCards = (newCards: Card[], at: number | null) => {
    setCards((cs) => {
      const copy = [...cs];
      copy.splice(at ?? copy.length, 0, ...newCards);
      return copy;
    });
    setSel(new Set(newCards.map((c) => c.key)));
  };

  const addDocs = async (docs: DocInfo[], at: number | null) => {
    const add: Card[] = [];
    for (const d of docs) {
      const pw = app.tabs.find((t) => t.history.some((h) => h.id === d.id))?.password;
      if (d.needs_password && !pw) { app.toast(`"${d.name}" è protetto da password: aprilo prima in una scheda e rimuovi la password.`, "err"); continue; }
      const p = await loadPdf(api.fileUrl(d.id), pw);
      setPdfs((m) => ({ ...m, [d.id]: p }));
      for (let i = 0; i < (d.pages || 0); i++) add.push({ key: newKey(), src: d.id, page: i, rotate: 0 });
    }
    insertCards(add, at);
    if (add.length) app.toast(`Inserite ${add.length} pagine${docs.length > 1 ? ` da ${docs.length} file` : ""}.`, "ok");
  };
  const addFromPdf = async (files: File[]) => {
    try {
      await addDocs(await api.open(files), insertAt.current);
    } catch (e: any) {
      app.toast(e.message, "err");
    }
  };
  const otherTabs = app.tabs.map((t) => t.history[t.index]).filter((d) => d.id !== app.doc?.id && (d.pages || 0) > 0);

  const openAddMenu = (e: React.MouseEvent, at: number | null) => {
    insertAt.current = at;
    setMenu({ x: Math.min(e.clientX, window.innerWidth - 240), y: Math.min(e.clientY, window.innerHeight - 100) });
  };

  const onCardClickE = useEvent(onCardClick);
  const reorderE = useEvent(reorder);
  const onAddE = useEvent((e: React.MouseEvent) => openAddMenu(e, null));
  // solo dipendenze di dati: un effetto senza dipendenze qui generava un ciclo di render infinito
  useEffect(() => {
    app.setMainView(
      <PageGrid cards={cards} pdfs={pdfs} selected={sel} multi={multi} onCardClick={onCardClickE}
        reorderable onReorder={reorderE} onAdd={onAddE} />,
    );
  }, [cards, pdfs, sel, multi]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => app.setMainView(null), []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    setTimeout(() => document.addEventListener("click", close, { once: true }), 0);
    return () => document.removeEventListener("click", close);
  }, [menu]);

  const order = (list: Card[]) => list.map((c) => ({ page: c.page, rotate: c.rotate, src: c.src }));
  const apply = async () => !!(await app.run("organize", { order: order(cards) }));
  usePending(changed, def.label, apply);
  const extract = () => {
    const base = (app.doc?.name || "documento").replace(/\.pdf$/i, "");
    app.run("organize", { order: order(selectedCards), new_doc: true, name: `${base} (estratto).pdf` }, { newTab: true });
  };
  const removeSelected = () => { setCards((cs) => cs.filter((c) => !sel.has(c.key))); setSel(new Set()); };
  const rotateSel = (d: number) => setCards((cs) => cs.map((c) => (sel.has(c.key) ? { ...c, rotate: (c.rotate + d + 360) % 360 } : c)));

  const positions = new Set(cards.map((c, i) => (sel.has(c.key) ? i : -1)).filter((i) => i >= 0));
  return (
    <PanelShell def={def} onClose={onClose}
      footer={<>
        <button className="btn" onClick={() => { setCards(initialCards(n)); setSel(new Set()); }} disabled={!changed}>Ripristina</button>
        <button className="btn primary" style={{ flex: 1 }} onClick={apply} disabled={!changed}>Applica</button>
      </>}>
      <input ref={fileRef} type="file" hidden multiple accept=".pdf,application/pdf"
        onChange={(e) => { const f = Array.from(e.target.files || []); e.target.value = ""; if (f.length) addFromPdf(f); }} />
      <label className="check"><input type="checkbox" checked={multi} onChange={(e) => setMulti(e.target.checked)} /> <CheckSquare size={14} /> Selezione multipla (un clic aggiunge o toglie)</label>
      <div className="label">Pagine selezionate</div>
      <div className="btn-row">
        <button className="btn small" disabled={!hasSel} onClick={() => rotateSel(-90)}><RotateCcw size={14} /> Ruota</button>
        <button className="btn small" disabled={!hasSel} onClick={() => rotateSel(90)}><RotateCw size={14} /> Ruota</button>
        <button className="btn small" disabled={!hasSel} onClick={() => setCards((cs) => cs.flatMap((c) => sel.has(c.key) ? [c, { ...c, key: newKey() }] : [c]))}><Copy size={14} /> Duplica</button>
        <button className="btn small" disabled={!hasSel} onClick={extract}><FileOutput size={14} /> Estrai</button>
        <button className="btn small danger" disabled={!hasSel} onClick={removeSelected}><Trash2 size={14} /> Elimina</button>
      </div>
      <Advanced>
      <SelectionTools count={cards.length} selected={positions}
        onChange={(s) => setSel(new Set(cards.filter((_, i) => s.has(i)).map((c) => c.key)))} />
      <div className="section-title">Unisci file</div>
      <div className="btn-row">
        <button className="btn small primary" onClick={() => { insertAt.current = afterSelection(); fileRef.current?.click(); }}><FileStack size={14} /> Unisci PDF dal PC…</button>
        <CameraButton className="btn small" label="Foto come pagina" title="Fotografa un foglio: diventa una pagina dopo la selezione"
          onPhoto={(f) => { insertAt.current = afterSelection(); return addFromPdf([f]); }} />
        <button className="btn small" onClick={() => insertCards([{ key: newKey(), page: null, rotate: 0 }], afterSelection())}><FilePlus size={14} /> Pagina bianca</button>
      </div>
      {otherTabs.length > 0 && (
        <div className="list">
          {otherTabs.map((d) => (
            <div key={d.id} className="list-item">
              <FileText size={14} />
              <span className="grow" title={d.name}>{d.name}</span>
              <span style={{ color: "var(--muted)" }}>{d.pages} p.</span>
              <button className="btn small" onClick={() => addDocs([d], afterSelection())}><Plus size={13} /> Unisci</button>
            </div>
          ))}
        </div>
      )}
      <div className="hint">Puoi scegliere più PDF insieme. Le pagine vengono inserite dopo la selezione (o in fondo) e si possono poi riordinare; anche il riquadro <b>+</b> nella griglia aggiunge file.</div>
      <div className="label">Ordinamenti rapidi</div>
      <div className="btn-row">
        <button className="btn small" onClick={() => setCards((cs) => [...cs].reverse())}>Inverti ordine</button>
        <button className="btn small" onClick={() => setCards((cs) => [...cs.filter((_, i) => i % 2 === 0), ...cs.filter((_, i) => i % 2 === 1)])}>Prima dispari poi pari</button>
        <button className="btn small" title="Per scansioni fronte/retro: prima tutti i fronti, poi i retri in ordine inverso"
          onClick={() => setCards((cs) => {
            const half = Math.ceil(cs.length / 2);
            const fronts = cs.slice(0, half), backs = cs.slice(half).reverse();
            return fronts.flatMap((f, i) => (backs[i] ? [f, backs[i]] : [f]));
          })}>Fronte/retro</button>
      </div>
      <div className="hint">Trascina le miniature per riordinarle (anche più pagine selezionate insieme). {cards.length} pagine nel risultato (originale: {n}).</div>
      </Advanced>
      {menu && (
        <div className="menu" style={{ left: menu.x, top: menu.y }} onClick={(e) => e.stopPropagation()}>
          <button onClick={() => { insertCards([{ key: newKey(), page: null, rotate: 0 }], insertAt.current); setMenu(null); }}><FilePlus size={15} /> Pagina bianca</button>
          <button onClick={() => { setMenu(null); fileRef.current?.click(); }}><FileStack size={15} /> Unisci PDF dal PC…</button>
          {otherTabs.map((d) => (
            <button key={d.id} onClick={() => { setMenu(null); addDocs([d], insertAt.current); }}><FileText size={15} /> Unisci «{d.name}»</button>
          ))}
        </div>
      )}
    </PanelShell>
  );
}
