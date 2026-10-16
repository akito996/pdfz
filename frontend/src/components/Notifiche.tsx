import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bell, Download, Gauge, MinusCircle, PackageCheck, PencilLine, Sparkles, Wrench, X,
  type LucideIcon,
} from "lucide-react";
import { api, desktop, isLocalEngine } from "../api";
import { useStored } from "../hooks";
import novitaData from "../novita.json";

/**
 * Campanella delle notifiche:
 *  - al primo avvio dopo un aggiornamento mostra l'anteprima delle novità (confronto con l'ultima versione vista);
 *  - se è stata pubblicata una versione più recente (versione-windows.json / versione-android.json) lo segnala;
 *  - toccando l'anteprima si apre la schermata con tutte le modifiche, per tipo e per punto dell'app.
 */
export type Tipo = "nuovo" | "modifica" | "correzione" | "installer" | "ottimizzazione" | "rimosso";
export interface Voce { tipo: Tipo; piattaforme?: string[]; dove?: string; titolo: string; dettaglio?: string }
export interface Versione { versione: string; data?: string; titolo?: string; voci: Voce[] }

export const TIPI: Record<Tipo, { label: string; piu: string; Icon: LucideIcon; cls: string }> = {
  nuovo: { label: "Nuova funzione", piu: "nuove funzioni", Icon: Sparkles, cls: "t-nuovo" },
  modifica: { label: "Modifica a una funzione", piu: "modifiche", Icon: PencilLine, cls: "t-modifica" },
  correzione: { label: "Correzione", piu: "correzioni", Icon: Wrench, cls: "t-correzione" },
  installer: { label: "Installer", piu: "installer", Icon: PackageCheck, cls: "t-installer" },
  ottimizzazione: { label: "Ottimizzazione", piu: "ottimizzazioni", Icon: Gauge, cls: "t-ottimizzazione" },
  rimosso: { label: "Eliminato", piu: "eliminati", Icon: MinusCircle, cls: "t-rimosso" },
};
const ORDINE: Tipo[] = ["nuovo", "modifica", "correzione", "ottimizzazione", "installer", "rimosso"];

/** Piattaforma su cui gira l'app: decide quali novità mostrare e se controllare gli aggiornamenti.
 *  App mobile: dal tipo di build (vite --mode android / ios), noto subito. Prima si usava isLocalEngine(), che qui
 *  (al caricamento del modulo, prima che parta il motore) era ancora falso: su Android risultava "windows".
 *  App desktop: Windows, macOS o Linux dal browser integrato. */
function piattaforma(): string {
  if (import.meta.env.MODE === "ios") return "ios";
  if (import.meta.env.MODE === "android") return "android";
  const ua = navigator.userAgent;
  if (/Macintosh|Mac OS X/i.test(ua)) return "macos";
  if (/Linux/i.test(ua) && !/Android/i.test(ua)) return "linux";
  return "windows";
}
const PIATTAFORMA = piattaforma();
const NOMI: Record<string, string> = { windows: "Windows", android: "Android", ios: "iPhone", macos: "macOS", linux: "Linux" };
const VER = /^(\d+)\.(\d+)\.(\d+)$/;
/** Versioni MAJOR.MINOR.PATCH (dalla 1.0.0), confrontate numero per numero.
 *  Le vecchie AAAAMM.NNN (fino alla 202610.015) contano come più vecchie di qualsiasi 1.0.0 o successiva. */
const chiave = (v: string | null) => { const m = VER.exec(v || ""); return m ? [1, +m[1], +m[2], +m[3]] : [0]; };
const piuNuova = (a: string, b: string | null) => {
  if (!VER.test(a)) return false;
  const x = chiave(a), y = chiave(b);
  for (let i = 0; i < x.length; i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) > (y[i] ?? 0);
  return false;
};
const perMe = (v: Voce) => !v.piattaforme?.length || v.piattaforme.includes(PIATTAFORMA);
const filtra = (v: Versione): Versione => ({ ...v, voci: v.voci.filter(perMe) });
const fmtData = (d?: string) => {
  if (!d) return "";
  const t = new Date(d);
  return isNaN(t.getTime()) ? d : t.toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" });
};

