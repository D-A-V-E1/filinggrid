# PeerDisclosures MVP go-live checklist

Week-by-week plan for launching **self-serve Stripe Professional** subscriptions (~1 week). Check items off as you complete them.

**Repo:** [github.com/D-A-V-E1/peerdisclosures](https://github.com/D-A-V-E1/peerdisclosures)

**Production runbook:** [PRODUCTION_DEPLOY.md](./PRODUCTION_DEPLOY.md) — Vercel + API host + Neon/Supabase Postgres, env vars, DNS, Stripe live webhook, smoke tests. Template: [.env.production.example](../.env.production.example).

---

## Launch status (verified 2026-06-26)

| Area | Status | Notes |
|---|---|---|
| Render API (`peerdisclosures-api`) | ✅ Live | `https://peerdisclosures-api.onrender.com/health` → 200; **Starter** plan in `render.yaml` |
| `DATABASE_URL` on Render | ✅ Fixed | `f71070b` — `postgres://` URLs accepted |
| Render env + `render.yaml` | ✅ Applied | `ALLOW_DEV_TIER_TOGGLE=false`, `APP_URL`/`CORS_ORIGINS` set |
| Frontend (Vercel) | ✅ Deployed | `https://peerdisclosures.vercel.app` → 200; proxy `/api/backend/health` OK; `main` @ `aa5ae0c` |
| Custom domain apex/www | ⏸ **BLOCKED** | `peerdisclosures.com` still GoDaddy placeholder via Cloudflare — no `X-Vercel` header |
| Custom domain `api.peerdisclosures.com` | ⏸ **BLOCKED** | **NXDOMAIN** — Render custom domain + Cloudflare CNAME not added |
| Stripe live webhook | 🔄 In progress | Blocked until `api.peerdisclosures.com` resolves; `STRIPE_WEBHOOK_SECRET` empty |
| Supabase prod URLs | ⏸ Pending | After apex DNS points to Vercel |
| Production smoke test | ⏸ Blocked | Needs custom DNS + Stripe webhook |

**Verify anytime:** `.\scripts\dns-go-live-checklist.ps1`

### Remaining steps (dashboard — in order)

See [DNS_PEERDISCLOSURES.md](./DNS_PEERDISCLOSURES.md) for full detail.

1. **Vercel → Settings → Domains** — Add `peerdisclosures.com` and `www.peerdisclosures.com`.
2. **Cloudflare DNS** — `@` A `76.76.21.21` (grey cloud); `www` CNAME `cname.vercel-dns.com` (grey cloud). Remove GoDaddy builder apex record.
3. **Render → Settings → Custom Domains** — Add `api.peerdisclosures.com`.
4. **Cloudflare DNS** — `api` CNAME `peerdisclosures-api.onrender.com` (grey cloud).
5. **Supabase** — Site URL + redirect URLs ([SUPABASE_PROD_URLS.md](./SUPABASE_PROD_URLS.md)) — after step 2.
6. **Stripe live webhook** — `https://api.peerdisclosures.com/webhooks/stripe` → `STRIPE_WEBHOOK_SECRET` on Render ([STRIPE_LIVE_CHECKLIST.md](./STRIPE_LIVE_CHECKLIST.md)) — after step 4.
7. **Smoke test** — [PRODUCTION_SMOKE_TEST.md](./PRODUCTION_SMOKE_TEST.md).

---

## Week overview

| Phase | Focus |
|---|---|
| **Days 1–2** | Stripe test mode, auth, local E2E |
| **Days 3–4** | Hosting, database, env vars, HTTPS |
| **Days 5–6** | Stripe live mode, webhooks, smoke tests |
| **Day 7** | Security hardening, legal, launch |

---

## Days 1–2 — Stripe test mode & local E2E

### Stripe (test)

- [ ] Create [Stripe account](https://dashboard.stripe.com/register) (if needed)
- [ ] Create product **PeerDisclosures Professional** at **$29/mo** (test mode)
- [ ] Copy test `STRIPE_PRICE_PROFESSIONAL` (`price_...`)
- [ ] Copy test `STRIPE_SECRET_KEY` (`sk_test_...`)
- [ ] Run `stripe listen --forward-to localhost:8000/webhooks/stripe` → set `STRIPE_WEBHOOK_SECRET`
- [ ] Enable **Customer Portal** in test mode
- [ ] Complete full checkout with any email + card `4242...`
- [ ] Confirm `organizations.subscription_tier` = `professional` after webhook

→ Detailed steps: [STRIPE_SETUP.md](./STRIPE_SETUP.md)

### Auth (Supabase)

- [ ] Create Supabase project
- [ ] Enable Email provider + **Magic Link**
- [ ] Set Site URL: `http://localhost:3000` (update for prod later)
- [ ] Add redirect URL: `http://localhost:3000/auth/callback`
- [ ] Copy `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_JWT_SECRET`

### Local env

- [ ] Copy `.env.example` → `.env` and `backend/.env`
- [ ] Set `DATABASE_URL`, Supabase, Stripe test keys, `APP_URL=http://localhost:3000`
- [ ] Keep `ALLOW_DEV_TIER_TOGGLE=true` **only locally** (omit or `false` in production)
- [ ] Do **not** set `NEXT_PUBLIC_ALLOW_DEV_TIER_TOGGLE` in production builds

### Automated tests

```powershell
cd backend
.\.venv\Scripts\python.exe -m pytest tests/test_tier_gates.py tests/test_stripe_webhooks.py -v
```

---

## Days 3–4 — Hosting, domain, database

### Domain & HTTPS

- [x] Register production domain (`peerdisclosures.com`)
- [ ] DNS for frontend (Vercel) and API subdomain (`api.peerdisclosures.com`) — Vercel live on `*.vercel.app`; apex still placeholder; `api` NXDOMAIN
- [ ] Confirm HTTPS on both (required for Supabase redirects and Stripe)

### Frontend (Vercel recommended)

- [x] Connect GitHub repo to [Vercel](https://vercel.com) — deployed at `peerdisclosures.vercel.app`
- [x] `vercel.json` included — framework: Next.js; `www` → apex redirect configured
- [ ] Set production env vars (copy-paste into **Project → Settings → Environment Variables → Production**):

| Key | Value | Notes |
|---|---|---|
| `NEXT_PUBLIC_APP_URL` | `https://peerdisclosures.com` | Browser origin; Stripe redirects |
| `NEXT_PUBLIC_API_URL` | `https://peerdisclosures-api.onrender.com` | **Interim** — `next.config.mjs` rewrites `/api/backend/*` here. Switch to `https://api.peerdisclosures.com` after Render custom domain + DNS |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://cbqiqbcqzvfozewqzqnl.supabase.co` | Same project as Render `SUPABASE_URL` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `sb_publishable_Tv4FMFQ6lGMaSCPo59UFHQ_rCwqo0LC` | Publishable/anon key (public by design) — **never** put `SUPABASE_JWT_SECRET` on Vercel |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | `pk_live_...` | Stripe Dashboard → API keys (**Live** mode). Optional for MVP (Checkout is server-side) |

Template with comments: [`scripts/vercel-production-env.example`](../scripts/vercel-production-env.example).

- [ ] **Do not** set `NEXT_PUBLIC_ALLOW_DEV_TIER_TOGGLE` or `NEXT_PUBLIC_DEV_TIER` in production
- [ ] Redeploy after env changes (NEXT_PUBLIC_* are build-time)
- [x] Deploy and verify `/api/backend/health` proxies to API (verified on `peerdisclosures.vercel.app`)
- [ ] Add custom domains `peerdisclosures.com` + `www` in Vercel → Settings → Domains
- [ ] Update Cloudflare apex/`www` records ([DNS_PEERDISCLOSURES.md](./DNS_PEERDISCLOSURES.md))

### Backend API

- [x] Deploy to **Render** (`peerdisclosures-api`) — live at `https://peerdisclosures-api.onrender.com`; **Starter** (~$7/mo, always on)
- [ ] Monitor Render **Billing → bandwidth** and **Metrics** — see [RENDER_ENV_SETUP.md § Plan, limits](./RENDER_ENV_SETUP.md#plan-limits-and-usage-alerts)
- [ ] Add custom domain `api.peerdisclosures.com` in Render + Cloudflare CNAME

Choose one (Dockerfile included in `backend/`):

| Option | Notes |
|---|---|
| **Railway / Render / Fly.io** | Deploy `backend/Dockerfile`, attach managed Postgres or external DB — **Render in use** |
| **Docker on VPS** | `docker compose --profile full up -d --build` |
| **Same host as DB** | Expose port 8000 behind reverse proxy |

Production env (minimum):

| Variable | Notes |
|---|---|
| `DATABASE_URL` | Managed PostgreSQL connection string |
| `SUPABASE_JWT_SECRET` | Same project as frontend |
| `STRIPE_SECRET_KEY` | `sk_live_...` when live |
| `STRIPE_WEBHOOK_SECRET` | From live webhook endpoint |
| `STRIPE_PRICE_PROFESSIONAL` | Live `price_...` |
| `APP_URL` | `https://peerdisclosures.com` (frontend origin) |
| `CORS_ORIGINS` | `https://peerdisclosures.com` (comma-separate if multiple) |
| `SEC_USER_AGENT` | `PeerDisclosures/1.0 (ops@peerdisclosures.com)` — **SEC requirement** |
| `ALLOW_DEV_TIER_TOGGLE` | **`false` or unset** |
| `DEV_PRO_TIER` | **`false` or unset** |

### Database

- [x] Provision PostgreSQL (Neon) — `DATABASE_URL` on Render
- [x] Run migrations before first traffic (health OK post-`f71070b`):

```powershell
cd backend
alembic upgrade head
```

- [ ] Configure automated backups (provider default or daily snapshot)
- [ ] Verify `init_db()` is not relied on in production (Alembic is source of truth)

### SEC EDGAR

- [ ] Set `SEC_USER_AGENT` with real contact email ([SEC fair access policy](https://www.sec.gov/os/webmaster-faq#code-support))
- [ ] Optional: run `python backend/scripts/prewarm_cache.py` after deploy to warm filing cache

---

## Days 5–6 — Stripe live mode & production smoke test

### Stripe live activation

- [ ] Complete Stripe business verification (identity, bank account)
- [ ] Switch to **Live mode** in Dashboard
- [ ] Create **live** product + $29/mo price (new `price_...` ID)
- [ ] Update production `STRIPE_SECRET_KEY` → `sk_live_...`
- [ ] Update production `STRIPE_PRICE_PROFESSIONAL` → live price ID
- [ ] Add live webhook: `https://api.peerdisclosures.com/webhooks/stripe` with required events (see [STRIPE_SETUP.md](./STRIPE_SETUP.md)) — **not created yet** (blocked on API custom domain)
- [ ] Update production `STRIPE_WEBHOOK_SECRET` from live endpoint
- [ ] Enable **Customer Portal** in live mode

### Supabase production URLs

- [ ] Site URL → `https://peerdisclosures.com`
- [ ] Redirect URLs → `https://peerdisclosures.com/auth/callback`, `https://peerdisclosures.com/**`

### Smoke test (production)

Automated:

```powershell
cd backend
.\.venv\Scripts\python.exe scripts/prod_smoke_check.py --api https://api.peerdisclosures.com --app https://peerdisclosures.com
```

Manual checklist: [PRODUCTION_SMOKE_TEST.md](./PRODUCTION_SMOKE_TEST.md)

- [ ] `GET https://api.peerdisclosures.com/health` → `{"status":"ok"}`
- [ ] `GET https://peerdisclosures.com/api/backend/health` → proxied OK
- [ ] `POST /dev/tier` → **404** (dev toggle off)
- [ ] Free compare: 3 tickers, recent filing window — no login
- [ ] 4th ticker → paywall
- [ ] Sign in (any email) → checkout → real payment
- [ ] Webhook delivered (Stripe Dashboard → Events)
- [ ] Professional features unlock (8 columns, full archive, GAAP statements, peer groups)
- [ ] Customer Portal opens from `/account`
- [ ] Cancel subscription in portal → tier returns to free after `customer.subscription.deleted`

---

## Day 7 — Hardening & launch

### Disable dev overrides

- [x] `ALLOW_DEV_TIER_TOGGLE` unset/false on API (`render.yaml`)
- [x] `DEV_PRO_TIER` unset/false (`render.yaml`)
- [ ] No `NEXT_PUBLIC_ALLOW_DEV_TIER_TOGGLE` on Vercel (confirm in dashboard)
- [ ] Confirm `POST /dev/tier` returns **404** in production (verify on Render URL after deploy; then `api.peerdisclosures.com`)
- [ ] Confirm compare header has **no** Free/Pro dev toggle (after Vercel deploy)

### Security & reliability

- [ ] All secrets in host secret managers (not in git)
- [ ] CORS limited to production frontend origin(s)
- [ ] API not publicly admin-exposed beyond required routes
- [ ] Stripe webhook signature verification enabled (default in code)
- [ ] Database credentials rotated from dev defaults

### Legal pages

- [ ] Review `/privacy` and `/terms` (already in repo — update contact emails / entity name if needed)
- [ ] Footer links to Privacy and Terms visible on marketing pages

### Error monitoring (optional but recommended)

- [ ] Sentry — env vars in `.env.production.example`; SDK integration not yet in code (see [PRODUCTION_DEPLOY.md § Sentry](./PRODUCTION_DEPLOY.md#error-monitoring-optional--sentry))
- [ ] Alert on 5xx spike and failed Stripe webhooks (Stripe Dashboard also emails failures)

### Email mailboxes

- [ ] `support@peerdisclosures.com`, `legal@peerdisclosures.com`, `privacy@peerdisclosures.com` receive inbound mail (MX or forwarding)
- [ ] Optional: custom Supabase SMTP from `noreply@peerdisclosures.com` — [SETUP_RUNBOOK.md § 2e](./SETUP_RUNBOOK.md#2e-custom-smtp-optional--send-from-peerdisclosurescom)

### Database backups

- [ ] Automated daily backups enabled on Postgres provider (Neon Pro, Supabase Pro, Railway, RDS)
- [ ] Document restore procedure — see [PRODUCTION_DEPLOY.md § Database backups](./PRODUCTION_DEPLOY.md#database-backups)

### Launch

- [ ] Final `git pull` on production hosts
- [ ] Monitor Stripe webhook log for first 24h
- [ ] Support email ready for billing questions

---

## Environment variable quick reference

### Backend (required for billing)

```
DATABASE_URL
SUPABASE_JWT_SECRET
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
STRIPE_PRICE_PROFESSIONAL    # or STRIPE_PRICE_ID_PRO
APP_URL                      # or FRONTEND_URL
CORS_ORIGINS
SEC_USER_AGENT
```

### Backend (production — must be off)

```
ALLOW_DEV_TIER_TOGGLE=false   # or omit
DEV_PRO_TIER=false            # or omit
```

### Frontend (Vercel Production)

```
NEXT_PUBLIC_APP_URL=https://peerdisclosures.com
NEXT_PUBLIC_API_URL=https://peerdisclosures-api.onrender.com   # interim; then api.peerdisclosures.com
NEXT_PUBLIC_SUPABASE_URL=https://cbqiqbcqzvfozewqzqnl.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_Tv4FMFQ6lGMaSCPo59UFHQ_rCwqo0LC
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...               # optional; from Stripe Live dashboard
```

**Do not set:** `NEXT_PUBLIC_ALLOW_DEV_TIER_TOGGLE`, `NEXT_PUBLIC_DEV_TIER`

---

## Manual verification: Stripe CLI (any time)

```powershell
stripe listen --forward-to localhost:8000/webhooks/stripe
# New terminal: complete checkout in browser
stripe events list --limit 3
```

---

## Post-launch

- [ ] Weekly check: failed webhooks in Stripe Dashboard
- [ ] Monthly: review MRR, churn via Stripe
- [ ] Keep [TIER_TESTING.md](./TIER_TESTING.md) for staging only — never enable dev toggles in prod

---

## Related documentation

- [PRODUCTION_DEPLOY.md](./PRODUCTION_DEPLOY.md) — full production deployment runbook
- [PRODUCTION_SMOKE_TEST.md](./PRODUCTION_SMOKE_TEST.md) — post-deploy billing E2E
- [STRIPE_SETUP.md](./STRIPE_SETUP.md) — Dashboard configuration detail
- [TIER_TESTING.md](./TIER_TESTING.md) — Free vs Pro QA without charges
- [README.md](../README.md) — Architecture and local development
