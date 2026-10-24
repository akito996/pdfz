import { Move } from "lucide-react";
import { ShapeSvg } from "./ShapeSvg";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { suggestTexts } from "../textHistory";
import type { Interaction, PageObject, VRect } from "../types";

type Handle = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";
const HANDLES: Handle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];
const CORNERS: Handle[] = ["nw", "ne", "se", "sw"];

/** Caselle sulla pagina stile Acrobat: si spostano trascinando il bordo, si ridimensionano
 *  dalle maniglie e, se sono di testo, si scrive direttamente al loro interno. */
export function ObjectBox({ obj, scale, page, interaction }: {
  obj: PageObject; scale: number; page: { w: number; h: number }; interaction: Interaction;
}) {
  const selected = interaction.selectedId === obj.id;
  const ta = useRef<HTMLTextAreaElement>(null);
  const r = obj.rect;

  const change = (patch: Partial<PageObject>) => interaction.onObjectChange?.(obj.id, patch);
  // suggerimenti: testi già usati che iniziano (o contengono) quello che si sta scrivendo
  const [sugOff, setSugOff] = useState(false);
  const editable = obj.kind === "text" && selected && !obj.locked;
  const sugs = editable && !sugOff ? suggestTexts(obj.text || "") : [];
  const pickSug = (t: string) => {
    if (ta.current) { ta.current.value = t; ta.current.focus(); ta.current.setSelectionRange(t.length, t.length); }
    change({ text: t });
    setSugOff(true);
  };

  const mirror = useRef<HTMLSpanElement>(null);
  // larghezza e altezza delle caselle di testo seguono il contenuto
  useLayoutEffect(() => {
    if (obj.kind !== "text") return;
    let { w, h } = r;
    if (obj.autoWidth && mirror.current) {
      const natural = mirror.current.getBoundingClientRect().width / scale + 2;
      const maxW = Math.max(page.w - r.x - 4, 20);
      w = Math.min(Math.max(natural, obj.meta?.minW || 20), maxW);
    }
    const el = ta.current || (mirror.current?.parentElement?.querySelector(".obj-text") as HTMLElement | null);
    if (obj.autoHeight && el) {
      const prevW = el.style.width;
      el.style.width = `${w * scale}px`;
      el.style.height = "0px";
      h = Math.max(el.scrollHeight / scale, (obj.size || 12) * 1.25);
      el.style.height = "";
      el.style.width = prevW;
    }
    if (Math.abs(w - r.w) > 0.5 || Math.abs(h - r.h) > 0.5) change({ rect: { ...r, w, h } });
  }); // eslint-disable-line react-hooks/exhaustive-deps

  // il testo può cambiare anche dal pannello (es. "Elimina testo")
  useEffect(() => {
    if (ta.current && ta.current.value !== (obj.text || "")) ta.current.value = obj.text || "";
  }, [obj.text]);

  useEffect(() => {
    if (selected && obj.kind === "text" && ta.current && document.activeElement !== ta.current) {
      ta.current.focus();
      const n = ta.current.value.length;
      ta.current.setSelectionRange(n, n);
    }
  }, [selected]); // eslint-disable-line react-hooks/exhaustive-deps

  const startDrag = (e: React.PointerEvent, handle: Handle | null) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    interaction.onSelect?.(obj.id);
    if (obj.locked) return;
    e.preventDefault();
    const x0 = e.clientX, y0 = e.clientY;
    const start: VRect = { ...r };
    const ratio = start.w / Math.max(start.h, 1);
    const move = (ev: PointerEvent) => {
      const dx = (ev.clientX - x0) / scale;
      const dy = (ev.clientY - y0) / scale;
      let { x, y, w, h } = start;
      if (!handle) {
        x = clamp(start.x + dx, -start.w * 0.5, page.w - start.w * 0.5);
        y = clamp(start.y + dy, -start.h * 0.5, page.h - start.h * 0.5);
      } else {
        if (handle.includes("e")) w = Math.max(8, start.w + dx);
        if (handle.includes("s")) h = Math.max(6, start.h + dy);
        if (handle.includes("w")) { w = Math.max(8, start.w - dx); x = start.x + start.w - w; }
        if (handle.includes("n")) { h = Math.max(6, start.h - dy); y = start.y + start.h - h; }
        if (obj.keepRatio) {
          if (handle === "n" || handle === "s") w = h * ratio;
          else h = w / ratio;
          if (handle.includes("n")) y = start.y + start.h - h;
          if (handle.includes("w")) x = start.x + start.w - w;
        }
      }
      change({
        rect: { x, y, w, h },
        autoHeight: handle && (handle.includes("n") || handle.includes("s")) ? false : obj.autoHeight,
        autoWidth: handle && (handle.includes("e") || handle.includes("w")) ? false : obj.autoWidth,
      });
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const box: React.CSSProperties = { left: r.x * scale, top: r.y * scale, width: r.w * scale, height: r.h * scale };
  const textStyle: React.CSSProperties = {
    ...(obj.fontId ? interaction.fontStyle?.(obj.fontId) : {}),
    fontSize: (obj.size || 12) * scale, color: obj.color || "#000", textAlign: obj.align || "left",
    opacity: obj.opacity ?? 1, lineHeight: 1.2,
  };
  const handles = obj.locked ? [] : obj.keepRatio ? CORNERS : obj.kind === "text" ? ["e", "w", "s", "se", "sw", "ne", "nw", "n"] as Handle[] : HANDLES;

  return (
    <div className={`obj obj-${obj.kind} ${selected ? "sel" : ""} ${obj.cover ? "cover" : ""} ${obj.tone === "danger" ? "danger" : ""} ${obj.locked ? "locked" : ""} ${obj.big ? "big" : ""}`}
      style={box} onPointerDown={(e) => startDrag(e, null)}>
      {obj.kind === "shape" && (
        <ShapeSvg kind={obj.meta.shape} w={r.w * scale} h={r.h * scale} stroke={obj.meta.stroke} fill={obj.meta.fill}
          width={(obj.meta.width ?? 1.5) * scale} dash={obj.meta.dash} dir={obj.meta.dir} opacity={obj.opacity ?? 1} />
      )}
      {obj.kind === "image" && obj.imageUrl && (
        <img src={obj.imageUrl} draggable={false} style={{ width: "100%", height: "100%", objectFit: obj.keepRatio ? "contain" : "fill", opacity: obj.opacity ?? 1 }} />
      )}
      {obj.kind === "text" && (selected && !obj.locked ? (
        <textarea ref={ta} className="obj-text" defaultValue={obj.text || ""} spellCheck={false} style={textStyle}
          onPointerDown={(e) => e.stopPropagation()}
          onInput={(e) => { setSugOff(false); change({ text: e.currentTarget.value }); }}
          onKeyDown={(e) => {
            if (e.key === "Escape") { if (sugs.length) { setSugOff(true); return; } e.currentTarget.blur(); interaction.onSelect?.(null); }
            if (e.key === "Tab" && sugs.length) { e.preventDefault(); pickSug(sugs[0]); }   // Tab = accetta il primo suggerimento
          }} />
      ) : (
        <div className="obj-text" style={textStyle}>{obj.text || <span className="obj-ph">Scrivi qui…</span>}</div>
      ))}
      {obj.kind === "text" && obj.autoWidth && (
        <span ref={mirror} className="obj-mirror" style={textStyle} aria-hidden>{(obj.text || " ") + "\u00a0"}</span>
      )}
      {obj.label && <span className="ov-label">{obj.label}</span>}
      {selected && handles.map((h) => (
        <span key={h} className={`obj-h h-${h}`} onPointerDown={(e) => startDrag(e, h)} />
      ))}
      {sugs.length > 0 && (
        <div className="obj-sug" role="listbox" aria-label="Testi già usati"
          onPointerDown={(e) => { e.stopPropagation(); e.preventDefault(); }}>
          {sugs.map((t) => (
            <button key={t} type="button" role="option" title={t} onPointerDown={(e) => e.preventDefault()} onClick={() => pickSug(t)}>{t}</button>
          ))}
        </div>
      )}
      {/* casella di testo: mentre si scrive l'interno serve a scrivere, quindi per spostarla c'è la maniglia ✥
          (in alto a sinistra, fuori dal testo): si trascina dove si vuole, con il mouse o con il dito */}
      {selected && obj.kind === "text" && !obj.locked && (
        <button type="button" className={`ov-move ${r.y * scale < 44 ? "below" : ""}`} title="Trascina per spostare la casella"
          aria-label="Sposta la casella" onPointerDown={(e) => startDrag(e, null)}><Move size={14} /></button>
      )}
      {selected && interaction.onObjectDelete && (
        <button className="ov-del" title="Elimina (Canc)" onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); interaction.onObjectDelete!(obj.id); }}>×</button>
      )}
    </div>
  );
}

function clamp(v: number, a: number, b: number) {
  return Math.min(Math.max(v, a), b);
}
