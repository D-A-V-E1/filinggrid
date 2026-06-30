# Pre-promote tightening checklist - 16 steps for branch promotion gates.
param(
  [string]$ApiBase = $(if ($env:API_URL) { $env:API_URL } else { "https://peerdisclosures-api.onrender.com" }),
  [string]$AppBase = $(if ($env:APP_URL) { $env:APP_URL } else { "https://peerdisclosures.com" }),
  [switch]$FullOvernight,
  [switch]$SkipBrowser,
  [switch]$SkipOvernight,
  [int]$ThrottleSeconds = $(if ($env:FILINGGRID_THROTTLE_S) { [int]$env:FILINGGRID_THROTTLE_S } else { 5 })
)

$ErrorActionPreference = "Continue"
$RepoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $RepoRoot

# Env overrides (1 = skip browser / overnight)
if ($env:SKIP_BROWSER -eq "1") { $SkipBrowser = $true }
if ($env:SKIP_OVERNIGHT -eq "1") { $SkipOvernight = $true }
if ($env:FULL_OVERNIGHT -eq "1") { $FullOvernight = $true }

$logsDir = Join-Path $RepoRoot "logs"
New-Item -ItemType Directory -Force -Path $logsDir | Out-Null
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$LogFile = Join-Path $logsDir "pre-promote-$stamp.log"
$Summary = [System.Collections.Generic.List[object]]::new()

function Write-Log([string]$Message) {
  $line = "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] $Message"
  Add-Content -Path $LogFile -Value $line -Encoding utf8
  Write-Host $line
}

function Resolve-Python {
  $venv = Join-Path $RepoRoot "backend\.venv\Scripts\python.exe"
  if (Test-Path $venv) { return $venv }
  return "python"
}

function Get-GitInfo {
  $branch = $env:BRANCH
  if (-not $branch) {
    try { $branch = (git rev-parse --abbrev-ref HEAD 2>$null).Trim() } catch { $branch = "unknown" }
  }
  $commit = $env:COMMIT
  if (-not $commit) {
    try { $commit = (git rev-parse --short HEAD 2>$null).Trim() } catch { $commit = "unknown" }
  }
  $dirty = $false
  try {
    $porcelain = git status --porcelain 2>$null
    $dirty = [bool]$porcelain
  } catch { }
  return @{ branch = $branch; commit = $commit; dirty = $dirty }
}

function Invoke-Step {
  param(
    [int]$Step,
    [string]$Name,
    [scriptblock]$Action,
    [string]$OnSkip = "",
    [string]$OnWarn = ""
  )
  Write-Log "=== Step ${Step}: $Name ==="
  $sw = [System.Diagnostics.Stopwatch]::StartNew()
  $status = "PASS"
  $detail = ""
  $exit = 0
  try {
    $result = & $Action
    if ($null -ne $result) {
      if ($result -is [hashtable]) {
        if ($result.status) { $status = $result.status }
        if ($result.detail) { $detail = $result.detail }
        if ($null -ne $result.exit) { $exit = [int]$result.exit }
      } elseif ($result -is [string]) {
        $detail = $result
      }
    }
    if ($null -ne $LASTEXITCODE -and $LASTEXITCODE -ne 0) { $exit = [int]$LASTEXITCODE }
  } catch {
    $status = "FAIL"
    $detail = $_.Exception.Message
    $exit = 1
  }
  if ($OnSkip -and $status -eq "SKIP") { $detail = if ($detail) { $detail } else { $OnSkip } }
  if ($exit -ne 0 -and $status -eq "PASS") {
    $status = "FAIL"
    if (-not $detail) { $detail = "exit code $exit" }
  }
  if ($OnWarn -and $status -eq "WARN" -and -not $detail) { $detail = $OnWarn }
  $sw.Stop()
  $entry = [pscustomobject]@{
    step    = $Step
    name    = $Name
    status  = $status
    seconds = [math]::Round($sw.Elapsed.TotalSeconds, 1)
    detail  = $detail
  }
  [void]$Summary.Add($entry)
  $tail = if ($detail) { "- $detail" } else { "" }
  Write-Log "Step $Step $status in $($entry.seconds)s $tail"
}

function Print-BrowserManualChecklist {
  Write-Log @"
--- Manual browser checklist (steps 8-11) ---
  8. Deep links: open /compare/aapl-vs-msft-vs-nvda/deltas?period=interim-2026-Q2 - badge links land on correct section
  9. Scanning UX: delta counter monotonic during load; grid <-> report navigation consistent
 10. Table CSS: financial statement tables aligned across 3 columns
 11. Vertical scroll: mouse wheel over grid scrolls page (not trapped)
Preview URL: $AppBase/compare/aapl-vs-msft-vs-nvda?period=interim-2026-Q2
See docs/PRODUCTION_SMOKE_TEST.md
"@
}

