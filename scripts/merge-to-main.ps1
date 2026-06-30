# Safe branch -> main promotion (merge + optional push).
# NEVER force-pushes main, skips hooks, or updates git config.
param(
  [string]$SourceBranch = "",
  [string]$ApiBase = $(if ($env:API_URL) { $env:API_URL } else { "https://peerdisclosures-api.onrender.com" }),
  [string]$AppBase = $(if ($env:APP_URL) { $env:APP_URL } else { "https://peerdisclosures.com" }),
  [switch]$SkipPrePromote,
  [switch]$FastPrePromote,
  [switch]$DryRun,
  [switch]$NoPush,
  [switch]$AllowDirty
)

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $RepoRoot

# Env overrides
if ($env:SOURCE_BRANCH) { $SourceBranch = $env:SOURCE_BRANCH }
if ($env:SKIP_PRE_PROMOTE -eq "1") { $SkipPrePromote = $true }
if ($env:FAST_PRE_PROMOTE -eq "1") { $FastPrePromote = $true }
if ($env:DRY_RUN -eq "1") { $DryRun = $true }
if ($env:NO_PUSH -eq "1") { $NoPush = $true }
if ($env:ALLOW_DIRTY -eq "1") { $AllowDirty = $true }

$MainBranch = "main"
$FullPrePromote = ($env:FULL_PRE_PROMOTE -eq "1")

$logsDir = Join-Path $RepoRoot "logs"
New-Item -ItemType Directory -Force -Path $logsDir | Out-Null
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$LogFile = Join-Path $logsDir "merge-to-main-$stamp.log"
$SummaryPath = Join-Path $logsDir "merge-to-main-$stamp-summary.json"
$Steps = [System.Collections.Generic.List[object]]::new()
$mergeCommit = ""
$pushResult = "skipped"
$prePromoteResult = "skipped"
$exitCode = 0

function Write-Log([string]$Message, [string]$Color = "") {
  $line = "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] $Message"
  Add-Content -Path $LogFile -Value $line -Encoding utf8
  if ($Color) { Write-Host $line -ForegroundColor $Color }
  else { Write-Host $line }
}

function Add-Step([string]$Name, [string]$Status, [string]$Detail = "") {
  [void]$Steps.Add([pscustomobject]@{ name = $Name; status = $Status; detail = $Detail })
  Write-Log "  $Name : $Status $(if ($Detail) { "- $Detail" })"
}

function Invoke-Git([string[]]$GitArgs) {
  $out = & git @GitArgs 2>&1
  $ec = $LASTEXITCODE
  if ($out) { $out | ForEach-Object { Write-Log "    $_" } }
  if ($ec -ne 0) { throw "git $($GitArgs -join ' ') failed (exit $ec)" }
  return $out
}

function Resolve-Python {
  $venv = Join-Path $RepoRoot "backend\.venv\Scripts\python.exe"
  if (Test-Path $venv) { return $venv }
  return "python"
}

function Print-RollbackInstructions([string]$MergeSha) {
  Write-Log "--- Rollback instructions ---"
  Write-Log "  Vercel:  Dashboard -> Deployments -> previous production deploy -> Promote to Production"
  Write-Log "  Render:  Dashboard -> peerdisclosures-api -> deploy history -> Rollback"
  if ($MergeSha) {
    Write-Log "  Git:     git checkout main && git pull --ff-only origin main"
    Write-Log "           git revert -m 1 $MergeSha   # creates revert commit; then git push origin main"
  } else {
    Write-Log "  Git:     git checkout main && git reset --hard origin/main   # only if merge not pushed"
  }
  Write-Log "  Docs:    docs/PRODUCTION_SMOKE_TEST.md"
}

function Print-PostDeployManualSteps {
  Write-Log "--- Post-deploy manual steps ---"
  Write-Log "  1. Wait for Vercel production deploy (main branch) to finish"
  Write-Log "  2. Wait for Render API deploy from main (render.yaml) to finish"
  Write-Log "  3. Section spot-check: python scripts/overnight_section_spotcheck.py"
  Write-Log "  4. Browser checklist: docs/PRODUCTION_SMOKE_TEST.md (manual browser table)"
  Write-Log "  5. Deep link: $AppBase/compare/aapl-vs-msft-vs-nvda/deltas?period=interim-2026-Q2"
}

