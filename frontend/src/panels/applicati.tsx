import { useEffect, useRef, useState } from "react";
import { Trash2 } from "lucide-react";
import { api } from "../api";
import { useApp } from "../context";
import { formatPages } from "../components/PageGrid";
import type { PageObject, VRect } from "../types";

/** Oggetto già applicato al documento (firma, timbro, testo aggiunto, filigrana, numeri di pagina): lo ritrova il
 *  motore (tools/applicati.py) e si elimina anche dopo "Applica", da una pagina o da tutte. */
export interface Applicato { page: number; id: string; tipo: string; nome: string; data: string; rect: VRect | null }
type Voce = { page?: number; id: string };

export const ETICHETTE: Record<string, string> = {
  firma: "Firma applicata", timbro: "Timbro applicato", testo: "Testo aggiunto", filigrana: "Filigrana", numeri: "Numeri di pagina",
};
const PREFISSO = "ap:";
export const boxId = (a: Applicato) => `${PREFISSO}${a.page}:${a.id}`;

/** Chiave della scheda del documento aperto: i pannelli svuotano le loro modifiche in sospeso solo cambiando scheda,
 *  non quando il documento cambia versione (per esempio dopo aver eliminato un oggetto). */
export function useSchedaKey() {
  const app = useApp();
  return app.tabs.find((t) => t.history.some((h) => h.id === app.doc?.id))?.key;
}

export function useApplicati(tipi: string[]) {
  const app = useApp();
  const docId = app.doc?.id;
  const [items, setItems] = useState<Applicato[]>([]);
  const chiave = tipi.join(",");
  useEffect(() => {
    setItems([]);
    if (!docId) return;
    let vivo = true;
    api.tool("list_applied", { doc: docId, params: { tipi } }).then((r) => { if (vivo) setItems(r.data.items); }).catch(() => {});
    return () => { vivo = false; };
  }, [docId, chiave]); // eslint-disable-line react-hooks/exhaustive-deps
  return {
    items,
    /** riquadri bloccati sulla pagina: si toccano per selezionarli ed eliminarli */
    boxes: items.filter((a) => a.rect).map((a): PageObject => ({
      id: boxId(a), page: a.page, kind: "box", locked: true, rect: a.rect!, label: ETICHETTE[a.tipo], meta: { applicato: a },
    })),
    scelto: (selectedId: string | null) => (selectedId?.startsWith(PREFISSO) ? items.find((a) => boxId(a) === selectedId) : undefined),
    /** Elimina subito (Annulla torna indietro). Voce senza page = da tutte le pagine. */
    elimina: async (voci: Voce[]) => !!(await app.run("remove_applied", { items: voci })),
  };
}

const quando = (iso: string) => (iso ? new Date(iso).toLocaleString("it-IT", { dateStyle: "short", timeStyle: "short" }) : "");
const pagine = (l: Applicato[]) => {
  const s = formatPages(new Set(l.map((a) => a.page)));
  return l.length > 1 ? `pagine ${s}` : `pagina ${s}`;
};

/** Sezione del pannello che, comparendo, si porta in vista (sul telefono il pannello è basso e scorre).
 *  Con una key diversa per ogni oggetto selezionato si riporta in vista a ogni nuova selezione. */
export function InVista({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { ref.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }); }, []);
  return <div ref={ref} className="in-vista">{children}</div>;
}

/** Oggetto applicato selezionato sulla pagina: che cos'è e i pulsanti per eliminarlo. */
export function ApplicatoScelto({ a, tutti, onElimina }: { a: Applicato; tutti: Applicato[]; onElimina: (v: Voce[]) => void }) {
  const copie = tutti.filter((x) => x.id === a.id);
  return (
    <InVista key={boxId(a)}>
      <div className="section-title">{ETICHETTE[a.tipo]}</div>
      <div className="hint">{a.nome ? `«${a.nome}» · ` : ""}pagina {a.page + 1}{a.data ? ` · ${quando(a.data)}` : ""}</div>
      <div className="btn-row">
        <button className="btn small danger" onClick={() => onElimina([{ page: a.page, id: a.id }])}>
          <Trash2 size={13} /> Elimina{copie.length > 1 ? " da questa pagina" : ""}</button>
        {copie.length > 1 && <button className="btn small danger" onClick={() => onElimina([{ id: a.id }])}>Elimina da tutte ({copie.length})</button>}
      </div>
    </InVista>
  );
}

/** Elenco degli oggetti applicati (uno per riga, anche se ripetuti su più pagine) con il pulsante per eliminarli. */
export function ElencoApplicati({ titolo, items, onElimina, onVai }: {
  titolo: string; items: Applicato[]; onElimina: (v: Voce[]) => void; onVai?: (a: Applicato) => void;
}) {
  const gruppi = new Map<string, Applicato[]>();
  for (const a of items) gruppi.set(a.id, [...(gruppi.get(a.id) || []), a]);
  if (!gruppi.size) return null;
  return (
    <div className="field">
      <label>{titolo} ({gruppi.size})</label>
      <div className="list">
        {[...gruppi].map(([id, l]) => (
          <div key={id} className="list-item">
            <span className="grow" style={onVai ? { cursor: "pointer" } : undefined} onClick={() => onVai?.(l[0])}
              title={l[0].nome || ETICHETTE[l[0].tipo]}>
              {l[0].nome || ETICHETTE[l[0].tipo]} <span style={{ color: "var(--muted)" }}>· {pagine(l)}</span>
            </span>
            <button className="btn small ghost" title={l.length > 1 ? "Elimina da tutte le pagine" : "Elimina"} aria-label="Elimina"
              onClick={() => onElimina(l.length > 1 ? [{ id }] : [{ page: l[0].page, id }])}><Trash2 size={14} color="var(--danger)" /></button>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Per gli strumenti con il solo modulo (Filigrana, Numeri di pagina): quelli già applicati, da eliminare. */
export function ApplicatiNelDocumento({ tipo, titolo }: { tipo: string; titolo: string }) {
  const app = useApp();
  const ap = useApplicati([tipo]);
  return <ElencoApplicati titolo={titolo} items={ap.items} onElimina={ap.elimina} onVai={(a) => app.gotoPage(a.page)} />;
}
