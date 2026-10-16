<#
  Crea versione-<piattaforma>.json accanto a MSI/APK (C:\Build\PDFz-Windows\dist / C:\Build\PDFz-Android\dist), il file letto dall'avviso "nuova versione" delle versioni gia' installate.
  Va pubblicato insieme all'installer (MSI o APK) nello spazio degli aggiornamenti (la GitHub Release della versione).
  Campi del download (come scrivi_versione.py): "file" (nome; le app vecchie scaricano da UPDATE_BASE_URL + nome),
  "url" (link diretto, con -LinkBase), "size" (byte, se l'installer e' in OutDir), "pagina" (con -Pagina).
  Le novita' vengono da frontend\src\novita.json (voce della versione attuale, filtrata per piattaforma).
  Usato da build-windows.ps1 e build-android.ps1; si puo' lanciare anche da solo:
    .\packaging\scrivi-versione.ps1 -Piattaforma windows -File PDFz-1.0.0-x64.msi
#>
param(
  [Parameter(Mandatory)][ValidateSet("windows", "macos", "linux", "android")][string]$Piattaforma,
  [Parameter(Mandatory)][string]$File,
  [string]$Root = (Split-Path -Parent $PSScriptRoot),
  # dove scrivere il file; vuoto = <cartella della build>\dist
  [string]$OutDir = "",
  # facoltativi: link diretto = LinkBase + File (https), pagina della versione
  [string]$LinkBase = "",
  [string]$Pagina = ""
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
}
if (-not $OutDir) { $OutDir = Join-Path $Root "dist" }
# stessi campi di scrivi_versione.py: link diretto, dimensione (se l'installer e' accanto), pagina
if ($LinkBase) {
  if (-not $LinkBase.StartsWith("https://")) { throw "LinkBase deve iniziare con https://" }
  $info.url = $LinkBase.TrimEnd("/") + "/" + $File
}
$inst = Join-Path $OutDir $File
if (Test-Path $inst) { $info.size = (Get-Item $inst).Length }
if ($Pagina) { $info.pagina = $Pagina }
$info.novita = $voci
$out = Join-Path $OutDir "versione-$Piattaforma.json"
New-Item -ItemType Directory -Force -Path (Split-Path $out) | Out-Null
# UTF-8 senza BOM (il BOM darebbe fastidio ad alcuni lettori JSON)
[IO.File]::WriteAllText($out, (ConvertTo-Json $info -Depth 8), (New-Object Text.UTF8Encoding $false))
Write-Host "File della versione: $out  ($($voci.Count) novita')" -ForegroundColor Green
