import {
  BadgeCheck, MessagesSquare, Shapes, SquareCheckBig,
  Archive, BookOpen, Combine, Copy, Crop, Droplets, Eraser, FileCheck2, FileCog, FileDiff,
  FileImage, FileInput, FileKey2, FileLock2, FileOutput, FileSearch, FileSignature, FileText,
  FileX2, Hash, ImagePlus, ImageOff, Info, Layers, ListOrdered, ListTree, LockOpen, Maximize2,
  Paperclip, PenLine, RotateCw, ScanText, Scissors, ShieldCheck, ShieldOff, Sparkles, Stamp,
  KeyRound, Type, Unlock, type LucideIcon,
} from "lucide-react";
import { isLocalEngine } from "./api";

export type FieldType =
  | "text" | "textarea" | "number" | "select" | "checkbox" | "color" | "font" | "pages" | "file"
  | "files" | "checks" | "position" | "rect" | "seg" | "range" | "password" | "note";

export interface Option { value: string; label: string }

export interface Field {
  key: string;
  label?: string;
  type: FieldType;
  default?: any;
  options?: Option[];
  hint?: string;
  accept?: string;
  min?: number;
  max?: number;
  step?: number;
  placeholder?: string;
  required?: boolean;
  unit?: string;
  show?: (v: Record<string, any>) => boolean;
  tone?: "warn" | "ok" | "err";
  advanced?: boolean;   // telefono: true = in "Opzioni avanzate", false = sempre visibile (altrimenti regola automatica)
}

export type PanelKind =
  | "form" | "edit_text" | "add_text" | "images" | "pages" | "organize" | "merge" | "compare" | "sign" | "redact" | "info"
  | "validate" | "properties" | "toc" | "create_pdf" | "p7m" | "shapes" | "comments" | "pwinfo";

export interface ToolDef {
  id: string;
  label: string;
  category: string;
  icon: LucideIcon;
  description: string;
  breve?: string;            // descrizione in poche parole (menu "Tutti gli strumenti" della vista semplice)
  endpoint?: string;
  panel: PanelKind;
  fields?: Field[];
  submitLabel?: string;
  build?: (v: Record<string, any>) => Record<string, any>;
  keywords?: string;
  pageView?: "grid" | "doc";
  androidOnly?: boolean;      // strumento presente solo nell'app Android  // offre la vista a miniature con selezione multipla (valore = vista iniziale)
}

export const CATEGORIES = [
  "Modifica",
  "Pagine",
  "Firma e sicurezza",
  "Ottimizza e analizza",
  "Revisione",
  "Converti",
];

const POSITIONS: Option[] = [
  "alto-sinistra", "alto-centro", "alto-destra", "centro-sinistra", "centro", "centro-destra",
  "basso-sinistra", "basso-centro", "basso-destra",
].map((v) => ({ value: v, label: v }));
export { POSITIONS };

const pagesField = (hint = "Vuoto = tutte le pagine. Esempi: 1-3,5 · pari · dispari · 4-"): Field => ({
  key: "pages", label: "Pagine", type: "pages", hint,
});

