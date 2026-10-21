import { Suspense, lazy, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, PanelRightClose, PanelRightOpen, X } from "lucide-react";
import { useApp, usePending } from "../context";
import { useEvent } from "../hooks";
import type { Field, ToolDef } from "../tools";
import type { Overlay } from "../types";
import { Advanced, FieldView, Seg, useIsMobile } from "./fields";
import { rememberTexts } from "../textHistory";
import { PageGrid, SelectionTools, formatPages, initialCards, parsePagesSpec } from "../components/PageGrid";
// pannelli caricati solo quando si apre lo strumento: l'app parte più in fretta (soprattutto su Android)
type PanelProps = { def: ToolDef; onClose: () => void };
const lazyPanel = (load: () => Promise<any>, name: string) =>
  lazy(() => load().then((m) => ({ default: m[name] as React.ComponentType<PanelProps> })));
const AddTextPanel = lazyPanel(() => import("./TextPanels"), "AddTextPanel");
const EditTextPanel = lazyPanel(() => import("./TextPanels"), "EditTextPanel");
const ImagesPanel = lazyPanel(() => import("./ImagesPanel"), "ImagesPanel");
const OrganizePanel = lazyPanel(() => import("./OrganizePanel"), "OrganizePanel");
const MergePanel = lazyPanel(() => import("./MultiPanels"), "MergePanel");
const ComparePanel = lazyPanel(() => import("./MultiPanels"), "ComparePanel");
const CreatePdfPanel = lazyPanel(() => import("./MultiPanels"), "CreatePdfPanel");
const SignPanel = lazyPanel(() => import("./SignPanel"), "SignPanel");
const RedactPanel = lazyPanel(() => import("./RedactPanel"), "RedactPanel");
const InfoPanel = lazyPanel(() => import("./InfoPanels"), "InfoPanel");
const ValidatePanel = lazyPanel(() => import("./InfoPanels"), "ValidatePanel");
const PropertiesPanel = lazyPanel(() => import("./RevisionPanels"), "PropertiesPanel");
const TocPanel = lazyPanel(() => import("./RevisionPanels"), "TocPanel");
const P7mPanel = lazyPanel(() => import("./P7mPanel"), "P7mPanel");
const ShapesPanel = lazyPanel(() => import("./ShapesPanel"), "ShapesPanel");
const CommentsPanel = lazyPanel(() => import("./CommentsPanel"), "CommentsPanel");
const PasswordInfoPanel = lazyPanel(() => import("./PasswordInfoPanel"), "PasswordInfoPanel");
const StampPanel = lazyPanel(() => import("./StampPanel"), "StampPanel");
import { isLocalEngine } from "../api";
import { ErrorBoundary } from "../components/ErrorBoundary";

