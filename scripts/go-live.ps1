# PeerDisclosures — go-live deployment script (Windows)
# Run from project root after filling secrets in hosting dashboards.
#
# Usage:
#   .\scripts\go-live.ps1 -Phase db
#   .\scripts\go-live.ps1 -Phase smoke
#   .\scripts\go-live.ps1 -Phase all

param(
    [ValidateSet("db", "verify", "smoke", "all")]
    [string]$Phase = "all"
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

function Run-DbMigrate {
    Write-Host "`n=== Phase 1: Database migrations (Neon) ===" -ForegroundColor Cyan
    $backendEnv = Join-Path $Root "backend\.env"
    if (-not (Test-Path $backendEnv)) {
        Write-Error "backend/.env not found. Set DATABASE_URL to your Neon production URL."
    }
    $dbLine = Select-String -Path $backendEnv -Pattern '^DATABASE_URL=' | Select-Object -First 1
    if (-not $dbLine) {
        Write-Error "DATABASE_URL not set in backend/.env"
    }
    $env:DATABASE_URL = $dbLine.Line -replace '^DATABASE_URL=', ''
    $py = Join-Path $Root "backend\.venv\Scripts\python.exe"
    if (-not (Test-Path $py)) {
        Write-Error "backend/.venv not found. Run start.bat once to create the venv."
    }
    Push-Location (Join-Path $Root "backend")
    & $py -m alembic upgrade head
    & $py -m alembic current
    Pop-Location
    Write-Host "OK  Alembic at head on production DATABASE_URL" -ForegroundColor Green
    Write-Host "    Enable Neon backups: console.neon.tech -> project -> Settings -> Backups" -ForegroundColor Yellow
}

function Run-Verify {
    Write-Host "`n=== DNS + deploy verification ===" -ForegroundColor Cyan
    & (Join-Path $PSScriptRoot "dns-go-live-checklist.ps1")
}

function Run-Smoke {
    Write-Host "`n=== Phase 7: Production smoke check ===" -ForegroundColor Cyan
    $py = Join-Path $Root "backend\.venv\Scripts\python.exe"
    & $py (Join-Path $Root "backend\scripts\prod_smoke_check.py") `
        --api "https://api.peerdisclosures.com" `
        --app "https://peerdisclosures.com"
    if ($LASTEXITCODE -ne 0) {
        Write-Host "`nSome checks failed. Complete API deploy + DNS first." -ForegroundColor Yellow
        Write-Host "See docs/PRODUCTION_SMOKE_TEST.md for manual steps." -ForegroundColor Yellow
    }
}

Write-Host "PeerDisclosures go-live helper" -ForegroundColor White
Write-Host "Repo: $Root"

switch ($Phase) {
    "db"     { Run-DbMigrate }
    "verify" { Run-Verify }
    "smoke"  { Run-Smoke }
    "all"    { Run-DbMigrate; Run-Verify; Run-Smoke }
}

Write-Host "`n=== Manual phases (dashboard) ===" -ForegroundColor Cyan
Write-Host "  API deploy:     render.yaml or railway.toml -> connect GitHub repo"
Write-Host "  Vercel:         vercel.com -> import D-A-V-E1/filinggrid -> env from .env.production.example"
Write-Host "  DNS verify:     .\scripts\dns-go-live-checklist.ps1"
Write-Host "  DNS steps:      docs/DNS_PEERDISCLOSURES.md"
Write-Host "  Supabase URLs:  docs/SUPABASE_PROD_URLS.md"
Write-Host "  Stripe Live:    docs/STRIPE_LIVE_CHECKLIST.md"