export const TOOLS: ToolDef[] = [
  // ------------------------------------------------------------ Modifica
  {
    id: "edit_text", label: "Modifica testo", category: "Modifica", icon: Type, panel: "edit_text",
    description: "Clicca su un testo del documento e scrivi direttamente sulla pagina; carattere, dimensione e colore dal pannello.",
    keywords: "correggi font carattere",
  },
  {
    id: "add_text", label: "Aggiungi testo", category: "Modifica", icon: PenLine, panel: "add_text",
    description: "Clicca sulla pagina e scrivi: la casella si sposta e si ridimensiona direttamente sul foglio.",
  },
  {
    id: "images", label: "Immagini", category: "Modifica", icon: ImagePlus, panel: "images",
    description: "Inserisci immagini a dimensione originale, ridimensionale sulla pagina o in px/cm/%, oppure rimuovi quelle presenti.",
    keywords: "aggiungi immagine rimuovi immagini logo foto",
  },
  {
    id: "shapes", label: "Forme", category: "Modifica", icon: Shapes, panel: "shapes",
    description: "Disegna rettangoli, cerchi/ovali, segmenti e frecce; scegli contorno, riempimento, spessore e opacità.",
    keywords: "rettangolo cerchio ovale linea segmento freccia disegna forma riquadro",
  },
  {
    id: "marks", label: "Spunta e X", category: "Modifica", icon: SquareCheckBig, panel: "shapes",
    description: "Riempi le caselle di controllo dei moduli con una spunta o una X, con un clic.",
    keywords: "check spunta x casella modulo crocetta segno compila",
  },
  {
    id: "attach", label: "Allega file", category: "Modifica", icon: Paperclip, panel: "form", endpoint: "attach",
    description: "Incorpora file di qualsiasi tipo nel PDF (visibili nel pannello allegati dei lettori).",
    fields: [
      { key: "files", label: "File da allegare", type: "files", required: true },
      { key: "description", label: "Descrizione (facoltativa)", type: "text" },
    ],
    submitLabel: "Allega",
  },
  {
    id: "watermark", label: "Filigrana", category: "Modifica", icon: Droplets, panel: "form", endpoint: "watermark",
    description: "Aggiungi una filigrana di testo o immagine, centrata o ripetuta.",
    fields: [
      { key: "type", label: "Tipo", type: "seg", default: "text",
        options: [{ value: "text", label: "Testo" }, { value: "image", label: "Immagine" }] },
      { advanced: false, key: "text", label: "Testo", type: "text", default: "RISERVATO", show: (v) => v.type === "text" },
      { key: "font", label: "Carattere", type: "font", default: "hebo", show: (v) => v.type === "text" },
      { key: "size", label: "Dimensione", type: "number", default: 60, unit: "pt", show: (v) => v.type === "text" },
      { key: "color", label: "Colore", type: "color", default: "#999999", show: (v) => v.type === "text" },
      { key: "image", label: "Immagine", type: "file", accept: "image/*", show: (v) => v.type === "image" },
      { key: "scale", label: "Larghezza (% pagina)", type: "number", default: 50, min: 5, max: 100, show: (v) => v.type === "image" },
      { key: "layout", label: "Disposizione", type: "seg", default: "center",
        options: [{ value: "center", label: "Centrata" }, { value: "tiled", label: "Ripetuta" }] },
      { key: "angle", label: "Rotazione", type: "number", default: 45, unit: "°" },
      { key: "opacity", label: "Opacità", type: "range", default: 0.3, min: 0.05, max: 1, step: 0.05 },
      pagesField(),
      { key: "behind", label: "Sotto al contenuto", type: "checkbox", default: false },
      { key: "to_image", label: "Converti le pagine in immagine (filigrana non rimovibile)", type: "checkbox", default: false },
    ],
    submitLabel: "Aggiungi la filigrana",
  },
  {
    id: "stamp", label: "Timbro", category: "Modifica", icon: Stamp, panel: "form", endpoint: "stamp",
    description: "Applica un timbro (Approvato, Ricevuto, Bozza…) con data, o un timbro personalizzato.",
    fields: [
      { key: "type", label: "Tipo", type: "seg", default: "text",
        options: [{ value: "text", label: "Testo" }, { value: "image", label: "Immagine" }] },
      { advanced: false, key: "preset", label: "Modello", type: "select", default: "approvato", show: (v) => v.type === "text",
        options: [
          { value: "approvato", label: "APPROVATO" }, { value: "ricevuto", label: "RICEVUTO" },
          { value: "respinto", label: "RESPINTO" }, { value: "bozza", label: "BOZZA" },
          { value: "riservato", label: "RISERVATO" }, { value: "copia", label: "COPIA CONFORME" },
          { value: "pagato", label: "PAGATO" }, { value: "annullato", label: "ANNULLATO" },
          { value: "visto", label: "VISTO" }, { value: "custom", label: "Personalizzato…" },
        ] },
      { advanced: false, key: "text", label: "Testo principale", type: "text", show: (v) => v.type === "text" && v.preset === "custom" },
      { key: "subtext", label: "Righe aggiuntive", type: "textarea", placeholder: "es. Ufficio Acquisti", show: (v) => v.type === "text" },
      { key: "date", label: "Aggiungi data odierna", type: "checkbox", default: true, show: (v) => v.type === "text" },
      { key: "color", label: "Colore (vuoto = colore del modello)", type: "color", default: "", show: (v) => v.type === "text" },
      { key: "image", label: "Immagine del timbro", type: "file", accept: "image/*", show: (v) => v.type === "image" },
      { key: "rect", label: "Posizione", type: "rect", hint: "Trascina sulla pagina. Se non disegni nulla viene usata la posizione sotto." },
      { key: "position", label: "Posizione predefinita", type: "position", default: "alto-destra", show: (v) => !v.rect },
      { key: "angle", label: "Inclinazione", type: "number", default: -8, unit: "°" },
      { key: "opacity", label: "Opacità", type: "range", default: 0.85, min: 0.1, max: 1, step: 0.05 },
      { key: "pages", label: "Pagine", type: "pages", hint: "Vuoto = solo la pagina della posizione (o la prima)." },
    ],
    build: (v) => {
      const out: any = { ...v };
      if (v.rect) { out.page = v.rect.page; out.rect = v.rect.rect; } else { delete out.rect; out.page = 0; }
      if (v.preset === "custom") delete out.preset;
      return out;
    },
  },
  {
    id: "redact", label: "Nascondi dati (oscura)", category: "Modifica", icon: Eraser, panel: "redact",
    description: "Oscura o sfoca in modo definitivo aree o testi (email, IBAN, codici fiscali…): il contenuto viene eliminato dal file.",
    keywords: "censura privacy gdpr anonimizza",
  },

  // ------------------------------------------------------------ Pagine
  {
    id: "merge", label: "Unisci PDF", category: "Pagine", icon: Combine, panel: "merge",
    description: "Unisci più documenti in un unico PDF, nell'ordine che preferisci.",
  },
  {
    id: "organize", label: "Organizza pagine", category: "Pagine", icon: Layers, panel: "organize",
    description: "Trascina le pagine per riordinarle, ruotale, duplicale, eliminale o aggiungi pagine bianche.",
    keywords: "riordina sposta ordine",
  },
  {
    id: "extract_pages", label: "Estrai pagine", category: "Pagine", icon: Copy, panel: "form", pageView: "grid", endpoint: "extract_pages",
    description: "Crea un nuovo PDF con solo le pagine indicate.",
    fields: [{ ...pagesField("Esempi: 1-3,5 · pari · dispari · 4-"), required: true }],
    submitLabel: "Estrai",
  },
  {
    id: "remove_pages", label: "Rimuovi pagine", category: "Pagine", icon: FileX2, panel: "form", pageView: "grid", endpoint: "remove_pages",
    description: "Elimina le pagine indicate dal documento.",
    fields: [{ ...pagesField("Esempi: 2 · 4-6 · pari"), required: true }],
    submitLabel: "Rimuovi",
  },
  {
    id: "rotate", label: "Ruota PDF", category: "Pagine", icon: RotateCw, panel: "form", pageView: "grid", endpoint: "rotate",
    description: "Ruota tutte le pagine o solo alcune.",
    fields: [
      { key: "angle", label: "Rotazione", type: "seg", default: "90",
        options: [{ value: "90", label: "90° →" }, { value: "180", label: "180°" }, { value: "270", label: "90° ←" }] },
      pagesField(),
    ],
  },
  {
    id: "crop", label: "Ritaglia PDF", category: "Pagine", icon: Crop, panel: "form", pageView: "doc", endpoint: "crop",
    description: "Mantieni solo una parte della pagina, oppure elimina automaticamente i margini bianchi.",
    fields: [
      { key: "mode", label: "Modalità", type: "seg", default: "area",
        options: [{ value: "area", label: "Area" }, { value: "auto", label: "Automatica" }, { value: "margins", label: "Margini" }] },
      { key: "rect", label: "Area da mantenere", type: "rect", show: (v) => v.mode === "area", hint: "Trascina sulla pagina." },
      { advanced: false, key: "padding", label: "Margine di sicurezza", type: "number", default: 5, unit: "mm", show: (v) => v.mode === "auto" },
      { advanced: false, key: "m_top", label: "Superiore", type: "number", default: 10, unit: "mm", show: (v) => v.mode === "margins" },
      { advanced: false, key: "m_bottom", label: "Inferiore", type: "number", default: 10, unit: "mm", show: (v) => v.mode === "margins" },
      { advanced: false, key: "m_left", label: "Sinistro", type: "number", default: 10, unit: "mm", show: (v) => v.mode === "margins" },
      { advanced: false, key: "m_right", label: "Destro", type: "number", default: 10, unit: "mm", show: (v) => v.mode === "margins" },
      pagesField(),
    ],
    build: (v) => ({
      pages: v.pages, auto: v.mode === "auto", padding: v.padding,
      rect: v.mode === "area" ? v.rect?.rect : undefined,
      margins: v.mode === "margins" ? { top: v.m_top, bottom: v.m_bottom, left: v.m_left, right: v.m_right } : undefined,
    }),
  },
  {
    id: "resize", label: "Ridimensiona pagine", category: "Pagine", icon: Maximize2, panel: "form", pageView: "grid", endpoint: "resize",
    description: "Porta le pagine a un formato standard (A4, A3…) o personalizzato.",
    fields: [
      { key: "format", label: "Formato", type: "select", default: "A4",
        options: ["A3", "A4", "A5", "A6", "B5", "Letter", "Legal", "Tabloid"].map((f) => ({ value: f, label: f }))
          .concat([{ value: "custom", label: "Personalizzato…" }]) },
      { advanced: false, key: "width", label: "Larghezza", type: "number", default: 210, unit: "mm", show: (v) => v.format === "custom" },
      { advanced: false, key: "height", label: "Altezza", type: "number", default: 297, unit: "mm", show: (v) => v.format === "custom" },
      { key: "orientation", label: "Orientamento", type: "seg", default: "auto",
        options: [{ value: "auto", label: "Come l'originale" }, { value: "portrait", label: "Verticale" }, { value: "landscape", label: "Orizzontale" }] },
      { key: "mode", label: "Contenuto", type: "seg", default: "fit",
        options: [{ value: "fit", label: "Adatta" }, { value: "none", label: "Non scalare" }] },
      pagesField(),
    ],
  },
  {
    id: "page_numbers", label: "Numeri di pagina", category: "Pagine", icon: Hash, panel: "form", endpoint: "page_numbers",
    description: "Aggiungi la numerazione delle pagine.",
    fields: [
      { key: "format", label: "Formato", type: "select", default: "{n}",
        options: [
          { value: "{n}", label: "1" }, { value: "Pagina {n}", label: "Pagina 1" },
          { value: "Pagina {n} di {total}", label: "Pagina 1 di 10" }, { value: "{n}/{total}", label: "1/10" },
          { value: "- {n} -", label: "- 1 -" }, { value: "custom", label: "Personalizzato…" },
        ] },
      { advanced: false, key: "custom_format", label: "Formato personalizzato", type: "text", default: "Pag. {n} di {total}",
        hint: "{n} = numero, {total} = totale", show: (v) => v.format === "custom" },
      { advanced: false, key: "position", label: "Posizione", type: "position", default: "basso-centro" },
      { key: "start", label: "Numero iniziale", type: "number", default: 1, min: 0 },
      { key: "font", label: "Carattere", type: "font", default: "helv" },
      { key: "size", label: "Dimensione", type: "number", default: 10, unit: "pt" },
      { key: "color", label: "Colore", type: "color", default: "#000000" },
      { key: "margin", label: "Distanza dal bordo", type: "number", default: 10, unit: "mm" },
      pagesField("Vuoto = tutte. Es. 2- per non numerare la copertina."),
    ],
    submitLabel: "Numera le pagine",
    build: (v) => ({ ...v, format: v.format === "custom" ? v.custom_format : v.format }),
  },
  {
    id: "create_index", label: "Aggiungi sommario", category: "Pagine", icon: ListOrdered, panel: "form", endpoint: "create_index",
    description: "Genera una pagina di indice (sommario) cliccabile all'inizio del documento.",
    fields: [
      { key: "source", label: "Voci dell'indice", type: "seg", default: "bookmarks",
        options: [{ value: "bookmarks", label: "Dai segnalibri" }, { value: "headings", label: "Rileva titoli" }] },
      { key: "note1", type: "note", label: "Se il documento non ha segnalibri, creali prima con \"Modifica indice\" oppure usa \"Rileva titoli\".", show: (v) => v.source === "bookmarks" },
      { key: "title", label: "Titolo", type: "text", default: "Indice" },
      { key: "font", label: "Carattere", type: "font", default: "helv" },
      { key: "size", label: "Dimensione voci", type: "number", default: 11, unit: "pt" },
      { key: "bookmarks", label: "Crea anche i segnalibri di navigazione", type: "checkbox", default: true },
    ],
  },

  // ------------------------------------------------------------ Firma e sicurezza
  {
    id: "sign", label: "Firma", category: "Firma e sicurezza", icon: FileSignature, panel: "sign",
    description: "Firma disegnando, con un'immagine, con testo o con un certificato digitale (PAdES).",
  },
  {
    id: "p7m", label: "Apri file firmati (.p7m)", category: "Firma e sicurezza", icon: BadgeCheck, panel: "p7m",
    description: "Apri un file firmato digitalmente (.p7m o .p7s, come ArubaSign): verifica le firme con l'elenco AgID ed estrai il documento.",
    keywords: "p7m p7s cades firma digitale verifica arubasign dike busta estrai fattura elettronica",
  },
  {
    id: "add_password", label: "Aggiungi password", category: "Firma e sicurezza", icon: FileLock2, panel: "form", endpoint: "add_password",
    description: "Proteggi il PDF con password (AES-256) e limita stampa, copia e modifica.",
    fields: [
      { advanced: false, key: "user_password", label: "Password di apertura", type: "password", hint: "Richiesta per aprire il file. Vuota = apertura libera." },
      { advanced: false, key: "n_android", type: "note", tone: "ok", show: () => isLocalEngine(),
        label: "La password viene scritta dentro il PDF: dopo \"Proteggi\" premi Salva (o Salva con nome). Il file salvato in Documenti/PDFz chiederà la password ogni volta che lo apri, in questa app o in qualsiasi altro lettore PDF. Il file originale da cui sei partito non cambia." },
      { key: "owner_password", label: "Password proprietario", type: "password", hint: "Serve a modificare i permessi. Vuota = uguale a quella di apertura." },
      { key: "permissions", label: "Permessi consentiti", type: "checks", default: ["print", "print_hq", "copy", "accessibility", "forms"],
        options: [
          { value: "print", label: "Stampa" }, { value: "print_hq", label: "Stampa in alta qualità" },
          { value: "copy", label: "Copia testo e immagini" }, { value: "modify", label: "Modifica" },
          { value: "annotate", label: "Commenti e annotazioni" }, { value: "forms", label: "Compilazione moduli" },
          { value: "assemble", label: "Inserire/ruotare pagine" }, { value: "accessibility", label: "Accessibilità (lettori di schermo)" },
        ] },
      { key: "algorithm", label: "Cifratura", type: "select", default: "aes256",
        options: [{ value: "aes256", label: "AES 256 bit (consigliata)" }, { value: "aes128", label: "AES 128 bit" }, { value: "rc4", label: "RC4 128 bit (compatibilità)" }] },
    ],
    submitLabel: "Proteggi",
  },
  {
    id: "remove_password", label: "Rimuovi password", category: "Firma e sicurezza", icon: Unlock, panel: "form", endpoint: "remove_password",
    description: "Elimina la password e le restrizioni dal documento (serve conoscere la password).",
    fields: [
      { key: "password", label: "Password attuale", type: "password", hint: "Per i file con sole restrizioni indica la password proprietario, se nota." },
      { advanced: false, key: "n_android", type: "note", tone: "ok", show: () => isLocalEngine(),
        label: "Se hai aperto il file inserendo la password puoi lasciare il campo vuoto. Dopo \"Rimuovi protezione\" premi Salva: il file salvato si aprirà senza password." },
    ],
    submitLabel: "Rimuovi protezione",
  },
  {
    id: "password_info", label: "Password del PDF", category: "Firma e sicurezza", icon: KeyRound, panel: "pwinfo",
    description: "Vedi quali password ha il documento (apertura, proprietario), la cifratura e cosa è permesso fare.",
    keywords: "password protezione cifratura permessi sicurezza lucchetto verifica",
  },
  {
    id: "remove_signature", label: "Togli le firme digitali", category: "Firma e sicurezza", icon: ShieldOff, panel: "form", endpoint: "remove_signature",
    description: "Elimina le firme digitali (e i relativi campi) dal documento.",
    fields: [{ key: "n", type: "note", tone: "warn", label: "Il documento non risulterà più firmato. L'operazione non modifica il contenuto visibile delle pagine." }],
    submitLabel: "Togli le firme",
  },
  {
    id: "sanitize", label: "Pulisci prima di inviare", category: "Firma e sicurezza", icon: Sparkles, panel: "form", endpoint: "sanitize",
    description: "Togli dal PDF le informazioni nascoste e i comandi automatici prima di mandarlo ad altri.",
    fields: [
      { key: "javascript", label: "Comandi automatici nascosti (JavaScript)", type: "checkbox", default: true },
      { key: "embedded_files", label: "File allegati dentro il PDF", type: "checkbox", default: true },
      { key: "xmp_metadata", label: "Informazioni nascoste sul file (XMP)", type: "checkbox", default: true },
      { key: "metadata", label: "Autore, titolo e programma usato", type: "checkbox", default: false },
      { key: "links", label: "Collegamenti a siti, file e altre app", type: "checkbox", default: false },
      { key: "fonts", label: "Caratteri inclusi nel file", type: "checkbox", default: false },
      { key: "n", type: "note", tone: "warn", label: "Senza i caratteri inclusi il testo potrebbe comparire con un carattere diverso.", show: (v) => v.fonts },
    ],
    submitLabel: "Pulisci",
  },
  {
    id: "unlock_forms", label: "Rendi compilabili i moduli", category: "Firma e sicurezza", icon: LockOpen, panel: "form", endpoint: "unlock_forms",
    description: "Rende di nuovo compilabili i campi dei moduli impostati in sola lettura.",
    fields: [],
    submitLabel: "Sblocca",
  },
  {
    id: "flatten", label: "Blocca moduli e commenti", category: "Firma e sicurezza", icon: Layers, panel: "form", endpoint: "flatten",
    description: "Rendi definitivi moduli compilati e commenti (non si modificano più), oppure trasforma le pagine in immagini.",
    fields: [
      { key: "mode", label: "Modalità", type: "seg", default: "forms",
        options: [{ value: "forms", label: "Solo moduli e commenti" }, { value: "full", label: "Tutta la pagina come immagine" }] },
      { key: "dpi", label: "Risoluzione di rendering", type: "select", default: "150", show: (v) => v.mode === "full",
        options: [{ value: "72", label: "72 DPI (file leggero)" }, { value: "100", label: "100 DPI" }, { value: "150", label: "150 DPI (consigliato)" },
          { value: "200", label: "200 DPI" }, { value: "300", label: "300 DPI (stampa)" }] },
      { key: "quality", label: "Qualità JPEG", type: "number", default: 85, min: 30, max: 100, show: (v) => v.mode === "full" },
      { key: "grayscale", label: "Scala di grigi", type: "checkbox", default: false, show: (v) => v.mode === "full" },
      { key: "pages", label: "Pagine", type: "pages", show: (v) => v.mode === "full", hint: "Vuoto = tutte." },
      { key: "n", type: "note", tone: "warn", label: "Come immagine il testo non si potrà più selezionare (poi puoi usare «Testo ricercabile»).", show: (v) => v.mode === "full" },
    ],
    submitLabel: "Blocca",
  },

  // ------------------------------------------------------------ Ottimizza e analizza
  {
    id: "compress", label: "Riduci dimensione (comprimi)", category: "Ottimizza e analizza", icon: Archive, panel: "form", endpoint: "compress",
    description: "Riduci le dimensioni del file ricomprimendo immagini, caratteri e struttura.",
    fields: [
      { key: "level", label: "Livello", type: "select", default: "media",
        options: [
          { value: "leggera", label: "Leggera — senza perdita di qualità" },
          { value: "media", label: "Media — immagini a 150 DPI (consigliata)" },
          { value: "forte", label: "Forte — immagini a 110 DPI" },
          { value: "massima", label: "Massima — immagini a 72 DPI" },
          { value: "personalizzata", label: "Personalizzata…" },
        ] },
      { advanced: false, key: "dpi", label: "DPI immagini", type: "number", default: 150, show: (v) => v.level === "personalizzata" },
      { advanced: false, key: "quality", label: "Qualità JPEG", type: "number", default: 70, min: 10, max: 100, show: (v) => v.level === "personalizzata" },
      { key: "grayscale", label: "Converti in scala di grigi", type: "checkbox", default: false },
      { key: "ghostscript", label: "Usa anche Ghostscript (più lento, a volte più efficace)", type: "checkbox", default: false },
    ],
    submitLabel: "Comprimi",
  },
  {
    id: "compare", label: "Confronta PDF", category: "Ottimizza e analizza", icon: FileDiff, panel: "compare",
    description: "Evidenzia le differenze di testo e grafiche tra due versioni di un documento.",
  },
  {
    id: "ocr", label: "Testo ricercabile (OCR)", category: "Ottimizza e analizza", icon: ScanText, panel: "form", endpoint: "ocr",
    description: "Riconosci il testo nelle pagine scansionate, rendendolo ricercabile e copiabile.",
    fields: [
      { key: "languages", label: "Lingue del documento", type: "checks", default: ["ita", "eng"], options: [] },
      { key: "mode", label: "Pagine con testo già presente", type: "seg", default: "skip",
        options: [{ value: "skip", label: "Salta" }, { value: "all", label: "Elabora" }, { value: "force", label: "Sostituisci" }] },
      { key: "dpi", label: "Risoluzione di analisi", type: "select", default: "300",
        options: [{ value: "200", label: "200 DPI (veloce)" }, { value: "300", label: "300 DPI (consigliato)" }, { value: "400", label: "400 DPI (testi piccoli)" }] },
      pagesField(),
    ],
    submitLabel: "Avvia OCR",
  },
  {
    id: "info", label: "Informazioni sul file", category: "Ottimizza e analizza", icon: Info, panel: "info",
    description: "Tutte le informazioni sul PDF: versione, pagine, caratteri, immagini, sicurezza, moduli, allegati.",
  },
  {
    id: "validate", label: "Controlla il PDF", category: "Ottimizza e analizza", icon: FileCheck2, panel: "validate",
    description: "Verifica struttura del file, firme digitali, caratteri e conformità PDF/A dichiarata.",
  },

  // ------------------------------------------------------------ Revisione
  {
    id: "comments", label: "Commenti e revisioni", category: "Revisione", icon: MessagesSquare, panel: "comments",
    description: "Note, evidenziazioni, proposte di modifica (barra, sostituisci, inserisci), risposte e stato di revisione.",
    keywords: "commento nota evidenzia sottolinea barra revisione revisore accetta rifiuta risposta annotazioni",
  },
  {
    id: "properties", label: "Titolo e autore", category: "Revisione", icon: FileCog, panel: "properties",
    description: "Titolo, autore, oggetto, parole chiave e date del documento.",
    keywords: "metadati",
  },
  {
    id: "toc", label: "Segnalibri", category: "Revisione", icon: ListTree, panel: "toc",
    description: "Crea e modifica i segnalibri (indice di navigazione) del documento.",
    keywords: "segnalibri bookmark struttura",
  },

  // ------------------------------------------------------------ Converti
  {
    id: "convert_from_pdf", label: "Trasforma in Word, Excel…", category: "Converti", icon: FileOutput, panel: "form", endpoint: "convert_from_pdf",
    description: "Converti il PDF in Word, Excel, PowerPoint, OpenDocument, testo, immagini o PDF/A.",
    fields: [
      { key: "format", label: "Formato", type: "select", default: "docx",
        options: [
          { value: "docx", label: "Word (.docx)" }, { value: "xlsx", label: "Excel (.xlsx) — tabelle" },
          { value: "pptx", label: "PowerPoint (.pptx)" }, { value: "odt", label: "OpenDocument testo (.odt)" },
          { value: "ods", label: "OpenDocument foglio (.ods)" }, { value: "odp", label: "OpenDocument presentazione (.odp)" },
          { value: "rtf", label: "RTF (.rtf)" }, { value: "csv", label: "CSV (.csv)" }, { value: "txt", label: "Testo (.txt)" },
          { value: "html", label: "HTML (.html)" }, { value: "png", label: "Immagini PNG" }, { value: "jpg", label: "Immagini JPG" },
          { value: "pdfa", label: "PDF/A (archiviazione)" },
        ] },
      { key: "engine", label: "Motore di conversione", type: "select", default: "auto",
        show: (v) => ["docx", "rtf", "odt"].includes(v.format),
        options: [{ value: "auto", label: "Automatico (Word se installato)" }, { value: "builtin", label: "Integrato" },
          { value: "office", label: "Microsoft Word" }, { value: "libreoffice", label: "LibreOffice" }] },
      { key: "dpi", label: "Risoluzione", type: "number", default: 150, unit: "DPI", show: (v) => ["png", "jpg", "pptx", "odp"].includes(v.format) },
      { key: "pdfa_level", label: "Livello PDF/A", type: "select", default: "2", show: (v) => v.format === "pdfa",
        options: [{ value: "1", label: "PDF/A-1b" }, { value: "2", label: "PDF/A-2b (consigliato)" }, { value: "3", label: "PDF/A-3b" }] },
      pagesField(),
    ],
    submitLabel: "Converti",
  },
  {
    id: "create_pdf", label: "Crea PDF da foto e file", category: "Converti", icon: FileInput, panel: "create_pdf",
    description: "Converti in PDF documenti Word, Excel, PowerPoint, immagini, testo e altri formati.",
    keywords: "word excel immagini jpg",
  },
];

