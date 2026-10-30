import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { BookOpen, Check, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, MessageSquareText, PanelLeft, Presentation, Search, X, ZoomIn, ZoomOut } from "lucide-react";
import { isLocalEngine } from "../api";
import { pdfjs, type PDFDoc, type PageSize, renderThumb } from "../pdf";
import type { Interaction, NoteInfo, Overlay, Span, VRect } from "../types";
import { NotePopup } from "./NotePopup";
import { ObjectBox } from "./ObjectLayer";
import { useIsMobile, useMedia } from "../panels/fields";
import { useApp } from "../context";
import { TouchSelLayer, useTouchTextSel, type TouchSelApi } from "./TouchTextSel";
import { Popover } from "./Popover";
import { Presentazione } from "./Presentazione";
import { useStored } from "../hooks";

/** Come si leggono le pagine: una o due affiancate (con la copertina da sola, come un libro), una sotto l'altra
 *  (verticale) o una dopo l'altra in orizzontale, da sfogliare come un libro. */
interface Vista { doppia: boolean; copertina: boolean; libro: boolean }
const GAP_DOPPIA = 8;   // px fra le due pagine affiancate

/** Pagine raggruppate come si vedono: [[0],[1],...] oppure [[0,1],[2,3]] oppure, con la copertina, [[0],[1,2],...]. */
export function gruppiPagine(n: number, doppia: boolean, copertina: boolean): number[][] {
  if (!doppia) return Array.from({ length: n }, (_, i) => [i]);
  const out: number[][] = [];
  let i = 0;
  if (copertina && n) { out.push([0]); i = 1; }
  for (; i < n; i += 2) out.push(i + 1 < n ? [i, i + 1] : [i]);
  return out;
}

interface Props {
  pdf: PDFDoc;
  sizes: PageSize[];
  overlays: Overlay[];
  interaction: Interaction;
  currentPage: number;
  onPageChange: (p: number) => void;
  goto: { page: number; n: number } | null;
  onSearch?: (q: string) => Promise<{ page: number; rect: [number, number, number, number] }[]>;
  notes?: NoteInfo[];
}

const PX_PER_PT = 96 / 72;   // 100% = dimensione reale sullo schermo
const ZOOM_STEPS = [25, 50, 75, 100, 125, 150, 200, 300, 400, 600, 800];

