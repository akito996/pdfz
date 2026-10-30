import { useEffect, useMemo, useRef, useState } from "react";
import { Eraser, MousePointerClick, ShieldOff, Trash2, Upload } from "lucide-react";
import { api } from "../api";
import { useEvent, useStored } from "../hooks";
import { transparentSignature } from "../imageTools";
import { useApp } from "../context";
import type { ToolDef } from "../tools";
import type { PageObject, VRect } from "../types";
import { PanelShell } from "./ToolPanel";
import { CameraButton } from "../components/PhotoScan";
import { recentTexts, rememberTexts } from "../textHistory";
import { Advanced, FileInput, FontSelect, Seg, useMedia, type AssetValue } from "./fields";
import { ApplicatoScelto, ElencoApplicati, InVista, boxId, useApplicati, useSchedaKey } from "./applicati";

/** Firma digitale già nel documento (campo firma), da list_signatures del motore. */
interface FirmaDigitale { field: string; page: number; signed: boolean; signer: string; date: string; rect: VRect | null }
const FD = "fd:";

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
  const [tuttePagine, setTuttePagine] = useState(false);   // sigla: la prossima firma su ogni pagina
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
  const verb = useMedia("(pointer: coarse)") ? "Tocca" : "Clicca";
  // le firme posizionate e non applicate restano finché si resta nella stessa scheda (anche eliminando una firma)
  const scheda = useSchedaKey();
  useEffect(() => { setObjects([]); setSelectedId(null); }, [scheda]);

  // firme già applicate: grafiche (disegnate, immagine, testo) e digitali; si toccano sulla pagina e si eliminano
  const ap = useApplicati(["firma"]);
  const scelto = ap.scelto(selectedId);
  const elimina = async (v: { page?: number; id: string }[]) => { if (await ap.elimina(v)) setSelectedId(null); };
  const [digitali, setDigitali] = useState<FirmaDigitale[]>([]);
  useEffect(() => {
    setDigitali([]);
    if (!docId) return;
    let vivo = true;
    api.tool("list_signatures", { doc: docId }).then((r) => { if (vivo) setDigitali(r.data.signatures); }).catch(() => {});
    return () => { vivo = false; };
  }, [docId]);
  const digitale = selectedId?.startsWith(FD) ? digitali.find((f) => FD + f.field === selectedId) : undefined;
  const eliminaDigitale = async (f: FirmaDigitale) => {
    if (await app.run("remove_signature", { fields: [f.field] })) setSelectedId(null);
  };

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
    if (selectedId) { setSelectedId(null); return; }   // un tocco fuori deseleziona; il tocco dopo mette una firma nuova
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
    metti(o);
  };

  // la firma va subito sul foglio (niente "Applica") e resta selezionata: si sposta e si ridimensiona come le altre
  const caricate = useRef(new Map<string, string>());   // immagine della firma -> file già passato al motore
  const metti = async (o: PageObject) => {
    const it: any = { page: o.page, rect: o.rect, caption, all_pages: tuttePagine };
    if (o.kind === "text") Object.assign(it, { type: "text", text: o.text, font: o.fontId, size: o.size, color: o.color });
    else {
      try {
        let id = caricate.current.get(o.imageUrl!);
        if (!id) { id = (await api.dataUrl(o.imageUrl!, "firma.png")).id; caricate.current.set(o.imageUrl!, id); }
        Object.assign(it, { type: o.meta.type, image: id });
      } catch (e: any) {
        app.toast(e.message || String(e), "err");
        return;
      }
    }
    if (await app.run("sign_visual", { items: [it] }, { silent: true })) {
      if (o.kind === "text") rememberTexts([o.text!]);
      ap.aspetta(o.page, o.rect);
    }
  };

  // oggetti sulla pagina: le firme già applicate (spostamento nel motore) e il riquadro della firma digitale
  const patchObj = (id: string, p: Partial<PageObject>) => ap.cambia(id, p) || setObjects((l) => l.map((x) => (x.id === id ? { ...x, ...p } : x)));
  const removeObj = (id: string) => {
    const a = ap.scelto(id), f = id.startsWith(FD) ? digitali.find((x) => FD + x.field === id) : undefined;
    if (a) { elimina([{ page: a.page, id: a.id }]); return; }
    if (f) { eliminaDigitale(f); return; }
    setObjects((l) => l.filter((o) => o.id !== id)); setSelectedId(null);
  };

  const patchObjE = useEvent(patchObj);
  const removeObjE = useEvent(removeObj);
  const dropE = useEvent((id: string) => { ap.lascia(id); });
  const onPlaceE = useEvent(onPlace);
  const deselectE = useEvent(() => setSelectedId(null));
  useEffect(() => {
    const giaFirmate: PageObject[] = [...ap.boxes, ...digitali.filter((f) => f.rect).map((f): PageObject => ({
      id: FD + f.field, page: f.page, kind: "box", locked: true, rect: f.rect!, label: "Firma digitale",
    }))];
    app.setInteraction({
      mode: "objects", objects: [...giaFirmate, ...objects], selectedId, onSelect: setSelectedId, onObjectChange: patchObjE, onObjectDelete: removeObjE,
      onObjectDrop: dropE, onPlace: placing ? onPlaceE : deselectE,
      placeHint: placing ? (isCert ? `${verb} dove mostrare la firma digitale` : `${verb} la pagina dove vuoi la firma`) : undefined, fontStyle: app.fontStyle,
    });
  }, [objects, selectedId, placing, app.fontStyle, ap.boxes, digitali, isCert, verb]); // eslint-disable-line react-hooks/exhaustive-deps
  // la firma appena messa sul foglio resta selezionata
  useEffect(() => { if (ap.daSelezionare) { setSelectedId(ap.daSelezionare); ap.selezionata(); } }, [ap.daSelezionare]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => app.setInteraction({ mode: "none" }), []); // eslint-disable-line react-hooks/exhaustive-deps

  const certBox = objects.find((o) => o.meta?.cert);
  // la firma digitale resta un'azione da confermare: serve il certificato e deve essere l'ultima modifica
  const firmaDigitale = async () => {
    if (!cert) { app.toast("Scegli prima il certificato (.pfx / .p12).", "info"); return; }
    const res = await app.run("sign_cert", {
      certificate: cert.id, cert_password: certPw, visible, page: certBox?.page ?? 0, rect: certBox?.rect,
      reason, location: place, tsa_url: tsa || undefined, certify,
    });
    if (res) { setObjects([]); app.toast("Salva ora il documento: ogni ulteriore modifica invaliderebbe la firma.", "info"); }
  };
  const ready = !!cert && (!visible || !!certBox);
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
      footer={isCert ? <button className="btn primary block" disabled={!ready} onClick={firmaDigitale}>Firma digitalmente</button> : undefined}>
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
          <div className="hint">{placing ? `${verb} la pagina: la firma va subito sul foglio; poi la sposti trascinandola e la ridimensioni dagli angoli.` : "Attiva per inserire la firma con un tocco."}</div>
        </div>
      )}

      {scelto && <ApplicatoScelto a={scelto} tutti={ap.items} onElimina={elimina} />}
      {digitale && (
        <InVista key={digitale.field}>
          <div className="section-title">Firma digitale</div>
          <div className="hint">{digitale.signer || digitale.field} · pagina {digitale.page + 1}{digitale.date ? ` · ${new Date(digitale.date).toLocaleString("it-IT", { dateStyle: "short", timeStyle: "short" })}` : ""}</div>
          <button className="btn small danger" style={{ alignSelf: "flex-start" }} onClick={() => eliminaDigitale(digitale)}><ShieldOff size={13} /> Elimina firma digitale</button>
        </InVista>
      )}
      {!scelto && !digitale && (ap.items.length > 0 || digitali.some((f) => f.rect)) && (
        <div className="hint">{verb} una firma già applicata per spostarla o eliminarla.</div>
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
        {!isCert && (
          <>
            <label className="check"><input type="checkbox" checked={tuttePagine} onChange={(e) => setTuttePagine(e.target.checked)} /> Metti la prossima firma su tutte le pagine (sigla)</label>
            <label className="check"><input type="checkbox" checked={caption} onChange={(e) => setCaption(e.target.checked)} /> Aggiungi data e ora sotto le firme</label>
          </>
        )}
        <ElencoApplicati titolo="Firme nel documento" items={ap.items} onElimina={elimina}
          onVai={(a) => { app.gotoPage(a.page); if (a.rect) setSelectedId(boxId(a)); }} />
        {digitali.length > 0 && (
          <div className="field">
            <label>Firme digitali ({digitali.length})</label>
            <div className="list">
              {digitali.map((f) => (
                <div key={f.field} className="list-item">
                  <span className="grow" style={{ cursor: "pointer" }} title={f.signer || f.field}
                    onClick={() => { app.gotoPage(f.page); if (f.rect) setSelectedId(FD + f.field); }}>
                    {f.signer || f.field} <span style={{ color: "var(--muted)" }}>· {f.rect ? `pagina ${f.page + 1}` : "invisibile"}</span>
                  </span>
                  <button className="btn small ghost" title="Elimina firma digitale" aria-label="Elimina firma digitale"
                    onClick={() => eliminaDigitale(f)}><Trash2 size={14} color="var(--danger)" /></button>
                </div>
              ))}
            </div>
            {digitali.length > 1 && <div className="hint">Eliminando una firma digitale, le altre non risultano più valide: il file viene riscritto.</div>}
          </div>
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
