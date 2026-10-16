# Installer e aggiornamenti

Aggiornato alla versione **1.0.0** (2026-10-16). File principali: `packaging\wix\Product.wxs`, `packaging\wix\Testi.it-IT.wxl`.

## Windows: come un PC capisce che c'è una versione precedente

Il riconoscimento lo fa **Windows Installer**, presente in ogni Windows, anche senza Intune, dominio o internet.
Funziona **allo stesso modo** su un PC gestito (Intune) e su un PC singolo.

1. Tutti gli MSI di PDFz hanno lo stesso **UpgradeCode** `9e97e063-fb59-42d0-938b-06f48a5082c6` (in `Product.wxs`),
   il "cognome" dell'app. **Non va mai cambiato.**
   È nuovo con PDFz (diverso da quello del vecchio programma da cui deriva): PDFz è un prodotto nuovo e si installa
   **accanto** a eventuali installazioni precedenti, senza sostituirle (vedi `decisioni.md`).
2. Alla prima installazione Windows Installer registra sul PC: app con quell'UpgradeCode, versione MSI `(100+MAJOR).MINOR.PATCH`.
3. Quando si lancia un MSI nuovo, l'azione `FindRelatedProducts` cerca sul PC un'app con lo stesso UpgradeCode:
   - versione nuova **più alta** → aggiornamento;
   - versione nuova **più bassa** → blocco: "È già installata una versione più recente di PDFz";
   - nessuna trovata → prima installazione.
4. Aggiornamento (`MajorUpgrade Schedule="afterInstallValidate"`): schermata "Trovata una versione già installata"
   (`HdUpgradeDlg`, con scelta Mantieni tutto / solo preferiti / pulita), poi disinstalla la vecchia e installa la nuova
   nella stessa finestra di avanzamento. Dati, preferiti e impostazioni restano (impostazioni anche in `impostazioni.json`).

Per questo la versione MSI deve **salire sempre**: 1.0.0 → MSI 101.0.0, 1.0.1 → 101.0.1, 1.1.0 → 101.1.0, 2.0.0 → 102.0.0.

Intune non fa niente di diverso: distribuisce l'MSI e lancia lo stesso `msiexec`.
Ciò che un PC non gestito **non** sa fare da solo è installare la versione nuova: l'app la segnala nella campanella
(vedi `avviso-nuova-versione.md`) e l'MSI si scarica dalla GitHub Release.

## "Tutti gli utenti" o "Solo per me"

Pacchetto a doppio uso (`Scope="perUserOrMachine"`, `ALLUSERS=2`, `MSIINSTALLPERUSER`).

| Situazione | Comportamento |
|---|---|
| Prima installazione con interfaccia | Schermata `HdScopeDlg`: predefinito **Tutti gli utenti** (`C:\Program Files\PDFz`, serve amministratore) |
| Prima installazione silenziosa `/qn` | **Tutti gli utenti**, salvo `HDSCOPE=user` (`%LOCALAPPDATA%\Programs`) |
| Aggiornamento | La domanda **non compare**: si resta nella scelta della prima installazione |

Come viene ricordata la scelta: l'installazione scrive `InstallScope` in `HKMU\Software\agjin\PDFz`
(HKMU = HKLM per tutti gli utenti, HKCU per "solo per me"). Il nuovo MSI legge `HKCU\...\InstallScope` (`HDPREVUSER`):
se vale `user`, `HDSCOPE` diventa `user`, altrimenti `machine`. `FindRelatedProducts` nella sequenza UI è spostata
dopo `HdCtxMachine`, cioè dopo aver deciso il contesto.
I pacchetti lingue (`PDFz-Lingue-<gruppo>-X.Y.Z-x64.msi`) si installano sempre per tutto il PC e si registrano in
`HKLM\Software\agjin\PDFz Lingue\<gruppo>` (l'app li trova da lì).

**Regola (decisa il 2026-10-05):** si installa sempre **per tutti gli utenti**; "solo per me" solo per chi
non ha i permessi da amministratore. Negli aggiornamenti **non** si passa `HDSCOPE`.

Limiti noti (creano una **doppia installazione**):
- aggiornare passando a mano un `HDSCOPE` diverso dalla prima installazione;
- aggiornare un'installazione "solo per me" con un **altro account** (la chiave HKCU è dell'utente che l'ha installata).
Possibile miglioria futura: ignorare `HDSCOPE` se c'è già una versione installata (modifica WiX, da provare su Windows).

## Comandi utili

```powershell
# installazione / aggiornamento con log (PowerShell come amministratore)
$msi = "C:\Percorso\PDFz-1.0.0-x64.msi"
$log = "$env:TEMP\pdfz-installazione.log"
Start-Process msiexec.exe -Wait -ArgumentList "/i `"$msi`" /qb /l*v `"$log`""
Select-String -Path $log -Pattern "FindRelatedProducts: Found application"   # = versione precedente trovata

# opzioni:  HDSCOPE=user (solo prima installazione)  DESKTOPSHORTCUT=0  HDCONTEXTMENU=0  HDSETUPMODE=keep|settings|clean
# disinstallazione:  msiexec /x PDFz-<ver>-x64.msi /qn

# cosa è installato (deve esserci una sola riga)
$chiavi = "HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*",
          "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*"
Get-ItemProperty $chiavi -ErrorAction SilentlyContinue |
  Where-Object DisplayName -like "PDFz*" |
  Select-Object DisplayName, DisplayVersion, @{n="Per";e={ if ($_.PSPath -like "*HKEY_CURRENT_USER*") {"solo questo utente"} else {"tutti gli utenti"} }}
```

## Intune

- App "Line-of-business" con l'MSI: se Intune porta una versione **più nuova** di quella installata a mano, la sostituisce
  (stesso UpgradeCode). Se ne porta una **più vecchia**, fallisce con "versione più recente già installata": caricare
  sempre l'ultima versione.

## Altre funzioni dell'installer

- `MSIFASTINSTALL=3`: calcolo spazio più veloce, niente punto di ripristino (la fase "calcolo spazio" resta, ridotta).
- Casella finale "Avvia PDFz" (custom action `LaunchApplication`).
- Menu tasto destro "PDFz" (escludibile con `HDCONTEXTMENU=0`).
- Editore (Manufacturer) `agjin`; copyright "© 2026 agjin".
- Testi delle fasi di avanzamento in `Testi.it-IT.wxl` (non duplicare `ProgressText` in `Product.wxs`).

## Android

L'APK nuovo si installa sopra il vecchio: Android riconosce l'app dal **nome del pacchetto** (`com.agjin.pdfz`) e dalla
**firma**, e accetta l'aggiornamento solo se `versionCode` è più alto (`1000000000 + MAJOR*1000000 + MINOR*1000 + PATCH`,
es. 1.0.0 → 1001000000).
Gli APK della pipeline di GitHub sono firmati sempre con la stessa chiave `pdfz-release.jks` (dell'autore, fuori dal
repository, vedi `build-e-test.md`). Se la firma cambia (es. APK di prova debug compilato su un altro PC) bisogna
disinstallare la vecchia prima. Chi ha un APK di prova lo disinstalla una volta, poi gli aggiornamenti si installano sopra.
Il nome del pacchetto è nuovo: PDFz si installa accanto all'app precedente, senza sostituirla.
