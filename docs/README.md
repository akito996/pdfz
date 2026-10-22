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
| [web-app-iphone.md](web-app-iphone.md) | Web app per iPhone ("Aggiungi alla schermata Home"): installazione, limiti, build `build-web.mjs`, service worker, 3 strade per pubblicarla | Prima di pubblicare o provare la versione web, o se l'iPhone non aggiorna/salva |
| [conversioni.md](conversioni.md) | Motori di conversione (Word, LibreOffice, pdf2docx…) e gestione dei file bloccati | Quando si tocca "Converti" o compare `PermissionError` |
| [branding.md](branding.md) | Marchio PDFz: icone, favicon, temi colore e come cambiarli | Prima di cambiare colori, logo, icone o aggiungere un tema |
| [decisioni.md](decisioni.md) | Registro delle decisioni (data, versione, opzioni valutate, scelta, motivo) | Prima di cambiare qualcosa "che sembra strano" |
| [problemi-risolti.md](problemi-risolti.md) | Errori incontrati: sintomo, causa, soluzione, cosa non rifare | Quando una build o un test fallisce |

Altri file utili nella radice del progetto: `README.md` (panoramica e comandi), `CHANGELOG.md` (novità per versione,
usate anche come note della GitHub Release), `frontend/src/novita.json` (novità mostrate nella campanella dell'app).

Ultimo aggiornamento: **1.3.0** — 2026-10-22 (icona 24, web app per iPhone unita, barra stretta).

**Flusso:** si modifica nel repository `C:\Dev\10_PDFz` (GitHub `akito996/pdfz`, ramo `main`); si compila con
`packaging\copia-e-build.ps1` (o `.sh`) nelle copie `C:\Build\PDFz-Windows`, `C:\Build\PDFz-Android`, `~/Build/PDFz-Linux`
(WSL), `~/Build/PDFz-macOS`, `~/Build/PDFz-iOS` (risultati in `...\dist`); si pubblica con un tag `X.Y.Z`.
