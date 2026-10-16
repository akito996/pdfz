import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle, BadgeCheck, CheckCircle2, ChevronDown, ChevronRight, Clock, ExternalLink, FileDown, FileKey2, FileText,
  FolderOpen, Lock, RefreshCw, ShieldAlert, ShieldCheck, Stamp, Trash2, Upload, XCircle,
} from "lucide-react";
import { api, desktop, download, humanSize, isLocalEngine, type P7mResult } from "../api";
import { useApp } from "../context";
import { useEvent, useStored } from "../hooks";
import type { ToolDef } from "../tools";
import { PanelShell } from "./ToolPanel";
import { Advanced } from "./fields";

import { inbox, type P7mSource } from "./p7mInbox";
export { isSignedContent, isSignedFile, sendToP7m, type P7mSource } from "./p7mInbox";

const VERDICT = {
  valid: { label: "Firma valida", cls: "ok", Icon: ShieldCheck },
  warning: { label: "Firma valida con avvisi", cls: "warn", Icon: ShieldAlert },
  invalid: { label: "Firma non valida", cls: "err", Icon: XCircle },
} as const;

const fmt = (v?: string) => {
  if (!v) return "–";
  const d = new Date(v);
  return isNaN(d.getTime()) ? v : d.toLocaleString("it-IT", { dateStyle: "short", timeStyle: "medium" });
};