interface Update { latest: string; date?: string; title?: string; novita: Voce[]; download: string }

async function controllaAggiornamento(base: string): Promise<Update | null> {
  // l'avviso esiste per Windows (MSI), macOS (DMG), Linux (AppImage) e Android (APK);
  // sull'iPhone gli aggiornamenti passano da TestFlight / App Store
  if (!["windows", "macos", "linux", "android"].includes(PIATTAFORMA)) return null;
  if (isLocalEngine()) {
    // app Android: il motore non ha rete; la richiesta la fa l'app (CapacitorHttp, senza limiti CORS)
    if (!base) return null;
    const { CapacitorHttp } = await import("@capacitor/core");
    const r = await CapacitorHttp.get({ url: `${base}versione-android.json`, headers: { "Cache-Control": "no-cache" } });
    let info: any = r.data;
    if (typeof info === "string") info = JSON.parse(info.replace(/^﻿/, ""));
    if (!info?.version) return null;
    return { latest: info.version, date: info.date, title: info.titolo, novita: info.novita || [], download: info.url || (info.file ? base + info.file : "") };
  }
  const r: any = await api.updateCheck(PIATTAFORMA);
  if (!r?.configured || !r.latest) return null;
  return { latest: r.latest, date: r.date, title: r.title, novita: r.novita || [], download: r.download };
}

