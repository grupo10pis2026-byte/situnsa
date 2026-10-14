# Parada ordenada del supervisor iniciado por iniciar-sandbox-pdf.ps1.
# Publica stop fuera de la cola de API y espera limpieza; no usa una ruta HTTP.
# Durante la parada, POST /api/documentos/:id/analisis no dispone del extractor.
$ErrorActionPreference = 'Stop'
$repoPath = Split-Path -Parent $PSScriptRoot
$sandboxPath = [IO.Path]::GetFullPath((Join-Path $repoPath '../docker-volumes/grupo10-proyecto/sandbox'))
$lockPath = Join-Path $sandboxPath 'supervisor.lock'
if (-not (Test-Path -LiteralPath $lockPath)) { Write-Output 'Supervisor detenido'; return }
[IO.File]::WriteAllText((Join-Path $sandboxPath 'stop'), 'stop')
$limit = [DateTime]::UtcNow.AddSeconds(30)
while ((Test-Path -LiteralPath $lockPath) -and [DateTime]::UtcNow -lt $limit) { Start-Sleep -Milliseconds 100 }
if (Test-Path -LiteralPath $lockPath) { throw 'No se confirmó la parada; revisar logs y contenedores antes de reiniciar.' }
Write-Output 'Supervisor detenido y recursos limpiados'