$py = Resolve-Python
$git = Get-GitInfo
$env:FILINGGRID_API = $ApiBase
$env:API_URL = $ApiBase
$env:NEXT_PUBLIC_API_URL = $ApiBase
$env:FILINGGRID_FY = "latest"
$env:FILINGGRID_THROTTLE_S = "$ThrottleSeconds"

Write-Log "Pre-promote check started branch=$($git.branch) commit=$($git.commit) dirty=$($git.dirty) api=$ApiBase app=$AppBase"
Write-Log "Flags: SkipOvernight=$SkipOvernight FullOvernight=$FullOvernight SkipBrowser=$SkipBrowser throttle=${ThrottleSeconds}s"

# 1. Commit + deploy status
Invoke-Step 1 "Commit + deploy status" {
  $healthOk = $false
  try {
    $resp = Invoke-WebRequest -Uri "$ApiBase/health" -UseBasicParsing -TimeoutSec 30
    $healthOk = ($resp.StatusCode -eq 200)
  } catch { }
  $dirtyNote = if ($git.dirty) { "working tree dirty" } else { "clean" }
  if (-not $healthOk) {
    return @{ status = "FAIL"; detail = "API health failed; branch=$($git.branch) commit=$($git.commit) $dirtyNote" }
  }
  return "branch=$($git.branch) commit=$($git.commit) $dirtyNote; API health 200"
}

# 2. Overnight smoke (subset / full / skip)
Invoke-Step 2 "Overnight smoke" {
  if ($SkipOvernight) {
    return @{ status = "SKIP"; detail = "SKIP_OVERNIGHT=1 - run npm run smoke:overnight before promote" }
  }
  if ($FullOvernight) {
    & (Join-Path $RepoRoot "scripts\overnight-smoke.ps1") -ApiBase $ApiBase -ThrottleSeconds $ThrottleSeconds 2>&1 | Tee-Object -FilePath $LogFile -Append
    return
  }
  # Lightweight subset (prod smoke + backend pytest)
  & $py (Join-Path $RepoRoot "backend\scripts\prod_smoke_check.py") --api $ApiBase --app $AppBase 2>&1 | Tee-Object -FilePath $LogFile -Append
  Push-Location (Join-Path $RepoRoot "backend")
  & $py -m pytest tests/test_section_excerpt_html.py tests/test_xbrl_notes.py tests/test_xbrl_ifrs.py -q 2>&1 | Tee-Object -FilePath $LogFile -Append
  Pop-Location
  return "lightweight subset (prod_smoke_check + pytest); use FULL_OVERNIGHT=1 or npm run smoke:overnight for full harness"
}

# 3. Counter consistency (API proxy)
Invoke-Step 3 "Counter consistency (API proxy)" {
  & $py (Join-Path $RepoRoot "scripts\pre_promote_api_checks.py") --probe counter 2>&1 | Tee-Object -FilePath $LogFile -Append
  if ($SkipBrowser) {
    Write-Log "Browser counter spot-check skipped (SKIP_BROWSER=1) - verify delta badge totals manually"
  } else {
    Write-Log "Browser counter spot-check: compare grid badge vs /deltas report total on preview"
  }
}

# 4. Full vitest
Invoke-Step 4 "Full vitest" {
  npm test 2>&1 | Tee-Object -FilePath $LogFile -Append
}

# 5. Delta accuracy smoke
$deltaTest = Join-Path $RepoRoot "scripts\delta-accuracy-smoke.test.ts"
Invoke-Step 5 "Delta accuracy smoke" {
  if (-not (Test-Path $deltaTest)) {
    return @{ status = "WARN"; detail = "scripts/delta-accuracy-smoke.test.ts missing" }
  }
  npx vitest run scripts/delta-accuracy-smoke.test.ts --testTimeout=900000 2>&1 | Tee-Object -FilePath $LogFile -Append
}

# 6. Popular + uncommon API smokes
Invoke-Step 6 "Popular + uncommon API smokes" {
  & $py (Join-Path $RepoRoot "backend\scripts\test_pro_compare.py") 2>&1 | Tee-Object -FilePath $LogFile -Append | Out-Null
  $proExit = $LASTEXITCODE
  $env:OVERNIGHT_UNCOMMON_COUNT = "9"
  & $py (Join-Path $RepoRoot "scripts\overnight_uncommon_subset.py") 2>&1 | Tee-Object -FilePath $LogFile -Append | Out-Null
  $uncExit = $LASTEXITCODE
  if ($proExit -ne 0 -or $uncExit -ne 0) {
    return @{ status = "FAIL"; exit = 1; detail = "popular exit=$proExit uncommon exit=$uncExit" }
  }
  return "popular + uncommon OK"
}