export function P7mPanel({ def, onClose }: { def: ToolDef; onClose: () => void }) {
  const app = useApp();
  const [src, setSrc] = useState<P7mSource | null>(null);
  const [detached, setDetached] = useState<{ id: string; name: string } | null>(null);
  const [needDetached, setNeedDetached] = useState(false);
  const [online, setOnline] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<P7mResult | null>(null);
  const [trust, setTrust] = useState<any>(null);
  const [trustBusy, setTrustBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const detRef = useRef<HTMLInputElement>(null);
  // azioni: estrai nella cartella, marca temporale, cifra (anche su più file scelti in Esplora risorse)
  const [batch, setBatch] = useState<P7mSource[]>([]);
  const [done, setDone] = useState<{ name: string; path?: string; output?: { id: string; name: string; size: number }; note?: string }[]>([]);
  const [acting, setActing] = useState<string | null>(null);
  const [tsa, setTsa] = useStored<{ url: string; user: string }>("hdpdf.tsa", { url: "", user: "" });
  const [tsaPw, setTsaPw] = useState("");
  const [certs, setCerts] = useState<{ id: string; name: string }[]>([]);
  const [showCifra, setShowCifra] = useState(false);
  const certRef = useRef<HTMLInputElement>(null);

  const verify = useEvent(async (s: P7mSource, det: { id: string } | null = detached) => {
    setSrc(s);
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const r = await api.p7mAnalyze({ asset: s.asset, path: s.path }, { detached: det?.id, online });
      setResult(r);
      setNeedDetached(false);
      setTrust(r.report.trust);
    } catch (e: any) {
      const msg = String(e.message || e);
      setError(msg);
      setNeedDetached(/separata/i.test(msg));
    } finally {
      setBusy(false);
    }
  });

  const targets = (): P7mSource[] => (batch.length ? batch : src ? [src] : []);
  const name = (p: string) => p.split(/[\\/]/).pop() || p;
  const extractAll = useEvent(async (list: P7mSource[]) => {
    setActing("estrai");
    for (const t of list) {
      if (!t.path) continue;
      try {
        const r = await api.p7mExtract(t.path);
        setDone((d) => [...d, { name: r.name, path: r.path, note: "estratto" }]);
      } catch (e: any) { app.toast(`${t.name}: ${e.message}`, "err"); }
    }
    setActing(null);
  });
  const timestampAll = useEvent(async (list: P7mSource[]) => {
    setActing("marca");
    let first: P7mSource | null = null, free = false;
    for (const t of list) {
      try {
        const r = await api.p7mTimestamp({ path: t.path, asset: t.asset }, { url: tsa.url, user: tsa.user, password: tsaPw });
        free = free || r.default_tsa;
        setDone((d) => [...d, { name: r.name, path: r.path, output: r.output, note: r.count > 1 ? `${r.count} firme marcate` : "marcato" }]);
        if (!first && r.path) first = { path: r.path, name: r.name };
      } catch (e: any) { app.toast(`${t.name}: ${e.message}`, "err"); }
    }
    setActing(null);
    if (free) app.toast("Marca temporale aggiunta con il servizio gratuito: prova l'esistenza del file, ma non è una \"data certa\" con valore legale (serve una TSA accreditata AgID).", "info");
    if (first) verify(first, null);   // il rapporto mostra la marca appena aggiunta
  });
  const encryptAll = useEvent(async () => {
    const list = targets();
    if (!list.length || !certs.length) return;
    setActing("cifra");
    try {
      const r = await api.p7mEncrypt(list.map((t) => ({ path: t.path, asset: t.asset })), certs.map((c) => c.id));
      for (const x of r.results) {
        setDone((d) => [...d, { name: x.name, path: x.path, output: x.output, note: `cifrato per ${r.recipients.join(", ")}` }]);
        x.warnings.forEach((w) => app.toast(w, "info"));
      }
      app.toast(r.results.length > 1 ? `${r.results.length} file cifrati.` : "File cifrato.", "ok");
    } catch (e: any) { app.toast(e.message, "err"); } finally { setActing(null); }
  });
  const pickCert = async (fl: FileList | null) => {
    for (const f of Array.from(fl || [])) {
      try { const a = await api.asset(f); setCerts((c) => [...c, { id: a.id, name: f.name }]); } catch (e: any) { app.toast(e.message, "err"); }
    }
  };
  const saveOutput = useEvent(async (o: { id: string; name: string; size: number }) => { await saveFile(o.id, o.name, o.size); });

  // file in arrivo da Apri / trascina / "Apri con" / menu del tasto destro
  useEffect(() => {
    const drain = () => {
      const next = inbox.items.pop();
      inbox.items = [];
      if (!next) return;
      setDetached(null);
      const list: P7mSource[] = (next.paths?.length ? next.paths : next.path ? [next.path] : []).map((p) => ({ path: p, name: name(p) }));
      setBatch(list.length > 1 ? list : []);
      setDone([]);
      setShowCifra(next.action === "cifra");
      if (next.action === "estrai") { extractAll(list); verify(list[0] || next, null); }
      else if (next.action === "marca") timestampAll(list.length ? list : [next]);
      else verify(list[0] || next, null);
    };
    inbox.notify = drain;
    drain();
    return () => { inbox.notify = null; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { api.p7mTrust().then(setTrust).catch(() => {}); }, []);

  const pick = async (f: File) => {
    try {
      const a = await api.asset(f);
      setDetached(null);
      verify({ asset: a.id, name: f.name }, null);
    } catch (e: any) { app.toast(e.message, "err"); }
  };
  const pickDetached = async (f: File) => {
    try {
      const a = await api.asset(f);
      const d = { id: a.id, name: f.name };
      setDetached(d);
      if (src) verify(src, d);
    } catch (e: any) { app.toast(e.message, "err"); }
  };

  const refreshTrust = async () => {
    setTrustBusy(true);
    try {
      const t = await api.p7mTrust(true);
      setTrust(t);
      if (t.available && t.source === "online") app.toast(`Elenco AgID aggiornato: ${t.count} certificati.`, "ok");
      else app.toast(t.error || "Elenco non aggiornato.", "err");
    } catch (e: any) { app.toast(e.message, "err"); } finally { setTrustBusy(false); }
  };

  const tslRef = useRef<HTMLInputElement>(null);
  const uploadTrust = async (f: File) => {
    setTrustBusy(true);
    try {
      const t = await api.p7mTrustUpload(f);
      setTrust(t);
      app.toast(`Elenco AgID caricato: ${t.count} certificati.`, "ok");
    } catch (e: any) { app.toast(e.message, "err"); } finally { setTrustBusy(false); }
  };

  const saveFile = useEvent(async (id: string, name: string, size: number) => {
    const path = await download(id, name);
    if (path) app.addDownload({ itemId: id, name: String(path).split(/[\\/]/).pop() || name, size, status: "saved", path: String(path) });
  });
  const saveReport = useEvent(async () => {
    if (!result) return;
    try {
      const out = await api.p7mReport(result.report);
      await saveFile(out.id, out.name, out.size);
    } catch (e: any) { app.toast(e.message, "err"); }
  });
  const openDoc = useEvent(() => { if (result?.doc) { app.openDoc(result.doc); onClose(); } });
  const openExternal = useEvent(async () => { if (result) await desktop.openExternal(result.content.id); });

  useEffect(() => {
    if (!result) { app.setMainView(busy ? <div className="p7m-view"><div className="p7m-busy"><div className="spin" /> Verifica delle firme in corso…</div></div> : null); return; }
    app.setMainView(<P7mReport result={result} onOpenDoc={openDoc} onSave={() => saveFile(result.content.id, result.content.name, result.content.size)}
      onOpenExternal={desktop.available() ? openExternal : undefined} onReport={saveReport} />);
  }, [result, busy]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => app.setMainView(null), []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <PanelShell def={def} onClose={onClose}
      footer={<button className="btn primary block" onClick={() => fileRef.current?.click()} disabled={busy}><Upload size={15} /> Scegli file firmato…</button>}>
      {/* Android non conosce l'estensione .p7m: con il filtro i file firmati risulterebbero non selezionabili */}
      <input ref={fileRef} type="file" hidden accept={isLocalEngine() ? undefined : ".p7m,.p7s,.p7c,application/pkcs7-mime,application/pkcs7-signature"}
        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) pick(f); }} />
      <input ref={detRef} type="file" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) pickDetached(f); }} />

      {src ? (
        <div className="list"><div className="list-item"><BadgeCheck size={15} /><span className="grow" title={src.name}>{src.name}</span>
          <button className="btn icon ghost small" title="Verifica di nuovo" disabled={busy} onClick={() => verify(src)}><RefreshCw size={14} /></button></div></div>
      ) : (
        <div className="note">Apri un file <b>.p7m</b> (documento firmato, anche con più firme o firme annidate) o <b>.p7s</b> (firma separata).
          Puoi anche trascinarlo nella finestra o aprirlo con <b>Apri</b>.</div>
      )}
      {needDetached && (
        <div className="note warn">
          Questa è una firma separata: serve anche il documento originale.
          <div className="btn-row" style={{ marginTop: 6 }}><button className="btn small" onClick={() => detRef.current?.click()}><FileText size={14} /> Carica il documento…</button></div>
        </div>
      )}
      {detached && <div className="hint">Documento firmato: {detached.name}</div>}
      {error && !needDetached && <div className="note err">{error}</div>}

      {batch.length > 1 && <div className="hint">{batch.length} file selezionati: {batch.map((b) => b.name).join(", ")}</div>}
      {/* azioni (estrai nella cartella, marca, cifra): app Windows; nell'app Android il motore non ha accesso alla rete per la TSA */}
      {!isLocalEngine() && (src || batch.length > 0) && (
        <>
          <div className="section-title">Azioni</div>
          <div className="btn-row" style={{ flexWrap: "wrap" }}>
            {desktop.available() && targets().some((t) => t.path) && (
              <button className="btn small" disabled={!!acting} onClick={() => extractAll(targets())}><FileDown size={14} /> Estrai nella cartella</button>
            )}
            <button className="btn small" disabled={!!acting} onClick={() => timestampAll(targets())}><Stamp size={14} /> {acting === "marca" ? "Marca in corso…" : "Marca temporale"}</button>
            <button className={`btn small ${showCifra ? "primary" : ""}`} disabled={!!acting} onClick={() => setShowCifra((v) => !v)}><Lock size={14} /> Cifra…</button>
          </div>
          {showCifra && (
            <div className="p7m-cifra">
              <div className="hint">Cifra il file per uno o più destinatari: solo chi ha la chiave del certificato scelto potrà aprirlo.
                Crea un file <b>.p7e</b> accanto all'originale.</div>
              {certs.map((c) => (
                <div key={c.id} className="list-item"><FileKey2 size={14} /><span className="grow">{c.name}</span>
                  <button className="btn icon ghost small" aria-label="Togli" onClick={() => setCerts((l) => l.filter((x) => x.id !== c.id))}><Trash2 size={13} /></button></div>
              ))}
              <div className="btn-row">
                <button className="btn small" onClick={() => certRef.current?.click()}><FileKey2 size={14} /> Certificato del destinatario…</button>
                <button className="btn small primary" disabled={!certs.length || !!acting} onClick={encryptAll}>
                  <Lock size={14} /> {acting === "cifra" ? "Cifratura…" : `Cifra${targets().length > 1 ? ` ${targets().length} file` : ""}`}
                </button>
              </div>
              <input ref={certRef} type="file" hidden multiple accept=".cer,.crt,.pem,.der,application/x-x509-ca-cert,application/pkix-cert"
                onChange={(e) => { pickCert(e.target.files); e.target.value = ""; }} />
            </div>
          )}
          {done.length > 0 && (
            <div className="list">
              {done.map((d, i) => (
                <div key={i} className="list-item"><CheckCircle2 size={14} color="var(--ok, #15803d)" />
                  <span className="grow" title={d.path || d.name}>{d.name}{d.note ? <span className="hint"> · {d.note}</span> : null}</span>
                  {d.path && desktop.available() && <button className="btn icon ghost small" title="Mostra nella cartella" onClick={() => desktop.reveal(d.path!)}><FolderOpen size={14} /></button>}
                  {d.output && <button className="btn icon ghost small" title="Salva…" onClick={() => saveOutput(d.output!)}><FileDown size={14} /></button>}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      <Advanced>
      {!isLocalEngine() && <>
      <div className="section-title">Servizio di marca temporale (TSA)</div>
      <div className="field"><label>Indirizzo</label>
        <input className="input" value={tsa.url} onChange={(e) => setTsa({ ...tsa, url: e.target.value })} placeholder="vuoto = servizio gratuito (non qualificato)" /></div>
      <div className="row">
        <input className="input" value={tsa.user} onChange={(e) => setTsa({ ...tsa, user: e.target.value })} placeholder="Utente (se richiesto)" />
        <input className="input" type="password" value={tsaPw} onChange={(e) => setTsaPw(e.target.value)} placeholder="Password" />
      </div>
      <div className="hint">Per una marca con valore legale (data certa) serve una TSA accreditata AgID, es. Aruba, InfoCert, Namirial,
        con le credenziali del contratto. La password non viene salvata.</div>
      </>}

      <div className="section-title">Verifica</div>
      <label className="check"><input type="checkbox" checked={online} onChange={(e) => setOnline(e.target.checked)} /> Controlla la revoca online (OCSP/CRL)</label>
      <div className="hint">Senza internet la verifica funziona lo stesso, ma non si può sapere se il certificato è stato revocato.</div>

      <div className="section-title">Elenco certificatori AgID</div>
      {trust?.available ? (
        <div className="hint">{trust.count} certificati di CA e TSA qualificate · elenco del {fmt(trust.issued)}{trust.source === "app" ? " · copia inclusa nell'app" : trust.fetched ? ` · scaricato il ${fmt(trust.fetched)}` : ""}</div>
      ) : (
        <div className="note warn">{trust?.error || "Elenco non ancora scaricato."} Senza elenco non si può verificare se il certificato è di una CA riconosciuta.</div>
      )}
      <button className="btn small" style={{ alignSelf: "flex-start" }} onClick={refreshTrust} disabled={trustBusy}>
        <RefreshCw size={13} className={trustBusy ? "spin-icon" : ""} /> {trustBusy ? "Aggiornamento…" : "Aggiorna elenco"}
      </button>
      <button className="btn small ghost" style={{ alignSelf: "flex-start" }} onClick={() => tslRef.current?.click()} disabled={trustBusy}
        title="Senza internet: scarica TSL-IT.xml da eidas.agid.gov.it/TL/TSL-IT.xml su un altro dispositivo e caricalo qui">
        <Upload size={13} /> Carica elenco da file…
      </button>
      <input ref={tslRef} type="file" hidden accept=".xml,text/xml,application/xml"
        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) uploadTrust(f); }} />
      </Advanced>
    </PanelShell>
  );
}

function P7mReport({ result, onOpenDoc, onSave, onOpenExternal, onReport }: {
  result: P7mResult; onOpenDoc: () => void; onSave: () => void; onOpenExternal?: () => void; onReport: () => void;
}) {
  const r = result.report;
  const v = VERDICT[r.verdict as keyof typeof VERDICT] || VERDICT.invalid;
  const signers: { s: any; level: number }[] = r.envelopes.flatMap((e: any) => e.signers.map((s: any) => ({ s, level: e.level })));
  return (
    <div className="p7m-view">
      <div className={`p7m-banner ${v.cls}`}>
        <v.Icon size={30} />
        <div className="grow">
          <div className="p7m-verdict">{v.label}</div>
          <div>{r.file} · {r.signatures} {r.signatures === 1 ? "firma" : "firme"}{r.levels > 1 ? ` su ${r.levels} livelli` : ""} · verificato il {fmt(r.checked)}{r.online ? "" : " · revoca non controllata"}</div>
        </div>
        <button className="btn" onClick={onReport}><FileDown size={15} /> Salva rapporto</button>
      </div>

      <div className="p7m-card">
        <div className="p7m-doc">
          <FileText size={28} color="var(--brand)" />
          <div className="grow">
            <div className="p7m-docname">{r.content.name}</div>
            <div className="hint">Documento contenuto · {humanSize(r.content.size)}</div>
          </div>
          {result.doc && <button className="btn primary" onClick={onOpenDoc}><FolderOpen size={15} /> Apri documento</button>}
          <button className="btn" onClick={onSave}><FileDown size={15} /> Salva documento…</button>
          {onOpenExternal && !result.doc && <button className="btn" onClick={onOpenExternal}><ExternalLink size={15} /> Apri con il programma predefinito</button>}
        </div>
      </div>

      {signers.map(({ s, level }, i) => <SignerCard key={i} s={s} n={i + 1} level={r.levels > 1 ? level + 1 : 0} />)}
    </div>
  );
}

function SignerCard({ s, n, level }: { s: any; n: number; level: number }) {
  const [open, setOpen] = useState(false);
  const v = VERDICT[s.verdict as keyof typeof VERDICT] || VERDICT.invalid;
  const c = s.cert || {};
  const check = (ok: boolean, label: string, warn = false) => (
    <span className={`p7m-check ${ok ? "ok" : warn ? "warn" : "err"}`}>
      {ok ? <CheckCircle2 size={14} /> : warn ? <AlertTriangle size={14} /> : <XCircle size={14} />} {label}
    </span>
  );
  return (
    <div className={`p7m-card signer ${v.cls}`}>
      <div className="p7m-signer-head">
        <v.Icon size={22} />
        <div className="grow">
          <div className="p7m-name">{c.name || "Firmatario sconosciuto"}{level ? <span className="p7m-tag">busta {level}</span> : null}</div>
          <div className="hint">Firma {n} · {v.label}{c.qualified ? " · firma qualificata" : ""}</div>
        </div>
      </div>
      <div className="p7m-checks">
        {check(!!s.intact, "Documento integro")}
        {check(!!s.trusted, s.trusted ? "Certificato attendibile (AgID)" : "Certificato non verificato", !s.revoked && !!s.intact)}
        {check(!s.revoked, s.revoked ? "Certificato revocato" : "Non revocato")}
        {s.timestamp ? check(!!s.timestamp.trusted, "Marca temporale", true) : null}
      </div>
      {(s.errors?.length > 0 || s.warnings?.length > 0) && (
        <ul className="p7m-msgs">
          {s.errors.map((e: string, i: number) => <li key={"e" + i} className="err">{e}</li>)}
          {s.warnings.map((w: string, i: number) => <li key={"w" + i} className="warn">{w}</li>)}
        </ul>
      )}
      <dl className="p7m-grid">
        <dt>Codice fiscale</dt><dd>{c.fiscal_code || "–"}</dd>
        {c.organization && <><dt>Organizzazione</dt><dd>{c.organization}{c.organizational_unit ? ` · ${c.organizational_unit}` : ""}</dd></>}
        {c.title && <><dt>Ruolo</dt><dd>{c.title}</dd></>}
        <dt>Emesso da</dt><dd>{c.issuer || "–"}</dd>
        <dt>Validità certificato</dt><dd>{fmt(c.valid_from)} – {fmt(c.valid_to)}</dd>
        <dt>Data della firma</dt><dd>{fmt(s.signing_time)} <span className="hint">(dichiarata dal firmatario)</span></dd>
        <dt>Marca temporale</dt><dd>{s.timestamp ? <><Clock size={12} /> {fmt(s.timestamp.time)} · {s.timestamp.tsa || "TSA"}</> : "assente"}</dd>
        <dt>Verificata alla data</dt><dd>{fmt(s.checked_at)} <span className="hint">({s.checked_at_source})</span></dd>
      </dl>
      <button className="btn small ghost" onClick={() => setOpen((o) => !o)}>
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />} Dettagli tecnici
      </button>
      {open && (
        <dl className="p7m-grid tech">
          <dt>Numero di serie</dt><dd>{c.serial}</dd>
          <dt>Impronta SHA-256</dt><dd className="mono">{c.sha256}</dd>
          <dt>Algoritmo</dt><dd>{s.digest_algorithm}{s.cades_bes ? " · CAdES-BES" : " · PKCS#7"}</dd>
          <dt>Uso della chiave</dt><dd>{(c.key_usage || []).join(", ") || "–"}</dd>
          <dt>Dispositivo sicuro (QSCD)</dt><dd>{c.qscd ? "sì" : "no"}</dd>
          <dt>Catena</dt><dd>{(s.chain || []).join(" → ") || "–"}</dd>
          {s.counter_signatures > 0 && <><dt>Controfirme</dt><dd>{s.counter_signatures} (non verificate)</dd></>}
          {c.email && <><dt>Email</dt><dd>{c.email}</dd></>}
        </dl>
      )}
    </div>
  );
}
