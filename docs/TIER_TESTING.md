# Subscription tier testing (local / pre-Stripe)

Use this playbook to verify **Free** vs **Professional** behavior before Stripe goes live in production. All dev overrides are gated behind `ALLOW_DEV_TIER_TOGGLE=true` on the backend — they return **404** when that flag is off.

## Feature matrix (from code)

| Feature | Free | Professional |
|---|---|---|
| Max ticker columns | 3 | 8 |
| Filing periods | Latest + last completed fiscal year | Full archive |
| Headline XBRL metrics | Yes | Yes |
| Full GAAP statement tables | No | Yes |
| Login required | No (anonymous gets free limits) | Yes for billing & peer groups |
| Saved peer groups | Blocked (402 + paywall UI) | Full CRUD at `/peer-groups` |
| Billing | — | Stripe Checkout + Customer Portal |

**Enforcement layers**

- **Backend** (`backend/middleware.py`): `check_parse_access` on parse/financials routes; `check_free_period_access` on period-scoped requests; `check_professional_access` on `/peer-groups` and GAAP statement endpoints.
- **Frontend**: `FilingPeriodPicker` limits free-tier options; GAAP statement sections show upgrade UI on Free; `PeerGroupsMenu` shows paywall; `CompareGrid` surfaces API 402 as `PaywallModal`.
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

**From the browser (in-app toggle — recommended)**

1. Set in project root `.env`:
   ```env
   NEXT_PUBLIC_ALLOW_DEV_TIER_TOGGLE=true
   ```
2. Ensure backend `.env` has `ALLOW_DEV_TIER_TOGGLE=true`.
3. Restart `npm run dev` (and the API if you changed backend env).
4. Open any compare page — a **Dev** segmented control appears in the compare toolbar (Free / Professional) with a max-columns hint (3 vs 8).
5. The choice is stored in `sessionStorage` for the tab and sent as `X-Dev-Tier` on all API calls via `lib/api.ts`. Changing tier refreshes `/auth/me` and reloads compare data when limits change.

The toggle also appears automatically when `NODE_ENV=development` (`npm run dev`) without setting `NEXT_PUBLIC_ALLOW_DEV_TIER_TOGGLE`.

**Production:** leave `NEXT_PUBLIC_ALLOW_DEV_TIER_TOGGLE` unset/false and `ALLOW_DEV_TIER_TOGGLE` unset/false so the toggle is not rendered and header overrides are ignored.

**Legacy env var** (no UI): set in project root `.env` and restart `npm run dev`:

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
4. On a 2-ticker compare, **Filing period** picker shows the latest filing plus quarters and annual filings from the last completed fiscal year.
5. Select a period **outside** that window (e.g. an annual filing from two or more years ago) — expect paywall — reason `historical_data`.
6. Open a full GAAP statement section (Income, Balance Sheet, Cash Flow, or Equity) — expect locked panel with upgrade prompt.
7. Click **Saved groups** → paywall — reason `subscription_required`.
8. `GET /auth/me` shows `tier: "free"`, `limits.max_columns: 3`.

### Professional tier

1. Enable Pro via any method above.
2. Open `/compare/aapl-vs-msft-vs-nvda-vs-googl` — filings load (up to 8 columns).
3. **Filing period** picker shows full archive; older periods load.
4. Full GAAP statement tables load with line items.
5. **Saved groups** → save and reload a peer group.
6. Header shows **Professional** badge on compare workspace.
7. `GET /auth/me` shows `tier: "professional"`, `limits.max_columns: 8`.

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
- `NEXT_PUBLIC_ALLOW_DEV_TIER_TOGGLE` must **never** be `true` in production CI/builds — the in-app dev toggle must not ship to users.
- `DEV_PRO_TIER` and `NEXT_PUBLIC_DEV_TIER` are for local QA only.
- Real charges require live Stripe keys; this project defaults to test keys in `.env.example`.
