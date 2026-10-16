import { Children, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, MousePointerSquareDashed, Paperclip, Trash2, Upload } from "lucide-react";
import { api, humanSize } from "../api";
import { useApp } from "../context";
import { POSITIONS, type Field } from "../tools";
import { CameraButton } from "../components/PhotoScan";
import { recentTexts } from "../textHistory";

// --- telefono: pannello ridotto alle opzioni essenziali ---
// telefono (anche in orizzontale) e tablet in verticale: interfaccia "a cassetto" con pannello dal basso
const MOBILE_MQ = "(max-width: 760px), (max-height: 520px) and (pointer: coarse), (orientation: portrait) and (pointer: coarse) and (max-width: 1100px)";
/** Vero se lo schermo corrisponde alla media query (si aggiorna ruotando il dispositivo). */
export function useMedia(mq: string) {
  const [m, setM] = useState(() => typeof window !== "undefined" && !!window.matchMedia?.(mq).matches);
  useEffect(() => {
    const q = window.matchMedia?.(mq);
    if (!q) return;
    const on = () => setM(q.matches);
    on();
    q.addEventListener("change", on);
    return () => q.removeEventListener("change", on);
  }, [mq]);
  return m;
}

export function useIsMobile() {
  const [m, setM] = useState(() => typeof window !== "undefined" && !!window.matchMedia?.(MOBILE_MQ).matches);
  useEffect(() => {
    const q = window.matchMedia?.(MOBILE_MQ);
    if (!q) return;
    const on = () => setM(q.matches);
    q.addEventListener("change", on);
    return () => q.removeEventListener("change", on);
  }, []);
  return m;
}

/** Sul telefono raggruppa le opzioni secondarie in "Opzioni avanzate" (chiuso all'apertura dello strumento).
 *  Sul computer mostra tutto come prima. */
export function Advanced({ children, label = "Opzioni avanzate" }: { children?: React.ReactNode; label?: string }) {
  const mobile = useIsMobile();
  if (!Children.toArray(children).length) return null;
  if (!mobile) return <>{children}</>;
  return (
    <details className="adv" onToggle={(e) => {
      // aprendo il gruppo il pannello si allarga: porta le opzioni in vista
      const el = e.currentTarget;
      if (el.open) setTimeout(() => el.scrollIntoView({ block: "nearest", behavior: "smooth" }), 230);
    }}>
      <summary><span>{label}</span><ChevronDown size={16} className="adv-chev" /></summary>
      <div className="adv-body">{children}</div>
    </details>
  );
}

export interface AssetValue { id: string; name: string; url?: string; size?: number }

export function FontSelect({ value, onChange, original }: { value: string; onChange: (v: string) => void; original?: string }) {
  const { fonts, fontStyle } = useApp();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const current = fonts.find((f) => f.id === value);
  const list = useMemo(() => {
    const s = q.toLowerCase();
    return fonts.filter((f) => !s || f.name.toLowerCase().includes(s)).slice(0, 300);
  }, [fonts, q]);
  const std = list.filter((f) => f.source === "base14");
  const sys = list.filter((f) => f.source !== "base14");
  return (
    <div style={{ position: "relative" }}>
      <button type="button" className="input" style={{ textAlign: "left", cursor: "pointer", ...(value && value !== "original" ? fontStyle(value) : {}) }}
        onClick={() => setOpen((o) => !o)}>
        {value === "original" ? `Carattere originale${original ? ` (${original})` : ""}` : current ? current.name : "Scegli carattere…"}
      </button>
      {open && (
        <div style={{ position: "absolute", zIndex: 20, top: 36, left: 0, right: 0, background: "var(--panel)", border: "1px solid var(--line-strong)", borderRadius: 8, boxShadow: "var(--shadow)", maxHeight: 320, display: "flex", flexDirection: "column" }}>
          <input className="input" autoFocus placeholder="Cerca carattere…" value={q} onChange={(e) => setQ(e.target.value)} style={{ border: "none", borderBottom: "1px solid var(--line)", borderRadius: "8px 8px 0 0" }} />
          <div style={{ overflowY: "auto" }}>
            {original !== undefined && (
              <div className="tool-item" style={{ padding: "7px 10px", fontWeight: 600 }} onClick={() => { onChange("original"); setOpen(false); }}>
                Carattere originale{original ? ` (${original})` : ""}
              </div>
            )}
            {[["Standard PDF", std], ["Installati sul PC", sys]].map(([label, arr]: any) => arr.length > 0 && (
              <div key={label}>
                <div className="cat" style={{ margin: "8px 10px 2px" }}>{label}</div>
                {arr.map((f: any) => (
                  <div key={f.id} className="tool-item" style={{ ...fontStyle(f.id), fontSize: 14, padding: "5px 10px" }}
                    onClick={() => { onChange(f.id); setOpen(false); }}>
                    {f.name}
                  </div>
                ))}
              </div>
            ))}
            {!list.length && <div className="note" style={{ margin: 8 }}>Nessun carattere trovato.</div>}
          </div>
        </div>
      )}
    </div>
  );
}

