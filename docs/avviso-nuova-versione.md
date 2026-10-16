# Avviso "nuova versione disponibile"

Aggiornato alla versione **1.0.0** (2026-10-16). Stato: **attivo** nelle build della pipeline di GitHub, a una condizione:
il repository `akito996/pdfz` (o l'indirizzo scelto con la variabile `UPDATE_BASE_URL`) deve essere **pubblico**.
Con un repository privato le release chiedono l'accesso: il controllo fallisce **in silenzio** (nessun errore per
l'utente, semplicemente l'avviso non compare).

## Come funziona

- A ogni tag la pipeline (`.github/workflows/release.yml`) compila Windows, macOS, Linux e Android e crea la
  **GitHub Release** della versione con gli installer e un file per piattaforma
  (creati da `packaging/scrivi_versione.py`, con le novità di `frontend/src/novita.json` filtrate per piattaforma):

  | File | Installer collegato |
  |---|---|
  | `versione-windows.json` | `PDFz-X.Y.Z-x64.msi` |
  | `versione-macos.json` | `PDFz-X.Y.Z-macOS-arm64.dmg` |
  | `versione-linux.json` | `PDFz-X.Y.Z-x86_64.AppImage` |
  | `versione-android.json` | `PDFz-X.Y.Z-android.apk` |

- Prima della build la pipeline scrive l'indirizzo in `UPDATE_BASE_URL` di `backend/hdpdf/aggiornamenti.py`
  (`packaging/imposta-url-aggiornamenti.sh`, che legge `UPDATE_BASE_URL`): la variabile di repository `UPDATE_BASE_URL`
  se c'è, altrimenti **`https://github.com/akito996/pdfz/releases/latest/download/`**.
  Nel repository il valore resta vuoto, quindi le build locali non controllano gli aggiornamenti
  (si può provare con la variabile d'ambiente `HDPDF_UPDATE_URL`, che ha la precedenza).
- `releases/latest/download/<file>` è un indirizzo fisso di GitHub che porta al file con quel nome nell'**ultima release
  normale** (non bozza, non pre-release). JSON e installer stanno nella stessa release, quindi sono sempre della stessa
  versione: non serve un ordine di caricamento.
- L'app scarica `UPDATE_BASE_URL + "versione-<piattaforma>.json"` all'avvio e poi al massimo ogni **6 ore**; se la versione è più
  recente la **campanella** mostra il badge rosso, le novità e il riquadro del **download diretto** della propria
  piattaforma (dalla 1.0.2): sistema, nome del file e dimensione, pulsante "Scarica la versione X.Y.Z", link da copiare,
  "Pagina della versione" e come installare. Il link è il campo `url` del file; nei file vecchi senza `url`,
  `UPDATE_BASE_URL + file`. Le app 1.0.0 e 1.0.1 mostrano solo il pulsante "Scarica", ma usano già il campo `url`.
- Piattaforme: **Windows, macOS, Linux, Android** (`PLATFORMS` in `aggiornamenti.py`, stesso elenco in `Notifiche.tsx`).
  iPhone escluso: gli aggiornamenti passano da TestFlight / App Store. Ogni piattaforma legge solo il suo file.
- Windows, macOS e Linux: la richiesta la fa il motore Python; Android: `CapacitorHttp` (il motore Pyodide non ha rete). CORS non necessario.
- Confronto: versioni `MAJOR.MINOR.PATCH` numero per numero (`versione.newer`).

Ogni piattaforma ha il suo file e il suo installer: `versione-windows.json` → MSI, `versione-macos.json` → DMG,
`versione-linux.json` → AppImage, `versione-android.json` → APK. La pipeline (`packaging/scrivi_versione.py`) scrive:

```json
{
  "version": "1.0.2",
  "date": "2026-10-16",
  "titolo": "…",
  "file": "PDFz-1.0.2-x64.msi",
  "url": "https://github.com/akito996/pdfz/releases/download/v1.0.2/PDFz-1.0.2-x64.msi",
  "size": 136314880,
  "pagina": "https://github.com/akito996/pdfz/releases/tag/v1.0.2",
  "novita": [ { "tipo": "...", "piattaforme": [...], "dove": "...", "titolo": "...", "dettaglio": "..." } ]
}
```

- `url`: link **diretto** all'installer di **quella** versione (`releases/download/<tag>/<file>`): resta valido anche
  quando escono versioni nuove. Con la variabile `UPDATE_BASE_URL` impostata è quell'indirizzo + `file`.
- `size` (byte) e `pagina` servono al riquadro del download; le release fino alla 1.0.1 hanno solo `file`.

## Configurazione

Con il repository pubblico **non serve niente**: niente bucket, niente account cloud, niente chiavi. Basta pubblicare un tag
(vedi `build-e-test.md`).

Variabile facoltativa (repository → Settings → Secrets and variables → Actions → **Variables**):
- `UPDATE_BASE_URL` = un altro indirizzo pubblico, con la `/` finale (es. le release di un repository pubblico separato,
  `https://github.com/<utente>/<repository>/releases/latest/download/`). Attenzione: la pipeline pubblica solo nella
  Release di questo repository; se l'indirizzo è un altro, installer e `versione-*.json` vanno caricati lì.

L'indirizzo entra nell'app **al momento della build**: se lo si cambia, le app già installate continuano a guardare il
vecchio indirizzo finché non si installa a mano una versione compilata con quello nuovo.

Controllo veloce dopo una release (deve rispondere con il JSON della versione appena pubblicata):

```bash
curl -L https://github.com/akito996/pdfz/releases/latest/download/versione-windows.json
```

## Nota aperta

Le voci solo tecniche finiscono anche nella campanella degli utenti.
Proposta non ancora decisa: piattaforma `"build"` in `novita.json`, ignorata da campanella e `scrivi_versione.py`.
