/** App Android: salvataggio dei file prodotti (cartella Documenti/PDFz) e condivisione.
 *  Web app per iPhone: menu "Condividi" del sistema con il file (vedi sotto). */
import { Capacitor } from "@capacitor/core";

/** Base64 fatto dal browser (codice nativo): molto più veloce che convertire i byte a mano in JavaScript. */
function toBase64(blob: Blob): Promise<string> {
  return new Promise((ok, ko) => {
    const r = new FileReader();
    r.onload = () => { const s = String(r.result); ok(s.slice(s.indexOf(",") + 1)); };
    r.onerror = () => ko(r.error || new Error("file non leggibile"));
    r.readAsDataURL(blob);
  });
}

// ------------------------------------------------------------------ web app (iPhone): menu "Condividi" del sistema
// Una web app non può scrivere nelle cartelle del telefono e su iPhone il download funziona male: il file si passa
// al menu "Condividi" (navigator.share con il file), da cui si sceglie "Salva in File", un'altra app, Stampa…

/** Telefono o tablet (anche iPad, che si presenta come un Mac con lo schermo touch). */
const touch = () => /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
  || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);

function puoCondividere(file: File): boolean {
  try { return touch() && !!navigator.canShare?.({ files: [file] }); } catch { return false; }
}

/** Se il menu non si apre perché è passato troppo tempo dal tocco (il file era in preparazione), l'app chiede
 *  conferma con una sua finestra: il tocco su "Condividi" basta per riaprirlo. La imposta App.tsx con ask(). */
let confermaCondividi: ((nome: string) => Promise<boolean>) | null = null;
export function impostaConfermaCondividi(f: ((nome: string) => Promise<boolean>) | null) { confermaCondividi = f; }

/** Nome del file se condiviso, null se l'utente ha chiuso il menu senza scegliere, "download" se non si può condividere. */
async function condividi(file: File): Promise<string | null | "download"> {
  const dati = { files: [file], title: file.name };
  try {
    await navigator.share(dati);
    return file.name;
  } catch (e: any) {
    if (e?.name === "AbortError") return null;
    if (e?.name !== "NotAllowedError" || !confermaCondividi) return "download";
  }
  if (!(await confermaCondividi(file.name))) return null;
  try {
    await navigator.share(dati);
    return file.name;
  } catch (e: any) {
    return e?.name === "AbortError" ? null : "download";
  }
}

/** Dove va a finire il file salvato (per i testi delle finestre). */
export function doveSalva(): string {
  if (Capacitor.isNativePlatform()) return "viene salvato in Documenti/PDFz.";
  return touch() && typeof navigator.share === "function"
    ? "poi scegli dove salvarlo (\"Salva in File\") o con quale app aprirlo."
    : "viene scaricato nella cartella dei download.";
}

/** Salva il file sul telefono (Documenti/PDFz; un file con lo stesso nome viene sostituito).
 *  Con share=true apre poi il menu "Condividi" (per aprirlo con un'altra app, inviarlo, stamparlo).
 *  Web app su telefono: sempre il menu "Condividi" con il file; nel browser del PC: download normale. */
export async function saveFile(url: string, name: string, share = true): Promise<string | null> {
  const blob = await (await fetch(url)).blob();
  if (!Capacitor.isNativePlatform()) {
    const file = new File([blob], name, { type: blob.type || "application/pdf" });
    if (puoCondividere(file)) {
      const r = await condividi(file);
      if (r !== "download") return r;
    }
    // stessa interfaccia provata nel browser: download normale
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 30000);
    return name;
  }
  const { Filesystem, Directory } = await import("@capacitor/filesystem");
  const { Share } = await import("@capacitor/share");
  const path = `PDFz/${name}`;
  const res = await Filesystem.writeFile({ path, data: await toBase64(blob), directory: Directory.Documents, recursive: true });
  if (share) {
    try {
      await Share.share({ title: name, url: res.uri, dialogTitle: "Apri o condividi" });
    } catch { /* l'utente ha chiuso il menu: il file resta comunque salvato */ }
  }
  return `Documenti/${path}`;
}

/** Su Android si stampa dal menu "Condividi" (Stampa) del sistema. */
export async function printFile(url: string, name: string) {
  return saveFile(url, name);
}