export function PanelShell({ def, onClose, children, footer }: { def: ToolDef; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode }) {
  const Icon = def.icon;
  const { panelLayout: L } = useApp();
  const mobile = useIsMobile();
  // telefono: l'altezza del pannello serve alla barra pagina/zoom/ricerca, che gli sta appoggiata sopra
  const box = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = box.current, root = document.documentElement;
    if (!mobile || !el) return;
    const ro = new ResizeObserver(() => root.style.setProperty("--sheet-h", `${Math.round(el.getBoundingClientRect().height)}px`));
    ro.observe(el);
    return () => { ro.disconnect(); root.style.setProperty("--sheet-h", "0px"); };
  }, [mobile]);
  const startResize = (e: React.PointerEvent) => {
    e.preventDefault();
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    document.body.classList.add("resizing");
    const move = (ev: PointerEvent) => L.setWidth(window.innerWidth - ev.clientX);
    const up = () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      document.body.classList.remove("resizing");
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
  };
  return (
    <aside ref={box} className={`panel ${L.collapsed && !mobile ? "collapsed" : ""} ${mobile && L.sheetDown ? "sheet-down" : ""}`} aria-label={def.label}>
      {!L.collapsed && !mobile && (
        <div className="panel-resize" role="separator" aria-orientation="vertical" aria-label="Ridimensiona il pannello"
          title="Trascina per allargare o restringere · doppio clic per la larghezza normale"
          onPointerDown={startResize} onDoubleClick={() => L.setWidth(340)} />
      )}
      {L.collapsed && !mobile ? (
        <div className="panel-rail">
          <button className="btn icon ghost" title="Espandi il pannello" aria-label="Espandi il pannello" onClick={() => L.setCollapsed(false)}><PanelRightOpen size={17} /></button>
          <span className="rail-icon" title={def.label}><Icon size={18} color="var(--brand)" /></span>
          <span className="rail-label">{def.label}</span>
          <button className="btn icon ghost" title="Chiudi" aria-label="Chiudi" onClick={onClose}><X size={16} /></button>
        </div>
      ) : null}
      {/* il contenuto resta montato anche da compresso, così le scelte non si perdono */}
      <div className="panel-main" hidden={L.collapsed && !mobile}>
        <div className="panel-head">
          <h2><Icon size={18} color="var(--brand)" /> {def.label}
            <span style={{ flex: 1 }} />
            {mobile ? (
              // telefono: freccia in giù = abbassa il pannello (lo strumento resta attivo); si riapre con la freccia su
              <button className="btn icon ghost sheet-btn" onClick={() => L.setSheetDown(true)} title="Abbassa il pannello" aria-label="Abbassa il pannello"><ChevronDown size={22} /></button>
            ) : (
              <>
                <button className="btn icon ghost small" onClick={() => L.setCollapsed(!L.collapsed)} title={L.collapsed ? "Espandi il pannello" : "Comprimi il pannello"}
                  aria-label={L.collapsed ? "Espandi il pannello" : "Comprimi il pannello"}>{L.collapsed ? <PanelRightOpen size={16} /> : <PanelRightClose size={16} />}</button>
                <button className="btn icon ghost small" onClick={onClose} title="Chiudi" aria-label="Chiudi"><X size={16} /></button>
              </>
            )}
          </h2>
          <p>{def.description}</p>
        </div>
        <div className="panel-body" onClick={(e) => {
          // telefono: le spiegazioni sono ridotte a 2 righe, un tocco le apre per intero
          const t = (e.target as HTMLElement).closest?.(".note, .hint");
          if (t && !(e.target as HTMLElement).closest("button, a, input, select, textarea, label")) t.classList.toggle("open");
        }}>{children}</div>
        {footer && <div className="panel-foot">{footer}</div>}
      </div>
    </aside>
  );
}

export function ToolPanel(props: { def: ToolDef; onClose: () => void }) {
  // un errore dentro un pannello mostra un avviso nel pannello stesso: il documento e il resto dell'app restano usabili
  return (
    <ErrorBoundary fallback={(e, reset) => (
      <PanelShell def={props.def} onClose={props.onClose}
        footer={<>
          <button className="btn" onClick={reset}>Riprova</button>
          <button className="btn primary" style={{ flex: 1 }} onClick={props.onClose}>Chiudi</button>
        </>}>
        <div className="note err"><b>Questo strumento ha avuto un problema.</b><br />{e.message || String(e)}</div>
      </PanelShell>
    )}>
      <Suspense fallback={<PanelShell def={props.def} onClose={props.onClose}><div className="row" style={{ justifyContent: "flex-start" }}><div className="spin" style={{ flex: "none" }} /> Caricamento…</div></PanelShell>}>
        <ToolPanelInner {...props} />
      </Suspense>
    </ErrorBoundary>
  );
}

function ToolPanelInner({ def, onClose }: { def: ToolDef; onClose: () => void }) {
  const props = { def, onClose };
  // app Android: timbro da posizionare con il dito, come la firma
  if (def.id === "stamp") return <StampPanel {...props} />;   // timbro come la firma (Windows e Android)
  switch (def.panel) {
    case "edit_text": return <EditTextPanel {...props} />;
    case "add_text": return <AddTextPanel {...props} />;
    case "images": return <ImagesPanel {...props} />;
    case "organize": return <OrganizePanel {...props} />;
    case "merge": return <MergePanel {...props} />;
    case "compare": return <ComparePanel {...props} />;
    case "create_pdf": return <CreatePdfPanel {...props} />;
    case "sign": return <SignPanel {...props} />;
    case "redact": return <RedactPanel {...props} />;
    case "info": return <InfoPanel {...props} />;
    case "validate": return <ValidatePanel {...props} />;
    case "properties": return <PropertiesPanel {...props} />;
    case "toc": return <TocPanel {...props} />;
    case "p7m": return <P7mPanel {...props} />;
    case "comments": return <CommentsPanel {...props} />;
    case "pwinfo": return <PasswordInfoPanel {...props} />;
    case "shapes": return <ShapesPanel key={def.id} {...props} />;
    default: return <FormPanel {...props} />;
  }
}

