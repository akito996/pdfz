import { useEffect, useMemo, useRef, useState } from "react";
import { Eraser, MousePointerClick, Trash2, Upload } from "lucide-react";
import { api } from "../api";
import { useEvent, useStored } from "../hooks";
import { transparentSignature } from "../imageTools";
import { useApp, usePending } from "../context";
import type { ToolDef } from "../tools";
import type { PageObject } from "../types";
import { PanelShell } from "./ToolPanel";
import { CameraButton } from "../components/PhotoScan";
import { recentTexts, rememberTexts } from "../textHistory";
import { Advanced, FileInput, FontSelect, Seg, type AssetValue } from "./fields";

type SigKind = "draw" | "image" | "text" | "cert";
const SCRIPT_HINTS = ["script", "handwriting", "brush", "ink free", "signature", "segoe print", "mistral", "freestyle", "kunstler", "vivaldi", "edwardian", "dancing", "pacifico", "great vibes"];
const IMAGE_SLOTS = ["1", "2", "3"];
const CM = 72 / 2.54;
let seq = 0;

function imageSize(url: string): Promise<{ w: number; h: number }> {
  return new Promise((res) => {
    const im = new Image();
    im.onload = () => res({ w: im.naturalWidth, h: im.naturalHeight });
    im.onerror = () => res({ w: 300, h: 100 });
    im.src = url;
  });
}
function fileToDataUrl(f: File): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = () => rej(new Error("File non leggibile"));
    r.readAsDataURL(f);
  });
}

