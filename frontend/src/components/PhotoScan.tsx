import { useEffect, useRef, useState } from "react";
import { Camera, FileCheck2, FolderOpen, Plus, Trash2, X } from "lucide-react";
import { api } from "../api";
import { cameraAvailable, normalizePhoto, photoName, takePhoto, takePhotoRaw } from "../camera";
import { useApp } from "../context";
import { Seg } from "../panels/fields";

/** Pulsante "Foto" da mettere accanto a "Scegli file" (solo app Android). */
export function CameraButton({ onPhoto, label = "Foto", className = "btn", disabled, title }: {
  onPhoto: (f: File) => void | Promise<void>;
  label?: string;
  className?: string;
  disabled?: boolean;
  title?: string;
}) {
  const [busy, setBusy] = useState(false);
  if (!cameraAvailable()) return null;
  return (
    <button type="button" className={className} disabled={disabled || busy} title={title || "Scatta una foto con la fotocamera"}
      onClick={async () => {
        setBusy(true);
        try { const f = await takePhoto(); if (f) await onPhoto(f); } finally { setBusy(false); }
      }}>
      <Camera size={15} /> {label}
    </button>
  );
}

type Shot = { url: string; asset: Promise<string> };

/** Scatta una o più foto (es. le pagine di un contratto) e crea un PDF.
 *  L'anteprima compare subito; la foto si raddrizza, si riduce e si passa al motore in sottofondo,
 *  così "Crea PDF" è quasi immediato. */
export function PhotoScan({ autoStart, onClose }: { autoStart?: boolean; onClose?: () => void }) {
  const app = useApp();
  const [shots, setShots] = useState<Shot[]>([]);
  const [fit, setFit] = useState("A4");
  const [busy, setBusy] = useState(false);
  const started = useRef(false);

  const shoot = async () => {
    const raw = await takePhotoRaw();
    if (!raw) return false;
    const asset = normalizePhoto(raw).catch(() => raw).then(async (f) => (await api.asset(f)).id);
    asset.catch(() => {});
    setShots((s) => [...s, { url: URL.createObjectURL(raw), asset }]);
    return true;
  };
  // aperta dal menu "Apri → Scatta foto": la fotocamera parte subito
  useEffect(() => {
    if (!autoStart || started.current) return;
    started.current = true;
    shoot().then((ok) => { if (!ok) onClose?.(); });
  }, [autoStart]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!cameraAvailable()) return null;

  const clear = () => { shots.forEach((s) => URL.revokeObjectURL(s.url)); setShots([]); onClose?.(); };
  const create = async () => {
    setBusy(true);
    try {
      const ids = await Promise.all(shots.map((s) => s.asset));
      const res = await app.run("images_to_pdf", { files: ids, page_size: fit, name: `${photoName()}.pdf` }, { noDoc: true, silent: true });
      if (res) clear();
    } catch (e: any) {
      app.toast(e.message, "err");
    } finally {
      setBusy(false);
    }
  };

  if (!shots.length) {
    return autoStart ? null : <button className="btn" onClick={shoot}><Camera size={16} /> Scatta foto</button>;
  }
  return (
    <div className="scan">
      <div className="scan-head">
        <b>{shots.length} {shots.length === 1 ? "pagina" : "pagine"}</b>
        <button className="btn icon ghost small" title="Annulla" aria-label="Annulla le foto" onClick={clear}><X size={16} /></button>
      </div>
      <div className="scan-grid">
        {shots.map((s, i) => (
          <div key={s.url} className="scan-shot">
            <img src={s.url} alt={`Pagina ${i + 1}`} />
            <span>{i + 1}</span>
            <button className="btn icon small danger" title="Elimina questa foto" aria-label={`Elimina la foto ${i + 1}`}
              onClick={() => { URL.revokeObjectURL(s.url); setShots((l) => l.filter((x) => x !== s)); }}><Trash2 size={13} /></button>
          </div>
        ))}
        <button className="scan-add" onClick={shoot} title="Scatta un'altra pagina"><Plus size={22} /><span>Altra foto</span></button>
      </div>
      <Seg value={fit} onChange={setFit} options={[{ value: "A4", label: "Pagina A4" }, { value: "image", label: "Come la foto" }]} />
      <button className="btn primary" onClick={create} disabled={busy}><FileCheck2 size={16} /> {busy ? "Creazione…" : "Crea PDF"}</button>
    </div>
  );
}

/** Menu "Apri" del telefono: Scegli file oppure Scatta foto. */
export function OpenMenu({ onPickFile }: { onPickFile: () => void }) {
  const [open, setOpen] = useState(false);
  const [scan, setScan] = useState(false);
  if (!cameraAvailable()) {
    return <button className="btn" onClick={onPickFile} title="Apri (Ctrl+O)"><FolderOpen size={16} /> <span className="btn-label">Apri</span></button>;
  }
  return (
    <>
      <button className="btn" onClick={() => setOpen((o) => !o)} title="Apri" aria-haspopup="menu" aria-expanded={open}>
        <FolderOpen size={16} /> <span className="btn-label">Apri</span>
      </button>
      {open && (
        <>
          <div className="tabs-menu-back" onClick={() => setOpen(false)} aria-hidden />
          <div className="tabs-menu-list open-menu" role="menu">
            <button role="menuitem" className="tabs-menu-item" onClick={() => { setOpen(false); onPickFile(); }}><FolderOpen size={18} /> <span className="name">Scegli file</span></button>
            <button role="menuitem" className="tabs-menu-item" onClick={() => { setOpen(false); setScan(true); }}><Camera size={18} /> <span className="name">Scatta foto</span></button>
          </div>
        </>
      )}
      {scan && (
        <div className="scan-modal" role="dialog" aria-label="Scatta foto">
          <PhotoScan autoStart onClose={() => setScan(false)} />
        </div>
      )}
    </>
  );
}
