import { useEffect, useRef, useState } from "react";
import { Copy, TextSelect, X } from "lucide-react";
import { api } from "../api";
import type { VRect } from "../types";

/**
 * App Android: selezione del testo con il dito, gestita dall'app.
 * La selezione "nativa" del WebView sul livello di testo trasparente di pdf.js non è affidabile (nei PDF passati
 * dall'OCR spesso non parte): qui si tiene premuto su una parola, si allarga la selezione con i due cerchietti
 * e si copia. Le parole arrivano dal motore (page_words), quindi funziona anche sul testo invisibile dell'OCR.
 */
export type TWord = { r: VRect; l: number; t: string };
export interface TSel { page: number; i: number; j: number; a: { x: number; y: number }; b: { x: number; y: number } }

/** Indice della parola più vicina al punto (le distanze verticali contano di più: si resta sulla riga). */
function nearest(words: TWord[], p: { x: number; y: number }, max = 60): number {
  let best = -1, bd = Infinity;
  words.forEach((w, k) => {
    const { x, y, w: ww, h } = w.r;
    const dx = p.x < x ? x - p.x : p.x > x + ww ? p.x - x - ww : 0;
    const dy = p.y < y ? y - p.y : p.y > y + h ? p.y - y - h : 0;
    const d = dx + dy * 4;
    if (d < bd) { bd = d; best = k; }
  });
  return bd <= max ? best : -1;
}

/** Riquadri della selezione, uniti per riga. */
export function selRects(words: TWord[], i: number, j: number): VRect[] {
  const out: VRect[] = [];
  let line = -1;
  for (let k = Math.min(i, j); k <= Math.max(i, j); k++) {
    const { r, l } = words[k];
    const last = out[out.length - 1];
    if (l === line && last && Math.abs(r.y - last.y) < r.h) {
      const x0 = Math.min(last.x, r.x), y0 = Math.min(last.y, r.y);
      const x1 = Math.max(last.x + last.w, r.x + r.w), y1 = Math.max(last.y + last.h, r.y + r.h);
      out[out.length - 1] = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
    } else {
      out.push({ ...r });
      line = l;
    }
  }
  return out;
}

function selText(words: TWord[], i: number, j: number): string {
  let s = "", line = -1;
  for (let k = Math.min(i, j); k <= Math.max(i, j); k++) {
    const w = words[k];
    s += k === Math.min(i, j) ? w.t : w.l === line ? ` ${w.t}` : `\n${w.t}`;
    line = w.l;
  }
  return s;
}

async function copyText(t: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(t); return true; } catch { /* WebView senza permesso: metodo classico */ }
  const ta = document.createElement("textarea");
  ta.value = t;
  ta.setAttribute("readonly", "");
  ta.style.cssText = "position:fixed;left:-9999px;top:0;opacity:0";
  document.body.appendChild(ta);
  ta.select();
  let ok = false;
  try { ok = document.execCommand("copy"); } catch { ok = false; }
  ta.remove();
  return ok;
}

const ends = (words: TWord[], i: number, j: number) => {
  const r = selRects(words, i, j);
  const f = r[0], l = r[r.length - 1];
  return { a: { x: f.x, y: f.y + f.h }, b: { x: l.x + l.w, y: l.y + l.h } };
};

