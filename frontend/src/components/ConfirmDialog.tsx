import { useEffect, useRef, useState } from "react";
import { useIndietro } from "../hooks";

export interface DialogButton { label: string; value: string; kind?: "primary" | "danger" }
/** Campo di testo nella finestra (al posto di window.prompt): il testo scritto arriva insieme al pulsante premuto. */
export interface DialogInput { value: string; placeholder?: string; suffix?: string }
export interface DialogRequest { title: string; body: React.ReactNode; buttons: DialogButton[]; input?: DialogInput }
export interface DialogResult { value: string; text: string }

/** Finestra dell'app per avvisi, conferme e domande (mai window.alert/confirm/prompt né finestre di sistema).
 *  L'ultimo pulsante è quello predefinito (Invio); Esc sceglie il primo. Con il campo di testo, Invio conferma
 *  solo se il testo non è vuoto. */
export function ConfirmDialog({ req, onChoose }: { req: DialogRequest; onChoose: (r: DialogResult) => void }) {
  const [text, setText] = useState(req.input?.value ?? "");
  const inputRef = useRef<HTMLInputElement>(null);
  const last = req.buttons[req.buttons.length - 1];
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); onChoose({ value: req.buttons[0].value, text }); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [req, onChoose, text]);
  useIndietro(true, () => onChoose({ value: req.buttons[0].value, text }));   // Android: come Esc
  // con il campo di testo il cursore va lì, con il nome già selezionato (si può riscrivere subito)
  useEffect(() => { inputRef.current?.select(); }, []);
  return (
    <div className="modal-back" style={{ zIndex: 80 }}>
      <div className="modal" role="alertdialog" aria-modal="true" aria-labelledby="app-dialog-title" aria-describedby="app-dialog-body">
        <h3 id="app-dialog-title">{req.title}</h3>
        <div id="app-dialog-body" style={{ color: "var(--muted)", lineHeight: 1.45 }}>{req.body}</div>
        {req.input && (
          <div className="row">
            <input ref={inputRef} className="input" autoFocus value={text} placeholder={req.input.placeholder}
              aria-labelledby="app-dialog-title" onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && text.trim()) { e.preventDefault(); onChoose({ value: last.value, text }); } }} />
            {req.input.suffix && <span style={{ color: "var(--muted)" }}>{req.input.suffix}</span>}
          </div>
        )}
        <div className="btn-row" style={{ justifyContent: "flex-end", flexWrap: "wrap" }}>
          {req.buttons.map((b, i) => (
            <button key={b.value} className={`btn ${b.kind || ""}`} autoFocus={!req.input && i === req.buttons.length - 1}
              disabled={!!req.input && b === last && !text.trim()}
              onClick={() => onChoose({ value: b.value, text })}>{b.label}</button>
          ))}
        </div>
      </div>
    </div>
  );
}
