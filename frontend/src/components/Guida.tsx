import { useEffect, useState } from "react";
import { useIndietro } from "../hooks";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import type { GuidaDef } from "../guide";

/** Guida passo passo (1-2-3): un riquadro con il passo e l'elemento della schermata evidenziato. */
export function Guida({ guida, onFine }: { guida: GuidaDef; onFine: () => void }) {
  const [i, setI] = useState(0);
  const passo = guida.passi[i];
  const ultimo = i === guida.passi.length - 1;

  // l'elemento del passo pulsa, così si vede dove toccare
  useEffect(() => {
    const el = passo.dove ? document.querySelector<HTMLElement>(passo.dove) : null;
    if (!el) return;
    el.classList.add("guida-qui");
    el.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
    return () => el.classList.remove("guida-qui");
  }, [passo]);

  useIndietro(true, onFine);
  useEffect(() => {
    const tasto = (e: KeyboardEvent) => {
      // mentre si scrive (frecce per spostare il cursore, Esc della casella) o con una domanda aperta: non è per la guida
      const t = e.target as HTMLElement | null;
      if (t?.closest?.("input, textarea, select, [contenteditable='true']") || document.querySelector(".modal-back")) return;
      if (e.key === "Escape") onFine();
      else if (e.key === "ArrowRight" && !ultimo) setI(i + 1);
      else if (e.key === "ArrowLeft" && i > 0) setI(i - 1);
    };
    window.addEventListener("keydown", tasto);
    return () => window.removeEventListener("keydown", tasto);
  }, [i, ultimo, onFine]);

  return createPortal(
    <div className="guida" role="dialog" aria-label={`Guida: ${guida.titolo}`}>
      <div className="guida-testa">
        <span className="guida-titolo">{guida.titolo}</span>
        <button className="btn icon ghost small" onClick={onFine} aria-label="Chiudi la guida" title="Chiudi la guida"><X size={15} /></button>
      </div>
      <div className="guida-passo">
        <span className="guida-n">{i + 1}</span>
        <div>
          <b>{passo.titolo}</b>
          <p>{passo.testo}</p>
        </div>
      </div>
      <div className="guida-piede">
        <span className="guida-punti" aria-label={`Passo ${i + 1} di ${guida.passi.length}`}>
          {guida.passi.map((_, k) => <i key={k} className={k === i ? "on" : ""} />)}
        </span>
        <span style={{ flex: 1 }} />
        {i > 0 && <button className="btn small" onClick={() => setI(i - 1)}><ChevronLeft size={14} /> Indietro</button>}
        {ultimo
          ? <button className="btn small primary" onClick={onFine}>Ho capito</button>
          : <button className="btn small primary" onClick={() => setI(i + 1)}>Avanti <ChevronRight size={14} /></button>}
      </div>
    </div>,
    document.body,
  );
}
