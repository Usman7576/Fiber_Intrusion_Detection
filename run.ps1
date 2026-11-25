<#
.SYNOPSIS
  One-click demo: starts the FastAPI backend and the Next.js frontend in two windows and opens the browser.

.EXAMPLE
  .\run.ps1            # development mode (hot reload)
  .\run.ps1 -Prod      # production build of the frontend: faster and steadier, use this for the viva demo
  .\run.ps1 -NoBrowser # do not open the browser

  If scripts are blocked, run once:  Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
  Stop everything by closing the two windows (or Ctrl+C in each).
#>
param(
    [switch]$Prod,
    [switch]$NoBrowser,
    [int]$BackendPort = 8000,
    [int]$FrontendPort = 3000
)

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
$python = Join-Path $root ".venv\Scripts\python.exe"
$frontend = Join-Path $root "frontend"

function Fail($msg) { Write-Host "  x $msg" -ForegroundColor Red; exit 1 }
function Ok($msg) { Write-Host "  + $msg" -ForegroundColor Green }

Write-Host "`nFiberGuard - phi-OTDR intrusion detection" -ForegroundColor Cyan

# ---- checks ---------------------------------------------------------------------------------------------
if (-not (Test-Path $python)) { Fail "Python venv not found. See README > Setup (uv venv .venv --python 3.12 ...)." }
& $python -c "import phiotdr, fastapi, torch" 2>$null
if ($LASTEXITCODE -ne 0) { Fail "Python packages missing. Run: uv pip install -r requirements.txt; uv pip install -e ml" }
Ok "Python environment"

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) { Fail "Node.js / npm not found (need Node 18+)." }
if (-not (Test-Path (Join-Path $frontend "node_modules"))) {
    Write-Host "  - installing frontend packages (first run only)..."
    Push-Location $frontend; npm install --no-audit --no-fund; $code = $LASTEXITCODE; Pop-Location
    if ($code -ne 0) { Fail "npm install failed." }
}
$envLocal = Join-Path $frontend ".env.local"
if (-not (Test-Path $envLocal)) {
    "NEXT_PUBLIC_API_URL=http://localhost:$BackendPort" | Set-Content -Encoding utf8 $envLocal
}
Ok "Frontend packages"

foreach ($port in @($BackendPort, $FrontendPort)) {
    if (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue) {
        Fail "Port $port is already in use. Close the program using it, or pass -BackendPort / -FrontendPort."
    }
}

# ---- backend ----------------------------------------------------------------------------------------------
$env:FIBER_CORS_ORIGINS = "http://localhost:$FrontendPort,http://127.0.0.1:$FrontendPort"
$backendCmd = "`$host.UI.RawUI.WindowTitle = 'FiberGuard backend :$BackendPort'; " +
              "& '$python' -m uvicorn app.main:app --app-dir '$root\backend' --port $BackendPort"
Start-Process powershell -ArgumentList "-NoExit", "-Command", $backendCmd -WorkingDirectory $root | Out-Null
Ok "Backend starting on http://localhost:$BackendPort (API docs: /docs)"

# ---- frontend ---------------------------------------------------------------------------------------------
if ($Prod) {
    Write-Host "  - building the frontend (about a minute)..."
    Push-Location $frontend; npm run build; $code = $LASTEXITCODE; Pop-Location
    if ($code -ne 0) { Fail "Frontend build failed." }
    $npmScript = "start"
} else {
    $npmScript = "dev"
}
$frontendCmd = "`$host.UI.RawUI.WindowTitle = 'FiberGuard frontend :$FrontendPort'; npm run $npmScript -- --port $FrontendPort"
Start-Process powershell -ArgumentList "-NoExit", "-Command", $frontendCmd -WorkingDirectory $frontend | Out-Null
Ok "Frontend starting on http://localhost:$FrontendPort ($npmScript mode)"

# ---- wait until both answer, then open the browser ----------------------------------------------------------
function Wait-Url($url, $timeoutSec, $label) {
    Write-Host "  - waiting for the $label..." -NoNewline
    $deadline = (Get-Date).AddSeconds(240)
    while ((Get-Date) -lt $deadline) {
        try {
            # the dev server compiles a page on its first request, which can take a minute: allow a long request
            Invoke-WebRequest $url -UseBasicParsing -TimeoutSec $timeoutSec | Out-Null
            Write-Host ""; return $true
        } catch { Start-Sleep -Seconds 2; Write-Host "." -NoNewline }
    }
    Write-Host ""; return $false
}
if (-not (Wait-Url "http://localhost:$BackendPort/api/health" 3 "backend")) { Fail "Backend did not start. Check its window." }
Ok "Backend ready"
if (-not (Wait-Url "http://localhost:$FrontendPort" 90 "frontend")) { Fail "Frontend did not start. Check its window." }
Ok "Ready: http://localhost:$FrontendPort"
if (-not $NoBrowser) { Start-Process "http://localhost:$FrontendPort" }
