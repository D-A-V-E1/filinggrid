# Overnight smoke harness - sequential phases, continue on non-fatal failures.
param(
  [string]$ApiBase = "https://peerdisclosures-api.onrender.com",
  [int]$ThrottleSeconds = 5
)

$ErrorActionPreference = "Continue"
$RepoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $RepoRoot

$logsDir = Join-Path $RepoRoot "logs"
New-Item -ItemType Directory -Force -Path $logsDir | Out-Null
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$LogFile = Join-Path $logsDir "overnight-smoke-$stamp.log"
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

function Invoke-Phase {
  param(
    [string]$Id,
    [string]$Name,
    [scriptblock]$Action
  )
  Write-Log "=== Phase ${Id}: $Name ==="
  $sw = [System.Diagnostics.Stopwatch]::StartNew()
  $status = "PASS"
  $detail = ""
  $exit = 0
  try {
    & $Action
    if ($null -ne $LASTEXITCODE) { $exit = [int]$LASTEXITCODE }
  } catch {
    $status = "FAIL"
    $detail = $_.Exception.Message
    $exit = 1
  }
  if ($exit -ne 0 -and $status -eq "PASS") {
    $status = "FAIL"
    if (-not $detail) { $detail = "exit code $exit" }
  }
  $sw.Stop()
  $entry = [pscustomobject]@{
    phase   = $Id
    name    = $Name
    status  = $status
    seconds = [math]::Round($sw.Elapsed.TotalSeconds, 1)
    detail  = $detail
  }
  [void]$Summary.Add($entry)
  $tail = if ($detail) { "- $detail" } else { "" }
  Write-Log "Phase $Id $status in $($entry.seconds)s $tail"
}

$py = Resolve-Python
$env:FILINGGRID_API = $ApiBase
$env:NEXT_PUBLIC_API_URL = $ApiBase
$env:FILINGGRID_FY = "latest"
$env:FILINGGRID_THROTTLE_S = "$ThrottleSeconds"

Write-Log "Overnight smoke started repo=$RepoRoot api=$ApiBase throttle=${ThrottleSeconds}s"

Invoke-Phase "A" "npm test (vitest full)" {
  npm test 2>&1 | Tee-Object -FilePath $LogFile -Append
}

Invoke-Phase "B" "npm run build" {
  npm run build 2>&1 | Tee-Object -FilePath $LogFile -Append
}

Invoke-Phase "C" "backend pytest (section excerpt + xbrl)" {
  Push-Location (Join-Path $RepoRoot "backend")
  & $py -m pytest tests/test_section_excerpt_html.py tests/test_xbrl_notes.py tests/test_xbrl_ifrs.py -q 2>&1 | Tee-Object -FilePath $LogFile -Append
  Pop-Location
}

Invoke-Phase "D" "prod_smoke_check.py" {
  & $py (Join-Path $RepoRoot "backend\scripts\prod_smoke_check.py") 2>&1 | Tee-Object -FilePath $LogFile -Append
}

Invoke-Phase "E" "popular comp API smoke" {
  $env:FILINGGRID_FY = "2025"
  & $py (Join-Path $RepoRoot "backend\scripts\test_pro_compare.py") 2>&1 | Tee-Object -FilePath $LogFile -Append
}

$deltaTest = Join-Path $RepoRoot "scripts\delta-accuracy-smoke.test.ts"
if (Test-Path $deltaTest) {
  Invoke-Phase "F" "delta-accuracy-smoke vitest" {
    npx vitest run scripts/delta-accuracy-smoke.test.ts --testTimeout=900000 2>&1 | Tee-Object -FilePath $LogFile -Append
  }
} else {
  Write-Log "Phase F WARN - delta-accuracy-smoke.test.ts missing"
  [void]$Summary.Add([pscustomobject]@{ phase = "F"; name = "delta-accuracy-smoke"; status = "WARN"; seconds = 0; detail = "file missing" })
}

Invoke-Phase "G" "section excerpt spot-check" {
  & $py (Join-Path $RepoRoot "scripts\overnight_section_spotcheck.py") 2>&1 | Tee-Object -FilePath $LogFile -Append
}

Invoke-Phase "H" "uncommon comp subset" {
  $env:OVERNIGHT_UNCOMMON_COUNT = "9"
  & $py (Join-Path $RepoRoot "scripts\overnight_uncommon_subset.py") 2>&1 | Tee-Object -FilePath $LogFile -Append
}

Write-Log "Phase I WARN - skipped test-launch-scenarios.mjs (requires local dev servers)"
[void]$Summary.Add([pscustomobject]@{ phase = "I"; name = "test-launch-scenarios"; status = "WARN"; seconds = 0; detail = "skipped headless overnight" })

$failCount = @($Summary | Where-Object { $_.status -eq "FAIL" }).Count
$warnCount = @($Summary | Where-Object { $_.status -eq "WARN" }).Count
$passCount = @($Summary | Where-Object { $_.status -eq "PASS" }).Count
Write-Log "--- SUMMARY pass=$passCount warn=$warnCount fail=$failCount ---"
foreach ($row in $Summary) {
  Write-Log ("  {0} {1} {2}s {3}" -f $row.phase, $row.status, $row.seconds, $row.detail)
}
$jsonPath = Join-Path $logsDir "overnight-smoke-$stamp-summary.json"
$Summary | ConvertTo-Json -Depth 4 | Set-Content -Path $jsonPath -Encoding utf8
Write-Log "Summary JSON: $jsonPath"
Write-Log "Log file: $LogFile"
if ($failCount -gt 0) { exit 1 }
exit 0
