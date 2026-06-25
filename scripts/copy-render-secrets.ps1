# copy-render-secrets.ps1 — Copy DATABASE_URL from backend/.env to clipboard for Render setup.
$ErrorActionPreference = "Stop"
$Root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$EnvFile = Join-Path $Root "backend\.env"

if (-not (Test-Path $EnvFile)) {
    Write-Error "Missing $EnvFile"
    exit 1
}

function Get-EnvValue {
    param([string]$Name)
    foreach ($line in Get-Content $EnvFile -Encoding UTF8) {
        $trim = $line.Trim()
        if ($trim -match '^\s*#' -or [string]::IsNullOrWhiteSpace($trim)) { continue }
        if ($trim -match "^\s*$([regex]::Escape($Name))\s*=\s*(.*)$") {
            $val = $Matches[1].Trim()
            if ($val -match '^["''](.*)["'']$') { $val = $Matches[1] }
            return $val
        }
    }
    return $null
}

$databaseUrl = Get-EnvValue -Name "DATABASE_URL"
$jwtSecret = Get-EnvValue -Name "SUPABASE_JWT_SECRET"

if ([string]::IsNullOrWhiteSpace($databaseUrl)) {
    Write-Error "DATABASE_URL not found in $EnvFile"
    exit 1
}

if ($databaseUrl -eq "backend/.env" -or $databaseUrl -notmatch '^postgresql://') {
    Write-Warning "DATABASE_URL looks wrong (expected postgresql://...). Fix backend/.env before deploying to Render."
}

Set-Clipboard -Value $databaseUrl

if ($databaseUrl.StartsWith("postgresql://neondb")) {
    Write-Host "DATABASE_URL copied to clipboard (starts with postgresql://neondb...)"
} else {
    $len = [Math]::Min(24, $databaseUrl.Length)
    Write-Host "DATABASE_URL copied to clipboard (starts with $($databaseUrl.Substring(0, $len))...)"
}

if ($null -ne $jwtSecret -and -not [string]::IsNullOrWhiteSpace($jwtSecret)) {
    Write-Host "SUPABASE_JWT_SECRET: found in backend/.env — set manually in Render (not copied to clipboard)."
} else {
    Write-Host "SUPABASE_JWT_SECRET: not found in backend/.env — set in Render from Supabase dashboard."
}

Write-Host ""
Write-Host "Render reminders (set in Dashboard -> Environment):"
Write-Host "  STRIPE_SECRET_KEY — use sk_live_... from Stripe Dashboard (Developers -> API keys)"
Write-Host "  STRIPE_PRICE_PROFESSIONAL — Price ID from Stripe product/price (e.g. price_...)"
Write-Host ""
Write-Host "Paste DATABASE_URL: Render -> your service -> Environment -> DATABASE_URL -> Ctrl+V -> Save"