export function SignPanel({ def, onClose }: { def: ToolDef; onClose: () => void }) {
  const app = useApp();
  const [kind, setKind] = useState<SigKind>("draw");
  const [slots, setSlots] = useState<Record<string, string | null>>({});
  const [slot, setSlot] = useState<string>("1");
  const [clearBg, setClearBg] = useStored("hdpdf.firmaSfondoTrasparente", true);
  const [placing, setPlacing] = useState(true);
  const [objects, setObjects] = useState<PageObject[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [text, setText] = useState("");
  const scriptFont = useMemo(() => app.fonts.find((f) => SCRIPT_HINTS.some((h) => f.name.toLowerCase().includes(h)))?.id || "tiit", [app.fonts]);
  const [font, setFont] = useState("");
  const [textSize, setTextSize] = useState(26);
  const [color, setColor] = useState("#1d3a8a");
  const [caption, setCaption] = useState(false);
  // certificato
  const [cert, setCert] = useState<AssetValue | null>(null);
  const [certPw, setCertPw] = useState("");
  const [visible, setVisible] = useState(true);
  const [reason, setReason] = useState("");
  const [place, setPlace] = useState("");
  const [tsa, setTsa] = useState("");
  const [certify, setCertify] = useState(false);
  const slotFile = useRef<HTMLInputElement>(null);
  const slotTarget = useRef("1");

  const fontId = font || scriptFont;
  const isCert = kind === "cert";
  const docId = app.doc?.id;
  useEffect(() => { setObjects([]); setSelectedId(null); }, [docId]);

  useEffect(() => {
    api.signatures().then((l) => {
      const m: Record<string, string | null> = {};
      l.forEach((s) => (m[s.slot] = s.data));
      setSlots(m);
      const firstFilled = IMAGE_SLOTS.find((s) => m[s]);
      if (firstFilled) setSlot(firstFilled);
    }).catch(() => {});
  }, []);

  const saveSlot = async (s: string, data: string | null) => {
    setSlots((m) => ({ ...m, [s]: data }));
    try {
      if (data) await api.saveSignature(s, data);
      else await api.deleteSignature(s);
    } catch (e: any) {
      app.toast(e.message, "err");
    }
  };

  // contenuto che verrà posizionato con il prossimo clic
  const source = (): { url?: string; key: string } | null => {
    if (kind === "draw") return slots["disegnata"] ? { url: slots["disegnata"]!, key: "disegnata" } : null;
    if (kind === "image") return slots[slot] ? { url: slots[slot]!, key: slot } : null;
    if (kind === "text") return text.trim() ? { key: "text" } : null;
    return null;
  };

  const measureText = (t: string, size: number) => {
    const c = document.createElement("canvas").getContext("2d")!;
    const st = app.fontStyle(fontId);
    c.font = `${st.fontStyle || "normal"} ${st.fontWeight || 400} ${size}px ${st.fontFamily}`;
    return c.measureText(t).width;
  };

  const onPlace = async (page: number, pt: { x: number; y: number }) => {
    if (selectedId && !placing) { setSelectedId(null); return; }
    const size = app.sizes[page];
    const fit = (w: number, h: number) => {
      const x = Math.min(Math.max(pt.x - w / 2, 0), Math.max(size.w - w, 0));
      const y = Math.min(Math.max(pt.y - h / 2, 0), Math.max(size.h - h, 0));
      return { x, y, w, h };
    };
    if (isCert) {
      if (!visible) return;
      const o: PageObject = { id: "cert", page, kind: "box", label: "Firma digitale", rect: fit(200, 64), meta: { cert: true } };
      setObjects([o]);
      setSelectedId(o.id);
      return;
    }
    const src = source();
    if (!src) { app.toast(kind === "text" ? "Scrivi prima il nome." : "Prepara prima la firma (disegnala o carica un'immagine).", "info"); return; }
    let o: PageObject;
    if (kind === "text") {
      const w = measureText(text, textSize) + 8;
      o = { id: `s${seq++}`, page, kind: "text", text, fontId, size: textSize, color, align: "center", keepRatio: true,
        rect: fit(w, textSize * 1.35), meta: { type: "text", natW: w, natH: textSize * 1.35, baseSize: textSize } };
    } else {
      const dims = await imageSize(src.url!);
      // dimensione naturale della firma: larghezza 4,5 cm proporzionata, mai più di metà pagina
      const w = Math.min(4.5 * CM, size.w * 0.5);
      const h = w * dims.h / dims.w;
      o = { id: `s${seq++}`, page, kind: "image", imageUrl: src.url, keepRatio: true, rect: fit(w, h),
        meta: { type: kind === "draw" ? "draw" : "image", key: src.key, natW: w, natH: h } };
    }
    setObjects((l) => [...l.filter((x) => !x.meta?.cert), o]);
    setSelectedId(o.id);
  };

  // le firme di testo si ridimensionano come un'immagine: il corpo segue la larghezza
  const patchObj = (id: string, p: Partial<PageObject>) => setObjects((l) => l.map((x) => {
    if (x.id !== id) return x;
    const n = { ...x, ...p };
    if (x.meta?.type === "text" && p.rect && !p.size) n.size = x.meta.baseSize * p.rect.w / x.meta.natW;
    return n;
  }));
  const removeObj = (id: string) => { setObjects((l) => l.filter((o) => o.id !== id)); setSelectedId(null); };

  const patchObjE = useEvent(patchObj);
  const removeObjE = useEvent(removeObj);
  const onPlaceE = useEvent(onPlace);
  const deselectE = useEvent(() => setSelectedId(null));
  useEffect(() => {
    app.setInteraction({
      mode: "objects", objects, selectedId, onSelect: setSelectedId, onObjectChange: patchObjE, onObjectDelete: removeObjE,
      onPlace: placing ? onPlaceE : deselectE,
      placeHint: placing ? "Clicca dove inserire la firma" : undefined, fontStyle: app.fontStyle,
    });
  }, [objects, selectedId, placing, app.fontStyle]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => app.setInteraction({ mode: "none" }), []); // eslint-disable-line react-hooks/exhaustive-deps

  const sel = objects.find((o) => o.id === selectedId) || null;
  const scalePct = sel ? Math.round((sel.rect.w / (sel.meta.natW || sel.rect.w)) * 100) : 100;
  const setScale = (pct: number) => {
    if (!sel || !(pct > 0)) return;
    const w = (sel.meta.natW || sel.rect.w) * pct / 100;
    const h = (sel.meta.natH || sel.rect.h) * pct / 100;
    const cx = sel.rect.x + sel.rect.w / 2, cy = sel.rect.y + sel.rect.h / 2;
    const patch: Partial<PageObject> = { rect: { x: cx - w / 2, y: cy - h / 2, w, h } };
    patchObj(sel.id, patch);
  };
  const setWidthCm = (cm: number) => sel && cm > 0 && setScale((cm * CM / (sel.meta.natW || sel.rect.w)) * 100);

  const placed = objects.filter((o) => !o.meta?.cert);
  const certBox = objects.find((o) => o.meta?.cert);

  const apply = async () => {
    if (isCert) {
      if (!cert) { app.toast("Scegli prima il certificato (.pfx / .p12).", "info"); return false; }
      const res = await app.run("sign_cert", {
        certificate: cert.id, cert_password: certPw, visible, page: certBox?.page ?? 0, rect: certBox?.rect,
        reason, location: place, tsa_url: tsa || undefined, certify,
      });
      if (res) { setObjects([]); app.toast("Salva ora il documento: ogni ulteriore modifica invaliderebbe la firma.", "info"); }
      return !!res;
    }
    const assets: Record<string, string> = {};
    const items = [];
    try {
      for (const o of placed) {
        const it: any = { page: o.page, rect: o.rect, caption, all_pages: !!o.meta.allPages };
        if (o.kind === "text") Object.assign(it, { type: "text", text: o.text, font: o.fontId, size: o.size, color: o.color });
        else {
          if (!assets[o.meta.key]) assets[o.meta.key] = (await api.dataUrl(o.imageUrl!, "firma.png")).id;
          Object.assign(it, { type: o.meta.type, image: assets[o.meta.key] });
        }
        items.push(it);
      }
    } catch (e: any) {
      app.toast(e.message || String(e), "err");
      return false;
    }
    const res = await app.run("sign_visual", { items });
    if (res && kind === "text") rememberTexts([text]);
    if (res) { setObjects([]); setSelectedId(null); }
    return !!res;
  };
  // in sospeso solo le firme già messe sulla pagina (per il certificato: il riquadro della firma visibile)
  usePending(isCert ? !!certBox : placed.length > 0, def.label, apply);

  const ready = isCert ? !!cert && (!visible || !!certBox) : placed.length > 0;
  // immagine (o foto) della firma: sfondo reso trasparente se richiesto, poi salvata nella casella scelta
  const loadSlot = async (f: File) => {
    let data = await fileToDataUrl(f);
    if (clearBg) {
      try { data = await transparentSignature(data); } catch (err: any) { app.toast(err.message, "err"); return; }
    }
    await saveSlot(slotTarget.current, data);
    setSlot(slotTarget.current);
  };

  return (
    <PanelShell def={def} onClose={onClose}
      footer={<button className="btn primary block" disabled={!ready} onClick={apply}>
        {isCert ? "Firma digitalmente" : `Applica ${placed.length > 1 ? `${placed.length} firme` : "firma"}`}
      </button>}>
      <Seg value={kind} onChange={(v) => { setKind(v as SigKind); setPlacing(true); }} options={[
        { value: "draw", label: "Disegna" }, { value: "image", label: "Immagine" }, { value: "text", label: "Testo" }, { value: "cert", label: "Certificato" },
      ]} />

      {kind === "draw" && (
        <>
          <SignaturePad color={color} value={slots["disegnata"] || null} onChange={(d) => saveSlot("disegnata", d)} />
          <div className="row" style={{ justifyContent: "flex-start" }}>
            <span className="label" style={{ flex: "none" }}>Colore</span>
            <input type="color" className="color" value={color} onChange={(e) => setColor(e.target.value)} />
            <div style={{ flex: 1 }} />
            <button className="btn small" onClick={() => saveSlot("disegnata", null)}><Eraser size={14} /> Cancella</button>
          </div>
        </>
      )}

      {kind === "image" && (
        <div className="field">
          <label>Firme salvate</label>
          <div className="sig-slots">
            {IMAGE_SLOTS.map((s) => (
              <div key={s} className={`sig-row ${slot === s && slots[s] ? "on" : ""}`}>
                <div className={`sig-slot ${slots[s] ? "" : "empty"}`} onClick={() => slots[s] && setSlot(s)}
                  title={slots[s] ? `Usa la firma ${s}` : undefined}>
                  {slots[s] ? <img src={slots[s]!} alt={`Firma ${s}`} /> : <span>Firma {s} · vuota</span>}
                </div>
                {slots[s] ? (
                  <button className="btn small danger sig-act" title={`Rimuovi la firma ${s}`}
                    onClick={() => saveSlot(s, null)}><Trash2 size={14} /> Rimuovi</button>
                ) : (
                  <div className="sig-act btn-row" style={{ flexWrap: "nowrap" }}>
                    <button className="btn small primary" title={`Carica un'immagine nella firma ${s}`}
                      onClick={() => { slotTarget.current = s; slotFile.current?.click(); }}><Upload size={14} /> Carica</button>
                    {/* app Android: fotografa la firma fatta a penna su un foglio bianco */}
                    <CameraButton className="btn small" label="" title={`Fotografa la firma su carta (firma ${s})`}
                      onPhoto={(f) => { slotTarget.current = s; return loadSlot(f); }} />
                  </div>
                )}
              </div>
            ))}
          </div>
          <input ref={slotFile} type="file" hidden accept="image/png,image/jpeg,image/*"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) loadSlot(f);
            }} />
        </div>
      )}

      {kind === "text" && (
        <>
          <div className="field">
            <label>Nome e cognome</label>
            <input className="input" value={text} onChange={(e) => setText(e.target.value)} placeholder="Mario Rossi" list="recenti-firma" autoComplete="off" />
            <datalist id="recenti-firma">{recentTexts().slice(0, 30).map((t) => <option key={t} value={t} />)}</datalist>
          </div>
          <div className="sig-preview" style={{ ...app.fontStyle(fontId), fontSize: 28, color }}>{text || "Anteprima"}</div>
        </>
      )}

      {isCert && (
        <>
          <div className="field">
            <label>Certificato (.pfx / .p12) *</label>
            <FileInput value={cert} onChange={setCert} accept=".pfx,.p12,application/x-pkcs12" />
          </div>
          <div className="field">
            <label>Password del certificato</label>
            <input className="input" type="password" value={certPw} onChange={(e) => setCertPw(e.target.value)} />
          </div>
          <div className="note warn">La firma digitale deve essere l'ultima operazione: dopo aver firmato salva il file senza altre modifiche.</div>
        </>
      )}

      {(!isCert || visible) && (
        <div className="field">
          <button className={`btn ${placing ? "primary" : ""}`} onClick={() => setPlacing((p) => !p)}>
            <MousePointerClick size={15} /> {placing ? "Disegna sulla pagina… (attivo)" : "Disegna sulla pagina"}
          </button>
          <div className="hint">{placing ? "Clicca sulla pagina: la firma viene inserita alla sua dimensione, poi puoi spostarla e ridimensionarla dagli angoli." : "Attiva per inserire la firma con un clic."}</div>
        </div>
      )}

      {sel && !sel.meta?.cert && (
        <>
          <div className="section-title">Firma selezionata</div>
          <button className="btn small danger" style={{ alignSelf: "flex-start" }} onClick={() => removeObj(sel.id)}><Trash2 size={13} /> Rimuovi firma</button>
        </>
      )}
      <Advanced>
        {kind === "draw" && (
          <div className="hint">Firma con mouse, penna o touch. L'ultima firma disegnata resta salvata su questo PC.</div>
        )}
        {kind === "image" && (
          <>
            <label className="check"><input type="checkbox" checked={clearBg} onChange={(e) => setClearBg(e.target.checked)} /> Rendi trasparente lo sfondo (consigliato per foto e scansioni)</label>
            <div className="hint">Fino a 3 firme restano salvate su questo PC. Clicca su una firma per sceglierla, poi clicca sulla pagina. Per cambiarla: Rimuovi e poi Carica. Lo sfondo bianco viene tolto e l'immagine ritagliata sul tratto.</div>
          </>
        )}
        {kind === "text" && (
          <>
            <div className="field">
              <label>Carattere</label>
              <FontSelect value={fontId} onChange={setFont} />
            </div>
            <div className="row">
              <div className="field"><label>Dimensione</label><input className="input" type="number" min={6} max={120} value={textSize} onChange={(e) => setTextSize(Number(e.target.value) || 26)} /></div>
              <div className="field" style={{ flex: "none" }}><label>Colore</label><input type="color" className="color" value={color} onChange={(e) => setColor(e.target.value)} /></div>
            </div>
          </>
        )}
        {isCert && (
          <>
            <label className="check"><input type="checkbox" checked={visible} onChange={(e) => { setVisible(e.target.checked); if (!e.target.checked) setObjects([]); }} /> Firma visibile sulla pagina</label>
            <div className="field"><label>Motivo</label><input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="es. Approvazione" /></div>
            <div className="field"><label>Luogo</label><input className="input" value={place} onChange={(e) => setPlace(e.target.value)} placeholder="es. Milano" /></div>
            <div className="field">
              <label>Server marca temporale (facoltativo)</label>
              <input className="input" value={tsa} onChange={(e) => setTsa(e.target.value)} placeholder="https://…" />
            </div>
            <label className="check"><input type="checkbox" checked={certify} onChange={(e) => setCertify(e.target.checked)} /> Certifica il documento (blocca le modifiche successive)</label>
          </>
        )}
        {sel && !sel.meta?.cert && (
          <>
            <div className="row" style={{ alignItems: "flex-end" }}>
              <div className="field"><label>Larghezza (cm)</label>
                <input className="input" type="number" step={0.1} min={0.5} value={Math.round(sel.rect.w / CM * 10) / 10} onChange={(e) => setWidthCm(Number(e.target.value))} /></div>
              <div className="field"><label>Scala (%)</label>
                <input className="input" type="number" step={5} min={10} max={500} value={scalePct} onChange={(e) => setScale(Number(e.target.value))} /></div>
            </div>
            <input type="range" min={20} max={300} step={5} value={scalePct} onChange={(e) => setScale(Number(e.target.value))} />
            <label className="check"><input type="checkbox" checked={!!sel.meta.allPages} onChange={(e) => patchObj(sel.id, { meta: { ...sel.meta, allPages: e.target.checked } })} /> Ripeti su tutte le pagine (sigla)</label>
          </>
        )}
        {!isCert && (
          <label className="check"><input type="checkbox" checked={caption} onChange={(e) => setCaption(e.target.checked)} /> Aggiungi data e ora sotto le firme</label>
        )}
      </Advanced>
    </PanelShell>
  );
}

