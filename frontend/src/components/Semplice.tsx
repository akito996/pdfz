import { useEffect, useRef } from "react";
import { LayoutGrid } from "lucide-react";
import { TOOL_BY_ID } from "../tools";

/** Modalità Semplice (proposta B della 1.6.0): sei pulsanti grandi con la scritta. Gli altri strumenti sono in "Altro". */
export const PULSANTI_SEMPLICI: { tool: string; label: string; sotto: string }[] = [
  { tool: "sign", label: "Firma", sotto: "Metti la tua firma" },
  { tool: "add_text", label: "Scrivi", sotto: "Aggiungi testo e compila" },
  { tool: "edit_text", label: "Correggi", sotto: "Cambia il testo che c'è" },
  { tool: "marks", label: "Spunta", sotto: "Barra le caselle ✓ ✗" },
  { tool: "organize", label: "Pagine", sotto: "Ruota, elimina, riordina" },
];

/** Colonna a sinistra (computer) o barra in basso (telefono) della modalità Semplice. */
export function SempliceBar({ attivo, onTool, onAltro, telefono }: {
  attivo: string | null; onTool: (id: string) => void; onAltro: () => void; telefono: boolean;
}) {
  // telefono: la barra pagina/zoom e le pagine lasciano posto alla barra
  const box = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = box.current, root = document.documentElement;
    if (!telefono || !el) return;
    const ro = new ResizeObserver(() => root.style.setProperty("--barra-h", `${Math.round(el.getBoundingClientRect().height)}px`));
    ro.observe(el);
    return () => { ro.disconnect(); root.style.setProperty("--barra-h", "0px"); };
  }, [telefono]);
  return (
    <nav ref={box} className={`semplice-bar ${telefono ? "in-basso" : "a-lato"}`} aria-label="Strumenti principali">
      {PULSANTI_SEMPLICI.map((p) => {
        const Icon = TOOL_BY_ID[p.tool].icon;
        return (
          <button key={p.tool} type="button" data-tool={p.tool} className={attivo === p.tool ? "on" : ""} onClick={() => onTool(p.tool)}>
            <Icon size={telefono ? 22 : 24} />
            <span className="nome">{p.label}</span>
            {!telefono && <span className="sotto">{p.sotto}</span>}
          </button>
        );
      })}
      <button type="button" className="altro" onClick={onAltro}>
        <LayoutGrid size={telefono ? 22 : 24} />
        <span className="nome">Altro</span>
        {!telefono && <span className="sotto">Tutti gli strumenti</span>}
      </button>
    </nav>
  );
}
