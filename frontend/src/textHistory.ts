/**
 * Testi già usati (caselle di testo, filigrane, timbri, nomi nelle firme…): servono a suggerirli mentre si scrive.
 * Restano salvati tra un avvio e l'altro (sul computer anche nel file delle impostazioni, perché la chiave inizia
 * con "hdpdf."). Il più recente è il primo.
 */
const KEY = "hdpdf.testiRecenti";
const MAX = 60;

function load(): string[] {
  try { const v = JSON.parse(localStorage.getItem(KEY) || "[]"); return Array.isArray(v) ? v.filter((x) => typeof x === "string") : []; }
  catch { return []; }
}

/** Ricorda i testi appena usati (vuoti e troppo lunghi esclusi). */
export function rememberTexts(texts: (string | undefined | null)[]) {
  const clean = texts.map((t) => (t || "").trim()).filter((t) => t.length >= 2 && t.length <= 300);
  if (!clean.length) return;
  const seen = new Set<string>();
  const list = [...clean.reverse(), ...load()].filter((t) => {
    const k = t.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  }).slice(0, MAX);
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* memoria piena */ }
}

/** Suggerimenti per quello che si sta scrivendo: prima quelli che iniziano così, poi quelli che lo contengono. */
export function suggestTexts(typed: string, limit = 5): string[] {
  const q = typed.trim().toLowerCase();
  if (!q) return [];
  const all = load().filter((t) => t.toLowerCase() !== q);
  const starts = all.filter((t) => t.toLowerCase().startsWith(q));
  const contains = all.filter((t) => !t.toLowerCase().startsWith(q) && t.toLowerCase().includes(q));
  return [...starts, ...contains].slice(0, limit);
}

/** Tutti i testi ricordati (per gli elenchi dei campi di testo). */
export const recentTexts = () => load();
