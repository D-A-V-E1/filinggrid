# Post-production checklist — Peer Disclosures

Practical checklist to run **after** custom domains, API, Vercel, Supabase prod URLs, and Stripe **Live** mode are in place. Use any email for Professional checkout (Gmail, iCloud, work email, etc.) — no corporate email gate.

**When to run:** First 24 hours after launch, then weekly for the first month.

**Related runbooks:**

- [GO_LIVE_CHECKLIST.md](./GO_LIVE_CHECKLIST.md) — pre-launch timeline and env alignment
- [PRODUCTION_SMOKE_TEST.md](./PRODUCTION_SMOKE_TEST.md) — full billing E2E and rollback criteria
- [POST_PROD_SMOKE_LOG.md](./POST_PROD_SMOKE_LOG.md) — dated browser smoke results
- [STRIPE_SETUP.md](./STRIPE_SETUP.md) — Dashboard products, webhooks, Customer Portal
- [TEST_REVIEW_LOG.md](./TEST_REVIEW_LOG.md) — local test-mode review baseline

---

## Critical — do first

### Stripe live E2E (manual; real payment)

- [ ] Live webhook at `https://api.peerdisclosures.com/webhooks/stripe` — `checkout.session.completed` returns **200** ([STRIPE_SETUP.md § 3](./STRIPE_SETUP.md#3-webhooks))
- [ ] Sign in with any email → **Upgrade to Professional** → Stripe **Live** Checkout opens
- [ ] Complete payment (real card or Stripe live test per Dashboard docs) → redirect `?checkout=success`
- [ ] Stripe Dashboard → Events → latest `checkout.session.completed` delivered successfully
- [ ] Refresh compare with 4+ tickers — up to 8 columns; **Professional** badge
- [ ] `/account` → **Manage billing** → Stripe Customer Portal opens
- [ ] Cancel subscription in Portal → `customer.subscription.deleted` webhook → tier returns to **free** ([PRODUCTION_SMOKE_TEST.md](./PRODUCTION_SMOKE_TEST.md))

### Environment alignment

- [ ] `NEXT_PUBLIC_APP_URL` = `https://peerdisclosures.com` on Vercel Production
- [ ] `NEXT_PUBLIC_API_URL` = `https://api.peerdisclosures.com` (or interim Render URL documented in [GO_LIVE_CHECKLIST.md](./GO_LIVE_CHECKLIST.md))
- [ ] API `APP_URL` = `https://peerdisclosures.com`; `CORS_ORIGINS` includes apex (and `www` if used)
- [ ] Supabase Site URL + redirect URLs → `https://peerdisclosures.com` ([SUPABASE_PROD_URLS.md](./SUPABASE_PROD_URLS.md))
- [ ] Live `STRIPE_SECRET_KEY`, `STRIPE_PRICE_PROFESSIONAL`, `STRIPE_WEBHOOK_SECRET` on Render — no test IDs in production
- [ ] `ALLOW_DEV_TIER_TOGGLE` unset or `false` on API; **no** `NEXT_PUBLIC_ALLOW_DEV_TIER_TOGGLE` on Vercel
- [ ] `POST https://api.peerdisclosures.com/dev/tier` → **404** (dev toggle off)

### Browser smoke (production)

Run manually or record results in [POST_PROD_SMOKE_LOG.md](./POST_PROD_SMOKE_LOG.md). Full script: [PRODUCTION_SMOKE_TEST.md § Manual browser checklist](./PRODUCTION_SMOKE_TEST.md#manual-browser-checklist).

- [ ] `GET https://api.peerdisclosures.com/health` → `{"status":"ok","service":"peer-disclosures-api"}`
- [ ] `GET https://peerdisclosures.com/api/backend/health` → proxied OK
- [ ] Home — **Peer Disclosures** branding; no FilingGrid in UI
- [ ] Compare 3 tickers (e.g. AAPL, MSFT, GOOGL) — loads without login
- [ ] 4th ticker → **PaywallModal** (`column_limit`); magic link form uses `you@email.com` (any email)
- [ ] `/account` — sign-in UI; no work-email gate
- [ ] `/pricing` — Free + Professional; no “Corporate email required”
- [ ] `/terms` and `/privacy` — Peer Disclosures copy; contact emails correct
- [ ] Compare header — **no** Free/Pro dev toggle

Automated HTTP helper:

```powershell
cd backend
.\.venv\Scripts\python.exe scripts/prod_smoke_check.py `
  --api https://api.peerdisclosures.com `
  --app https://peerdisclosures.com
```

---

## Billing & auth

- [ ] Magic link email received (Supabase); redirects to `https://peerdisclosures.com/auth/callback`
- [ ] Magic link works with consumer email (e.g. Gmail) — not blocked server-side ([TEST_REVIEW_LOG.md § 4g](./TEST_REVIEW_LOG.md))
- [ ] `GET /auth/me` with JWT → correct `tier` and `limits.max_columns` before/after checkout ([PRODUCTION_SMOKE_TEST.md § Verify tier via API](./PRODUCTION_SMOKE_TEST.md#verify-tier-via-api))
- [ ] Stripe receipt email (if Customer emails enabled in Live Dashboard)
- [ ] Checkout success/cancel URLs use production domain — not localhost

---

## Product behavior

- [ ] Free tier: 3 columns; latest + last completed fiscal year periods
- [ ] Professional: 8 columns; full filing archive; full GAAP statement line items
- [ ] **Saved groups** CRUD at `/peer-groups` (signed-in Professional)
- [ ] Segment Information section loads (e.g. NVDA vs AMD vs INTC) — inline XBRL text and/or EDGAR fallback as designed
- [ ] Foreign filers (20-F / 6-K) behave as expected with `foreign_filing_fallback` feature flag

---

## Security spot checks

- [ ] All secrets in host secret managers — not in git
- [ ] CORS limited to production frontend origin(s)
- [ ] Stripe webhook signature verification enabled (default in code)
- [ ] No sustained **failed** webhook deliveries in Stripe Dashboard ([PRODUCTION_SMOKE_TEST.md § Rollback](./PRODUCTION_SMOKE_TEST.md#rollback--abort-criteria))

---

## Ops & monitoring (first 24h)

- [ ] Stripe webhook delivery success rate
- [ ] API host error rate (5xx) — Render Metrics
- [ ] Vercel logs for `/api/backend/*` proxy errors
- [ ] Support inbox (`support@peerdisclosures.com`) monitored for billing questions
- [ ] Optional: Sentry or equivalent — see [PRODUCTION_DEPLOY.md](./PRODUCTION_DEPLOY.md)

---

## Stripe Dashboard cleanup

Checkout and receipts show **Stripe product names**, not app copy. See [STRIPE_SETUP.md § 10](./STRIPE_SETUP.md#10-rename-legacy-filinggrid-products-dashboard).

- [ ] Rename legacy product(s) if Checkout still shows **FilingGrid Professional (Test)** → **Peer Disclosures Professional**
- [ ] Settings → Business details → **Public business name** = `Peer Disclosures`
- [ ] Archive or deactivate unused **FilingGrid** test/live products and prices (keep only the live price tied to `STRIPE_PRICE_PROFESSIONAL`)
- [ ] Customer Portal enabled in **Live** mode
- [ ] Live webhook subscribed to required events ([STRIPE_SETUP.md § 3](./STRIPE_SETUP.md#3-webhooks))

---

## Legal & trust

- [ ] `/privacy` and `/terms` reviewed — entity name and contact emails current
- [ ] Footer links to Privacy and Terms on marketing and compare pages
- [ ] `legal@peerdisclosures.com`, `privacy@peerdisclosures.com`, `support@peerdisclosures.com` receive mail (MX or forwarding)
- [ ] Optional: custom Supabase SMTP from `noreply@peerdisclosures.com` — [SETUP_RUNBOOK.md § 2e](./SETUP_RUNBOOK.md#2e-custom-smtp-optional--send-from-peerdisclosurescom)

---

## Nice-to-have

- [ ] Database automated daily backups + documented restore ([PRODUCTION_DEPLOY.md § Database backups](./PRODUCTION_DEPLOY.md#database-backups))
- [ ] Run `python backend/scripts/prewarm_cache.py` after deploy for hot tickers
- [ ] Weekly: failed webhooks in Stripe Dashboard; monthly MRR review
- [ ] Rename internal ops-only `filinggrid-*` references in Docker/docs if desired ([TEST_REVIEW_LOG.md § Manual follow-ups](./TEST_REVIEW_LOG.md))

---

## Ongoing cadence

| Frequency | Action |
|---|---|
| **Weekly (month 1)** | Failed webhooks; API 5xx; repeat critical browser smoke |
| **Monthly** | MRR/churn in Stripe; review tier limits |
| **After each deploy** | [PRODUCTION_SMOKE_TEST.md](./PRODUCTION_SMOKE_TEST.md) automated script + spot-check paywall |

Never enable dev tier toggles in production — [TIER_TESTING.md](./TIER_TESTING.md) is staging/local only.
