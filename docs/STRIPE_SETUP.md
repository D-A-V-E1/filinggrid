# Stripe setup — Peer Disclosures Professional ($29/mo)

Step-by-step guide for **test mode** (local / staging) and **live mode** (production). The backend owns Checkout and webhooks; the frontend redirects users to Stripe-hosted pages.

---

## Cursor Stripe plugin (MCP + skills)

PeerDisclosures uses three separate Stripe surfaces. They complement each other; only the **CLI** and **Dashboard** populate `backend/.env`.

| Surface | What it is | Used for |
|---|---|---|
| **Cursor Stripe plugin** | Official plugin (`plugin-stripe-stripe`) with MCP at `https://mcp.stripe.com` and agent skills (`stripe-best-practices`, `upgrade-stripe`, etc.) | Agent-assisted API calls, docs search, product/price creation (with approval), account lookup |
| **Stripe CLI** | `stripe.exe` (install: `winget install Stripe.StripeCli`) | `stripe login`, `stripe listen` → local `whsec_...`, triggering test events |
| **Stripe Dashboard** | [dashboard.stripe.com](https://dashboard.stripe.com) | Copy `sk_test_...`, `pk_test_...`, Customer Portal, production webhooks |

**First-time plugin auth:** In Cursor, approve MCP auth for the Stripe server when prompted (`mcp_auth`). The agent can then call tools like `get_stripe_account_info`, `search_stripe_resources`, and `stripe_api_write` against your linked Stripe account.

**Windows PATH:** Winget installs the CLI as a portable binary (not always on `PATH`):

```powershell
$stripe = "$env:LOCALAPPDATA\Microsoft\WinGet\Packages\Stripe.StripeCli_Microsoft.Winget.Source_8wekyb3d8bbwe\stripe.exe"
& $stripe --version
```

Optional: add that folder to your user `PATH`, or create a WinGet shim link.

**How the plugin relates to this app:** The FastAPI backend (`backend/billing/stripe_routes.py`) still reads **`STRIPE_SECRET_KEY`**, **`STRIPE_WEBHOOK_SECRET`**, and **`STRIPE_PRICE_PROFESSIONAL`** from `backend/.env`. The MCP plugin does not inject those automatically — use Dashboard keys + CLI `stripe listen` output (or MCP to create the product/price, then paste IDs into `.env`).

---

## What the code expects

| Item | Value |
|---|---|
| Product name | **Peer Disclosures Professional** (any name works; price ID is what matters) |
| Price | **$29.00 USD / month**, recurring |
| Checkout mode | Subscription (`mode=subscription`) |
| Success redirect | `{APP_URL}{return_path}?checkout=success` |
| Cancel redirect | `{APP_URL}/pricing?checkout=cancelled` |
| Webhook URL (production) | `https://api.peerdisclosures.com/webhooks/stripe` |
| Tier in database | `organizations.subscription_tier` → `professional` when subscription is `active` or `trialing` |

**Email for Professional checkout:** Any email address is accepted (Gmail, iCloud, work email, etc.). Helpers `validate_corporate_email` (`backend/middleware.py`) and `isCorporateEmail` (`lib/utils.ts`) are reserved for a future enterprise tier — not enforced on Professional.

---

## 1. Create product and price

### Test mode (Dashboard toggle: **Test mode** on)

1. Open [Stripe Dashboard → Products](https://dashboard.stripe.com/test/products).
2. **+ Add product**
   - Name: `Peer Disclosures Professional`
   - Description (optional): `Up to 8 columns, full GAAP statements, filing archive, saved peer groups`
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
| Production | `APP_URL=https://peerdisclosures.com` |

Must match the browser origin users actually use (HTTPS in production). Also set `NEXT_PUBLIC_APP_URL` to the same value for SEO/metadata.

---

## 6. End-to-end test (test mode)

1. Env: test keys, `STRIPE_PRICE_PROFESSIONAL`, `STRIPE_WEBHOOK_SECRET`, Supabase auth, PostgreSQL running.
2. `stripe listen --forward-to localhost:8000/webhooks/stripe`
3. Sign in with any email (Gmail, work email, etc.).
4. Open compare → trigger paywall → **Continue to Stripe Checkout**.
5. Pay with test card `4242 4242 4242 4242`, any future expiry, any CVC.
6. After redirect, banner shows activation; tier becomes `professional` within a few seconds (webhook).
7. Verify:
   - `GET /auth/me` → `tier: "professional"`
   - 4+ ticker compare works; full filing period picker works
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
| Checkout works locally, not prod | Live keys on test price ID, or `APP_URL` still localhost |
| Success banner but tier slow | Normal — webhooks take 1–5s; UI polls `/auth/me` automatically |

---

## 9. Customer emails (receipts & failed payments)

Stripe sends billing emails when enabled — not configured in app code.

### Test mode

1. [Settings → Customer emails](https://dashboard.stripe.com/test/settings/emails) (test mode toggle on)
2. Enable:
   - **Successful payments** — receipt after Checkout / invoice paid
   - **Failed payments** — dunning when card fails (pairs with `invoice.payment_failed` webhook)
3. Optional: **Upcoming invoice reminders** for renewals
4. Complete a test checkout (`4242...`) → confirm receipt arrives at checkout email

### Live mode (before launch)

Repeat the same toggles under [live Customer emails](https://dashboard.stripe.com/settings/emails).

### Branding (optional)

[Settings → Branding](https://dashboard.stripe.com/settings/branding) — logo and colors appear on Checkout, Portal, and customer emails.

---

## 10. Rename legacy FilingGrid products (Dashboard)

Checkout and receipts show the **Stripe product name**, not anything from this codebase. If Checkout still displays **FilingGrid Professional (Test)** or similar:

1. Open [Stripe Dashboard → Products](https://dashboard.stripe.com/products) in the mode you use (Test or Live).
2. Find the product tied to your `STRIPE_PRICE_PROFESSIONAL` price ID (Products → click product → Prices).
3. Edit the product:
   - **Name:** `Peer Disclosures Professional` (no `(Test)` suffix — Stripe adds test-mode indicators separately in Checkout when using test keys).
   - **Description (optional):** `Up to 8 columns, full GAAP statements, filing archive, saved peer groups`
4. Under [Settings → Business details](https://dashboard.stripe.com/settings/business-details), set **Public business name** to `Peer Disclosures` so Checkout shows the correct merchant name.
5. If you created a duplicate product with the correct name, update `STRIPE_PRICE_PROFESSIONAL` in production env to the new live **Price ID** — price IDs are immutable; renaming the product is usually enough.

> **Note:** Test-mode Checkout may still show a “Test mode” banner — that is expected with `sk_test_...` keys and is not controlled by app copy.

---

## Related docs

- [GO_LIVE_CHECKLIST.md](./GO_LIVE_CHECKLIST.md) — full production launch timeline
- [TIER_TESTING.md](./TIER_TESTING.md) — test tiers without Stripe (dev only)
- [README.md](../README.md) — env variable reference
