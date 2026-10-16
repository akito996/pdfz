import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  ArrowDown, ArrowUp, Check, ChevronDown, ChevronRight, ChevronsDownUp, ChevronsUpDown, GripVertical, MoreHorizontal,
  PanelLeftClose, PanelLeftOpen, Pencil, Plus, Star, Tag, Trash2, X,
} from "lucide-react";
import { CATEGORIES, type ToolDef } from "../tools";

const FAV_KEY = "hdpdf.preferiti";
const LABELS_KEY = "hdpdf.etichette";
const COLLAPSE_KEY = "hdpdf.sezioniChiuse";
export const FAV_CAT = "Preferiti";
const FAV_SEC = "fav";

export const LABEL_COLORS = ["#b3122b", "#c9a227", "#1c1917", "#15803d", "#2563eb", "#7c3aed", "#db2777", "#0891b2", "#64748b"];

export interface ToolLabel { id: string; name: string; color: string; tools: string[] }

function load<T>(key: string, fallback: T): T {
  try { const v = localStorage.getItem(key); return v ? (JSON.parse(v) as T) : fallback; } catch { return fallback; }
}
function save(key: string, v: unknown) {
  try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* archiviazione non disponibile */ }
}
const newId = () => `l${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

/** sposta `id` prima di `before` (o in fondo); se `id` non c'è, lo inserisce */
function placeIn(list: string[], id: string, before: string | null): string[] {
  const rest = list.filter((x) => x !== id);
  const i = before ? rest.indexOf(before) : -1;
  rest.splice(i < 0 ? rest.length : i, 0, id);
  return rest;
}
function moveBy(list: string[], id: string, d: number): string[] {
  const i = list.indexOf(id), j = i + d;
  if (i < 0 || j < 0 || j >= list.length) return list;
  const c = [...list];
  [c[i], c[j]] = [c[j], c[i]];
  return c;
}

interface Props {
  tools: ToolDef[];          // strumenti già filtrati dalla ricerca
  filter: string;
  setFilter: (v: string) => void;
  activeTool: string | null;
  isDisabled: (t: ToolDef) => boolean;
  onPick: (t: ToolDef) => void;
  compact: boolean;              // solo icone
  onToggleCompact: () => void;
}

type MenuTarget = Menu extends infer M ? (M extends Menu ? Omit<M, "x" | "y"> : never) : never;
type Menu =
  | { kind: "tool"; toolId: string; section: string; x: number; y: number }
  | { kind: "label"; labelId: string; x: number; y: number };

/** Menu degli strumenti: Preferiti (ordinabili), etichette create dall'utente, poi le sezioni fisse. */
export function Sidebar({ tools, filter, setFilter, activeTool, isDisabled, onPick, compact, onToggleCompact }: Props) {
  const [favs, setFavs] = useState<string[]>(() => load(FAV_KEY, []));
  const [labels, setLabels] = useState<ToolLabel[]>(() => load(LABELS_KEY, []));
  const [closed, setClosed] = useState<string[]>(() => load<string[]>(COLLAPSE_KEY, []).map((k) => (k === FAV_CAT ? FAV_SEC : k)));
  const [menu, setMenu] = useState<Menu | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [drag, setDrag] = useState<{ toolId: string; from: string } | null>(null);
  const [over, setOver] = useState<{ section: string; before: string | null } | null>(null);
  useEffect(() => save(FAV_KEY, favs), [favs]);
  useEffect(() => save(LABELS_KEY, labels), [labels]);
  useEffect(() => save(COLLAPSE_KEY, closed), [closed]);

  const byId = (id: string) => tools.find((t) => t.id === id);
  const searching = filter.trim().length > 0;
  // durante la ricerca le sezioni sono sempre aperte, così si vede ogni risultato
  const isOpen = (key: string) => searching || !closed.includes(key);
  const toggleSec = (key: string) => setClosed((l) => (l.includes(key) ? l.filter((x) => x !== key) : [...l, key]));

  // ------------------------------------------------ operazioni su preferiti ed etichette
  const listOf = (section: string): string[] => (section === FAV_SEC ? favs : labels.find((l) => l.id === section)?.tools || []);
  const setListOf = (section: string, fn: (l: string[]) => string[]) => {
    if (section === FAV_SEC) setFavs(fn);
    else setLabels((ls) => ls.map((l) => (l.id === section ? { ...l, tools: fn(l.tools) } : l)));
  };
  const toggleFav = (id: string) => setFavs((f) => (f.includes(id) ? f.filter((x) => x !== id) : [...f, id]));
  const toggleInLabel = (labelId: string, toolId: string) =>
    setListOf(labelId, (l) => (l.includes(toolId) ? l.filter((x) => x !== toolId) : [...l, toolId]));
  const addLabel = (withTool?: string) => {
    const l: ToolLabel = { id: newId(), name: "Nuova etichetta", color: LABEL_COLORS[labels.length % LABEL_COLORS.length], tools: withTool ? [withTool] : [] };
    setLabels((ls) => [...ls, l]);
    setClosed((c) => c.filter((x) => x !== l.id));
    setRenaming(l.id);
    return l.id;
  };
  const moveLabel = (id: string, d: number) => setLabels((ls) => {
    const i = ls.findIndex((l) => l.id === id), j = i + d;
    if (i < 0 || j < 0 || j >= ls.length) return ls;
    const c = [...ls];
    [c[i], c[j]] = [c[j], c[i]];
    return c;
  });

  // ------------------------------------------------ trascinamento
  const onDragStart = (e: React.DragEvent, toolId: string, from: string) => {
    e.dataTransfer.effectAllowed = from === "cat" ? "copy" : "move";
    e.dataTransfer.setData("text/plain", toolId);
    setDrag({ toolId, from });
  };
  const allowDrop = (e: React.DragEvent, section: string, before: string | null) => {
    if (!drag) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = drag.from === section ? "move" : "copy";
    if (over?.section !== section || over.before !== before) setOver({ section, before });
  };
  const onDrop = (e: React.DragEvent, section: string, before: string | null) => {
    e.preventDefault();
    e.stopPropagation();
    if (drag && drag.toolId !== before) setListOf(section, (l) => placeIn(l, drag.toolId, before));
    setDrag(null);
    setOver(null);
  };
  const endDrag = () => { setDrag(null); setOver(null); };

  // ------------------------------------------------ sezioni
  type Sec = { key: string; title: string; items: ToolDef[]; kind: "fav" | "label" | "cat"; label?: ToolLabel };
  const sections: Sec[] = [
    { key: FAV_SEC, title: FAV_CAT, kind: "fav", items: favs.map(byId).filter(Boolean) as ToolDef[] },
    ...labels.map((l) => ({ key: l.id, title: l.name, kind: "label" as const, label: l, items: l.tools.map(byId).filter(Boolean) as ToolDef[] })),
    ...CATEGORIES.map((c) => ({ key: c, title: c, kind: "cat" as const, items: tools.filter((t) => t.category === c) })),
  ];
  // la chiave dei Preferiti era il nome della sezione nelle versioni precedenti
  const allKeys = sections.map((s) => s.key);
  const allClosed = allKeys.every((k) => closed.includes(k));

  const openMenu = (e: React.MouseEvent, m: MenuTarget) => {
    e.stopPropagation();
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setMenu({ ...m, x: r.right + 4, y: r.top } as Menu);
  };

  const item = (t: ToolDef, sec: Sec) => {
    const Icon = t.icon;
    const disabled = isDisabled(t);
    const fav = favs.includes(t.id);
    const ordered = sec.kind !== "cat";
    const dropHere = ordered && over?.section === sec.key && over.before === t.id && drag?.toolId !== t.id;
    const inLabels = labels.filter((l) => l.tools.includes(t.id));
    return (
      <div key={`${sec.key}-${t.id}`}
        className={`tool-item ${activeTool === t.id ? "active" : ""} ${disabled ? "disabled" : ""} ${dropHere ? "drop-before" : ""} ${drag?.toolId === t.id && drag.from === sec.key ? "dragging" : ""}`}
        draggable={!searching} onDragStart={(e) => onDragStart(e, t.id, ordered ? sec.key : "cat")} onDragEnd={endDrag}
        onDragOver={ordered ? (e) => allowDrop(e, sec.key, t.id) : undefined}
        onDrop={ordered ? (e) => onDrop(e, sec.key, t.id) : undefined}>
        {ordered && !searching && <span className="grip" aria-hidden title="Trascina per spostare"><GripVertical size={13} /></span>}
        <button type="button" className="tool-main" title={t.description} onClick={() => onPick(t)}>
          <Icon size={16} /> <span className="grow">{t.label}</span>
          {sec.kind === "cat" && inLabels.length > 0 && (
            <span className="label-dots" aria-label={`Etichette: ${inLabels.map((l) => l.name).join(", ")}`}>
              {inLabels.slice(0, 3).map((l) => <i key={l.id} style={{ background: l.color }} />)}
            </span>
          )}
        </button>
        <button type="button" className="tool-more" title="Etichette e ordine" aria-label={`Altre azioni per ${t.label}`} aria-haspopup="menu"
          onClick={(e) => openMenu(e, { kind: "tool", toolId: t.id, section: sec.key })}>
          <MoreHorizontal size={14} />
        </button>
        <button type="button" className={`fav ${fav ? "on" : ""}`} title={fav ? "Togli dai preferiti" : "Aggiungi ai preferiti"}
          aria-label={fav ? `Togli ${t.label} dai preferiti` : `Aggiungi ${t.label} ai preferiti`} aria-pressed={fav}
          onClick={() => toggleFav(t.id)}>
          <Star size={14} fill={fav ? "currentColor" : "none"} />
        </button>
      </div>
    );
  };

  if (compact) {
    // menu a sole icone: preferiti ed etichette in alto, poi le sezioni separate da una linea
    return (
      <nav className="sidebar compact" aria-label="Strumenti">
        <button className="btn icon ghost side-toggle" title="Espandi il menu degli strumenti" aria-label="Espandi il menu" onClick={onToggleCompact}>
          <PanelLeftOpen size={17} />
        </button>
        {sections.map((sec) => sec.items.length ? (
          <div key={sec.key} className={`side-sec ${sec.kind === "fav" ? "favs" : ""} ${sec.kind === "label" ? "lbl" : ""}`} title={sec.title}
            style={sec.label ? { borderLeftColor: sec.label.color } : undefined}>
            {sec.items.map((t) => {
              const Icon = t.icon;
              return (
                <button key={`${sec.key}-${t.id}`} type="button" aria-label={t.label} title={`${t.label} — ${t.description}${sec.label ? ` (${sec.label.name})` : ""}`}
                  className={`tool-icon ${activeTool === t.id ? "active" : ""} ${isDisabled(t) ? "disabled" : ""}`} onClick={() => onPick(t)}>
                  <Icon size={18} />
                </button>
              );
            })}
          </div>
        ) : null)}
      </nav>
    );
  }

  return (
    <nav className="sidebar" aria-label="Strumenti">
      <div className="side-top">
        <button className="btn icon ghost small" title="Comprimi il menu (solo icone)" aria-label="Comprimi il menu" onClick={onToggleCompact}>
          <PanelLeftClose size={15} />
        </button>
        <input className="search" placeholder="Cerca strumento…" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Cerca strumento" />
        <button className="btn icon ghost small" title={allClosed ? "Espandi tutte le sezioni" : "Comprimi tutte le sezioni"}
          aria-label={allClosed ? "Espandi tutte le sezioni" : "Comprimi tutte le sezioni"}
          onClick={() => setClosed(allClosed ? [] : allKeys)}>
          {allClosed ? <ChevronsUpDown size={15} /> : <ChevronsDownUp size={15} />}
        </button>
      </div>
      {sections.map((sec, idx) => {
        const ordered = sec.kind !== "cat";
        if (!sec.items.length && (searching || sec.kind === "cat")) return null;
        const open = isOpen(sec.key);
        const dropEnd = ordered && over?.section === sec.key && over.before === null;
        const isLastLabel = sec.kind === "label" && sections[idx + 1]?.kind !== "label";
        return (
          <div key={sec.key}>
            <div className={`side-sec ${sec.kind === "fav" ? "favs" : ""} ${sec.kind === "label" ? "lbl" : ""} ${dropEnd ? "drop-end" : ""}`}
              onDragOver={ordered ? (e) => allowDrop(e, sec.key, null) : undefined}
              onDrop={ordered ? (e) => onDrop(e, sec.key, null) : undefined}>
              <div className="cat-row">
                {renaming === sec.key && sec.label ? (
                  <RenameBox value={sec.label.name} color={sec.label.color}
                    onDone={(name) => { setLabels((ls) => ls.map((l) => (l.id === sec.key ? { ...l, name: name || l.name } : l))); setRenaming(null); }} />
                ) : (
                  <button className="cat" onClick={() => toggleSec(sec.key)} aria-expanded={open}
                    onDoubleClick={() => sec.label && setRenaming(sec.key)}>
                    {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                    {sec.kind === "fav" && <Star size={12} fill="currentColor" className="cat-star" />}
                    {sec.label && <i className="label-dot" style={{ background: sec.label.color }} />}
                    <span className="grow">{sec.title}</span>
                    {!open && <span className="count">{sec.items.length}</span>}
                  </button>
                )}
                {sec.label && renaming !== sec.key && (
                  <button type="button" className="tool-more cat-more" aria-label={`Opzioni etichetta ${sec.title}`} aria-haspopup="menu" title="Rinomina, colore, ordine, elimina"
                    onClick={(e) => openMenu(e, { kind: "label", labelId: sec.key })}><MoreHorizontal size={14} /></button>
                )}
              </div>
              {open && (sec.items.length
                ? sec.items.map((t) => item(t, sec))
                : <div className="fav-empty">{sec.kind === "fav"
                  ? <>Clicca la <Star size={11} /> accanto a uno strumento, o trascinalo qui.</>
                  : <>Trascina qui gli strumenti, o usa <MoreHorizontal size={11} /> accanto a uno strumento.</>}</div>)}
            </div>
            {(isLastLabel || (sec.kind === "fav" && !labels.length)) && !searching && (
              <button type="button" className="add-label" onClick={() => addLabel()}><Plus size={13} /> Nuova etichetta</button>
            )}
          </div>
        );
      })}

      {menu && (
        <SidePopover x={menu.x} y={menu.y} onClose={() => setMenu(null)}>
          {menu.kind === "tool" ? (() => {
            const t = byId(menu.toolId);
            const ordered = menu.section !== "cat" && (menu.section === FAV_SEC || labels.some((l) => l.id === menu.section));
            const list = ordered ? listOf(menu.section) : [];
            const pos = list.indexOf(menu.toolId);
            return (
              <>
                <div className="menu-title">{t?.label}</div>
                {ordered && (
                  <>
                    <button role="menuitem" disabled={pos <= 0} onClick={() => setListOf(menu.section, (l) => moveBy(l, menu.toolId, -1))}><ArrowUp size={14} /> Sposta su</button>
                    <button role="menuitem" disabled={pos < 0 || pos >= list.length - 1} onClick={() => setListOf(menu.section, (l) => moveBy(l, menu.toolId, 1))}><ArrowDown size={14} /> Sposta giù</button>
                    <button role="menuitem" onClick={() => { setListOf(menu.section, (l) => l.filter((x) => x !== menu.toolId)); setMenu(null); }}>
                      <X size={14} /> {menu.section === FAV_SEC ? "Togli dai preferiti" : "Togli da questa etichetta"}</button>
                    <div className="menu-sep" />
                  </>
                )}
                <div className="menu-title"><Tag size={11} /> Etichette</div>
                {labels.map((l) => (
                  <button key={l.id} role="menuitemcheckbox" aria-checked={l.tools.includes(menu.toolId)} onClick={() => toggleInLabel(l.id, menu.toolId)}>
                    <i className="label-dot" style={{ background: l.color }} /> <span className="grow">{l.name}</span>
                    {l.tools.includes(menu.toolId) && <Check size={14} color="var(--brand)" />}
                  </button>
                ))}
                <button role="menuitem" onClick={() => { addLabel(menu.toolId); setMenu(null); }}><Plus size={14} /> Nuova etichetta con questo strumento</button>
              </>
            );
          })() : (() => {
            const l = labels.find((x) => x.id === menu.labelId);
            if (!l) return null;
            const i = labels.indexOf(l);
            return (
              <>
                <div className="menu-title">{l.name}</div>
                <button role="menuitem" onClick={() => { setRenaming(l.id); setMenu(null); }}><Pencil size={14} /> Rinomina</button>
                <div className="menu-colors" role="group" aria-label="Colore">
                  {LABEL_COLORS.map((c) => (
                    <button key={c} type="button" className={`swatch ${l.color === c ? "on" : ""}`} style={{ background: c }} aria-label={`Colore ${c}`}
                      onClick={() => setLabels((ls) => ls.map((x) => (x.id === l.id ? { ...x, color: c } : x)))} />
                  ))}
                </div>
                <button role="menuitem" disabled={i === 0} onClick={() => moveLabel(l.id, -1)}><ArrowUp size={14} /> Sposta su</button>
                <button role="menuitem" disabled={i === labels.length - 1} onClick={() => moveLabel(l.id, 1)}><ArrowDown size={14} /> Sposta giù</button>
                <div className="menu-sep" />
                <button role="menuitem" className="danger" onClick={() => { setLabels((ls) => ls.filter((x) => x.id !== l.id)); setMenu(null); }}>
                  <Trash2 size={14} /> Elimina etichetta</button>
                <div className="menu-note">Gli strumenti restano nel menu: si toglie solo il raggruppamento.</div>
              </>
            );
          })()}
        </SidePopover>
      )}
    </nav>
  );
}

function RenameBox({ value, color, onDone }: { value: string; color: string; onDone: (v: string) => void }) {
  const [v, setV] = useState(value);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { ref.current?.focus(); ref.current?.select(); }, []);
  return (
    <div className="rename-box">
      <i className="label-dot" style={{ background: color }} />
      <input ref={ref} className="input" value={v} maxLength={40} aria-label="Nome dell'etichetta"
        onChange={(e) => setV(e.target.value)} onBlur={() => onDone(v.trim())}
        onKeyDown={(e) => { if (e.key === "Enter") onDone(v.trim()); if (e.key === "Escape") onDone(value); }} />
    </div>
  );
}

/** Menu a comparsa accanto al pulsante; si chiude cliccando fuori o con Esc. Resta dentro lo schermo. */
function SidePopover({ x, y, onClose, children }: { x: number; y: number; onClose: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x, top: y });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({ left: Math.min(x, window.innerWidth - r.width - 8), top: Math.max(8, Math.min(y, window.innerHeight - r.height - 8)) });
  }, [x, y]);
  useEffect(() => {
    const down = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) onClose(); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    const t = window.setTimeout(() => document.addEventListener("mousedown", down), 0);
    document.addEventListener("keydown", key);
    return () => { window.clearTimeout(t); document.removeEventListener("mousedown", down); document.removeEventListener("keydown", key); };
  }, [onClose]);
  return <div ref={ref} className="menu side-pop" role="menu" style={pos}>{children}</div>;
}