export function Viewer({ pdf, sizes, overlays, interaction, currentPage, onPageChange, goto, onSearch, notes = [] }: Props) {
  const [openNote, setOpenNote] = useState<string | null>(null);
  // app Android: selezione del testo tenendo premuto (Copia); si chiude quando si usa uno strumento
  const app = useApp();
  const tselApi = useTouchTextSel(app.doc?.id, isLocalEngine(), app.toast);
  const tsel = isLocalEngine() ? tselApi : null;
  useEffect(() => { if (interaction.mode !== "none") tselApi.clear(); }, [interaction.mode]); // eslint-disable-line react-hooks/exhaustive-deps
  // l'elenco dei commenti può chiedere di aprire una nota
  useEffect(() => { if (interaction.openNote) setOpenNote(interaction.openNote.nm); }, [interaction.openNote]);
  // zoom in percentuale: 100% = dimensione reale (come Acrobat); "width" = adatta alla larghezza, "page" = pagina intera.
  // Di default "Adatta": la pagina occupa la larghezza disponibile e si riadatta se la finestra o i pannelli cambiano misura.
  const [zoom, setZoom] = useState<number | "width" | "page">("width");
  const [showThumbs, setShowThumbs] = useState(false);
  const [containerH, setContainerH] = useState(600);
  const [containerW, setContainerW] = useState(800);
  const pagesRef = useRef<HTMLDivElement>(null);
  const [pageInput, setPageInput] = useState("1");
  const [query, setQuery] = useState("");
  const mobile = useIsMobile();
  const touch = useMedia("(pointer: coarse)");           // tablet: comandi grandi, la barra ha meno spazio
  const compactSearch = mobile || touch;
  const [searchOpen, setSearchOpen] = useState(false);   // telefono e tablet: la ricerca è un'icona che si apre
  const [hits, setHits] = useState<{ page: number; rect: [number, number, number, number] }[]>([]);
  const [hitIdx, setHitIdx] = useState(0);
  // modo di lettura (resta per i documenti successivi) e presentazione a schermo intero
  const [vista, setVista] = useStored<Vista>("hdpdf.vista", { doppia: false, copertina: false, libro: false });
  const gruppi = useMemo(() => gruppiPagine(sizes.length, vista.doppia, vista.copertina), [sizes.length, vista.doppia, vista.copertina]);
  const [menuVista, setMenuVista] = useState(false);
  const btnVista = useRef<HTMLButtonElement>(null);
  const [presenta, setPresenta] = useState(false);

  useLayoutEffect(() => {
    const el = pagesRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => { setContainerW(el.clientWidth); setContainerH(el.clientHeight); });
    ro.observe(el);
    setContainerW(el.clientWidth);
    setContainerH(el.clientHeight);
    return () => ro.disconnect();
  }, []);

  // "Adatta" e "Pagina intera" considerano il gruppo più largo (due pagine affiancate = la loro larghezza insieme)
  const maxW = Math.max(...gruppi.map((g) => g.reduce((s, i) => s + sizes[i].w, 0)), 1);
  const maxH = Math.max(...sizes.map((x) => x.h), 1);
  const gapW = vista.doppia && gruppi.some((g) => g.length > 1) ? GAP_DOPPIA : 0;
  const scale = zoom === "width" ? Math.max(0.1, (containerW - 48 - gapW) / maxW)
    : zoom === "page" ? Math.max(0.1, Math.min((containerW - 48 - gapW) / maxW, (containerH - 32) / maxH))
    : (zoom / 100) * PX_PER_PT;
  const pct = Math.round((scale / PX_PER_PT) * 100);
  const setPct = (v: number) => setZoom(Math.round(Math.min(800, Math.max(10, v))));
  const [zoomInput, setZoomInput] = useState("");
  useEffect(() => setZoomInput(`${pct}%`), [pct]);

  // cambiando zoom resta visibile lo stesso punto del documento
  const prevScale = useRef(scale);
  useLayoutEffect(() => {
    const el = pagesRef.current;
    if (el && prevScale.current !== scale) {
      const k = scale / prevScale.current;
      // in cima al documento si resta in cima (anche quando la pagina si adatta allo spazio all'apertura)
      if (el.scrollTop > 0) el.scrollTop = (el.scrollTop + el.clientHeight / 2) * k - el.clientHeight / 2;
      if (el.scrollLeft > 0) el.scrollLeft = (el.scrollLeft + el.clientWidth / 2) * k - el.clientWidth / 2;
    }
    prevScale.current = scale;
  }, [scale]);
  // Ctrl + rotellina = zoom
  useEffect(() => {
    const el = pagesRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      setZoom((z) => {
        const cur = typeof z === "number" ? z : Math.round((scaleRef.current / PX_PER_PT) * 100);
        return Math.round(Math.min(800, Math.max(10, cur * (e.deltaY < 0 ? 1.1 : 1 / 1.1))));
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);
  const scaleRef = useRef(scale);
  scaleRef.current = scale;
  // telefono: zoom con due dita sul documento (anteprima istantanea, poi le pagine si ridisegnano nitide)
  useEffect(() => {
    const el = pagesRef.current;
    if (!el) return;
    let start = 0, ratio = 1;
    let mid: { x: number; y: number } | null = null;   // punto medio delle due dita: spostandolo si scorre la pagina
    const midOf = (t: TouchList) => ({ x: (t[0].clientX + t[1].clientX) / 2, y: (t[0].clientY + t[1].clientY) / 2 });
    const dist = (t: TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 2) return;
      start = dist(e.touches);
      ratio = 1;
      mid = midOf(e.touches);
      const r = el.getBoundingClientRect();
      const cx = (e.touches[0].clientX + e.touches[1].clientX) / 2 - r.left;
      const cy = (e.touches[0].clientY + e.touches[1].clientY) / 2 - r.top;
      el.style.transformOrigin = `${cx}px ${cy}px`;
    };
    const onMove = (e: TouchEvent) => {
      if (!start || e.touches.length !== 2) return;
      e.preventDefault();
      const cur = Math.round((scaleRef.current / PX_PER_PT) * 100);
      ratio = Math.min(800 / cur, Math.max(10 / cur, dist(e.touches) / start));
      // dita che si allontanano/avvicinano = zoom; dita che si spostano insieme = scorrimento
      if (Math.abs(ratio - 1) < 0.06) ratio = 1;
      el.style.transform = ratio === 1 ? "" : `scale(${ratio})`;
      const m = midOf(e.touches);
      if (mid && ratio === 1) { el.scrollLeft -= m.x - mid.x; el.scrollTop -= m.y - mid.y; }
      mid = m;
    };
    const onEnd = (e: TouchEvent) => {
      if (!start || e.touches.length >= 2) return;
      start = 0;
      el.style.transform = "";
      if (Math.abs(ratio - 1) > 0.03) {
        const cur = Math.round((scaleRef.current / PX_PER_PT) * 100);
        setZoom(Math.round(Math.min(800, Math.max(10, cur * ratio))));
      }
    };
    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd);
    el.addEventListener("touchcancel", onEnd);
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", onEnd);
    };
  }, []);

  useEffect(() => setPageInput(String(currentPage + 1)), [currentPage]);
  // Canc elimina l'oggetto selezionato, Esc deseleziona
  useEffect(() => {
    if (interaction.mode !== "objects") return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest("input,textarea,select,[contenteditable]")) return;
      if ((e.key === "Delete" || e.key === "Backspace") && interaction.selectedId) {
        e.preventDefault();
        interaction.onObjectDelete?.(interaction.selectedId);
      } else if (e.key === "Escape") interaction.onSelect?.(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [interaction]);
  // nuova versione del documento: i risultati di ricerca non sono più validi
  useEffect(() => { setHits([]); }, [pdf]);

  const libro = vista.libro;
  const scrollTo = useCallback((p: number) => {
    const el = pagesRef.current?.querySelector(`[data-page="${p}"]`) as HTMLElement | null;
    if (!el || !pagesRef.current) return;
    if (libro) pagesRef.current.scrollTo({ left: (el.parentElement as HTMLElement).offsetLeft, behavior: "smooth" });
    else pagesRef.current.scrollTo({ top: el.offsetTop - 16, behavior: "smooth" });
  }, [libro]);
  // libro: pagina (o coppia di pagine) precedente/successiva
  const sfoglia = useCallback((d: number) => {
    const g = gruppi.findIndex((x) => x.includes(currentPage));
    const n = gruppi[Math.min(Math.max(g + d, 0), gruppi.length - 1)];
    if (n) scrollTo(n[0]);
  }, [gruppi, currentPage, scrollTo]);
  // cambiando modo di lettura si resta sulla stessa pagina
  const cambiaVista = (v: Partial<Vista>) => {
    const p = currentPage;
    if (v.libro !== undefined && v.libro !== vista.libro) setZoom(v.libro ? "page" : "width");   // libro: una "doppia pagina" per schermata
    setVista({ ...vista, ...v });
    window.setTimeout(() => {
      const el = pagesRef.current?.querySelector(`[data-page="${p}"]`) as HTMLElement | null;
      if (!el || !pagesRef.current) return;
      if (v.libro ?? vista.libro) pagesRef.current.scrollLeft = (el.parentElement as HTMLElement).offsetLeft;
      else pagesRef.current.scrollTop = el.offsetTop - 16;
    }, 30);
  };
  // Ctrl+L = presentazione a schermo intero (come Acrobat); nel libro le frecce e la rotellina sfogliano
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (presenta) return;
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "l") {
        e.preventDefault();
        setPresenta(true);
        return;
      }
      if (!libro || e.ctrlKey || e.metaKey || e.altKey) return;
      if ((e.target as HTMLElement).closest("input,textarea,select,[contenteditable]") || interaction.selectedId) return;
      const d = { ArrowRight: 1, PageDown: 1, ArrowLeft: -1, PageUp: -1 }[e.key];
      if (d) { e.preventDefault(); sfoglia(d); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [presenta, libro, sfoglia, interaction.selectedId]);
  useEffect(() => {
    const el = pagesRef.current;
    if (!el || !libro) return;
    let ultimo = 0;
    const onWheel = (e: WheelEvent) => {
      // rotellina in su/giù nel libro: pagina prima/dopo (se la pagina non va fatta scorrere in verticale)
      if (e.ctrlKey || Math.abs(e.deltaX) > Math.abs(e.deltaY) || el.scrollHeight > el.clientHeight + 4) return;
      e.preventDefault();
      if (Date.now() - ultimo < 350) return;
      ultimo = Date.now();
      sfoglia(e.deltaY > 0 ? 1 : -1);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [libro, sfoglia]);

  useEffect(() => {
    if (goto) scrollTo(goto.page);
  }, [goto, scrollTo]);

  // pagina corrente = la prima del gruppo più visibile (nel libro: quello al centro dello schermo)
  const onScroll = () => {
    const el = pagesRef.current;
    if (!el) return;
    const mid = libro ? el.scrollLeft + el.clientWidth / 2 : el.scrollTop + el.clientHeight / 3;
    const nodes = el.querySelectorAll<HTMLElement>("[data-gruppo]");
    let best = 0;
    nodes.forEach((n) => {
      if ((libro ? n.offsetLeft : n.offsetTop) <= mid) best = Number(n.dataset.gruppo);
    });
    if (best !== currentPage) onPageChange(best);
  };

  const doSearch = async () => {
    if (!onSearch || !query.trim()) return;
    const res = await onSearch(query.trim());
    setHits(res);
    setHitIdx(0);
    if (res.length) scrollTo(res[0].page);
  };
  const step = (d: number) => {
    if (!hits.length) return;
    const i = (hitIdx + d + hits.length) % hits.length;
    setHitIdx(i);
    scrollTo(hits[i].page);
  };

  const allOverlays: Overlay[] = [
    ...overlays,
    ...hits.map((h, i) => ({
      id: `hit${i}`, page: h.page, kind: "match" as const,
      rect: { x: h.rect[0], y: h.rect[1], w: h.rect[2] - h.rect[0], h: h.rect[3] - h.rect[1] },
      style: i === hitIdx ? { borderColor: "#f59e0b", background: "rgba(245,158,11,.35)" } : undefined,
    })),
  ];

  return (
    <div className="viewer-wrap main-viewer">
      <div className="viewer-bar main-bar">
        <button className="btn icon ghost" title="Miniature" onClick={() => setShowThumbs((v) => !v)}><PanelLeft size={17} /></button>
        <div className="sep" />
        <div className="pageinfo">
          {!mobile && "Pagina"}
          <input className="pagenum" value={pageInput} inputMode="numeric" aria-label="Pagina" onChange={(e) => setPageInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                const n = Math.min(Math.max(parseInt(pageInput) || 1, 1), sizes.length);
                scrollTo(n - 1);
                if (mobile) (e.target as HTMLInputElement).blur();
              }
            }} />
          di {sizes.length}
        </div>
        <div className="sep" />
        {mobile ? (
          // telefono: solo il menu a tendina, con "Adatta" tra le scelte
          <select className="input zoom-mobile" aria-label="Zoom" value={zoom === "width" || zoom === "page" ? zoom : "cur"}
            onChange={(e) => { const v = e.target.value; if (v === "width" || v === "page") setZoom(v); else if (v !== "cur") setPct(Number(v)); }}>
            <option value="width">Adatta</option>
            <option value="page">Pagina intera</option>
            {zoom !== "width" && zoom !== "page" && <option value="cur" hidden>{pct}%</option>}
            {ZOOM_STEPS.map((z) => <option key={z} value={z}>{z}%</option>)}
          </select>
        ) : (
          <>
            <button className="btn icon ghost" title="Riduci (Ctrl + rotellina)" onClick={() => setPct(ZOOM_STEPS.slice().reverse().find((z) => z < pct - 1) ?? pct / 1.25)}><ZoomOut size={17} /></button>
            <div className="zoom-box">
              <input className="zoom-input" value={zoomInput} aria-label="Zoom" onChange={(e) => setZoomInput(e.target.value)}
                onFocus={(e) => e.target.select()}
                onKeyDown={(e) => { if (e.key === "Enter") { const v = parseFloat(zoomInput); if (v > 0) setPct(v); (e.target as HTMLInputElement).blur(); } }}
                onBlur={() => setZoomInput(`${pct}%`)} />
              <select className="zoom-select" aria-label="Livelli di zoom" value=""
                onChange={(e) => { const v = e.target.value; if (v === "width" || v === "page") setZoom(v); else if (v) setPct(Number(v)); }}>
                <option value="" disabled hidden>▾</option>
                {ZOOM_STEPS.map((z) => <option key={z} value={z}>{z}%</option>)}
                <option value="width">Adatta alla larghezza</option>
                <option value="page">Pagina intera</option>
              </select>
            </div>
            <button className="btn icon ghost" title="Ingrandisci (Ctrl + rotellina)" onClick={() => setPct(ZOOM_STEPS.find((z) => z > pct + 1) ?? pct * 1.25)}><ZoomIn size={17} /></button>
            <button className={`btn small ghost ${zoom === "width" ? "on" : ""}`} onClick={() => setZoom("width")} title="Adatta alla larghezza">Adatta</button>
            <button className={`btn small ghost ${zoom === 100 ? "on" : ""}`} onClick={() => setZoom(100)} title="Dimensione reale">100%</button>
          </>
        )}
        <button ref={btnVista} className={`btn icon ghost ${menuVista ? "on" : ""}`} title="Vista: pagine singole o doppie, verticale o a libro, presentazione"
          aria-label="Vista" aria-haspopup="menu" aria-expanded={menuVista} onClick={() => setMenuVista((v) => !v)}><BookOpen size={17} /></button>
        {menuVista && (
          <Popover anchor={btnVista} onClose={() => setMenuVista(false)} width={270} className="menu theme-pop vista-pop" role="menu" label="Vista">
            <div className="menu-title">Pagine</div>
            <button type="button" role="menuitemradio" aria-checked={!vista.doppia} onClick={() => cambiaVista({ doppia: false })}>
              <span className="grow">Una pagina alla volta</span>{!vista.doppia && <Check size={15} />}</button>
            <button type="button" role="menuitemradio" aria-checked={vista.doppia} onClick={() => cambiaVista({ doppia: true })}>
              <span className="grow">Due pagine affiancate</span>{vista.doppia && <Check size={15} />}</button>
            {vista.doppia && (
              <button type="button" role="menuitemcheckbox" aria-checked={vista.copertina} onClick={() => cambiaVista({ copertina: !vista.copertina })}>
                <span className="grow">Copertina da sola<small>come un libro: 1, poi 2-3, 4-5…</small></span>{vista.copertina && <Check size={15} />}</button>
            )}
            <div className="menu-sep" />
            <div className="menu-title">Scorrimento</div>
            <button type="button" role="menuitemradio" aria-checked={!vista.libro} onClick={() => cambiaVista({ libro: false })}>
              <span className="grow">Verticale<small>le pagine una sotto l'altra</small></span>{!vista.libro && <Check size={15} />}</button>
            <button type="button" role="menuitemradio" aria-checked={vista.libro} onClick={() => cambiaVista({ libro: true })}>
              <span className="grow">Orizzontale, come un libro<small>si sfoglia con le frecce, la rotellina o il dito</small></span>{vista.libro && <Check size={15} />}</button>
            <div className="menu-sep" />
            <button type="button" role="menuitem" onClick={() => { setMenuVista(false); setPresenta(true); }}>
              <Presentation size={16} /><span className="grow">Presentazione a schermo intero</span><kbd className="kbd-hint">Ctrl+L</kbd></button>
          </Popover>
        )}
        <div style={{ flex: 1 }} />
        {onSearch && compactSearch && !searchOpen && (
          <button className="btn icon ghost" title="Cerca nel documento" aria-label="Cerca nel documento" onClick={() => setSearchOpen(true)}><Search size={18} /></button>
        )}
        {onSearch && (!compactSearch || searchOpen) && (
          <div className={compactSearch ? "search-pop" : undefined} style={compactSearch ? undefined : { display: "flex", alignItems: "center", gap: 4, minWidth: 0 }}>
            <Search size={15} color="var(--muted)" style={{ flex: "none" }} />
            <input className="input" style={compactSearch ? { flex: 1, minWidth: 0, height: 36 } : { width: 170, minWidth: 90, flexShrink: 1, height: 28, minHeight: 28 }} placeholder="Cerca nel documento"
              autoFocus={compactSearch} enterKeyHint="search"
              value={query} onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") (hits.length && query ? step(1) : doSearch()); }} />
            {hits.length > 0 && <span style={{ color: "var(--muted)", flex: "none" }}>{hitIdx + 1}/{hits.length}</span>}
            <button className="btn icon ghost small" onClick={() => step(-1)} disabled={!hits.length}><ChevronUp size={15} /></button>
            <button className="btn icon ghost small" onClick={() => step(1)} disabled={!hits.length}><ChevronDown size={15} /></button>
            {(compactSearch || hits.length > 0 || query) && <button className="btn icon ghost small" title="Chiudi la ricerca" aria-label="Chiudi la ricerca"
              onClick={() => { setHits([]); setQuery(""); setSearchOpen(false); }}><X size={15} /></button>}
          </div>
        )}
      </div>
      <div className="viewer-body" style={{ gridTemplateColumns: showThumbs ? "150px 1fr" : "1fr" }}>
        {showThumbs && <Thumbs pdf={pdf} count={sizes.length} current={currentPage} onPick={scrollTo} />}
        <div className={`pages ${libro ? "libro" : ""} ${vista.doppia ? "doppia" : ""}`} ref={pagesRef} onScroll={onScroll}>
          {gruppi.map((g) => (
            <div key={g.join("-")} className="gruppo" data-gruppo={g[0]}>
              {g.map((i) => (
                <PageView key={i} pdf={pdf} index={i} size={sizes[i]} scale={scale} tsel={tsel}
                  overlays={allOverlays.filter((o) => o.page === i)} interaction={interaction}
                  notes={notes.filter((n) => n.page === i)} openNote={openNote} setOpenNote={setOpenNote} />
              ))}
            </div>
          ))}
        </div>
        {libro && gruppi.length > 1 && (
          <>
            <button type="button" className="sfoglia prima" onClick={() => sfoglia(-1)} disabled={gruppi[0].includes(currentPage)}
              aria-label="Pagina precedente" title="Pagina precedente (←)"><ChevronLeft size={26} /></button>
            <button type="button" className="sfoglia dopo" onClick={() => sfoglia(1)} disabled={gruppi[gruppi.length - 1].includes(currentPage)}
              aria-label="Pagina successiva" title="Pagina successiva (→)"><ChevronRight size={26} /></button>
          </>
        )}
      </div>
      {presenta && <Presentazione pdf={pdf} sizes={sizes} gruppi={gruppi} inizio={currentPage}
        onClose={(p) => { setPresenta(false); window.setTimeout(() => scrollTo(p), 30); }} />}
    </div>
  );
}

