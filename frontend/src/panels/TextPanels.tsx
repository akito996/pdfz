import { useEffect, useMemo, useRef, useState } from "react";
import { useEvent } from "../hooks";
import { AlignCenter, AlignLeft, AlignRight, RotateCcw, Trash2 } from "lucide-react";
import { api } from "../api";
import { useApp, usePending } from "../context";
import type { ToolDef } from "../tools";
import type { PageObject, Span } from "../types";
import { PanelShell } from "./ToolPanel";
import { Advanced, FontSelect } from "./fields";
import { rememberTexts } from "../textHistory";
import { ApplicatoScelto, ElencoApplicati, boxId, useApplicati, useSchedaKey } from "./applicati";

let seq = 0;

export interface TextStyle { fontId: string; size: number; color: string; align: "left" | "center" | "right"; opacity: number }

/** Controlli di stile per la casella di testo selezionata. */
export function TextStyleControls({ style, onChange, originalFont, showOpacity = true, part = "all" }: {
  style: TextStyle & { fontChoice?: string };
  onChange: (p: Partial<TextStyle> & { fontChoice?: string }) => void;
  originalFont?: string;
  showOpacity?: boolean;
  part?: "all" | "basic" | "more";   // basic = carattere, dimensione, colore · more = allineamento, opacità
}) {
  const basic = part !== "more", more = part !== "basic";
  return (
    <>
      {basic && <><div className="field">
        <label>Carattere</label>
        <FontSelect value={originalFont !== undefined ? style.fontChoice || style.fontId : style.fontId}
          onChange={(v) => onChange(originalFont !== undefined ? { fontChoice: v } : { fontId: v })} original={originalFont} />
      </div>
      <div className="row">
        <div className="field">
          <label>Dimensione</label>
          <div className="row">
            <input className="input" type="number" step="0.5" min={4} max={300} value={style.size}
              onChange={(e) => onChange({ size: Number(e.target.value) || style.size })} />
            <span style={{ flex: "none", color: "var(--muted)" }}>pt</span>
          </div>
        </div>
        <div className="field" style={{ flex: "none" }}>
          <label>Colore</label>
          <input type="color" className="color" value={style.color} onChange={(e) => onChange({ color: e.target.value })} />
        </div>
      </div></>}
      {more && <div className="field">
        <label>Allineamento</label>
        <div className="seg">
          {([["left", AlignLeft], ["center", AlignCenter], ["right", AlignRight]] as const).map(([v, Icon]) => (
            <button key={v} type="button" className={style.align === v ? "on" : ""} onClick={() => onChange({ align: v })}><Icon size={15} /></button>
          ))}
        </div>
      </div>}
      {more && showOpacity && (
        <div className="field">
          <label>Opacità</label>
          <div className="row">
            <input type="range" min={0.1} max={1} step={0.05} value={style.opacity} onChange={(e) => onChange({ opacity: Number(e.target.value) })} />
            <span style={{ flex: "none", width: 40, textAlign: "right" }}>{Math.round(style.opacity * 100)}%</span>
          </div>
        </div>
      )}
    </>
  );
}

// ------------------------------------------------------------------ Modifica testo

