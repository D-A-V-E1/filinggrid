#!/usr/bin/env bash
# Pre-promote tightening checklist — 16 steps (Linux/CI)
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

API_BASE="${API_URL:-${FILINGGRID_API:-https://peerdisclosures-api.onrender.com}}"
APP_BASE="${APP_URL:-https://peerdisclosures.com}"
THROTTLE="${FILINGGRID_THROTTLE_S:-5}"
SKIP_BROWSER="${SKIP_BROWSER:-0}"
SKIP_OVERNIGHT="${SKIP_OVERNIGHT:-0}"
FULL_OVERNIGHT="${FULL_OVERNIGHT:-0}"

mkdir -p logs
STAMP="$(date +%Y%m%d-%H%M%S)"
LOG="logs/pre-promote-${STAMP}.log"
SUMMARY="logs/pre-promote-${STAMP}-summary.json"

export FILINGGRID_API="$API_BASE"
export API_URL="$API_BASE"
export NEXT_PUBLIC_API_URL="$API_BASE"
export FILINGGRID_FY="${FILINGGRID_FY:-latest}"
export FILINGGRID_THROTTLE_S="$THROTTLE"

PY="${ROOT}/backend/.venv/bin/python"
if [[ ! -x "$PY" ]]; then PY=python3; fi

BRANCH="${BRANCH:-$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo unknown)}"
COMMIT="${COMMIT:-$(git rev-parse --short HEAD 2>/dev/null || echo unknown)}"
DIRTY="clean"
if [[ -n "$(git status --porcelain 2>/dev/null)" ]]; then DIRTY="dirty"; fi

steps_json="["
first=1
fail_count=0
warn_count=0
skip_count=0
pass_count=0

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG"; }

append_step() {
  local step="$1" name="$2" status="$3" seconds="$4" detail="$5"
  local esc_detail
  esc_detail=$(printf '%s' "$detail" | sed 's/\\/\\\\/g; s/"/\\"/g')
  [[ $first -eq 1 ]] && first=0 || steps_json+=","
  steps_json+="{\"step\":$step,\"name\":\"$name\",\"status\":\"$status\",\"seconds\":$seconds,\"detail\":\"$esc_detail\"}"
  case "$status" in
    FAIL) fail_count=$((fail_count + 1)) ;;
    WARN) warn_count=$((warn_count + 1)) ;;
    SKIP) skip_count=$((skip_count + 1)) ;;
    PASS) pass_count=$((pass_count + 1)) ;;
  esac
  log "Step $step $status in ${seconds}s - $detail"
}

run_step() {
  local step="$1" name="$2"
  shift 2
  log "=== Step $step: $name ==="
  local t0=$SECONDS ec=0 detail="" status="PASS"
  local out
  out=$("$@" 2>&1) || ec=$?
  echo "$out" >>"$LOG"
  if [[ $ec -ne 0 ]]; then status="FAIL"; detail="exit $ec"; fi
  local dt=$((SECONDS - t0))
  append_step "$step" "$name" "$status" "$dt" "${detail:-ok}"
  return $ec
}

browser_manual() {
  log "--- Manual browser checklist (steps 8-11) ---"
  log "  8. Deep links: /compare/aapl-vs-msft-vs-nvda/deltas?period=interim-2026-Q2"
  log "  9. Scanning UX: delta counter during load; grid <-> report"
  log " 10. Table CSS: aligned financial statement tables"
  log " 11. Vertical scroll: wheel over grid scrolls page"
  log "Preview: ${APP_BASE}/compare/aapl-vs-msft-vs-nvda?period=interim-2026-Q2"
}

log "Pre-promote check started branch=$BRANCH commit=$COMMIT dirty=$DIRTY api=$API_BASE"

# Step 1
log "=== Step 1: Commit + deploy status ==="
t0=$SECONDS
s1_status="PASS"
s1_detail="branch=$BRANCH commit=$COMMIT $DIRTY"
if curl -sf "${API_BASE}/health" >/dev/null; then
  s1_detail+="; API health 200"
else
  s1_status="FAIL"
  s1_detail+="; API health failed"
fi
append_step 1 "Commit + deploy status" "$s1_status" "$((SECONDS - t0))" "$s1_detail"

# Step 2
log "=== Step 2: Overnight smoke ==="
t0=$SECONDS
s2_status="PASS"
s2_detail=""
if [[ "$SKIP_OVERNIGHT" == "1" ]]; then
  s2_status="SKIP"
  s2_detail="SKIP_OVERNIGHT=1 — run npm run smoke:overnight before promote"
elif [[ "$FULL_OVERNIGHT" == "1" ]]; then
  bash "$ROOT/scripts/overnight-smoke.sh" >>"$LOG" 2>&1 || s2_status="FAIL"
  s2_detail="full overnight harness"
