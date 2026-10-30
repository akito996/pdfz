import { useEffect, useMemo, useRef, useState } from "react";
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

/** Ritaglio della pagina com'è disegnata ora (canvas del visualizzatore) nel riquadro r: mentre si trascina un oggetto
 *  già applicato, nel riquadro che si sposta si vede l'oggetto stesso e non solo il contorno. */
function istantanea(page: number, r: VRect, pageW: number): string | undefined {
  const c = document.querySelector<HTMLCanvasElement>(`.page[data-page="${page}"] canvas`);
  if (!c || !c.width || !pageW) return undefined;
  const k = c.width / pageW;
  const out = document.createElement("canvas");
  out.width = Math.max(1, Math.round(r.w * k));
  out.height = Math.max(1, Math.round(r.h * k));
  try {
    out.getContext("2d")!.drawImage(c, r.x * k, r.y * k, r.w * k, r.h * k, 0, 0, out.width, out.height);
    return out.toDataURL("image/png");
  } catch { return undefined; }
}

export function useApplicati(tipi: string[]) {
  const app = useApp();
  const docId = app.doc?.id;
  const [items, setItems] = useState<Applicato[]>([]);
  // oggetti che si stanno spostando: riquadro nuovo e immagine dell'oggetto (fino alla nuova versione del documento)
  const [spostati, setSpostati] = useState<Record<string, { rect: VRect; img?: string }>>({});
  const chiave = tipi.join(",");
  useEffect(() => {
    setItems([]);
    setSpostati({});
    if (!docId) return;
    let vivo = true;
    api.tool("list_applied", { doc: docId, params: { tipi } }).then((r) => { if (vivo) setItems(r.data.items); }).catch(() => {});
    return () => { vivo = false; };
  }, [docId, chiave]); // eslint-disable-line react-hooks/exhaustive-deps
  const trova = (id: string) => (id.startsWith(PREFISSO) ? items.find((a) => boxId(a) === id) : undefined);
  // stesso array finché non cambiano gli oggetti o uno spostamento: i pannelli lo usano come dipendenza
  const boxes = useMemo(() => {
    const out: PageObject[] = [];
    for (const a of items) {
      if (!a.rect) continue;
      const s = spostati[boxId(a)];
      // al posto di partenza resta un velo bianco: l'oggetto "esce" da lì
      if (s) out.push({ id: `${boxId(a)}:da`, page: a.page, kind: "box", locked: true, cover: true, rect: a.rect, meta: { velo: true } });
      out.push({
        id: boxId(a), page: a.page, kind: s?.img ? "image" : "box", imageUrl: s?.img, keepRatio: true, rect: s?.rect || a.rect,
        label: ETICHETTE[a.tipo], meta: { applicato: a },
      });
    }
    return out;
  }, [items, spostati]);
  return {
    items,
    /** riquadri sulla pagina: si toccano per selezionarli, si trascinano per spostarli, dagli angoli si ridimensionano */
    boxes,
    scelto: (selectedId: string | null) => (selectedId ? trova(selectedId) : undefined),
    /** Elimina subito (Annulla torna indietro). Voce senza page = da tutte le pagine. */
    elimina: async (voci: Voce[]) => !!(await app.run("remove_applied", { items: voci })),
    /** Riquadro cambiato durante il trascinamento. true se l'id è di un oggetto applicato (altrimenti è del pannello). */
    cambia: (id: string, p: Partial<PageObject>) => {
      const a = trova(id);
      if (!a) return false;
      if (p.rect) {
        const rect = p.rect;
        setSpostati((m) => ({ ...m, [id]: { rect, img: m[id]?.img ?? istantanea(a.page, a.rect!, app.sizes[a.page]?.w || 0) } }));
      }
      return true;
    },
    /** Fine del trascinamento: il motore sposta l'oggetto nel PDF (si torna indietro con Annulla). */
    lascia: async (id: string) => {
      const a = trova(id), s = spostati[id];
      if (!a || !s) return false;
      const ok = !!(await app.run("move_applied", { page: a.page, id: a.id, rect: s.rect }));
      if (!ok) setSpostati((m) => { const n = { ...m }; delete n[id]; return n; });
      return true;
    },
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
      <div className="hint">{a.tipo === "firma"
        ? "Trascinala sulla pagina per spostarla; dagli angoli la ingrandisci o la rimpicciolisci."
        : "Trascinalo sulla pagina per spostarlo; dagli angoli lo ingrandisci o lo rimpicciolisci."}</div>
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
