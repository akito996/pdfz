import { useEffect, useRef, useState } from "react";
import { ArrowLeftRight, FlipHorizontal2, Minus, MoveVertical, Trash2 } from "lucide-react";
import { api } from "../api";
import { useApp, usePending } from "../context";
import { useEvent, useStored } from "../hooks";
import type { ToolDef } from "../tools";
import type { PageObject, VRect } from "../types";
import { ShapeSvg, type LineDir, type ShapeKind } from "../components/ShapeSvg";
import { PanelShell } from "./ToolPanel";
import { Advanced, useVerbo } from "./fields";

let seq = 0;
const LABEL: Record<ShapeKind, string> = { rect: "Rettangolo", ellipse: "Cerchio / Ovale", line: "Segmento", arrow: "Freccia", check: "Spunta", cross: "X" };
const SHAPES: ShapeKind[] = ["rect", "ellipse", "line", "arrow"];
const MARKS: ShapeKind[] = ["check", "cross"];
const PALETTE = ["#000000", "#c8102e", "#d4af37", "#fdc300", "#15803d", "#2563eb", "#7c3aed", "#ffffff"];

interface Style { stroke: string; fill: string | null; width: number; dash: boolean; opacity: number }
const DEFAULT_STYLE: Style = { stroke: "#c8102e", fill: null, width: 1.5, dash: false, opacity: 1 };
const isLine = (k: ShapeKind) => k === "line" || k === "arrow";
const isMark = (k: ShapeKind) => k === "check" || k === "cross";

/** dir della linea dal punto di partenza a quello d'arrivo del trascinamento */
function dirFrom(a: { x: number; y: number }, b: { x: number; y: number }): LineDir {
  const dx = b.x - a.x, dy = b.y - a.y;
  if (Math.abs(dy) < Math.abs(dx) * 0.08) return dx >= 0 ? "l-r" : "r-l";
  if (Math.abs(dx) < Math.abs(dy) * 0.08) return dy >= 0 ? "t-b" : "b-t";
  if (dx >= 0) return dy >= 0 ? "tl-br" : "bl-tr";
  return dy >= 0 ? "tr-bl" : "br-tl";
}
const REVERSE: Record<LineDir, LineDir> = { "tl-br": "br-tl", "br-tl": "tl-br", "bl-tr": "tr-bl", "tr-bl": "bl-tr", "l-r": "r-l", "r-l": "l-r", "t-b": "b-t", "b-t": "t-b" };
const MIRROR: Record<LineDir, LineDir> = { "tl-br": "bl-tr", "bl-tr": "tl-br", "br-tl": "tr-bl", "tr-bl": "br-tl", "l-r": "l-r", "r-l": "r-l", "t-b": "t-b", "b-t": "b-t" };

