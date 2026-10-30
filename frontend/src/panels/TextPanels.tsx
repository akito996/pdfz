import { useEffect, useMemo, useRef, useState } from "react";
import { useEvent } from "../hooks";
import { AlignCenter, AlignLeft, AlignRight, RotateCcw, Trash2 } from "lucide-react";
import { api } from "../api";
import { useApp, useApplicaLasciando, usePending } from "../context";
import type { ToolDef } from "../tools";
import type { PageObject, Span } from "../types";
import { PanelShell } from "./ToolPanel";
import { Advanced, FontSelect, useVerbo } from "./fields";
import { rememberTexts } from "../textHistory";
import { ApplicatoScelto, ElencoApplicati, boxId, useApplicati, useSchedaKey, type Applicato } from "./applicati";

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
  const loading = useRef(new Set<number>());
  const docId = app.doc?.id;
  const verb = useVerbo();

  // nuova versione del documento: le righe si rileggono; la casella che si sta scrivendo resta (si svuota cambiando scheda)
  useEffect(() => { setSpans({}); loading.current.clear(); }, [docId]);
  const scheda = useSchedaKey();
  useEffect(() => { setObjects([]); setSelectedId(null); }, [scheda]);

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
      onSpanClick: startEditE, onObjectDelete: deleteE, placeHint: `${verb} la riga di testo da correggere`,
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
    setObjects((l) => l.map((o) => (o.id === sel.id ? apply(o) : o)));
  };

  // senza "Applica": lasciata la riga (tocco fuori, un'altra riga, Esc) la correzione va subito sul foglio
  const scrivi = async (o: PageObject): Promise<boolean> => {
    const s: Span = o.meta.span;
    const moved = Math.abs(o.rect.x - o.meta.orig.x) > 1 || Math.abs(o.rect.y - o.meta.orig.y) > 1;
    const uguale = o.text === s.text && o.meta.fontChoice === "original" && o.size === s.size && o.color === s.color && !moved && o.autoWidth;
    if (uguale) { setObjects((l) => l.filter((x) => x.id !== o.id)); return true; }   // aperta e non cambiata
    const res = await app.run("edit_text", { edits: [{
      page: o.page, bbox: s.bbox, origin: s.origin, text: o.text, font: o.meta.fontChoice, size: o.size, color: o.color,
      align: o.align, original_font: s.font, flags: s.flags, wrap: !o.autoWidth || (o.text || "").includes("\n"),
      rect: moved || !o.autoWidth ? { ...o.rect, w: o.rect.w * 1.04 + 2 } : undefined,
    }] }, { silent: true });
    if (res) { rememberTexts([o.text]); setObjects((l) => l.filter((x) => x.id !== o.id)); }
    return !!res;
  };
  useApplicaLasciando(selectedId, (id) => { const o = objects.find((x) => x.id === id); if (o) scrivi(o); });
  usePending(objects.length > 0, def.label, async () => {
    for (const o of objects) if (!(await scrivi(o))) return false;
    return true;
  });

  return (
    <PanelShell def={def} onClose={onClose}>
      {!sel && <div className="note">{verb} una riga di testo del documento e scrivi: la correzione va sul foglio appena {verb === "Tocca" ? "tocchi" : "clicchi"} fuori dalla casella. Per spostarla trascina la maniglia ✥; le maniglie bianche la allargano.</div>}
      {sel && (
        <>
          <TextStyleControls originalFont={sel.meta.span.font.split("+").pop()} showOpacity={false} part="basic"
            style={{ fontId: sel.fontId!, fontChoice: sel.meta.fontChoice, size: sel.size!, color: sel.color!, align: sel.align || "left", opacity: 1 }}
            onChange={patchStyle} />
          <div className="btn-row">
            <button className="btn small" onClick={() => update({ ...sel, text: "" })}><Trash2 size={13} /> Elimina testo</button>
            <button className="btn small" onClick={() => { setObjects((l) => l.filter((o) => o.id !== sel.id)); setSelectedId(null); }}><RotateCcw size={13} /> Lascia com'era</button>
          </div>
        </>
      )}
      <Advanced>
        {sel && <div className="hint">Originale: «{sel.meta.span.text}»</div>}
        {sel && <TextStyleControls originalFont={sel.meta.span.font.split("+").pop()} showOpacity={false} part="more"
          style={{ fontId: sel.fontId!, fontChoice: sel.meta.fontChoice, size: sel.size!, color: sel.color!, align: sel.align || "left", opacity: 1 }}
          onChange={patchStyle} />}
        <div className="hint">Il carattere originale viene riutilizzato se contiene tutte le lettere necessarie; altrimenti si usa il font installato più simile.</div>
      </Advanced>
    </PanelShell>
  );
}

