# Inicio local del supervisor usado por POST /api/documentos/:id/analisis.
# Ejecuta scripts/pdf-sandbox-supervisor.mjs con Node LTS y ventana oculta.
# -NodePath admite un ejecutable LTS existente; no cambia Node global ni expone un puerto.
param([string]$NodePath = '')
$ErrorActionPreference = 'Stop'
$repoPath = Split-Path -Parent $PSScriptRoot
$sandboxPath = [IO.Path]::GetFullPath((Join-Path $repoPath '../docker-volumes/grupo10-proyecto/sandbox'))
if (-not $NodePath) {
  $NodePath = Join-Path $repoPath 'var/tools/node24/node.exe'
  if (-not (Test-Path -LiteralPath $NodePath)) { $NodePath = (Get-Command node -ErrorAction Stop).Source }
}
$version = & $NodePath --version
if ($version -ne 'v24.21.0') { throw 'El supervisor requiere Node 24.21.0. Usa -NodePath con ese ejecutable LTS.' }
$lockPath = Join-Path $sandboxPath 'supervisor.lock'
if (Test-Path -LiteralPath $lockPath) {
  $supervisorPid = [int](Get-Content -LiteralPath $lockPath)
  if (Get-Process -Id $supervisorPid -ErrorAction SilentlyContinue) { throw 'Ya existe un supervisor activo. Detenerlo antes de reiniciar.' }
}
$logPath = Join-Path $repoPath 'var/qa'
New-Item -ItemType Directory -Force -Path $logPath | Out-Null
$scriptPath = Join-Path $PSScriptRoot 'pdf-sandbox-supervisor.mjs'
$process = Start-Process -FilePath $NodePath -ArgumentList ('"' + $scriptPath + '"') -WorkingDirectory $repoPath -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logPath 'sandbox-supervisor.log') -RedirectStandardError (Join-Path $logPath 'sandbox-supervisor-error.log') -PassThru
Write-Output ('Supervisor iniciado PID=' + $process.Id + ' Node=' + $version)
