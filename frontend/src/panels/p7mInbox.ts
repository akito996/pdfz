/** File firmati (.p7m/.p7s): riconoscimento e coda dei file da verificare.
 *  Modulo piccolo e separato dal pannello, così il pannello "File firmati" si carica solo quando serve. */
/** File firmato da verificare: caricato (asset) o percorso sul disco (app desktop).
 *  action / paths: dal menu del tasto destro di Windows (estrai, marca, cifra anche su più file). */
export interface P7mSource { asset?: string; path?: string; name: string; action?: "estrai" | "marca" | "cifra"; paths?: string[] }

// coda per i file aperti da "Apri", trascinamento o "Apri con" mentre il pannello è chiuso o aperto
export const inbox: { items: P7mSource[]; notify: (() => void) | null } = { items: [], notify: null };
export function sendToP7m(src: P7mSource) {
  inbox.items.push(src);
  inbox.notify?.();
}
export const isSignedFile = (name: string) => /\.(p7m|p7s|p7c)$/i.test(name);

// OID 1.2.840.113549.1.7.2 (PKCS#7 "signedData") come compare nel file DER
const SIGNED_OID = [0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x07, 0x02];
const hasOid = (b: Uint8Array) => {
  if (b[0] !== 0x30) return false;
  for (let i = 1; i < Math.min(b.length - SIGNED_OID.length, 12); i++) {
    if (SIGNED_OID.every((v, k) => b[i + k] === v)) return true;
  }
  return false;
};

/** File firmato riconosciuto dal contenuto, non solo dal nome: su Android i file scelti o aperti con
 *  "Apri con" a volte arrivano senza estensione (es. "documento" o "1234"). DER, Base64 o PEM. */
export async function isSignedContent(f: File): Promise<boolean> {
  if (isSignedFile(f.name)) return true;
  if (/\.(pdf|docx?|xlsx?|pptx?|odt|ods|odp|rtf|txt|csv|html?|jpe?g|png|gif|bmp|tiff?|webp|svg|xps|epub)$/i.test(f.name)) return false;
  try {
    const head = new Uint8Array(await f.slice(0, 256).arrayBuffer());
    if (hasOid(head)) return true;
    const txt = new TextDecoder("latin1").decode(head).replace(/-----BEGIN [A-Z0-9 ]+-----/, "").replace(/\s+/g, "");
    if (/^MI[A-Za-z0-9+/]{40}/.test(txt)) {
      const bin = atob(txt.slice(0, 64));
      return hasOid(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
    }
  } catch { /* file non leggibile: si tratta come documento */ }
  return false;
}
