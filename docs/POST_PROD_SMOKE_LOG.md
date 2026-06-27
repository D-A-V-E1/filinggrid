# Post-production smoke log

Browser and HTTP smoke results for **peerdisclosures.com** after custom domains went live.

**Date:** 2026-06-26  
**Environment:** Production (`https://peerdisclosures.com`, `https://api.peerdisclosures.com`)  
**Method:** curl + cursor-ide-browser MCP  
**Stripe / auth:** No live payment or magic-link sign-in completed (manual follow-up)

Checklist reference: [POST_PROD_CHECKLIST.md](./POST_PROD_CHECKLIST.md) · Full E2E: [PRODUCTION_SMOKE_TEST.md](./PRODUCTION_SMOKE_TEST.md)

---

## Summary

| Step | Result | Notes |
|------|--------|-------|
| API health `GET api.peerdisclosures.com/health` | **PASS** | 200 — `{"status":"ok","service":"peer-disclosures-api","features":{"foreign_filing_fallback":2}}` |
| Frontend proxy `GET peerdisclosures.com/api/backend/health` | **PASS** | 200 — proxied API health OK |
| Home — Peer Disclosures branding, no FilingGrid | **PASS** | Title/nav “Peer Disclosures”; no FilingGrid strings in snapshot |
| Compare 3 tickers (`aapl-vs-msft-vs-googl`) without login | **PASS** | Filings loaded (FY26·Q1); sections + XBRL headline metrics |
| 4th ticker paywall | **PASS** | NVDA → PaywallModal “Compare more tickers”; alert: Free tier up to 3 tickers; `you@email.com` placeholder |
| `/account` sign-in UI — no work email gate | **PASS** | “Sign in with email”; placeholder `you@email.com`; no corporate copy |
| `/pricing` — no Corporate email required | **PASS** | Free + Professional plans; upgrade CTA present |
| `/terms` — correct copy | **PASS** | Peer Disclosures Terms; `legal@peerdisclosures.com`; last updated June 20, 2026 |
| `/privacy` — correct copy | **PASS** | Peer Disclosures Privacy; `privacy@peerdisclosures.com`; last updated June 20, 2026 |
| Segment section (`nvda-vs-amd-vs-intc` → Segment Information) | **PASS** | “Viewing: note segments”; NVDA shows **XBRL DISCLOSURE TEXT** inline (`SegmentReportingDisclosureTextBlock`); “View SEC filing excerpt” available per column |
| `POST /dev/tier` → 404 | **SKIP** | Not executed autonomously against live API — verify manually (expect **404**) |
| Stripe live checkout E2E | **SKIP** | Manual — requires magic link + real/live test payment |
| Magic link sign-in E2E | **SKIP** | Manual — would send email to real inbox |
| Compare header — no Free/Pro dev toggle | **PASS** | Observed on 3-ticker compare; no dev tier toggle in UI |

**Overall:** 11 PASS · 3 SKIP (manual) · 0 FAIL

---

## Step detail

### 1. API health

```text
GET https://api.peerdisclosures.com/health
→ 200 {"status":"ok","service":"peer-disclosures-api",...}
```

Render fallback also healthy: `https://peerdisclosures-api.onrender.com/health` → 200 (same payload).

### 2. Home

- URL: `https://peerdisclosures.com/`
- Title: *Peer Disclosures — SEC Filing Comparison Workspace*
- Branding: nav link “Peer Disclosures”; hero copy uses Peer Disclosures throughout
- FilingGrid: not present in accessibility snapshot

### 3. Free compare (3 tickers)

- URL: `https://peerdisclosures.com/compare/aapl-vs-msft-vs-googl`
- AAPL, MSFT, GOOGL columns loaded without sign-in
- Filing period picker populated (FY26·Q1, FY25, etc.)
- Financial Statements section with SEC XBRL fast path

### 4. Fourth ticker paywall

- Action: add NVDA on 3-ticker compare
- Modal: “Compare more tickers” / Professional $29/mo
- Email field: `you@email.com` — no corporate requirement
- Alert: “Free tier supports up to 3 tickers…”

### 5. Account sign-in

- URL: `https://peerdisclosures.com/account`
- “Sign in with email” → magic link form
- Placeholder `you@email.com`; button “Send magic link”
- No work-email or corporate gate copy

### 6. Pricing

