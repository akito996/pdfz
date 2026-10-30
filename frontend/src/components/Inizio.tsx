import { useEffect, useRef, useState } from "react";
import { Clock, FilePlus2, FolderOpen, LayoutGrid, X } from "lucide-react";
import { TOOL_BY_ID, type ToolDef } from "../tools";
import { dimentica, recenti, seguiRecenti, type Recente } from "../recenti";
import { PhotoScan } from "./PhotoScan";
import { TuttiGliStrumenti } from "./Semplice";

/** Un compito della schermata iniziale: quale strumento apre, con quale guida passo passo (components/Guida.tsx),
 *  e se serve prima aprire un documento. */
export interface Compito { id: string; titolo: string; sotto: string; tool: string; guida?: string; senzaDoc?: boolean }

/** I sei compiti più comuni, in parole semplici (proposta A della 1.6.0, testi e ordine della 1.7.0). */
export const COMPITI: Compito[] = [
  { id: "firma", titolo: "Firma un documento", sotto: "Con la firma a mano o il certificato", tool: "sign", guida: "sign" },
  { id: "compila", titolo: "Compila o scrivi", sotto: "Scrivi dove vuoi sul foglio", tool: "add_text", guida: "compila" },
  { id: "correggi", titolo: "Correggi un testo", sotto: "Cambia le parole già scritte", tool: "edit_text", guida: "edit_text" },
  { id: "unisci", titolo: "Unisci più PDF", sotto: "Metti più file in uno solo", tool: "merge", guida: "merge", senzaDoc: true },
  { id: "riduci", titolo: "Riduci il peso", sotto: "Per mandarlo per email", tool: "compress", guida: "compress" },
  { id: "word", titolo: "Trasforma in Word", sotto: "O in Excel, immagini…", tool: "convert_from_pdf", guida: "convert_from_pdf" },
];

const quando = (t: number) => {
  const d = new Date(t), oggi = new Date();
  if (d.toDateString() === oggi.toDateString()) return `oggi, ${d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}`;
  return d.toLocaleDateString("it-IT", { day: "numeric", month: "short", year: d.getFullYear() === oggi.getFullYear() ? undefined : "numeric" });
};
const peso = (b: number) => (b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1).replace(".", ",")} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

/** Schermata iniziale "Cosa vuoi fare?": sei riquadri, "Apri un PDF" o "Tutti gli strumenti", i file recenti. */
export function Inizio({ onCompito, onApri, onRecente, strumenti, onTool, dragOver, touch, locale }: {
  onCompito: (c: Compito) => void;
  onApri: () => void;
  onRecente: (r: Recente) => void;
  strumenti: ToolDef[];
  onTool: (id: string) => void;
  dragOver: boolean;
  touch: boolean;
  locale: boolean;   // motore sul dispositivo (app Android, web app): "anche senza internet"
}) {
  const [lista, setLista] = useState<Recente[]>(recenti);
  useEffect(() => seguiRecenti(() => setLista(recenti())), []);
  const [tutti, setTutti] = useState(false);
  const tuttiBtn = useRef<HTMLButtonElement>(null);
  return (
    <div className={`inizio ${dragOver ? "over" : ""}`}>
      <div className="inizio-col">
        <h1>Cosa vuoi fare?</h1>
        <p className="inizio-sotto">Scegli un'attività: ti chiediamo il file e apriamo lo strumento giusto.{" "}
          Tutto resta {locale ? "su questo dispositivo, anche senza internet" : "su questo computer"}.</p>
        <div className="compiti">
          {COMPITI.map((c) => {
            const Icon = TOOL_BY_ID[c.tool]?.icon || FilePlus2;
            return (
              <button key={c.id} type="button" className="compito" onClick={() => onCompito(c)}>
                <span className="compito-icona"><Icon size={24} /></span>
                <span className="compito-testo"><b>{c.titolo}</b><span>{c.sotto}</span></span>
              </button>
            );
          })}
        </div>

        <div className="apri-riga">
          <button className="btn primary grande" onClick={onApri}><FolderOpen size={17} /> Apri un PDF</button>
          <button ref={tuttiBtn} className={`btn ghost grande ${tutti ? "on" : ""}`} aria-haspopup="dialog" aria-expanded={tutti}
            onClick={() => setTutti((v) => !v)}><LayoutGrid size={17} /> Tutti gli strumenti</button>
          <PhotoScan />
        </div>
        {tutti && <TuttiGliStrumenti anchor={tuttiBtn} strumenti={strumenti} attivo={null} telefono={touch}
          onScegli={(id) => { setTutti(false); onTool(id); }} onClose={() => setTutti(false)} />}
        <p className="inizio-nota">
          {touch ? "Si aprono PDF, documenti Word, Excel, PowerPoint e foto." : "Puoi anche trascinare qui un PDF, un documento Word, Excel o un'immagine."}
        </p>

        {lista.length > 0 && (
          <section className="recenti" aria-label="Aperti di recente">
            <div className="recenti-testa"><b><Clock size={15} aria-hidden /> Aperti di recente</b>
              <button className="btn small ghost" onClick={() => dimentica()}>Svuota l'elenco</button></div>
            <div className="list">
              {lista.map((r) => (
                <div key={r.id} className="list-item recente">
                  <button type="button" className="grow" onClick={() => onRecente(r)} title={`${r.path || r.nome} · ${peso(r.size)}`}>
                    <span className="nome">{r.nome}</span>
                    <span className="info">{quando(r.quando)}</span>
                  </button>
                  <button className="btn icon ghost small" title="Togli dall'elenco" aria-label={`Togli ${r.nome} dall'elenco`}
                    onClick={() => dimentica(r.id)}><X size={14} /></button>
                </div>
              ))}
            </div>
          </section>
        )}
        <p className="kbd-hint" style={{ fontSize: 12 }}><kbd>Ctrl</kbd>+<kbd>O</kbd> apri · <kbd>Ctrl</kbd>+<kbd>S</kbd> salva · <kbd>Ctrl</kbd>+<kbd>Z</kbd> annulla · <kbd>Ctrl</kbd>+<kbd>L</kbd> presentazione</p>
      </div>
    </div>
  );
}
