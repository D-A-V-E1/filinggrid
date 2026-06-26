# DNS — peerdisclosures.com (Cloudflare)

Domain registrar: **GoDaddy** · DNS managed in **Cloudflare** · Email routing already active.

**Current state (verified 2026-06-26):**

| Item | Status |
|---|---|
| Render API (`peerdisclosures-api.onrender.com`) | ✅ Live — `GET /health` → 200 |
| Vercel deploy (`peerdisclosures.vercel.app`) | ✅ Live — code `aa5ae0c` on `main` |
| `peerdisclosures.com` (apex) | ⏸ **BLOCKED** — Cloudflare serves GoDaddy Website Builder placeholder (no `X-Vercel` header) |
| `www.peerdisclosures.com` | ⏸ Redirects to apex (still placeholder content) |
| `api.peerdisclosures.com` | ⏸ **NXDOMAIN** — no CNAME to Render |
| Email (MX) | ✅ Cloudflare Email Routing — **do not change** |

---

## Remaining steps (in order)

Complete these in the dashboards. DNS usually propagates within minutes on Cloudflare.

### Step 1 — Vercel: add custom domains

1. Open [Vercel Dashboard](https://vercel.com) → your project → **Settings → Domains**.
2. Add **`peerdisclosures.com`** and **`www.peerdisclosures.com`**.
3. Vercel will show DNS instructions — use the values in Step 2 (they match Vercel’s defaults).
4. Leave production env vars as-is for now (`NEXT_PUBLIC_API_URL` can stay on `https://peerdisclosures-api.onrender.com` until Step 4 completes).

`vercel.json` already redirects `www` → apex; no code change needed.

### Step 2 — Cloudflare: apex + www → Vercel

In [Cloudflare DNS](https://dash.cloudflare.com) for **peerdisclosures.com**:

| Action | Type | Name | Content | Proxy |
|---|---|---|---|---|
| **Edit or add** | A | `@` | `76.76.21.21` | **DNS only** (grey cloud ☁️) |
| **Edit or add** | CNAME | `www` | `cname.vercel-dns.com` | **DNS only** (grey cloud ☁️) |

- Remove or replace any apex record pointing at GoDaddy Website Builder / parking IPs.
- **Do not** orange-cloud (proxy) these records — Vercel requires DNS-only for certificate issuance.
- **Do not** change MX or email routing records.

**Verify:**

```powershell
.\scripts\dns-go-live-checklist.ps1
# Or manually:
curl.exe -sI https://peerdisclosures.com | findstr /i "server x-vercel"
curl.exe -s https://peerdisclosures.com/api/backend/health
```

Expect `Server: Vercel` (or `X-Vercel-Id` present) and proxied health `{"status":"ok",...}`.

### Step 3 — Render: API custom domain

1. [Render Dashboard](https://dashboard.render.com) → **peerdisclosures-api** → **Settings → Custom Domains**.
2. Add **`api.peerdisclosures.com`**.
3. Render shows the CNAME target (should be `peerdisclosures-api.onrender.com`).

### Step 4 — Cloudflare: api → Render

| Action | Type | Name | Content | Proxy |
|---|---|---|---|---|
| **Add** | CNAME | `api` | `peerdisclosures-api.onrender.com` | **DNS only** (grey cloud ☁️) |

**Verify:**

```powershell
nslookup api.peerdisclosures.com
curl.exe -s https://api.peerdisclosures.com/health
```

Expect `{"status":"ok",...}`.

### Step 5 — Vercel env (optional, after Step 4)

In Vercel → **Settings → Environment Variables → Production**:

| Key | Value |
|---|---|
| `NEXT_PUBLIC_API_URL` | `https://api.peerdisclosures.com` |

Redeploy after changing `NEXT_PUBLIC_*` (build-time).

### Step 6 — Stripe live webhook (after Step 4)

Blocked until `https://api.peerdisclosures.com/health` returns 200.

1. [Stripe Dashboard → Webhooks](https://dashboard.stripe.com/webhooks) (**Live** mode).
2. **+ Add endpoint** → URL: `https://api.peerdisclosures.com/webhooks/stripe`
3. Events:
   - `checkout.session.completed`
   - `customer.subscription.updated`
   - `customer.subscription.created`
   - `customer.subscription.deleted`
   - `invoice.payment_failed`
4. Copy **Signing secret** (`whsec_...`) → Render → **peerdisclosures-api** → `STRIPE_WEBHOOK_SECRET`.
5. Render will redeploy automatically.

Full detail: [STRIPE_LIVE_CHECKLIST.md](./STRIPE_LIVE_CHECKLIST.md).

### Step 7 — Supabase production URLs (after Step 2)

1. Supabase → **Authentication → URL Configuration**.
2. Site URL: `https://peerdisclosures.com`
3. Redirect URLs: `https://peerdisclosures.com/auth/callback`, `https://peerdisclosures.com/**`

See [SUPABASE_PROD_URLS.md](./SUPABASE_PROD_URLS.md).

---

## Records reference (do not change email)

### Email — keep as-is

Existing **Cloudflare Email Routing** MX records. Do **not** re-add Mailgun or Google Workspace MX unless you migrate email.

Forwarded addresses (already configured):

- `support@peerdisclosures.com` → your Gmail
- `billing@`, `security@`, `legal@`, `privacy@` → forward as needed

---

## Automated verification

```powershell
.\scripts\dns-go-live-checklist.ps1
```

Or full smoke test (after DNS + webhook):

```powershell
.\scripts\go-live.ps1 -Phase smoke
```

---

## Propagation

DNS changes usually propagate within minutes on Cloudflare. Clear browser cache if you still see the old GoDaddy site.
