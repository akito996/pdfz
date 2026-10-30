/**
 * File aperti di recente, per la schermata iniziale ("Cosa vuoi fare?").
 *
 * App desktop: si ricorda il percorso del file e lo si riapre da lì. Telefono, web app e file trascinati: il file non ha
 * un percorso da riaprire, quindi una copia resta su questo dispositivo (IndexedDB, mai su internet), al massimo
 * MAX_COPIE file da MAX_BYTE ciascuno. L'elenco si svuota dalla schermata iniziale.
 * App desktop: niente copie dei file trascinati. La pagina cambia indirizzo (porta) a ogni avvio e con lui la sua
 * memoria IndexedDB: dopo il riavvio la copia non si trovava più ("non è più su questo dispositivo") e restava sul disco.
 */
import { desktop } from "./api";

export interface Recente { id: string; nome: string; quando: number; size: number; path?: string }

const CHIAVE = "hdpdf.recenti";
const MAX = 8, MAX_COPIE = 6, MAX_BYTE = 40 * 1024 * 1024;
const ascoltatori = new Set<() => void>();

export function recenti(): Recente[] {
  let l: Recente[] = [];
  try { l = JSON.parse(localStorage.getItem(CHIAVE) || "[]"); } catch { /* archiviazione non disponibile */ }
  return desktop.available() ? l.filter((r) => r.path) : l;   // app desktop: solo i file con il percorso
}
function scrivi(l: Recente[]) {
  try { localStorage.setItem(CHIAVE, JSON.stringify(l.slice(0, MAX))); } catch { /* archiviazione non disponibile */ }
  ascoltatori.forEach((f) => f());
}
export function seguiRecenti(f: () => void) {
  ascoltatori.add(f);
  return () => { ascoltatori.delete(f); };
}

// ------------------------------------------------------------------ copie dei file (IndexedDB)
function db(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open("pdfz-recenti", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("file");
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function conserva(id: string, f: Blob | null) {
  const d = await db();
  await new Promise<void>((res, rej) => {
    const t = d.transaction("file", "readwrite");
    if (f) t.objectStore("file").put(f, id); else t.objectStore("file").delete(id);
    t.oncomplete = () => res();
    t.onerror = () => rej(t.error);
  });
  d.close();
}
async function leggi(id: string): Promise<Blob | null> {
  const d = await db();
  const b = await new Promise<Blob | null>((res, rej) => {
    const r = d.transaction("file").objectStore("file").get(id);
    r.onsuccess = () => res((r.result as Blob) || null);
    r.onerror = () => rej(r.error);
  });
  d.close();
  return b;
}

/** Un file aperto (o salvato): torna in cima all'elenco. Con il percorso (app desktop) niente copia. */
export async function ricorda(nome: string, size: number, opts: { path?: string; file?: Blob }) {
  const l = recenti();
  const vecchio = l.find((r) => (opts.path ? r.path === opts.path : !r.path && r.nome === nome));
  const id = vecchio?.id || `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const nuovo: Recente = { id, nome, quando: Date.now(), size, path: opts.path };
  let lista = [nuovo, ...l.filter((r) => r.id !== id)];
  if (!opts.path) {
    if (!opts.file || opts.file.size > MAX_BYTE || desktop.available()) return;
    try { await conserva(id, opts.file); } catch { return; }
    // oltre il massimo di copie si tolgono le più vecchie
    const copie = lista.filter((r) => !r.path);
    for (const r of copie.slice(MAX_COPIE)) { lista = lista.filter((x) => x.id !== r.id); conserva(r.id, null).catch(() => {}); }
  }
  for (const r of lista.slice(MAX)) if (!r.path) conserva(r.id, null).catch(() => {});
  scrivi(lista);
}

export async function fileRecente(r: Recente): Promise<File | null> {
  const b = await leggi(r.id).catch(() => null);
  return b ? new File([b], r.nome, { type: "application/pdf" }) : null;
}

export function dimentica(id?: string) {
  const l = recenti();
  for (const r of l) if (!id || r.id === id) conserva(r.id, null).catch(() => {});
  scrivi(id ? l.filter((r) => r.id !== id) : []);
}