export function Notifiche({ version, updateUrl }: { version?: string; updateUrl?: string }) {
  const [seen, setSeen] = useStored<string | null>("hdpdf.versioneVista", null);
  const [dismissedUpd, setDismissedUpd] = useStored<string | null>("hdpdf.aggiornamentoVisto", null);
  const [cache, setCache] = useStored<{ t: number; u: Update | null } | null>("hdpdf.controlloAggiornamenti", null);
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<{ versioni: Versione[]; update?: Update } | null>(null);
  const [upd, setUpd] = useState<Update | null>(cache?.u || null);
  const auto = useRef(false);

  const tutte = useMemo(() => (novitaData.versioni as Versione[]).map(filtra).filter((v) => v.voci.length), []);
  // novità non ancora viste: dalle versioni dopo l'ultima vista fino a quella installata (al primo avvio: solo l'attuale)
  const nuove = useMemo(() => {
    if (!version) return [];
    const fino = tutte.filter((v) => !piuNuova(v.versione, version));
    if (!seen) return fino.filter((v) => v.versione === version).slice(0, 1);
    return fino.filter((v) => piuNuova(v.versione, seen));
  }, [tutte, version, seen]);
  const corrente = tutte.find((v) => v.versione === version) || tutte[0];
  const aggiornamento = upd && version && piuNuova(upd.latest, version) ? upd : null;
  const updNuovo = !!aggiornamento && dismissedUpd !== aggiornamento.latest;
  const badge = (nuove.length ? 1 : 0) + (updNuovo ? 1 : 0);

  // controllo della nuova versione: all'avvio e poi ogni 6 ore (solo se è configurato lo spazio degli aggiornamenti)
  useEffect(() => {
    if (!version) return;
    if (!updateUrl) return;   // spazio degli aggiornamenti non ancora configurato: nessun controllo
    let alive = true;
    const run = async () => {
      if (cache && Date.now() - cache.t < 6 * 3600 * 1000) return;
      try {
        const u = await controllaAggiornamento(updateUrl || "");
        if (!alive) return;
        setUpd(u);
        setCache({ t: Date.now(), u });
      } catch { /* senza rete si riprova al prossimo avvio */ }
    };
    run();
    const t = window.setInterval(run, 6 * 3600 * 1000);
    return () => { alive = false; window.clearInterval(t); };
  }, [version, updateUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  // primo avvio dopo un aggiornamento (o nuova versione disponibile): l'anteprima si apre da sola, una volta
  useEffect(() => {
    if (auto.current || !version) return;
    if (nuove.length || updNuovo) { auto.current = true; setOpen(true); }
  }, [version, nuove.length, updNuovo]);

  const chiudi = () => {
    setOpen(false);
    if (version && nuove.length) setSeen(version);
    if (aggiornamento) setDismissedUpd(aggiornamento.latest);
  };
  const apri = (d: { versioni: Versione[]; update?: Update }) => { chiudi(); setDetail(d); };
  const scarica = (url: string) => {
    if (!url) return;
    if (desktop.available() && window.pywebview?.api?.open_url) window.pywebview.api.open_url(url);
    else if (isLocalEngine()) window.location.href = url;   // Android: si apre il browser, che scarica l'APK
    else window.open(url, "_blank", "noopener");
  };

  return (
    <>
      <div className="notif">
        <button className="btn icon ghost notif-btn" title="Notifiche e novità" aria-label={`Notifiche${badge ? ` (${badge} nuove)` : ""}`}
          onClick={() => (open ? chiudi() : setOpen(true))}>
          <Bell size={18} />
          {badge > 0 ? <span className="notif-badge">{badge}</span>
            : aggiornamento ? <span className="notif-badge upd" title="Aggiornamento disponibile" /> : null}
        </button>
        {open && (
          <>
            <div className="notif-back" onClick={chiudi} aria-hidden />
            <div className="notif-pop" role="dialog" aria-label="Notifiche">
              <div className="notif-head"><b>Notifiche</b>
                <button className="btn icon ghost small" onClick={chiudi} aria-label="Chiudi"><X size={15} /></button></div>
              {aggiornamento && (
                <Anteprima tag="Nuova versione disponibile" nuovo={updNuovo}
                  v={{ versione: aggiornamento.latest, data: aggiornamento.date, titolo: aggiornamento.title, voci: aggiornamento.novita.filter(perMe) }}
                  onOpen={() => apri({ versioni: [{ versione: aggiornamento.latest, data: aggiornamento.date, titolo: aggiornamento.title, voci: aggiornamento.novita.filter(perMe) }], update: aggiornamento })}
                  action={aggiornamento.download ? <button className="btn small primary" onClick={(e) => { e.stopPropagation(); scarica(aggiornamento.download); }}><Download size={14} /> Scarica</button> : null} />
              )}
              {(nuove.length ? nuove : corrente ? [corrente] : []).map((v) => (
                <Anteprima key={v.versione} v={v} nuovo={nuove.includes(v)}
                  tag={v.versione === version ? "Novità di questa versione" : "Versione precedente"}
                  onOpen={() => apri({ versioni: nuove.length ? nuove : [v] })} />
              ))}
              <button className="btn small ghost" style={{ alignSelf: "flex-start" }} onClick={() => apri({ versioni: tutte })}>Tutte le versioni…</button>
            </div>
          </>
        )}
      </div>
      {detail && <NovitaView {...detail} current={version} onClose={() => setDetail(null)} onDownload={scarica} />}
    </>
  );
}

function conteggi(voci: Voce[]) {
  const c: Partial<Record<Tipo, number>> = {};
  voci.forEach((v) => { c[v.tipo] = (c[v.tipo] || 0) + 1; });
  return ORDINE.filter((t) => c[t]).map((t) => ({ t, n: c[t]! }));
}

function Anteprima({ v, tag, nuovo, onOpen, action }: { v: Versione; tag: string; nuovo: boolean; onOpen: () => void; action?: React.ReactNode }) {
  return (
    <div className={`notif-card ${nuovo ? "new" : ""}`} role="button" tabIndex={0} onClick={onOpen}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(); } }}>
      <div className="notif-tag">{nuovo && <span className="dot" />}{tag}</div>
      <div className="notif-title">Versione {v.versione}{v.titolo ? ` · ${v.titolo}` : ""}</div>
      {v.data && <div className="hint">{fmtData(v.data)}</div>}
      <div className="notif-chips">
        {conteggi(v.voci).map(({ t, n }) => {
          const T = TIPI[t];
          return <span key={t} className={`chip ${T.cls}`}><T.Icon size={12} /> {n} {n === 1 ? T.label.toLowerCase() : T.piu}</span>;
        })}
      </div>
      <ul className="notif-list">{v.voci.slice(0, 3).map((x, i) => <li key={i}>{x.titolo}</li>)}</ul>
      <div className="notif-foot"><span className="link">Vedi i dettagli ›</span>{action}</div>
    </div>
  );
}

