# Subscription tier testing (local / pre-Stripe)

Use this playbook to verify **Free** vs **Professional** behavior before Stripe goes live in production. All dev overrides are gated behind `ALLOW_DEV_TIER_TOGGLE=true` on the backend — they return **404** when that flag is off.

## Feature matrix (from code)

| Feature | Free | Professional |
|---|---|---|
| Max ticker columns | 3 | 8 |
| Filing years | Current year only | All available (via `?year=`) |
| Login required | No (anonymous gets free limits) | Yes for billing & peer groups |
| Saved peer groups | Blocked (402 + paywall UI) | Full CRUD at `/peer-groups` |
| Historical parse/financials | Blocked at API (`check_parse_access`) | Allowed |
| Billing | — | Stripe Checkout + Customer Portal |

**Enforcement layers**

- **Backend** (`backend/middleware.py`): `check_parse_access` on `/parse`, `/parse/stream`, `/filings/{ticker}/financials`, `/parse/section`; `check_professional_access` on `/peer-groups`.
- **Frontend**: `YearPicker` blocks prior years; `PeerGroupsMenu` shows paywall; `CompareGrid` surfaces API 402 as `PaywallModal`.
- **Source of truth**: `organizations.subscription_tier` in PostgreSQL (updated by Stripe webhooks in production).

---

## Prerequisites

1. PostgreSQL running (`docker compose up -d`).
2. Backend `.env` includes `ALLOW_DEV_TIER_TOGGLE=true` (see `.env.example`).
3. Copy env to backend: `copy .env backend\.env` (Windows).
4. Start API: `backend\.venv\Scripts\python.exe -m uvicorn main:app --reload --port 8000`
5. Start frontend: `npm run dev`

---

## Method 1 — Environment variable (force Pro for everyone)

In `backend/.env`:

```env
ALLOW_DEV_TIER_TOGGLE=true
DEV_PRO_TIER=true
```

Restart the API. Every authenticated and anonymous request resolves to **professional** limits (header override still works — see Method 2).

To return to free defaults: set `DEV_PRO_TIER=false` and restart.

---

## Method 2 — Per-request header (toggle without restart)

With `ALLOW_DEV_TIER_TOGGLE=true` and `DEV_PRO_TIER=false`:

```powershell
# Free limits
curl http://localhost:8000/auth/me -H "X-Dev-Tier: free"

# Pro limits
curl http://localhost:8000/auth/me -H "X-Dev-Tier: professional"
```

**From the browser**, set in project root `.env` and restart `npm run dev`:

```env
NEXT_PUBLIC_DEV_TIER=professional
# or
NEXT_PUBLIC_DEV_TIER=free
```

The frontend sends `X-Dev-Tier` on all API calls via `lib/api.ts`.

---

## Method 3 — Dev API endpoint (persist to database)

Requires sign-in (Supabase magic link with a **corporate** email for Stripe checkout later; any email works for tier DB field).

```powershell
# After obtaining a JWT from the browser session (or Supabase):
$token = "YOUR_ACCESS_TOKEN"

# Set Professional (persists on organization)
curl -X POST http://localhost:8000/dev/tier `
  -H "Authorization: Bearer $token" `
  -H "Content-Type: application/json" `
  -d '{"tier":"professional"}'

# Inspect effective vs stored tier
curl http://localhost:8000/dev/tier -H "Authorization: Bearer $token"

# Back to Free
curl -X POST http://localhost:8000/dev/tier `
  -H "Authorization: Bearer $token" `
  -H "Content-Type: application/json" `
  -d '{"tier":"free"}'
```

Refresh the compare page after changing tier. `/dev/*` returns **404** when `ALLOW_DEV_TIER_TOGGLE` is not set.

---

## Method 4 — Database script (no HTTP)

After at least one magic-link sign-in (creates user + org):

```powershell
cd backend
.\.venv\Scripts\python.exe scripts\set_org_tier.py you@company.com professional
.\.venv\Scripts\python.exe scripts\set_org_tier.py you@company.com free
```

---

## Verification checklist

### Free tier

1. Ensure tier is **free** (Methods 2–4 or default for new orgs).
2. Open `/compare/aapl-vs-msft-vs-nvda-vs-googl` (4 tickers).
3. Expect **PaywallModal** — reason `column_limit`.
4. On a 2-ticker compare, select a prior fiscal year in **Year picker**.
5. Expect paywall — reason `historical_data`.
6. Click **Saved groups** → paywall — reason `subscription_required`.
7. `GET /auth/me` shows `tier: "free"`, `limits.max_columns: 3`.

### Professional tier

1. Enable Pro via any method above.
2. Open `/compare/aapl-vs-msft-vs-nvda-vs-googl` — filings load (up to 8 columns).
3. Select FY prior year — navigation works; data loads.
4. **Saved groups** → save and reload a peer group.
5. Header shows **Professional** badge on compare workspace.
6. `GET /auth/me` shows `tier: "professional"`, `limits.max_columns: 8`.

### Automated tests

```powershell
cd backend
.\.venv\Scripts\python.exe -m pytest tests/test_tier_gates.py -v
```

---

## Stripe test mode (optional, before production)

Use **test keys only** (`sk_test_...`, `pk_test_...`) in `.env`. Never use live keys locally.

1. Create product **FilingGrid Professional** at $29/mo in [Stripe Dashboard](https://dashboard.stripe.com/test/products).
2. Set `STRIPE_PRICE_PROFESSIONAL=price_...`.
3. Forward webhooks locally:
   ```powershell
   stripe listen --forward-to localhost:8000/webhooks/stripe
   ```
4. Copy `whsec_...` → `STRIPE_WEBHOOK_SECRET`.
5. Sign in with a **corporate** email (not gmail.com, etc.).
6. Use **Upgrade to Professional** on paywall or `/pricing` → complete Checkout with test card `4242 4242 4242 4242`.
7. Webhook sets `organizations.subscription_tier = professional` — same as Method 3/4.

**Production later:** set `ALLOW_DEV_TIER_TOGGLE=false` (or omit it), remove `NEXT_PUBLIC_DEV_TIER`, use live Stripe keys and register `https://yourdomain.com/webhooks/stripe`.

---

## Safety notes

- `ALLOW_DEV_TIER_TOGGLE` must **never** be `true` in production unless you explicitly accept the risk; `/dev/tier` and header overrides would be exposed.
- `DEV_PRO_TIER` and `NEXT_PUBLIC_DEV_TIER` are for local QA only.
- Real charges require live Stripe keys; this project defaults to test keys in `.env.example`.
