# copy-render-stripe-secrets.ps1
# Fetches live Stripe catalog/webhooks via CLI and prints Render paste steps for peerdisclosures-api.
$ErrorActionPreference = "Stop"

$StripeExe = Join-Path $env:LOCALAPPDATA "Microsoft\WinGet\Packages\Stripe.StripeCli_Microsoft.Winget.Source_8wekyb3d8bbwe\stripe.exe"
if (-not (Test-Path $StripeExe)) {
    Write-Error "Stripe CLI not found at: $StripeExe"
    exit 1
}

$RenderService = "peerdisclosures-api"
$ExpectedWebhookUrl = "https://api.peerdisclosures.com/webhooks/stripe"
$RecommendedPriceId = "price_1TjA9OJX5g98nb1eafRUKoZM"

function Invoke-StripeJson {
    param([string[]]$StripeArgs)
    $withLive = @()
    for ($i = 0; $i -lt $StripeArgs.Count; $i++) {
        $withLive += $StripeArgs[$i]
        if ($StripeArgs[$i] -in @('list', 'retrieve') -and ($i + 1) -lt $StripeArgs.Count) {
            $withLive += '--live'
        }
    }
    $raw = & $StripeExe @withLive 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Error "stripe $($StripeArgs -join ' ') failed: $raw"
    }
    return (($raw | Out-String).Trim() | ConvertFrom-Json)
}

Write-Host ""
Write-Host "================================================================"
Write-Host " Render Stripe env vars -> $RenderService"
Write-Host "================================================================"
Write-Host ""

Write-Host "--- Live prices (from Stripe CLI) ---"
try {
    $prices = Invoke-StripeJson -StripeArgs @("prices", "list", "--limit", "100")
    $products = Invoke-StripeJson -StripeArgs @("products", "list", "--limit", "100")
    $productById = @{}
    foreach ($p in $products.data) { $productById[$p.id] = $p.name }

    $priceRows = @()
    foreach ($pr in $prices.data) {
        $name = $productById[$pr.product]
        if (-not $name) { $name = $pr.product }
        $amount = if ($pr.unit_amount) { "{0:N2} {1}" -f ($pr.unit_amount / 100), $pr.currency.ToUpper() } else { "?" }
        $interval = if ($pr.recurring) { $pr.recurring.interval } else { "one-time" }
        $priceRows += [pscustomobject]@{
            PriceId = $pr.id
            Product = $name
            Amount  = $amount
            Interval = $interval
        }
    }
    $priceRows | Format-Table -AutoSize | Out-String | Write-Host

    $livePriceId = $RecommendedPriceId
    $match = $priceRows | Where-Object { $_.PriceId -eq $RecommendedPriceId }
    if (-not $match) {
        $pro = $priceRows | Where-Object { $_.Product -match "Professional" -and $_.Product -notmatch "Test" } | Select-Object -First 1
        if ($pro) { $livePriceId = $pro.PriceId }
        elseif ($priceRows.Count -gt 0) { $livePriceId = $priceRows[0].PriceId }
    }
} catch {
    Write-Warning "Could not list live prices: $_"
    $livePriceId = $RecommendedPriceId
}

Write-Host "--- Live webhooks (from Stripe CLI) ---"
$webhookUrl = $null
$webhookSecret = $null
$webhookId = $null
try {
    $hooks = Invoke-StripeJson -StripeArgs @("webhook_endpoints", "list", "--limit", "100")
    if ($hooks.data.Count -eq 0) {
        Write-Host "No live webhook endpoints found."
        Write-Host "Create one in Live mode: $ExpectedWebhookUrl"
        Write-Host "  Events: checkout.session.completed, customer.subscription.updated,"
        Write-Host "          customer.subscription.deleted, invoice.payment_failed"
    } else {
        foreach ($h in $hooks.data) {
            Write-Host "  $($h.id)  $($h.url)  status=$($h.status)"
        }
        $preferred = $hooks.data | Where-Object { $_.url -eq $ExpectedWebhookUrl } | Select-Object -First 1
        if (-not $preferred) {
            $preferred = $hooks.data | Select-Object -First 1
        }
        $webhookId = $preferred.id
        $webhookUrl = $preferred.url
        try {
            $detail = Invoke-StripeJson -StripeArgs @("webhook_endpoints", "retrieve", $webhookId)
            if ($detail.PSObject.Properties.Name -contains "secret" -and $detail.secret) {
                $webhookSecret = $detail.secret
            }
        } catch {
            Write-Warning "Could not retrieve webhook $webhookId : $_"
        }
    }
} catch {
    Write-Warning "Could not list live webhooks: $_"
}

Write-Host ""
Write-Host "================================================================"
Write-Host " Paste into Render (Dashboard -> $RenderService -> Environment)"
Write-Host "================================================================"
Write-Host ""
Write-Host "1) STRIPE_SECRET_KEY"
Write-Host "   Value: sk_live_... (NOT available from Stripe CLI)"
Write-Host "   Copy: Stripe Dashboard -> Developers -> API keys -> Secret key (Live mode)"
Write-Host "   Do NOT paste file paths or sk_test_ keys."
Write-Host ""
Write-Host "2) STRIPE_PRICE_PROFESSIONAL"
Write-Host "   Value: $livePriceId"
Write-Host "   (See table above if you use a different Professional price.)"
Write-Host ""
Write-Host "3) STRIPE_WEBHOOK_SECRET"
if ($webhookSecret) {
    $whsecPreview = if ($webhookSecret.Length -gt 12) { $webhookSecret.Substring(0, 8) + "..." } else { "(set)" }
    Write-Host "   Value: $whsecPreview (full whsec_ in Dashboard if CLI did not return it)"
    if ($webhookSecret -match '^whsec_') {
        Write-Host "   CLI returned signing secret; paste from Dashboard Webhooks if you prefer not to log secrets."
    }
} elseif ($webhookUrl) {
    Write-Host "   Signing secret not returned by API retrieve (normal after creation)."
    Write-Host "   Webhook URL: $webhookUrl"
    Write-Host "   Copy whsec_... from Stripe Dashboard -> Developers -> Webhooks -> endpoint -> Signing secret"
} else {
    Write-Host "   Leave empty until you create the live webhook, then paste whsec_..."
    Write-Host "   Endpoint URL: $ExpectedWebhookUrl"
}
Write-Host ""
Write-Host "Steps:"
Write-Host "  1. Open https://dashboard.render.com -> $RenderService -> Environment"
Write-Host "  2. Add or edit STRIPE_SECRET_KEY, STRIPE_PRICE_PROFESSIONAL, STRIPE_WEBHOOK_SECRET"
Write-Host "  3. Paste literal values (same as backend/.env AFTER =), not paths"
Write-Host "  4. Save Changes -> wait for redeploy"
Write-Host ""
Write-Host "Reference: scripts/render-production-env.example, docs/STRIPE_LIVE_CHECKLIST.md"
Write-Host ""

try {
    Set-Clipboard -Value $livePriceId
    Write-Host "Copied STRIPE_PRICE_PROFESSIONAL ($livePriceId) to clipboard."
} catch {
    Write-Host "Could not copy price ID to clipboard: $_"
}