/** Opzione essenziale (sempre visibile) o avanzata (sul telefono finisce in "Opzioni avanzate").
 *  Regola: la prima opzione, quelle obbligatorie, i riquadri da disegnare, i file e gli avvisi;
 *  le eccezioni sono indicate in tools.ts con `advanced: false/true`. */
function essential(def: ToolDef, f: Field) {
  if (f.advanced !== undefined) return !f.advanced;
  return f.required || ["rect", "file", "files", "note"].includes(f.type) || def.fields?.[0]?.key === f.key
    || (f.type === "pages" && !!def.pageView);
}

function defaults(def: ToolDef) {
  const v: Record<string, any> = {};
  (def.fields || []).forEach((f) => { if (f.default !== undefined) v[f.key] = f.default; });
  return v;
}

/** Valori del modulo in forma confrontabile: i campi vuoti (null, "", [], casella non spuntata) valgono come non impostati. */
function snapshot(v: Record<string, any>) {
  const out: Record<string, any> = {};
  for (const k of Object.keys(v).sort()) {
    const x = v[k];
    if (x == null || x === "" || x === false || (Array.isArray(x) && !x.length)) continue;
    out[k] = x;
  }
  return JSON.stringify(out);
}

export function FormPanel({ def, onClose }: { def: ToolDef; onClose: () => void }) {
  const app = useApp();
  const [values, setValues] = useState<Record<string, any>>(() => defaults(def));
  const [rectKey, setRectKey] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const fields = (def.fields || []).filter((f) => !f.show || f.show(values));
  const set = (k: string, v: any) => setValues((s) => ({ ...s, [k]: v }));
  // valori di riferimento: quelli iniziali o gli ultimi applicati; se diversi ci sono modifiche non applicate
  const [baseline, setBaseline] = useState(() => snapshot(defaults(def)));
  const dirty = snapshot(values) !== baseline;
  // cambiando documento (scheda) le scelte restano, ma non sono più "in sospeso" per il nuovo documento
  const valuesRef = useRef(values);
  valuesRef.current = values;
  useEffect(() => { setBaseline(snapshot(valuesRef.current)); }, [app.doc?.id]);

  // vista "Pagine" (griglia di miniature con selezione multipla) per gli strumenti sulle pagine
  const [view, setView] = useState<"doc" | "grid">(def.pageView || "doc");
  const n = app.sizes.length;
  const cards = useMemo(() => initialCards(n), [n, app.doc?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const selPos = view === "grid" ? (values.pages ? parsePagesSpec(values.pages, n) : new Set<number>()) : new Set<number>();
  const setSelPos = (s: Set<number>) => set("pages", formatPages(s));
  const onGridClick = useEvent((k: string) => {
    const i = cards.findIndex((c) => c.key === k);
    const next = new Set(selPos);
    if (next.has(i)) next.delete(i); else next.add(i);
    setSelPos(next);
  });
  // solo dipendenze di dati: senza, ogni render dell'App ne provocava un altro (ciclo infinito → app bloccata)
  useEffect(() => {
    if (!def.pageView || view !== "grid" || !app.pdf) { if (def.pageView) app.setMainView(null); return; }
    app.setMainView(
      <PageGrid cards={cards} pdfs={{ "": app.pdf }} multi
        selected={new Set(cards.filter((_, i) => selPos.has(i)).map((c) => c.key))}
        previewRotate={def.id === "rotate" ? Number(values.angle) || 0 : undefined}
        onCardClick={onGridClick} />,
    );
  }, [view, cards, app.pdf, values.pages, values.angle]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { if (def.pageView) app.setMainView(null); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // attiva subito il disegno se il riquadro è obbligatorio
  useEffect(() => {
    const req = (def.fields || []).find((f) => f.type === "rect" && f.required);
    if (req) setRectKey(req.key);
  }, [def]);

  useEffect(() => {
    if (rectKey) {
      app.setInteraction({
        mode: "rect",
        onRect: (page, rect) => { set(rectKey, { page, rect }); setRectKey(null); },
      });
    } else app.setInteraction({ mode: "none" });
  }, [rectKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // anteprima delle aree scelte
  const overlays: Overlay[] = useMemo(() => {
    const out: Overlay[] = [];
    for (const f of def.fields || []) {
      const v = values[f.key];
      if (f.type !== "rect" || !v) continue;
      const o: Overlay = { id: f.key, page: v.page, rect: v.rect, kind: "box", label: f.label, onDelete: () => set(f.key, null) };
      if (values.image?.url && (def.id === "add_image" || def.id === "stamp")) { o.kind = "image"; o.imageUrl = values.image.url; }
      if (def.id === "add_text" && values.text) {
        o.kind = "text";
        o.text = values.text;
        o.fontPt = Number(values.size) || 12;
        o.style = { ...app.fontStyle(values.font), color: values.color, textAlign: values.align, opacity: values.opacity, whiteSpace: "pre-wrap" };
      }
      out.push(o);
    }
    return out;
  }, [values, def]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => app.setOverlays(overlays), [overlays]); // eslint-disable-line react-hooks/exhaustive-deps

  const missing = fields.filter((f) => f.required && (values[f.key] == null || values[f.key] === "" || (Array.isArray(values[f.key]) && !values[f.key].length)));

  const submit = async () => {
    if (missing.length) { app.toast(`Completa: ${missing.map((m) => m.label).join(", ")}`, "info"); return false; }
    const clean: Record<string, any> = {};
    for (const f of fields) {
      if (f.type === "note") continue;
      let v = values[f.key];
      if (v && typeof v === "object" && "id" in v && "name" in v && !Array.isArray(v)) v = v.id; // file
      if (Array.isArray(v) && v.length && typeof v[0] === "object" && "id" in v[0]) v = v.map((x: any) => x.id);
      clean[f.key] = v;
    }
    // i riquadri servono in forma {page, rect} a build(); altrimenti si separano
    for (const f of fields) if (f.type === "rect") clean[f.key] = values[f.key];
    let params = def.build ? def.build(clean) : clean;
    if (!def.build) {
      for (const f of fields) {
        if (f.type === "rect" && values[f.key]) { params.page = values[f.key].page; params[f.key] = values[f.key].rect; }
      }
    }
    params = JSON.parse(JSON.stringify(params));
    const res = await app.run(def.endpoint!, params);
    if (res) {
      rememberTexts(fields.filter((f) => f.type === "text" || f.type === "textarea").map((f) => values[f.key]));
      setResult(res.message || "Fatto.");
      // dopo l'inserimento si può posizionare subito un altro elemento
      const next = { ...values };
      for (const f of def.fields || []) if (f.type === "rect") next[f.key] = null;
      if (def.pageView) next.pages = "";
      setValues(next);
      setBaseline(snapshot(next));
      const req = (def.fields || []).find((f) => f.type === "rect" && f.required);
      if (req) setRectKey(req.key);
    }
    return !!res;
  };
  usePending(dirty, def.label, submit);

  const renderField = (f: Field) => (
    <FieldView key={f.key} f={f.type === "pages" && view === "grid" && def.pageView ? { ...f, type: "text", placeholder: "Nessuna selezione" } : f}
      value={values[f.key]} set={(v) => set(f.key, v)}
      rectActive={rectKey === f.key} activateRect={() => { setView("doc"); setRectKey(rectKey === f.key ? null : f.key); }} />
  );

  return (
    <PanelShell def={def} onClose={onClose}
      footer={<button className="btn primary block" onClick={submit} disabled={missing.length > 0}>{def.submitLabel || "Applica"}</button>}>
      {def.pageView && (
        <div className="field">
          <label>Vista</label>
          <Seg value={view} onChange={(v) => setView(v as any)} options={[{ value: "grid", label: "Pagine" }, { value: "doc", label: "Documento" }]} />
        </div>
      )}
      {def.pageView && view === "grid" && (
        <>
          <SelectionTools count={n} selected={selPos} onChange={setSelPos} />
          <div className="hint">Clicca sulle miniature per selezionarle.{def.fields?.some((f) => f.key === "pages" && f.required) ? "" : " Nessuna selezione = tutte le pagine."}</div>
        </>
      )}
      {fields.filter((f) => essential(def, f)).map(renderField)}
      <Advanced>{fields.filter((f) => !essential(def, f)).map(renderField)}</Advanced>
      {!fields.length && <div className="note">Nessuna opzione: premi il pulsante per procedere.</div>}
      {missing.length > 0 && <div className="hint">Completa: {missing.map((m) => m.label).join(", ")}</div>}
      {result && <div className="note ok">{result} Usa <b>Annulla</b> (Ctrl+Z) per tornare indietro.</div>}
    </PanelShell>
  );
}
