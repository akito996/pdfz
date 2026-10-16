import { useEffect, useRef, useState } from "react";
import { Check, Monitor, Moon, Sun } from "lucide-react";

export type ThemeChoice = "light" | "dark" | "system";
const KEY = "hdpdf.tema";
const PALETTE_KEY = "hdpdf.colori";

/** Palette di colori del marchio PDFz (rosso, oro, nero, bianco). I colori veri stanno in styles.css
 *  (:root[data-palette="…"]); qui solo nome, descrizione e i tre campioni mostrati nel menu (marchio, accento, fondo).
 *  Per aggiungerne una: un blocco in styles.css + una riga qui. */
export const PALETTES = [
  { id: "rubino", label: "Rubino", desc: "Rosso e oro", swatch: ["#b3122b", "#c9a227", "#f6f4f1"] },
  { id: "oro", label: "Oro", desc: "Oro antico e nero", swatch: ["#8a6914", "#1c1917", "#f7f3ea"] },
  { id: "onice", label: "Onice", desc: "Nero e rosso", swatch: ["#1a1a1a", "#c8102e", "#f2f2f2"] },
  { id: "avorio", label: "Avorio", desc: "Bianco, rosso e nero", swatch: ["#c8102e", "#1a1a1a", "#ffffff"] },
  { id: "bordeaux", label: "Bordeaux", desc: "Bordeaux e oro", swatch: ["#7a1626", "#b8912a", "#f8f4ec"] },
] as const;
export type PaletteId = (typeof PALETTES)[number]["id"];
const DEFAULT_PALETTE: PaletteId = "rubino";

function read(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; /* archiviazione non disponibile */ }
}
function write(key: string, value: string) {
  try { localStorage.setItem(key, value); } catch { /* */ }
}
function storedTheme(): ThemeChoice {
  const v = read(KEY);
  return v === "light" || v === "dark" || v === "system" ? v : "light";
}
function storedPalette(): PaletteId {
  const v = read(PALETTE_KEY);
  return PALETTES.some((p) => p.id === v) ? (v as PaletteId) : DEFAULT_PALETTE;
}
function applyTheme(t: ThemeChoice) {
  const root = document.documentElement;
  if (t === "system") delete root.dataset.theme;
  else root.dataset.theme = t;
}
function applyPalette(id: PaletteId) {
  document.documentElement.dataset.palette = id;
  // barra del browser / di stato del telefono nel colore della palette
  const p = PALETTES.find((x) => x.id === id)!;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", p.swatch[0]);
}

/** Da chiamare prima di disegnare l'app (dopo aver caricato le impostazioni): niente "lampo" di colori sbagliati. */
export function applyStoredLook() {
  applyTheme(storedTheme());
  applyPalette(storedPalette());
}

/** Aspetto dell'app: chiaro (predefinito), scuro o come il sistema. */
export function useTheme(): [ThemeChoice, (t: ThemeChoice) => void] {
  const [theme, setTheme] = useState<ThemeChoice>(storedTheme);
  useEffect(() => { applyTheme(theme); write(KEY, theme); }, [theme]);
  return [theme, setTheme];
}

/** Palette di colori (predefinita: Rubino). */
export function usePalette(): [PaletteId, (p: PaletteId) => void] {
  const [palette, setPalette] = useState<PaletteId>(storedPalette);
  useEffect(() => { applyPalette(palette); write(PALETTE_KEY, palette); }, [palette]);
  return [palette, setPalette];
}

const OPTIONS: { value: ThemeChoice; label: string; icon: typeof Sun }[] = [
  { value: "light", label: "Chiaro", icon: Sun },
  { value: "dark", label: "Scuro", icon: Moon },
  { value: "system", label: "Tema del sistema", icon: Monitor },
];

export function ThemeMenu({ theme, setTheme }: { theme: ThemeChoice; setTheme: (t: ThemeChoice) => void }) {
  const [open, setOpen] = useState(false);
  const [palette, setPalette] = usePalette();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", esc); };
  }, [open]);
  const Cur = OPTIONS.find((o) => o.value === theme)!.icon;
  return (
    <div className="theme-menu" ref={ref}>
      <button className="btn icon ghost" title="Tema e colori" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <Cur size={17} />
      </button>
      {open && (
        <div className="menu theme-pop" role="menu">
          <div className="menu-title">Aspetto</div>
          {OPTIONS.map(({ value, label, icon: Icon }) => (
            <button key={value} role="menuitemradio" aria-checked={theme === value} onClick={() => { setTheme(value); setOpen(false); }}>
              <Icon size={15} /> <span className="grow">{label}</span> {theme === value && <Check size={15} color="var(--brand)" />}
            </button>
          ))}
          <div className="menu-title">Colori</div>
          {/* la palette resta aperta: si vede subito l'effetto e si può provarne un'altra */}
          {PALETTES.map((p) => (
            <button key={p.id} role="menuitemradio" aria-checked={palette === p.id} onClick={() => setPalette(p.id)}>
              <span className="palette-swatch" aria-hidden>
                {p.swatch.map((c) => <i key={c} style={{ background: c }} />)}
              </span>
              <span className="grow">{p.label}<small>{p.desc}</small></span>
              {palette === p.id && <Check size={15} color="var(--brand)" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
