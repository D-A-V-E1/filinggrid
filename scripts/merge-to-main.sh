#!/usr/bin/env bash
# Safe branch -> main promotion (merge + optional push).
# NEVER force-pushes main, skips hooks, or updates git config.
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

MAIN_BRANCH="main"
SOURCE_BRANCH="${SOURCE_BRANCH:-}"
API_BASE="${API_URL:-${FILINGGRID_API:-https://peerdisclosures-api.onrender.com}}"
APP_BASE="${APP_URL:-https://peerdisclosures.com}"
SKIP_PRE_PROMOTE="${SKIP_PRE_PROMOTE:-0}"
FAST_PRE_PROMOTE="${FAST_PRE_PROMOTE:-0}"
FULL_PRE_PROMOTE="${FULL_PRE_PROMOTE:-0}"
DRY_RUN="${DRY_RUN:-0}"
NO_PUSH="${NO_PUSH:-0}"
ALLOW_DIRTY="${ALLOW_DIRTY:-0}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --source-branch) SOURCE_BRANCH="$2"; shift 2 ;;
    --api-base) API_BASE="$2"; shift 2 ;;
    --app-base) APP_BASE="$2"; shift 2 ;;
    --skip-pre-promote) SKIP_PRE_PROMOTE=1; shift ;;
    --fast-pre-promote) FAST_PRE_PROMOTE=1; shift ;;
    --dry-run) DRY_RUN=1; shift ;;
    --no-push) NO_PUSH=1; shift ;;
    --allow-dirty) ALLOW_DIRTY=1; shift ;;
    -h|--help)
      echo "Usage: bash scripts/merge-to-main.sh [--source-branch BRANCH] [--dry-run] [--no-push] [--skip-pre-promote] [--allow-dirty]"
      exit 0
      ;;
    *) echo "Unknown option: $1" >&2; exit 2 ;;
  esac
done

mkdir -p logs
STAMP="$(date +%Y%m%d-%H%M%S)"
LOG="logs/merge-to-main-${STAMP}.log"
SUMMARY="logs/merge-to-main-${STAMP}-summary.json"
MERGE_COMMIT=""
PUSH_RESULT="skipped"
PRE_PROMOTE_RESULT="skipped"
EXIT_CODE=0
START_BRANCH=""
SOURCE_SHA=""

steps_json="["
first_step=1

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG"; }

add_step() {
  local name="$1" status="$2" detail="$3"
  local esc
  esc=$(printf '%s' "$detail" | sed 's/\\/\\\\/g; s/"/\\"/g')
  [[ $first_step -eq 1 ]] && first_step=0 || steps_json+=","
  steps_json+="{\"name\":\"$name\",\"status\":\"$status\",\"detail\":\"$esc\"}"
  log "  $name : $status - $detail"
}

run_git() {
  local out ec=0
  out=$(git "$@" 2>&1) || ec=$?
  [[ -n "$out" ]] && while IFS= read -r line; do log "    $line"; done <<<"$out"
  return $ec
}

resolve_python() {
  local py="${ROOT}/backend/.venv/bin/python"
  [[ -x "$py" ]] || py=python3
  echo "$py"
}

print_rollback() {
  log "--- Rollback instructions ---"
  log "  Vercel:  Dashboard -> Deployments -> previous production deploy -> Promote to Production"
  log "  Render:  Dashboard -> peerdisclosures-api -> deploy history -> Rollback"
  if [[ -n "$MERGE_COMMIT" ]]; then
    log "  Git:     git checkout main && git pull --ff-only origin main"
    log "           git revert -m 1 $MERGE_COMMIT   # then git push origin main"
  else
    log "  Git:     git checkout main && git reset --hard origin/main   # only if merge not pushed"
  fi
  log "  Docs:    docs/PRODUCTION_SMOKE_TEST.md"
}

print_post_deploy() {
  log "--- Post-deploy manual steps ---"
  log "  1. Wait for Vercel production deploy (main branch) to finish"
  log "  2. Wait for Render API deploy from main (render.yaml) to finish"
  log "  3. Section spot-check: python scripts/overnight_section_spotcheck.py"
  log "  4. Browser checklist: docs/PRODUCTION_SMOKE_TEST.md"
  log "  5. Deep link: ${APP_BASE}/compare/aapl-vs-msft-vs-nvda/deltas?period=interim-2026-Q2"
}