function SignaturePad({ value, onChange, color }: { value: string | null; onChange: (d: string | null) => void; color: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const dirty = useRef(false);

  useEffect(() => {
    const c = ref.current!;
    const dpr = window.devicePixelRatio || 1;
    c.width = c.clientWidth * dpr;
    c.height = c.clientHeight * dpr;
    const ctx = c.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, c.width, c.height);
    if (value && !dirty.current) {
      const img = new Image();
      img.onload = () => {
        const s = Math.min(c.clientWidth / img.width, c.clientHeight / img.height, 1);
        ctx.drawImage(img, (c.clientWidth - img.width * s) / 2, (c.clientHeight - img.height * s) / 2, img.width * s, img.height * s);
      };
      img.src = value;
    }
    dirty.current = false;
  }, [value === null]); // eslint-disable-line react-hooks/exhaustive-deps

  const pos = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  // penna (tablet): per 2 secondi dopo l'ultimo tratto di penna il palmo appoggiato sullo schermo viene ignorato
  const penAt = useRef(0);
  const ignore = (e: React.PointerEvent) => {
    if (e.pointerType === "pen") { penAt.current = Date.now(); return false; }
    return e.pointerType === "touch" && Date.now() - penAt.current < 2000;
  };
  const down = (e: React.PointerEvent) => {
    if (ignore(e)) return;
    drawing.current = true;
    last.current = pos(e);
    ref.current!.setPointerCapture(e.pointerId);
  };
  const move = (e: React.PointerEvent) => {
    if (!drawing.current || !last.current || ignore(e)) return;
    const ctx = ref.current!.getContext("2d")!;
    const p = pos(e);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.4 * (e.pressure && e.pointerType === "pen" ? 0.5 + e.pressure : 1);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(last.current.x, last.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last.current = p;
    dirty.current = true;
  };
  const up = () => {
    drawing.current = false;
    last.current = null;
    if (dirty.current) onChange(trim(ref.current!));
  };
  return <canvas ref={ref} className="pad" style={{ touchAction: "none" }} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={up} />;
}

/** Ritaglia il disegno al riquadro dei tratti, sfondo trasparente. */
function trim(c: HTMLCanvasElement): string {
  const ctx = c.getContext("2d")!;
  const { width, height } = c;
  const data = ctx.getImageData(0, 0, width, height).data;
  let x0 = width, y0 = height, x1 = 0, y1 = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] > 10) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 <= x0 || y1 <= y0) return c.toDataURL("image/png");
  const pad = 6;
  x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad);
  x1 = Math.min(width, x1 + pad); y1 = Math.min(height, y1 + pad);
  const out = document.createElement("canvas");
  out.width = x1 - x0;
  out.height = y1 - y0;
  out.getContext("2d")!.drawImage(c, x0, y0, out.width, out.height, 0, 0, out.width, out.height);
  return out.toDataURL("image/png");
}
