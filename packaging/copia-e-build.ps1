<#
.SYNOPSIS
  Copia il progetto in C:\Build e lancia la build da li' (Windows, Android o entrambe).

.DESCRIPTION
  Il progetto si MODIFICA nella cartella del repository (la radice sopra packaging\, es. C:\Dev\10_PDFz)
  ma si COMPILA in una copia a parte (i percorsi con "&" o dentro OneDrive bloccano la build):
    C:\Build\PDFz-Windows   build Windows  (risultati in ...\dist)
    C:\Build\PDFz-Android   build Android  (risultati in ...\dist)
    C:\Build\PDFz-Linux     build Linux (AppImage) fatta in WSL: copia e compilazione dentro Ubuntu
                            (~/Build/PDFz-Linux), qui arrivano solo i risultati (...\dist)
  macOS e iPhone si compilano solo su un Mac:  ./packaging/copia-e-build.sh macos | ios

  La copia e' uno "specchio" (robocopy /MIR) del codice: ogni volta copia solo i file cambiati e toglie quelli
  cancellati nel progetto. NON tocca (e non copia) le cartelle che la build crea o scarica da sola, che cosi' restano
  nella copia fra una build e l'altra (build piu' veloci): .venv, node_modules, dist, build, www, .gradle, ...
  vendor (OCR, lingue) e mobile\cache (motore Pyodide) si copiano senza mai cancellare niente nella copia.

.EXAMPLE
  .\packaging\copia-e-build.ps1 -Piattaforma windows
  .\packaging\copia-e-build.ps1 -Piattaforma android
  .\packaging\copia-e-build.ps1 -Piattaforma linux        (serve WSL con Ubuntu, vedi docs\macos-linux-iphone.md)
  .\packaging\copia-e-build.ps1 -Piattaforma tutte -SkipTests   (Windows, Android e, se c'e' WSL, Linux)
#>
param(
  [ValidateSet("windows", "android", "linux", "tutte")][string]$Piattaforma = "windows",
  [string]$Base = "C:\Build",
  # opzioni passate a build-windows.ps1
  [switch]$SkipTests,
  [switch]$OnlyMsi,
  [switch]$WithGhostscript,
  # opzione passata a build-android.ps1
  [switch]$Open,
  # solo copia, senza build
  [switch]$SoloCopia
)
$ErrorActionPreference = "Stop"
$Source = Split-Path -Parent $PSScriptRoot
function Step($m) { Write-Host "`n==> $m" -ForegroundColor Cyan }

# cartelle che la build crea/scarica da sola: non si copiano e nella copia non si cancellano
$skipDirs = @(".venv", "node_modules", "dist", "build", "www", ".gradle", ".kotlin", "__pycache__", ".pytest_cache",
              "_work", "_data", "Claude outputs", "vendor", "cache")
$skipFiles = @("*.pyc", "tsconfig.tsbuildinfo")

function Copy-Project([string]$dest) {
  Step "Copia del progetto in $dest"
  try { New-Item -ItemType Directory -Force -Path $dest -ErrorAction Stop | Out-Null }
  catch { throw "Non riesco a creare $dest ($($_.Exception.Message)). Crea C:\Build a mano (PowerShell da amministratore: New-Item C:\Build -ItemType Directory)." }
  # robocopy e' un .exe (non passa da cmd.exe): la "&" del percorso non da' problemi
  $common = @("/R:2", "/W:2", "/NFL", "/NDL", "/NP", "/NJH", "/XJ")
  & robocopy.exe $Source $dest /MIR /XD @skipDirs /XF @skipFiles @common | Out-Host
  if ($LASTEXITCODE -ge 8) { throw "Copia del progetto non riuscita (robocopy codice $LASTEXITCODE)" }
  # file scaricati una volta (OCR, lingue, motore Pyodide): si aggiungono senza mai cancellare nella copia
  foreach ($sub in @("vendor", "mobile\cache")) {
    $from = Join-Path $Source $sub
    if (Test-Path $from) {
      & robocopy.exe $from (Join-Path $dest $sub) /E /XO @common | Out-Host
      if ($LASTEXITCODE -ge 8) { throw "Copia di $sub non riuscita (robocopy codice $LASTEXITCODE)" }
    }
  }
  $global:LASTEXITCODE = 0
  Write-Host "  copia aggiornata: $dest" -ForegroundColor Green
}

