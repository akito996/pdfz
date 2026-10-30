import { TOOL_BY_ID } from "./tools";

/** Un passo della guida: titolo, cosa fare e (facoltativo) l'elemento da evidenziare (selettore CSS). */
export interface Passo { titolo: string; testo: string; dove?: string }
export interface GuidaDef { titolo: string; passi: Passo[] }

const PAGINA = ".pages";
const PANNELLO = ".main > .panel .panel-body";
const PIEDE = ".main > .panel .panel-foot";
const SALVA = ".topbar .salva";

/**
 * Guide 1-2-3 (proposta C della 1.6.0): si offrono la prima volta che si apre uno strumento (o un compito della
 * schermata iniziale) e si riaprono con il "?" del pannello. Tre percorsi completi (firmare, compilare un modulo,
 * unire) e guide brevi per gli altri strumenti; per quelli senza guida scritta qui se ne fa una dalla descrizione.
 * verbo = "Tocca" o "Clicca".
 */
export function guidaPer(chiave: string, verbo: string): GuidaDef | null {
  const v = verbo, vv = verbo.toLowerCase();
  const fine: Passo = { titolo: "Salva", testo: "Quando hai finito premi Salva: le modifiche sono già sul foglio, Salva le scrive nel file.", dove: SALVA };
  const guide: Record<string, GuidaDef> = {
    sign: { titolo: "Firmare un documento", passi: [
      { titolo: "Prepara la firma", testo: "Disegnala nel riquadro con il dito, la penna o il mouse. Oppure scegli Immagine (una foto della firma) o Testo (il tuo nome).", dove: PANNELLO },
      { titolo: "Mettila sulla pagina", testo: `${v} il punto della pagina dove vuoi la firma: va subito sul foglio.`, dove: PAGINA },
      { titolo: "Sistemala e salva", testo: "Trascinala per spostarla e dagli angoli cambi la grandezza. Poi premi Salva.", dove: SALVA },
    ] },
    compila: { titolo: "Compilare un modulo", passi: [
      { titolo: "Scrivi nei campi", testo: `${v} il campo del modulo e scrivi. Quando hai finito ${vv} fuori dalla casella: il testo va sul foglio.`, dove: PAGINA },
      { titolo: "Spunta le caselle", testo: `Per le caselle da barrare apri «Spunta e X» (in «Tutti gli strumenti» o nel menu a sinistra) e ${vv} la casella.`,
        dove: ".semplice-bar .altro" },
      { titolo: "Firma e salva", testo: "Se il modulo va firmato apri «Firma». Alla fine premi Salva.", dove: SALVA },
    ] },
    merge: { titolo: "Unire più PDF", passi: [
      { titolo: "Scegli i PDF", testo: "Aggiungi i file da unire: puoi sceglierne più di uno insieme.", dove: PANNELLO },
      { titolo: "Mettili in ordine", testo: "Trascinali nell'elenco per cambiare l'ordine.", dove: PANNELLO },
      { titolo: "Unisci e salva", testo: "Premi il pulsante in basso: il nuovo PDF si apre in una scheda. Poi premi Salva.", dove: PIEDE },
    ] },
    add_text: { titolo: "Scrivere sul documento", passi: [
      { titolo: "Scegli il punto", testo: `${v} la pagina dove vuoi scrivere: compare una casella.`, dove: PAGINA },
      { titolo: "Scrivi", testo: `Scrivi il testo; carattere, grandezza e colore li cambi nel pannello. ${v} fuori dalla casella e il testo va sul foglio.`, dove: PANNELLO },
      fine,
    ] },
    edit_text: { titolo: "Correggere il testo", passi: [
      { titolo: "Scegli la riga", testo: `${v} la riga di testo da correggere: si apre una casella con lo stesso testo.`, dove: PAGINA },
      { titolo: "Correggi", testo: `Cambia le parole come in un documento di testo. ${v} fuori dalla casella e la correzione va sul foglio.`, dove: PAGINA },
      fine,
    ] },
    marks: { titolo: "Spuntare le caselle", passi: [
      { titolo: "Scegli il segno", testo: "Spunta ✓ oppure X.", dove: PANNELLO },
      { titolo: `${v} la casella`, testo: `${v} la casella del modulo: il segno va subito sul foglio. Trascinandolo lo sposti.`, dove: PAGINA },
      fine,
    ] },
    stamp: { titolo: "Mettere un timbro", passi: [
      { titolo: "Scegli il timbro", testo: "Approvato, Ricevuto, Pagato… oppure un'immagine.", dove: PANNELLO },
      { titolo: "Mettilo sulla pagina", testo: `${v} il punto della pagina: il timbro va subito sul foglio e lo puoi spostare.`, dove: PAGINA },
      fine,
    ] },
    images: { titolo: "Inserire un'immagine", passi: [
      { titolo: "Scegli l'immagine", testo: "Prendila dal dispositivo o scatta una foto.", dove: PANNELLO },
      { titolo: "Mettila sulla pagina", testo: `${v} il punto della pagina: l'immagine va subito sul foglio; trascinala e dagli angoli cambi la grandezza.`, dove: PAGINA },
      fine,
    ] },
    shapes: { titolo: "Disegnare forme", passi: [
      { titolo: "Scegli la forma", testo: "Rettangolo, cerchio, linea o freccia, e il colore.", dove: PANNELLO },
      { titolo: "Disegna", testo: "Trascina sulla pagina: la forma va subito sul foglio e la puoi spostare.", dove: PAGINA },
      fine,
    ] },
    organize: { titolo: "Sistemare le pagine", passi: [
      { titolo: "Scegli le pagine", testo: `${v} le pagine da ruotare o eliminare; trascinale per cambiare l'ordine.` },
      { titolo: "Ruota o elimina", testo: "Usa i pulsanti del pannello sulle pagine scelte.", dove: PANNELLO },
      { titolo: "Fatto", testo: "Premi «Fatto», poi Salva.", dove: PIEDE },
    ] },
    redact: { titolo: "Nascondere dati", passi: [
      { titolo: "Segna cosa nascondere", testo: "Trascina sulla pagina sopra il testo, oppure cerca parole, email, IBAN, codici fiscali.", dove: PANNELLO },
      { titolo: "Conferma", testo: "Premi il pulsante in basso: quello che c'era sotto viene tolto davvero dal file.", dove: PIEDE },
      fine,
    ] },
    compress: { titolo: "Rimpicciolire il file", passi: [
      { titolo: "Scegli quanto", testo: "«Media» va bene quasi sempre: il file diventa più leggero e si legge ancora bene.", dove: PANNELLO },
      { titolo: "Rimpicciolisci", testo: "Premi il pulsante in basso.", dove: PIEDE },
      fine,
    ] },
    comments: { titolo: "Evidenziare e aggiungere note", passi: [
      { titolo: "Scegli cosa fare", testo: "Evidenzia, Sottolinea, Barra oppure Nota.", dove: PANNELLO },
      { titolo: "Segna sulla pagina", testo: `Scorri sopra il testo da evidenziare; per una nota ${vv} il punto della pagina e scrivi.`, dove: PAGINA },
      fine,
    ] },
    convert_from_pdf: { titolo: "Trasformare in Word", passi: [
      { titolo: "Scegli il formato", testo: "Word è già scelto; puoi scegliere anche Excel, PowerPoint o immagini.", dove: PANNELLO },
      { titolo: "Trasforma", testo: "Premi «Converti» in basso e scegli dove salvare il nuovo file.", dove: PIEDE },
    ] },
    create_pdf: { titolo: "Creare un PDF", passi: [
      { titolo: "Scegli i file", testo: "Foto, documenti Word, Excel, PowerPoint… anche più di uno.", dove: PANNELLO },
      { titolo: "Crea il PDF", testo: "Premi il pulsante in basso: il PDF si apre in una scheda.", dove: PIEDE },
      fine,
    ] },
  };
  if (guide[chiave]) return guide[chiave];
  const t = TOOL_BY_ID[chiave];
  if (!t) return null;
  // strumenti senza guida scritta: cosa fa, il pulsante da premere, Salva
  return { titolo: t.label, passi: [
    { titolo: "A cosa serve", testo: t.description, dove: PANNELLO },
    t.panel === "form"
      ? { titolo: "Scegli e conferma", testo: `Scegli le opzioni e premi «${t.submitLabel || t.label}».`, dove: PIEDE }
      : { titolo: "Segui il pannello", testo: "Le indicazioni nel pannello e sopra la pagina ti dicono cosa toccare.", dove: PANNELLO },
    fine,
  ] };
}
