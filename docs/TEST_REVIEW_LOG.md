# Test Review Log

Structured test-mode review for Peer Disclosures rebrand and Professional checkout changes.

**Date:** 2026-06-26  
**Environment:** Local (backend `127.0.0.1:8000`, frontend `localhost:3000`)  
**Stripe:** Test mode — no live checkout completed

---

## Step 1 — Automated backend tests

| Result | Notes |
|--------|-------|
| **PASS** | `pytest tests/test_stripe_checkout.py tests/test_tier_gates.py tests/test_jwt_auth.py tests/test_stripe_webhooks.py` — **36 passed**, 0 failed (~1.8s) |
| | Includes `test_create_checkout_allows_consumer_email` (Gmail not blocked server-side) |

---

## Step 2 — Frontend build

| Result | Notes |
|--------|-------|
| **PASS** | `npm run build` completed successfully |
| | ESLint warnings only (pre-existing): `MagicLinkForm.tsx` exhaustive-deps, `TickerSearchBar.tsx` aria-expanded |

---

## Step 3 — API health

| Result | Notes |
|--------|-------|
| **PASS** | Backend started locally; `GET /health` → 200, `status: ok` |
| | **Minor:** response `service` field was `filinggrid-api` → fixed to `peer-disclosures-api` in `backend/main.py` |

---

## Step 4 — Browser review (localhost:3000)

| Sub-step | Result | Notes |
|----------|--------|-------|
| **4a Home** | PASS | Title and nav: **Peer Disclosures**; no FilingGrid in UI |
| **4b Free compare (3 tickers)** | PASS | `/compare/aapl-vs-msft-vs-googl` loaded sections + XBRL without login |
| **4c 4th ticker paywall** | PASS | Selecting NVDA on 3-ticker compare opened paywall: “Compare more tickers”, column-limit message |
| **4d /account sign-in** | PASS | Magic link UI; placeholder `you@email.com`; no work-email gate copy |
| **4e /pricing** | PASS | Free + Professional plans; no “Corporate email required”; upgrade opens paywall |
| **4f /terms & /privacy** | PASS | Peer Disclosures branding throughout; no corporate email requirement for Pro |
| **4g Gmail in paywall/auth** | PASS | `test@gmail.com` accepted in account sign-in and paywall forms; Send magic link enabled; no corporate block in UI |

**Not tested:** Full Stripe Checkout redirect / payment completion (requires magic-link auth + test checkout session).

---

## Step 5 — Issue summary

| # | Step | Severity | Issue | Fix |
|---|------|----------|-------|-----|
| 1 | 3 | Low | Health JSON still reported `service: filinggrid-api` | Renamed to `peer-disclosures-api` in `backend/main.py` |

No user-facing FilingGrid strings found in UI. Internal localStorage/event prefixes (`filinggrid:*`) remain for session continuity.

---

## Step 6 — Re-test after fix

| Result | Notes |
|--------|-------|
| **PASS** | Backend pytest suite re-run: 36 passed |

---

## Manual follow-ups

1. **Stripe Dashboard:** Rename legacy product if Checkout still shows “FilingGrid Professional (Test)” — see [STRIPE_SETUP.md § 10](./STRIPE_SETUP.md#10-rename-legacy-filinggrid-products-dashboard).
2. **Production smoke:** Repeat browser checks on `peerdisclosures.com` after deploy.
3. **Optional:** Rename Docker image/container names in docs (`filinggrid-api`) — ops/docs only, not user-facing.