/** Schermata con le modifiche in dettaglio: per versione, con il tipo di modifica e il punto dell'app. */
function NovitaView({ versioni, update, current, onClose, onDownload }: {
  versioni: Versione[]; update?: Update; current?: string; onClose: () => void; onDownload: (u: string) => void;
}) {
  const [filtro, setFiltro] = useState<Tipo | null>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const tutteVoci = versioni.flatMap((v) => v.voci);
  return (
    <div className="modal-back" onClick={onClose}>
      <div className="novita" role="dialog" aria-label="Novità della versione" onClick={(e) => e.stopPropagation()}>
        <div className="novita-head">
          <div className="grow">
            <h2>{update ? `È disponibile la versione ${update.latest}` : versioni.length === 1 ? `Novità della versione ${versioni[0].versione}` : "Novità delle versioni"}</h2>
            <div className="hint">{current ? `Versione installata: ${current} · ` : ""}{`App ${NOMI[PIATTAFORMA] || PIATTAFORMA}`}</div>
          </div>
          {update?.download && <button className="btn primary" onClick={() => onDownload(update.download)}><Download size={15} /> Scarica e installa</button>}
          <button className="btn icon ghost" onClick={onClose} aria-label="Chiudi"><X size={18} /></button>
        </div>
        <div className="novita-filtri">
          <button className={`chip ${filtro === null ? "on" : ""}`} onClick={() => setFiltro(null)}>Tutte ({tutteVoci.length})</button>
          {conteggi(tutteVoci).map(({ t, n }) => {
            const T = TIPI[t];
            return <button key={t} className={`chip ${T.cls} ${filtro === t ? "on" : ""}`} onClick={() => setFiltro(filtro === t ? null : t)}><T.Icon size={12} /> {T.label} ({n})</button>;
          })}
        </div>
        <div className="novita-body">
          {versioni.map((v) => {
            const voci = v.voci.filter((x) => !filtro || x.tipo === filtro);
            if (!voci.length) return null;
            return (
              <section key={v.versione} className="novita-ver">
                <h3>Versione {v.versione}{v.versione === current ? <span className="p7m-tag">installata</span> : null}</h3>
                <div className="hint">{[fmtData(v.data), v.titolo].filter(Boolean).join(" · ")}</div>
                {ORDINE.filter((t) => voci.some((x) => x.tipo === t)).map((t) => {
                  const T = TIPI[t];
                  return (
                    <div key={t} className="novita-grp">
                      <div className={`novita-grp-title ${T.cls}`}><T.Icon size={15} /> {T.label}</div>
                      {voci.filter((x) => x.tipo === t).map((x, i) => (
                        <div key={i} className={`novita-item ${T.cls}`}>
                          <div className="novita-item-title">{x.titolo}</div>
                          {x.dove && <div className="novita-dove">Dove: <b>{x.dove}</b></div>}
                          {x.dettaglio && <p>{x.dettaglio}</p>}
                          {x.piattaforme && x.piattaforme.length > 0 && (
                            <div className="novita-pf">{x.piattaforme.map((p) => <span key={p} className="pf">{NOMI[p] || p}</span>)}</div>
                          )}
                        </div>
                      ))}
                    </div>
                  );
                })}
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