// ------------------------------------------------------------------ Aggiungi testo

const DEFAULT_STYLE: TextStyle = { fontId: "helv", size: 12, color: "#000000", align: "left", opacity: 1 };

export function AddTextPanel({ def, onClose }: { def: ToolDef; onClose: () => void }) {
  const app = useApp();
  const verb = useVerbo();
  const [objects, setObjects] = useState<PageObject[]>([]);   // casella che si sta scrivendo
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [style, setStyle] = useState<TextStyle>(DEFAULT_STYLE);
  const sel = objects.find((o) => o.id === selectedId) || null;
  // si riparte da zero cambiando scheda (non quando il documento cambia versione, per esempio dopo aver scritto)
  const scheda = useSchedaKey();
  useEffect(() => { setObjects([]); setSelectedId(null); }, [scheda]);
  // testi già sul foglio: si toccano per riaprirli e cambiarli, si spostano, si eliminano
  const ap = useApplicati(["testo"]);
  const scelto = ap.scelto(selectedId);
  const elimina = async (v: { page?: number; id: string }[]) => { if (await ap.elimina(v)) setSelectedId(null); };

  // testo riaperto: al suo posto un velo bianco finché si scrive (poi il motore lo sostituisce)
  useEffect(() => {
    app.setOverlays(objects.filter((o) => o.meta.riaperto).map((o) => ({
      id: `via-${o.id}`, page: o.page, kind: "fill" as const, rect: o.meta.riaperto.rect, style: { background: "#fff", border: "none", opacity: 1 },
    })));
  }, [objects]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => app.setOverlays([]), []); // eslint-disable-line react-hooks/exhaustive-deps

  const togli = (id: string) => setObjects((l) => l.filter((o) => o.id !== id));
  const update = (o: PageObject) => setObjects((l) => l.map((x) => (x.id === o.id ? o : x)));
  const patchObj = (id: string, p: Partial<PageObject>) => ap.cambia(id, p) || setObjects((l) => l.map((x) => (x.id === id ? { ...x, ...p } : x)));
  const remove = (id: string) => {
    const a = ap.scelto(id);
    if (a) { elimina([{ page: a.page, id: a.id }]); return; }
    const o = objects.find((x) => x.id === id);
    togli(id);
    setSelectedId(null);
    if (o?.meta.riaperto) elimina([{ page: o.meta.riaperto.page, id: o.meta.riaperto.id }]);
  };

  // impronta di testo, stile e posizione: un testo riaperto e non cambiato non si riscrive
  const impronta = (o: PageObject) => JSON.stringify([o.text, o.fontId, o.size, o.color, o.align, o.opacity ?? 1,
    Math.round(o.rect.x), Math.round(o.rect.y), Math.round(o.rect.w)]);
  // senza "Applica": lasciata la casella (tocco fuori, un'altra casella, Esc) il testo va subito sul foglio
  const scrivi = async (o: PageObject): Promise<boolean> => {
    const r = o.meta.riaperto, testo = (o.text || "").trim();
    if ((r && impronta(o) === r.impronta) || (!r && !testo)) { togli(o.id); return true; }
    const res = await app.run("add_text", {
      items: testo ? [{ page: o.page, rect: { ...o.rect, w: o.rect.w * 1.04 + 2 }, text: o.text, font: o.fontId, size: o.size,
        color: o.color, align: o.align, opacity: o.opacity, wrap: true }] : [],
      remove: r ? [{ page: r.page, id: r.id }] : undefined,
    }, { silent: true });
    if (res) { if (testo) rememberTexts([o.text!]); togli(o.id); }
    return !!res;
  };
  useApplicaLasciando(selectedId, (id) => { const o = objects.find((x) => x.id === id); if (o) scrivi(o); });
  usePending(objects.length > 0, def.label, async () => {
    for (const o of objects) if (!(await scrivi(o))) return false;
    return true;
  });

  // testo già sul foglio (con testo e stile salvati, dalla 1.6.0): si riapre nella casella per cambiarlo
  const riapri = (a: Applicato) => {
    const x = a.extra!, r = a.rect!;
    const w = x.w ? (x.w - 2) / 1.04 : r.w;
    const o: PageObject = {
      id: `t${seq++}`, page: a.page, kind: "text", autoHeight: true, autoWidth: true, big: true,
      rect: { x: r.x, y: r.y, w, h: r.h },
      text: x.testo, fontId: x.font, size: x.size, color: x.color, align: x.align, opacity: x.opacity ?? 1,
      meta: { minW: w },   // si allarga mentre si scrive, non si stringe sotto la larghezza di prima
    };
    o.meta.riaperto = { page: a.page, id: a.id, rect: r, impronta: impronta(o) };
    setObjects((l) => [...l, o]);
    setSelectedId(o.id);
  };
  const seleziona = (id: string | null) => {
    const a = id ? ap.scelto(id) : undefined;
    if (a && a.rect && typeof a.extra?.testo === "string") { riapri(a); return; }
    setSelectedId(id);
  };

  const place = (page: number, pt: { x: number; y: number }) => {
    // primo tocco fuori da una casella: la chiude (il testo va sul foglio); il tocco dopo apre una casella nuova
    if (selectedId) { setSelectedId(null); return; }
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
  const selezionaE = useEvent(seleziona);
  const dropE = useEvent((id: string) => { ap.lascia(id); });
  const riaperti = new Set(objects.map((o) => o.meta.riaperto?.id).filter(Boolean));
  const boxes = ap.boxes.filter((b) => !riaperti.has(b.meta?.applicato?.id));
  useEffect(() => {
    app.setInteraction({
      mode: "objects", objects: [...boxes, ...objects], selectedId, onSelect: selezionaE, onObjectChange: patchObjE, onObjectDelete: removeE,
      onObjectDrop: dropE, onPlace: placeE, placeHint: `${verb} dove vuoi scrivere`, fontStyle: app.fontStyle,
    });
  }, [objects, selectedId, app.fontStyle, ap.boxes, verb]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => app.setInteraction({ mode: "none" }), []); // eslint-disable-line react-hooks/exhaustive-deps

  const patch = (p: Partial<TextStyle>) => {
    setStyle((s) => ({ ...s, ...p }));
    if (sel) update({ ...sel, ...p });
  };

  const cur: TextStyle = sel ? { fontId: sel.fontId!, size: sel.size!, color: sel.color!, align: sel.align || "left", opacity: sel.opacity ?? 1 } : style;
  return (
    <PanelShell def={def} onClose={onClose}>
      <div className="note">{verb} la pagina dove vuoi scrivere e digita: il testo va sul foglio appena {verb === "Tocca" ? "tocchi" : "clicchi"} fuori dalla casella. {verb} un testo già aggiunto per cambiarlo.</div>
      <div className="label">{sel ? (sel.meta.riaperto ? "Testo che stai cambiando" : "Casella che stai scrivendo") : "Stile delle nuove caselle"}</div>
      <TextStyleControls style={cur} onChange={patch} part="basic" />
      {sel && <button className="btn small danger" style={{ alignSelf: "flex-start" }} onClick={() => remove(sel.id)}><Trash2 size={13} /> Elimina il testo</button>}
      {scelto && <ApplicatoScelto a={scelto} tutti={ap.items} onElimina={elimina} />}
      <Advanced>
        <TextStyleControls style={cur} onChange={patch} part="more" />
        <ElencoApplicati titolo="Testi aggiunti nel documento" items={ap.items} onElimina={elimina}
          onVai={(a) => { app.gotoPage(a.page); if (a.rect) seleziona(boxId(a)); }} />
      </Advanced>
    </PanelShell>
  );
}
