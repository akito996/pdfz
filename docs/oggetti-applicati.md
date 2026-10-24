# Oggetti applicati eliminabili (dalla 1.4.0)

Firme grafiche, timbri, testo aggiunto, filigrane e numeri di pagina vengono scritti **nel contenuto della pagina**
(non come annotazioni). Dalla 1.4.0 si possono eliminare anche dopo "Applica".

## Come funziona

Ogni strumento che scrive sulle pagine racchiude quello che aggiunge in un blocco di `backend/hdpdf/tools/applicati.py`:

```python
with marca(pagina, "firma", "Firma disegnata", riquadro_visivo, gid):
    pagina.insert_image(...)
```

`marca()` guarda quali flussi di contenuto il blocco aggiunge alla pagina (PyMuPDF ne crea uno nuovo per ogni
inserimento) e li racchiude in una sequenza di contenuto marcato, che i lettori PDF ignorano:

```
/PDFz <</Tipo /firma /Id (3fa2c1d0) /Nome <FEFF…> /R [x0 y0 x1 y1] /D (D:20261024…)>> BDC … EMC
```

| Chiave | Significato |
|---|---|
| `Tipo` | `firma`, `timbro`, `testo`, `filigrana`, `numeri` |
| `Id` | stesso valore su tutte le pagine dello stesso oggetto (sigla ripetuta, filigrana, numerazione) |
| `Nome` | testo da mostrare nell'elenco (UTF-16 in esadecimale) |
| `R` | riquadro nello **spazio PDF** della pagina: resta giusto se la pagina viene ruotata o ritagliata |
| `D` | data di applicazione |

Strumenti del motore:

- `list_applied` (`params.tipi`): elenco `{page, id, tipo, nome, data, rect}` (riquadro visivo per l'interfaccia);
- `remove_applied` (`params.items: [{page, id}]`, senza `page` = da tutte le pagine): toglie le sequenze, poi
  `page.clean_contents(sanitize=True)` ripulisce la pagina e le sue risorse, così l'immagine di una firma eliminata
  e i caratteri usati solo da lei escono dal file al salvataggio (`garbage=4`).

Il contenuto della pagina si legge con un piccolo lettore di flussi PDF (`_Lettore`: stringhe con escape, esadecimali,
dizionari, array, immagini in linea `BI … ID … EI`) che trova le sequenze `/PDFz … BDC` più esterne e il loro `EMC`.

**Flussi condivisi**: salvando con `garbage=3/4`, i flussi uguali di pagine diverse diventano un oggetto solo (la stessa
sigla su ogni pagina). Prima di cambiarne uno condiviso, `togli()` ne fa una copia per la pagina (`_copia_flusso`),
altrimenti eliminando la firma da una pagina sparirebbe anche dalle altre.

## Firme digitali

Non sono contenuto della pagina ma campi firma: `list_signatures` li elenca (campo, firmatario `/Name`, data `/M`,
pagina, riquadro; `null` per le firme invisibili) e `remove_signature` con `params.fields` toglie solo quelli
indicati. Se la firma tolta aveva certificato il documento (`/Perms /DocMDP`), il blocco va via con lei; `SigFlags`
si toglie quando non resta nessuna firma. Il file viene riscritto: le altre firme digitali non risultano più valide.

## Interfaccia

`frontend/src/panels/applicati.tsx`:

- `useApplicati(tipi)`: legge l'elenco a ogni versione del documento, dà i riquadri bloccati (`locked`) da mettere
  sulla pagina e `elimina(voci)` (subito; si torna indietro con Annulla);
- `ApplicatoScelto`: sezione "Firma applicata / Timbro applicato / Testo aggiunto" con "Elimina" (e "Elimina da tutte"
  per gli oggetti ripetuti); `InVista` la porta in vista nel pannello basso del telefono;
- `ElencoApplicati`: elenco con il cestino (in Opzioni avanzate per Firma, Timbro e Aggiungi testo);
- `ApplicatiNelDocumento`: per gli strumenti con il solo modulo (Filigrana, Numeri di pagina), in `ToolPanel.tsx`.

I pannelli Firma e Aggiungi testo svuotano le modifiche non applicate solo **cambiando scheda** (`useSchedaKey`), non a
ogni nuova versione del documento: eliminando un oggetto le firme già posizionate restano.

## Limiti

- Gli oggetti applicati **prima della 1.4.0** non hanno il segno: firme e timbri come immagine si tolgono con lo
  strumento Immagini, quelli di testo con Oscura.
- **Ridimensiona pagine** mette la pagina dentro una pagina nuova (oggetto modulo): gli oggetti applicati prima non si
  ritrovano più (il segno resta, ma dentro l'oggetto modulo, che `list_applied` non legge).
- **Appiattisci** e "Filigrana non rimovibile" trasformano le pagine in immagini: niente più da eliminare.
- Oscura, Modifica testo e la rimozione di immagini riscrivono il contenuto della pagina con MuPDF, che mantiene le
  sequenze marcate (provato con PyMuPDF 1.28.2 e 2.0).

## Prove

`backend/tests/test_tools.py`: `test_oggetti_applicati_si_eliminano` (tutti i tipi, firma ripetuta tolta da una pagina
o da tutte, immagine tolta dal file), `test_oggetti_applicati_eliminati_pagina_come_prima` (dopo applica + elimina le
pagine sono identiche al pixel, anche con risorse condivise), `test_oggetti_applicati_dopo_oscura_e_pagina_ruotata`,
`test_firme_digitali_si_eliminano_una_per_volta`.

## Aggiungere uno strumento che scrive sulle pagine

1. nel motore: `with marca(pg, "<tipo>", nome, riquadro, gid):` attorno agli inserimenti (nuovo tipo anche in `TIPI`);
2. nell'interfaccia: `useApplicati(["<tipo>"])` nel pannello, oppure una riga in `APPLICATI` di `ToolPanel.tsx` per gli
   strumenti con il solo modulo; etichetta in `ETICHETTE` di `applicati.tsx`.