function Thumbs({ pdf, count, current, onPick }: { pdf: PDFDoc; count: number; current: number; onPick: (p: number) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current?.querySelector(`[data-thumb="${current}"]`) as HTMLElement | null;
    el?.scrollIntoView({ block: "nearest" });
  }, [current]);
  return (
    <div className="thumbs" ref={ref}>
      {Array.from({ length: count }, (_, i) => (
        <Thumb key={i} pdf={pdf} index={i} active={i === current} onClick={() => onPick(i)} />
      ))}
    </div>
  );
}

export function Thumb({ pdf, index, active, onClick, width = 120 }: { pdf: PDFDoc; index: number; active?: boolean; onClick?: () => void; width?: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const holder = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setVisible(true), { rootMargin: "300px" });
    if (holder.current) io.observe(holder.current);
    return () => io.disconnect();
  }, []);
  useEffect(() => {
    if (visible && canvas.current) renderThumb(pdf, index, canvas.current, width).catch(() => {});
  }, [visible, pdf, index, width]);
  return (
    <div ref={holder} data-thumb={index} className={`thumb ${active ? "active" : ""}`} onClick={onClick}>
      <canvas ref={canvas} style={{ minHeight: visible ? undefined : 150 }} />
      <div>{index + 1}</div>
    </div>
  );
}

