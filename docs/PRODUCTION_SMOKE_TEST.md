# Production smoke test — peerdisclosures.com

Run after deploying frontend (Vercel), API (`api.peerdisclosures.com`), Supabase prod URLs, and Stripe **Live** mode. Adapted from [TIER_TESTING.md](./TIER_TESTING.md) § Sign-up & onboarding E2E.

**Status (verified 2026-06-26):** Full smoke test **blocked** — Vercel not connected, `api.peerdisclosures.com` NXDOMAIN, Stripe live webhook not created. API-only check available on Render hostname below.

**Prerequisites:** Live Stripe account verified, live webhook at `https://api.peerdisclosures.com/webhooks/stripe`, `ALLOW_DEV_TIER_TOGGLE=false` on API.

---

## Interim API checks (Render hostname)

Use while custom domain is pending:

```powershell
curl.exe -s https://peerdisclosures-api.onrender.com/health
curl.exe -s -o NUL -w "%{http_code}" -X POST https://peerdisclosures-api.onrender.com/dev/tier `
  -H "Content-Type: application/json" -d "{\"tier\":\"professional\"}"
# Expect HTTP 404 (dev toggle off)
```

---

## Automated HTTP checks

```powershell
cd backend
.\.venv\Scripts\python.exe scripts/prod_smoke_check.py `
  --api https://api.peerdisclosures.com `
  --app https://peerdisclosures.com
```

Expected: all `OK` lines; `POST /dev/tier` returns **404**.

Direct curl equivalents:

```powershell
curl -s https://api.peerdisclosures.com/health
curl -s https://peerdisclosures.com/api/backend/health
curl -s -o NUL -w "%{http_code}" -X POST https://api.peerdisclosures.com/dev/tier `
  -H "Content-Type: application/json" -d "{\"tier\":\"professional\"}"
# Expect HTTP 404
```

---

## Manual browser checklist

Use a **corporate email** (not Gmail/Yahoo) for Professional checkout.

| # | Action | Expected |
|---|--------|----------|
| 1 | Open `https://peerdisclosures.com` | Home/compare loads over HTTPS |
| 2 | Compare 3 tickers (e.g. AAPL, MSFT, NVDA) | Filings load, no login required |
| 3 | Add 4th ticker | **PaywallModal** — reason `column_limit` |
| 4 | `/account` → sign in with any email → magic link | Redirect to `?auth=success`; welcome checklist |
| 5 | Sign in with Gmail → **Upgrade to Professional** | Error: work email required (no Stripe redirect) |
| 6 | Paywall → work email magic link → **Continue to Stripe Checkout** | Stripe Live Checkout (real card or live test per Stripe docs) |
| 7 | Complete payment | Redirect `?checkout=success`; activation banner |
| 8 | Stripe Dashboard → [Webhooks](https://dashboard.stripe.com/webhooks) → latest event | `checkout.session.completed` **200** to `api.peerdisclosures.com` |
| 9 | Refresh compare with 4+ tickers | Up to 8 columns load; **Professional** badge |
| 10 | Full GAAP Income Statement section | Full line items (not locked) |
| 11 | **Saved groups** → save peer group | CRUD works at `/peer-groups` |
| 12 | `/account` → **Manage billing** | Stripe Customer Portal opens |
| 13 | Cancel subscription in Portal | Webhook `customer.subscription.deleted` delivered |
| 14 | After webhook (~seconds) | `GET /auth/me` → `tier: "free"`; 4-ticker paywall returns |
| 15 | Compare header | **No** Free/Pro dev toggle |
| 16 | Inboxes | Magic link email received; Stripe receipt (if Customer emails enabled) |

---

## Verify tier via API

After sign-in, copy JWT from browser DevTools (Application → cookies / Network → `Authorization` header on API calls):

```powershell
curl -s https://api.peerdisclosures.com/auth/me `
  -H "Authorization: Bearer YOUR_JWT"
```

Before checkout: `"tier": "free"`, `"limits": {"max_columns": 3, ...}`  
After webhook: `"tier": "professional"`, `"max_columns": 8`  
After portal cancel: `"tier": "free"`

---

## Stripe Dashboard verification

1. [dashboard.stripe.com/webhooks](https://dashboard.stripe.com/webhooks) — endpoint URL exactly:
   ```
   https://api.peerdisclosures.com/webhooks/stripe
   ```
2. Required events subscribed (see [STRIPE_SETUP.md § 3](./STRIPE_SETUP.md#3-webhooks)).
3. No sustained **failed** deliveries in first 24h after launch.

---

## Rollback / abort criteria

Stop launch if any of:

- Webhook signature failures (`400 Invalid signature` in API logs)
- `/dev/tier` returns anything other than **404**
- Magic link redirects to wrong domain
- `APP_URL` mismatch (Stripe success URL shows localhost)
- Compare works on HTTP but not HTTPS (fix before taking payments)

---

## Post-launch monitoring (first 24h)

- [ ] Stripe webhook delivery success rate
- [ ] API host error rate (5xx)
- [ ] Vercel function/edge logs for `/api/backend/*` proxy errors
- [ ] Support inbox for billing questions

See also [GO_LIVE_CHECKLIST.md § Post-launch](./GO_LIVE_CHECKLIST.md#post-launch).
