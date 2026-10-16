<#
  PDFz - build dell'app Android (APK) su Windows.

  Prerequisiti (una volta sola):
    1. Android Studio:  https://developer.android.com/studio  (installa anche Java e l'Android SDK)
       Al primo avvio lascia completare il "Setup Wizard" (scarica l'SDK).
    2. Node.js 20 o piu' recente:  https://nodejs.org

  Uso (PowerShell, dalla cartella del progetto):
    .\packaging\build-android.ps1            APK installabile a mano: firmato con la chiave di firma di PDFz se ci sono
                                             le variabili HDPDF_KEYSTORE* (vedi sotto), altrimenti APK di prova (debug)
    .\packaging\build-android.ps1 -Open      apre il progetto in Android Studio (per la versione firmata / Play Store)

  Di norma NON si lancia direttamente: packaging\copia-e-build.ps1 -Piattaforma android copia il progetto in
  C:\Build\PDFz-Android e lancia questo script dalla copia.
  Risultato: <cartella della build>\dist\PDFz-<versione>-android.apk (+ versione-android.json), cambiabile con -OutDir.

  Chiave di firma di PDFz (la usa la pipeline di GitHub). Serve sempre la stessa chiave: con un'altra firma i telefoni
  rifiutano l'aggiornamento e bisogna disinstallare l'app.
    $env:HDPDF_KEYSTORE = "C:\percorso\pdfz-release.jks"
    $env:HDPDF_KEYSTORE_PASSWORD = "..."; $env:HDPDF_KEY_ALIAS = "pdfz"; $env:HDPDF_KEY_PASSWORD = "..."
#>
param(
  [switch]$Open,
  # cartella dei risultati (APK + versione-android.json); vuoto = <cartella della build>\dist
  [string]$OutDir = ""
)
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root
function Step($m) { Write-Host "`n==> $m" -ForegroundColor Cyan }
# La build va fatta sulla COPIA in C:\Build (packaging\copia-e-build.ps1): con percorsi con "&" o dentro OneDrive
# la build si blocca (EBUSY, Accesso negato, cmd.exe).
if ("$Root" -match 'OneDrive' -or "$Root" -match '&') {
  Write-Warning "Stai compilando dentro $Root. Usa la copia in C:\Build:  .\packaging\copia-e-build.ps1 -Piattaforma android"
}
if (-not $OutDir) { $OutDir = Join-Path $Root "dist" }
try { New-Item -ItemType Directory -Force -Path $OutDir -ErrorAction Stop | Out-Null }
catch { throw "Non riesco a creare $OutDir ($($_.Exception.Message)). Creala a mano o usa -OutDir con un'altra cartella." }
$OutDir = (Resolve-Path $OutDir).Path
# file temporanei in build\ della copia in C:\Build, non in %LOCALAPPDATA%\Temp (AppData) e non in OneDrive: li usano npm, Node (Pyodide, Vite),
# Gradle e Java. In Temp Windows puo' negare l'accesso (resti di esecuzioni come amministratore, antivirus, OneDrive).
# Vale solo per questo script: chiuso PowerShell, TEMP torna quello di sempre.
$Work = Join-Path $Root "build\android-tmp"
if (Test-Path $Work) { Remove-Item -Recurse -Force $Work -ErrorAction SilentlyContinue }
New-Item -ItemType Directory -Force -Path $Work | Out-Null
$env:TEMP = $Work; $env:TMP = $Work                              # Java/Gradle leggono TMP/TEMP per java.io.tmpdir
$env:npm_config_cache = Join-Path $Root "build\npm-cache"       # cache di npm (di solito %LOCALAPPDATA%\npm-cache)
New-Item -ItemType Directory -Force -Path $env:npm_config_cache | Out-Null   # le cartelle devono gia' esistere
$Version = (Select-String -Path backend\hdpdf\__init__.py -Pattern '__version__ = "(.*)"').Matches[0].Groups[1].Value
Step "PDFz $Version per Android"
# numero di versione dell'APK preso da backend\hdpdf\__init__.py, formato MAJOR.MINOR.PATCH (es. 1.0.0):
# versionCode = 1000000000 + MAJOR*1000000 + MINOR*1000 + PATCH (1.0.0 -> 1001000000). Android installa un aggiornamento
# solo se il versionCode cresce: le versioni AAAAMM.NNN avevano 202610NNN, quindi resta sempre piu' alto (regola in versione.py).
if ($Version -notmatch '^(\d+)\.(\d+)\.(\d+)$') { throw "Versione '$Version' non valida: usa il formato MAJOR.MINOR.PATCH (es. 1.0.0)" }
if ([int]$Matches[2] -gt 255 -or [int]$Matches[3] -gt 999) { throw "Versione '$Version' fuori dai limiti (MINOR fino a 255, PATCH fino a 999)" }
$vCode = 1000000000 + [int]$Matches[1] * 1000000 + [int]$Matches[2] * 1000 + [int]$Matches[3]
$gradle = "mobile\android\app\build.gradle"
(Get-Content $gradle) -replace 'versionCode \d+', "versionCode $vCode" -replace 'versionName ".*"', "versionName `"$Version`"" | Set-Content $gradle -Encoding ascii

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) { throw "Serve Node.js (https://nodejs.org)" }
# Java: Gradle 8 funziona solo con Java 17-24. Le versioni recenti di Android Studio includono Java 25
# ("Unsupported class file major version 69"), quindi si cerca un Java compatibile tra quelli installati.
function JavaMajor($dir) {
  $rel = Join-Path $dir "release"
  if (-not (Test-Path $rel) -or -not (Test-Path "$dir\bin\java.exe")) { return 0 }
  $m = Select-String -Path $rel -Pattern 'JAVA_VERSION="(1\.)?(\d+)' | Select-Object -First 1
  if ($m) { return [int]$m.Matches[0].Groups[2].Value } else { return 0 }
}
$javaDirs = @("$env:ProgramFiles\Android\Android Studio\jbr", "$env:LOCALAPPDATA\Programs\Android Studio\jbr")
foreach ($base in "$env:ProgramFiles\Microsoft", "$env:ProgramFiles\Eclipse Adoptium", "$env:ProgramFiles\Java",
                  "$env:ProgramFiles\Zulu", "$env:ProgramFiles\Amazon Corretto", "$env:ProgramFiles\BellSoft") {
  if (Test-Path $base) { $javaDirs += (Get-ChildItem $base -Directory | ForEach-Object FullName) }
}
if ($env:JAVA_HOME) { $javaDirs = @($env:JAVA_HOME) + $javaDirs }
$found = $javaDirs | ForEach-Object { [pscustomobject]@{ Dir = $_; Major = (JavaMajor $_) } } |
  Where-Object { $_.Major -ge 17 -and $_.Major -le 24 } |
  Sort-Object @{ Expression = { [math]::Abs($_.Major - 21) } } | Select-Object -First 1
if (-not $found) {
  throw @"
Non trovo un Java compatibile (17-24). Quello di Android Studio e' troppo nuovo per Gradle 8.
Installa Java 21 con questo comando (1 minuto), poi rilancia lo script:
   winget install Microsoft.OpenJDK.21
"@
}
$env:JAVA_HOME = $found.Dir
$env:Path = "$env:JAVA_HOME\bin;$env:Path"
Write-Host "  Java $($found.Major): $env:JAVA_HOME"
# Android SDK: variabili d'ambiente, poi le cartelle usate di solito da Android Studio
if (-not $env:ANDROID_HOME -and $env:ANDROID_SDK_ROOT) { $env:ANDROID_HOME = $env:ANDROID_SDK_ROOT }
if (-not $env:ANDROID_HOME -or -not (Test-Path $env:ANDROID_HOME)) {
  $candidates = @((Join-Path $env:LOCALAPPDATA "Android\Sdk"), "C:\Android\Sdk", "C:\Android\android-sdk",
                  (Join-Path $env:USERPROFILE "AppData\Local\Android\Sdk"), "$env:ProgramFiles\Android\Sdk", "D:\Android\Sdk")
  $env:ANDROID_HOME = $candidates | Where-Object { Test-Path (Join-Path $_ "platform-tools") } | Select-Object -First 1
}
if (-not $env:ANDROID_HOME) {
  throw @"
Android SDK non trovato. In Android Studio: More Actions (o File > Settings) > SDK Manager.
 - In alto c'e' "Android SDK Location": se e' vuoto, premi Edit e installa l'SDK (Next fino alla fine).
 - Se c'e' un percorso, lancia lo script cosi':  `$env:ANDROID_HOME = "QUEL_PERCORSO"; .\packaging\build-android.ps1
"@
}
Write-Host "  Android SDK: $env:ANDROID_HOME"
"sdk.dir=$($env:ANDROID_HOME -replace '\\','/')" | Set-Content mobile\android\local.properties -Encoding ascii

