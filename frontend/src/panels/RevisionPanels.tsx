import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, IndentDecrease, IndentIncrease, Plus, Trash2 } from "lucide-react";
import { api } from "../api";
import { useApp, usePending } from "../context";
import type { ToolDef } from "../tools";
import { PanelShell } from "./ToolPanel";
import { Advanced } from "./fields";

const PROPS: [string, string][] = [
  ["title", "Titolo"], ["author", "Autore"], ["subject", "Oggetto"], ["keywords", "Parole chiave"],
  ["creator", "Applicazione di origine"], ["producer", "Produttore PDF"],
];

export function PropertiesPanel({ def, onClose }: { def: ToolDef; onClose: () => void }) {
  const app = useApp();
  const [v, setV] = useState<Record<string, string>>({});
  const [orig, setOrig] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!app.doc) return;
    api.tool("get_properties", { doc: app.doc.id }).then((r) => {
      const d = { ...r.data };
      for (const k of ["creationDate", "modDate"]) if (d[k]) d[k] = String(d[k]).replace(" ", "T").slice(0, 16);
      setV(d);
      setOrig(d);
    }).catch((e) => app.toast(e.message, "err"));
  }, [app.doc?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const changed = JSON.stringify(v) !== JSON.stringify(orig);
  const save = async () => {
    const p: any = {};
    for (const [k] of PROPS) p[k] = v[k] || "";
    if (v.creationDate) p.creationDate = v.creationDate;
    if (v.modDate && v.modDate !== orig.modDate) p.modDate = v.modDate;
    const res = await app.run("set_properties", p);
    if (res) setOrig(v);   // niente più in sospeso anche prima che arrivino le proprietà della nuova versione
    return !!res;
  };
  usePending(changed, def.label, save);
  return (
    <PanelShell def={def} onClose={onClose} footer={<button className="btn primary block" disabled={!changed} onClick={save}>Salva proprietà</button>}>
      {PROPS.slice(0, 2).map(([k, label]) => (
        <div className="field" key={k}>
          <label>{label}</label>
          <input className="input" value={v[k] || ""} onChange={(e) => setV({ ...v, [k]: e.target.value })} />
        </div>
      ))}
      <Advanced>
      {PROPS.slice(2).map(([k, label]) => (
        <div className="field" key={k}>
          <label>{label}</label>
          {k === "keywords"
            ? <textarea className="input" style={{ minHeight: 48 }} value={v[k] || ""} onChange={(e) => setV({ ...v, [k]: e.target.value })} placeholder="separate da virgola" />
            : <input className="input" value={v[k] || ""} onChange={(e) => setV({ ...v, [k]: e.target.value })} />}
        </div>
      ))}
      <div className="row">
        <div className="field"><label>Data creazione</label><input className="input" type="datetime-local" value={v.creationDate || ""} onChange={(e) => setV({ ...v, creationDate: e.target.value })} /></div>
      </div>
      <div className="field"><label>Data modifica</label><input className="input" type="datetime-local" value={v.modDate || ""} onChange={(e) => setV({ ...v, modDate: e.target.value })} />
        <div className="hint">Se non la cambi, viene impostata automaticamente a ora.</div></div>
      </Advanced>
    </PanelShell>
  );
}

interface Entry { level: number; title: string; page: number }

export function TocPanel({ def, onClose }: { def: ToolDef; onClose: () => void }) {
  const app = useApp();
  const [items, setItems] = useState<Entry[]>([]);
  const [orig, setOrig] = useState("[]");
  const n = app.sizes.length;
  useEffect(() => {
    if (!app.doc) return;
    api.tool("get_properties", { doc: app.doc.id }).then((r) => { setItems(r.data.toc); setOrig(JSON.stringify(r.data.toc)); })
      .catch((e) => app.toast(e.message, "err"));
  }, [app.doc?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const upd = (i: number, patch: Partial<Entry>) => setItems((l) => l.map((e, j) => (j === i ? { ...e, ...patch } : e)));
  const move = (i: number, d: number) => setItems((l) => {
    const c = [...l];
    const j = i + d;
    if (j < 0 || j >= c.length) return l;
    [c[i], c[j]] = [c[j], c[i]];
    return c;
  });
  const tocChanged = JSON.stringify(items) !== orig;
  const save = async () => {
    const res = await app.run("set_toc", { toc: items });
    if (res) setOrig(JSON.stringify(items));
    return !!res;
  };
  usePending(tocChanged, def.label, save);
  const detect = async () => {
    if (!app.doc) return;
    try {
      const r = await api.tool("detect_headings", { doc: app.doc.id });
      if (!r.data.entries.length) app.toast("Nessun titolo rilevato.", "info");
      else setItems(r.data.entries);
    } catch (e: any) {
      app.toast(e.message, "err");
    }
  };
  return (
    <PanelShell def={def} onClose={onClose}
      footer={<button className="btn primary block" disabled={!tocChanged} onClick={save}>Salva indice</button>}>
      <div className="btn-row">
        <button className="btn small" onClick={() => setItems((l) => [...l, { level: 1, title: `Pagina ${app.currentPage + 1}`, page: app.currentPage + 1 }])}><Plus size={14} /> Voce alla pagina corrente</button>
        <button className="btn small" onClick={detect}>Rileva dai titoli</button>
        {items.length > 0 && <button className="btn small danger" onClick={() => setItems([])}>Svuota</button>}
      </div>
      {!items.length && <div className="note">Il documento non ha segnalibri. Aggiungi le voci oppure rilevale automaticamente dai titoli.</div>}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {items.map((e, i) => (
          <div key={i} style={{ marginLeft: (e.level - 1) * 16, display: "flex", flexDirection: "column", gap: 4, padding: 8, border: "1px solid var(--line)", borderRadius: 6, background: "var(--panel-2)" }}>
            <input className="input" value={e.title} onChange={(ev) => upd(i, { title: ev.target.value })} placeholder="Titolo della voce" />
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span className="hint">Pag.</span>
              <input className="input" type="number" min={1} max={n} value={e.page} onChange={(ev) => upd(i, { page: Number(ev.target.value) })} style={{ width: 64 }} />
              <div style={{ flex: 1 }} />
              <button className="btn icon ghost small" title="Riduci livello" onClick={() => upd(i, { level: Math.max(1, e.level - 1) })}><IndentDecrease size={14} /></button>
              <button className="btn icon ghost small" title="Aumenta livello" onClick={() => upd(i, { level: Math.min(e.level + 1, (items[i - 1]?.level || 0) + 1) })}><IndentIncrease size={14} /></button>
              <button className="btn icon ghost small" title="Su" onClick={() => move(i, -1)}><ArrowUp size={14} /></button>
              <button className="btn icon ghost small" title="Giù" onClick={() => move(i, 1)}><ArrowDown size={14} /></button>
              <button className="btn icon ghost small" title="Elimina" onClick={() => setItems((l) => l.filter((_, j) => j !== i))}><Trash2 size={14} /></button>
            </div>
          </div>
        ))}
      </div>
      <Advanced>
        <div className="hint">Clicca su una pagina del documento, poi "Voce alla pagina corrente". Per generare una pagina di sommario stampabile usa "Crea indice".</div>
      </Advanced>
    </PanelShell>
  );
}
