# Stripe setup — FilingGrid Professional ($29/mo)

Step-by-step guide for **test mode** (local / staging) and **live mode** (production). The backend owns Checkout and webhooks; the frontend redirects users to Stripe-hosted pages.

---

## What the code expects

| Item | Value |
|---|---|
| Product name | **FilingGrid Professional** (any name works; price ID is what matters) |
| Price | **$29.00 USD / month**, recurring |
| Checkout mode | Subscription (`mode=subscription`) |
| Success redirect | `{APP_URL}{return_path}?checkout=success` |
| Cancel redirect | `{APP_URL}/pricing?checkout=cancelled` |
| Webhook URL (production) | `https://api.yourdomain.com/webhooks/stripe` |
| Tier in database | `organizations.subscription_tier` → `professional` when subscription is `active` or `trialing` |

**Corporate email gate (intentional for MVP):** Checkout and the paywall magic-link form reject consumer domains (Gmail, Yahoo, Outlook personal, etc.). Sign-in for free compare still allows any email; only **Professional billing** requires a work email. See `backend/middleware.py` (`validate_corporate_email`) and `lib/utils.ts` (`isCorporateEmail`).

---

## 1. Create product and price

### Test mode (Dashboard toggle: **Test mode** on)

1. Open [Stripe Dashboard → Products](https://dashboard.stripe.com/test/products).
2. **+ Add product**
   - Name: `FilingGrid Professional`
   - Description (optional): `Up to 8 columns, historical filings, saved peer groups`
3. Under **Pricing**, add:
   - **Recurring** → **Monthly** → **$29.00 USD**
4. Save and copy the **Price ID** (`price_...`).

Set in `.env` (project root and `backend/.env`):

```env
STRIPE_PRICE_PROFESSIONAL=price_xxxxxxxxxxxxx
# Alias also supported:
# STRIPE_PRICE_ID_PRO=price_xxxxxxxxxxxxx
```

### Live mode (before go-live)

1. Switch Dashboard to **Live mode**.
2. Repeat product/price creation (live prices have different IDs).
3. Update production env with **live** `price_...` ID — never reuse test price IDs in production.

---

## 2. API keys

| Variable | Where | Test | Live |
|---|---|---|---|
| `STRIPE_SECRET_KEY` | Backend only | `sk_test_...` | `sk_live_...` |
| `STRIPE_WEBHOOK_SECRET` | Backend only | `whsec_...` (CLI or test endpoint) | `whsec_...` (live endpoint) |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Frontend (optional) | `pk_test_...` | `pk_live_...` |

> **Note:** Checkout is created server-side; `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` is **not required** for the current MVP flow. Keep it documented for future Stripe.js / Elements use.

**Never** commit real keys. Use hosting provider secret stores (Vercel, Railway, Fly, etc.).

---

## 3. Webhooks

### Required events

Register these on your webhook endpoint:

- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.payment_failed`

### Local development (Stripe CLI)

```powershell
stripe login
stripe listen --forward-to localhost:8000/webhooks/stripe
```

Copy the signing secret printed by the CLI → `STRIPE_WEBHOOK_SECRET=whsec_...`

Restart the API after changing env vars.

### Production

1. [Stripe Dashboard → Webhooks](https://dashboard.stripe.com/webhooks) (live mode).
2. **Add endpoint**
   - URL: `https://YOUR_API_HOST/webhooks/stripe`
   - Select the events listed above.
3. Copy **Signing secret** → production `STRIPE_WEBHOOK_SECRET`.

The app exposes the handler at **`POST /webhooks/stripe`** (also available at `/billing/webhooks/stripe`; use the top-level URL in the Dashboard).

**Behavior:**

- Signature verified via `stripe.Webhook.construct_event`
- Idempotency via `stripe_events` table (duplicate `event.id` → `already_processed`)
- On active/trialing subscription → `organizations.subscription_tier = professional`
- On cancellation → tier reverts to `free`

---

## 4. Customer Portal

1. [Settings → Billing → Customer portal](https://dashboard.stripe.com/settings/billing/portal)
2. **Activate** the portal (test and live separately).
3. Enable at minimum:
   - Cancel subscription
   - Update payment method
   - View invoice history
4. Set **Return URL** default if prompted; the app passes `return_url` per session (`/account` or compare path).

Users reach the portal via **Manage billing** on `/account` or the paywall (`POST /billing/portal`).

---

## 5. Redirect URLs (`APP_URL`)

Backend uses `APP_URL` (alias: `FRONTEND_URL`) for Stripe success/cancel/portal return URLs.

| Environment | Example |
|---|---|
| Local | `APP_URL=http://localhost:3000` |
| Production | `APP_URL=https://filinggrid.com` |

Must match the browser origin users actually use (HTTPS in production). Also set `NEXT_PUBLIC_APP_URL` to the same value for SEO/metadata.

---

## 6. End-to-end test (test mode)

1. Env: test keys, `STRIPE_PRICE_PROFESSIONAL`, `STRIPE_WEBHOOK_SECRET`, Supabase auth, PostgreSQL running.
2. `stripe listen --forward-to localhost:8000/webhooks/stripe`
3. Sign in with a **corporate** email (e.g. `you@yourcompany.com` — not Gmail).
4. Open compare → trigger paywall → **Continue to Stripe Checkout**.
5. Pay with test card `4242 4242 4242 4242`, any future expiry, any CVC.
6. After redirect, banner shows activation; tier becomes `professional` within a few seconds (webhook).
7. Verify:
   - `GET /auth/me` → `tier: "professional"`
   - 4+ ticker compare works; prior-year picker works
   - `/account` → **Manage billing** opens Customer Portal

### Useful Stripe CLI commands

```powershell
# Trigger a test event
stripe trigger checkout.session.completed

# Inspect recent events
stripe events list --limit 5
```

---

## 7. Test vs live checklist

| Step | Test mode | Live mode |
|---|---|---|
| Dashboard toggle | Test | Live |
| Secret key | `sk_test_...` | `sk_live_...` |
| Price ID | Test `price_...` | Live `price_...` |
| Webhook endpoint | CLI or test endpoint | Production API URL |
| Webhook secret | From CLI / test endpoint | From live endpoint |
| Cards | `4242...` | Real cards |
| Activate account | N/A | Complete Stripe business verification |

---

## 8. Troubleshooting

| Symptom | Likely cause |
|---|---|
| `503 Billing is not configured` | Missing `STRIPE_SECRET_KEY` or `STRIPE_PRICE_PROFESSIONAL` |
| `400 Invalid signature` | Wrong `STRIPE_WEBHOOK_SECRET` or body parsed before handler |
| Paid but still Free | Webhook not reaching API; check Stripe Dashboard → Webhooks → event log |
| `Professional tier requires a corporate email` | Consumer domain blocked by design |
| Checkout works locally, not prod | Live keys on test price ID, or `APP_URL` still localhost |
| Success banner but tier slow | Normal — webhooks take 1–5s; UI polls `/auth/me` automatically |

---

## Related docs

- [GO_LIVE_CHECKLIST.md](./GO_LIVE_CHECKLIST.md) — full production launch timeline
- [TIER_TESTING.md](./TIER_TESTING.md) — test tiers without Stripe (dev only)
- [README.md](../README.md) — env variable reference
