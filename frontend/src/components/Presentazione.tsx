import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { desktop, isLocalEngine } from "../api";
import { useIndietro } from "../hooks";
import type { PDFDoc, PageSize } from "../pdf";

/**
 * Presentazione a schermo intero (Ctrl+L, come Acrobat): una pagina (o due affiancate) alla volta, grande quanto lo
 * schermo, su fondo nero. Avanti: → ↓ Pagina giù, spazio, Invio, clic o scorrimento del dito verso sinistra;
 * indietro: ← ↑ Pagina su, Backspace; Inizio/Fine; Esc o Ctrl+L per uscire.
 *
 * Schermo intero: nell'app desktop la finestra (pywebview), nel browser l'API Fullscreen; dove non c'è (iPhone) la
 * presentazione copre comunque tutta la pagina dell'app.
 */
export function Presentazione({ pdf, sizes, gruppi, inizio, onClose }: {
  pdf: PDFDoc; sizes: PageSize[]; gruppi: number[][]; inizio: number; onClose: (pagina: number) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [idx, setIdx] = useState(() => Math.max(0, gruppi.findIndex((g) => g.includes(inizio))));
  const [schermo, setSchermo] = useState({ w: window.innerWidth, h: window.innerHeight });
  const [comandi, setComandi] = useState(true);   // contatore e pulsanti: spariscono dopo 2,5 s senza movimento
  const gruppo = gruppi[Math.min(idx, gruppi.length - 1)] || [0];
  const chiudi = useRef(() => onClose(gruppo[0]));
  chiudi.current = () => onClose(gruppo[0]);
  const vai = (d: number) => setIdx((i) => Math.min(Math.max(i + d, 0), gruppi.length - 1));
  useIndietro(true, () => chiudi.current());   // Android: "indietro" esce dalla presentazione

  // schermo intero all'apertura, ritorno alla chiusura; uscendo dallo schermo intero (Esc del browser) si chiude
  useEffect(() => {
    const el = box.current;
    let browser = false;
    if (desktop.available()) desktop.fullScreen(true);
    else if (el?.requestFullscreen && !document.fullscreenElement) {
      el.requestFullscreen().then(() => { browser = true; }).catch(() => {});
    }
    // app Android: il WebView non fa lo schermo intero della pagina, si nascondono ora/batteria e tasti del sistema
    if (isLocalEngine()) import("../android/barre").then((m) => m.barreNascoste(true)).catch(() => {});
    const cambio = () => { if (browser && !document.fullscreenElement) chiudi.current(); };
    document.addEventListener("fullscreenchange", cambio);
    return () => {
      if (isLocalEngine()) import("../android/barre").then((m) => m.barreNascoste(false)).catch(() => {});
      document.removeEventListener("fullscreenchange", cambio);
      if (desktop.available()) desktop.fullScreen(false);
      else if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    };
  }, []);

  useEffect(() => {
    const ridimensiona = () => setSchermo({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", ridimensiona);
    return () => window.removeEventListener("resize", ridimensiona);
  }, []);

  useEffect(() => {
    const tasto = (e: KeyboardEvent) => {
      const k = e.key;
      if ((e.ctrlKey || e.metaKey) && k.toLowerCase() === "l") { e.preventDefault(); chiudi.current(); return; }
      if (k === "Escape") { e.preventDefault(); chiudi.current(); return; }
      if (["ArrowRight", "ArrowDown", "PageDown", " ", "Enter", "n"].includes(k)) vai(1);
      else if (["ArrowLeft", "ArrowUp", "PageUp", "Backspace", "p"].includes(k)) vai(-1);
      else if (k === "Home") setIdx(0);
      else if (k === "End") setIdx(gruppi.length - 1);
      else return;
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener("keydown", tasto, true);
    return () => window.removeEventListener("keydown", tasto, true);
  }, [gruppi.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // i comandi compaiono muovendo il mouse o toccando, poi si nascondono
  useEffect(() => {
    if (!comandi) return;
    const t = window.setTimeout(() => setComandi(false), 2500);
    return () => clearTimeout(t);
  }, [comandi, idx]);

  // dito: scorrimento orizzontale = pagina dopo/prima; tocco = comandi
  const tocco = useRef<{ x: number; y: number } | null>(null);
  const giu = (e: React.PointerEvent) => { tocco.current = { x: e.clientX, y: e.clientY }; };
  const su = (e: React.PointerEvent) => {
    const t = tocco.current;
    tocco.current = null;
    if (!t || (e.target as HTMLElement).closest("button")) return;
    const dx = e.clientX - t.x;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(e.clientY - t.y)) { vai(dx < 0 ? 1 : -1); return; }
    if (e.pointerType !== "mouse") { setComandi(true); return; }
    vai(e.clientX < window.innerWidth / 3 ? -1 : 1);   // clic: a sinistra indietro, altrove avanti
  };

  // dimensione: tutto il gruppo (1 o 2 pagine affiancate) dentro lo schermo
  const gap = gruppo.length > 1 ? 4 : 0;
  const largo = gruppo.reduce((s, i) => s + (sizes[i]?.w || 1), 0);
  const alto = Math.max(...gruppo.map((i) => sizes[i]?.h || 1));
  const scala = Math.max(0.05, Math.min((schermo.w - gap) / largo, schermo.h / alto));

  return createPortal(
    <div ref={box} className={`presenta ${comandi ? "" : "nascosti"}`} role="dialog" aria-label="Presentazione"
      onPointerDown={giu} onPointerUp={su} onPointerMove={(e) => { if (e.pointerType === "mouse") setComandi(true); }}>
      <div className="presenta-pagine" key={idx} style={{ gap }}>
        {gruppo.map((i) => <PaginaGrande key={i} pdf={pdf} index={i} w={(sizes[i]?.w || 1) * scala} h={(sizes[i]?.h || 1) * scala} />)}
      </div>
      <div className="presenta-barra">
        <button type="button" onClick={() => vai(-1)} disabled={idx === 0} aria-label="Pagina precedente" title="Pagina precedente (←)"><ChevronLeft size={22} /></button>
        <span>{gruppo.length > 1 ? `${gruppo[0] + 1}-${gruppo[gruppo.length - 1] + 1}` : gruppo[0] + 1} / {sizes.length}</span>
        <button type="button" onClick={() => vai(1)} disabled={idx >= gruppi.length - 1} aria-label="Pagina successiva" title="Pagina successiva (→)"><ChevronRight size={22} /></button>
      </div>
      <button type="button" className="presenta-chiudi" onClick={() => chiudi.current()} aria-label="Esci dalla presentazione" title="Esci (Esc)"><X size={22} /></button>
    </div>,
    document.body,
  );
}

/** Pagina disegnata alla dimensione dello schermo (nitida anche sugli schermi ad alta densità). */
function PaginaGrande({ pdf, index, w, h }: { pdf: PDFDoc; index: number; w: number; h: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [pronta, setPronta] = useState(false);
  useLayoutEffect(() => setPronta(false), [index]);
  useEffect(() => {
    let annullata = false;
    let task: any;
    (async () => {
      const page = await pdf.getPage(index + 1);
      const c = canvas.current;
      if (annullata || !c) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const base = page.getViewport({ scale: 1 });
      const vp = page.getViewport({ scale: (w / base.width) * dpr });
      // si disegna su un foglio a parte e si copia alla fine: niente pagina bianca mentre si disegna
      const tmp = document.createElement("canvas");
      tmp.width = Math.floor(vp.width);
      tmp.height = Math.floor(vp.height);
      task = page.render({ canvasContext: tmp.getContext("2d")!, viewport: vp });
      try { await task.promise; } catch { return; }
      if (annullata) return;
      c.width = tmp.width;
      c.height = tmp.height;
      c.getContext("2d")!.drawImage(tmp, 0, 0);
      setPronta(true);
    })();
    return () => { annullata = true; task?.cancel?.(); };
  }, [pdf, index, w]);
  return <canvas ref={canvas} className={pronta ? "pronta" : ""} style={{ width: w, height: h }} />;
}
