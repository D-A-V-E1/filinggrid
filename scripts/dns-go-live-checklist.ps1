# PeerDisclosures — DNS + go-live verification (read-only)
# Run from project root: .\scripts\dns-go-live-checklist.ps1
#
# Checks Render API, Vercel deploy, custom domains, and API proxy.
# Does not call Stripe or mutate any infrastructure.

$ErrorActionPreference = "Continue"

$RenderApi = "https://peerdisclosures-api.onrender.com"
$VercelApp = "https://peerdisclosures.vercel.app"
$Apex = "https://peerdisclosures.com"
$Www = "https://www.peerdisclosures.com"
$ApiCustom = "https://api.peerdisclosures.com"

$pass = 0
$fail = 0
$warn = 0

function Write-Pass([string]$Label, [string]$Detail = "") {
    $script:pass++
    Write-Host "PASS  $Label" -ForegroundColor Green
    if ($Detail) { Write-Host "      $Detail" -ForegroundColor DarkGray }
}

function Write-Fail([string]$Label, [string]$Detail = "") {
    $script:fail++
    Write-Host "FAIL  $Label" -ForegroundColor Red
    if ($Detail) { Write-Host "      $Detail" -ForegroundColor Yellow }
}

function Write-Warn([string]$Label, [string]$Detail = "") {
    $script:warn++
    Write-Host "WAIT  $Label" -ForegroundColor Yellow
    if ($Detail) { Write-Host "      $Detail" -ForegroundColor DarkGray }
}

function Get-Detail($Obj, [string]$Fallback) {
    if ($Obj) { return [string]$Obj }
    return $Fallback
}

function Invoke-Health([string]$Url) {
    try {
        $resp = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 20
        $body = $resp.Content
        return @{ Ok = $true; Status = $resp.StatusCode; Body = $body; Headers = $resp.Headers }
    }
    catch {
        $status = $null
        if ($_.Exception.Response) { $status = [int]$_.Exception.Response.StatusCode }
        return @{ Ok = $false; Status = $status; Error = $_.Exception.Message }
    }
}

function Invoke-Head([string]$Url) {
    try {
        $resp = Invoke-WebRequest -Uri $Url -Method Head -UseBasicParsing -TimeoutSec 20 -MaximumRedirection 0
        return @{ Ok = $true; Status = $resp.StatusCode; Headers = $resp.Headers }
    }
    catch {
        $resp = $_.Exception.Response
        if ($resp) {
            return @{
                Ok = $true
                Status = [int]$resp.StatusCode
                Headers = $resp.Headers
                Redirect = $true
            }
        }
        return @{ Ok = $false; Error = $_.Exception.Message }
    }
}

function Test-DnsName([string]$Name) {
    try {
        $records = Resolve-DnsName -Name $Name -ErrorAction Stop
        return @{ Ok = $true; Records = $records }
    }
    catch {
        return @{ Ok = $false; Error = $_.Exception.Message }
    }
}

Write-Host "`nPeerDisclosures go-live verification" -ForegroundColor Cyan
Write-Host "====================================`n"

# 1. Render default hostname
$h = Invoke-Health "$RenderApi/health"
if ($h.Ok -and $h.Status -eq 200 -and $h.Body -match '"status"\s*:\s*"ok"') {
    Write-Pass "Render API health" $RenderApi
}
else {
    Write-Fail "Render API health" (Get-Detail $h.Error "status=$($h.Status) body=$($h.Body)")
}

# 2. Vercel deployment
$h = Invoke-Health "$VercelApp/api/backend/health"
$vercelServer = $null
try {
    $head = Invoke-WebRequest -Uri $VercelApp -Method Head -UseBasicParsing -TimeoutSec 20
    $vercelServer = $head.Headers["Server"]
}
catch { }

if ($h.Ok -and $h.Status -eq 200 -and $h.Body -match '"status"\s*:\s*"ok"') {
    Write-Pass "Vercel deploy + API proxy" "$VercelApp/api/backend/health"
}
else {
    Write-Fail "Vercel deploy + API proxy" (Get-Detail $h.Error "status=$($h.Status)")
}

if ($vercelServer -match "Vercel") {
    Write-Pass "Vercel Server header" $vercelServer
}
else {
    Write-Warn "Vercel Server header" "expected Server: Vercel on $VercelApp"
}

