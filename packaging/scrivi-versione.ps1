<#
  Crea versione-<piattaforma>.json accanto a MSI/APK (C:\Build\PDFz-Windows\dist / C:\Build\PDFz-Android\dist), il file letto dall'avviso "nuova versione" delle versioni gia' installate.
  Va pubblicato insieme all'installer (MSI o APK) nello spazio degli aggiornamenti (la GitHub Release della versione).
  Il campo "file" e' solo il nome dell'installer: l'app scarica da UPDATE_BASE_URL + nome, che funziona anche con
  https://github.com/<proprietario>/<repository>/releases/latest/download/<file>.
  Le novita' vengono da frontend\src\novita.json (voce della versione attuale, filtrata per piattaforma).
  Usato da build-windows.ps1 e build-android.ps1; si puo' lanciare anche da solo:
    .\packaging\scrivi-versione.ps1 -Piattaforma windows -File PDFz-1.0.0-x64.msi
#>
param(
  [Parameter(Mandatory)][ValidateSet("windows", "macos", "linux", "android")][string]$Piattaforma,
  [Parameter(Mandatory)][string]$File,
  [string]$Root = (Split-Path -Parent $PSScriptRoot),
  # dove scrivere il file; vuoto = <cartella della build>\dist
  [string]$OutDir = ""
)
$ErrorActionPreference = "Stop"
$Version = (Select-String -Path (Join-Path $Root "backend\hdpdf\__init__.py") -Pattern '__version__ = "(.*)"').Matches[0].Groups[1].Value
$src = Join-Path $Root "frontend\src\novita.json"
$dati = [IO.File]::ReadAllText($src, [Text.Encoding]::UTF8) | ConvertFrom-Json
$v = $dati.versioni | Where-Object { $_.versione -eq $Version } | Select-Object -First 1
if (-not $v) {
  Write-Warning "novita.json non ha la voce della versione ${Version}: l'avviso mostrera' solo il numero di versione."
  $v = [pscustomobject]@{ versione = $Version; data = (Get-Date -Format "yyyy-MM-dd"); titolo = ""; voci = @() }
}
$voci = @($v.voci | Where-Object { -not $_.piattaforme -or (@($_.piattaforme) -contains $Piattaforma) })
$info = [ordered]@{
  version = $Version
  date    = $v.data
  titolo  = $v.titolo
  file    = $File
  novita  = $voci
}
if (-not $OutDir) { $OutDir = Join-Path $Root "dist" }
$out = Join-Path $OutDir "versione-$Piattaforma.json"
New-Item -ItemType Directory -Force -Path (Split-Path $out) | Out-Null
# UTF-8 senza BOM (il BOM darebbe fastidio ad alcuni lettori JSON)
[IO.File]::WriteAllText($out, (ConvertTo-Json $info -Depth 8), (New-Object Text.UTF8Encoding $false))
Write-Host "File della versione: $out  ($($voci.Count) novita')" -ForegroundColor Green
