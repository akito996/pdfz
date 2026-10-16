import { useEffect, useRef, useState } from "react";
import { ImagePlus, Lock, Trash2, Unlock } from "lucide-react";
import { api } from "../api";
import { useEvent } from "../hooks";
import { useApp, usePending } from "../context";
import type { ToolDef } from "../tools";
import type { PageObject } from "../types";
import { PanelShell } from "./ToolPanel";
import { CameraButton } from "../components/PhotoScan";
import { Advanced } from "./fields";

let seq = 0;
type Unit = "px" | "cm" | "%";
const PT_PER = { px: 0.75, cm: 72 / 2.54 };

interface Pending { asset: string; url: string; name: string; w: number; h: number }

export function ImagesPanel({ def, onClose }: { def: ToolDef; onClose: () => void }) {
  const app = useApp();
  const [objects, setObjects] = useState<PageObject[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [unit, setUnit] = useState<Unit>("cm");
  const fileRef = useRef<HTMLInputElement>(null);
  const docId = app.doc?.id;
  const sel = objects.find((o) => o.id === selectedId) || null;

  // immagini già presenti nel PDF: selezionabili per rimuoverle
  useEffect(() => {
    setObjects([]);
    setSelectedId(null);
    if (!docId) return;
    api.tool("list_images", { doc: docId }).then((r) => {
      setObjects(r.data.images.map((im: any, i: number) => ({
        id: `x${i}`, page: im.page, kind: "box", locked: true, label: "Immagine del PDF",
        rect: { x: im.bbox[0], y: im.bbox[1], w: im.bbox[2] - im.bbox[0], h: im.bbox[3] - im.bbox[1] },
        meta: { existing: true, xref: im.xref, removed: false },
      } as PageObject)));
    }).catch(() => {});
  }, [docId]);

  const patchObj = (id: string, p: Partial<PageObject>) => setObjects((l) => l.map((x) => (x.id === id ? { ...x, ...p } : x)));
  const remove = (id: string) => {
    const o = objects.find((x) => x.id === id);
    if (!o) return;
    if (o.meta?.existing) toggleRemoveExisting(o);
    else { setObjects((l) => l.filter((x) => x.id !== id)); setSelectedId(null); }
  };
  const toggleRemoveExisting = (o: PageObject) => {
    const removed = !o.meta.removed;
    patchObj(o.id, { meta: { ...o.meta, removed }, tone: removed ? "danger" : undefined, label: removed ? "Da rimuovere" : "Immagine del PDF" });
  };

  const pick = async (f: File) => {
    try {
      const url = URL.createObjectURL(f);
      const dims = await new Promise<{ w: number; h: number }>((res, rej) => {
        const im = new Image();
        im.onload = () => res({ w: im.naturalWidth, h: im.naturalHeight });
        im.onerror = () => rej(new Error("Immagine non leggibile"));
        im.src = url;
      });
      const a = await api.asset(f);
      setPending({ asset: a.id, url, name: f.name, ...dims });
      setSelectedId(null);
    } catch (e: any) {
      app.toast(e.message, "err");
    }
  };

  const place = (page: number, pt: { x: number; y: number }) => {
    if (!pending) { setSelectedId(null); return; }
    const size = app.sizes[page];
    // dimensioni originali (96 DPI), ridotte solo se più grandi della pagina
    let w = pending.w * 0.75, h = pending.h * 0.75;
    const k = Math.min(1, (size.w * 0.95) / w, (size.h * 0.95) / h);
    w *= k; h *= k;
    const x = Math.min(Math.max(pt.x - w / 2, 0), size.w - w);
    const y = Math.min(Math.max(pt.y - h / 2, 0), size.h - h);
    const o: PageObject = {
      id: `i${seq++}`, page, kind: "image", imageUrl: pending.url, keepRatio: true, opacity: 1,
      rect: { x, y, w, h },
      meta: { asset: pending.asset, name: pending.name, naturalW: pending.w * 0.75, naturalH: pending.h * 0.75, allPages: false, behind: false },
    };
    setObjects((l) => [...l, o]);
    setSelectedId(o.id);
    setPending(null);
  };

  const patchObjE = useEvent(patchObj);
  const removeE = useEvent(remove);
  const placeE = useEvent(place);
  useEffect(() => {
    app.setInteraction({
      mode: "objects", objects, selectedId, onSelect: setSelectedId, onObjectChange: patchObjE, onObjectDelete: removeE,
      onPlace: placeE, placeHint: pending ? "Clicca dove inserire l'immagine" : undefined,
    });
  }, [objects, selectedId, pending]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => app.setInteraction({ mode: "none" }), []); // eslint-disable-line react-hooks/exhaustive-deps

  const toUnit = (pt: number, natural: number) => unit === "%" ? (pt / natural) * 100 : pt / PT_PER[unit];
  const fromUnit = (v: number, natural: number) => unit === "%" ? (v / 100) * natural : v * PT_PER[unit];
  const setSize = (dim: "w" | "h", v: number) => {
    if (!sel || !(v > 0)) return;
    const nat = dim === "w" ? sel.meta.naturalW : sel.meta.naturalH;
    const pt = fromUnit(v, nat);
    const ratio = sel.rect.w / sel.rect.h;
    const rect = { ...sel.rect };
    if (dim === "w") { rect.w = pt; if (sel.keepRatio) rect.h = pt / ratio; }
    else { rect.h = pt; if (sel.keepRatio) rect.w = pt * ratio; }
    patchObj(sel.id, { rect });
  };

  const added = objects.filter((o) => !o.meta?.existing);
  const toRemove = objects.filter((o) => o.meta?.existing && o.meta.removed);
  const existing = objects.filter((o) => o.meta?.existing);

  const apply = async () => {
    const res = await app.run("images", {
      remove: toRemove.map((o) => ({ page: o.page, xref: o.meta.xref, rect: o.rect })),
      items: added.map((o) => ({
        image: o.meta.asset, page: o.page, rect: o.rect, opacity: o.opacity, keep_proportion: o.keepRatio,
        all_pages: o.meta.allPages, behind: o.meta.behind,
      })),
    });
    if (res) setSelectedId(null);
    return !!res;
  };
  usePending(added.length + toRemove.length > 0, def.label, apply);

  const fmt = (v: number) => (unit === "px" ? Math.round(v) : Math.round(v * 10) / 10);
  return (
    <PanelShell def={def} onClose={onClose}
      footer={<button className="btn primary block" disabled={!added.length && !toRemove.length} onClick={apply}>
        Applica{added.length ? ` · ${added.length} da inserire` : ""}{toRemove.length ? ` · ${toRemove.length} da rimuovere` : ""}
      </button>}>
      <div className="btn-row">
        <button className="btn" onClick={() => fileRef.current?.click()}><ImagePlus size={15} /> Inserisci immagine…</button>
        <CameraButton onPhoto={pick} title="Scatta una foto e inseriscila nel documento" />
      </div>
      <input ref={fileRef} type="file" hidden accept="image/*" onChange={(e) => { const f = e.target.files?.[0]; if (f) pick(f); e.target.value = ""; }} />
      {pending && (
        <div className="note ok" style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <img src={pending.url} style={{ width: 40, height: 40, objectFit: "contain", background: "#fff" }} />
          <div>Clicca sulla pagina dove inserire <b>{pending.name}</b> ({pending.w}×{pending.h} px).</div>
        </div>
      )}

      {sel && !sel.meta?.existing && (
        <>
          <div className="section-title">Immagine selezionata</div>
          <div className="row" style={{ alignItems: "flex-end" }}>
            <div className="field"><label>Larghezza</label>
              <input className="input" type="number" min={1} step={unit === "px" ? 1 : 0.1} value={fmt(toUnit(sel.rect.w, sel.meta.naturalW))} onChange={(e) => setSize("w", Number(e.target.value))} /></div>
            <button className="btn icon" style={{ flex: "none" }} title={sel.keepRatio ? "Proporzioni bloccate" : "Proporzioni libere"}
              onClick={() => patchObj(sel.id, { keepRatio: !sel.keepRatio })}>{sel.keepRatio ? <Lock size={15} /> : <Unlock size={15} />}</button>
            <div className="field"><label>Altezza</label>
              <input className="input" type="number" min={1} step={unit === "px" ? 1 : 0.1} value={fmt(toUnit(sel.rect.h, sel.meta.naturalH))} onChange={(e) => setSize("h", Number(e.target.value))} /></div>
          </div>
          <button className="btn small danger" style={{ alignSelf: "flex-start" }} onClick={() => remove(sel.id)}><Trash2 size={13} /> Rimuovi immagine</button>
        </>
      )}
      {sel && sel.meta?.existing && (
        <>
          <div className="section-title">Immagine del documento</div>
          <div className="hint">Pagina {sel.page + 1} · {Math.round(sel.rect.w / PT_PER.cm * 10) / 10}×{Math.round(sel.rect.h / PT_PER.cm * 10) / 10} cm</div>
          <button className={`btn small ${sel.meta.removed ? "" : "danger"}`} style={{ alignSelf: "flex-start" }} onClick={() => toggleRemoveExisting(sel)}>
            <Trash2 size={13} /> {sel.meta.removed ? "Non rimuovere" : "Rimuovi immagine"}
          </button>
        </>
      )}

      <Advanced>
        {sel && !sel.meta?.existing && (
          <>
          <div className="row">
            <span className="label" style={{ flex: "none" }}>Unità</span>
            <div className="seg">
              {(["px", "cm", "%"] as Unit[]).map((u) => <button key={u} type="button" className={unit === u ? "on" : ""} onClick={() => setUnit(u)}>{u}</button>)}
            </div>
          </div>
          <div className="btn-row">
            <button className="btn small" onClick={() => patchObj(sel.id, { rect: { ...sel.rect, w: sel.meta.naturalW, h: sel.meta.naturalH } })}>Dimensione originale</button>
          </div>
          <div className="field">
            <label>Opacità</label>
            <div className="row">
              <input type="range" min={0.1} max={1} step={0.05} value={sel.opacity ?? 1} onChange={(e) => patchObj(sel.id, { opacity: Number(e.target.value) })} />
              <span style={{ flex: "none", width: 40, textAlign: "right" }}>{Math.round((sel.opacity ?? 1) * 100)}%</span>
            </div>
          </div>
          <label className="check"><input type="checkbox" checked={sel.meta.allPages} onChange={(e) => patchObj(sel.id, { meta: { ...sel.meta, allPages: e.target.checked } })} /> Ripeti su tutte le pagine</label>
          <label className="check"><input type="checkbox" checked={sel.meta.behind} onChange={(e) => patchObj(sel.id, { meta: { ...sel.meta, behind: e.target.checked } })} /> Metti dietro al contenuto</label>
          </>
        )}
      <div className="section-title">Immagini nel documento ({existing.length})</div>
      {existing.length ? (
        <div className="btn-row">
          <button className="btn small" onClick={() => setObjects((l) => l.map((o) => o.meta?.existing ? { ...o, meta: { ...o.meta, removed: true }, tone: "danger", label: "Da rimuovere" } : o))}>Seleziona tutte per la rimozione</button>
          {toRemove.length > 0 && <button className="btn small ghost" onClick={() => setObjects((l) => l.map((o) => o.meta?.existing ? { ...o, meta: { ...o.meta, removed: false }, tone: undefined, label: "Immagine del PDF" } : o))}>Annulla</button>}
        </div>
      ) : <div className="hint">Il documento non contiene immagini.</div>}
      <div className="hint">Clicca su un'immagine per selezionarla. Le nuove immagini si spostano trascinandole e si ridimensionano dagli angoli; <kbd>Canc</kbd> le elimina.</div>
      </Advanced>
    </PanelShell>
  );
}
