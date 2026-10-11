$ErrorActionPreference = 'Stop'
# Instala herramientas SOLO en este proyecto. No modifica PATH ni servicios.
$taskProjectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$taskToolsRoot = [System.IO.Path]::GetFullPath((Join-Path $taskProjectRoot '.tools\ffmpeg'))
if (-not $taskToolsRoot.StartsWith($taskProjectRoot + [System.IO.Path]::DirectorySeparatorChar)) { throw 'Destino de herramientas inválido.' }
New-Item -ItemType Directory -Path (Join-Path $taskToolsRoot 'bin') -Force | Out-Null
$taskArchive = Join-Path $taskToolsRoot 'release.zip'
function Get-UniRedSha256([string]$taskFile) {
  $taskInput = [System.IO.File]::OpenRead($taskFile)
  $taskHasher = [System.Security.Cryptography.SHA256]::Create()
  try { return [System.BitConverter]::ToString($taskHasher.ComputeHash($taskInput)).Replace('-', '') }
  finally { $taskInput.Dispose(); $taskHasher.Dispose() }
}
$taskDownloadUrl = 'https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip'
Write-Output 'Descargando herramientas FFmpeg desde el proveedor enlazado por ffmpeg.org...'
$taskChecksumText = (Invoke-WebRequest -Uri ($taskDownloadUrl + '.sha256') -UseBasicParsing).Content
if ($taskChecksumText -is [byte[]]) { $taskChecksumText = [System.Text.Encoding]::UTF8.GetString($taskChecksumText) }
$taskExpectedChecksum = [regex]::Match([string]$taskChecksumText, '(?i)\b[0-9a-f]{64}\b').Value
if (-not $taskExpectedChecksum) { throw 'El proveedor no devolvió una suma SHA-256 válida.' }
if (-not (Test-Path -LiteralPath $taskArchive) -or (Get-UniRedSha256 $taskArchive) -ne $taskExpectedChecksum) {
  Invoke-WebRequest -Uri $taskDownloadUrl -OutFile $taskArchive -UseBasicParsing
}
if ((Get-UniRedSha256 $taskArchive) -ne $taskExpectedChecksum) { throw 'La suma SHA-256 del archivo descargado no coincide.' }
Add-Type -AssemblyName System.IO.Compression.FileSystem
$taskZip = [System.IO.Compression.ZipFile]::OpenRead($taskArchive)
try {
  foreach ($taskName in @('ffprobe.exe', 'ffmpeg.exe')) {
    $taskEntry = $taskZip.Entries | Where-Object { $_.FullName.EndsWith('/bin/' + $taskName) }
    if (@($taskEntry).Count -ne 1) { throw ('No se encontró una única herramienta ' + $taskName) }
    $taskTarget = [System.IO.Path]::GetFullPath((Join-Path (Join-Path $taskToolsRoot 'bin') $taskName))
    if (-not $taskTarget.StartsWith($taskToolsRoot + [System.IO.Path]::DirectorySeparatorChar)) { throw 'Ruta de extracción inválida.' }
    [System.IO.Compression.ZipFileExtensions]::ExtractToFile($taskEntry, $taskTarget, $true)
  }
} finally { $taskZip.Dispose() }
& (Join-Path $taskToolsRoot 'bin\ffprobe.exe') -version | Select-Object -First 1
if ($LASTEXITCODE -ne 0) { throw 'FFprobe no se pudo ejecutar.' }
Write-Output 'Herramientas disponibles en .tools/ffmpeg/bin; no se ha iniciado ningún servicio.'
