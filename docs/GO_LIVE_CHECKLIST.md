# FilingGrid MVP go-live checklist

Week-by-week plan for launching **self-serve Stripe Professional** subscriptions (~1 week). Check items off as you complete them.

**Repo:** [github.com/D-A-V-E1/filinggrid](https://github.com/D-A-V-E1/filinggrid)

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
- [ ] Create product **FilingGrid Professional** at **$29/mo** (test mode)
- [ ] Copy test `STRIPE_PRICE_PROFESSIONAL` (`price_...`)
- [ ] Copy test `STRIPE_SECRET_KEY` (`sk_test_...`)
- [ ] Run `stripe listen --forward-to localhost:8000/webhooks/stripe` → set `STRIPE_WEBHOOK_SECRET`
- [ ] Enable **Customer Portal** in test mode
- [ ] Complete full checkout with corporate email + card `4242...`
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

- [ ] Register production domain (e.g. `filinggrid.com`)
- [ ] DNS for frontend (Vercel) and API subdomain (e.g. `api.filinggrid.com`)
- [ ] Confirm HTTPS on both (required for Supabase redirects and Stripe)

### Frontend (Vercel recommended)

- [ ] Connect GitHub repo to [Vercel](https://vercel.com)
- [ ] `vercel.json` included — framework: Next.js
- [ ] Set production env vars:

| Variable | Example |
|---|---|
| `NEXT_PUBLIC_APP_URL` | `https://filinggrid.com` |
| `NEXT_PUBLIC_API_URL` | `https://api.filinggrid.com` |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | `pk_live_...` (optional for MVP) |

- [ ] **Do not** set `NEXT_PUBLIC_ALLOW_DEV_TIER_TOGGLE` or `NEXT_PUBLIC_DEV_TIER` in production
- [ ] Deploy and verify `/api/backend/health` proxies to API

### Backend API

Choose one (Dockerfile included in `backend/`):

| Option | Notes |
|---|---|
| **Railway / Render / Fly.io** | Deploy `backend/Dockerfile`, attach managed Postgres or external DB |
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
| `APP_URL` | `https://filinggrid.com` (frontend origin) |
| `CORS_ORIGINS` | `https://filinggrid.com` (comma-separate if multiple) |
| `SEC_USER_AGENT` | `FilingGrid/1.0 (you@yourcompany.com)` — **SEC requirement** |
| `ALLOW_DEV_TIER_TOGGLE` | **`false` or unset** |
| `DEV_PRO_TIER` | **`false` or unset** |

### Database

- [ ] Provision PostgreSQL (Supabase DB, Neon, RDS, or compose volume for small deploys)
- [ ] Run migrations before first traffic:

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
- [ ] Add live webhook: `https://api.yourdomain.com/webhooks/stripe` with required events (see [STRIPE_SETUP.md](./STRIPE_SETUP.md))
- [ ] Update production `STRIPE_WEBHOOK_SECRET` from live endpoint
- [ ] Enable **Customer Portal** in live mode

### Supabase production URLs

- [ ] Site URL → `https://filinggrid.com`
- [ ] Redirect URLs → `https://filinggrid.com/auth/callback`, `https://filinggrid.com/**`

### Smoke test (production)

- [ ] `GET https://api.yourdomain.com/health` → `{"status":"ok"}`
- [ ] Free compare: 3 tickers, current year — no login
- [ ] 4th ticker → paywall
- [ ] Sign in (corporate email) → checkout → real or live test payment
- [ ] Webhook delivered (Stripe Dashboard → Events)
- [ ] Professional features unlock (8 columns, historical year, peer groups)
- [ ] Customer Portal opens from `/account`
- [ ] Cancel subscription in portal → tier returns to free after `customer.subscription.deleted`

---

## Day 7 — Hardening & launch

### Disable dev overrides

- [ ] `ALLOW_DEV_TIER_TOGGLE` unset/false on API
- [ ] `DEV_PRO_TIER` unset/false
- [ ] No `NEXT_PUBLIC_ALLOW_DEV_TIER_TOGGLE` on Vercel
- [ ] Confirm `POST /dev/tier` returns **404** in production
- [ ] Confirm compare header has **no** Free/Pro dev toggle

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

- [ ] Sentry, Datadog, or similar on frontend + API
- [ ] Alert on 5xx spike and failed Stripe webhooks (Stripe Dashboard also emails failures)

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

### Frontend

```
NEXT_PUBLIC_APP_URL
NEXT_PUBLIC_API_URL
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY   # optional
```

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

- [STRIPE_SETUP.md](./STRIPE_SETUP.md) — Dashboard configuration detail
- [TIER_TESTING.md](./TIER_TESTING.md) — Free vs Pro QA without charges
- [README.md](../README.md) — Architecture and local development