export function ShapesPanel({ def, onClose }: { def: ToolDef; onClose: () => void }) {
  const app = useApp();
  const marks = def.id === "marks";
  const kinds = marks ? MARKS : SHAPES;
  const [kind, setKind] = useState<ShapeKind>(kinds[0]);
  const [style, setStyle] = useStored<Style>(marks ? "hdpdf.stileSegni" : "hdpdf.stileForme", marks ? { ...DEFAULT_STYLE, stroke: "#000000", width: 2 } : DEFAULT_STYLE);
  const [markSize, setMarkSize] = useStored("hdpdf.dimensioneSegni", 12);
  const [objects, setObjects] = useState<PageObject[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const docId = app.doc?.id;
  const verb = useVerbo();
  const sel = objects.find((o) => o.id === selectedId) || null;
  // forma appena scritta sul foglio: quando si rilegge il documento la si seleziona di nuovo (si continua a modificarla)
  const riseleziona = useRef<{ page: number; kind: string; rect: VRect } | null>(null);

  // forme già presenti: modificabili e spostabili
  useEffect(() => {
    setObjects([]); setSelectedId(null);
    if (!docId) return;
    api.tool("list_shapes", { doc: docId }).then((r) => {
      // tutte le forme del documento restano visibili e modificabili (anche spunte e X)
      const l: PageObject[] = r.data.shapes.map((s: any) => ({
        id: `x${s.xref}`, page: s.page, kind: "shape", rect: s.rect, opacity: s.opacity,
        keepRatio: isMark(s.kind) ? true : undefined,
        meta: { shape: s.kind, stroke: s.stroke, fill: s.fill, width: s.width, dash: s.dash, dir: s.dir, xref: s.xref, origPage: s.page, dirty: false },
      }));
      setObjects(l);
      const w = riseleziona.current;
      riseleziona.current = null;
      const o = w && l.find((x) => x.page === w.page && x.meta.shape === w.kind && Math.abs(x.rect.x - w.rect.x) < 2
        && Math.abs(x.rect.y - w.rect.y) < 2 && Math.abs(x.rect.w - w.rect.w) < 2 && Math.abs(x.rect.h - w.rect.h) < 2);
      if (o) setSelectedId(o.id);
    }).catch(() => {});
  }, [docId]); // eslint-disable-line react-hooks/exhaustive-deps

  // senza "Applica": ogni forma nuova, spostata o cambiata va subito sul foglio (e resta selezionata)
  const salva = async (o: PageObject) => {
    if (attesa.current) { clearTimeout(attesa.current.t); attesa.current = null; }
    riseleziona.current = { page: o.page, kind: o.meta.shape, rect: o.rect };
    const ok = !!(await app.run("shapes", { items: [{
      kind: o.meta.shape, page: o.page, rect: o.rect, dir: o.meta.dir, stroke: o.meta.stroke, fill: o.meta.fill,
      width: o.meta.width, dash: o.meta.dash, opacity: o.opacity, xref: o.meta.xref, orig_page: o.meta.origPage,
    }] }, { silent: true }));
    if (!ok) riseleziona.current = null;
    return ok;
  };
  // colore, spessore e simili: si scrive dopo una breve pausa, così trascinando un cursore non si scrive a ogni passo
  const attesa = useRef<{ id: string; t: number } | null>(null);
  const salvaTraPoco = (id: string) => {
    if (attesa.current) clearTimeout(attesa.current.t);
    attesa.current = { id, t: window.setTimeout(() => { const o = objectsRef.current.find((x) => x.id === id); attesa.current = null; if (o) salva(o); }, 600) };
  };
  const objectsRef = useRef(objects);
  objectsRef.current = objects;

  const newObj = (page: number, rect: VRect, dir: LineDir = "tl-br"): PageObject => ({
    id: `s${seq++}`, page, kind: "shape", rect, opacity: style.opacity,
    keepRatio: isMark(kind) ? true : undefined,
    meta: { shape: kind, stroke: style.stroke, fill: isLine(kind) || isMark(kind) ? null : style.fill, width: style.width, dash: style.dash, dir, dirty: true },
  });
  const add = (o: PageObject) => { setObjects((l) => [...l, o]); setSelectedId(o.id); salva(o); };

  const onDraw = useEvent((page: number, rect: VRect, a: { x: number; y: number }, b: { x: number; y: number }) => {
    if (isMark(kind)) { const s = Math.max(rect.w, rect.h); add(newObj(page, { x: rect.x, y: rect.y, w: s, h: s })); return; }
    const d = isLine(kind) ? dirFrom(a, b) : "tl-br";
    const r = { ...rect };
    if (isLine(kind) && (d === "l-r" || d === "r-l")) { r.y = (a.y + b.y) / 2 - 4; r.h = 8; }
    if (isLine(kind) && (d === "t-b" || d === "b-t")) { r.x = (a.x + b.x) / 2 - 4; r.w = 8; }
    add(newObj(page, r, d));
  });
  const onPlace = useEvent((page: number, pt: { x: number; y: number }) => {
    // clic semplice: forma di dimensione predefinita centrata sul punto (segni: grandezza della casella)
    const s = isMark(kind) ? markSize : 0;
    const w = s || (isLine(kind) ? 120 : 120), h = s || (isLine(kind) ? 8 : kind === "ellipse" ? 80 : 70);
    add(newObj(page, { x: pt.x - w / 2, y: pt.y - h / 2, w, h }, isLine(kind) ? "l-r" : "tl-br"));
  });
  // spostamento e ridimensionamento: si scrive al rilascio (onObjectDrop); il resto dopo una breve pausa
  const patch = (id: string, p: Partial<PageObject>) => {
    setObjects((l) => l.map((o) => (o.id === id ? { ...o, ...p, meta: { ...o.meta, ...(p.meta || {}), dirty: true } } : o)));
    if (p.meta || p.opacity !== undefined || (p.rect && !trascino.current)) salvaTraPoco(id);
  };
  const trascino = useRef(false);
  const patchE = useEvent((id: string, p: Partial<PageObject>) => { if (p.rect && !p.meta) trascino.current = true; patch(id, p); });
  const dropE = useEvent((id: string) => {
    trascino.current = false;
    const o = objectsRef.current.find((x) => x.id === id);
    if (o) salva(o);
  });
  const remove = useEvent(async (id: string) => {
    const o = objects.find((x) => x.id === id);
    setObjects((l) => l.filter((x) => x.id !== id));
    setSelectedId(null);
    if (o?.meta.xref) await app.run("shapes", { remove: [{ page: o.meta.origPage, xref: o.meta.xref }] }, { silent: true });
  });

  useEffect(() => {
    app.setInteraction({
      mode: "objects", objects, selectedId, onSelect: setSelectedId, onObjectChange: patchE, onObjectDelete: remove, onObjectDrop: dropE,
      onDraw, onPlace, hideAnnotations: true,
      placeHint: marks ? `${verb} la casella da riempire` : "Trascina sulla pagina per disegnare la forma",
    });
  }, [objects, selectedId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => app.setInteraction({ mode: "none" }), []); // eslint-disable-line react-hooks/exhaustive-deps

  // le modifiche di stile si applicano alla forma selezionata e diventano il nuovo stile predefinito
  const setS = (p: Partial<Style>) => {
    setStyle({ ...style, ...p });
    if (sel) patch(sel.id, { ...(p.opacity !== undefined ? { opacity: p.opacity } : {}), meta: { ...p } });
  };
  const cur: Style = sel ? { stroke: sel.meta.stroke, fill: sel.meta.fill, width: sel.meta.width, dash: sel.meta.dash, opacity: sel.opacity ?? 1 } : style;
  const curKind: ShapeKind = sel ? sel.meta.shape : kind;

  // uscendo mentre una modifica aspetta la breve pausa: si scrive subito
  usePending(!!attesa.current, def.label, async () => {
    const a = attesa.current;
    const o = a && objectsRef.current.find((x) => x.id === a.id);
    return o ? salva(o) : true;
  });

  return (
    <PanelShell def={def} onClose={onClose}>
      <div className="shape-picker" role="radiogroup" aria-label="Forma">
        {kinds.map((k) => (
          <button key={k} type="button" role="radio" aria-checked={kind === k} className={`shape-btn ${kind === k ? "on" : ""}`}
            onClick={() => { setKind(k); setSelectedId(null); }} title={LABEL[k]}>
            <ShapeSvg kind={k} w={34} h={k === "line" || k === "arrow" ? 22 : 24} dir={k === "line" || k === "arrow" ? "bl-tr" : "tl-br"}
              stroke="currentColor" fill={k === "rect" || k === "ellipse" ? "rgba(30,57,108,.12)" : null} width={2} />
            <span>{LABEL[k]}</span>
          </button>
        ))}
      </div>
      <div className="hint">{marks
        ? `${verb} dentro una casella del modulo: il segno va subito sul foglio. Trascina per sceglierne la grandezza.`
        : `Trascina sulla pagina per disegnare: la forma va subito sul foglio. ${verb} una forma per spostarla o cambiarne lo stile.`}</div>

      {sel && <div className="section-title">{LABEL[curKind]} selezionata{sel.meta.xref ? " (già nel documento)" : ""}</div>}
      {!sel && <div className="section-title">Stile</div>}

      <div className="field">
        <label>{isLine(curKind) || isMark(curKind) ? "Colore" : "Colore del contorno"}</label>
        <ColorRow value={cur.stroke} onChange={(v) => v && setS({ stroke: v })} />
      </div>
      {sel && <button className="btn small danger" style={{ alignSelf: "flex-start" }} onClick={() => remove(sel.id)}><Trash2 size={13} /> Elimina forma</button>}
      <Advanced>
      {!isLine(curKind) && !isMark(curKind) && (
        <div className="field">
          <label>Riempimento (spazio interno)</label>
          <ColorRow value={cur.fill} onChange={(v) => setS({ fill: v })} allowNone />
        </div>
      )}
      <div className="field">
        <label>Spessore della linea · {cur.width} pt</label>
        <input type="range" min={isLine(curKind) || isMark(curKind) ? 0.5 : 0} max={12} step={0.5} value={cur.width} onChange={(e) => setS({ width: Number(e.target.value) })} />
      </div>
      {!isMark(curKind) && <label className="check"><input type="checkbox" checked={cur.dash} onChange={(e) => setS({ dash: e.target.checked })} /> Linea tratteggiata</label>}
      <div className="field">
        <label>Opacità · {Math.round(cur.opacity * 100)}%</label>
        <input type="range" min={0.1} max={1} step={0.05} value={cur.opacity} onChange={(e) => setS({ opacity: Number(e.target.value) })} />
      </div>
      {marks && !sel && (
        <div className="field">
          <label>Grandezza al clic · {markSize} pt</label>
          <input type="range" min={6} max={40} step={1} value={markSize} onChange={(e) => setMarkSize(Number(e.target.value))} />
        </div>
      )}
      {sel && isLine(curKind) && (
        <div className="btn-row">
          <button className="btn small" title="Inverti la direzione" onClick={() => patch(sel.id, { meta: { dir: REVERSE[sel.meta.dir as LineDir] } })}><ArrowLeftRight size={14} /> Inverti</button>
          <button className="btn small" title="Specchia" onClick={() => patch(sel.id, { meta: { dir: MIRROR[sel.meta.dir as LineDir] } })}><FlipHorizontal2 size={14} /> Specchia</button>
          <button className="btn small" title="Orizzontale" onClick={() => patch(sel.id, { rect: { ...sel.rect, y: sel.rect.y + sel.rect.h / 2 - 4, h: 8 }, meta: { dir: "l-r" } })}><Minus size={14} /> Orizzontale</button>
          <button className="btn small" title="Verticale" onClick={() => patch(sel.id, { rect: { ...sel.rect, x: sel.rect.x + sel.rect.w / 2 - 4, w: 8 }, meta: { dir: "t-b" } })}><MoveVertical size={14} /> Verticale</button>
        </div>
      )}
      {sel && (
        <>
          <div className="field">
            <label>Dimensioni (pt)</label>
            <div className="row">
              <input className="input" type="number" min={1} value={Math.round(sel.rect.w)} aria-label="Larghezza"
                onChange={(e) => { const v = Number(e.target.value); if (v > 0) patch(sel.id, { rect: { ...sel.rect, w: v, ...(sel.keepRatio ? { h: v } : {}) } }); }} />
              <span style={{ flex: "none" }}>×</span>
              <input className="input" type="number" min={1} value={Math.round(sel.rect.h)} aria-label="Altezza"
                onChange={(e) => { const v = Number(e.target.value); if (v > 0) patch(sel.id, { rect: { ...sel.rect, h: v, ...(sel.keepRatio ? { w: v } : {}) } }); }} />
            </div>
          </div>
        </>
      )}
      <div className="hint">Le forme sono annotazioni PDF: restano modificabili anche in Acrobat. {objects.length} nel documento.
        Mentre questo pannello è aperto gli altri commenti del PDF non vengono mostrati.</div>
      </Advanced>
    </PanelShell>
  );
}

function ColorRow({ value, onChange, allowNone }: { value: string | null; onChange: (v: string | null) => void; allowNone?: boolean }) {
  return (
    <div className="color-row">
      {allowNone && (
        <button type="button" className={`swatch none ${value ? "" : "on"}`} title="Nessuno (trasparente)" aria-label="Nessun riempimento" onClick={() => onChange(null)} />
      )}
      {PALETTE.map((c) => (
        <button key={c} type="button" className={`swatch ${value?.toLowerCase() === c ? "on" : ""}`} style={{ background: c }} title={c} aria-label={`Colore ${c}`} onClick={() => onChange(c)} />
      ))}
      <input type="color" className="swatch-pick" value={value || "#ffffff"} onChange={(e) => onChange(e.target.value)} title="Altro colore" aria-label="Altro colore" />
    </div>
  );
}
