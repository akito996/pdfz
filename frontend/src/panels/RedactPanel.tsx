import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { api } from "../api";
import { useApp, usePending } from "../context";
import type { ToolDef } from "../tools";
import type { VRect } from "../types";
import { PanelShell } from "./ToolPanel";
import { Advanced } from "./fields";

interface Area { id: string; page: number; rect: VRect; text?: string; source: "draw" | "search" }
let seq = 0;

const PRESETS = [
  { value: "email", label: "Indirizzi email" },
  { value: "telefono", label: "Numeri di telefono" },
  { value: "codice_fiscale", label: "Codici fiscali" },
  { value: "partita_iva", label: "Partite IVA" },
  { value: "iban", label: "IBAN" },
  { value: "carta", label: "Numeri di carta" },
  { value: "data", label: "Date" },
];

export function RedactPanel({ def, onClose }: { def: ToolDef; onClose: () => void }) {
  const app = useApp();
  const [areas, setAreas] = useState<Area[]>([]);
  const [draw, setDraw] = useState(true);
  const [terms, setTerms] = useState("");
  const [regex, setRegex] = useState("");
  const [presets, setPresets] = useState<string[]>([]);
  const [caseSens, setCaseSens] = useState(false);
  const [color, setColor] = useState("#000000");
  const [effect, setEffect] = useState<"cover" | "blur_light" | "blur_heavy">("cover");
  const [label, setLabel] = useState("");
  const [meta, setMeta] = useState(true);
  const [toImage, setToImage] = useState(false);
  const [searching, setSearching] = useState(false);

  useEffect(() => { setAreas([]); }, [app.doc?.id]);

  useEffect(() => {
    app.setInteraction(draw
      ? { mode: "rect", onRect: (page, rect) => setAreas((a) => [...a, { id: `a${seq++}`, page, rect, source: "draw" }]) }
      : { mode: "none" });
  }, [draw]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const blur = effect === "blur_heavy" ? "blur(7px)" : "blur(2.5px)";
    app.setOverlays(areas.map((a) => ({
      id: a.id, page: a.page, rect: a.rect, kind: a.source === "draw" ? "fill" : "match",
      style: effect !== "cover"
        ? { background: "rgba(255,255,255,.05)", backdropFilter: blur, WebkitBackdropFilter: blur, borderColor: "#c8102e" } as any
        : a.source === "draw" ? { background: color + "cc", borderColor: color } : undefined,
      onDelete: () => setAreas((x) => x.filter((y) => y.id !== a.id)),
    })));
  }, [areas, color, effect]); // eslint-disable-line react-hooks/exhaustive-deps

  const find = async () => {
    if (!app.doc) return;
    setSearching(true);
    try {
      const res = await api.tool("redact_find", { doc: app.doc.id, params: { terms, patterns: regex, presets, case_sensitive: caseSens } });
      const found: Area[] = (res.data.matches || []).map((m: any) => ({
        id: `m${seq++}`, page: m.page, text: m.text, source: "search",
        rect: { x: m.rect[0] - 1, y: m.rect[1] - 1, w: m.rect[2] - m.rect[0] + 2, h: m.rect[3] - m.rect[1] + 2 },
      }));
      setAreas((a) => [...a.filter((x) => x.source === "draw"), ...found]);
      app.toast(found.length ? `Trovate ${found.length} occorrenze: controllale sul documento.` : "Nessuna occorrenza trovata.", found.length ? "ok" : "info");
      if (found.length) app.gotoPage(found[0].page);
    } catch (e: any) {
      app.toast(e.message, "err");
    } finally {
      setSearching(false);
    }
  };

  const apply = async () => {
    const n = areas.length;
    const c = await app.ask("Oscurare definitivamente?",
      <>Stai per oscurare <b>{n} {n === 1 ? "area" : "aree"}</b>: il contenuto sottostante verrà eliminato dal file.
        Finché non chiudi il documento puoi tornare indietro con Annulla (Ctrl+Z).</>,
      [{ label: "Annulla", value: "cancel" }, { label: n === 1 ? "Oscura 1 area" : `Oscura ${n} aree`, value: "ok", kind: "primary" }]);
    if (c !== "ok") return false;
    const res = await app.run("redact", {
      areas: areas.map((a) => ({ page: a.page, rect: a.rect })), color, label: label || undefined, effect,
      remove_metadata: meta, to_image: toImage,
    });
    if (res) setAreas([]);
    return !!res;
  };
  usePending(areas.length > 0, def.label, apply);

  const nSearch = areas.filter((a) => a.source === "search").length;
  const nDraw = areas.length - nSearch;
  return (
    <PanelShell def={def} onClose={onClose}
      footer={<button className="btn primary block" style={{ background: "#111", borderColor: "#111" }} disabled={!areas.length} onClick={apply}>Oscura {areas.length || ""} aree</button>}>
      <div className="field">
        <label>Aree manuali</label>
        <div className="btn-row">
          <button className={`btn ${draw ? "primary" : ""}`} onClick={() => setDraw((d) => !d)}>{draw ? "Disegno attivo" : "Disegna aree"}</button>
          {nDraw > 0 && <button className="btn ghost" onClick={() => setAreas((a) => a.filter((x) => x.source !== "draw"))}>Cancella ({nDraw})</button>}
        </div>
        <div className="hint">Trascina sulla pagina per coprire testo, immagini o firme. Clicca × per togliere un'area.</div>
      </div>
      <div className="section-title">Cerca e oscura</div>
      <div className="field">
        <label>Parole o frasi (una per riga)</label>
        <textarea className="input" value={terms} onChange={(e) => setTerms(e.target.value)} placeholder={"Mario Rossi\nVia Roma 1"} />
      </div>
      <button className="btn" onClick={find} disabled={searching || (!terms.trim() && !regex.trim() && !presets.length)}>
        <Search size={15} /> {searching ? "Ricerca…" : "Trova occorrenze"}
      </button>
      {nSearch > 0 && <div className="note">{nSearch} occorrenze evidenziate in rosso. Rimuovi con × quelle da non oscurare.</div>}
      <Advanced>
      <div className="field">
        <label>Dati personali</label>
        <div className="checks">
          {PRESETS.map((p) => (
            <label key={p.value} className="check">
              <input type="checkbox" checked={presets.includes(p.value)} onChange={(e) => setPresets((s) => (e.target.checked ? [...s, p.value] : s.filter((x) => x !== p.value)))} /> {p.label}
            </label>
          ))}
        </div>
      </div>
      <div className="field">
        <label>Espressioni regolari (avanzato)</label>
        <textarea className="input" style={{ minHeight: 40, fontFamily: "Consolas, monospace" }} value={regex} onChange={(e) => setRegex(e.target.value)} placeholder="es. PRAT-\d{6}" />
      </div>
      <label className="check"><input type="checkbox" checked={caseSens} onChange={(e) => setCaseSens(e.target.checked)} /> Distingui maiuscole/minuscole</label>
      <div className="section-title">Opzioni</div>
      <div className="field">
        <label>Effetto</label>
        <div className="seg">
          {([["cover", "Copri"], ["blur_light", "Sfoca leggera"], ["blur_heavy", "Sfoca forte"]] as const).map(([v, l]) => (
            <button key={v} type="button" className={effect === v ? "on" : ""} onClick={() => setEffect(v)}>{l}</button>
          ))}
        </div>
        {effect !== "cover" && <div className="hint">Il contenuto originale viene comunque eliminato dal file: al suo posto resta un'immagine sfocata{effect === "blur_light" ? " (le forme restano intuibili)" : " (illeggibile)"}.</div>}
      </div>
      {effect === "cover" && <div className="row" style={{ justifyContent: "flex-start" }}>
        <span className="label" style={{ flex: "none" }}>Colore</span>
        <input type="color" className="color" value={color} onChange={(e) => setColor(e.target.value)} />
        <input className="input" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Testo sul riquadro (es. OMISSIS)" />
      </div>}
      <label className="check"><input type="checkbox" checked={meta} onChange={(e) => setMeta(e.target.checked)} /> Rimuovi anche i metadati del documento</label>
      <label className="check"><input type="checkbox" checked={toImage} onChange={(e) => setToImage(e.target.checked)} /> Converti in immagine le pagine oscurate (massima sicurezza)</label>
      </Advanced>
    </PanelShell>
  );
}