# --- strumenti Node/Gradle senza cmd.exe -----------------------------------------------------------------------
# Con percorsi con "&" o dentro OneDrive cmd.exe crea problemi: per cmd.exe "&" vuol dire "nuovo comando", quindi gli
# script npm (npm run …, postinstall delle librerie) e i file .cmd/.bat (tsc.cmd, vite.cmd, gradlew.bat) si rompono
# ("... non e' riconosciuto come comando"). Qui si lancia tutto direttamente con node.exe / java.exe da PowerShell.
function Stop-ProjectLocks {
  # esbuild (usato da Vite) a volte resta aperto e blocca node_modules (EBUSY): si chiudono solo quelli del progetto
  Get-Process -Name esbuild -ErrorAction SilentlyContinue |
    Where-Object { $_.Path -and $_.Path.StartsWith($Root, [StringComparison]::OrdinalIgnoreCase) } |
    Stop-Process -Force -ErrorAction SilentlyContinue
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

Step "Librerie dell'interfaccia"
# sempre: se node_modules c'e' gia' (build Windows precedenti) aggiunge solo le librerie nuove (Capacitor, Tesseract…)
Stop-ProjectLocks
Install-NodeModules "frontend"
Install-NodeModules "mobile"

Step "Interfaccia + motore Python (Pyodide) + sincronizzazione con Android"
# equivale a "npm run build" di mobile\package.json, ma senza cmd.exe
Push-Location frontend
try {
  Invoke-Node "Controllo TypeScript" node_modules\typescript\bin\tsc -b
  Invoke-Node "Build interfaccia Android (Vite)" node_modules\vite\bin\vite.js build --mode android --outDir ../mobile/www --emptyOutDir
} finally { Pop-Location }
Push-Location mobile
try {
  Invoke-Node "Preparazione del motore Python" scripts\prepare-engine.mjs
  if ($Open) { Invoke-Node "Apertura di Android Studio" node_modules\@capacitor\cli\bin\capacitor open android; return }
  Invoke-Node "Sincronizzazione Capacitor" node_modules\@capacitor\cli\bin\capacitor sync android
} finally { Pop-Location }

Step "APK (Gradle, la prima volta scarica qualche centinaio di MB)"
# Gradle lanciato con java.exe al posto di gradlew.bat (che con "&" nel percorso non funziona); stesse opzioni di gradlew.bat
$java = Join-Path $env:JAVA_HOME "bin\java.exe"
$wrapper = Join-Path $Root "mobile\android\gradle\wrapper\gradle-wrapper.jar"
$gradle = @("-Xmx64m", "-Xms64m", "-Dorg.gradle.appname=gradlew", "-jar", $wrapper)
Push-Location mobile\android
try {
  & $java @gradle --stop | Out-Null   # chiude eventuali Gradle rimasti aperti con un altro Java
  # con la chiave di firma di PDFz (variabili HDPDF_KEYSTORE*, lette da app\build.gradle) l'APK e' "release", altrimenti "debug"
  $signed = [bool]$env:HDPDF_KEYSTORE
  if ($signed -and -not (Test-Path $env:HDPDF_KEYSTORE)) { throw "HDPDF_KEYSTORE punta a un file che non esiste: $env:HDPDF_KEYSTORE" }
  $task = if ($signed) { "assembleRelease" } else { "assembleDebug" }
  Write-Host "  APK $(if ($signed) { 'firmato con la chiave di firma di PDFz' } else { 'di prova (debug)' })"
  & $java @gradle $task "-Dorg.gradle.java.home=$env:JAVA_HOME"
  if ($LASTEXITCODE) { throw "Build Android non riuscita" }
} finally { Pop-Location }
$apk = Join-Path $OutDir "PDFz-$Version-android.apk"
$built = if ($signed) { "mobile\android\app\build\outputs\apk\release\app-release.apk" } else { "mobile\android\app\build\outputs\apk\debug\app-debug.apk" }
if (-not (Test-Path $built)) { throw "Gradle non ha prodotto l'APK ($built)" }
Copy-Item $built $apk -Force
Step "Fatto"
# file per l'avviso di nuova versione: se non riesce l'APK resta valido, quindi solo un avviso
try { & (Join-Path $PSScriptRoot "scrivi-versione.ps1") -Piattaforma android -File (Split-Path $apk -Leaf) -Root $Root -OutDir $OutDir }
catch { Write-Warning "versione-android.json non creato: $($_.Exception.Message)" }
Write-Host "APK: $apk  ($([math]::Round((Get-Item $apk).Length / 1MB)) MB)" -ForegroundColor Green
Write-Host "Installazione: copia l'APK sul telefono e aprilo (consenti 'Installa app sconosciute'), oppure:  adb install -r `"$apk`""
