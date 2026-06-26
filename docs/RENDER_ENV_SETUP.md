# Render environment setup — peerdisclosures-api

Use this when configuring **Render Dashboard → peerdisclosures-api → Environment** for production go-live.

**Status (verified 2026-06-26):** Service is **live** at `https://peerdisclosures-api.onrender.com/health` (200). Vercel deployed at `peerdisclosures.vercel.app`. Custom domain `api.peerdisclosures.com` and live Stripe webhook still pending — see [GO_LIVE_CHECKLIST.md](./GO_LIVE_CHECKLIST.md) and run `.\scripts\dns-go-live-checklist.ps1`.

## Common mistake

**Do not paste file paths.** Render env vars must be literal values.

| Wrong | Right |
|---|---|
| `backend/.env` | `postgresql://user:pass@ep-....neon.tech/neondb?sslmode=require` |
| `./backend/.env` | `sk_live_51AbCdEf...` |

If `DATABASE_URL` does not start with `postgresql://`, you pasted a path instead of the connection string.

---

## Quick checklist (Render dashboard)

Set these **five secrets** in the dashboard. Everything else is already defined in [`render.yaml`](../render.yaml).

| Key | Set in dashboard? | What to paste |
|---|---|---|
| `DATABASE_URL` | **Yes — required** | ✅ Set (Neon `postgresql://` or `postgres://`) |
| `SUPABASE_JWT_SECRET` | **Yes — required** | JWT secret from Supabase (see below) |
| `STRIPE_SECRET_KEY` | **Yes — required** | Live secret key starting with `sk_live_` |
| `STRIPE_PRICE_PROFESSIONAL` | **Yes — required** | Live price ID starting with `price_` |
| `STRIPE_WEBHOOK_SECRET` | ⏸ Pending webhook | `whsec_...` from Live webhook endpoint — **not created yet** |
| `SUPABASE_URL` | No — in render.yaml | — |
| `APP_URL` | No — in render.yaml | — |
| `CORS_ORIGINS` | No — in render.yaml | — |
| `SEC_USER_AGENT` | No — in render.yaml | — |
| `FILING_CACHE_ENABLED` | No — in render.yaml | — |
| `FILING_CACHE_DIR` | No — in render.yaml | — |
| `ALLOW_DEV_TIER_TOGGLE` | No — in render.yaml | — |
| `DEV_PRO_TIER` | No — in render.yaml | — |

---

## Where each value comes from

### `DATABASE_URL`

1. Open [Neon console](https://console.neon.tech) → your project → **Connection details**.
2. Copy the connection string (or from local `backend/.env`: copy everything after `DATABASE_URL=` on that line).
3. Paste into Render. Value must start with `postgresql://` and include `?sslmode=require`.

### `SUPABASE_JWT_SECRET`

1. [Supabase Dashboard](https://supabase.com/dashboard) → Project → **Project Settings → API**.
2. Copy **JWT Secret** (legacy HS256 fallback; JWKS is derived from `SUPABASE_URL` automatically).
3. Or from local `backend/.env`: copy everything after `SUPABASE_JWT_SECRET=`.

### `STRIPE_SECRET_KEY`

1. [Stripe Dashboard](https://dashboard.stripe.com/apikeys) → switch to **Live mode** (top-right).
2. Copy **Secret key** — must start with `sk_live_`, not `sk_test_`.
3. Do **not** use the test key from local `backend/.env` for production.

### `STRIPE_PRICE_PROFESSIONAL`

1. Stripe Dashboard (Live mode) → **Products** → PeerDisclosures Professional → copy Price ID.
2. Must start with `price_` and be from **Live** mode (example in `scripts/render-production-env.example`).

### `STRIPE_WEBHOOK_SECRET`

1. Stripe Dashboard (Live mode) → **Developers → Webhooks → Add endpoint**.
2. URL: `https://api.peerdisclosures.com/webhooks/stripe`
3. After creating, copy **Signing secret** (`whsec_...`).
4. Can leave empty or a placeholder until the webhook exists; subscription updates will not work until set.

---

## Already configured in render.yaml

These are applied from the blueprint — **do not duplicate** unless you need to override:

```yaml
SUPABASE_URL=https://cbqiqbcqzvfozewqzqnl.supabase.co
APP_URL=https://peerdisclosures.com
CORS_ORIGINS=https://peerdisclosures.com
SEC_USER_AGENT=PeerDisclosures/1.0 (support@peerdisclosures.com)
FILING_CACHE_ENABLED=true
FILING_CACHE_DIR=cache/filings
ALLOW_DEV_TIER_TOGGLE=false
DEV_PRO_TIER=false
```

---

## Verify after save

1. Render → **Manual Deploy** (or wait for auto-deploy).
2. **Now:** `https://peerdisclosures-api.onrender.com/health` → expect `{"status":"ok",...}`.
3. **After custom domain:** `https://api.peerdisclosures.com/health` → same response.
4. If health fails, check **Logs** for database connection errors (usually bad `DATABASE_URL`).

---

## Related docs

- [PRODUCTION_DEPLOY.md](./PRODUCTION_DEPLOY.md) — full deployment guide
- [STRIPE_LIVE_CHECKLIST.md](./STRIPE_LIVE_CHECKLIST.md) — Stripe Live mode steps
- [`scripts/render-production-env.example`](../scripts/render-production-env.example) — copy-paste template with warnings