# 3. Apex custom domain
$apexDns = Test-DnsName "peerdisclosures.com"
if ($apexDns.Ok) {
    $aRecords = @($apexDns.Records | Where-Object { $_.Type -eq "A" } | ForEach-Object { $_.IPAddress })
    if ($aRecords -contains "76.76.21.21") {
        Write-Pass "Apex DNS A record" "76.76.21.21 (Vercel)"
    }
    else {
        Write-Warn "Apex DNS A record" "found $($aRecords -join ', ') - expected 76.76.21.21 after Cloudflare update"
    }
}
else {
    Write-Fail "Apex DNS lookup" $apexDns.Error
}

$apexHead = Invoke-Head $Apex
if ($apexHead.Ok) {
    $server = $apexHead.Headers["Server"]
    $vercel = $apexHead.Headers["X-Vercel-Id"]
    if ($server -match "Vercel" -or $vercel) {
        Write-Pass "Apex HTTPS serves Vercel" "$Apex"
    }
    else {
        Write-Warn "Apex HTTPS" "Server=$server - still GoDaddy/Cloudflare placeholder until DNS points to Vercel"
    }
}

# 4. www redirect
try {
    $wwwResp = Invoke-WebRequest -Uri $Www -UseBasicParsing -TimeoutSec 20 -MaximumRedirection 5
    if ($wwwResp.BaseResponse.ResponseUri.AbsoluteUri -match "^https://peerdisclosures\.com") {
        Write-Pass "www redirects to apex" $Www
    }
    else {
        Write-Warn "www redirect" "lands on $($wwwResp.BaseResponse.ResponseUri)"
    }
}
catch {
    Write-Warn "www redirect" $_.Exception.Message
}

# 5. API custom domain DNS
$apiDns = Test-DnsName "api.peerdisclosures.com"
if ($apiDns.Ok) {
    $cnames = @($apiDns.Records | Where-Object { $_.Type -eq "CNAME" } | ForEach-Object { $_.NameHost })
    if ($cnames -match "onrender") {
        Write-Pass "api DNS CNAME" ($cnames -join ", ")
    }
    else {
        Write-Warn "api DNS CNAME" "found $($cnames -join ', ') - expected peerdisclosures-api.onrender.com"
    }
}
else {
    Write-Warn "api DNS lookup" "NXDOMAIN - add CNAME api to peerdisclosures-api.onrender.com in Cloudflare + custom domain in Render"
}

# 6. API custom domain health
$apiH = Invoke-Health "$ApiCustom/health"
if ($apiH.Ok -and $apiH.Status -eq 200 -and $apiH.Body -match '"status"\s*:\s*"ok"') {
    Write-Pass "API custom domain health" $ApiCustom
}
else {
    Write-Warn "API custom domain health" (Get-Detail $apiH.Error "not reachable yet - complete Render custom domain + Cloudflare CNAME")
}

# 7. Apex API proxy (after DNS)
$proxyH = Invoke-Health "$Apex/api/backend/health"
if ($proxyH.Ok -and $proxyH.Status -eq 200 -and $proxyH.Body -match '"status"\s*:\s*"ok"') {
    Write-Pass "Apex API proxy" "$Apex/api/backend/health"
}
else {
    Write-Warn "Apex API proxy" "blocked until apex serves Vercel"
}

Write-Host "`n--- Summary ---" -ForegroundColor Cyan
Write-Host "PASS: $pass   WAIT: $warn   FAIL: $fail"
Write-Host ""
Write-Host "Manual steps (dashboard):" -ForegroundColor White
Write-Host "  1. Vercel  -> Settings -> Domains: peerdisclosures.com, www.peerdisclosures.com"
Write-Host '  2. Cloudflare -> apex A 76.76.21.21 (grey cloud), www CNAME cname.vercel-dns.com (grey cloud)'
Write-Host "  3. Render   -> Settings -> Custom Domains: api.peerdisclosures.com"
Write-Host "  4. Cloudflare -> api CNAME peerdisclosures-api.onrender.com (grey cloud)"
Write-Host "  5. Stripe   -> Live webhook https://api.peerdisclosures.com/webhooks/stripe -> STRIPE_WEBHOOK_SECRET on Render"
Write-Host ""
Write-Host "Docs: docs/DNS_PEERDISCLOSURES.md, docs/GO_LIVE_CHECKLIST.md"

if ($fail -gt 0) { exit 1 }
exit 0
