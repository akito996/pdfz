import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Download, ExternalLink, FileDown, FolderOpen, Trash2 } from "lucide-react";
import { desktop, download, humanSize } from "../api";

export interface DownloadEntry {
  id: number;
  itemId: string;
  name: string;
  size: number;
  time: number;
  status: "ready" | "saved";
  path?: string | null;
  note?: string;
}

/** Pulsante "download" in alto a destra, come in Chrome: elenco dei file salvati e
 *  dei file prodotti dalle conversioni, con apertura e "Mostra nella cartella". */
export function Downloads({ entries, setEntries, flash }: {
  entries: DownloadEntry[];
  setEntries: (fn: (e: DownloadEntry[]) => DownloadEntry[]) => void;
  flash: number;
}) {
  const [open, setOpen] = useState(false);
  const [unseen, setUnseen] = useState(0);
  const [pulse, setPulse] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const lastFlash = useRef(flash);

  // un nuovo elemento apre il riquadro per qualche secondo
  useEffect(() => {
    if (flash === lastFlash.current) return;
    lastFlash.current = flash;
    setPulse(true);
    setOpen(true);
    setUnseen((u) => u + 1);
    const t = setTimeout(() => setPulse(false), 1500);
    return () => clearTimeout(t);
  }, [flash]);

  useEffect(() => {
    if (!open) return;
    setUnseen(0);
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const save = async (e: DownloadEntry) => {
    const path = await download(e.itemId, e.name);
    if (path) setEntries((list) => list.map((x) => (x.id === e.id ? { ...x, status: "saved", path: desktop.available() ? String(path) : null } : x)));
  };

  return (
    <div className="dl" ref={ref}>
      <button className={`btn icon ghost dl-btn ${pulse ? "pulse" : ""}`} title="Download e salvataggi" onClick={() => setOpen((o) => !o)}>
        <Download size={18} />
        {unseen > 0 && <span className="dl-badge">{unseen}</span>}
      </button>
      {open && (
        <div className="dl-pop">
          <div className="dl-head">
            <b>Download recenti</b>
            {entries.length > 0 && <button className="btn small ghost" onClick={() => setEntries(() => [])}><Trash2 size={13} /> Svuota</button>}
          </div>
          {!entries.length && <div className="dl-empty">I file salvati e convertiti compariranno qui.</div>}
          <div className="dl-list">
            {entries.map((e) => (
              <div key={e.id} className="dl-item">
                <div className={`dl-ico ${e.status}`}>{e.status === "saved" ? <CheckCircle2 size={18} /> : <FileDown size={18} />}</div>
                <div className="dl-info">
                  <div className="dl-name" title={e.path || e.name}>{e.name}</div>
                  <div className="dl-meta">
                    {humanSize(e.size)} · {new Date(e.time).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}
                    {e.status === "ready" ? " · da salvare" : e.path ? ` · ${shortPath(e.path)}` : " · salvato"}
                  </div>
                  <div className="btn-row" style={{ marginTop: 4 }}>
                    {e.status === "ready" && <button className="btn small primary" onClick={() => save(e)}><Download size={13} /> Salva</button>}
                    {desktop.available() && (e.path
                      ? <button className="btn small" onClick={() => desktop.openPath(e.path!)}><ExternalLink size={13} /> Apri</button>
                      : <button className="btn small" onClick={() => desktop.openExternal(e.itemId)}><ExternalLink size={13} /> Apri</button>)}
                    {desktop.available() && e.path && <button className="btn small" onClick={() => desktop.reveal(e.path!)}><FolderOpen size={13} /> Mostra nella cartella</button>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function shortPath(p: string) {
  const parts = p.split(/[\\/]/);
  return parts.length > 3 ? `…\\${parts.slice(-2, -1)[0]}` : parts.slice(0, -1).join("\\");
}
