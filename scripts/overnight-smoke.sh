#!/usr/bin/env bash
# Overnight smoke harness (Linux/CI)
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
API_BASE="${FILINGGRID_API:-https://peerdisclosures-api.onrender.com}"
THROTTLE="${FILINGGRID_THROTTLE_S:-5}"
mkdir -p logs
STAMP="$(date +%Y%m%d-%H%M%S)"
LOG="logs/overnight-smoke-${STAMP}.log"
SUMMARY="logs/overnight-smoke-${STAMP}-summary.json"

export FILINGGRID_API="$API_BASE"
export NEXT_PUBLIC_API_URL="$API_BASE"
export FILINGGRID_FY="${FILINGGRID_FY:-latest}"
export FILINGGRID_THROTTLE_S="$THROTTLE"

PY="${ROOT}/backend/.venv/bin/python"
if [[ ! -x "$PY" ]]; then PY=python3; fi

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG"; }
phases=()

run_phase() {
  local id="$1" name="$2"
  shift 2
  log "=== Phase $id: $name ==="
  local t0=$SECONDS ec=0
  if "$@" >>"$LOG" 2>&1; then ec=0; else ec=$?; fi
  local dt=$((SECONDS - t0))
  local st="PASS"
  [[ $ec -ne 0 ]] && st="FAIL"
  log "Phase $id $st in ${dt}s (exit $ec)"
  phases+=("{\"phase\":\"$id\",\"name\":\"$name\",\"status\":\"$st\",\"seconds\":$dt,\"exit\":$ec}")
}

log "Overnight smoke started repo=$ROOT api=$API_BASE"
run_phase A "npm test" npm test
run_phase B "npm run build" npm run build
run_phase C "backend pytest" bash -c "cd backend && $PY -m pytest tests/test_section_excerpt_html.py tests/test_xbrl_notes.py tests/test_xbrl_ifrs.py -q"
run_phase D "prod_smoke_check" "$PY" backend/scripts/prod_smoke_check.py
run_phase E "popular comp API" env FILINGGRID_FY=2025 "$PY" backend/scripts/test_pro_compare.py
log "Cool-down 45s before Phase F (post popular-comp load)"
sleep 45
if [[ -f scripts/delta-accuracy-smoke.test.ts ]]; then
  run_phase F "delta vitest" npx vitest run scripts/delta-accuracy-smoke.test.ts --testTimeout=900000
else
  log "Phase F WARN - missing delta test"
fi
log "Cool-down 45s before Phase G (post delta vitest load)"
sleep 45
run_phase G "section spot-check" "$PY" scripts/overnight_section_spotcheck.py
OVERNIGHT_UNCOMMON_COUNT=9 run_phase H "uncommon subset" "$PY" scripts/overnight_uncommon_subset.py
log "Phase I WARN - skipped test-launch-scenarios (local servers)"
printf '[%s]\n' "${phases[@]}" > "$SUMMARY"
log "Done. Log=$LOG Summary=$SUMMARY"
