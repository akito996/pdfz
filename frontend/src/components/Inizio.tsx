import { useEffect, useState } from "react";
import { ClipboardPen, FilePlus2, FolderOpen, X } from "lucide-react";
import { TOOL_BY_ID } from "../tools";
import { dimentica, recenti, seguiRecenti, type Recente } from "../recenti";
import { PhotoScan } from "./PhotoScan";

/** Un compito della schermata iniziale: quale strumento apre, con quale guida passo passo (components/Guida.tsx),
 *  e se serve prima aprire un documento. */
export interface Compito { id: string; titolo: string; sotto: string; tool: string; guida?: string; senzaDoc?: boolean }

/** I sei compiti più comuni, in parole semplici (proposta A della 1.6.0). */
export const COMPITI: Compito[] = [
  { id: "firma", titolo: "Firma un documento", sotto: "Disegna la firma o usa una foto", tool: "sign", guida: "sign" },
  { id: "compila", titolo: "Compila un modulo", sotto: "Scrivi nei campi e spunta le caselle", tool: "add_text", guida: "compila" },
  { id: "unisci", titolo: "Unisci più PDF", sotto: "Metti insieme più file in uno", tool: "merge", guida: "merge", senzaDoc: true },
  { id: "correggi", titolo: "Correggi il testo", sotto: "Cambia parole già scritte", tool: "edit_text", guida: "edit_text" },
  { id: "riduci", titolo: "Rimpicciolisci il file", sotto: "Per mandarlo via email", tool: "compress", guida: "compress" },
  { id: "crea", titolo: "Crea un PDF", sotto: "Da foto, Word, Excel…", tool: "create_pdf", guida: "create_pdf", senzaDoc: true },
];

const quando = (t: number) => {
  const d = new Date(t), oggi = new Date();
  if (d.toDateString() === oggi.toDateString()) return `oggi alle ${d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}`;
  return d.toLocaleDateString("it-IT", { day: "numeric", month: "short", year: d.getFullYear() === oggi.getFullYear() ? undefined : "numeric" });
};
const peso = (b: number) => (b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1).replace(".", ",")} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

/** Schermata iniziale "Cosa vuoi fare?": sei riquadri grandi, i file recenti e l'apertura di un documento. */
export function Inizio({ onCompito, onApri, onRecente, dragOver, touch, locale }: {
  onCompito: (c: Compito) => void;
  onApri: () => void;
  onRecente: (r: Recente) => void;
  dragOver: boolean;
  touch: boolean;
  locale: boolean;   // motore sul dispositivo (app Android, web app): "anche senza internet"
}) {
  const [lista, setLista] = useState<Recente[]>(recenti);
  useEffect(() => seguiRecenti(() => setLista(recenti())), []);
  return (
    <div className={`inizio ${dragOver ? "over" : ""}`}>
      <h1>Cosa vuoi fare?</h1>
      <div className="compiti">
        {COMPITI.map((c) => {
          const Icon = c.id === "compila" ? ClipboardPen : TOOL_BY_ID[c.tool]?.icon || FilePlus2;
          return (
            <button key={c.id} type="button" className="compito" onClick={() => onCompito(c)}>
              <Icon size={30} color="var(--brand)" />
              <b>{c.titolo}</b>
              <span>{c.sotto}</span>
            </button>
          );
        })}
      </div>

      <div className="apri-riga">
        <button className="btn primary" onClick={onApri}><FolderOpen size={16} /> Apri un documento</button>
        <PhotoScan />
      </div>
      <p className="inizio-nota">
        {touch ? "Si aprono PDF, documenti Word, Excel, PowerPoint e foto." : "Puoi anche trascinare qui un PDF, un documento Word, Excel, PowerPoint o un'immagine."}{" "}
        Tutto resta {locale ? "su questo dispositivo, anche senza internet" : "su questo computer"}.
      </p>

      {lista.length > 0 && (
        <section className="recenti" aria-label="Aperti di recente">
          <div className="recenti-testa"><b>Aperti di recente</b>
            <button className="btn small ghost" onClick={() => dimentica()}>Svuota l'elenco</button></div>
          <div className="list">
            {lista.map((r) => (
              <div key={r.id} className="list-item recente">
                <button type="button" className="grow" onClick={() => onRecente(r)} title={r.path || r.nome}>
                  <span className="nome">{r.nome}</span>
                  <span className="info">{quando(r.quando)} · {peso(r.size)}</span>
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
  );
}
