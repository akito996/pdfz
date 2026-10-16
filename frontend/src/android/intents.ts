/** App Android: i PDF aperti da altre app ("Apri con PDFz") arrivano qui. */
import { Capacitor } from "@capacitor/core";

function deliver(file: File) {
  const w = window as any;
  if (w.hdpdfOpenFiles) w.hdpdfOpenFiles([file]);
  else (w.__hdpdfPendingFiles ||= []).push(file);
}

function nameFrom(url: string): string {
  try {
    const last = decodeURIComponent(url.split("/").pop() || "").split(":").pop() || "";
    if (/\.(pdf|p7m|p7s)$/i.test(last)) return last;
  } catch { /* nome non leggibile */ }
  return "documento";   // senza estensione: il tipo (PDF o file firmato p7m) si riconosce dal contenuto
}

async function openUrl(url: string) {
  if (!url || !/^(content|file):/.test(url)) return;
  const { Filesystem } = await import("@capacitor/filesystem");
  const res = await Filesystem.readFile({ path: url });
  const b64 = typeof res.data === "string" ? res.data : await (res.data as Blob).text();
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const name = nameFrom(url);
  const isPdf = name.endsWith(".pdf") || (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46);   // "%PDF"
  deliver(new File([bytes], isPdf && !/\.pdf$/i.test(name) ? `${name}.pdf` : name, { type: isPdf ? "application/pdf" : "application/octet-stream" }));
}

export async function listenForFiles() {
  if (!Capacitor.isNativePlatform()) return;
  const { App } = await import("@capacitor/app");
  const launch = await App.getLaunchUrl();
  if (launch?.url) openUrl(launch.url).catch(() => {});
  App.addListener("appUrlOpen", (e) => { openUrl(e.url).catch(() => {}); });
}

/** Tasto "indietro" di Android: chiude prima il menu o il pannello aperto, poi esce dall'app. */
export async function listenForBack() {
  if (!Capacitor.isNativePlatform()) return;
  const { App } = await import("@capacitor/app");
  App.addListener("backButton", () => {
    const ev = new CustomEvent("hdpdf-back", { cancelable: true });
    if (window.dispatchEvent(ev)) App.minimizeApp();   // nessuno l'ha gestito: l'app va in secondo piano
  });
}