export function PagesInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  const { currentPage } = useApp();
  return (
    <div className="field" style={{ gap: 6 }}>
      <input className="input" value={value || ""} onChange={(e) => onChange(e.target.value)} placeholder={placeholder || "Tutte"} />
      <div className="btn-row">
        <button type="button" className="btn small" onClick={() => onChange("")}>Tutte</button>
        <button type="button" className="btn small" onClick={() => onChange(String(currentPage + 1))}>Corrente</button>
        <button type="button" className="btn small" onClick={() => onChange("dispari")}>Dispari</button>
        <button type="button" className="btn small" onClick={() => onChange("pari")}>Pari</button>
      </div>
    </div>
  );
}

export function FileInput({ value, onChange, accept, multiple }: { value: AssetValue | AssetValue[] | null; onChange: (v: any) => void; accept?: string; multiple?: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  const { toast } = useApp();
  const [loading, setLoading] = useState(false);
  const list: AssetValue[] = Array.isArray(value) ? value : value ? [value] : [];
  const pick = async (files: File[]) => {
    setLoading(true);
    try {
      const up = await Promise.all(files.map(async (f) => {
        const r = await api.asset(f);
        return { id: r.id, name: f.name, size: f.size, url: f.type.startsWith("image/") ? URL.createObjectURL(f) : undefined };
      }));
      onChange(multiple ? [...list, ...up] : up[0]);
    } catch (e: any) {
      toast(e.message, "err");
    } finally {
      setLoading(false);
    }
  };
  return (
    <div className="field" style={{ gap: 6 }}>
      {list.length > 0 && (
        <div className="list">
          {list.map((a, i) => (
            <div key={a.id} className="list-item">
              {a.url ? <img src={a.url} style={{ width: 28, height: 28, objectFit: "contain" }} /> : <Paperclip size={15} />}
              <span className="grow">{a.name}</span>
              {a.size != null && <span style={{ color: "var(--muted)" }}>{humanSize(a.size)}</span>}
              <button type="button" className="btn icon ghost small" onClick={() => onChange(multiple ? list.filter((_, j) => j !== i) : null)}><Trash2 size={14} /></button>
            </div>
          ))}
        </div>
      )}
      {(multiple || !list.length) && (
        <div className="btn-row">
          <button type="button" className="btn" onClick={() => ref.current?.click()} disabled={loading}>
            <Upload size={15} /> {loading ? "Caricamento…" : multiple ? "Aggiungi file" : "Scegli file"}
          </button>
          {/* app Android: foto dalla fotocamera, dove il campo accetta immagini */}
          {(!accept || /image/.test(accept)) && <CameraButton onPhoto={(f) => pick([f])} disabled={loading} />}
        </div>
      )}
      <input ref={ref} type="file" hidden accept={accept} multiple={multiple}
        onChange={(e) => { pick(Array.from(e.target.files || [])); e.target.value = ""; }} />
    </div>
  );
}

export function RectPicker({ value, active, onActivate, onClear, hint }: { value: any; active: boolean; onActivate: () => void; onClear: () => void; hint?: string }) {
  return (
    <div className="field" style={{ gap: 6 }}>
      <div className="btn-row">
        <button type="button" className={`btn ${active ? "primary" : ""}`} onClick={onActivate}>
          <MousePointerSquareDashed size={15} /> {active ? "Disegna sulla pagina…" : value ? "Ridisegna" : "Disegna sulla pagina"}
        </button>
        {value && <button type="button" className="btn ghost" onClick={onClear}>Cancella</button>}
      </div>
      {value ? (
        <div className="hint">Pagina {value.page + 1} · {Math.round(value.rect.w * 0.3528)}×{Math.round(value.rect.h * 0.3528)} mm</div>
      ) : hint ? <div className="hint">{hint}</div> : null}
    </div>
  );
}

export function PositionGrid({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="row" style={{ alignItems: "flex-start" }}>
      <div className="grid9" style={{ flex: "none" }}>
        {POSITIONS.map((p) => (
          <button type="button" key={p.value} title={p.label} className={value === p.value ? "on" : ""} onClick={() => onChange(p.value)} />
        ))}
      </div>
      <span className="hint" style={{ paddingTop: 2 }}>{value}</span>
    </div>
  );
}

export function Seg({ value, options, onChange }: { value: string; options: { value: string; label: string }[]; onChange: (v: string) => void }) {
  return (
    <div className="seg">
      {options.map((o) => (
        <button type="button" key={o.value} className={String(value) === o.value ? "on" : ""} onClick={() => onChange(o.value)}>{o.label}</button>
      ))}
    </div>
  );
}

/** Rendering generico di un campo di form. */
export function FieldView({ f, value, set, rectActive, activateRect }: {
  f: Field; value: any; set: (v: any) => void; rectActive?: boolean; activateRect?: () => void;
}) {
  const { caps } = useApp();
  if (f.type === "note") return <div className={`note ${f.tone || ""}`}>{f.label}</div>;
  if (f.type === "checkbox") {
    return (
      <label className="check"><input type="checkbox" checked={!!value} onChange={(e) => set(e.target.checked)} /> {f.label}</label>
    );
  }
  let control: React.ReactNode;
  switch (f.type) {
    case "password":
      control = <input className="input" type="password" value={value ?? ""} placeholder={f.placeholder} onChange={(e) => set(e.target.value)} />;
      break;
    case "text":
      // elenco dei testi già usati: il browser li propone mentre si scrive
      control = (
        <>
          <input className="input" type="text" value={value ?? ""} placeholder={f.placeholder} onChange={(e) => set(e.target.value)} list={`recenti-${f.key}`} autoComplete="off" />
          <datalist id={`recenti-${f.key}`}>{recentTexts().slice(0, 30).map((t) => <option key={t} value={t} />)}</datalist>
        </>
      );
      break;
    case "textarea":
      control = <textarea className="input" value={value ?? ""} placeholder={f.placeholder} onChange={(e) => set(e.target.value)} />;
      break;
    case "number":
      control = (
        <div className="row">
          <input className="input" type="number" value={value ?? ""} min={f.min} max={f.max} step={f.step || "any"} onChange={(e) => set(e.target.value === "" ? "" : Number(e.target.value))} />
          {f.unit && <span style={{ flex: "none", color: "var(--muted)" }}>{f.unit}</span>}
        </div>
      );
      break;
    case "range":
      control = (
        <div className="row">
          <input type="range" min={f.min} max={f.max} step={f.step} value={value} onChange={(e) => set(Number(e.target.value))} />
          <span style={{ flex: "none", width: 40, textAlign: "right" }}>{Math.round(Number(value) * 100)}%</span>
        </div>
      );
      break;
    case "select":
      control = (
        <select className="input" value={value ?? ""} onChange={(e) => set(e.target.value)}>
          {f.options!.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      );
      break;
    case "seg":
      control = <Seg value={value} options={f.options!} onChange={set} />;
      break;
    case "color":
      control = (
        <div className="row" style={{ justifyContent: "flex-start" }}>
          <input type="color" className="color" value={value || "#000000"} onChange={(e) => set(e.target.value)} />
          <input className="input" style={{ maxWidth: 110 }} value={value || ""} placeholder="automatico" onChange={(e) => set(e.target.value)} />
        </div>
      );
      break;
    case "font":
      control = <FontSelect value={value} onChange={set} />;
      break;
    case "pages":
      control = <PagesInput value={value} onChange={set} />;
      break;
    case "file":
      control = <FileInput value={value} onChange={set} accept={f.accept} />;
      break;
    case "files":
      control = <FileInput value={value || []} onChange={set} accept={f.accept} multiple />;
      break;
    case "checks": {
      const opts = f.key === "languages" && caps
        ? caps.ocr_languages.map((l) => ({ value: l, label: LANG_NAMES[l] || l }))
        : f.options!;
      const arr: string[] = value || [];
      control = (
        <div className="checks">
          {opts.map((o) => (
            <label key={o.value} className="check">
              <input type="checkbox" checked={arr.includes(o.value)}
                onChange={(e) => set(e.target.checked ? [...arr, o.value] : arr.filter((x) => x !== o.value))} /> {o.label}
            </label>
          ))}
          {!opts.length && <div className="note warn">Nessuna lingua OCR installata.</div>}
        </div>
      );
      break;
    }
    case "position":
      control = <PositionGrid value={value} onChange={set} />;
      break;
    case "rect":
      control = <RectPicker value={value} active={!!rectActive} onActivate={activateRect!} onClear={() => set(null)} hint={f.hint} />;
      break;
  }
  return (
    <div className="field">
      {f.label && <label>{f.label}{f.required ? " *" : ""}</label>}
      {control}
      {f.hint && f.type !== "rect" && <div className="hint">{f.hint}</div>}
    </div>
  );
}

export const LANG_NAMES: Record<string, string> = {
  ita: "Italiano", eng: "Inglese", fra: "Francese", deu: "Tedesco", spa: "Spagnolo", por: "Portoghese",
  nld: "Olandese", ron: "Rumeno", pol: "Polacco", rus: "Russo", ara: "Arabo", chi_sim: "Cinese semplificato",
};
