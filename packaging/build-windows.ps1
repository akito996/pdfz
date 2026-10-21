<#
.SYNOPSIS
  Compila PDFz e produce l'installer MSI.

.DESCRIPTION
  Da eseguire su un PC Windows 10/11 x64 con:
    - Python 3.11 o 3.12 (64 bit)        https://www.python.org/downloads/windows/
    - Node.js 20 LTS o superiore          https://nodejs.org/
    - .NET SDK 8 (per WiX Toolset v5)     https://dotnet.microsoft.com/download
  Lo script scarica da solo i file lingua per l'OCR e (facoltativo) Ghostscript.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File packaging\build-windows.ps1
  powershell -ExecutionPolicy Bypass -File packaging\build-windows.ps1 -WithGhostscript
  Di norma NON si lancia direttamente: packaging\copia-e-build.ps1 copia il progetto in C:\Build\PDFz-Windows
  e lancia questo script dalla copia. Risultati in <cartella della build>\dist (cambiabile con -OutDir).
#>
param(
  # vuoto = la versione scritta in backend\hdpdf\__init__.py (unica fonte del numero), formato MAJOR.MINOR.PATCH es. 1.0.0
  [string]$Version = "",
  [string[]]$OcrLanguages = @("ita", "eng", "fra", "deu", "spa"),
  [switch]$WithGhostscript,
  [string]$GhostscriptVersion = "10.05.1",
  [switch]$SkipTests,
  [switch]$OnlyMsi,  # rifa solo l'MSI usando l'app gia' compilata in <OutDir>\PDFz
  # cartella dei risultati (MSI, app compilata, versione-windows.json); vuoto = <cartella della build>\dist
  [string]$OutDir = ""
)

