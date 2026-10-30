import { useEffect, useRef, useState } from "react";
import { Trash2 } from "lucide-react";
import { api, isLocalEngine } from "../api";
import { useApp, usePending } from "../context";
import { useEvent } from "../hooks";
import type { ToolDef } from "../tools";
import type { PageObject } from "../types";
import { PanelShell } from "./ToolPanel";
import { Advanced, FileInput, Seg, useMedia, type AssetValue } from "./fields";
import { ApplicatoScelto, ElencoApplicati, boxId, useApplicati } from "./applicati";

/**
 * Timbro come la firma (Windows e Android): scegli il timbro, clicca/tocca la pagina dove metterlo, poi lo sposti
 * e lo ridimensioni. Si possono mettere più timbri, anche su pagine diverse, e applicarli insieme.
 */
const PRESETS = [
  ["approvato", "Approvato"], ["respinto", "Respinto"], ["bozza", "Bozza"], ["ricevuto", "Ricevuto"],
  ["riservato", "Riservato"], ["copia", "Copia conforme"], ["pagato", "Pagato"], ["annullato", "Annullato"],
  ["visto", "Visto"], ["custom", "Testo personalizzato…"],
] as const;
const MM = 72 / 25.4;
let seq = 0;

export function StampPanel({ def, onClose }: { def: ToolDef; onClose: () => void }) {
  const app = useApp();
  const [kind, setKind] = useState<"text" | "image">("text");
  const [preset, setPreset] = useState("approvato");
  const [text, setText] = useState("");
  const [subtext, setSubtext] = useState("");
  const [date, setDate] = useState(true);
  const [color, setColor] = useState("");
  const [opacity, setOpacity] = useState(0.85);
  const [angle, setAngle] = useState(isLocalEngine() ? 0 : -8);   // sul computer resta l'inclinazione di prima
  const touch = useMedia("(pointer: coarse)");
  const verb = touch ? "Tocca" : "Clicca";
  const [image, setImage] = useState<(AssetValue & { w?: number; h?: number }) | null>(null);
  const [preview, setPreview] = useState<{ url: string; w: number; h: number } | null>(null);
  const [objects, setObjects] = useState<PageObject[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const sel = objects.find((o) => o.id === selectedId) || null;
  // timbri già applicati: si toccano sulla pagina e si eliminano
  const ap = useApplicati(["timbro"]);
  const scelto = ap.scelto(selectedId);
  const elimina = async (v: { page?: number; id: string }[]) => { if (await ap.elimina(v)) setSelectedId(null); };

  // anteprima del timbro di testo, generata dal motore (identica a quella che verrà applicata)
  const reqId = useRef(0);
  useEffect(() => {
    if (kind !== "text") return;
    const id = ++reqId.current;
    const t = setTimeout(() => {
      api.tool("stamp_preview", { params: { preset: preset === "custom" ? "" : preset, text: preset === "custom" ? text : "", subtext, date, color, angle } })
        .then((r: any) => { if (id === reqId.current) setPreview({ url: r.data.image, w: r.data.w, h: r.data.h }); })
        .catch(() => {});
    }, 250);
    return () => clearTimeout(t);
  }, [kind, preset, text, subtext, date, color, angle]);

  // dimensioni dell'immagine scelta (per mantenere le proporzioni)
  useEffect(() => {
    if (!image?.url || image.w) return;
    const im = new Image();
    im.onload = () => setImage((v) => (v && v.id === image.id ? { ...v, w: im.naturalWidth, h: im.naturalHeight } : v));
    im.src = image.url;
  }, [image]);

  const look = (): { url: string; w: number; h: number } | null => {
    if (kind === "text") return preview;
    if (!image?.url || !image.w || !image.h) return null;
    const w = 60 * MM;
    return { url: image.url, w, h: (w * image.h) / image.w };
  };
  // cambiando le impostazioni si aggiornano anche i timbri già posizionati
  useEffect(() => {
    const l = look();
    if (!l) return;
    setObjects((os) => os.map((o) => ({ ...o, imageUrl: l.url, opacity })));
  }, [preview, image, kind, opacity]); // eslint-disable-line react-hooks/exhaustive-deps

  const place = (page: number, pt: { x: number; y: number }) => {
    // come nella firma: con un timbro selezionato, un clic fuori lo deseleziona (non ne aggiunge un altro)
    if (selectedId) { setSelectedId(null); return; }
    const l = look();
    if (!l) { app.toast(kind === "image" ? "Scegli prima l'immagine del timbro." : "Un attimo: sto preparando il timbro.", "info"); return; }
    const size = app.sizes[page];
    const k = Math.min(1, (size.w * 0.9) / l.w, (size.h * 0.9) / l.h);
    const w = l.w * k, h = l.h * k;
    const o: PageObject = {
      id: `t${seq++}`, page, kind: "image", imageUrl: l.url, keepRatio: true, opacity,
      rect: { x: Math.min(Math.max(pt.x - w / 2, 0), size.w - w), y: Math.min(Math.max(pt.y - h / 2, 0), size.h - h), w, h },
      meta: { allPages: false },
    };
    setObjects((os) => [...os, o]);
    setSelectedId(o.id);
  };
  const patch = (id: string, p: Partial<PageObject>) => ap.cambia(id, p) || setObjects((os) => os.map((o) => (o.id === id ? { ...o, ...p } : o)));
  const remove = (id: string) => {
    const a = ap.scelto(id);
    if (a) { elimina([{ page: a.page, id: a.id }]); return; }
    setObjects((os) => os.filter((o) => o.id !== id)); setSelectedId(null);
  };

  const placeE = useEvent(place);
  const patchE = useEvent(patch);
  const removeE = useEvent(remove);
  const dropE = useEvent((id: string) => { ap.lascia(id); });
  useEffect(() => {
    app.setInteraction({
      mode: "objects", objects: [...ap.boxes, ...objects], selectedId, onSelect: setSelectedId, onObjectChange: patchE, onObjectDelete: removeE,
      onObjectDrop: dropE, onPlace: placeE, placeHint: selectedId ? undefined : `${verb} la pagina dove mettere il timbro`,
    });
  }, [objects, selectedId, verb, ap.boxes]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => app.setInteraction({ mode: "none" }), []); // eslint-disable-line react-hooks/exhaustive-deps

  const apply = async () => {
    if (kind === "image" && !image) { app.toast("Scegli l'immagine del timbro.", "info"); return false; }
    const res = await app.run("stamp", {
      type: kind, preset: preset === "custom" ? "" : preset, text: preset === "custom" ? text : "", subtext, date, color, opacity, angle,
      image: kind === "image" ? image!.id : undefined,
      items: objects.map((o) => ({ page: o.page, rect: o.rect, all_pages: !!o.meta?.allPages })),
    });
    if (res) { setObjects([]); setSelectedId(null); }
    return !!res;
  };
  usePending(objects.length > 0, def.label, apply);

  return (
    <PanelShell def={def} onClose={onClose}
      footer={<>
        <button className="btn" onClick={() => { setObjects([]); setSelectedId(null); }} disabled={!objects.length}>Scarta</button>
        <button className="btn primary" style={{ flex: 1 }} onClick={apply} disabled={!objects.length}>
          Applica {objects.length > 1 ? `${objects.length} timbri` : "timbro"}
        </button>
      </>}>
      <Seg value={kind} onChange={(v) => setKind(v as "text" | "image")} options={[{ value: "text", label: "Testo" }, { value: "image", label: "Immagine" }]} />
      {kind === "text" ? (
        <>
          <div className="field">
            <label>Modello</label>
            <select className="input" value={preset} onChange={(e) => setPreset(e.target.value)}>
              {PRESETS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          {preset === "custom" && (
            <div className="field"><label>Testo del timbro</label>
              <input className="input" value={text} onChange={(e) => setText(e.target.value)} placeholder="es. VERIFICATO" /></div>
          )}
          {preview && <img className="stamp-prev" src={preview.url} alt="Anteprima del timbro" />}
        </>
      ) : (
        <div className="field"><label>Immagine del timbro</label>
          <FileInput value={image} onChange={setImage} accept="image/*" /></div>
      )}
      <div className="hint">{verb} la pagina dove mettere il timbro, poi trascinalo o allargalo dagli angoli. Puoi metterne più di uno, anche su pagine diverse.</div>
      {sel && <button className="btn small danger" style={{ alignSelf: "flex-start" }} onClick={() => remove(sel.id)}><Trash2 size={13} /> Togli questo timbro</button>}
      {scelto ? <ApplicatoScelto a={scelto} tutti={ap.items} onElimina={elimina} />
        : ap.items.length > 0 && <div className="hint">{verb} un timbro già applicato per spostarlo o eliminarlo.</div>}
      <Advanced>
        {kind === "text" && (
          <>
            <div className="field"><label>Righe aggiuntive</label>
              <textarea className="input" value={subtext} onChange={(e) => setSubtext(e.target.value)} placeholder="es. Ufficio Acquisti" /></div>
            <label className="check"><input type="checkbox" checked={date} onChange={(e) => setDate(e.target.checked)} /> Aggiungi la data di oggi</label>
            <div className="row" style={{ justifyContent: "flex-start" }}>
              <span className="label" style={{ flex: "none" }}>Colore</span>
              <input type="color" className="color" value={color || "#1a7f37"} onChange={(e) => setColor(e.target.value)} />
              {color && <button className="btn small ghost" onClick={() => setColor("")}>Colore del modello</button>}
            </div>
            <div className="field"><label>Inclinazione · {angle}°</label>
              <input type="range" min={-30} max={30} step={1} value={angle} onChange={(e) => setAngle(Number(e.target.value))} /></div>
          </>
        )}
        <div className="field"><label>Opacità · {Math.round(opacity * 100)}%</label>
          <input type="range" min={0.2} max={1} step={0.05} value={opacity} onChange={(e) => setOpacity(Number(e.target.value))} /></div>
        {sel && (
          <label className="check"><input type="checkbox" checked={!!sel.meta?.allPages}
            onChange={(e) => patch(sel.id, { meta: { ...sel.meta, allPages: e.target.checked } })} /> Ripeti questo timbro su tutte le pagine</label>
        )}
        <ElencoApplicati titolo="Timbri nel documento" items={ap.items} onElimina={elimina}
          onVai={(a) => { app.gotoPage(a.page); if (a.rect) setSelectedId(boxId(a)); }} />
      </Advanced>
    </PanelShell>
  );
}