# 7. npm run build
Invoke-Step 7 "npm run build" {
  npm run build 2>&1 | Tee-Object -FilePath $LogFile -Append
}

# 8-11. Browser steps
$browserStatus = if ($SkipBrowser) { "WARN" } else { "WARN" }
$browserDetail = if ($SkipBrowser) {
  "SKIP_BROWSER=1 - manual checklist printed below"
} else {
  "No headless browser harness - manual checklist printed below"
}
Print-BrowserManualChecklist
Invoke-Step 8 "Deep links (browser)" { return @{ status = $browserStatus; detail = $browserDetail } }
Invoke-Step 9 "Scanning UX (browser)" { return @{ status = $browserStatus; detail = $browserDetail } }
Invoke-Step 10 "Table CSS (browser)" { return @{ status = $browserStatus; detail = $browserDetail } }
Invoke-Step 11 "Vertical scroll (browser)" {
  npm test -- lib/forward-vertical-wheel.test.ts 2>&1 | Tee-Object -FilePath $LogFile -Append | Out-Null
  $unitExit = $LASTEXITCODE
  if ($unitExit -eq 0) {
    return @{ status = $browserStatus; detail = "unit test PASS; $browserDetail" }
  }
  return @{ status = "FAIL"; detail = "forward-vertical-wheel unit test failed" }
}

# 12. Section HTML prod spot-check
Invoke-Step 12 "Section HTML prod spot-check" {
  & $py (Join-Path $RepoRoot "scripts\overnight_section_spotcheck.py") 2>&1 | Tee-Object -FilePath $LogFile -Append
}

# 13. Interim vs annual
Invoke-Step 13 "Interim vs annual spot-check" {
  & $py (Join-Path $RepoRoot "scripts\pre_promote_api_checks.py") --probe interim 2>&1 | Tee-Object -FilePath $LogFile -Append
}

# 14. Cold-start timing
Invoke-Step 14 "Cold-start timing" {
  & $py (Join-Path $RepoRoot "scripts\pre_promote_api_checks.py") --probe cold 2>&1 | Tee-Object -FilePath $LogFile -Append
}

# 15. 402 / paywall paths
Invoke-Step 15 "402 / paywall paths" {
  & $py (Join-Path $RepoRoot "scripts\pre_promote_api_checks.py") --probe paywall 2>&1 | Tee-Object -FilePath $LogFile -Append
}

# 16. Lint warnings
Invoke-Step 16 "Lint warnings" {
  $lintOut = npm run lint 2>&1 | Tee-Object -FilePath $LogFile -Append
  $lintText = ($lintOut | Out-String)
  $lintExit = $LASTEXITCODE
  if ($lintExit -ne 0) {
    return @{ status = "FAIL"; exit = $lintExit; detail = "eslint errors present" }
  }
  if ($lintText -match "Warning:") {
    return @{ status = "WARN"; detail = "eslint warnings present (non-blocking)" }
  }
  return "eslint clean"
}

$failCount = @($Summary | Where-Object { $_.status -eq "FAIL" }).Count
$warnCount = @($Summary | Where-Object { $_.status -eq "WARN" }).Count
$skipCount = @($Summary | Where-Object { $_.status -eq "SKIP" }).Count
$passCount = @($Summary | Where-Object { $_.status -eq "PASS" }).Count
Write-Log "--- SUMMARY pass=$passCount warn=$warnCount skip=$skipCount fail=$failCount ---"
foreach ($row in $Summary) {
  Write-Log ("  {0,2} {1,-6} {2}s {3}" -f $row.step, $row.status, $row.seconds, $row.detail)
}

$meta = [pscustomobject]@{
  branch  = $git.branch
  commit  = $git.commit
  dirty   = $git.dirty
  api     = $ApiBase
  app     = $AppBase
  started = $stamp
  pass    = $passCount
  warn    = $warnCount
  skip    = $skipCount
  fail    = $failCount
  steps   = $Summary
}
$jsonPath = Join-Path $logsDir "pre-promote-$stamp-summary.json"
$meta | ConvertTo-Json -Depth 6 | Set-Content -Path $jsonPath -Encoding utf8
Write-Log "Summary JSON: $jsonPath"
Write-Log "Log file: $LogFile"
if ($failCount -gt 0) { exit 1 }
exit 0
