import { useState } from "react";
import { Check, Plus } from "lucide-react";
import type { PDFDoc } from "../pdf";
import { Thumb } from "./Viewer";

export interface Card { key: string; src?: string; page: number | null; rotate: number; label?: string; title?: string }

let seq = 0;
export const newKey = () => `c${seq++}`;
export const initialCards = (n: number): Card[] => Array.from({ length: n }, (_, i) => ({ key: newKey(), page: i, rotate: 0 }));

/** "1-3,5,pari" -> insieme di indici 0-based (pagine 1-based nel testo). */
export function parsePagesSpec(spec: string, n: number): Set<number> {
  const out = new Set<number>();
  const s = (spec || "").trim().toLowerCase();
  if (!s || s === "tutte" || s === "all") { for (let i = 0; i < n; i++) out.add(i); return out; }
  for (const part of s.split(/[,;\s]+/)) {
    if (!part) continue;
    if (part === "pari") { for (let i = 1; i < n; i += 2) out.add(i); continue; }
    if (part === "dispari") { for (let i = 0; i < n; i += 2) out.add(i); continue; }
    const m = part.replace("ultima", String(n)).match(/^(\d*)-(\d*)$/);
    if (m) {
      const a = m[1] ? parseInt(m[1]) : 1, b = m[2] ? parseInt(m[2]) : n;
      for (let i = Math.min(a, b); i <= Math.max(a, b); i++) if (i >= 1 && i <= n) out.add(i - 1);
    } else if (/^\d+$/.test(part)) {
      const v = parseInt(part);
      if (v >= 1 && v <= n) out.add(v - 1);
    }
  }
  return out;
}

/** Insieme di indici 0-based -> "1-3,5" */
export function formatPages(sel: Iterable<number>): string {
  const a = [...sel].sort((x, y) => x - y);
  const parts: string[] = [];
  for (let i = 0; i < a.length; i++) {
    let j = i;
    while (j + 1 < a.length && a[j + 1] === a[j] + 1) j++;
    parts.push(j > i ? `${a[i] + 1}-${a[j] + 1}` : `${a[i] + 1}`);
    i = j;
  }
  return parts.join(",");
}

/** Pulsanti di selezione: tutte, nessuna, pari, dispari, intervallo. Lavora su posizioni 0-based. */
export function SelectionTools({ count, selected, onChange }: { count: number; selected: Set<number>; onChange: (s: Set<number>) => void }) {
  const [range, setRange] = useState("");
  const all = () => new Set(Array.from({ length: count }, (_, i) => i));
  return (
    <div className="field">
      <label>Selezione pagine <span style={{ fontWeight: 400, color: "var(--muted)" }}>· {selected.size} di {count}</span></label>
      <div className="btn-row">
        <button type="button" className="btn small" onClick={() => onChange(all())}>Tutte</button>
        <button type="button" className="btn small" onClick={() => onChange(new Set())}>Nessuna</button>
        <button type="button" className="btn small" onClick={() => onChange(parsePagesSpec("dispari", count))}>Dispari</button>
        <button type="button" className="btn small" onClick={() => onChange(parsePagesSpec("pari", count))}>Pari</button>
        <button type="button" className="btn small" onClick={() => onChange(new Set([...all()].filter((i) => !selected.has(i))))}>Inverti</button>
      </div>
      <div className="row">
        <input className="input" placeholder="Intervallo, es. 1-3, 7, 10-" value={range} onChange={(e) => setRange(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") onChange(parsePagesSpec(range, count)); }} />
        <button type="button" className="btn small" style={{ flex: "none" }} disabled={!range.trim()}
          onClick={() => onChange(new Set([...selected, ...parsePagesSpec(range, count)]))}>Aggiungi</button>
      </div>
    </div>
  );
}

export function PageGrid({ cards, pdfs, selected, multi, onCardClick, reorderable, onReorder, onAdd, previewRotate, removedKeys, addLabel }: {
  cards: Card[];
  pdfs: Record<string, PDFDoc>;      // "" = documento corrente
  selected: Set<string>;
  multi: boolean;
  onCardClick: (key: string, e: React.MouseEvent) => void;
  reorderable?: boolean;
  onReorder?: (dragKey: string, targetKey: string | null) => void;
  onAdd?: (e: React.MouseEvent) => void;
  previewRotate?: number;
  removedKeys?: Set<string>;
  addLabel?: string;
}) {
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [overKey, setOverKey] = useState<string | null>(null);
  return (
    <div className="org-grid" style={{ background: "var(--viewer-bg)" }} onDragOver={(e) => e.preventDefault()}>
      {cards.map((c, i) => {
        const pdf = pdfs[c.src || ""];
        const sel = selected.has(c.key);
        const rot = c.rotate + (sel && previewRotate ? previewRotate : 0);
        return (
          <div key={c.key} className={`org-card ${sel ? "sel" : ""} ${overKey === c.key ? "over" : ""} ${removedKeys?.has(c.key) ? "removed" : ""}`}
            draggable={!!reorderable}
            onDragStart={(e) => { e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", c.key); setDragKey(c.key); }}
            onDragOver={(e) => { if (!reorderable) return; e.preventDefault(); e.stopPropagation(); setOverKey(c.key); }}
            onDrop={(e) => { e.preventDefault(); e.stopPropagation(); if (dragKey) onReorder?.(dragKey, c.key); setDragKey(null); setOverKey(null); }}
            onDragEnd={() => { setDragKey(null); setOverKey(null); }}
            onClick={(e) => onCardClick(c.key, e)}>
            {multi && <span className={`org-check ${sel ? "on" : ""}`}>{sel && <Check size={13} />}</span>}
            <div className="thumbbox" style={{ transform: `rotate(${rot}deg)`, transition: "transform .2s" }}>
              {c.page === null ? <div className="blank" /> : pdf ? <Thumb pdf={pdf} index={c.page} width={110} /> : <div className="blank" />}
            </div>
            <div className="meta">
              <span>{i + 1}</span>
              <span className="meta-label" title={c.title}>{c.label ?? (c.page === null ? "bianca" : c.src ? `altro PDF · ${c.page + 1}` : `orig. ${c.page + 1}`)}{c.rotate ? ` · ${c.rotate}°` : ""}</span>
            </div>
          </div>
        );
      })}
      {onAdd && (
        <div className={`org-card org-add ${overKey === "__end" ? "over" : ""}`} onClick={onAdd} title={addLabel || "Aggiungi pagine"}
          onDragOver={(e) => { if (!reorderable) return; e.preventDefault(); setOverKey("__end"); }}
          onDrop={(e) => { e.preventDefault(); if (dragKey) onReorder?.(dragKey, null); setDragKey(null); setOverKey(null); }}>
          <div className="thumbbox"><div className="add-page"><Plus size={30} /></div></div>
          <div className="meta"><span>{addLabel || "Aggiungi pagine"}</span></div>
        </div>
      )}
    </div>
  );
}