write_summary() {
  steps_json+="]"
  SOURCE_SHA="${SOURCE_SHA:-$(git rev-parse --short "$SOURCE_BRANCH" 2>/dev/null || echo "")}"
  printf '{"started":"%s","sourceBranch":"%s","sourceCommit":"%s","mergeCommit":"%s","dryRun":%s,"noPush":%s,"skipPrePromote":%s,"prePromote":"%s","push":"%s","api":"%s","app":"%s","log":"%s","exitCode":%s,"steps":%s}\n' \
    "$STAMP" "$SOURCE_BRANCH" "$SOURCE_SHA" "$MERGE_COMMIT" \
    "$( [[ "$DRY_RUN" == "1" ]] && echo true || echo false )" \
    "$( [[ "$NO_PUSH" == "1" ]] && echo true || echo false )" \
    "$( [[ "$SKIP_PRE_PROMOTE" == "1" ]] && echo true || echo false )" \
    "$PRE_PROMOTE_RESULT" "$PUSH_RESULT" "$API_BASE" "$APP_BASE" "$LOG" "$EXIT_CODE" "$steps_json" >"$SUMMARY"
  log "Summary JSON: $SUMMARY"
}

abort() {
  log "merge-to-main FAILED: $*"
  add_step "error" "FAIL" "$*"
  EXIT_CODE=1
  print_rollback
  write_summary
  exit "$EXIT_CODE"
}

trap 'write_summary; exit "$EXIT_CODE"' EXIT

log "merge-to-main started dryRun=$DRY_RUN noPush=$NO_PUSH skipPrePromote=$SKIP_PRE_PROMOTE fullPrePromote=$FULL_PRE_PROMOTE"
add_step "init" "PASS" "log=$LOG"

if [[ -z "$SOURCE_BRANCH" ]]; then
  SOURCE_BRANCH="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || true)"
fi
[[ -z "$SOURCE_BRANCH" || "$SOURCE_BRANCH" == "HEAD" ]] && abort "Could not resolve source branch; pass SOURCE_BRANCH or checkout a feature branch"
[[ "$SOURCE_BRANCH" == "$MAIN_BRANCH" ]] && abort "Source branch cannot be '$MAIN_BRANCH'"
add_step "source-branch" "PASS" "$SOURCE_BRANCH"

if [[ -n "$(git status --porcelain 2>/dev/null)" ]]; then
  if [[ "$ALLOW_DIRTY" != "1" ]]; then
    add_step "clean-tree" "FAIL" "working tree dirty"
    abort "Working tree is dirty. Commit, stash, or set ALLOW_DIRTY=1"
  fi
  add_step "clean-tree" "WARN" "dirty tree allowed"
  log "WARNING: merging with a dirty working tree"
else
  add_step "clean-tree" "PASS" "clean"
fi

START_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
SOURCE_SHA="$(git rev-parse --short "$SOURCE_BRANCH" 2>/dev/null || true)"
[[ -z "$SOURCE_SHA" ]] && abort "Source branch '$SOURCE_BRANCH' not found locally"
log "Current branch=$START_BRANCH source=$SOURCE_BRANCH@$SOURCE_SHA api=$API_BASE app=$APP_BASE"

if [[ "$DRY_RUN" == "1" ]]; then
  log "[DRY RUN] would run: git fetch origin"
  add_step "fetch" "SKIP" "dry-run"
  log "[DRY RUN] would verify: origin/$SOURCE_BRANCH"
  add_step "remote-source" "SKIP" "dry-run"
else
  run_git fetch origin || abort "git fetch failed"
  add_step "fetch" "PASS" "origin fetched"
  git rev-parse --verify "origin/$SOURCE_BRANCH" >/dev/null 2>&1 || abort "origin/$SOURCE_BRANCH not found; push your branch first"
  add_step "remote-source" "PASS" "origin/$SOURCE_BRANCH exists"
fi

if [[ "$SKIP_PRE_PROMOTE" == "1" ]]; then
  log "****************************************************************"
  log " DANGER: SKIP_PRE_PROMOTE=1 — promotion gate bypassed!"
  log " Run npm run check:pre-promote before production merge."
  log "****************************************************************"
  add_step "pre-promote" "SKIP" "SKIP_PRE_PROMOTE=1"
  PRE_PROMOTE_RESULT="skipped-danger"
elif [[ "$DRY_RUN" == "1" ]]; then
  if [[ "$FULL_PRE_PROMOTE" == "1" ]]; then
    log "[DRY RUN] would run: bash scripts/pre-promote-check.sh (full)"
    add_step "pre-promote" "SKIP" "dry-run (full)"
  else
    log "[DRY RUN] would run: SKIP_OVERNIGHT=1 bash scripts/pre-promote-check.sh"
    add_step "pre-promote" "SKIP" "dry-run (fast)"
  fi
  PRE_PROMOTE_RESULT="dry-run"
