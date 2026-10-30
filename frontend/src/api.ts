// Client dell'API locale (backend Python in ascolto su 127.0.0.1).

export interface DocInfo {
  id: string;
  name: string;
  pages: number | null;
  encrypted: boolean;
  needs_password: boolean;
  restricted?: boolean;      // si apre senza password, ma ha la password del proprietario (limiti a stampa/copia/modifica)
  unlocked?: boolean;        // password già inserita
  owner_unlocked?: boolean;  // sbloccato con la password del proprietario
  owner?: boolean;           // protezione messa con l'app dall'utente di questo dispositivo
  size: number;
  parent: string | null;
}

/** Scheda spostata in un'altra finestra: passa dal motore con un biglietto (vedi App.moveToNewWindow). */
export interface SchedaSpostata {
  history: DocInfo[];
  index: number;
  savedIndex: number;
  savedPath?: string;
  password?: string;
}

export interface OutputInfo {
  id: string;
  name: string;
  size: number;
}

export interface ToolResponse {
  message?: string | null;
  data?: any;
  doc?: DocInfo;
  output?: OutputInfo;
}

export interface FontInfo {
  id: string;
  name: string;
  family: string;
  style: string;
  source: "base14" | "system" | "app";
  path: string | null;
  bold: boolean;
  italic: boolean;
  serif: boolean;
  mono: boolean;
}

export interface Capabilities {
  ocr: boolean;
  ocr_languages: string[];
  ghostscript: boolean;
  libreoffice: boolean;
  ms_office: boolean;
  platform: string;
  input_formats: string[];
  version: string;
  /** indirizzo dello spazio degli aggiornamenti (vuoto = avviso disattivato) */
  update_url?: string;
}

const token = new URLSearchParams(location.search).get("t") || "";

function headers(extra: Record<string, string> = {}) {
  return token ? { "x-hdpdf-token": token, ...extra } : extra;
}

async function handle<T>(r: Response): Promise<T> {
  if (!r.ok) {
    let msg = `Errore ${r.status}`;
    try {
      const j = await r.json();
      msg = j.detail || msg;
    } catch {
      /* risposta non JSON */
    }
    throw new Error(msg);
  }
  return r.json();
}

export interface P7mResult {
  report: any;
  content: { id: string; name: string; size: number; mime: string };
  doc?: DocInfo;
}

const jsonPost = async (url: string, body: unknown): Promise<any> =>
  handle(await fetch(url, { method: "POST", headers: headers({ "Content-Type": "application/json" }), body: JSON.stringify(body) }));

export const api = {
  async depositaScheda(s: SchedaSpostata): Promise<string> { return (await jsonPost("api/schede", s)).biglietto; },
  async buttaScheda(biglietto: string): Promise<void> { await fetch(`api/schede/${encodeURIComponent(biglietto)}`, { method: "DELETE", headers: headers() }); },
  async ritiraScheda(biglietto: string): Promise<SchedaSpostata> { return handle(await fetch(`api/schede/${encodeURIComponent(biglietto)}`, { headers: headers() })); },
  async heartbeat(): Promise<{ open?: string[]; actions?: { action: string; paths: string[] }[] }> { return handle(await fetch("api/heartbeat", { headers: headers() })); },
  async user(): Promise<{ name: string; login: string }> {
    return handle(await fetch("api/user", { headers: headers() }));
  },
  async p7mAnalyze(src: { asset?: string; path?: string }, opts: { detached?: string; online?: boolean } = {}): Promise<P7mResult> {
    return jsonPost("api/p7m/analyze", { ...src, ...opts });
  },
  /** App desktop: file del disco (menu del tasto destro) come allegati per gli strumenti. */
  async assetsFromPaths(paths: string[]): Promise<{ id: string; name: string; size: number; mime: string }[]> {
    return jsonPost("api/assets/path", { paths });
  },
  async p7mExtract(path: string): Promise<{ path: string; name: string }> {
    return jsonPost("api/p7m/extract", { path });
  },
  async p7mTimestamp(src: { asset?: string; path?: string }, tsa: { url?: string; user?: string; password?: string }):
    Promise<{ count: number; name: string; path?: string; output?: OutputInfo; default_tsa: boolean }> {
    return jsonPost("api/p7m/timestamp", { ...src, ...tsa });
  },
  async p7mEncrypt(files: { asset?: string; path?: string }[], certs: string[]):
    Promise<{ results: { name: string; path?: string; output?: OutputInfo; warnings: string[] }[]; recipients: string[] }> {
    return jsonPost("api/p7m/encrypt", { files, certs });
  },
  async p7mReport(report: any): Promise<OutputInfo> {
    return jsonPost("api/p7m/report", { report });
  },
  async p7mTrust(refresh = false): Promise<any> {
    return refresh ? jsonPost("api/p7m/trust/refresh", {}) : handle(await fetch("api/p7m/trust", { headers: headers() }));
  },
  /** Carica l'elenco AgID (TSL-IT.xml) da un file: serve senza internet o se il download non riesce. */
  async p7mTrustUpload(data: Blob | ArrayBuffer, source = "file"): Promise<any> {
    return handle(await fetch(`api/p7m/trust/upload?source=${source}`, { method: "POST", headers: { ...headers(), "Content-Type": "application/xml" }, body: data }));
  },
  fileUrl(id: string, download = false) {
    const q = new URLSearchParams();
    if (download) q.set("download", "true");
    if (token) q.set("t", token);
    q.set("v", id);
    return `api/items/${id}/file?${q}`;
  },
  async caps(): Promise<Capabilities> {
    return handle(await fetch("api/capabilities", { headers: headers() }));
  },
  async updateCheck(platform: string): Promise<any> {
    return handle(await fetch(`api/update/check?platform=${platform}`, { headers: headers() }));
  },
  async fonts(): Promise<FontInfo[]> {
    return handle(await fetch("api/fonts", { headers: headers() }));
  },
  fontFileUrl(id: string) {
    return `api/fonts/${id}/file${token ? `?t=${token}` : ""}`;
  },
  async open(files: File[]): Promise<DocInfo[]> {
    const fd = new FormData();
    files.forEach((f) => fd.append("files", f, f.name));
    return handle(await fetch("api/open", { method: "POST", body: fd, headers: headers() }));
  },
  async openPath(path: string): Promise<DocInfo> {
    return handle(
      await fetch("api/open-path", {
        method: "POST",
        headers: headers({ "Content-Type": "application/json" }),
        body: JSON.stringify({ path }),
      }),
    );
  },
  async unlock(id: string, password: string): Promise<DocInfo> {
    return handle(
      await fetch(`api/docs/${id}/password`, {
        method: "POST",
        headers: headers({ "Content-Type": "application/json" }),
        body: JSON.stringify({ password }),
      }),
    );
  },
  async asset(file: File | Blob, name?: string): Promise<{ id: string; name: string }> {
    const fd = new FormData();
    fd.append("file", file, name || (file as File).name || "file");
    return handle(await fetch("api/assets", { method: "POST", body: fd, headers: headers() }));
  },
  async dataUrl(data: string, name = "firma.png"): Promise<{ id: string }> {
    return handle(
      await fetch("api/assets/dataurl", {
        method: "POST",
        headers: headers({ "Content-Type": "application/json" }),
        body: JSON.stringify({ data, name }),
      }),
    );
  },
  async signatures(): Promise<{ slot: string; data: string | null }[]> {
    return handle(await fetch("api/signatures", { headers: headers() }));
  },
  async saveSignature(slot: string, data: string): Promise<void> {
    await handle(await fetch(`api/signatures/${slot}`, {
      method: "PUT", headers: headers({ "Content-Type": "application/json" }), body: JSON.stringify({ data }),
    }));
  },
  async deleteSignature(slot: string): Promise<void> {
    await handle(await fetch(`api/signatures/${slot}`, { method: "DELETE", headers: headers() }));
  },
  async tool(name: string, body: { doc?: string; docs?: string[]; params?: any }): Promise<ToolResponse> {
    return handle(
      await fetch(`api/tools/${name}`, {
        method: "POST",
        headers: headers({ "Content-Type": "application/json" }),
        body: JSON.stringify(body),
      }),
    );
  },
};