else
  "$PY" "$ROOT/backend/scripts/prod_smoke_check.py" --api "$API_BASE" --app "$APP_BASE" >>"$LOG" 2>&1 || s2_status="FAIL"
  (cd "$ROOT/backend" && "$PY" -m pytest tests/test_section_excerpt_html.py tests/test_xbrl_notes.py tests/test_xbrl_ifrs.py -q) >>"$LOG" 2>&1 || s2_status="FAIL"
  s2_detail="lightweight subset; use FULL_OVERNIGHT=1 for full harness"
fi
append_step 2 "Overnight smoke" "$s2_status" "$((SECONDS - t0))" "$s2_detail"

# Steps 3-7, 12-16 automated
run_step 3 "Counter consistency (API proxy)" "$PY" "$ROOT/scripts/pre_promote_api_checks.py" --probe counter || true
run_step 4 "Full vitest" npm test || true
if [[ -f "$ROOT/scripts/delta-accuracy-smoke.test.ts" ]]; then
  run_step 5 "Delta accuracy smoke" npx vitest run scripts/delta-accuracy-smoke.test.ts --testTimeout=900000 || true
else
  append_step 5 "Delta accuracy smoke" "WARN" 0 "delta-accuracy-smoke.test.ts missing"
fi
log "=== Step 6: Popular + uncommon API smokes ==="
t0=$SECONDS
s6="PASS"
s6d=""
"$PY" "$ROOT/backend/scripts/test_pro_compare.py" >>"$LOG" 2>&1; pe=$?
OVERNIGHT_UNCOMMON_COUNT=9 "$PY" "$ROOT/scripts/overnight_uncommon_subset.py" >>"$LOG" 2>&1; ue=$?
[[ $pe -ne 0 || $ue -ne 0 ]] && s6="FAIL" && s6d="popular=$pe uncommon=$ue"
append_step 6 "Popular + uncommon API smokes" "$s6" "$((SECONDS - t0))" "${s6d:-ok}"
run_step 7 "npm run build" npm run build || true

# Browser steps 8-11
browser_manual
bd="manual checklist — set SKIP_BROWSER=0 to note browser needed"
[[ "$SKIP_BROWSER" == "1" ]] && bd="SKIP_BROWSER=1; $bd"
for n in 8 9 10; do
  append_step "$n" "Browser step $n" "WARN" 0 "$bd"
done
log "=== Step 11: Vertical scroll (browser) ==="
t0=$SECONDS
s11="WARN"
npm test -- lib/forward-vertical-wheel.test.ts >>"$LOG" 2>&1 && s11="WARN" || s11="FAIL"
append_step 11 "Vertical scroll (browser)" "$s11" "$((SECONDS - t0))" "unit test + $bd"

run_step 12 "Section HTML prod spot-check" "$PY" "$ROOT/scripts/overnight_section_spotcheck.py" || true
run_step 13 "Interim vs annual spot-check" "$PY" "$ROOT/scripts/pre_promote_api_checks.py" --probe interim || true
run_step 14 "Cold-start timing" "$PY" "$ROOT/scripts/pre_promote_api_checks.py" --probe cold || true
run_step 15 "402 / paywall paths" "$PY" "$ROOT/scripts/pre_promote_api_checks.py" --probe paywall || true

log "=== Step 16: Lint warnings ==="
t0=$SECONDS
lint_out=$(npm run lint 2>&1) || true
echo "$lint_out" >>"$LOG"
s16="PASS"
s16d="eslint clean"
if echo "$lint_out" | grep -q "Error:"; then s16="FAIL"; s16d="eslint errors"; fi
if echo "$lint_out" | grep -q "Warning:"; then
  [[ "$s16" == "PASS" ]] && s16="WARN" && s16d="eslint warnings (non-blocking)"
fi
append_step 16 "Lint warnings" "$s16" "$((SECONDS - t0))" "$s16d"

log "--- SUMMARY pass=$pass_count warn=$warn_count skip=$skip_count fail=$fail_count ---"
steps_json+="]"
printf '{"branch":"%s","commit":"%s","dirty":"%s","api":"%s","app":"%s","started":"%s","pass":%s,"warn":%s,"skip":%s,"fail":%s,"steps":%s}\n' \
  "$BRANCH" "$COMMIT" "$DIRTY" "$API_BASE" "$APP_BASE" "$STAMP" \
  "$pass_count" "$warn_count" "$skip_count" "$fail_count" "$steps_json" >"$SUMMARY"
log "Summary JSON: $SUMMARY"
log "Log file: $LOG"
[[ $fail_count -gt 0 ]] && exit 1
exit 0