- URL: `https://peerdisclosures.com/pricing`
- Free and Professional tiers listed
- No “Corporate email required” text

### 7. Terms & Privacy

- `/terms` — Peer Disclosures entity, Stripe billing section, Delaware governing law
- `/privacy` — Supabase auth + Stripe billing; no filing content in account DB

### 8. Segment Information (optional)

- URL: `https://peerdisclosures.com/compare/nvda-vs-amd-vs-intc?section=segment_information`
- Initial load showed Financial Statements; clicking **Segment Information** nav → “Viewing: note segments”
- NVDA column: inline XBRL segment disclosure text (Compute & Networking / Graphics tables)
- “View SEC filing excerpt” buttons present — EDGAR fallback path available per column

---

## Manual follow-ups

1. **`POST /dev/tier`** — confirm **404** on production API ([POST_PROD_CHECKLIST.md](./POST_PROD_CHECKLIST.md))
2. **Stripe live E2E** — checkout, webhook, Portal cancel ([PRODUCTION_SMOKE_TEST.md](./PRODUCTION_SMOKE_TEST.md))
3. **Magic link sign-in** — any email → `?auth=success` on production Supabase URLs
4. **Stripe Dashboard** — rename/archive legacy FilingGrid products if Checkout still shows old name ([STRIPE_SETUP.md § 10](./STRIPE_SETUP.md#10-rename-legacy-filinggrid-products-dashboard))

---

## Issues found

None in this smoke pass — no code changes required.

---

## 2026-06-27 — AMD impairment fix + regression smoke

**Date:** 2026-06-27  
**Environment:** Production (`https://peerdisclosures.com`, `https://api.peerdisclosures.com`)  
**Method:** curl + cursor-ide-browser MCP  
**Fix commit:** `36fbe4a` (pushed to `main`; backend redeploy required for cache v9)  
**Stripe / auth:** No live payment or magic-link sign-in completed

### Summary

| Step | Result | Notes |
|------|--------|-------|
| API health `GET api.peerdisclosures.com/health` | **PASS** | 200 — `{"status":"ok","service":"peer-disclosures-api",...}` |
| Frontend proxy `GET peerdisclosures.com/api/backend/health` | **PASS** | 200 |
| Home — Peer Disclosures branding | **PASS** | Title/nav “Peer Disclosures”; hero copy present |
| Compare 3 tickers (`aapl-vs-msft-vs-googl`) | **PASS** | Page loads; columns render after API warmup |
| 4th ticker paywall | **SKIP** | Not re-run this pass (see 2026-06-26 — PASS) |
| `/account` sign-in UI | **PASS** | “Sign in with email” / “Sign in to your account” |
| `/pricing` | **PASS** | HTTP 200 |
| `/terms` | **PASS** | HTTP 200 |
| `/privacy` | **PASS** | HTTP 200 |
| AMD impairment (`nvda-vs-amd-vs-intc` → Impairment) | **FAIL** (pre-deploy) | AMD column shows **View SEC filing excerpt** (false positive from stale parse cache v8); click shows brief **Loading excerpt…** then Professional paywall on latest period. API `GET /parse/section?...AMD&note-impairment&fiscal_year=2025` → **404**. **Expected after deploy:** AMD → **Not in this filing**. |
| Narrative Business section excerpt button | **FAIL** (pre-deploy) | `?section=business` did not activate Business; section nav has no **Business** item under “Business & Risk” (only Risk Factors+). Columns still on Financial Statements. Likely frontend not yet on `a54b3a8` or Business missing from indexed FY26·Q1 sections. |
| `POST /dev/tier` → 404 | **SKIP** | Manual |
| Stripe / magic link E2E | **SKIP** | Manual |

**Overall:** 9 PASS · 2 FAIL (known pre-deploy) · 3 SKIP

### Root cause (AMD impairment)

Production disk cache (`PARSE_CACHE_VERSION=8`) still indexes AMD `note-impairment` from a risk-factor bullet (“We may incur future impairments…”). Live extraction with tightened patterns returns **404**, so the UI offered an excerpt that could not load. Fix in `36fbe4a`: bump cache to **v9**, reject bullet-prefixed pseudo-headings, prioritize “Not in this filing” over XBRL footnote spinner, and surface 404/empty excerpt errors in `FilingColumn`.

### Re-test after deploy

1. `nvda-vs-amd-vs-intc` → period **FY25** (annual) → **Impairment** → AMD should read **Not in this filing**.
2. Same compare → **Business** nav item → **View SEC filing excerpt** on each column (post `a54b3a8`).
3. Click AMD impairment excerpt (if any) — spinner must clear; no infinite **Loading excerpt…**.

---

## Pro mode smoke — 2026-06-27

**Date:** 2026-06-27  
**Environment:** Production (`https://peerdisclosures.com`, `https://api.peerdisclosures.com`)  
**Method:** curl + cursor-ide-browser MCP  
**Stripe / auth:** No session in browser; magic link + live checkout not completed (manual follow-up per [POST_PROD_CHECKLIST.md § Stripe live E2E](./POST_PROD_CHECKLIST.md#stripe-live-e2e-manual-real-payment))

### Summary

| Step | Result | Notes |
|------|--------|-------|
| API health `GET api.peerdisclosures.com/health` | **PASS** | 200 — `{"status":"ok","service":"peer-disclosures-api","features":{"foreign_filing_fallback":2}}` |
| Dev toggle `POST api.peerdisclosures.com/dev/tier` | **PASS** | 404 — `{"detail":"Not found"}` |
| Sitemap `GET peerdisclosures.com/sitemap.xml` | **PASS** | 200 — valid XML urlset |
| Compare 3 tickers (`aapl-vs-msft-vs-nvda`) without login | **PASS** | AAPL, MSFT, NVDA columns; FY26·Q2 period; Financial Statements + section nav |
| 4th ticker paywall (GOOGL) | **PASS** | PaywallModal “Compare more tickers”; alert: Free tier up to 3 tickers; `you@email.com` |
| `/account` sign-in UI | **PASS** | “Sign in with email”; magic link modal; placeholder `you@email.com`; no corporate gate |
| `/pricing` — Upgrade to Professional CTA | **PASS** | Opens paywall modal (auth before checkout) |
| Upgrade → Stripe Checkout | **SKIP** | Not signed in — modal requires magic link; cannot reach Checkout without inbox |
| 4+ ticker compare (Pro) | **SKIP** | No Pro session |
| Full GAAP statements unlocked (Pro) | **SKIP** | Free user sees “Upgrade to Professional” on full GAAP block |
| Saved groups (Pro CRUD) | **SKIP** (Pro) / **PASS** (free gate) | “Saved groups” → paywall: “Saved peer groups are available on the Professional plan.” |
| Historical period beyond free window (Pro) | **SKIP** | Pro archive not verifiable without subscription |
| SEC filing excerpt on narrative section (Pro) | **SKIP** | Excerpt buttons gated; not tested as Pro |
| `GET /auth/me` tier check | **SKIP** | No JWT — browser session unsigned |
| Stripe live checkout E2E | **SKIP** | Manual — real payment + webhook ([POST_PROD_CHECKLIST.md](./POST_PROD_CHECKLIST.md)) |

**Overall:** 8 PASS · 8 SKIP · 0 FAIL

**Pro verification status:** **Blocked on auth/payment** — free baseline and API checks pass; full Pro behavior requires magic-link sign-in and (for new subscribers) Stripe Live Checkout.

### Manual steps to complete Pro smoke

1. **`/account`** → **Sign in with email** → enter any email → **Send magic link** → open link from inbox → confirm `?auth=success`.
2. **`/pricing`** or compare paywall → **Upgrade to Professional** → Stripe **Live** Checkout opens → complete payment (or use live test card per Dashboard) → redirect `?checkout=success`.
3. Stripe Dashboard → Events → confirm `checkout.session.completed` **200** at `https://api.peerdisclosures.com/webhooks/stripe`.
4. **`GET /auth/me`** (browser devtools or curl with session JWT) → `tier: professional`, `limits.max_columns: 8`.
5. Compare **`aapl-vs-msft-vs-nvda-vs-googl`** — 4 columns load; **Professional** badge.
6. **Full GAAP financial statements** — line items visible (no upgrade lock).
7. **Saved groups** — create/read/update/delete at `/peer-groups`.
8. **Filing period** — periods beyond latest + last FY available.
9. Narrative section (e.g. **MD&A**) → **View SEC filing excerpt** loads inline text.
10. **`/account`** → **Manage billing** → Stripe Customer Portal.