// Integrazione con l'app desktop (pywebview): finestre native di apertura/salvataggio.
declare global {
  interface Window {
    pywebview?: { api: any };
  }
}

// Gli errori dell'app desktop (es. file aperto in un altro programma) arrivano come eccezioni di Python: qui diventano
// una finestra dell'app (la registra App con onDesktopError) e chi ha chiamato riceve solo "non riuscito".
type DesktopErrorHandler = (title: string, message: string) => void;
let desktopError: DesktopErrorHandler = (title, message) => console.warn(title, message);
export function onDesktopError(h: DesktopErrorHandler) {
  desktopError = h;
  return () => { if (desktopError === h) desktopError = (t, m) => console.warn(t, m); };
}
async function desktopCall<T>(title: string, failed: T, call: () => Promise<T>): Promise<T> {
  try {
    return await call();
  } catch (e: any) {
    desktopError(title, e?.message || String(e));
    return failed;
  }
}

export const desktop = {
  available: () => !!window.pywebview?.api,
  async openDialog(): Promise<string[]> {
    return (await desktopCall("Apertura non riuscita", null, () => window.pywebview!.api.open_dialog())) || [];
  },
  async saveAs(itemId: string, suggested: string): Promise<string | null> {
    return desktopCall("Salvataggio non riuscito", null, () => window.pywebview!.api.save_as(itemId, suggested));
  },
  async save(itemId: string, path: string): Promise<boolean> {
    return desktopCall("Salvataggio non riuscito", false, () => window.pywebview!.api.save_to(itemId, path));
  },
  async openExternal(itemId: string): Promise<boolean> {
    return desktopCall("File non aperto", false, () => window.pywebview!.api.open_external(itemId));
  },
  async openPath(path: string): Promise<boolean> {
    return window.pywebview!.api.open_path(path);
  },
  async reveal(path: string): Promise<boolean> {
    return window.pywebview!.api.reveal(path);
  },
  /** Presentazione: la finestra dell'app a tutto schermo (true) e ritorno (false). */
  async fullScreen(on: boolean): Promise<boolean> {
    try { return await window.pywebview!.api.schermo_intero(on); } catch { return false; }
  },
  /** Apre un'altra finestra di PDFz; query = parametri dell'indirizzo (es. "scheda=<biglietto>"). */
  async newWindow(query: string): Promise<boolean> {
    return desktopCall("Nuova finestra non aperta", false, () => window.pywebview!.api.nuova_finestra(query));
  },
};

/** True nell'app Android (motore Python dentro l'app, senza server). */
export const isLocalEngine = () => !!(window as any).__HD_LOCAL__;

export async function download(id: string, name: string) {
  if (desktop.available()) {
    return desktop.saveAs(id, name);
  }
  if (isLocalEngine()) {
    const { saveFile } = await import("./android/files");
    return saveFile(api.fileUrl(id, true), name);
  }
  const a = document.createElement("a");
  a.href = api.fileUrl(id, true);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  return name;
}

export function humanSize(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