interface PageProps {
  pdf: PDFDoc;
  index: number;
  size: PageSize;
  scale: number;
  overlays: Overlay[];
  interaction: Interaction;
  notes: NoteInfo[];
  openNote: string | null;
  setOpenNote: (nm: string | null) => void;
  tsel: TouchSelApi | null;
}

function PageView({ pdf, index, size, scale, overlays, interaction, notes, openNote, setOpenNote, tsel }: PageProps) {
  const hideAnnots = !!interaction.hideAnnotations;
  const holder = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const textLayer = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [drag, setDrag] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const w = size.w * scale;
  const h = size.h * scale;

  useEffect(() => {
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { rootMargin: "600px" });
    if (holder.current) io.observe(holder.current);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    let task: any;
    let tl: any;
    (async () => {
      const page = await pdf.getPage(index + 1);
      if (cancelled || !canvas.current) return;
      const dpr = window.devicePixelRatio || 1;
      const vp = page.getViewport({ scale: scale * dpr });
      const c = canvas.current;
      c.width = Math.floor(vp.width);
      c.height = Math.floor(vp.height);
      c.style.width = `${w}px`;
      c.style.height = `${h}px`;
      // durante la modifica delle forme le annotazioni si disegnano come oggetti modificabili (non due volte)
      task = page.render({ canvasContext: c.getContext("2d")!, viewport: vp,
        annotationMode: hideAnnots ? pdfjs.AnnotationMode.DISABLE : pdfjs.AnnotationMode.ENABLE_FORMS });
      try { await task.promise; } catch { return; }
      if (cancelled || !textLayer.current) return;
      textLayer.current.innerHTML = "";
      const tvp = page.getViewport({ scale });
      textLayer.current.style.setProperty("--scale-factor", String(scale));
      tl = new pdfjs.TextLayer({ textContentSource: page.streamTextContent(), container: textLayer.current, viewport: tvp });
      tl.render().catch(() => {});
    })();
    return () => {
      cancelled = true;
      task?.cancel?.();
      tl?.cancel?.();
    };
  }, [visible, pdf, index, scale, w, h, hideAnnots]);

  useEffect(() => {
    if (visible && interaction.needSpans && !interaction.spans?.[index]) interaction.needSpans(index);
    if (visible && interaction.needWords) interaction.needWords(index);
  }, [visible, interaction, index]);
  const selFrom = useRef<{ x: number; y: number } | null>(null);

  const toPt = (e: { clientX: number; clientY: number }) => {
    const r = holder.current!.getBoundingClientRect();
    return { x: (e.clientX - r.left) / scale, y: (e.clientY - r.top) / scale };
  };
  const rectMode = interaction.mode === "rect";
  const objMode = interaction.mode === "objects";
  const selMode = interaction.mode === "textsel";

  // dito (telefono/tablet): un tocco "semplice" si riconosce al rilascio, così scorrere la pagina non inserisce niente
  const tap = useRef<{ x: number; y: number; id: number } | null>(null);
  const drawMode = rectMode || selMode || (objMode && !!interaction.onDraw);
  const onDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest(".note-hot,.note-pop")) return;
    if (e.pointerType === "touch" && !e.isPrimary) return;   // secondo dito: zoom/scorrimento a due dita
    if (e.pointerType === "touch" && objMode && !interaction.onDraw) {
      if (!(e.target as HTMLElement).closest(".obj,.ov-span,.ov-del")) tap.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
      return;
    }
    if (drawMode && e.button === 0) {
      try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* già rilasciato */ }
    }
    if (selMode && e.button === 0) {
      // selezione del testo come in Word: dal punto in cui si preme a quello in cui si rilascia
      e.preventDefault();
      const p = toPt(e);
      selFrom.current = p;
      interaction.onTextSel?.(index, p, p, false);
      return;
    }
    if (objMode && e.button === 0) {
      if ((e.target as HTMLElement).closest(".obj,.ov-span,.ov-del")) return;
      if (interaction.onDraw) {
        // si può disegnare trascinando (forme); un semplice clic inserisce a dimensione predefinita
        e.preventDefault();
        const p = toPt(e);
        setDrag({ x0: p.x, y0: p.y, x1: p.x, y1: p.y });
        return;
      }
      if (interaction.onPlace) interaction.onPlace(index, toPt(e));
      else interaction.onSelect?.(null);
      return;
    }
    if (!rectMode || e.button !== 0) return;
    e.preventDefault();
    const p = toPt(e);
    setDrag({ x0: p.x, y0: p.y, x1: p.x, y1: p.y });
  };
  const onMove = (e: React.PointerEvent) => {
    if (selFrom.current) { interaction.onTextSel?.(index, selFrom.current, toPt(e), false); return; }
    if (!drag) return;
    const p = toPt(e);
    setDrag({ ...drag, x1: Math.min(Math.max(p.x, 0), size.w), y1: Math.min(Math.max(p.y, 0), size.h) });
  };
  const onCancel = () => { tap.current = null; selFrom.current = null; setDrag(null); };
  const onUp = (e: React.PointerEvent) => {
    if (tap.current && e.pointerId === tap.current.id) {
      const t = tap.current;
      tap.current = null;
      if (Math.hypot(e.clientX - t.x, e.clientY - t.y) > 10) return;   // era uno scorrimento
      if (interaction.onPlace) interaction.onPlace(index, toPt(e));
      else interaction.onSelect?.(null);
      return;
    }
    if (selFrom.current) {
      const from = selFrom.current;
      selFrom.current = null;
      interaction.onTextSel?.(index, from, toPt(e), true);
      return;
    }
    if (!drag) return;
    const r: VRect = {
      x: Math.min(drag.x0, drag.x1), y: Math.min(drag.y0, drag.y1),
      w: Math.abs(drag.x1 - drag.x0), h: Math.abs(drag.y1 - drag.y0),
    };
    setDrag(null);
    if (objMode && interaction.onDraw) {
      if (r.w > 3 || r.h > 3) interaction.onDraw(index, r, { x: drag.x0, y: drag.y0 }, { x: drag.x1, y: drag.y1 });
      else if (interaction.onPlace) interaction.onPlace(index, { x: drag.x0, y: drag.y0 });
      else interaction.onSelect?.(null);
      return;
    }
    if (r.w > 4 && r.h > 4) interaction.onRect?.(index, r);
  };

  // app Android: tenendo premuto su una parola parte la selezione del testo (vedi TouchTextSel)
  const lp = useRef<{ x: number; y: number; id: number; timer: number; long: boolean } | null>(null);
  const lpOn = !!tsel && interaction.mode === "none";
  const lpDown = (e: React.PointerEvent) => {
    if (!lpOn || e.pointerType !== "touch") return;
    if (lp.current) { clearTimeout(lp.current.timer); lp.current = null; }
    if (!e.isPrimary || (e.target as HTMLElement).closest(".note-hot,.note-pop,.tsel-bar,.sel-handle")) return;
    const pt = toPt(e);
    const cur = { x: e.clientX, y: e.clientY, id: e.pointerId, long: false, timer: 0 };
    cur.timer = window.setTimeout(() => { cur.long = true; tsel!.start(index, pt); }, 450);
    lp.current = cur;
  };
  const lpMove = (e: React.PointerEvent) => {
    const c = lp.current;
    if (c && e.pointerId === c.id && !c.long && Math.hypot(e.clientX - c.x, e.clientY - c.y) > 10) { clearTimeout(c.timer); lp.current = null; }
  };
  const lpUp = (e: React.PointerEvent) => {
    const c = lp.current;
    if (!c || e.pointerId !== c.id) return;
    clearTimeout(c.timer);
    lp.current = null;
    // tocco breve fuori dalla selezione: la selezione si chiude
    if (!c.long && e.type === "pointerup" && tsel?.sel) tsel.clear();
  };
  const box = (r: VRect): React.CSSProperties => ({ left: r.x * scale, top: r.y * scale, width: r.w * scale, height: r.h * scale });
  // app Android: le note sono un riquadro colorato ben visibile (almeno 28 px), non solo l'icona del PDF
  const noteVis = isLocalEngine();
  const noteBox = (r: VRect, color?: string | null): React.CSSProperties => {
    const s = Math.max(28, r.w * scale, r.h * scale);
    return { left: (r.x + r.w / 2) * scale - s / 2, top: (r.y + r.h / 2) * scale - s / 2, width: s, height: s, background: color || "#fdc300" };
  };
  const spans = interaction.mode === "spans" || objMode ? interaction.spans?.[index] || [] : [];
  const objects = objMode ? (interaction.objects || []).filter((o) => o.page === index) : [];
  // icone delle note cliccabili: a riposo e nello strumento Commenti (non mentre si usano altri strumenti)
  const showNotes = interaction.mode === "none" || !!interaction.onNoteEdit;
  const draft = interaction.noteDraft && interaction.noteDraft.page === index ? interaction.noteDraft : null;

  return (
    <div className={`page ${tsel ? "touch-sel" : ""}`} ref={holder} data-page={index} style={{ width: w, height: h }}
      onPointerDown={tsel ? lpDown : undefined} onPointerMove={tsel ? lpMove : undefined}
      onPointerUp={tsel ? lpUp : undefined} onPointerCancel={tsel ? lpUp : undefined}
      onContextMenu={tsel ? (e) => e.preventDefault() : undefined}>
      <canvas ref={canvas} style={{ width: w, height: h }} />
      {/* app Android: niente selezione nativa (inaffidabile sul testo trasparente): la gestisce TouchSelLayer */}
      <div className="textLayer" ref={textLayer} style={{ pointerEvents: interaction.mode === "none" && !tsel ? "auto" : "none" }} />
      <div className={`overlay ${rectMode || (objMode && interaction.onPlace) ? "crosshair" : ""} ${selMode ? "textcursor" : ""}`}
        title={objMode ? interaction.placeHint : selMode ? interaction.cursorHint : undefined}
        style={{ pointerEvents: interaction.mode === "none" && !overlays.some((o) => o.onDelete) ? "none" : "auto",
          // disegno con il dito (aree, forme, selezione del testo): la pagina si sposta con due dita
          touchAction: drawMode ? "none" : undefined }}
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onCancel}
        onPointerLeave={(e) => { if (e.pointerType === "mouse") onUp(e); }}>
        {spans.map((s) => <SpanBox key={s.id} s={s} page={index} scale={scale} interaction={interaction} />)}
        {overlays.map((o) => (
          <div key={o.id} className={`ov-box ${o.kind === "fill" ? "fill" : o.kind === "match" ? "match" : ""}`}
            style={{ ...box(o.rect), ...(o.kind === "image" || o.kind === "text" ? { background: "rgba(30,57,108,.04)" } : {}), ...(o.kind === "text" ? {} : o.style) }}>
            {o.kind === "image" && o.imageUrl && <img className="ov-image" src={o.imageUrl} style={{ inset: 0, width: "100%", height: "100%" }} />}
            {o.kind === "text" && o.text && <div className="ov-text" style={{ inset: 0, ...o.style, fontSize: (o.fontPt || 12) * scale }}>{o.text}</div>}
            {o.label && <span className="ov-label">{o.label}</span>}
            {o.onDelete && (
              <button className="ov-del" title="Rimuovi" onMouseDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); o.onDelete!(); }}>×</button>
            )}
          </div>
        ))}
        {objects.map((o) => <ObjectBox key={o.id} obj={o} scale={scale} page={size} interaction={interaction} />)}
        {showNotes && notes.map((n) => (
          <button key={n.nm} type="button" className={`note-hot ${openNote === n.nm ? "on" : ""} ${noteVis ? "vis" : ""}`}
            style={noteVis ? noteBox(n.rect, n.color) : box(n.rect)}
            title={`Nota${n.author ? ` di ${n.author}` : ""}: clic per aprirla`} aria-label={`Apri la nota${n.author ? ` di ${n.author}` : ""}`}
            onMouseDown={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); setOpenNote(openNote === n.nm ? null : n.nm); }}>
            {noteVis && <MessageSquareText size={16} />}
          </button>
        ))}
        {showNotes && notes.filter((n) => n.nm === openNote).map((n) => (
          <NotePopup key={n.nm + n.content} anchor={n.rect} pageW={size.w} scale={scale} color={n.color} author={n.author} date={n.date}
            text={n.content} editable={!!interaction.onNoteEdit}
            onSave={(t) => { setOpenNote(null); interaction.onNoteEdit?.(n.xref, t); }} onClose={() => setOpenNote(null)}
            onDelete={interaction.onNoteDelete ? () => { setOpenNote(null); interaction.onNoteDelete!(n.xref); } : undefined} />
        ))}
        {draft && (
          <>
            <span className="note-hot draft" style={box({ x: draft.point.x - 9, y: draft.point.y - 9, w: 18, h: 18 })} />
            <NotePopup anchor={{ x: draft.point.x - 9, y: draft.point.y - 9, w: 18, h: 18 }} pageW={size.w} scale={scale} color={draft.color}
              text="" editable isDraft onSave={(t) => interaction.onNoteDraft?.(t)} onClose={() => interaction.onNoteDraft?.(null)} />
          </>
        )}
        {interaction.selHandles?.page === index && (["a", "b"] as const).map((k) => {
          const pt = interaction.selHandles![k];
          return (
            <span key={k} className={`sel-handle sel-${k}`} style={{ left: pt.x * scale, top: pt.y * scale }}
              onPointerDown={(e) => { e.stopPropagation(); e.preventDefault(); (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); }}
              onPointerMove={(e) => { if ((e.currentTarget as HTMLElement).hasPointerCapture(e.pointerId)) { const q = toPt(e); interaction.selHandles?.onMove(k, { x: q.x, y: q.y - 18 / scale }); } }} />
          );
        })}
        {drag && <div className="ov-box" style={box({ x: Math.min(drag.x0, drag.x1), y: Math.min(drag.y0, drag.y1), w: Math.abs(drag.x1 - drag.x0), h: Math.abs(drag.y1 - drag.y0) })} />}
      </div>
      {tsel && interaction.mode === "none" && <TouchSelLayer api={tsel} page={index} scale={scale} pageW={size.w} toPt={toPt} />}
    </div>
  );
}

function SpanBox({ s, page, scale, interaction }: { s: Span; page: number; scale: number; interaction: Interaction }) {
  const key = `${page}:${s.id}`;
  const edit = interaction.edits?.[key];
  const sel = interaction.selectedSpan === key;
  const [x0, y0, x1, y1] = s.bbox;
  const style: React.CSSProperties = { left: x0 * scale - 1, top: y0 * scale - 1, width: (x1 - x0) * scale + 2, height: (y1 - y0) * scale + 2 };
  if (edit) {
    Object.assign(style, {
      ...interaction.fontStyle?.(edit.font === "original" ? s.suggested_font : edit.font),
      fontSize: edit.size * scale, color: edit.color, paddingBottom: (y1 - s.origin[1]) * scale * 0.6,
      minWidth: (x1 - x0) * scale + 2, width: "auto",
    });
  }
  return (
    <div className={`ov-span ${sel ? "sel" : ""} ${edit ? "edited" : ""}`} style={style} title={edit ? "" : s.text}
      onMouseDown={(e) => { e.stopPropagation(); interaction.onSpanClick?.(page, s); }}>
      {edit ? edit.text : null}
    </div>
  );
}
