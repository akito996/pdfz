import { Fragment, useEffect, useState } from "react";
import { Copy, RefreshCw } from "lucide-react";
import { api } from "../api";
import { useApp } from "../context";
import type { ToolDef } from "../tools";
import { PanelShell } from "./ToolPanel";
import { Advanced } from "./fields";

function useToolData(tool: string, auto = true) {
  const app = useApp();
  const [data, setData] = useState<any>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const load = async () => {
    if (!app.doc) return;
    setLoading(true);
    setError(null);
    try {
      const r = await api.tool(tool, { doc: app.doc.id, params: {} });
      setData(r.data);
      setMessage(r.message || null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { if (auto) load(); }, [app.doc?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  return { data, message, loading, error, load };
}

const yes = (b: any) => (b ? "Sì" : "No");

export function KV({ rows }: { rows: [string, any][] }) {
  return (
    <dl className="kv">
      {rows.filter(([, v]) => v !== undefined && v !== null && v !== "").map(([k, v]) => (
        <Fragment key={k}><dt>{k}</dt><dd>{typeof v === "boolean" ? yes(v) : String(v)}</dd></Fragment>
      ))}
    </dl>
  );
}

export function InfoPanel({ def, onClose }: { def: ToolDef; onClose: () => void }) {
  const app = useApp();
  const { data, loading, error, load } = useToolData("info");
  const d = data;
  return (
    <PanelShell def={def} onClose={onClose}
      footer={<>
        <button className="btn" onClick={load} disabled={loading}><RefreshCw size={15} /> Aggiorna</button>
        <button className="btn" style={{ flex: 1 }} disabled={!d} onClick={() => { navigator.clipboard?.writeText(JSON.stringify(d, null, 2)); app.toast("Informazioni copiate negli appunti.", "ok"); }}><Copy size={15} /> Copia tutto (JSON)</button>
      </>}>
      {loading && <div className="row" style={{ justifyContent: "flex-start" }}><div className="spin" style={{ flex: "none" }} /> Analisi in corso…</div>}
      {error && <div className="note err">{error}</div>}
      {d && (
        <>
          <div className="section-title">File</div>
          <KV rows={[["Nome", d.file.name], ["Dimensione", d.file.size], ["Versione PDF", d.document.pdf_version], ["Pagine", d.document.pages]]} />
          <Advanced>
            <div className="section-title">Documento</div>
            <KV rows={[
              ["Titolo", d.document.title], ["Autore", d.document.author], ["Oggetto", d.document.subject],
              ["Parole chiave", d.document.keywords], ["Creato con", d.document.creator], ["Prodotto da", d.document.producer],
              ["Creato il", d.document.created], ["Modificato il", d.document.modified],
              ["PDF/A dichiarato", d.document.pdfa], ["Accessibile (tag)", d.document.tagged], ["Ottimizzato per web", d.document.linearized],
              ["Metadati XMP", d.document.xmp], ["Etichette pagina", d.document.page_labels], ["Riparato in apertura", d.document.repaired],
            ]} />
            <div className="section-title">Sicurezza</div>
            <KV rows={[
              ["Cifrato", d.security.encrypted], ["Password di apertura", d.security.password_to_open], ["Cifratura", d.security.encryption],
              ["Firme digitali", d.security.signatures], ["JavaScript", d.security.javascript], ["Link esterni", d.security.external_links],
            ]} />
            {d.security.encrypted && (
              <KV rows={Object.entries(d.security.permissions).map(([k, v]) => [k, v ? "consentito" : "negato"] as [string, any])} />
            )}
            <div className="section-title">Contenuto</div>
            <KV rows={[
              ["Immagini", d.content.images], ["Pagine con testo", d.content.pages_with_text],
              ["Pagine senza testo", d.content.pages_scanned_likely ? `${d.content.pages_scanned_likely} (probabili scansioni: usa l'OCR)` : 0],
              ["Segnalibri", d.content.bookmarks], ["Campi modulo", d.content.form_fields.length], ["Allegati", d.content.attachments.length],
              ["Livelli", d.content.layers.length || 0],
              ["Annotazioni", Object.entries(d.content.annotations).map(([k, v]) => `${k}: ${v}`).join(", ") || "nessuna"],
            ]} />
            <div className="section-title">Formati pagina</div>
            <KV rows={Object.entries(d.page_formats).map(([k, v]) => [k, `${v} pagine`] as [string, any])} />
            <div className="section-title">Caratteri ({d.content.fonts.length})</div>
            <div className="list">
              {d.content.fonts.map((f: any) => (
                <div key={f.name} className="list-item">
                  <span className="grow" title={f.name}>{f.name}</span>
                  <span className={`badge ${f.embedded ? "ok" : ""}`}>{f.embedded ? (f.subset ? "incorporato (subset)" : "incorporato") : "non incorporato"}</span>
                </div>
              ))}
              {!d.content.fonts.length && <div className="list-item" style={{ color: "var(--muted)" }}>Nessun carattere</div>}
            </div>
            {d.content.attachments.length > 0 && (
              <>
                <div className="section-title">Allegati</div>
                <div className="list">{d.content.attachments.map((a: any) => <div key={a.name} className="list-item"><span className="grow">{a.name}</span><span>{a.size} B</span></div>)}</div>
              </>
            )}
            {d.content.form_fields.length > 0 && (
              <>
                <div className="section-title">Campi modulo</div>
                <div className="list">{d.content.form_fields.slice(0, 100).map((f: any, i: number) => (
                  <div key={i} className="list-item"><span className="grow">{f.name}</span><span style={{ color: "var(--muted)" }}>{f.type} · p.{f.page}{f.readonly ? " · sola lettura" : ""}</span></div>
                ))}</div>
              </>
            )}
          </Advanced>
        </>
      )}
    </PanelShell>
  );
}

export function ValidatePanel({ def, onClose }: { def: ToolDef; onClose: () => void }) {
  const { data, message, loading, error, load } = useToolData("validate");
  return (
    <PanelShell def={def} onClose={onClose}
      footer={<button className="btn primary block" onClick={load} disabled={loading}><RefreshCw size={15} /> Esegui di nuovo</button>}>
      {loading && <div className="row" style={{ justifyContent: "flex-start" }}><div className="spin" style={{ flex: "none" }} /> Verifica in corso…</div>}
      {error && <div className="note err">{error}</div>}
      {data && (
        <>
          <div className={`note ${data.ok ? "ok" : "warn"}`}><b>{data.ok ? "Documento valido" : "Attenzione"}</b><br />{message}</div>
          {data.issues.length > 0 && (
            <div className="field">
              <label>Problemi rilevati</label>
              <div className="list">{data.issues.map((i: string, k: number) => <div key={k} className="list-item" style={{ whiteSpace: "normal" }}>{i}</div>)}</div>
            </div>
          )}
          <div className="section-title">Firme digitali ({data.signatures.length})</div>
          {!data.signatures.length && <div className="hint">Il documento non contiene firme digitali.</div>}
          {data.signatures.map((s: any, i: number) => (
            <div key={i} className="note" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div><b>{s.field}</b></div>
              {s.error ? <span className="badge err">{s.error}</span> : (
                <>
                  <div className="btn-row">
                    <span className={`badge ${s.intact ? "ok" : "err"}`}>{s.intact ? "Integra" : "Documento alterato"}</span>
                    <span className={`badge ${s.valid ? "ok" : "err"}`}>{s.valid ? "Crittograficamente valida" : "Non valida"}</span>
                    <span className={`badge ${s.trusted ? "ok" : ""}`}>{s.trusted ? "Certificato attendibile" : "Attendibilità non verificata"}</span>
                  </div>
                  <KV rows={[["Firmatario", s.signer], ["Emesso da", s.issuer], ["Data firma", s.signing_time], ["Marca temporale", s.timestamp], ["Copertura", s.coverage], ["Modifiche successive", s.modified_after]]} />
                </>
              )}
            </div>
          ))}
          {data.info.pdfa_claim && !data.verapdf && (
            <div className="hint">Per una verifica PDF/A completa installa veraPDF: verrà usato automaticamente.</div>
          )}
          {data.verapdf && <pre className="note" style={{ whiteSpace: "pre-wrap", fontSize: 11 }}>{data.verapdf}</pre>}
        </>
      )}
    </PanelShell>
  );
}
