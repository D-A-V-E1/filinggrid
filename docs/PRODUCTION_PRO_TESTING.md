# Production Professional tier testing — Peer Disclosures

Dedicated runbook for verifying **Professional** subscription behavior on **production** (`https://peerdisclosures.com`). Use this when billing must be real: Stripe **Live** mode, live webhooks, and a real payment (or Stripe live test per Dashboard docs).

### Non-technical testers

If you are **not** a developer and just need to confirm Professional works on the live site (sign in, pay, check features, cancel), use the plain-language guide: **[PRODUCTION_PRO_TESTING_SIMPLE.md](./PRODUCTION_PRO_TESTING_SIMPLE.md)** (~20–30 min, includes cancel step).

**Not for daily development.** For local tier toggles, dev headers, and test card `4242…`, use [TIER_TESTING.md](./TIER_TESTING.md) instead.

**Related runbooks:**

- [POST_PROD_CHECKLIST.md](./POST_PROD_CHECKLIST.md) — post-launch checklist (includes Stripe live E2E)
- [PRODUCTION_SMOKE_TEST.md](./PRODUCTION_SMOKE_TEST.md) — full production smoke + rollback criteria
- [TIER_TESTING.md](./TIER_TESTING.md) — local/staging tier overrides (**do not use in prod**)
- [STRIPE_SETUP.md](./STRIPE_SETUP.md) — products, webhooks, Customer Portal, branding
- [POST_PROD_SMOKE_LOG.md](./POST_PROD_SMOKE_LOG.md) — dated smoke results template

---

## 1. When to run

Run this Pro smoke when any of the following apply:

| Trigger | Why |
|---|---|
| **After billing or auth deploy** | Checkout URLs, webhooks, tier gates, or Supabase redirect URLs may have changed |
| **After Stripe Dashboard changes** | New live price ID, webhook endpoint, Customer Portal settings, or product rename |
| **Monthly** | Catch webhook drift, tier regressions, or env misalignment before users report billing issues |
| **Before launch or pricing announcements** | Confirm live checkout, Pro unlock, and portal cancel work end-to-end |

