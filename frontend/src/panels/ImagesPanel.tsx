import { useEffect, useRef, useState } from "react";
import { ImagePlus, Trash2 } from "lucide-react";
import { api } from "../api";
import { useEvent } from "../hooks";
import { useApp } from "../context";
import type { ToolDef } from "../tools";
import type { PageObject } from "../types";
import { PanelShell } from "./ToolPanel";
import { CameraButton } from "../components/PhotoScan";
import { Advanced, useVerbo } from "./fields";
import { ApplicatoScelto, ElencoApplicati, boxId, useApplicati } from "./applicati";

const PT_PER_CM = 72 / 2.54;

interface Pending { asset: string; url: string; name: string; w: number; h: number }

/** Immagini senza "Applica" (dalla 1.6.0): l'immagine scelta va sul foglio dove si tocca la pagina e resta selezionata
 *  (si sposta e si ridimensiona come firme e timbri); quelle che c'erano già nel PDF si tolgono subito. */
export function ImagesPanel({ def, onClose }: { def: ToolDef; onClose: () => void }) {
  const app = useApp();
  const verb = useVerbo();
  const [esistenti, setEsistenti] = useState<PageObject[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  // impostazioni della prossima immagine
  const [opacity, setOpacity] = useState(1);
  const [allPages, setAllPages] = useState(false);
  const [behind, setBehind] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const docId = app.doc?.id;
  // immagini inserite con PDFz (oggetti applicati): si spostano, si ridimensionano e si eliminano
  const ap = useApplicati(["immagine"]);
  const scelto = ap.scelto(selectedId);
  const elimina = async (v: { page?: number; id: string }[]) => { if (await ap.elimina(v)) setSelectedId(null); };
  const esistente = esistenti.find((o) => o.id === selectedId) || null;

  // immagini che c'erano già nel PDF: si toccano per toglierle
  useEffect(() => {
    setEsistenti([]);
    if (!docId) return;
    let vivo = true;
    api.tool("list_images", { doc: docId }).then((r) => {
      if (!vivo) return;   // risposta di una versione già superata
      setEsistenti(r.data.images.map((im: any, i: number) => ({
        id: `x${i}`, page: im.page, kind: "box", locked: true, label: "Immagine del PDF",
        rect: { x: im.bbox[0], y: im.bbox[1], w: im.bbox[2] - im.bbox[0], h: im.bbox[3] - im.bbox[1] },
        meta: { xref: im.xref },
      } as PageObject)));
    }).catch(() => {});
    return () => { vivo = false; };
  }, [docId]);
  useEffect(() => { if (ap.daSelezionare) { setSelectedId(ap.daSelezionare); ap.selezionata(); } }, [ap.daSelezionare]); // eslint-disable-line react-hooks/exhaustive-deps

  const togliEsistente = async (o: PageObject) => {
    setSelectedId(null);
    await app.run("images", { remove: [{ page: o.page, xref: o.meta.xref, rect: o.rect }] });
  };
  const togliTutte = async () => {
    const n = esistenti.length;
    const c = await app.ask("Togliere tutte le immagini?", <>Le <b>{n}</b> immagini che c'erano nel documento verranno tolte da tutte le pagine. Puoi tornare indietro con Annulla.</>,
      [{ label: "Annulla", value: "cancel" }, { label: "Togli tutte", value: "ok", kind: "danger" }]);
    if (c === "ok") app.run("images", { remove_all: true });
  };
  const remove = (id: string) => {
    const a = ap.scelto(id);
    if (a) { elimina([{ page: a.page, id: a.id }]); return; }
    const o = esistenti.find((x) => x.id === id);
    if (o) togliEsistente(o);
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

  const place = async (page: number, pt: { x: number; y: number }) => {
    if (!pending) { setSelectedId(null); return; }
    const size = app.sizes[page];
    // dimensioni originali (96 DPI), ridotte solo se più grandi della pagina
    let w = pending.w * 0.75, h = pending.h * 0.75;
    const k = Math.min(1, (size.w * 0.95) / w, (size.h * 0.95) / h);
    w *= k; h *= k;
    const rect = { x: Math.min(Math.max(pt.x - w / 2, 0), size.w - w), y: Math.min(Math.max(pt.y - h / 2, 0), size.h - h), w, h };
    const res = await app.run("images", { items: [{
      image: pending.asset, page, rect, opacity, keep_proportion: true, all_pages: allPages, behind, name: pending.name,
    }] }, { silent: true });
    if (res) { setPending(null); ap.aspetta(page, rect); }
  };

  const placeE = useEvent(place);
  const removeE = useEvent(remove);
  const patchE = useEvent((id: string, p: Partial<PageObject>) => { ap.cambia(id, p); });
  const dropE = useEvent((id: string) => { ap.lascia(id); });
  useEffect(() => {
    app.setInteraction({
      mode: "objects", objects: [...esistenti, ...ap.boxes], selectedId, onSelect: setSelectedId, onObjectChange: patchE,
      onObjectDelete: removeE, onObjectDrop: dropE, onPlace: placeE,
      placeHint: pending ? `${verb} la pagina dove vuoi l'immagine` : undefined,
    });
  }, [esistenti, ap.boxes, selectedId, pending, verb]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => app.setInteraction({ mode: "none" }), []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <PanelShell def={def} onClose={onClose}>
      <div className="btn-row">
        <button className="btn" onClick={() => fileRef.current?.click()}><ImagePlus size={15} /> Scegli un'immagine…</button>
        <CameraButton onPhoto={pick} title="Scatta una foto e inseriscila nel documento" />
      </div>
      <input ref={fileRef} type="file" hidden accept="image/*" onChange={(e) => { const f = e.target.files?.[0]; if (f) pick(f); e.target.value = ""; }} />
      {pending && (
        <div className="note ok" style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <img src={pending.url} style={{ width: 40, height: 40, objectFit: "contain", background: "#fff" }} />
          <div>{verb} la pagina dove vuoi <b>{pending.name}</b>: va subito sul foglio, poi la sposti e la ridimensioni.</div>
        </div>
      )}
      {scelto && <ApplicatoScelto a={scelto} tutti={ap.items} onElimina={elimina} />}
      {esistente && (
        <>
          <div className="section-title">Immagine del documento</div>
          <div className="hint">Pagina {esistente.page + 1} · {Math.round(esistente.rect.w / PT_PER_CM * 10) / 10}×{Math.round(esistente.rect.h / PT_PER_CM * 10) / 10} cm</div>
          <button className="btn small danger" style={{ alignSelf: "flex-start" }} onClick={() => togliEsistente(esistente)}><Trash2 size={13} /> Togli l'immagine</button>
        </>
      )}
      {!pending && !scelto && !esistente && (esistenti.length > 0 || ap.items.length > 0) && (
        <div className="hint">{verb} un'immagine sulla pagina per spostarla o toglierla.</div>
      )}
      <Advanced>
        <div className="field">
          <label>Opacità della prossima immagine · {Math.round(opacity * 100)}%</label>
          <input type="range" min={0.1} max={1} step={0.05} value={opacity} onChange={(e) => setOpacity(Number(e.target.value))} />
        </div>
        <label className="check"><input type="checkbox" checked={allPages} onChange={(e) => setAllPages(e.target.checked)} /> Mettila su tutte le pagine</label>
        <label className="check"><input type="checkbox" checked={behind} onChange={(e) => setBehind(e.target.checked)} /> Mettila dietro al testo</label>
        <ElencoApplicati titolo="Immagini inserite" items={ap.items} onElimina={elimina}
          onVai={(a) => { app.gotoPage(a.page); if (a.rect) setSelectedId(boxId(a)); }} />
        <div className="section-title">Immagini che c'erano nel documento ({esistenti.length})</div>
        {esistenti.length
          ? <button className="btn small" style={{ alignSelf: "flex-start" }} onClick={togliTutte}><Trash2 size={13} /> Togli tutte</button>
          : <div className="hint">Nessuna.</div>}
      </Advanced>
    </PanelShell>
  );
}
