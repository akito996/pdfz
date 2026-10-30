# Documentazione tecnica — PDFz

Questa cartella raccoglie **come funziona** l'app, **perché** è fatta così e **cosa è già stato provato**.
Serve a ritrovare in fretta le informazioni senza rileggere vecchie chat.

> Regola: **a ogni modifica** (nuova versione `MAJOR.MINOR.PATCH`, es. 1.0.1) si aggiorna anche questa documentazione:
> il documento del tema toccato, il registro delle decisioni (se si è deciso qualcosa), se è stato risolto
> un errore il registro dei problemi e `CLAUDE.md` nella radice (stato attuale e punti aperti, letto da Claude a ogni sessione).

| Documento | Cosa trovi | Quando leggerlo |
|---|---|---|
| [build-e-test.md](build-e-test.md) | Build Windows/Android con "copia + build", pipeline GitHub a ogni tag, chiave di firma Android, test automatici, regole degli script | Prima di lanciare o modificare una build |
| [installer-e-aggiornamenti.md](installer-e-aggiornamenti.md) | Come l'MSI riconosce la versione precedente, "tutti gli utenti / solo per me", Intune, aggiornamenti su Android | Prima di installare/aggiornare su un PC o di distribuire |
| [avviso-nuova-versione.md](avviso-nuova-versione.md) | `versione-<piattaforma>.json`, controllo aggiornamenti dalle GitHub Releases, `UPDATE_BASE_URL` | Quando si pubblica una versione o l'avviso non compare |
| [macos-linux-iphone.md](macos-linux-iphone.md) | Build per Mac (DMG), Linux (AppImage, anche da Windows con WSL) e iPhone (Xcode), prerequisiti e limiti | Prima di compilare o installare su Mac, Linux o iPhone |
| [cloudflare-aggiornamenti.md](cloudflare-aggiornamenti.md) | Sito degli aggiornamenti su Cloudflare (Pages + R2) per il repository privato: come è fatto, cosa configurare, ordine del passaggio | Prima di rendere privato il repository o se il sito non si aggiorna |
| [web-app-iphone.md](web-app-iphone.md) | Web app per iPhone ("Aggiungi alla schermata Home"): installazione, limiti, build `build-web.mjs`, service worker, 3 strade per pubblicarla | Prima di pubblicare o provare la versione web, o se l'iPhone non aggiorna/salva |
| [facilita-uso.md](facilita-uso.md) | Schermata iniziale, modalità Semplice/Completa, guide 1-2-3, niente «Applica», parole semplici: come sono fatti e dove | Prima di toccare un pannello, la schermata iniziale o i nomi degli strumenti |
| [oggetti-applicati.md](oggetti-applicati.md) | Firme, timbri, testi, filigrane e numeri di pagina eliminabili (e spostabili) dopo "Applica": segno nel PDF, come si ritrovano e si tolgono, firme digitali, limiti | Prima di aggiungere uno strumento che scrive sulle pagine o se un oggetto non si elimina |
| [conversioni.md](conversioni.md) | Motori di conversione (Word, LibreOffice, pdf2docx…) e gestione dei file bloccati | Quando si tocca "Converti" o compare `PermissionError` |
| [branding.md](branding.md) | Marchio PDFz: icone, favicon, temi colore e come cambiarli | Prima di cambiare colori, logo, icone o aggiungere un tema |
| [decisioni.md](decisioni.md) | Registro delle decisioni (data, versione, opzioni valutate, scelta, motivo) | Prima di cambiare qualcosa "che sembra strano" |
| [problemi-risolti.md](problemi-risolti.md) | Errori incontrati: sintomo, causa, soluzione, cosa non rifare | Quando una build o un test fallisce |

Altri file utili nella radice del progetto: `README.md` (panoramica e comandi), `CHANGELOG.md` (novità per versione,
usate anche come note della GitHub Release), `frontend/src/novita.json` (novità mostrate nella campanella dell'app).

Ultimo aggiornamento: **1.6.2** — 2026-10-30 (sito degli aggiornamenti sul dominio dell'autore https://pdfz.agjin.com/).

**Flusso:** si modifica nel repository `C:\Dev\10_PDFz` (GitHub `akito996/pdfz`, ramo `main`); si compila con
`packaging\copia-e-build.ps1` (o `.sh`) nelle copie `C:\Build\PDFz-Windows`, `C:\Build\PDFz-Android`, `~/Build/PDFz-Linux`
(WSL), `~/Build/PDFz-macOS`, `~/Build/PDFz-iOS` (risultati in `...\dist`); si pubblica con un tag `X.Y.Z`.
