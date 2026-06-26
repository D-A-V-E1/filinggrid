# PeerDisclosures — Stripe + Supabase local setup runbook

**Repo:** [github.com/D-A-V-E1/peerdisclosures](https://github.com/D-A-V-E1/peerdisclosures)  
**Purpose:** Wire test-mode Stripe billing and Supabase magic-link auth so checkout and tier upgrades work on `localhost`.

Use this runbook when CLIs are not logged in or dashboard credentials are not yet in `.env`. For Stripe Dashboard detail, see [STRIPE_SETUP.md](./STRIPE_SETUP.md). For production launch, see [GO_LIVE_CHECKLIST.md](./GO_LIVE_CHECKLIST.md).

---

## Setup completion status (last checked: 2026-06-16)

| Item | Status | Notes |
|---|---|---|
| `.env` + `backend/.env` exist | ✅ Done | Non-secret defaults filled; secrets still `TODO_*` |
| Supabase CLI installed | ✅ v2.106.0 | `supabase login` required (browser) |
| Supabase project + keys | ⏸ Blocked | Create project at [supabase.com/dashboard](https://supabase.com/dashboard) |
| Supabase auth URLs | ⏸ Blocked | Site URL `http://localhost:3000`, redirect `http://localhost:3000/auth/callback` |
| Docker Desktop | ⏸ Not installed | Required for local Postgres via `docker compose` |
| `docker compose up -d` + migrations | ⏸ Blocked | Needs Docker; then `cd backend; .\.venv\Scripts\python.exe -m alembic upgrade head` |
| Stripe CLI installed | ✅ v1.42.13 (winget) | **Not on PATH** — reopen terminal after install or add WinGet Links to PATH |
| Stripe CLI logged in | ⏸ Unknown | Run `stripe login` (browser) |
| Stripe test product $29/mo | ⏸ Blocked | Create in **Test mode** at [dashboard.stripe.com/test/products](https://dashboard.stripe.com/test/products) |
| Stripe API keys in `.env` | ⏸ Blocked | Copy `sk_test_...` + `price_...` from test dashboard |
| Stripe webhook secret | ⏸ Blocked | Run `stripe listen --forward-to localhost:8000/webhooks/stripe` |
| Unit tests (tier + webhooks) | ✅ 21/21 pass | No live Stripe/Supabase required |
| API `/health` + `/auth/me` | ✅ Verified | Via TestClient; live server needs DB for full routes |

**Cloud Postgres alternative (no Docker):** [Neon](https://neon.tech) free tier → set `DATABASE_URL` in both `.env` files → run `alembic upgrade head`.

**After secrets are filled — start dev stack:**

```powershell
# Terminal 1 — DB (if Docker installed)
docker compose up -d

# Terminal 2 — Stripe webhooks (after stripe login)
stripe listen --forward-to localhost:8000/webhooks/stripe

# Terminal 3 — API
cd backend; .\.venv\Scripts\activate; uvicorn main:app --reload --port 8000

# Terminal 4 — Frontend
npm install; npm run dev
```

**Manual E2E:** sign in (magic link) → add 4 tickers → paywall → checkout with any email → card `4242 4242 4242 4242` → confirm `GET /auth/me` shows `"tier": "professional"`.

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
4. `POST /billing/checkout` creates Stripe Checkout (any email).
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
# If 'stripe' not found, use full path (see STRIPE_SETUP.md — Cursor Stripe plugin section):
$stripe = "$env:LOCALAPPDATA\Microsoft\WinGet\Packages\Stripe.StripeCli_Microsoft.Winget.Source_8wekyb3d8bbwe\stripe.exe"
& $stripe --version
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
3. Name: `PeerDisclosures Professional`
4. Pricing: **Recurring** → **Monthly** → **$29.00 USD**
5. Save → copy **Price ID** (`price_...`).

Optional via CLI after login:

```powershell
stripe products create --name="PeerDisclosures Professional"
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
2. Choose org, name (e.g. `peerdisclosures-dev`), strong DB password, region
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

**Project Settings → API** (use the **Publishable and secret API keys** tab for new projects, or **Legacy API keys** for `eyJ` anon/service_role)

| Dashboard field | Env variable | Where |
|---|---|---|
| Project URL | `NEXT_PUBLIC_SUPABASE_URL` | Root `.env` (frontend) |
| Publishable key (`sb_publishable_...`) or legacy anon (`eyJ...`) | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Root `.env` (frontend) |
| Project URL (backend) | `SUPABASE_URL` or `NEXT_PUBLIC_SUPABASE_URL` | `backend/.env` |
| Legacy JWT Secret (HS256 fallback only) | `SUPABASE_JWT_SECRET` | `backend/.env` (optional with ECC/RSA keys) |
| Secret key (`sb_secret_...`) or legacy service_role | `SUPABASE_SERVICE_ROLE_KEY` | `backend/.env` (optional; unused by auth middleware today) |

`@supabase/supabase-js` v2.x accepts `sb_publishable_...` in place of the legacy anon key — no code changes required.

**JWT verification (backend):** If your project uses **ECC (P-256)** or **RSA** signing keys (Supabase dashboard → **Project Settings → JWT Keys**), the backend verifies access tokens via JWKS at `{SUPABASE_URL}/auth/v1/.well-known/jwks.json` — **no shared secret required**. Set `SUPABASE_URL` in `backend/.env` to your project URL. Optionally set `SUPABASE_JWT_SECRET` from the **Legacy JWT Secret** tab only if you need HS256 fallback during key rotation.

Frontend uses URL + publishable/anon key for `@supabase/ssr` sign-in.

> **Note:** PeerDisclosures uses a **local PostgreSQL** (`DATABASE_URL`) for users/orgs/tiers, not Supabase Postgres, unless you point `DATABASE_URL` at Supabase's connection string intentionally.

### 2d. Magic Link email template (go-live branding)

Supabase sends the only sign-in email today — there is no PeerDisclosures-owned welcome email in code.

1. **Authentication → Email Templates → Magic Link**
2. Suggested **subject:** `Sign in to PeerDisclosures`
3. Suggested **body** (HTML):

```html
<h2>Sign in to PeerDisclosures</h2>
<p>Click the link below to sign in. This link expires in one hour and works once.</p>
<p><a href="{{ .ConfirmationURL }}">Sign in to PeerDisclosures</a></p>
<p>If you did not request this email, you can ignore it.</p>
<p>— PeerDisclosures · support@peerdisclosures.com</p>
```

4. **Authentication → Settings → Email** — confirm rate limits and link expiry suit your QA
5. Test: sign in from `/account` → confirm branded email arrives (check spam)

### 2e. Custom SMTP (optional — send from @peerdisclosures.com)

Default Supabase SMTP works for dev; production should use your domain.

1. **Project Settings → Authentication → SMTP Settings** → enable custom SMTP
2. Provider examples: [Resend](https://resend.com), SendGrid, Postmark, Amazon SES
3. Set **Sender email** e.g. `noreply@peerdisclosures.com`, **Sender name** `PeerDisclosures`
4. Add DNS records (SPF, DKIM) per provider docs
5. Re-send magic link and verify `From:` header shows your domain

Without custom SMTP, magic links still work but may show Supabase as sender and land in spam more often.

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
SEC_USER_AGENT=PeerDisclosures/1.0 (you@yourcompany.com)
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
3. Sign in with any email
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
| `AUTH_NOT_CONFIGURED` | Set `SUPABASE_URL` in `backend/.env` (JWKS) or `SUPABASE_JWT_SECRET` (legacy HS256) |
| Magic link redirect fails | Check Supabase Site URL + redirect URLs match `http://localhost:3000` |
| Paid but still Free | Webhook not reaching API; confirm `stripe listen` running and API on :8000 |

---

## Related docs

- [STRIPE_SETUP.md](./STRIPE_SETUP.md) — Stripe product, webhooks, portal detail
- [GO_LIVE_CHECKLIST.md](./GO_LIVE_CHECKLIST.md) — production launch timeline
- [TIER_TESTING.md](./TIER_TESTING.md) — test tiers without Stripe (dev toggle)