try {
  Write-Log "merge-to-main started dryRun=$DryRun noPush=$NoPush skipPrePromote=$SkipPrePromote fullPrePromote=$FullPrePromote"
  Add-Step "init" "PASS" "log=$LogFile"

  # Resolve source branch
  if (-not $SourceBranch) {
    $SourceBranch = (git rev-parse --abbrev-ref HEAD 2>$null).Trim()
  }
  if (-not $SourceBranch -or $SourceBranch -eq "HEAD") {
    throw "Could not resolve source branch; pass -SourceBranch or checkout a feature branch"
  }
  if ($SourceBranch -eq $MainBranch) {
    throw "Source branch cannot be '$MainBranch'; checkout your feature branch or pass -SourceBranch"
  }
  Add-Step "source-branch" "PASS" $SourceBranch

  # Preflight: clean working tree
  $porcelain = git status --porcelain 2>$null
  $dirty = [bool]$porcelain
  if ($dirty -and -not $AllowDirty) {
    Add-Step "clean-tree" "FAIL" "working tree dirty; commit/stash or pass -AllowDirty"
    throw "Working tree is dirty. Commit, stash, or pass -AllowDirty to continue."
  }
  if ($dirty) {
    Add-Step "clean-tree" "WARN" "dirty tree allowed via -AllowDirty"
    Write-Log "WARNING: merging with a dirty working tree" -Color Yellow
  } else {
    Add-Step "clean-tree" "PASS" "clean"
  }

  $startBranch = (git rev-parse --abbrev-ref HEAD).Trim()
  $sourceSha = (git rev-parse --short $SourceBranch 2>$null).Trim()
  if (-not $sourceSha) {
    throw "Source branch '$SourceBranch' not found locally"
  }
  Write-Log "Current branch=$startBranch source=$SourceBranch@$sourceSha api=$ApiBase app=$AppBase"

  # Fetch origin
  if ($DryRun) {
    Write-Log "[DRY RUN] would run: git fetch origin"
    Add-Step "fetch" "SKIP" "dry-run"
  } else {
    Invoke-Git fetch origin
    Add-Step "fetch" "PASS" "origin fetched"
  }

  # Verify remote source exists (after fetch in real run; best-effort in dry-run)
  if (-not $DryRun) {
    $null = git rev-parse --verify "origin/$SourceBranch" 2>$null
    if ($LASTEXITCODE -ne 0) {
      throw "origin/$SourceBranch not found after fetch; push your branch first"
    }
    Add-Step "remote-source" "PASS" "origin/$SourceBranch exists"
  } else {
    Write-Log "[DRY RUN] would verify: origin/$SourceBranch"
    Add-Step "remote-source" "SKIP" "dry-run"
  }

  # Pre-promote gate
  if ($SkipPrePromote) {
    Write-Log "****************************************************************" -Color Red
    Write-Log " DANGER: SKIP_PRE_PROMOTE=1 - promotion gate bypassed!" -Color Red
    Write-Log " Run npm run check:pre-promote before production merge." -Color Red
    Write-Log "****************************************************************" -Color Red
    Add-Step "pre-promote" "SKIP" "SKIP_PRE_PROMOTE=1"
    $prePromoteResult = "skipped-danger"
  } else {
    $preArgs = @{
      ApiBase = $ApiBase
      AppBase = $AppBase
    }
    if ($FullPrePromote) {
      Write-Log "Running full pre-promote (FULL_PRE_PROMOTE=1)..."
      if ($DryRun) {
        Write-Log "[DRY RUN] would run: npm run check:pre-promote"
        Add-Step "pre-promote" "SKIP" "dry-run (full)"
        $prePromoteResult = "dry-run"
      } else {
        & (Join-Path $RepoRoot "scripts\pre-promote-check.ps1") @preArgs
        if ($LASTEXITCODE -ne 0) {
          Add-Step "pre-promote" "FAIL" "check:pre-promote exit $LASTEXITCODE"
          throw "Pre-promote check failed (exit $LASTEXITCODE). Fix failures before merging."
        }
        Add-Step "pre-promote" "PASS" "full 16-step gate"
        $prePromoteResult = "pass-full"
      }
    } else {
      Write-Log 'Running fast pre-promote (SKIP_OVERNIGHT=1; set FULL_PRE_PROMOTE=1 for full gate)...'
      if ($DryRun) {
        Write-Log "[DRY RUN] would run: npm run check:pre-promote:fast"
        Add-Step "pre-promote" "SKIP" "dry-run (fast)"
        $prePromoteResult = "dry-run"
      } else {
        $env:SKIP_OVERNIGHT = "1"
        & (Join-Path $RepoRoot "scripts\pre-promote-check.ps1") @preArgs
        if ($LASTEXITCODE -ne 0) {
          Add-Step "pre-promote" "FAIL" "check:pre-promote:fast exit $LASTEXITCODE"
          throw "Pre-promote check failed (exit $LASTEXITCODE). Fix failures before merging."
        }
        Add-Step "pre-promote" "PASS" "fast gate (SKIP_OVERNIGHT=1)"
        $prePromoteResult = "pass-fast"
      }
    }
  }

  Write-Log "Ready to merge '$SourceBranch' -> $MainBranch (merge commit for traceability)"

  $mergeMsg = "Merge branch '$SourceBranch' into main (promote to production)"

  if ($DryRun) {
    Write-Log "[DRY RUN] would run: git checkout $MainBranch"
    Write-Log "[DRY RUN] would run: git pull --ff-only origin $MainBranch"
    Write-Log "[DRY RUN] would run: git merge --no-ff -m `"$mergeMsg`" $SourceBranch"
    if (-not $NoPush) {
      Write-Log "[DRY RUN] would run: git push origin $MainBranch"
    } else {
      Write-Log "[DRY RUN] push skipped (NO_PUSH=1)"
    }
    Add-Step "checkout-main" "SKIP" "dry-run"
    Add-Step "pull-main" "SKIP" "dry-run"
    Add-Step "merge" "SKIP" "dry-run"
    Add-Step "push" "SKIP" "dry-run"
    $pushResult = "dry-run"
  } else {
    Invoke-Git checkout $MainBranch
    Add-Step "checkout-main" "PASS" $MainBranch

    Invoke-Git pull --ff-only origin $MainBranch
    Add-Step "pull-main" "PASS" "ff-only"

    Invoke-Git merge --no-ff -m $mergeMsg $SourceBranch
    $mergeCommit = (git rev-parse --short HEAD).Trim()
    Add-Step "merge" "PASS" "commit=$mergeCommit"

    if ($NoPush) {
      Write-Log "NO_PUSH=1 - merge committed locally only; not pushing to origin"
      Add-Step "push" "SKIP" "NO_PUSH=1"
      $pushResult = "no-push"
    } else {
      Invoke-Git push origin $MainBranch
      Add-Step "push" "PASS" "origin/$MainBranch updated"
      $pushResult = "pushed"
    }
  }

  # Post-merge smoke (against current production - baseline before deploy completes)
  if ($DryRun) {
    Write-Log "[DRY RUN] would run: prod_smoke_check.py --api $ApiBase --app $AppBase"
    Add-Step "post-smoke" "SKIP" "dry-run"
  } elseif ($NoPush) {
    Write-Log "Skipping post-merge prod smoke (NO_PUSH=1 - not on remote yet)"
    Add-Step "post-smoke" "SKIP" "NO_PUSH=1"
  } else {
    Write-Log "Post-merge prod smoke (current production endpoints)..."
    $py = Resolve-Python
    & $py (Join-Path $RepoRoot "backend\scripts\prod_smoke_check.py") --api $ApiBase --app $AppBase 2>&1 | ForEach-Object { Write-Log "    $_" }
    $smokeEc = $LASTEXITCODE
    if ($smokeEc -ne 0) {
      Add-Step "post-smoke" "WARN" "prod_smoke_check exit $smokeEc (deploy may still be in progress)"
      Write-Log "Post-merge smoke reported failures - re-run after Vercel/Render deploy completes" -Color Yellow
    } else {
      Add-Step "post-smoke" "PASS" "prod_smoke_check OK"
    }
    Print-PostDeployManualSteps
  }

  if (-not $DryRun -and $startBranch -ne $MainBranch) {
    Write-Log "Returning to branch: $startBranch"
    Invoke-Git checkout $startBranch
  }

  Print-RollbackInstructions $mergeCommit
  Write-Log "merge-to-main completed successfully push=$pushResult prePromote=$prePromoteResult"
}
catch {
  $exitCode = 1
  Write-Log "merge-to-main FAILED: $($_.Exception.Message)" -Color Red
  Add-Step "error" "FAIL" $_.Exception.Message
  Print-RollbackInstructions $mergeCommit
}
finally {
  $summary = [pscustomobject]@{
    started       = $stamp
    sourceBranch  = $SourceBranch
    sourceCommit  = $(try { (git rev-parse --short $SourceBranch 2>$null).Trim() } catch { "" })
    mergeCommit   = $mergeCommit
    dryRun        = [bool]$DryRun
    noPush        = [bool]$NoPush
    skipPrePromote = [bool]$SkipPrePromote
    prePromote    = $prePromoteResult
    push          = $pushResult
    api           = $ApiBase
    app           = $AppBase
    log           = $LogFile
    exitCode      = $exitCode
    steps         = $Steps
  }
  $summary | ConvertTo-Json -Depth 5 | Set-Content -Path $SummaryPath -Encoding utf8
  Write-Log "Summary JSON: $SummaryPath"
}

exit $exitCode
