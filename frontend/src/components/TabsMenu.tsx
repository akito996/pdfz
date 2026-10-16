import { useEffect, useState } from "react";
import { ChevronDown, FileText, Lock, X } from "lucide-react";

export interface TabEntry { key: string; name: string; dirty: boolean; locked?: boolean }

/** Telefono: i documenti aperti in un menu a tendina invece che in schede affiancate. */
export function TabsMenu({ tabs, active, onPick, onClose }: {
  tabs: TabEntry[];
  active: string | null;
  onPick: (key: string) => void;
  onClose: (key: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const cur = tabs.find((t) => t.key === active);
  useEffect(() => { if (!tabs.length) setOpen(false); }, [tabs.length]);
  // tasto "indietro" di Android: chiude prima il menu
  useEffect(() => {
    if (!open) return;
    const onBack = (e: Event) => { setOpen(false); e.preventDefault(); e.stopImmediatePropagation(); };
    window.addEventListener("hdpdf-back", onBack, true);
    return () => window.removeEventListener("hdpdf-back", onBack, true);
  }, [open]);
  if (!tabs.length) return <div className="tabs-menu" />;
  return (
    <div className="tabs-menu">
      <button type="button" className="tabs-menu-btn" onClick={() => setOpen((o) => !o)} aria-haspopup="listbox" aria-expanded={open}
        title={cur?.name}>
        {cur?.dirty && <span className="dot" title="Modifiche non salvate" />}
        {cur?.locked && <Lock size={13} style={{ flex: "none" }} aria-label="Protetto da password" />}
        <span className="name">{cur?.name || "Documenti"}</span>
        {tabs.length > 1 && <span className="tabs-count">{tabs.length}</span>}
        <ChevronDown size={16} style={{ flex: "none", transform: open ? "rotate(180deg)" : undefined, transition: "transform .15s" }} />
      </button>
      {open && (
        <>
          <div className="tabs-menu-back" onClick={() => setOpen(false)} aria-hidden />
          <div className="tabs-menu-list" role="listbox" aria-label="Documenti aperti">
            {tabs.map((t) => (
              <div key={t.key} role="option" aria-selected={t.key === active} className={`tabs-menu-item ${t.key === active ? "on" : ""}`}
                onClick={() => { onPick(t.key); setOpen(false); }}>
                <FileText size={16} style={{ flex: "none" }} />
                {t.dirty && <span className="dot" title="Modifiche non salvate" />}
                {t.locked && <Lock size={13} style={{ flex: "none" }} aria-label="Protetto da password" />}
                <span className="name">{t.name}</span>
                <button type="button" className="btn icon ghost small" title="Chiudi il documento" aria-label={`Chiudi ${t.name}`}
                  onClick={(e) => { e.stopPropagation(); onClose(t.key); }}><X size={16} /></button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
