/**
 * App Android: foto dalla fotocamera del telefono.
 *
 * Si usa un normale <input type="file" capture>: dentro l'app Android (Capacitor) apre direttamente
 * l'app Fotocamera, senza plugin e senza permessi aggiuntivi. Sul computer questi pulsanti non compaiono.
 * La foto viene raddrizzata (orientamento EXIF), ridotta a una dimensione da documento e salvata in JPEG.
 */
import { isLocalEngine } from "./api";

/** La fotocamera si offre solo nell'app Android. */
export const cameraAvailable = () => isLocalEngine();

const MAX_SIDE = 2480;      // lato lungo ~ A4 a 210 DPI: testo leggibile e OCR affidabile, elaborazione veloce
const QUALITY = 0.85;

/** Apre la fotocamera e restituisce la foto pronta (oppure null se l'utente annulla). */
export async function takePhoto(): Promise<File | null> {
  const f = await takePhotoRaw();
  if (!f) return null;
  try { return await normalizePhoto(f); } catch { return f; }
}

/** Foto così come arriva dalla fotocamera (subito, senza elaborazione): serve per mostrare l'anteprima
 *  mentre la versione "da documento" si prepara in sottofondo con normalizePhoto(). */
export function takePhotoRaw(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.setAttribute("capture", "environment");
    input.style.display = "none";
    let done = false;
    const finish = (f: File | null) => {
      if (done) return;
      done = true;
      input.remove();
      resolve(f);
    };
    input.addEventListener("change", () => finish(input.files?.[0] || null));
    input.addEventListener("cancel", () => finish(null));
    document.body.appendChild(input);
    input.click();
  });
}

function stamp() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}.${p(d.getMinutes())}.${p(d.getSeconds())}`;
}

/** Nome con data e ora, es. "Foto 2026-10-04 15.32.10" */
export const photoName = () => `Foto ${stamp()}`;

/** Foto raddrizzata (EXIF), ridotta e salvata in JPEG a 300 DPI. */
export async function normalizePhoto(f: File): Promise<File> {
  // createImageBitmap applica la rotazione EXIF: la foto scattata in verticale resta verticale
  const bmp = await createImageBitmap(f, { imageOrientation: "from-image" } as ImageBitmapOptions);
  const k = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * k), h = Math.round(bmp.height * k);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext("2d")!;
  g.fillStyle = "#fff";
  g.fillRect(0, 0, w, h);
  g.drawImage(bmp, 0, 0, w, h);
  bmp.close?.();
  const blob: Blob = await new Promise((ok, ko) => canvas.toBlob((b) => (b ? ok(b) : ko(new Error("foto non leggibile"))), "image/jpeg", QUALITY));
  return new File([withDpi(new Uint8Array(await blob.arrayBuffer()), 300)], `${photoName()}.jpg`, { type: "image/jpeg" });
}

/** Scrive i DPI nell'intestazione JPEG (JFIF): così nel PDF la pagina ha una misura da documento
 *  (3000 px a 300 DPI ≈ 25 cm) invece di più di un metro. */
function withDpi(b: Uint8Array<ArrayBuffer>, dpi: number): Uint8Array<ArrayBuffer> {
  const jfif = b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff && b[3] === 0xe0
    && String.fromCharCode(b[6], b[7], b[8], b[9]) === "JFIF" && b[10] === 0;
  if (!jfif) return b;
  b[13] = 1;                          // unità: punti per pollice
  b[14] = dpi >> 8; b[15] = dpi & 255;
  b[16] = dpi >> 8; b[17] = dpi & 255;
  return b;
}
