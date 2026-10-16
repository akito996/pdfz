import { useEffect, useMemo, useRef, useState } from "react";
import {
  CaseSensitive, Check, CornerDownRight, Highlighter, MessageSquarePlus, Pencil, Replace, Search, Strikethrough, Trash2,
  Underline, User, X,
} from "lucide-react";
import { api } from "../api";
import { useApp, usePending } from "../context";
import { useEvent, useStored } from "../hooks";
import type { ToolDef } from "../tools";
import type { VRect } from "../types";
import { PanelShell } from "./ToolPanel";
import { Advanced, useIsMobile, useMedia } from "./fields";

type Act = "note" | "highlight" | "underline" | "strike" | "replace" | "insert";
const ACTS: { id: Act; label: string; Icon: typeof Highlighter; hint: string }[] = [
  { id: "note", label: "Nota", Icon: MessageSquarePlus, hint: "Clicca sulla pagina e scrivi la nota direttamente lì. Chiusa, resta l'icona: cliccala per riaprirla." },
  { id: "highlight", label: "Evidenzia", Icon: Highlighter, hint: "Come l'evidenziatore di Word: tieni premuto e scorri sopra il testo." },
  { id: "underline", label: "Sottolinea", Icon: Underline, hint: "Tieni premuto e scorri sopra il testo da sottolineare." },
  { id: "strike", label: "Barra", Icon: Strikethrough, hint: "Tieni premuto e scorri sopra il testo da barrare." },
  { id: "replace", label: "Sostituisci", Icon: Replace, hint: "Scorri sopra il testo da sostituire, poi scrivi il nuovo testo." },
  { id: "insert", label: "Inserisci", Icon: CaseSensitive, hint: "Clicca nel punto del testo dove inserire, poi scrivi cosa aggiungere." },
];
const COLORS: Record<Act, string[]> = {
  note: ["#fdc300", "#2563eb", "#15803d", "#c8102e"],
  highlight: ["#fde047", "#86efac", "#93c5fd", "#f9a8d4"],
  underline: ["#2563eb", "#15803d", "#c8102e"],
  strike: ["#c8102e", "#1c1917"],
  replace: ["#2563eb", "#c8102e"],
  insert: ["#2563eb", "#15803d"],
};
const NEEDS_TEXT: Act[] = ["insert"];
const SEL_ACTS: Act[] = ["highlight", "underline", "strike", "replace"];
type Word = { r: VRect; l: number };

