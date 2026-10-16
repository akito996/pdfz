import { useEffect, useState } from "react";
import { CheckCircle2, Eye, EyeOff, FlaskConical, Lock, LockOpen, RefreshCw, XCircle } from "lucide-react";
import { api } from "../api";
import { useApp } from "../context";
import type { ToolDef } from "../tools";
import { PanelShell } from "./ToolPanel";
import { KV } from "./InfoPanels";

/**
 * App Android: quali password ha il PDF.
 * Dentro il PDF le password non sono scritte in chiaro (c'è solo un'impronta cifrata): si può sapere SE ci sono
 * e, per la password che hai inserito tu, se è quella di apertura o del proprietario.
 */
const ROLE: Record<string, string> = {
  both: "apertura e proprietario (è la stessa)",
  open: "apertura (la password proprietario è un'altra)",
  owner: "proprietario (permessi)",
  wrong: "non corrisponde a nessuna delle due",
};

type Check = { label: string; ok: boolean; detail: string };

/** Solo per il proprietario (chi ha protetto il file con l'app su questo dispositivo): prova che le password
 *  si comportino come previsto, come le vedrebbe un altro utente. */
function PasswordTest({ docId, info }: { docId: string; info: any }) {
  const [pw, setPw] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [checks, setChecks] = useState<Check[] | null>(null);
  const role = async (p: string) => {
    const r: any = await api.tool("password_info", { doc: docId, params: { password: p } });
    return (r.data?.known?.role || "wrong") as string;
  };
  const allowed = info.permissions ? Object.entries(info.permissions).filter(([, v]) => v).map(([k]) => k) : [];
  const limits = allowed.length ? `permesso: ${allowed.join(", ").toLowerCase()}` : "nessuna azione permessa oltre alla lettura";
  const run = async () => {
    setBusy(true);
    try {
      const out: Check[] = [];
      // 1) senza password
      out.push(info.open_password
        ? { label: "Senza password", ok: true, detail: "Il documento non si apre: corretto." }
        : { label: "Senza password", ok: true, detail: `Si apre in lettura con limiti (${limits}).` });
      // 2) password sbagliata
      const wrong = await role(`errata-${Math.random().toString(36).slice(2)}`);
      out.push({ label: "Password sbagliata", ok: wrong === "wrong", detail: wrong === "wrong" ? "Rifiutata: corretto." : "Accettata: c'è un problema con la protezione!" });
      // 3) la password scritta qui
      if (pw) {
        const r = await role(pw);
        const txt: Record<string, Check> = {
          open: { label: "La tua password", ok: true, detail: `È la password di apertura: apre il documento con limiti (${limits}). Non può togliere la protezione.` },
          owner: { label: "La tua password", ok: true, detail: "È la password del proprietario: sblocca tutto (stampa, copia, modifica, togliere la password)." },
          both: { label: "La tua password", ok: true, detail: "Apre il documento e sblocca tutto: apertura e proprietario sono la stessa password." },
          wrong: { label: "La tua password", ok: false, detail: "Non corrisponde a nessuna password del documento." },
        };
        out.push(txt[r] || txt.wrong);
        if (r === "both" && info.permissions && allowed.length < Object.keys(info.permissions).length) {
          out.push({ label: "Consiglio", ok: false, detail: "Con una sola password chi apre il file ha anche tutti i permessi: i limiti non servono. Usa due password diverse." });
        }
      }
      setChecks(out);
    } catch (e: any) {
      setChecks([{ label: "Verifica", ok: false, detail: e.message || String(e) }]);
    } finally { setBusy(false); }
  };
  return (
    <div className="pw-test">
      <div className="section-title"><FlaskConical size={14} /> Prova le password (solo per te)</div>
      <div className="hint">Hai protetto tu questo file su questo dispositivo: qui controlli che le password funzionino come ti aspetti.
        Gli altri utenti non vedono questa sezione.</div>
      <div className="row">
        <input className="input" type={show ? "text" : "password"} value={pw} onChange={(e) => setPw(e.target.value)} placeholder="Password da provare (facoltativa)"
          onKeyDown={(e) => { if (e.key === "Enter") run(); }} />
        <button className="btn small ghost" onClick={() => setShow((v) => !v)} aria-label={show ? "Nascondi" : "Mostra"}>{show ? <EyeOff size={15} /> : <Eye size={15} />}</button>
      </div>
      <button className="btn small primary" style={{ alignSelf: "flex-start" }} onClick={run} disabled={busy}><FlaskConical size={14} /> {busy ? "Verifica…" : "Esegui la prova"}</button>
      {checks && (
        <ul className="pw-checks">
          {checks.map((c, i) => (
            <li key={i} className={c.ok ? "ok" : "err"}>{c.ok ? <CheckCircle2 size={15} /> : <XCircle size={15} />}<span><b>{c.label}:</b> {c.detail}</span></li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function PasswordInfoPanel({ def, onClose }: { def: ToolDef; onClose: () => void }) {
  const app = useApp();
  const tab = app.tabs.find((t) => t.history[t.index]?.id === app.doc?.id);
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [show, setShow] = useState(false);
  const load = async () => {
    if (!app.doc) return;
    setLoading(true); setError(null);
    try {
      const r: any = await api.tool("password_info", { doc: app.doc.id, params: { password: tab?.password || "" } });
      setData(r.data);
    } catch (e: any) { setError(e.message); } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [app.doc?.id, tab?.password]); // eslint-disable-line react-hooks/exhaustive-deps

  // protezione impostata in questa sessione ma tolta da una modifica successiva: si rimette al salvataggio
  const pending = !!tab?.protect && data && !data.encrypted;
  const known: string | undefined = data?.known?.password || (pending ? tab?.protect?.user_password || tab?.protect?.owner_password : undefined);
  const prot = data?.encrypted || pending;

  return (
    <PanelShell def={def} onClose={onClose}
      footer={<>
        <button className="btn" onClick={load} disabled={loading}><RefreshCw size={15} /> Aggiorna</button>
        {prot
          ? <button className="btn primary" style={{ flex: 1 }} onClick={() => app.pickTool("remove_password")}><LockOpen size={15} /> Rimuovi password</button>
          : <button className="btn primary" style={{ flex: 1 }} onClick={() => app.pickTool("add_password")}><Lock size={15} /> Aggiungi password</button>}
      </>}>
      {loading && !data && <div className="row" style={{ justifyContent: "flex-start" }}><div className="spin" style={{ flex: "none" }} /> Controllo in corso…</div>}
      {error && <div className="note err">{error}</div>}
      {data && (
        <>
          <div className={`pw-state ${prot ? "on" : ""}`}>
            {prot ? <Lock size={22} /> : <LockOpen size={22} />}
            <div>
              <b>{prot ? "Protetto da password" : "Nessuna password"}</b>
              <div className="sub">{prot
                ? data.open_password || pending ? "Per aprire il file serve la password." : "Si apre liberamente, ma alcune azioni sono bloccate."
                : "Chiunque può aprire e modificare il file."}</div>
            </div>
          </div>
          {pending && <div className="note">Hai aggiunto la password e poi modificato il documento: la protezione verrà rimessa quando premi Salva.</div>}
          <KV rows={[
            ["Password di apertura", pending ? true : !!data.open_password],
            ["Password proprietario (permessi)", pending ? true : !!data.owner_password],
            ["Cifratura", pending ? "AES 256 bit (al salvataggio)" : data.method],
          ]} />
          {known && (
            <>
              <div className="section-title">Password che hai inserito</div>
              <div className="row" style={{ justifyContent: "flex-start" }}>
                <code className="pw-val">{show ? known : "•".repeat(Math.min(known.length, 12))}</code>
                <button className="btn small ghost" onClick={() => setShow((s) => !s)} aria-label={show ? "Nascondi password" : "Mostra password"}>
                  {show ? <EyeOff size={15} /> : <Eye size={15} />} {show ? "Nascondi" : "Mostra"}
                </button>
              </div>
              {data.known?.role && <div className="hint">È la password di {ROLE[data.known.role] || "—"}.</div>}
            </>
          )}
          {(data.owner || app.doc?.owner) && data.encrypted && app.doc && <PasswordTest docId={app.doc.id} info={data} />}
          {data.permissions && (
            <>
              <div className="section-title">Cosa è permesso senza la password proprietario</div>
              <KV rows={Object.entries(data.permissions).map(([k, v]) => [k, v ? "consentito" : "bloccato"] as [string, any])} />
            </>
          )}
          {prot && (
            <div className="hint">Le password non sono scritte in chiaro nel PDF (c'è solo un'impronta cifrata): l'app può dirti quali ci sono,
              ma mostra il valore solo della password che hai inserito tu.</div>
          )}
        </>
      )}
    </PanelShell>
  );
}
