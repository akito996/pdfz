import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { ChevronDown, LayoutGrid, PanelLeft, Search, X } from "lucide-react";
import { CATEGORIES, TOOL_BY_ID, testoRicerca, type ToolDef } from "../tools";
import { Popover } from "./Popover";

/** Vista semplice (1.6.0, barra in alto dalla 1.7.0): i pulsanti più usati, gli altri strumenti in "Tutti gli strumenti". */
export const PULSANTI_SEMPLICI: { tool: string; label: string; corto: string }[] = [
  { tool: "sign", label: "Firma", corto: "Firma" },
  { tool: "add_text", label: "Scrivi", corto: "Scrivi" },
  { tool: "edit_text", label: "Modifica testo", corto: "Correggi" },
  { tool: "stamp", label: "Timbro", corto: "Timbro" },
  { tool: "comments", label: "Evidenzia e note", corto: "Note" },
  { tool: "organize", label: "Pagine", corto: "Pagine" },
];

/** Barra in alto (computer) o in basso (telefono) della vista semplice. */
export function SempliceBar({ attivo, onTool, strumenti, telefono, onCompleta }: {
  attivo: string | null; onTool: (id: string) => void; strumenti: ToolDef[]; telefono: boolean; onCompleta?: () => void;
}) {
  const [tutti, setTutti] = useState(false);
  const tuttiBtn = useRef<HTMLButtonElement>(null);
  // telefono: la barra pagina/zoom e le pagine lasciano posto alla barra
  const box = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = box.current, root = document.documentElement;
    if (!telefono || !el) return;
    const ro = new ResizeObserver(() => root.style.setProperty("--barra-h", `${Math.round(el.getBoundingClientRect().height)}px`));
    ro.observe(el);
    return () => { ro.disconnect(); root.style.setProperty("--barra-h", "0px"); };
  }, [telefono]);
  const scegli = (id: string) => { setTutti(false); onTool(id); };
  return (
    <nav ref={box} className={`semplice-bar ${telefono ? "in-basso" : "in-alto"}`} aria-label="Strumenti principali">
      {PULSANTI_SEMPLICI.map((p) => {
        const Icon = TOOL_BY_ID[p.tool].icon;
        return (
          <button key={p.tool} type="button" data-tool={p.tool} className={attivo === p.tool ? "on" : ""} aria-pressed={attivo === p.tool}
            title={TOOL_BY_ID[p.tool].breve} onClick={() => scegli(p.tool)}>
            <Icon size={telefono ? 22 : 17} />
            {telefono || p.corto === p.label ? <span className="nome">{telefono ? p.corto : p.label}</span>
              : <><span className="nome lungo">{p.label}</span><span className="nome corto">{p.corto}</span></>}
          </button>
        );
      })}
      <button ref={tuttiBtn} type="button" className={`altro ${tutti ? "on" : ""}`} aria-haspopup="dialog" aria-expanded={tutti}
        onClick={() => setTutti((v) => !v)}>
        <LayoutGrid size={telefono ? 22 : 17} />
        {telefono ? <span className="nome">Altro</span>
          : <><span className="nome lungo">Tutti gli strumenti</span><span className="nome corto">Tutti</span></>}
        {!telefono && <ChevronDown size={15} className="giu" />}
      </button>
      {onCompleta && !telefono && (
        <button type="button" className="vista" title="Tutti gli strumenti nel menu a sinistra" onClick={onCompleta}>
          <PanelLeft size={16} /> <span className="nome">Vista completa</span>
        </button>
      )}
      {tutti && <TuttiGliStrumenti anchor={tuttiBtn} strumenti={strumenti} attivo={attivo} telefono={telefono}
        onScegli={scegli} onClose={() => setTutti(false)} />}
    </nav>
  );
}

/** Menu "Tutti gli strumenti": ricerca in alto, poi le sezioni con nome e due parole su cosa fa ogni strumento. */
export function TuttiGliStrumenti({ anchor, strumenti, attivo, telefono, onScegli, onClose }: {
  anchor: RefObject<HTMLButtonElement | null>; strumenti: ToolDef[]; attivo: string | null; telefono: boolean;
  onScegli: (id: string) => void; onClose: () => void;
}) {
  const [q, setQ] = useState("");
  // cursore nella ricerca appena la finestrella compare (al primo disegno è ancora nascosta e non prende il cursore);
  // sul telefono no: la tastiera coprirebbe l'elenco, da cui si sceglie quasi sempre
  const campo = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (telefono) return;
    const t = setTimeout(() => campo.current?.focus(), 30);
    return () => clearTimeout(t);
  }, [telefono]);
  const parole = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const trovati = useMemo(() => strumenti.filter((t) => parole.every((p) => testoRicerca(t).includes(p))),
    [strumenti, q]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Popover anchor={anchor} onClose={onClose} width={960} allinea="sinistra" className="tutti-pop" label="Tutti gli strumenti">
      <div className="tutti-cerca">
        <label className="tutti-campo">
          <Search size={16} aria-hidden />
          <input ref={campo} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cerca: firma, unisci, password…"
            aria-label="Cerca uno strumento" onKeyDown={(e) => { if (e.key === "Enter" && trovati.length) onScegli(trovati[0].id); }} />
        </label>
        <button type="button" className="btn icon ghost" title="Chiudi" aria-label="Chiudi" onClick={onClose}><X size={18} /></button>
      </div>
      <div className="tutti-elenco">
        {CATEGORIES.map((c) => {
          const voci = trovati.filter((t) => t.category === c);
          if (!voci.length) return null;
          return (
            <section key={c}>
              <h3>{c}</h3>
              <div className="tutti-griglia">
                {voci.map((t) => {
                  const Icon = t.icon;
                  return (
                    <button key={t.id} type="button" className={`tutti-voce ${attivo === t.id ? "on" : ""}`} title={t.description} onClick={() => onScegli(t.id)}>
                      <Icon size={18} aria-hidden />
                      <span><b>{t.label}</b><small>{t.breve || t.description}</small></span>
                    </button>
                  );
                })}
              </div>
            </section>
          );
        })}
        {!trovati.length && <p className="tutti-vuoto">Nessuno strumento per «{q.trim()}». Prova con un'altra parola.</p>}
      </div>
    </Popover>
  );
}
