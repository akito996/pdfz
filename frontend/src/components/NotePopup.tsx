import { useEffect, useRef, useState } from "react";
import { Check, Trash2, X } from "lucide-react";

const fmt = (v: string) => {
  if (!v) return "";
  const d = new Date(v);
  return isNaN(d.getTime()) ? v : d.toLocaleString("it-IT", { dateStyle: "short", timeStyle: "short" });
};

/** Nota aperta sulla pagina: si scrive direttamente qui; la casella si adatta al testo.
 *  Chiudendola (clic fuori, Esc o ×) torna a essere solo l'icona. */
export function NotePopup({ anchor, pageW, scale, color, author, date, text, editable, isDraft, onSave, onClose, onDelete }: {
  anchor: { x: number; y: number; w: number; h: number };   // punti PDF (pagina vista)
  pageW: number;
  scale: number;
  color?: string | null;
  author?: string;
  date?: string;
  text: string;
  editable: boolean;
  isDraft?: boolean;
  onSave?: (text: string) => void;
  onClose: () => void;     // chiusura senza salvare (bozza vuota = annullata)
  onDelete?: () => void;
}) {
  const [value, setValue] = useState(text);
  const box = useRef<HTMLDivElement>(null);
  const ta = useRef<HTMLTextAreaElement>(null);
  const state = useRef({ value, text, editable, isDraft });
  state.current = { value, text, editable, isDraft };

  const finish = () => {
    const s = state.current;
    const v = s.value.trim();
    if (s.editable && v && v !== s.text.trim()) onSave?.(s.value);
    else onClose();
  };
  const finishRef = useRef(finish);
  finishRef.current = finish;

  useEffect(() => { setValue(text); }, [text]);
  useEffect(() => {
    if (editable && ta.current) {
      ta.current.focus();
      const n = ta.current.value.length;
      ta.current.setSelectionRange(n, n);
    }
  }, [editable]);
  useEffect(() => {
    // clic fuori: la nota si salva e si riduce a icona; il clic sulla pagina non crea subito un'altra nota
    const down = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (box.current?.contains(t) || t.closest?.(".note-hot")) return;
      if (t.closest?.(".page")) { e.stopPropagation(); e.preventDefault(); }
      finishRef.current();
    };
    document.addEventListener("mousedown", down, true);
    return () => document.removeEventListener("mousedown", down, true);
  }, []);

  // a destra dell'icona; se non c'è spazio, a sinistra. Pagina stretta (telefono): sotto l'icona, larga quanto la pagina
  const narrow = pageW * scale < 480;
  const right = (anchor.x + anchor.w) * scale + 300 > pageW * scale;
  const style: React.CSSProperties = narrow
    ? { left: 6, right: 6, width: "auto", maxWidth: "none", top: (anchor.y + anchor.h) * scale + 16 }
    : right
      ? { right: (pageW - anchor.x) * scale + 6, top: anchor.y * scale }
      : { left: (anchor.x + anchor.w) * scale + 6, top: anchor.y * scale };
  // la nota aperta si porta in vista (anche se era coperta dal pannello in basso)
  useEffect(() => { box.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }); }, []);

  return (
    <div ref={box} className="note-pop" style={{ ...style, borderTopColor: color || "#fdc300" }} role="dialog" aria-label="Nota"
      onMouseDown={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
      <div className="note-pop-head">
        <span className="cdot" style={{ background: color || "#fdc300" }} />
        <b className="grow">{author || (isDraft ? "Nuova nota" : "Nota")}</b>
        {date && <span className="cdate">{fmt(date)}</span>}
        <button type="button" className="note-x" title="Chiudi (Esc)" aria-label="Chiudi la nota" onClick={() => finishRef.current()}><X size={13} /></button>
      </div>
      {editable ? (
        <div className="note-grow" data-value={value + " "}>
          <textarea ref={ta} rows={1} value={value} placeholder="Scrivi la nota…" aria-label="Testo della nota"
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") { e.preventDefault(); finishRef.current(); }
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); finishRef.current(); }
            }} />
        </div>
      ) : (
        <div className="note-read">{text || <i>Nota vuota</i>}</div>
      )}
      {editable && (
        <div className="note-pop-foot">
          <button type="button" className="btn small primary" disabled={!value.trim()} onClick={() => finishRef.current()}><Check size={13} /> {isDraft ? "Aggiungi" : "Salva"}</button>
          {isDraft
            ? <button type="button" className="btn small ghost" onClick={onClose}>Annulla</button>
            : onDelete && <button type="button" className="btn small ghost danger" onClick={onDelete} title="Elimina la nota"><Trash2 size={13} /></button>}
          <span className="note-kbd"><kbd>Ctrl</kbd>+<kbd>Invio</kbd></span>
        </div>
      )}
    </div>
  );
}