else
  export API_URL="$API_BASE" APP_URL="$APP_BASE" FILINGGRID_API="$API_BASE"
  if [[ "$FULL_PRE_PROMOTE" == "1" ]]; then
    log "Running full pre-promote (FULL_PRE_PROMOTE=1)..."
    if bash "$ROOT/scripts/pre-promote-check.sh" >>"$LOG" 2>&1; then
      add_step "pre-promote" "PASS" "full 16-step gate"
      PRE_PROMOTE_RESULT="pass-full"
    else
      add_step "pre-promote" "FAIL" "pre-promote exit non-zero"
      abort "Pre-promote check failed. Fix failures before merging."
    fi
  else
    log "Running fast pre-promote (SKIP_OVERNIGHT=1)..."
    export SKIP_OVERNIGHT=1
    if bash "$ROOT/scripts/pre-promote-check.sh" >>"$LOG" 2>&1; then
      add_step "pre-promote" "PASS" "fast gate"
      PRE_PROMOTE_RESULT="pass-fast"
    else
      add_step "pre-promote" "FAIL" "pre-promote exit non-zero"
      abort "Pre-promote check failed. Fix failures before merging."
    fi
  fi
fi

log "Ready to merge '$SOURCE_BRANCH' -> $MAIN_BRANCH"
MERGE_MSG="Merge branch '$SOURCE_BRANCH' into main (promote to production)"

if [[ "$DRY_RUN" == "1" ]]; then
  log "[DRY RUN] would run: git checkout $MAIN_BRANCH"
  log "[DRY RUN] would run: git pull --ff-only origin $MAIN_BRANCH"
  log "[DRY RUN] would run: git merge --no-ff -m \"$MERGE_MSG\" $SOURCE_BRANCH"
  if [[ "$NO_PUSH" == "1" ]]; then
    log "[DRY RUN] push skipped (NO_PUSH=1)"
  else
    log "[DRY RUN] would run: git push origin $MAIN_BRANCH"
  fi
  add_step "checkout-main" "SKIP" "dry-run"
  add_step "pull-main" "SKIP" "dry-run"
  add_step "merge" "SKIP" "dry-run"
  add_step "push" "SKIP" "dry-run"
  PUSH_RESULT="dry-run"
else
  run_git checkout "$MAIN_BRANCH" || abort "checkout main failed"
  add_step "checkout-main" "PASS" "$MAIN_BRANCH"

  run_git pull --ff-only origin "$MAIN_BRANCH" || abort "pull main failed"
  add_step "pull-main" "PASS" "ff-only"

  run_git merge --no-ff -m "$MERGE_MSG" "$SOURCE_BRANCH" || abort "merge failed"
  MERGE_COMMIT="$(git rev-parse --short HEAD)"
  add_step "merge" "PASS" "commit=$MERGE_COMMIT"

  if [[ "$NO_PUSH" == "1" ]]; then
    log "NO_PUSH=1 — merge committed locally only"
    add_step "push" "SKIP" "NO_PUSH=1"
    PUSH_RESULT="no-push"
  else
    run_git push origin "$MAIN_BRANCH" || abort "push failed"
    add_step "push" "PASS" "origin/main updated"
    PUSH_RESULT="pushed"
  fi
fi

if [[ "$DRY_RUN" == "1" ]]; then
  log "[DRY RUN] would run: prod_smoke_check.py"
  add_step "post-smoke" "SKIP" "dry-run"
elif [[ "$NO_PUSH" == "1" ]]; then
  add_step "post-smoke" "SKIP" "NO_PUSH=1"
else
  PY="$(resolve_python)"
  log "Post-merge prod smoke..."
  if "$PY" "$ROOT/backend/scripts/prod_smoke_check.py" --api "$API_BASE" --app "$APP_BASE" 2>&1 | tee -a "$LOG"; then
    add_step "post-smoke" "PASS" "prod_smoke_check OK"
  else
    add_step "post-smoke" "WARN" "prod_smoke_check failed (deploy may be in progress)"
    log "Re-run smoke after Vercel/Render deploy completes"
  fi
  print_post_deploy
fi

if [[ "$DRY_RUN" != "1" && "$START_BRANCH" != "$MAIN_BRANCH" ]]; then
  log "Returning to branch: $START_BRANCH"
  run_git checkout "$START_BRANCH" || true
fi

log "merge-to-main completed push=$PUSH_RESULT prePromote=$PRE_PROMOTE_RESULT"
print_rollback
EXIT_CODE=0
