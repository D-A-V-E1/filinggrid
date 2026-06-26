# Stripe Live mode — go-live checklist
# Full reference: docs/STRIPE_SETUP.md

## Prerequisites

- [ ] Stripe business verification complete (identity + bank)
- [ ] Dashboard switched to **Live** mode (toggle top-right)

## 1. Create live product and price

1. [dashboard.stripe.com/products](https://dashboard.stripe.com/products) (Live mode)
2. **+ Add product** → **Peer Disclosures Professional**
3. Recurring **$29.00 USD / month**
4. Copy live **Price ID** (`price_...`)

## 2. API keys (production host only)

Set on Railway/Render — never in git:

| Variable | Value |
|---|---|
| `STRIPE_SECRET_KEY` | `sk_live_...` |
| `STRIPE_PRICE_PROFESSIONAL` | live `price_...` |

## 3. Live webhook

1. [dashboard.stripe.com/webhooks](https://dashboard.stripe.com/webhooks) (Live mode)
2. **+ Add endpoint**
3. URL: `https://api.peerdisclosures.com/webhooks/stripe`
4. Events:
   - `checkout.session.completed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_failed`
5. Copy **Signing secret** → `STRIPE_WEBHOOK_SECRET` on API host

## 4. Customer Portal

Stripe Dashboard → **Settings** → **Billing** → **Customer portal** → Enable (Live mode).

## 5. Verify

```powershell
cd backend
.\.venv\Scripts\python.exe scripts\prod_smoke_check.py `
  --api https://api.peerdisclosures.com `
  --app https://peerdisclosures.com
```

Manual: any email → Checkout → tier `professional` → Portal cancel → tier `free`.

## 6. Rename legacy products (if needed)

If Checkout shows **FilingGrid Professional (Test)** or an old name, rename the product in Dashboard → Products to **Peer Disclosures Professional** and set business name to **Peer Disclosures** under Settings → Business details. See [STRIPE_SETUP.md § 10](./STRIPE_SETUP.md#10-rename-legacy-filinggrid-products-dashboard).