$ErrorActionPreference = "Stop"
$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $Root
function Step($msg) { Write-Host "`n==> $msg" -ForegroundColor Cyan }
# La build va fatta sulla COPIA in C:\Build (packaging\copia-e-build.ps1): con percorsi con "&" o dentro OneDrive
# la build si blocca (EBUSY, Accesso negato, cmd.exe).
if ("$Root" -match 'OneDrive' -or "$Root" -match '&') {
  Write-Warning "Stai compilando dentro $Root. Usa la copia in C:\Build:  .\packaging\copia-e-build.ps1 -Piattaforma windows"
}
# cartelle (con copia-e-build.ps1: C:\Build\PDFz-Windows\...):
#   dist\                MSI, versione-windows.json
#   dist\PDFz\           l'app compilata da PyInstaller (sorgente dell'MSI)
#   build\               file di lavoro (PyInstaller, test): si possono cancellare quando si vuole
if (-not $OutDir) { $OutDir = Join-Path $Root "dist" }
try { New-Item -ItemType Directory -Force -Path $OutDir -ErrorAction Stop | Out-Null }
catch { throw "Non riesco a creare $OutDir ($($_.Exception.Message)). Creala a mano o usa -OutDir con un'altra cartella." }
$OutDir = (Resolve-Path $OutDir).Path
$AppDir = Join-Path $OutDir "PDFz"
$WorkDir = Join-Path $Root "build"
New-Item -ItemType Directory -Force -Path $WorkDir | Out-Null
# numero di versione: unica fonte backend\hdpdf\__init__.py (con -Version lo si cambia li')
if ($Version) {
  (Get-Content backend\hdpdf\__init__.py) -replace '__version__ = ".*"', "__version__ = `"$Version`"" | Set-Content backend\hdpdf\__init__.py
} else {
  $Version = (Select-String -Path backend\hdpdf\__init__.py -Pattern '__version__ = "(.*)"').Matches[0].Groups[1].Value
}
# MAJOR.MINOR.PATCH -> numero MSI (100+MAJOR).MINOR.PATCH: deve restare piu' alto delle vecchie versioni AAAAMM.NNN
# (MSI 26.10.N), altrimenti Windows rifiuta l'aggiornamento; il primo numero deve stare sotto 256 (regola in versione.py)
if ($Version -notmatch '^(\d+)\.(\d+)\.(\d+)$') { throw "Versione '$Version' non valida: usa il formato MAJOR.MINOR.PATCH (es. 1.0.0)" }
$vMaj = [int]$Matches[1]; $vMin = [int]$Matches[2]; $vPat = [int]$Matches[3]
if ($vMaj -gt 155 -or $vMin -gt 255 -or $vPat -gt 999) { throw "Versione '$Version' fuori dai limiti (MAJOR fino a 155, MINOR fino a 255, PATCH fino a 999)" }
$MsiVersion = "$(100 + $vMaj).$vMin.$vPat"

Step "Controllo prerequisiti"
foreach ($cmd in @("python", "node", "npm", "dotnet")) {
  if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) { throw "Manca '$cmd' nel PATH. Vedi le istruzioni in cima allo script." }
}
python --version; node --version
# "dotnet" puo' esistere solo come runtime: per WiX serve l'SDK
$sdks = (dotnet --list-sdks 2>$null) | Out-String
if (-not $sdks.Trim()) {
  throw "Manca il .NET SDK (c'e' solo il runtime). Installalo con:`n  winget install Microsoft.DotNet.SDK.8`npoi chiudi e riapri PowerShell e rilancia lo script (con -OnlyMsi se l'eseguibile e' gia' stato creato)."
}
Write-Host ".NET SDK: $($sdks.Trim())"

if ($OnlyMsi) {
  if (-not (Test-Path (Join-Path $AppDir "PDFz.exe"))) { throw "$AppDir non trovato: lancia lo script senza -OnlyMsi." }
} else {

Step "Ambiente Python"
if (-not (Test-Path ".venv")) { python -m venv .venv }
$py = Join-Path $Root ".venv\Scripts\python.exe"
& $py -m pip install --upgrade pip wheel | Out-Null
& $py -m pip install -r backend\requirements-dev.txt
if ($LASTEXITCODE) { throw "Installazione dipendenze Python non riuscita" }
# OpenCV: all'app serve solo la versione "headless" (senza finestre). Se qualche libreria ha installato anche
# quella completa, le due si mescolano e nell'app finiscono librerie doppie (Qt, ~20 MB): si tiene solo la headless.
# (si usa "pip list", che esce sempre con codice 0: "pip show" di un pacchetto assente esce con errore)
$pacchetti = (& $py -m pip list --format=freeze --disable-pip-version-check) -join "`n"
if ($pacchetti -match '(?im)^opencv-python==') {
  Write-Host "  OpenCV completo trovato: lo sostituisco con la versione headless"
  & $py -m pip uninstall -y opencv-python | Out-Null
  & $py -m pip install --force-reinstall --no-deps "opencv-python-headless>=4.8,<5" | Out-Null
  if ($LASTEXITCODE) { throw "Reinstallazione di opencv-python-headless non riuscita" }
}

# --- strumenti Node/Gradle senza cmd.exe -----------------------------------------------------------------------
# Con percorsi con "&" o dentro OneDrive cmd.exe crea problemi: per cmd.exe "&" vuol dire "nuovo comando", quindi gli
# script npm (npm run …, postinstall delle librerie) e i file .cmd/.bat (tsc.cmd, vite.cmd, gradlew.bat) si rompono
# ("... non e' riconosciuto come comando"). Qui si lancia tutto direttamente con node.exe / java.exe da PowerShell.
function Stop-ProjectLocks {
  # esbuild (usato da Vite) a volte resta aperto e blocca node_modules (EBUSY); PDFz.exe avviato dalla cartella
  # dei risultati blocca l'app compilata. Si chiudono solo i processi del progetto e di $OutDir (non l'app installata).
  Get-Process -Name esbuild, PDFz -ErrorAction SilentlyContinue |
    Where-Object { $_.Path -and ($_.Path.StartsWith("$Root", [StringComparison]::OrdinalIgnoreCase) -or
                                 $_.Path.StartsWith($OutDir, [StringComparison]::OrdinalIgnoreCase)) } |
    Stop-Process -Force -ErrorAction SilentlyContinue
}
function Remove-DirRobust([string]$dir, [int]$Tries = 5) {
  # Cancella una cartella anche se OneDrive/antivirus la tengono occupata per qualche secondo.
  # Toglie l'attributo "sola lettura" e riprova; restituisce $true se alla fine la cartella non c'e' piu'.
  for ($i = 1; $i -le $Tries; $i++) {
    if (-not (Test-Path -LiteralPath $dir)) { return $true }
    Get-ChildItem -LiteralPath $dir -Recurse -Force -ErrorAction SilentlyContinue |
      Where-Object { $_.Attributes -band [IO.FileAttributes]::ReadOnly } |
      ForEach-Object { $_.Attributes = $_.Attributes -band -bnot [IO.FileAttributes]::ReadOnly }
    Remove-Item -LiteralPath $dir -Recurse -Force -ErrorAction SilentlyContinue
    if (-not (Test-Path -LiteralPath $dir)) { return $true }
    if ($i -lt $Tries) { Start-Sleep -Seconds 2 }
  }
  return $false
}
function Install-NodeModules([string]$dir) {
  Push-Location $dir
  try {
    # --ignore-scripts: niente script delle librerie via cmd.exe (servirebbe solo quello di esbuild, lanciato sotto)
    if (Test-Path node_modules) { npm install --ignore-scripts --no-audit --no-fund }
    else { npm ci --ignore-scripts --no-audit --no-fund }
    if ($LASTEXITCODE) { throw "Installazione delle librerie in $dir non riuscita" }
    if (Test-Path node_modules\esbuild\install.js) {
      node node_modules\esbuild\install.js
      if ($LASTEXITCODE) { throw "Preparazione di esbuild in $dir non riuscita" }
    }
  } finally { Pop-Location }
}
function Invoke-Node([string]$what) {
  & node @args
  if ($LASTEXITCODE) { throw "$what non riuscito (codice $LASTEXITCODE)" }
}

if (-not $SkipTests) {
  Step "Test automatici"
  Push-Location backend
  # cartella temporanea dei test dentro il progetto: in %TEMP%\pytest-of-<utente> Windows puo' negare l'accesso
  # al collegamento "pytest-current" (resti di un'esecuzione come amministratore, antivirus, OneDrive)
  $testTmp = Join-Path $WorkDir "pytest-tmp"
  if (Test-Path $testTmp) { Remove-Item -Recurse -Force $testTmp -ErrorAction SilentlyContinue }
  # pytest crea solo l'ultima cartella (pytest-tmp), non quelle sopra: se "build" non esiste ancora
  # (progetto appena copiato o cartella build cancellata) tutti i test con file temporanei vanno in errore
  New-Item -ItemType Directory -Force -Path (Split-Path $testTmp) | Out-Null
  & $py -m pytest -q -p no:cacheprovider --basetemp "$testTmp"
  if ($LASTEXITCODE) { Pop-Location; throw "Test falliti: build interrotta" }
  Pop-Location
}

Step "Interfaccia (frontend)"
Stop-ProjectLocks
Install-NodeModules "frontend"
Push-Location frontend
try {
  Invoke-Node "Controllo TypeScript" node_modules\typescript\bin\tsc -b
  Invoke-Node "Build frontend (Vite)" node_modules\vite\bin\vite.js build
} finally { Pop-Location }

Step "Dati OCR (tessdata_fast)"
$tess = Join-Path $Root "vendor\tessdata"
New-Item -ItemType Directory -Force -Path $tess | Out-Null
foreach ($lang in ($OcrLanguages + "osd")) {
  $dest = Join-Path $tess "$lang.traineddata"
  if (-not (Test-Path $dest)) {
    Write-Host "  scarico $lang"
    Invoke-WebRequest -UseBasicParsing -Uri "https://github.com/tesseract-ocr/tessdata_fast/raw/main/$lang.traineddata" -OutFile $dest
  }
}

if ($WithGhostscript) {
  Step "Ghostscript $GhostscriptVersion (compressione avanzata e PDF/A)"
  $gsDir = Join-Path $Root "vendor\ghostscript"
  if (-not (Test-Path (Join-Path $gsDir "bin\gswin64c.exe"))) {
    $v = $GhostscriptVersion.Replace(".", "")
    $url = "https://github.com/ArtifexSoftware/ghostpdl-downloads/releases/download/gs$v/gs${v}w64.exe"
    $inst = Join-Path $env:TEMP "gs-setup.exe"
    Invoke-WebRequest -UseBasicParsing -Uri $url -OutFile $inst
    $tmp = Join-Path $env:TEMP "gs-hdpdf"
    Start-Process -Wait -FilePath $inst -ArgumentList "/S", "/D=$tmp"
    New-Item -ItemType Directory -Force -Path $gsDir | Out-Null
    Copy-Item -Recurse -Force "$tmp\bin", "$tmp\lib", "$tmp\Resource" $gsDir -ErrorAction SilentlyContinue
    Start-Process -Wait -FilePath "$tmp\uninstgs.exe" -ArgumentList "/S" -ErrorAction SilentlyContinue
  }
}

Step "Numero di versione: $Version (installer $MsiVersion)"
$parts = "$vMaj, $vMin, $vPat, 0"
(Get-Content packaging\version_info.txt) -replace '\(\d+, \d+, \d+, \d+\)', "($parts)" `
  -replace "StringStruct\('FileVersion', '[^']*'\)", "StringStruct('FileVersion', '$Version')" `
  -replace "StringStruct\('ProductVersion', '[^']*'\)", "StringStruct('ProductVersion', '$Version')" | Set-Content packaging\version_info.txt

# Ghostscript: nell'app va solo la cartella bin (i file di avvio sono gia' dentro gsdll64.dll).
# Prova in una cartella separata che compressione e PDF/A funzionino davvero solo con bin;
# se non funzionano, si include Ghostscript completo come prima (piu' file, installazione piu' lenta).
$env:HDPDF_GS_FULL = "0"
$gsBin = Join-Path $Root "vendor\ghostscript\bin"
if (Test-Path (Join-Path $gsBin "gswin64c.exe")) {
  Step "Prova di Ghostscript con la sola cartella bin"
  $probe = Join-Path $env:TEMP "hdpdf-gs-prova"
  Remove-Item -Recurse -Force $probe -ErrorAction SilentlyContinue
  New-Item -ItemType Directory -Force -Path $probe | Out-Null
  Copy-Item -Recurse $gsBin (Join-Path $probe "bin")
  $gsx = Join-Path $probe "bin\gswin64c.exe"
  $ok = $true
  & $gsx -q -dBATCH -dNOPAUSE -dSAFER -sDEVICE=pdfwrite "-sOutputFile=$probe\a.pdf" -c "/Helvetica findfont 20 scalefont setfont 72 720 moveto (Prova PDFz) show showpage" 2>&1 | Out-Null
  if ($LASTEXITCODE -or -not (Test-Path "$probe\a.pdf")) { $ok = $false }
  if ($ok) {
    & $gsx -q -dBATCH -dNOPAUSE -sDEVICE=pdfwrite -dPDFSETTINGS=/ebook "-sOutputFile=$probe\b.pdf" "$probe\a.pdf" 2>&1 | Out-Null
    if ($LASTEXITCODE -or -not (Test-Path "$probe\b.pdf")) { $ok = $false }
  }
  if ($ok) {
    & $gsx -q -dBATCH -dNOPAUSE -dPDFA=2 -sDEVICE=pdfwrite -sColorConversionStrategy=RGB -dPDFACompatibilityPolicy=1 "-sOutputFile=$probe\c.pdf" "$probe\a.pdf" 2>&1 | Out-Null
    if ($LASTEXITCODE -or -not (Test-Path "$probe\c.pdf")) { $ok = $false }
  }
  Remove-Item -Recurse -Force $probe -ErrorAction SilentlyContinue
  if ($ok) { Write-Host "  OK: nell'app va solo Ghostscript\bin" -ForegroundColor Green }
  else {
    Write-Warning "  Ghostscript ha bisogno dei suoi file di supporto: lo includo completo."
    $env:HDPDF_GS_FULL = "1"
  }
}

Step "Eseguibile (PyInstaller)"
# Cartella di lavoro di PyInstaller: build\pyinstaller della copia in C:\Build. In OneDrive, con --clean PyInstaller
# cancella e ricrea migliaia di file e OneDrive li bloccava -> "PermissionError [WinError 5] Accesso negato" (202610.010).
$pyiWork = Join-Path $WorkDir "pyinstaller"
if (-not (Remove-DirRobust $pyiWork)) {
  # qualcosa la tiene ancora bloccata: si usa una cartella nuova invece di fermare la build
  $pyiWork = Join-Path $WorkDir ("pyinstaller-" + (Get-Date -Format "yyyyMMdd-HHmmss"))
  Write-Warning "  Cartella di lavoro PyInstaller bloccata: uso $pyiWork"
}
New-Item -ItemType Directory -Force -Path $pyiWork | Out-Null
# l'app compilata: se e' aperta o bloccata PyInstaller non riesce a sostituirla
Stop-ProjectLocks
if (-not (Remove-DirRobust $AppDir)) {
  throw "$AppDir e' bloccata (app PDFz aperta da quella cartella o Esplora risorse): chiudila e rilancia."
}
& $py -m PyInstaller packaging\hdpdf.spec --noconfirm --clean --distpath $OutDir --workpath $pyiWork
if ($LASTEXITCODE) { throw "PyInstaller non riuscito" }

}  # fine blocco saltato con -OnlyMsi