For general HTTP/branding smoke (no payment), run [PRODUCTION_SMOKE_TEST.md](./PRODUCTION_SMOKE_TEST.md) or [POST_PROD_CHECKLIST.md § Browser smoke](./POST_PROD_CHECKLIST.md#browser-smoke-production).

---

## 2. Prerequisites

Confirm production is wired for live billing before starting:

- [ ] **Property live** — `https://peerdisclosures.com` and `https://api.peerdisclosures.com` resolve over HTTPS
- [ ] **Stripe Live keys** on API host — `STRIPE_SECRET_KEY=sk_live_…`, live `STRIPE_PRICE_PROFESSIONAL=price_…` (not test IDs)
- [ ] **Live webhook** registered at `https://api.peerdisclosures.com/webhooks/stripe` with signing secret in `STRIPE_WEBHOOK_SECRET` ([STRIPE_SETUP.md § 3](./STRIPE_SETUP.md#3-webhooks))
- [ ] **Customer Portal** activated in Live mode ([STRIPE_SETUP.md § 4](./STRIPE_SETUP.md#4-customer-portal))
- [ ] **`APP_URL=https://peerdisclosures.com`** on API; `NEXT_PUBLIC_APP_URL` matches on Vercel
- [ ] **Supabase prod URLs** — Site URL and redirect URLs point to `https://peerdisclosures.com` ([SUPABASE_PROD_URLS.md](./SUPABASE_PROD_URLS.md))
- [ ] **Dev tier toggle off** — `ALLOW_DEV_TIER_TOGGLE` unset or `false` on API; no `NEXT_PUBLIC_ALLOW_DEV_TIER_TOGGLE` on Vercel
- [ ] **Dedicated test email** — use a real inbox you control (Gmail, iCloud, work email, etc.); any email works — no corporate gate for Professional
- [ ] **Stripe Dashboard** — product shows **Peer Disclosures Professional** (not legacy FilingGrid names); public business name = **Peer Disclosures** ([STRIPE_SETUP.md § 10](./STRIPE_SETUP.md#10-rename-legacy-filinggrid-products-dashboard))

---

## 3. What NOT to do in production

These methods are for **local/staging only** ([TIER_TESTING.md](./TIER_TESTING.md)). Never use them against `peerdisclosures.com` or the production database:

| Do not | Why |
|---|---|
| Enable `ALLOW_DEV_TIER_TOGGLE=true` or `NEXT_PUBLIC_ALLOW_DEV_TIER_TOGGLE=true` | Exposes `/dev/tier` and in-app Free/Pro toggle to users |
| Call `POST /dev/tier` expecting 200 | Must return **404** in production |
| Send `X-Dev-Tier: professional` header | Header overrides are ignored when dev toggle is off; enabling the flag would bypass Stripe |
| Run `backend/scripts/set_org_tier.py` against prod DB | Bypasses billing; corrupts subscription truth |
| Set `DEV_PRO_TIER=true` or `NEXT_PUBLIC_DEV_TIER=professional` in prod env | Forces Pro for everyone without payment |
| Use test card **`4242 4242 4242 4242`** on Live Checkout | Test cards only work in Stripe **test** mode ([TIER_TESTING.md § Stripe test mode](./TIER_TESTING.md#stripe-test-mode-optional-before-production)) |
| Leave an active subscription uncancelled after smoke | Recurring **$29/mo** charge — always tear down in Customer Portal |

**Daily development:** use local `.env` with test keys, `stripe listen`, and [TIER_TESTING.md](./TIER_TESTING.md) Methods 1–4.

---

## 4. Pre-flight checks

Run these **before** signing in or paying. All should pass.

### Automated (read-only)

```powershell
cd backend
.\.venv\Scripts\python.exe scripts/prod_smoke_check.py `
  --api https://api.peerdisclosures.com `
  --app https://peerdisclosures.com
```

Expected: all `OK` lines; `POST /dev/tier` → **404**.

### Manual curl equivalents

```powershell
# API health
curl.exe -s https://api.peerdisclosures.com/health
# Expect: {"status":"ok","service":"peer-disclosures-api",...}

# Frontend proxy
curl.exe -s https://peerdisclosures.com/api/backend/health
# Expect: same payload proxied OK

# Dev tier locked down (must 404)
curl.exe -s -o NUL -w "%{http_code}" -X POST https://api.peerdisclosures.com/dev/tier `
  -H "Content-Type: application/json" -d "{\"tier\":\"professional\"}"
# Expect: 404
```

### Optional

- [ ] `GET https://peerdisclosures.com/sitemap.xml` → 200 (SEO sanity)
- [ ] Compare header on any compare page — **no** Free/Pro dev toggle
- [ ] `/pricing` — Free + Professional; no “Corporate email required”

---

## 5. Step-by-step manual Pro smoke

Use a **dedicated test email** you can access for magic link and Stripe receipt. Complete every step; record results in [POST_PROD_SMOKE_LOG.md](./POST_PROD_SMOKE_LOG.md) if desired.

### Sign in

- [ ] Open `https://peerdisclosures.com/account`
- [ ] Enter your test email (any provider) → **Send magic link**
- [ ] Open magic link from inbox → redirect to `https://peerdisclosures.com/auth/callback` → `?auth=success`
- [ ] Welcome checklist or account UI loads; **Peer Disclosures** branding throughout

### Upgrade → Stripe Live Checkout

- [ ] From `/account` or paywall (add 4th ticker on compare) → **Upgrade to Professional**
- [ ] Stripe **Live** Checkout opens (hosted by Stripe)
- [ ] Verify Checkout branding: **Peer Disclosures Professional**, **$29/mo**, merchant name **Peer Disclosures** (not FilingGrid)
- [ ] Complete payment with a **real card** (or Stripe live test method per [Stripe Dashboard docs](https://docs.stripe.com/testing#live-mode))

### Payment + webhook verification

- [ ] After payment → redirect to `https://peerdisclosures.com/...?checkout=success`
- [ ] Activation banner appears; UI may poll tier for a few seconds
- [ ] [Stripe Dashboard → Webhooks](https://dashboard.stripe.com/webhooks) (Live mode) → latest `checkout.session.completed` → delivery **200** to `api.peerdisclosures.com`
- [ ] Optional: Stripe receipt email received (if Customer emails enabled — [STRIPE_SETUP.md § 9](./STRIPE_SETUP.md#9-customer-emails-receipts--failed-payments))

### Tier API check

Copy JWT from browser DevTools (Network → API call `Authorization` header, or Application → cookies):

```powershell
curl.exe -s https://api.peerdisclosures.com/auth/me `
  -H "Authorization: Bearer YOUR_JWT"
```

- [ ] Response includes `"tier": "professional"` and `"limits": {"max_columns": 8, ...}`

### Pro feature matrix

| Feature | Free | Professional | Verify on prod |
|---|---|---|---|
| Max ticker columns | 3 | 8 | [ ] |
| Filing periods | Latest + last completed FY | Full archive | [ ] |
| Full GAAP statement tables | Locked | Full line items | [ ] |
| Saved peer groups | Paywall | CRUD at `/peer-groups` | [ ] |
| SEC filing excerpts | Limited / paywall paths | Loads for Pro periods | [ ] |

**Browser checks:**

- [ ] Open compare with **4+ tickers** (e.g. `https://peerdisclosures.com/compare/aapl-vs-msft-vs-nvda-vs-googl`) — all columns load; **Professional** badge in header
- [ ] **Filing period** picker — select an older annual period (outside free window) — loads without `historical_data` paywall
- [ ] **Full GAAP** — Income Statement (or Balance Sheet / Cash Flow) — full line items, not locked upgrade panel
- [ ] **Saved groups** — `/peer-groups` → create, save, reload a peer group
- [ ] **Excerpts** — on a compare with segment or note sections (e.g. `nvda-vs-amd-vs-intc` → Segment Information), **View SEC filing excerpt** loads or shows clear empty state (not infinite spinner)

### Customer Portal cancel → back to Free

- [ ] `/account` → **Manage billing** → Stripe Customer Portal opens
- [ ] Cancel subscription in Portal (confirm cancellation)
- [ ] Stripe Dashboard → `customer.subscription.deleted` (or updated) webhook → delivery **200**
- [ ] Wait ~5–30 seconds; refresh compare or `/account`
- [ ] `GET /auth/me` → `"tier": "free"`, `"limits": {"max_columns": 3, ...}`
- [ ] Add 4th ticker on compare → **PaywallModal** (`column_limit`) returns

---

## 6. Teardown

**Always cancel** after a successful Pro smoke to avoid recurring charges:

1. `/account` → **Manage billing** → Customer Portal
2. Cancel subscription (immediate or end of period — prefer immediate for test accounts)
3. Confirm webhook delivered and `GET /auth/me` shows `tier: "free"`
4. Optional: Stripe Dashboard → Customers → verify subscription status **canceled**

If you used a personal card, check the Stripe receipt and your card statement for the one test charge.

---

## 7. If already Pro (shorter re-test)

Skip checkout when the test org already has an **active** Professional subscription (e.g. beta tester or prior smoke not torn down):

- [ ] Pre-flight checks (§ 4) — especially `POST /dev/tier` → **404**
- [ ] Sign in with the Pro account email → magic link on prod domain
- [ ] `GET /auth/me` → `tier: "professional"`, `max_columns: 8`
- [ ] Compare 4+ tickers; full archive period; GAAP tables; saved groups; excerpt button
- [ ] `/account` → **Manage billing** opens Customer Portal
- [ ] **Do not** complete a second checkout unless testing checkout specifically

If testing **cancel → free** again, run § 6 teardown. If keeping Pro for ongoing QA, document the account email and renewal date.

---

## 8. Automated helpers (prod-safe, read-only)

These scripts and curls do **not** mutate tier or charge cards:

| Helper | Purpose |
|---|---|
| `backend/scripts/prod_smoke_check.py` | Health, proxy, `/dev/tier` 404, ticker search |
| `curl GET /health` | API up |
| `curl GET /auth/me` + JWT | Tier verification **after** manual sign-in (read-only) |

**Not safe for unattended prod use:**

- `backend/scripts/set_org_tier.py` — writes prod DB
- `POST /dev/tier` — must 404; if 200, **stop** and disable dev toggle
- `backend/scripts/e2e_checkout_test.py` — local/test Stripe only

Full billing E2E remains **manual** on production ([POST_PROD_CHECKLIST.md § Stripe live E2E](./POST_PROD_CHECKLIST.md#stripe-live-e2e-manual-real-payment)).

---

## 9. Cross-links

| Document | Use when |
|---|---|
| [POST_PROD_CHECKLIST.md](./POST_PROD_CHECKLIST.md) | First 24h after launch; weekly month 1; env alignment |
| [PRODUCTION_SMOKE_TEST.md](./PRODUCTION_SMOKE_TEST.md) | Full smoke script, rollback/abort criteria, monitoring |
| [TIER_TESTING.md](./TIER_TESTING.md) | Local dev: dev toggle, `/dev/tier`, test card 4242 |
| [STRIPE_SETUP.md](./STRIPE_SETUP.md) | Webhook events, Portal, branding, troubleshooting |
| [POST_PROD_SMOKE_LOG.md](./POST_PROD_SMOKE_LOG.md) | Record dated PASS/FAIL/SKIP results |

---

## 10. Optional — Stripe promotion codes (beta testers)

For newsletter readers, design partners, or friends-and-family **without** running this full smoke yourself each time:

1. [Stripe Dashboard → Products → Coupons](https://dashboard.stripe.com/coupons) (Live mode)
2. Create a coupon (e.g. **100% off first month** or **$29 off**)
3. Create a **Promotion code** (e.g. `PEERBETA2026`) linked to that coupon
4. Enable **Promotion codes** on Checkout ([Stripe docs](https://docs.stripe.com/payments/checkout/discounts))
5. Share code with testers; they complete Live Checkout at `https://peerdisclosures.com/pricing` or via paywall

**Notes:**

- Promotion codes are optional — not required for this smoke test
- Track redemptions in Stripe Dashboard → Reports
- Testers should still use **any email**; no corporate gate
- Prefer time-limited or max-redemption codes; revoke when beta ends
- Webhook path is unchanged — `checkout.session.completed` still sets `professional` tier

See also [LAUNCH_AND_TRACTION_PLAN.md](./LAUNCH_AND_TRACTION_PLAN.md) for go-to-market use of promo codes.

---

## Rollback / abort criteria

Stop and fix before announcing Pro or taking more payments if:

- `POST /dev/tier` returns anything other than **404**
- Webhook signature failures (`400 Invalid signature` in API logs)
- Magic link redirects to `localhost` or wrong domain
- Paid checkout but `GET /auth/me` stays `free` after 60s (webhook not reaching API)
- Checkout shows legacy **FilingGrid** product name (rename in Dashboard — [STRIPE_SETUP.md § 10](./STRIPE_SETUP.md#10-rename-legacy-filinggrid-products-dashboard))

Full list: [PRODUCTION_SMOKE_TEST.md § Rollback](./PRODUCTION_SMOKE_TEST.md#rollback--abort-criteria).