/** Parole tra il punto di partenza e quello di arrivo, in ordine di lettura, raggruppate per riga (come la selezione di Word). */
function selectWords(words: Word[], a: { x: number; y: number }, b: { x: number; y: number }): VRect[] {
  const near = (p: { x: number; y: number }) => {
    let best = -1, bd = Infinity;
    words.forEach((w, i) => {
      const { x, y, w: ww, h } = w.r;
      const dx = p.x < x ? x - p.x : p.x > x + ww ? p.x - x - ww : 0;
      const dy = p.y < y ? y - p.y : p.y > y + h ? p.y - y - h : 0;
      const d = dx + dy * 4;   // conta di più restare sulla stessa riga
      if (d < bd) { bd = d; best = i; }
    });
    return bd <= 60 ? best : -1;
  };
  let i = near(a), j = near(b);
  if (i < 0 || j < 0) return [];
  if (Math.abs(a.x - b.x) + Math.abs(a.y - b.y) < 3) {
    // semplice clic: solo la parola sotto il puntatore
    const w = words[i].r;
    if (a.x < w.x || a.x > w.x + w.w || a.y < w.y || a.y > w.y + w.h) return [];
    j = i;
  }
  if (i > j) [i, j] = [j, i];
  const out: VRect[] = [];
  let line = -1;
  for (let k = i; k <= j; k++) {
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
const STATE_LABEL: Record<string, string> = { Accepted: "Accettato", Rejected: "Rifiutato", Cancelled: "Annullato", Completed: "Completato", None: "Nessuno" };
const STATE_CLS: Record<string, string> = { Accepted: "ok", Completed: "ok", Rejected: "err", Cancelled: "muted" };
const actInfo = (a: Act) => ACTS.find((m) => m.id === a)!;

interface Draft { act: Act; page: number; rects?: VRect[]; point?: { x: number; y: number } }

const fmt = (v: string) => {
  if (!v) return "";
  const d = new Date(v);
  return isNaN(d.getTime()) ? v : d.toLocaleString("it-IT", { dateStyle: "short", timeStyle: "short" });
};

function paramsFor(d: Draft, base: Record<string, any>) {
  if (d.act === "insert") return { ...base, op: "insert", point: d.point };
  if (d.act === "replace") return { ...base, op: "replace", rects: d.rects };
  return { ...base, op: "markup", kind: d.act, rects: d.rects };
}

export function CommentsPanel({ def, onClose }: { def: ToolDef; onClose: () => void }) {
  const app = useApp();
  const [author, setAuthor] = useStored("hdpdf.autore", "");
  const [act, setAct] = useState<Act | null>(null);
  const [colors, setColors] = useStored<Record<string, string>>("hdpdf.coloriCommenti", {});
  const [draft, setDraft] = useState<Draft | null>(null);
  const [text, setText] = useState("");
  const [list, setList] = useState<any[]>([]);
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);   // /NM: stabile tra le versioni
  const [reply, setReply] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const docId = app.doc?.id;

  useEffect(() => {
    if (author) return;
    api.user().then((u) => { if (u.name) setAuthor(u.name); }).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!docId) { setList([]); return; }
    let alive = true;
    api.tool("list_comments", { doc: docId }).then((r) => { if (alive) setList(r.data.comments); }).catch(() => setList([]));
    return () => { alive = false; };
  }, [docId]);

  const colorOf = (a: Act) => colors[a] || COLORS[a][0];

  // ------------------------------------------------ parole delle pagine (selezione come in Word)
  const words = useRef<Record<number, Word[]>>({});
  const asked = useRef<Set<number>>(new Set());
  useEffect(() => { words.current = {}; asked.current = new Set(); }, [docId]);
  const needWords = useEvent((page: number) => {
    if (!docId || asked.current.has(page)) return;
    asked.current.add(page);
    api.tool("page_words", { doc: docId, params: { page } })
      .then((r: any) => { words.current[page] = r.data.words; })
      .catch(() => asked.current.delete(page));
  });
  const preview = (page: number, rects: VRect[], a: Act) => {
    const c = colorOf(a);
    app.setOverlays(rects.map((r, i) => ({
      id: `sel${i}`, page, kind: "fill" as const, rect: r,
      style: a === "highlight" ? { background: c, opacity: 0.45, border: "none" }
        : a === "underline" ? { background: "transparent", border: "none", borderBottom: `2px solid ${c}` }
        : { background: "transparent", border: "none", backgroundImage: `linear-gradient(transparent 46%, ${c} 46%, ${c} 58%, transparent 58%)` },
    })));
  };
  const markup = async (a: Act, page: number, rects: VRect[]) => {
    const res = await app.run("comments", { op: "markup", kind: a, rects, page, author, color: colorOf(a), text: "" }, { silent: true });
    app.setOverlays([]);
    if (res) app.toast(res.message === "Commento aggiunto." ? `${actInfo(a).label}: fatto.` : res.message || "Fatto.", "ok");
    return !!res;
  };
  // telefono/tablet: la selezione non si applica subito; si allarga con i cerchietti e si conferma con "Applica"
  const touch = useMedia("(pointer: coarse)");
  const mobile = useIsMobile();
  const [pend, setPend] = useState<{ page: number; a: { x: number; y: number }; b: { x: number; y: number }; rects: VRect[] } | null>(null);
  const ends = (rects: VRect[]) => {
    const f = rects[0], l = rects[rects.length - 1];
    return { a: { x: f.x + 0.5, y: f.y + f.h - 0.5 }, b: { x: l.x + l.w - 0.5, y: l.y + l.h - 0.5 } };
  };
  const onTextSel = useEvent((page: number, from: { x: number; y: number }, to: { x: number; y: number }, done: boolean) => {
    if (!act || !SEL_ACTS.includes(act)) return;
    const ws = words.current[page];
    if (!ws) { needWords(page); if (done) app.toast("Sto leggendo il testo della pagina: riprova tra un attimo.", "info"); return; }
    const rects = selectWords(ws, from, to);
    if (!done) { preview(page, rects, act); return; }
    if (!rects.length) {
      app.setOverlays([]);
      setPend(null);
      if (!ws.length) app.toast("In questa pagina non c'è testo selezionabile. Se è una scansione, esegui prima l'OCR.", "info");
      return;
    }
    if (touch) { preview(page, rects, act); setPend({ page, rects, ...ends(rects) }); return; }
    applySel(page, rects);
  });
  const applySel = async (page: number, rects: VRect[]) => {
    if (!act) return false;
    setPend(null);
    // Sostituisci: la selezione diventa una bozza in cui scrivere il nuovo testo (non è ancora applicata)
    if (act === "replace") { setDraft({ act, page, rects }); setText(""); return false; }
    return markup(act, page, rects);
  };
  // cerchietto trascinato: la selezione va dal punto fermo a quello spostato (in ordine di lettura)
  const onHandle = useEvent((which: "a" | "b", p: { x: number; y: number }) => {
    if (!pend || !act) return;
    const ws = words.current[pend.page] || [];
    const a = which === "a" ? p : pend.a, b = which === "b" ? p : pend.b;
    const rects = selectWords(ws, a, b);
    if (!rects.length) return;
    preview(pend.page, rects, act);
    setPend({ ...pend, a, b, rects });
  });
  useEffect(() => { setPend(null); }, [act, docId]);

  // ------------------------------------------------ note scritte sulla pagina
  const [noteDraft, setNoteDraft] = useState<{ page: number; point: { x: number; y: number } } | null>(null);
  const onPlace = useEvent((page: number, point: { x: number; y: number }) => {
    if (act === "note") setNoteDraft({ page, point });
    else if (act) { setDraft({ act, page, point }); setText(""); }
  });
  const onNoteDraft = useEvent(async (t: string | null) => {
    const d = noteDraft;
    setNoteDraft(null);
    if (!d || t == null || !t.trim()) return;
    const res = await app.run("comments", { op: "note", page: d.page, point: d.point, text: t, author, color: colorOf("note") }, { silent: true });
    if (res) app.toast("Nota aggiunta: clicca l'icona per riaprirla.", "ok");
  });
  const onNoteEdit = useEvent((xref: number, t: string) => op({ op: "edit", xref, text: t }));
  const onNoteDelete = useEvent((xref: number) => op({ op: "delete", xref }));
  const [openNote, setOpenNote] = useState<{ nm: string; n: number } | null>(null);

  // interazione con la pagina in base allo strumento scelto
  useEffect(() => {
    const notes = { onNoteEdit, onNoteDelete, openNote, noteDraft: noteDraft ? { ...noteDraft, color: colorOf("note") } : null, onNoteDraft };
    if (!act) app.setInteraction({ mode: "none", ...notes });
    else if (act === "note" || act === "insert") app.setInteraction({ mode: "objects", objects: [], onPlace, placeHint: actInfo(act).hint, ...notes });
    else app.setInteraction({
      mode: "textsel", onTextSel, needWords, cursorHint: actInfo(act).hint, ...notes,
      selHandles: pend ? { page: pend.page, ...ends(pend.rects), onMove: onHandle } : undefined,
    });
  }, [act, noteDraft, openNote, colors, pend]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { app.setInteraction({ mode: "none" }); app.setOverlays([]); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // anteprima della posizione del commento che si sta scrivendo nel pannello (Sostituisci, Inserisci)
  useEffect(() => {
    if (!draft) return;
    if (draft.rects) { preview(draft.page, draft.rects, "strike"); return; }
    const r = { x: draft.point!.x - 8, y: draft.point!.y - 8, w: 16, h: 16 };
    app.setOverlays([{ id: "draft", page: draft.page, rect: r, kind: "match", label: actInfo(draft.act).label }]);
  }, [draft]); // eslint-disable-line react-hooks/exhaustive-deps

  const submitDraft = async () => {
    if (!draft) return false;
    if (NEEDS_TEXT.includes(draft.act) && !text.trim()) {
      app.toast("Scrivi il testo da inserire.", "info");
      return false;
    }
    const res = await app.run("comments", paramsFor(draft, { author, color: colorOf(draft.act), page: draft.page, text }), { silent: true });
    if (res) { setDraft(null); setText(""); app.setOverlays([]); app.toast(res.message || "Fatto.", "ok"); }
    return !!res;
  };
  // in sospeso: la selezione del telefono non ancora confermata con "Applica" e il testo scritto in Sostituisci/Inserisci
  usePending(!!pend || (!!draft && !!text.trim()), def.label, () => (pend ? applySel(pend.page, pend.rects) : submitDraft()));
  const op = async (params: any, done?: () => void) => {
    const res = await app.run("comments", { author, ...params }, { silent: true });
    if (res) { done?.(); app.toast(res.message || "Fatto.", "ok"); }
  };

  // commenti principali (non risposte), con risposte e stato
  const threads = useMemo(() => {
    const q = query.trim().toLowerCase();
    return list.filter((c) => !c.irt)
      .filter((c) => filter === "all" || (filter === "open" ? !c.review || c.review === "None" : c.review === filter))
      .filter((c) => !q || `${c.author} ${c.content} ${c.text} ${c.label}`.toLowerCase().includes(q))
      .map((c) => ({ ...c, replies: list.filter((r) => r.irt === c.xref && !r.state).sort((a, b) => a.date.localeCompare(b.date)) }))
      .sort((a, b) => a.page - b.page || a.rect.y - b.rect.y);
  }, [list, filter, query]);
  const count = list.filter((c) => !c.irt).length;

  const focus = (c: any) => {
    setOpenId(openId === c.nm ? null : c.nm);
    app.gotoPage(c.page);
    if (c.type === "Text") {
      app.setOverlays([]);
      setOpenNote({ nm: c.nm, n: Date.now() });   // la nota si apre sulla pagina
      if (mobile) app.panelLayout.setSheetDown(true);   // telefono: si abbassa il pannello per vederla (si riapre con ⌃)
    }
    else app.setOverlays([{ id: "sel", page: c.page, rect: c.rect, kind: "match" }]);
  };

  return (
    <PanelShell def={def} onClose={onClose}>
      <div className="comment-tools" role="toolbar" aria-label="Strumenti di commento">
        {ACTS.map(({ id, label, Icon }) => (
          <button key={id} type="button" className={`ctool ${act === id ? "on" : ""}`} aria-pressed={act === id} title={label}
            onClick={() => { setAct(act === id ? null : id); setDraft(null); app.setOverlays([]); }}>
            <Icon size={16} color={act === id ? undefined : colorOf(id)} /> <span>{label}</span>
          </button>
        ))}
      </div>
      {act && (
        <>
          <div className="color-row">
            {COLORS[act].map((c) => (
              <button key={c} type="button" className={`swatch ${colorOf(act) === c ? "on" : ""}`} style={{ background: c }} aria-label={`Colore ${c}`}
                onClick={() => setColors({ ...colors, [act]: c })} />
            ))}
          </div>
          <div className="hint">{touch && SEL_ACTS.includes(act)
            ? "Tocca una parola, poi trascina i cerchietti per allargare la selezione e premi Applica."
            : actInfo(act).hint}</div>
          {pend && (
            <div className="btn-row">
              <button className="btn primary" onClick={() => applySel(pend.page, pend.rects)}><Check size={15} /> Applica: {actInfo(act).label}</button>
              <button className="btn ghost" onClick={() => { setPend(null); app.setOverlays([]); }}>Annulla</button>
            </div>
          )}
        </>
      )}
      {draft && (
        <div className="comment-draft">
          <div className="label">{actInfo(draft.act).label} · pagina {draft.page + 1}</div>
          <textarea className="input" rows={3} autoFocus value={text} onChange={(e) => setText(e.target.value)}
            placeholder={{ replace: "Nuovo testo (vuoto = elimina)", insert: "Testo da inserire", note: "Scrivi la nota…" }[draft.act as string] || "Commento (facoltativo)"}
            onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) submitDraft(); if (e.key === "Escape") { setDraft(null); app.setOverlays([]); } }} />
          <div className="btn-row">
            <button className="btn small primary" onClick={submitDraft}><Check size={14} /> Aggiungi</button>
            <button className="btn small ghost" onClick={() => { setDraft(null); app.setOverlays([]); }}>Annulla</button>
          </div>
          <div className="hint"><kbd>Ctrl</kbd>+<kbd>Invio</kbd> per aggiungere</div>
        </div>
      )}

      <Advanced label="Elenco commenti e autore">
      <div className="field">
        <label><User size={13} /> Autore dei commenti</label>
        <input className="input" value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="Nome e cognome" />
      </div>
      <div className="section-title">Commenti ({count})</div>
      <div className="row">
        <select className="input" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filtra per stato">
          <option value="all">Tutti</option>
          <option value="open">Da rivedere</option>
          <option value="Accepted">Accettati</option>
          <option value="Rejected">Rifiutati</option>
          <option value="Completed">Completati</option>
          <option value="Cancelled">Annullati</option>
        </select>
        <div className="search-mini"><Search size={13} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Cerca" aria-label="Cerca nei commenti" /></div>
      </div>
      {!threads.length && <div className="hint">{count ? "Nessun commento con questi filtri." : "Nessun commento nel documento. Scegli uno strumento qui sopra per iniziare."}</div>}
      <div className="comment-list">
        {threads.map((c) => {
          const open = openId === c.nm;
          return (
            <div key={c.nm} className={`comment ${open ? "open" : ""}`}>
              <button className="comment-head" onClick={() => focus(c)}>
                <span className="cdot" style={{ background: c.color || "#fdc300" }} />
                <span className="grow"><b>{c.author || "Anonimo"}</b> · {c.label} · p. {c.page + 1}</span>
                {c.review && c.review !== "None" && <span className={`badge ${STATE_CLS[c.review] || ""}`}>{STATE_LABEL[c.review]}</span>}
              </button>
              {c.text && <div className="cquote">“{c.text.length > 160 ? c.text.slice(0, 160) + "…" : c.text}”</div>}
              {editing === c.nm ? (
                <div className="comment-draft">
                  <textarea className="input" rows={3} value={editText} autoFocus onChange={(e) => setEditText(e.target.value)} />
                  <div className="btn-row">
                    <button className="btn small primary" onClick={() => op({ op: "edit", xref: c.xref, text: editText }, () => setEditing(null))}><Check size={14} /> Salva</button>
                    <button className="btn small ghost" onClick={() => setEditing(null)}>Annulla</button>
                  </div>
                </div>
              ) : c.content && <div className="ctext">{c.content}</div>}
              <div className="cdate">{fmt(c.date)}{c.review_by && c.review && c.review !== "None" ? ` · stato di ${c.review_by}` : ""}</div>
              {c.replies.map((r: any) => (
                <div key={r.xref} className="creply"><CornerDownRight size={12} /> <div><b>{r.author || "Anonimo"}</b> <span className="cdate">{fmt(r.date)}</span><div>{r.content}</div></div></div>
              ))}
              {open && (
                <div className="comment-actions">
                  <div className="row">
                    <input className="input" value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Rispondi…" aria-label="Risposta"
                      onKeyDown={(e) => { if (e.key === "Enter" && reply.trim()) op({ op: "reply", xref: c.xref, text: reply }, () => setReply("")); }} />
                    <button className="btn small" disabled={!reply.trim()} onClick={() => op({ op: "reply", xref: c.xref, text: reply }, () => setReply(""))}>Invia</button>
                  </div>
                  <div className="btn-row">
                    <select className="input small-select" value="" aria-label="Imposta stato"
                      onChange={(e) => e.target.value && op({ op: "state", xref: c.xref, state: e.target.value })}>
                      <option value="">Stato…</option>
                      {Object.entries(STATE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                    <button className="btn small" onClick={() => { setEditing(c.nm); setEditText(c.content); }}><Pencil size={13} /> Modifica</button>
                    <button className="btn small danger" onClick={() => op({ op: "delete", xref: c.xref }, () => setOpenId(null))}><Trash2 size={13} /> Elimina</button>
                    <button className="btn icon small ghost" title="Chiudi" aria-label="Chiudi" onClick={() => setOpenId(null)}><X size={13} /></button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
      </Advanced>
    </PanelShell>
  );
}