function Test-Wsl {
  if (-not (Get-Command wsl.exe -ErrorAction SilentlyContinue)) { return $false }
  & wsl.exe -e true 2>$null | Out-Null
  return ($LASTEXITCODE -eq 0)
}
function Build-LinuxInWsl {
  # Linux si compila dentro WSL (Ubuntu): la copia sta nel disco di Linux (~/Build/PDFz-Linux, veloce e senza
  # OneDrive); i risultati (AppImage) vengono copiati in C:\Build\PDFz-Linux\dist.
  if (-not (Test-Wsl)) {
    $msg = "WSL non disponibile: per la build Linux installa Ubuntu una volta (PowerShell da amministratore):  wsl --install -d Ubuntu-24.04   poi riavvia. Dettagli in docs\macos-linux-iphone.md"
    if ($Piattaforma -eq "tutte") { Write-Warning $msg; return } else { throw $msg }
  }
  $out = Join-Path $Base "PDFz-Linux\dist"
  New-Item -ItemType Directory -Force -Path $out | Out-Null
  Step "Linux in WSL (copia in ~/Build/PDFz-Linux, risultati in $out)"
  $oldWslEnv = $env:WSLENV
  $env:HDPDF_RISULTATI = $out
  $env:SKIP_TESTS = $(if ($SkipTests) { "1" } else { "0" })
  $env:SOLO_COPIA = $(if ($SoloCopia) { "1" } else { "0" })
  # /p = il percorso Windows diventa /mnt/c/...; le altre variabili passano cosi' come sono
  $env:WSLENV = (@("HDPDF_RISULTATI/p", "SKIP_TESTS", "SOLO_COPIA") + @($oldWslEnv -split ":" | Where-Object { $_ })) -join ":"
  try {
    # lo script viene prima ripulito dagli "a capo" di Windows (CRLF), poi lanciato con la cartella del progetto come sorgente
    $cmd = 'perl -pe ''s/\r$//'' packaging/copia-e-build.sh > /tmp/hdpdf-copia-e-build.sh && HDPDF_SORGENTE=$PWD bash /tmp/hdpdf-copia-e-build.sh linux'
    & wsl.exe --cd $Source -e bash -c $cmd
    if ($LASTEXITCODE) { throw "Build Linux (WSL) non riuscita (codice $LASTEXITCODE)" }
  } finally {
    $env:WSLENV = $oldWslEnv
    Remove-Item Env:HDPDF_RISULTATI, Env:SKIP_TESTS, Env:SOLO_COPIA -ErrorAction SilentlyContinue
  }
  Write-Host "Risultati: $out" -ForegroundColor Green
}

$todo = if ($Piattaforma -eq "tutte") { @("windows", "android", "linux") } else { @($Piattaforma) }
foreach ($p in $todo) {
  if ($p -eq "linux") { Build-LinuxInWsl; continue }
  $dest = Join-Path $Base ("PDFz-" + $(if ($p -eq "windows") { "Windows" } else { "Android" }))
  Copy-Project $dest
  if ($SoloCopia) { continue }
  Push-Location $dest
  try {
    if ($p -eq "windows") {
      $opt = @{}
      if ($SkipTests) { $opt.SkipTests = $true }
      if ($OnlyMsi) { $opt.OnlyMsi = $true }
      if ($WithGhostscript) { $opt.WithGhostscript = $true }
      & (Join-Path $dest "packaging\build-windows.ps1") @opt
    } else {
      $opt = @{}
      if ($Open) { $opt.Open = $true }
      & (Join-Path $dest "packaging\build-android.ps1") @opt
    }
  } finally { Pop-Location }
  Write-Host "Risultati: $(Join-Path $dest 'dist')" -ForegroundColor Green
}
