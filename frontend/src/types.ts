export interface VRect { x: number; y: number; w: number; h: number }

export interface PageRect { page: number; rect: VRect }

export interface Span {
  id: string;
  text: string;
  bbox: [number, number, number, number];
  origin: [number, number];
  font: string;
  size: number;
  color: string;
  flags: number;
  suggested_font: string;
  dir?: [number, number];
  /** riquadro stretto delle lettere (quello della riga può essere molto più alto, secondo il carattere) */
  ink?: [number, number, number, number];
}

export interface SpanEdit {
  page: number;
  span: Span;
  text: string;
  font: string; // id font o "original"
  size: number;
  color: string;
}

export interface Overlay {
  id: string;
  page: number;
  rect: VRect;
  kind: "box" | "fill" | "match" | "image" | "text";
  label?: string;
  imageUrl?: string;
  text?: string;
  style?: React.CSSProperties;
  fontPt?: number; // dimensione del testo di anteprima in punti PDF
  onDelete?: () => void;
}

/** Oggetto modificabile sulla pagina (casella di testo, immagine, firma, riquadro). */
export interface PageObject {
  id: string;
  page: number;
  rect: VRect;
  kind: "text" | "image" | "box" | "shape";
  text?: string;
  fontId?: string;
  size?: number;
  color?: string;
  align?: "left" | "center" | "right";
  opacity?: number;
  imageUrl?: string;
  keepRatio?: boolean;
  cover?: boolean;        // sfondo bianco (testo esistente in modifica)
  autoHeight?: boolean;   // l'altezza segue il testo
  autoWidth?: boolean;    // la larghezza segue il testo (fino al bordo pagina), poi va a capo
  locked?: boolean;       // non spostabile/ridimensionabile (es. immagini già nel PDF)
  big?: boolean;          // schermi touch: casella grande almeno quanto un dito (Aggiungi testo)
  label?: string;
  tone?: "danger";
  meta?: any;
}

/** Nota (annotazione "fumetto") del PDF: sulla pagina c'è l'icona, al clic si apre il testo. */
export interface NoteInfo {
  nm: string;
  xref: number;
  page: number;
  rect: VRect;
  content: string;
  author: string;
  date: string;
  color?: string | null;
}

export interface Interaction {
  mode: "none" | "rect" | "spans" | "objects" | "textsel";
  // oggetti
  objects?: PageObject[];
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
  onObjectChange?: (id: string, patch: Partial<PageObject>) => void;
  onObjectDelete?: (id: string) => void;
  onObjectDrop?: (id: string) => void;   // fine di uno spostamento o ridimensionamento (oggetti già applicati)
  onPlace?: (page: number, pt: { x: number; y: number }) => void;
  onDraw?: (page: number, rect: VRect, start: { x: number; y: number }, end: { x: number; y: number }) => void;
  hideAnnotations?: boolean;   // non disegnare le annotazioni del PDF (sono mostrate come oggetti)
  placeHint?: string;
  onRect?: (page: number, rect: VRect) => void;
  // selezione del testo come in Word (evidenzia, sottolinea, barra…)
  onTextSel?: (page: number, from: { x: number; y: number }, to: { x: number; y: number }, done: boolean) => void;
  needWords?: (page: number) => void;
  /** telefono/tablet: selezione del testo in corso, con i due "cerchietti" per allargarla o restringerla */
  selHandles?: { page: number; a: { x: number; y: number }; b: { x: number; y: number }; onMove: (which: "a" | "b", p: { x: number; y: number }) => void };
  // note: scritte direttamente sulla pagina, poi ridotte a icona
  noteDraft?: { page: number; point: { x: number; y: number }; color?: string } | null;
  onNoteDraft?: (text: string | null) => void;   // null = annulla
  onNoteEdit?: (xref: number, text: string) => void;
  onNoteDelete?: (xref: number) => void;
  openNote?: { nm: string; n: number } | null;   // apre la nota (es. clic nell'elenco dei commenti)
  cursorHint?: string;
  // modifica testo
  spans?: Record<number, Span[]>;
  needSpans?: (page: number) => void;
  selectedSpan?: string | null;
  onSpanClick?: (page: number, span: Span) => void;
  edits?: Record<string, SpanEdit>;
  fontStyle?: (fontId: string) => React.CSSProperties;
}

export const NO_INTERACTION: Interaction = { mode: "none" };