export function EditTextPanel({ def, onClose }: { def: ToolDef; onClose: () => void }) {
  const app = useApp();
  const [spans, setSpans] = useState<Record<number, Span[]>>({});
  const [objects, setObjects] = useState<PageObject[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [applyAll, setApplyAll] = useState(false);
  const loading = useRef(new Set<number>());
  const docId = app.doc?.id;

  useEffect(() => { setSpans({}); setObjects([]); setSelectedId(null); loading.current.clear(); }, [docId]);

  const needSpans = (page: number) => {
    if (!docId || loading.current.has(page)) return;
    loading.current.add(page);
    api.tool("text_spans", { doc: docId, params: { page } })
      .then((r) => setSpans((s) => ({ ...s, [page]: r.data.spans })))
      .catch((e) => app.toast(e.message, "err"));
  };

  const visibleSpans = useMemo(() => {
    const editedIds = new Set(objects.map((o) => o.meta.spanKey));
    const out: Record<number, Span[]> = {};
    for (const [p, list] of Object.entries(spans)) out[Number(p)] = list.filter((s) => !editedIds.has(`${p}:${s.id}`));
    return out;
  }, [spans, objects]);

  const startEdit = (page: number, span: Span) => {
    const [x0, y0, x1, y1] = span.bbox;
    const o: PageObject = {
      id: `e${seq++}`, page, kind: "text", autoHeight: true, autoWidth: true,
      rect: { x: x0 - 1, y: y0 - 1, w: x1 - x0 + 2, h: y1 - y0 + 2 },
      text: span.text, fontId: span.suggested_font, size: span.size, color: span.color, align: "left",
      meta: { span, spanKey: `${page}:${span.id}`, fontChoice: "original", minW: x1 - x0 + 2, orig: { x: x0 - 1, y: y0 - 1 } },
    };
    setObjects((l) => [...l, o]);
    setSelectedId(o.id);
  };

  const update = (o: PageObject) => setObjects((l) => l.map((x) => (x.id === o.id ? o : x)));
  const patchObj = (id: string, p: Partial<PageObject>) => setObjects((l) => l.map((x) => (x.id === id ? { ...x, ...p } : x)));
  const sel = objects.find((o) => o.id === selectedId) || null;

  const needSpansE = useEvent(needSpans);
  const startEditE = useEvent(startEdit);
  const patchObjE = useEvent(patchObj);
  const deleteE = useEvent((id: string) => { setObjects((l) => l.filter((o) => o.id !== id)); setSelectedId(null); });
  // l'interazione cambia solo quando cambiano i dati (mai a ogni render: eviterebbe cicli infiniti)
  useEffect(() => {
    app.setInteraction({
      mode: "objects", objects, selectedId, spans: visibleSpans, needSpans: needSpansE,
      onSelect: setSelectedId, onObjectChange: patchObjE, fontStyle: app.fontStyle,
      onSpanClick: startEditE, onObjectDelete: deleteE,
    });
  }, [objects, selectedId, visibleSpans, app.fontStyle]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => app.setInteraction({ mode: "none" }), []); // eslint-disable-line react-hooks/exhaustive-deps
  // anteprima: il testo originale sparisce dal suo posto (come avverrà applicando). Si copre solo il riquadro delle
  // lettere: la casella è trasparente, così un testo più grande o un altro carattere non nasconde le righe vicine
  useEffect(() => {
    app.setOverlays(objects.map((o) => {
      const [x0, y0, x1, y1] = (o.meta.span.ink || o.meta.span.bbox) as number[];
      return { id: `orig-${o.id}`, page: o.page, kind: "fill" as const, rect: { x: x0 - 1, y: y0 - 1, w: x1 - x0 + 2, h: y1 - y0 + 2 },
        style: { background: "#fff", border: "none", opacity: 1 } };
    }));
  }, [objects]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => app.setOverlays([]), []); // eslint-disable-line react-hooks/exhaustive-deps

  const patchStyle = (p: any) => {
    if (!sel) return;
    const apply = (o: PageObject): PageObject => {
      const n = { ...o, meta: { ...o.meta } };
      if (p.fontChoice) {
        n.meta.fontChoice = p.fontChoice;
        n.fontId = p.fontChoice === "original" ? o.meta.span.suggested_font : p.fontChoice;
      }
      if (p.size) n.size = p.size;
      if (p.color) n.color = p.color;
      if (p.align) n.align = p.align;
      return n;
    };
    setObjects((l) => l.map((o) => (o.id === sel.id || (applyAll && p.fontChoice) ? apply(o) : o)));
  };

  const apply = async () => {
    const edits = objects.map((o) => {
      const s: Span = o.meta.span;
      const moved = Math.abs(o.rect.x - o.meta.orig.x) > 1 || Math.abs(o.rect.y - o.meta.orig.y) > 1;
      return {
        page: o.page, bbox: s.bbox, origin: s.origin, text: o.text, font: o.meta.fontChoice, size: o.size, color: o.color,
        align: o.align, original_font: s.font, flags: s.flags, wrap: !o.autoWidth || (o.text || "").includes("\n"),
        rect: moved || !o.autoWidth ? { ...o.rect, w: o.rect.w * 1.04 + 2 } : undefined,
      };
    });
    const res = await app.run("edit_text", { edits });
    if (res) rememberTexts(objects.map((o) => o.text));
    if (res) { setObjects([]); setSelectedId(null); }
    return !!res;
  };
  usePending(objects.length > 0, def.label, apply);

  return (
    <PanelShell def={def} onClose={onClose}
      footer={<>
        <button className="btn" onClick={() => { setObjects([]); setSelectedId(null); }} disabled={!objects.length}>Scarta</button>
        <button className="btn primary" style={{ flex: 1 }} onClick={apply} disabled={!objects.length}>Applica {objects.length ? `(${objects.length})` : ""}</button>
      </>}>
      {!sel && <div className="note">Clicca su una riga di testo del documento: si apre la casella e puoi scrivere direttamente sulla pagina. Per spostarla dove vuoi trascina la maniglia ✥ (in alto a sinistra) o il bordo; le maniglie bianche la ridimensionano (allargandola il testo va a capo).</div>}
      {sel && (
        <>
          <TextStyleControls originalFont={sel.meta.span.font.split("+").pop()} showOpacity={false} part="basic"
            style={{ fontId: sel.fontId!, fontChoice: sel.meta.fontChoice, size: sel.size!, color: sel.color!, align: sel.align || "left", opacity: 1 }}
            onChange={patchStyle} />
          <div className="btn-row">
            <button className="btn small" onClick={() => update({ ...sel, text: "" })}><Trash2 size={13} /> Elimina testo</button>
            <button className="btn small" onClick={() => { setObjects((l) => l.filter((o) => o.id !== sel.id)); setSelectedId(null); }}><RotateCcw size={13} /> Ripristina originale</button>
          </div>
        </>
      )}
      <Advanced>
        {sel && <div className="hint">Originale: «{sel.meta.span.text}»</div>}
        {sel && <TextStyleControls originalFont={sel.meta.span.font.split("+").pop()} showOpacity={false} part="more"
          style={{ fontId: sel.fontId!, fontChoice: sel.meta.fontChoice, size: sel.size!, color: sel.color!, align: sel.align || "left", opacity: 1 }}
          onChange={patchStyle} />}
        {sel && <label className="check"><input type="checkbox" checked={applyAll} onChange={(e) => setApplyAll(e.target.checked)} /> Applica il carattere a tutte le caselle modificate</label>}
        {objects.length > 0 && (
          <div className="field">
            <label>Modifiche in sospeso</label>
            <div className="list">
              {objects.map((o) => (
                <div key={o.id} className="list-item" style={{ cursor: "pointer", background: o.id === selectedId ? "var(--brand-soft)" : undefined }}
                  onClick={() => { setSelectedId(o.id); app.gotoPage(o.page); }}>
                  <span style={{ color: "var(--muted)", flex: "none" }}>p.{o.page + 1}</span>
                  <span className="grow">{o.text || <i>(testo eliminato)</i>}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        <div className="hint">Il carattere originale viene riutilizzato se contiene tutte le lettere necessarie; altrimenti si usa il font installato più simile.</div>
      </Advanced>
    </PanelShell>
  );
}

// ------------------------------------------------------------------ Aggiungi testo

const DEFAULT_STYLE: TextStyle = { fontId: "helv", size: 12, color: "#000000", align: "left", opacity: 1 };

export function AddTextPanel({ def, onClose }: { def: ToolDef; onClose: () => void }) {
  const app = useApp();
  const [objects, setObjects] = useState<PageObject[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [style, setStyle] = useState<TextStyle>(DEFAULT_STYLE);
  const sel = objects.find((o) => o.id === selectedId) || null;
  // si riparte da zero cambiando scheda (non quando il documento cambia versione, per esempio eliminando un testo)
  const scheda = useSchedaKey();
  useEffect(() => { setObjects([]); setSelectedId(null); }, [scheda]);
  // testi aggiunti in precedenza: si toccano sulla pagina e si eliminano
  const ap = useApplicati(["testo"]);
  const scelto = ap.scelto(selectedId);
  const elimina = async (v: { page?: number; id: string }[]) => { if (await ap.elimina(v)) setSelectedId(null); };

  const update = (o: PageObject) => setObjects((l) => l.map((x) => (x.id === o.id ? o : x)));
  const patchObj = (id: string, p: Partial<PageObject>) => ap.cambia(id, p) || setObjects((l) => l.map((x) => (x.id === id ? { ...x, ...p } : x)));
  const remove = (id: string) => {
    const a = ap.scelto(id);
    if (a) { elimina([{ page: a.page, id: a.id }]); return; }
    setObjects((l) => l.filter((o) => o.id !== id)); setSelectedId(null);
  };

  const place = (page: number, pt: { x: number; y: number }) => {
    // primo clic fuori da una casella: la deseleziona (ed elimina se vuota)
    if (sel) {
      if (!(sel.text || "").trim()) remove(sel.id);
      else setSelectedId(null);
      return;
    }
    const o: PageObject = {
      id: `t${seq++}`, page, kind: "text", autoHeight: true, autoWidth: true, big: true,
      rect: { x: pt.x, y: pt.y - style.size * 0.6, w: 40, h: style.size * 1.3 },
      text: "", ...style, meta: { minW: 40 },
    };
    setObjects((l) => [...l, o]);
    setSelectedId(o.id);
  };

  const patchObjE = useEvent(patchObj);
  const removeE = useEvent(remove);
  const placeE = useEvent(place);
  const dropE = useEvent((id: string) => { ap.lascia(id); });
  useEffect(() => {
    app.setInteraction({
      mode: "objects", objects: [...ap.boxes, ...objects], selectedId, onSelect: setSelectedId, onObjectChange: patchObjE, onObjectDelete: removeE,
      onObjectDrop: dropE, onPlace: placeE, placeHint: "Clicca per inserire una casella di testo", fontStyle: app.fontStyle,
    });
  }, [objects, selectedId, app.fontStyle, ap.boxes]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => app.setInteraction({ mode: "none" }), []); // eslint-disable-line react-hooks/exhaustive-deps

  const patch = (p: Partial<TextStyle>) => {
    setStyle((s) => ({ ...s, ...p }));
    if (sel) update({ ...sel, ...p });
  };
  const filled = objects.filter((o) => (o.text || "").trim());

  const apply = async () => {
    const items = filled.map((o) => ({
      page: o.page, rect: { ...o.rect, w: o.rect.w * 1.04 + 2 }, text: o.text, font: o.fontId, size: o.size,
      color: o.color, align: o.align, opacity: o.opacity, wrap: true,
    }));
    const res = await app.run("add_text", { items });
    if (res) rememberTexts(filled.map((o) => o.text));
    if (res) { setObjects([]); setSelectedId(null); }
    return !!res;
  };
  // caselle vuote non contano: non c'è niente da inserire
  usePending(filled.length > 0, def.label, apply);

  const cur: TextStyle = sel ? { fontId: sel.fontId!, size: sel.size!, color: sel.color!, align: sel.align || "left", opacity: sel.opacity ?? 1 } : style;
  return (
    <PanelShell def={def} onClose={onClose}
      footer={<>
        <button className="btn" onClick={() => { setObjects([]); setSelectedId(null); }} disabled={!objects.length}>Scarta</button>
        <button className="btn primary" style={{ flex: 1 }} onClick={apply} disabled={!filled.length}>Inserisci {filled.length ? `(${filled.length})` : ""}</button>
      </>}>
      <div className="note">Clicca sulla pagina dove vuoi scrivere: compare la casella e puoi digitare subito. Trascina il bordo per spostarla e le maniglie per ridimensionarla.</div>
      <div className="label">{sel ? "Casella selezionata" : "Stile delle nuove caselle"}</div>
      <TextStyleControls style={cur} onChange={patch} part="basic" />
      {sel && <button className="btn small danger" style={{ alignSelf: "flex-start" }} onClick={() => remove(sel.id)}><Trash2 size={13} /> Elimina casella</button>}
      {scelto && <ApplicatoScelto a={scelto} tutti={ap.items} onElimina={elimina} />}
      <Advanced>
        <TextStyleControls style={cur} onChange={patch} part="more" />
        {objects.length > 0 && <div className="hint">{filled.length} caselle pronte da inserire.</div>}
        <ElencoApplicati titolo="Testi aggiunti nel documento" items={ap.items} onElimina={elimina}
          onVai={(a) => { app.gotoPage(a.page); if (a.rect) setSelectedId(boxId(a)); }} />
      </Advanced>
    </PanelShell>
  );
}