# un file MSI non puo' superare 2 GB
$appMb = [math]::Round(((Get-ChildItem $AppDir -Recurse -File | Measure-Object Length -Sum).Sum / 1MB))
Write-Host "Dimensione dell'applicazione: $appMb MB"
if ($appMb -gt 1900) {
  throw "L'applicazione supera 1,9 GB e non entra in un MSI: controlla cosa e' finito in $AppDir."
}

Step "Installer MSI (WiX v5)"
# un SDK appena installato (o una configurazione gestita dall'IT) puo' non avere nuget.org attivo
$sources = (dotnet nuget list source 2>$null) | Out-String
if ($sources -notmatch "api\.nuget\.org") {
  dotnet nuget add source "https://api.nuget.org/v3/index.json" --name nuget.org
} elseif ($sources -match "nuget\.org \[(Disabilit|Disabled)") {
  dotnet nuget enable source nuget.org
}
$env:PATH += ";$env:USERPROFILE\.dotnet\tools"
if (-not (Get-Command wix -ErrorAction SilentlyContinue)) {
  dotnet tool install --global wix --version 5.0.2 --add-source "https://api.nuget.org/v3/index.json"
  if ($LASTEXITCODE) { throw "Installazione di WiX non riuscita (dotnet tool install)." }
}
wix extension add -g WixToolset.UI.wixext/5.0.2
wix extension add -g WixToolset.Util.wixext/5.0.2   # avvio dell'app a fine installazione
if ($LASTEXITCODE) { throw "Installazione dell'estensione WiX UI non riuscita." }
$msi = Join-Path $OutDir "PDFz-$Version-x64.msi"
Push-Location packaging\wix
wix build Product.wxs -loc Testi.it-IT.wxl -ext WixToolset.UI.wixext -ext WixToolset.Util.wixext -culture it-IT -arch x64 -d "Version=$MsiVersion" -d "DisplayVersion=$Version" -bindpath "App=$AppDir" -o $msi
$code = $LASTEXITCODE
Pop-Location
if ($code) { throw "WiX non riuscito" }

Step "Fatto"
# file per l'avviso di nuova versione: se non riesce l'MSI resta valido, quindi solo un avviso
try { & (Join-Path $PSScriptRoot "scrivi-versione.ps1") -Piattaforma windows -File (Split-Path $msi -Leaf) -Root $Root -OutDir $OutDir }
catch { Write-Warning "versione-windows.json non creato: $($_.Exception.Message)" }
Write-Host ("Installer: $msi  ({0:N0} MB)" -f ((Get-Item $msi).Length / 1MB)) -ForegroundColor Green
Write-Host "Installazione silenziosa:  msiexec /i `"$msi`" /qn DESKTOPSHORTCUT=0"
Write-Host "Solo per l'utente corrente (senza amministratore):  msiexec /i `"$msi`" /qn HDSCOPE=user"
Write-Host "Cartella dei risultati: $OutDir" -ForegroundColor Green