export function useTouchTextSel(docId: string | undefined, enabled: boolean, toast: (m: string, k?: "ok" | "err" | "info") => void) {
  const [sel, setSel] = useState<TSel | null>(null);
  const cache = useRef<{ doc?: string; pages: Record<number, TWord[]>; asked: Record<number, Promise<TWord[]>> }>({ pages: {}, asked: {} });
  useEffect(() => { cache.current = { doc: docId, pages: {}, asked: {} }; setSel(null); }, [docId]);

  const words = (page: number): Promise<TWord[]> => {
    const c = cache.current;
    if (c.pages[page]) return Promise.resolve(c.pages[page]);
    if (!c.asked[page] && docId) {
      c.asked[page] = api.tool("page_words", { doc: docId, params: { page } })
        .then((r: any) => (c.pages[page] = (r.data?.words || []) as TWord[]))
        .catch((e) => { delete c.asked[page]; throw e; });
    }
    return c.asked[page] || Promise.resolve([]);
  };
  const cur = () => (sel ? cache.current.pages[sel.page] || [] : []);

  /** Dito tenuto premuto: si seleziona la parola sotto il dito. */
  const start = async (page: number, p: { x: number; y: number }) => {
    if (!enabled) return;
    let ws: TWord[];
    try { ws = await words(page); } catch { toast("Non riesco a leggere il testo della pagina.", "err"); return; }
    if (!ws.length) { toast("In questa pagina non c'è testo selezionabile. Se è una scansione, esegui prima l'OCR.", "info"); return; }
    const k = nearest(ws, p, 24);
    if (k < 0) { setSel(null); return; }
    navigator.vibrate?.(12);
    setSel({ page, i: k, j: k, ...ends(ws, k, k) });
  };
  /** Cerchietto trascinato: la selezione va dal punto fermo a quello spostato. */
  const move = (which: "a" | "b", p: { x: number; y: number }) => {
    if (!sel) return;
    const ws = cur();
    const k = nearest(ws, p);
    if (k < 0) return;
    const i = which === "a" ? k : sel.i, j = which === "b" ? k : sel.j;
    const [lo, hi] = i <= j ? [i, j] : [j, i];
    setSel({ ...sel, i: lo, j: hi, ...ends(ws, lo, hi) });
  };
  const all = () => {
    if (!sel) return;
    const ws = cur();
    if (ws.length) setSel({ ...sel, i: 0, j: ws.length - 1, ...ends(ws, 0, ws.length - 1) });
  };
  const copy = async () => {
    if (!sel) return;
    const t = selText(cur(), sel.i, sel.j);
    const ok = await copyText(t);
    toast(ok ? `Testo copiato (${t.length} caratteri).` : "Copia non riuscita.", ok ? "ok" : "err");
    if (ok) setSel(null);
  };
  return { sel, start, move, all, copy, clear: () => setSel(null), rects: () => (sel ? selRects(cur(), sel.i, sel.j) : []) };
}

export type TouchSelApi = ReturnType<typeof useTouchTextSel>;

/** Evidenziazione, cerchietti e barra (Copia · Tutto · ×) sulla pagina selezionata. */
export function TouchSelLayer({ api: ts, page, scale, pageW, toPt }: {
  api: TouchSelApi; page: number; scale: number; pageW: number;
  toPt: (e: { clientX: number; clientY: number }) => { x: number; y: number };
}) {
  const sel = ts.sel;
  if (!sel || sel.page !== page) return null;
  const rects = ts.rects();
  if (!rects.length) return null;
  const top = rects[0];
  const barW = 236;
  const left = Math.min(Math.max(top.x * scale, 4), Math.max(pageW * scale - barW - 4, 4));
  const barTop = top.y * scale > 54 ? top.y * scale - 50 : (rects[rects.length - 1].y + rects[rects.length - 1].h) * scale + 30;
  return (
    <div className="tsel-layer">
      {rects.map((r, k) => (
        <div key={k} className="tsel-box" style={{ left: r.x * scale, top: r.y * scale, width: r.w * scale, height: r.h * scale }} />
      ))}
      {(["a", "b"] as const).map((k) => {
        const pt = sel[k];
        return (
          <span key={k} className={`sel-handle sel-${k}`} style={{ left: pt.x * scale, top: pt.y * scale }}
            onPointerDown={(e) => { e.stopPropagation(); e.preventDefault(); (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); }}
            onPointerMove={(e) => { if ((e.currentTarget as HTMLElement).hasPointerCapture(e.pointerId)) { const q = toPt(e); ts.move(k, { x: q.x, y: q.y - 18 / scale }); } }} />
        );
      })}
      <div className="tsel-bar" style={{ left, top: barTop }} onPointerDown={(e) => e.stopPropagation()}>
        <button type="button" onClick={ts.copy}><Copy size={15} /> Copia</button>
        <button type="button" onClick={ts.all}><TextSelect size={15} /> Tutto</button>
        <button type="button" onClick={ts.clear} aria-label="Annulla la selezione"><X size={16} /></button>
      </div>
    </div>
  );
}
