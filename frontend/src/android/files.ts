/** App Android: salvataggio dei file prodotti (cartella Documenti/PDFz) e condivisione. */
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

/** Salva il file sul telefono (Documenti/PDFz; un file con lo stesso nome viene sostituito).
 *  Con share=true apre poi il menu "Condividi" (per aprirlo con un'altra app, inviarlo, stamparlo). */
export async function saveFile(url: string, name: string, share = true): Promise<string | null> {
  const blob = await (await fetch(url)).blob();
  if (!Capacitor.isNativePlatform()) {
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
