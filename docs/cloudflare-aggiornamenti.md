# Aggiornamenti su Cloudflare (repository privato)

Preparato il 2026-10-22. L'autore vuole rendere **privato** il repository `akito996/pdfz`. Con il repository privato le
GitHub Releases non si scaricano più senza accesso: le app non vedrebbero le nuove versioni e i link di download non
funzionerebbero. Per questo installer, file di versione e web app per iPhone passano su **Cloudflare**, gratuito.

## Come è fatto

```
tag vX.Y.Z ─► release.yml (GitHub Actions): compila MSI, DMG, AppImage, APK ─► GitHub Release (privata)
                       │ al termine
                       ▼
               cloudflare.yml: prende gli installer dalla release
                 ├─► archivio R2 "pdfz-installer":  vX.Y.Z/PDFz-…  (installer e codice sorgente, ultime 5 versioni)
                 └─► Cloudflare Pages "pdfz":        https://pdfz.pages.dev/
                        /                         pagina degli aggiornamenti (packaging/sito_aggiornamenti.py)
                        /versione-<sistema>.json  avviso di nuova versione letto dalle app
                        /download/vX.Y.Z/<file>   installer da R2 (cloudflare/functions/download, anche ripresa)
                        /app/                     web app per iPhone (mobile/scripts/build-web.mjs)
```

- Gli installer (fino a 175 MB) non stanno nelle Pages, che accettano file fino a 25 MB: stanno nell'archivio **R2** e
  li serve una piccola funzione, così l'indirizzo resta quello del sito (niente indirizzi `r2.dev`).
- Le app cercano gli aggiornamenti in `UPDATE_BASE_URL` (variabile del repository, scritta nell'app a ogni build):
  dal passaggio sarà `https://pdfz.pages.dev/` (o l'indirizzo che Cloudflare assegna al progetto).
- **Licenza AGPL**: chi distribuisce l'app deve rendere disponibile il codice sorgente. Con il repository privato lo fa
  il sito: per ogni versione c'è `PDFz-X.Y.Z-sorgente.zip` (`git archive` del tag), con il link nella pagina.
- Spazio: circa 530 MB per versione; R2 gratuito arriva a 10 GB, il flusso tiene le **ultime 5 versioni**.
  Limiti gratuiti adatti: Pages 500 pubblicazioni al mese e 20.000 file; funzioni 100.000 richieste al giorno.

## Tre strade

- 💎 **Prestazione: dominio proprio** (es. `pdfz.<dominio>`, 10-15 €/anno) collegato al progetto Pages: l'indirizzo non
  cambia mai, anche se un giorno si cambia servizio. Va deciso **prima** del passaggio (le app tengono l'indirizzo).
- ⚖️ **Qualità/Prezzo: Cloudflare Pages + R2 gratuiti** con l'indirizzo `https://<progetto>.pages.dev/`. **Scelta.**
- 🆓 **Economica: secondo repository pubblico** solo per i download (`pdfz-download`) e il sorgente privato: niente
  Cloudflare, ma due repository da tenere allineati.

## Cosa fa l'autore (una volta)

Le password e i token li inserisce solo l'autore: non passano dalla chat.

1. **Account Cloudflare** (gratuito) su https://dash.cloudflare.com.
2. **R2** → attivare il servizio (Cloudflare può chiedere un metodo di pagamento anche restando nei limiti gratuiti) →
   *Create bucket* con nome `pdfz-installer`.
3. **Token API**: My Profile → API Tokens → *Create Token* → *Custom token* con i permessi
   **Account · Cloudflare Pages · Edit** e **Account · Workers R2 Storage · Edit**. Copiare il token e l'**Account ID**
   (si trova nella pagina principale del pannello, a destra).
4. **GitHub** → `akito996/pdfz` → Settings → Secrets and variables → Actions:
   - *Secrets*: `CLOUDFLARE_API_TOKEN` (il token) e `CLOUDFLARE_ACCOUNT_ID`;
   - *Variables*: `CLOUDFLARE_PAGES` = `true` e `UPDATE_BASE_URL` = `https://pdfz.pages.dev/` (con la `/` finale;
     se il nome `pdfz` è già preso su pages.dev, si usa quello che Cloudflare assegna, vedi passo 6).
5. Il progetto Pages `pdfz` lo crea il flusso alla prima pubblicazione (oppure a mano: Workers & Pages → Create →
   Pages → *Direct Upload* → nome `pdfz`).
6. Prima prova: Actions → "Sito aggiornamenti (Cloudflare)" → *Run workflow* con il tag `v1.3.0`. Alla fine si apre
   l'indirizzo scritto nel registro e si controlla la pagina; se l'indirizzo è diverso da `UPDATE_BASE_URL`, si corregge
   la variabile e si rilancia.

## Il passaggio, in ordine

1. Configurazione qui sopra e prima prova riuscita.
2. **Versione ponte** (la prossima, dopo la configurazione): compilata con `UPDATE_BASE_URL` = sito Cloudflare. Esce
   sia nella GitHub Release (ancora pubblica, così le app fino alla 1.3.0 la vedono e la scaricano da GitHub) sia sul sito.
3. Si installa la versione ponte su tutti i PC e telefoni in uso.
4. **Solo allora** l'autore rende privato il repository (Settings → General → Danger Zone → *Change visibility*).
   Da quel momento le app trovano gli aggiornamenti solo sul sito; un'app ancora alla 1.3.0 o precedente non vede più
   niente e va aggiornata a mano dal sito.

## File

| File | A cosa serve |
|---|---|
| `.github/workflows/cloudflare.yml` | dopo ogni release: installer in R2, pulizia (ultime 5), web app, pagina, pubblicazione su Pages |
| `packaging/sito_aggiornamenti.py` | scrive la pagina, i `versione-*.json` (con `scrivi_versione.py`) e `_headers` |
| `cloudflare/functions/download/[[percorso]].js` | `GET/HEAD /download/vX.Y.Z/<file>` dall'archivio R2, con ripresa (Range) |
| `cloudflare/wrangler.toml` | scritto dal flusso a ogni pubblicazione (progetto, cartella del sito, archivio R2) |

## Provato e non provato

Provato il 2026-10-22 sul PC: pagina generata con installer finti (schede per sistema, "il tuo sistema", novità,
versioni precedenti, link al sorgente) e servita in locale con la web app in `/app/` (manifest giusto); file di versione
con i link `https://pdfz.pages.dev/download/v1.3.0/…`; funzione dei download con un archivio R2 simulato (file intero,
richiesta parziale 206, HEAD, percorsi non ammessi rifiutati); YAML dei flussi valido.
**Non provato**: la pubblicazione vera su Cloudflare (servono account, archivio e token dell'autore).
