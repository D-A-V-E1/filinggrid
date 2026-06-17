# FilingGrid — Stripe + Supabase local setup runbook

**Repo:** [github.com/D-A-V-E1/filinggrid](https://github.com/D-A-V-E1/filinggrid)  
**Purpose:** Wire test-mode Stripe billing and Supabase magic-link auth so checkout and tier upgrades work on `localhost`.

Use this runbook when CLIs are not logged in or dashboard credentials are not yet in `.env`. For Stripe Dashboard detail, see [STRIPE_SETUP.md](./STRIPE_SETUP.md). For production launch, see [GO_LIVE_CHECKLIST.md](./GO_LIVE_CHECKLIST.md).

---

## What agents can automate vs what you do (~5 min)

| Step | Automated? | Your action |
|---|---|---|
| Install Stripe CLI | Yes (`winget install Stripe.StripeCli`) | Run `stripe login` once (browser) |
| Install Supabase CLI | Yes (`npm install -g supabase`) | Run `supabase login` if using CLI; dashboard copy-paste works without CLI |
| Create Stripe product/price | No (needs Stripe account) | Dashboard → Products → $29/mo price → copy `price_...` |
| Stripe API keys | No | Dashboard → Developers → API keys → copy `sk_test_...` |
| Stripe webhook secret (local) | Partial | After `stripe login`: `stripe listen --forward-to localhost:8000/webhooks/stripe` |
| Create Supabase project | No | [supabase.com/dashboard](https://supabase.com/dashboard) → New project |
| Supabase auth URLs | No | Authentication → URL configuration (see below) |
| Supabase keys | No | Project Settings → API → copy URL, anon key, JWT secret |
| PostgreSQL | Partial | `docker compose up -d` if Docker Desktop installed |
| Copy env files | Yes | Copy `.env.template` → `.env` and `backend/.env`, fill `TODO` values |
| Run migrations | Yes (if DB up) | `cd backend; alembic upgrade head` |
| Unit tests | Yes | `pytest tests/test_tier_gates.py tests/test_stripe_webhooks.py` |

**Never commit real keys.** `.env` and `backend/.env` are gitignored.

---

## How Stripe, Supabase, and the app connect

```mermaid
flowchart LR
  subgraph Browser
    FE[Next.js :3000]
  end
  subgraph Supabase
    SB_AUTH[Auth / Magic Link]
  end
  subgraph Backend
    API[FastAPI :8000]
    PG[(PostgreSQL)]
  end
  subgraph Stripe
    ST_CHECKOUT[Checkout]
    ST_WH[Webhooks]
  end

  FE -->|NEXT_PUBLIC_SUPABASE_URL + ANON_KEY| SB_AUTH
  SB_AUTH -->|JWT in Authorization header| FE
  FE -->|Bearer JWT| API
  API -->|SUPABASE_JWT_SECRET verifies token| API
  API -->|DATABASE_URL| PG
  FE -->|POST /billing/checkout| API
  API -->|STRIPE_SECRET_KEY + price ID| ST_CHECKOUT
  ST_CHECKOUT -->|redirect success/cancel| FE
  ST_WH -->|POST /webhooks/stripe + STRIPE_WEBHOOK_SECRET| API
  API -->|subscription_tier = professional| PG
  FE -->|GET /auth/me reads tier| API
```

**Data flow for checkout:**

1. User signs in via Supabase magic link (frontend).
2. Frontend sends JWT to API on protected routes.
3. Backend decodes JWT with `SUPABASE_JWT_SECRET`, loads/creates `users` + `organizations` in PostgreSQL.
4. `POST /billing/checkout` creates Stripe Checkout (corporate email required).
5. After payment, Stripe sends webhooks → API updates `organizations.subscription_tier`.
6. Frontend polls `GET /auth/me` → `tier: "professional"`.

---

## Prerequisites (Windows)

Install if missing:

```powershell
# Stripe CLI (already installed on this machine via winget v1.42.13)
winget install Stripe.StripeCli

# Supabase CLI (already installed via npm v2.106.0)
npm install -g supabase

# Docker Desktop — required for local PostgreSQL
# https://www.docker.com/products/docker-desktop/
```

Verify:

```powershell
stripe --version
supabase --version
docker compose version
```

---

## Step 1 — Stripe (test mode)

### 1a. Log in to Stripe CLI (one time)

```powershell
stripe login
```

Follow the browser prompt. Confirm with:

```powershell
stripe config --list
```

### 1b. Create product and price (Dashboard)

Dashboard must be in **Test mode** (toggle top-right).

1. Open [Stripe Dashboard → Products (test)](https://dashboard.stripe.com/test/products).
2. Click **+ Add product**.
3. Name: `FilingGrid Professional`
4. Pricing: **Recurring** → **Monthly** → **$29.00 USD**
5. Save → copy **Price ID** (`price_...`).

Optional via CLI after login:

```powershell
stripe products create --name="FilingGrid Professional"
# Use returned prod_... id:
stripe prices create --product=prod_XXXX --unit-amount=2900 --currency=usd -d "recurring[interval]=month"
```

### 1c. Copy API keys (Dashboard)

1. [Developers → API keys (test)](https://dashboard.stripe.com/test/apikeys)
2. Copy **Secret key** → `STRIPE_SECRET_KEY=sk_test_...`
3. (Optional) Publishable key → `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...`

### 1d. Enable Customer Portal (test)

1. [Settings → Billing → Customer portal](https://dashboard.stripe.com/test/settings/billing/portal)
2. **Activate** portal
3. Enable: cancel subscription, update payment method, invoice history

### 1e. Webhook secret (local)

Terminal 1 — keep running while testing checkout:

```powershell
stripe listen --forward-to localhost:8000/webhooks/stripe
```

Copy the printed `whsec_...` → `STRIPE_WEBHOOK_SECRET` in `backend/.env`.

Restart the API after changing webhook secret.

---

## Step 2 — Supabase (auth)

### 2a. Create project

1. [supabase.com/dashboard](https://supabase.com/dashboard) → **New project**
2. Choose org, name (e.g. `filinggrid-dev`), strong DB password, region
3. Wait for project to finish provisioning (~2 min)

### 2b. Authentication settings

1. **Authentication → Providers → Email** — ensure **Email** is enabled
2. Enable **Confirm email** / magic link as needed (Magic Link is the MVP flow)
3. **Authentication → URL configuration**
   - **Site URL:** `http://localhost:3000`
   - **Redirect URLs** (add both):
     - `http://localhost:3000/auth/callback`
     - `http://localhost:3000/**` (optional wildcard for dev)

### 2c. Copy keys

**Project Settings → API**

| Dashboard field | Env variable | Where |
|---|---|---|
| Project URL | `NEXT_PUBLIC_SUPABASE_URL` | Root `.env` (frontend) |
| anon public | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Root `.env` (frontend) |
| JWT Secret | `SUPABASE_JWT_SECRET` | Root `.env` + `backend/.env` |

Backend validates JWTs with `SUPABASE_JWT_SECRET` (`backend/middleware.py`). Frontend uses URL + anon key for `@supabase/ssr` sign-in.

> **Note:** FilingGrid uses a **local PostgreSQL** (`DATABASE_URL`) for users/orgs/tiers, not Supabase Postgres, unless you point `DATABASE_URL` at Supabase's connection string intentionally.

---

## Step 3 — Environment files

```powershell
cd "C:\Users\davel\TECH\Reporting - Comparative Viewer"
copy .env.template .env
copy .env.template backend\.env
```

Edit both files and replace every `TODO` placeholder. Minimum for billing + auth E2E:

**Root `.env` (frontend + shared):**

```env
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_SUPABASE_URL=TODO
NEXT_PUBLIC_SUPABASE_ANON_KEY=TODO
SUPABASE_JWT_SECRET=TODO
STRIPE_SECRET_KEY=TODO          # backend reads from backend/.env; can duplicate here
STRIPE_WEBHOOK_SECRET=TODO
STRIPE_PRICE_PROFESSIONAL=TODO
APP_URL=http://localhost:3000
DATABASE_URL=postgresql://filinggrid:filinggrid@localhost:5432/filinggrid
CORS_ORIGINS=http://localhost:3000
ALLOW_DEV_TIER_TOGGLE=true
SEC_USER_AGENT=FilingGrid/1.0 (you@yourcompany.com)
```

**`backend/.env`** — same Stripe/Supabase/DB values; backend does not need `NEXT_PUBLIC_*` except you may keep a full copy for convenience.

See `.env.template` for the full list.

---

## Step 4 — PostgreSQL

```powershell
docker compose up -d
```

Verify:

```powershell
docker compose ps
```

Migrate:

```powershell
cd backend
.\.venv\Scripts\python.exe -m alembic upgrade head
```

If Docker is not installed, use [Neon](https://neon.tech), [Supabase DB connection string](https://supabase.com/docs/guides/database/connecting-to-postgres), or another Postgres host and set `DATABASE_URL` accordingly.

---

## Step 5 — Start local stack

**Terminal 1 — database** (if not already up):

```powershell
docker compose up -d
```

**Terminal 2 — Stripe webhooks:**

```powershell
stripe listen --forward-to localhost:8000/webhooks/stripe
```

**Terminal 3 — API:**

```powershell
cd backend
.\.venv\Scripts\activate
uvicorn main:app --reload --port 8000
```

**Terminal 4 — Frontend:**

```powershell
npm install
npm run dev
```

Health check: [http://localhost:8000/health](http://localhost:8000/health) → `{"status":"ok"}`

---

## Step 6 — End-to-end checkout test

1. Open [http://localhost:3000](http://localhost:3000)
2. Go to compare, add 4 tickers → paywall
3. Sign in with a **corporate email** (not Gmail/Yahoo — billing gate)
4. **Continue to Stripe Checkout**
5. Card: `4242 4242 4242 4242`, any future expiry, any CVC
6. After redirect, confirm tier updates within a few seconds

**Verify:**

```powershell
# With JWT from browser devtools (Authorization: Bearer ...)
curl http://localhost:8000/auth/me -H "Authorization: Bearer YOUR_JWT"
# Expect: "tier": "professional"
```

Manual endpoints:

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | API up |
| GET | `/auth/me` | Current user tier (optional JWT) |
| POST | `/billing/checkout` | Start Stripe Checkout (auth required) |
| POST | `/billing/portal` | Customer Portal (auth + subscription) |
| POST | `/webhooks/stripe` | Stripe webhooks (signature required) |

---

## Automated tests (no live Stripe/Supabase)

```powershell
cd backend
.\.venv\Scripts\python.exe -m pytest tests/test_tier_gates.py tests/test_stripe_webhooks.py -v
```

Expected: **21 passed** (tier gates + webhook handler mocks).

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| `You have not configured API keys yet` (Stripe CLI) | Run `stripe login` |
| `503 Billing is not configured` | Set `STRIPE_SECRET_KEY` + `STRIPE_PRICE_PROFESSIONAL` in `backend/.env`, restart API |
| `400 Invalid signature` on webhook | Wrong `STRIPE_WEBHOOK_SECRET`; restart `stripe listen` and update env |
| `AUTH_NOT_CONFIGURED` | Set `SUPABASE_JWT_SECRET` in `backend/.env` |
| Magic link redirect fails | Check Supabase Site URL + redirect URLs match `http://localhost:3000` |
| Paid but still Free | Webhook not reaching API; confirm `stripe listen` running and API on :8000 |
| `Professional tier requires a corporate email` | Use work email domain for checkout |

---

## Related docs

- [STRIPE_SETUP.md](./STRIPE_SETUP.md) — Stripe product, webhooks, portal detail
- [GO_LIVE_CHECKLIST.md](./GO_LIVE_CHECKLIST.md) — production launch timeline
- [TIER_TESTING.md](./TIER_TESTING.md) — test tiers without Stripe (dev toggle)