// nomi di prima e parole d'uso comune: la ricerca degli strumenti le trova ancora
const ANCHE: Record<string, string> = {
  redact: "oscura censura", create_index: "crea indice sommario", p7m: "file firmati p7m", remove_signature: "rimuovi firma digitale",
  sanitize: "sanitizza metadati pulisci", unlock_forms: "sblocca moduli", flatten: "appiattisci", compress: "comprimi riduci peso email",
  ocr: "ocr scansione riconosci testo", info: "info complete", validate: "convalida verifica", properties: "modifica proprietà metadati",
  toc: "modifica indice segnalibri", convert_from_pdf: "converti office word excel powerpoint", create_pdf: "crea pdf da file foto scansiona",
  sign: "firmare sigla", add_text: "scrivi compila modulo campo", marks: "compila modulo casella", organize: "ruota elimina pagine ordine",
};
for (const t of TOOLS) if (ANCHE[t.id]) t.keywords = `${t.keywords || ""} ${ANCHE[t.id]}`.trim();

// cosa fa ogni strumento in poche parole: sotto il nome nel menu "Tutti gli strumenti" (vista semplice, 1.7.0)
const BREVE: Record<string, string> = {
  edit_text: "cambia le parole già scritte", add_text: "scrivi dove vuoi o compila un modulo", images: "inserisci o togli immagini",
  shapes: "rettangoli, cerchi, frecce, linee", marks: "segni di spunta nelle caselle dei moduli", attach: "unisci un file al PDF",
  watermark: "scritta di sfondo, es. BOZZA", stamp: "Approvato, Ricevuto, Pagato…", redact: "nascondi per sempre dati sensibili",
  merge: "più PDF in uno solo", organize: "sposta, gira o togli pagine", extract_pages: "salva alcune pagine in un file a parte",
  remove_pages: "togli le pagine che non servono", rotate: "raddrizza le pagine storte", crop: "togli i bordi bianchi",
  resize: "cambia formato (A4, A3…)", page_numbers: "numera le pagine", create_index: "pagina con l'elenco dei capitoli",
  sign: "firma a mano o con il certificato", p7m: "apri e verifica i file .p7m", add_password: "proteggi il file con una password",
  remove_password: "togli la protezione", password_info: "che protezione ha il file", remove_signature: "togli una firma con certificato",
  sanitize: "togli dati nascosti e informazioni personali", unlock_forms: "rendi compilabile un modulo bloccato",
  flatten: "rendi fissi campi e note", compress: "file più leggero, da mandare per email", compare: "trova le differenze fra due PDF",
  ocr: "rendi cercabile il testo delle scansioni", info: "pagine, caratteri, immagini, sicurezza", validate: "cerca errori nel file e nelle firme",
  comments: "evidenzia, sottolinea, aggiungi note", properties: "titolo, autore, parole chiave", toc: "capitoli nel menu laterale del PDF",
  convert_from_pdf: "Word, Excel, PowerPoint, immagini…", create_pdf: "da foto, Word, Excel e altri file",
};
for (const t of TOOLS) if (BREVE[t.id]) t.breve = BREVE[t.id];

/** testo in cui la ricerca degli strumenti cerca (menu a sinistra e "Tutti gli strumenti") */
export const testoRicerca = (t: ToolDef) => `${t.label} ${t.description} ${t.breve || ""} ${t.keywords || ""}`.toLowerCase();

export const TOOL_BY_ID = Object.fromEntries(TOOLS.map((t) => [t.id, t]));

// icone usate altrove
export const Icons = { FileText, FileSearch, BookOpen, ShieldCheck, FileKey2, FileImage, Scissors };
