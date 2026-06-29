# Resend + Supabase custom SMTP — Peer Disclosures magic links

Send magic-link sign-in emails from **Peer Disclosures** (`noreply@peerdisclosures.com`) instead of Supabase’s default sender. Supabase Auth still sends the email; Resend is only the **SMTP relay** and DNS identity for deliverability.

**Domain:** `peerdisclosures.com`  
**DNS:** Cloudflare (Email Routing already active — **do not change MX**)  
**Supabase project:** [cbqiqbcqzvfozewqzqnl](https://supabase.com/dashboard/project/cbqiqbcqzvfozewqzqnl) (`filinggrid-dev`)  
**Sender:** `Peer Disclosures <noreply@peerdisclosures.com>`

**Prerequisites:** Magic Link template already applied — see [SUPABASE_EMAIL_BRANDING.md § 1](./SUPABASE_EMAIL_BRANDING.md#1-magic-link-template-subject--body). Custom SMTP changes the **From** header; the template changes subject and body.

---

## Overview (order of operations)

1. Create Resend account and add domain `peerdisclosures.com`
2. Add Resend DNS records in Cloudflare (DKIM, SPF) — **keep existing MX / Email Routing**
3. Wait for Resend domain verification
4. Create Resend API key (SMTP password)
5. Enable custom SMTP in Supabase with exact settings below
6. Test from `https://peerdisclosures.com/account`

---

## Step 1 — Create a Resend account (free tier)

1. Go to [resend.com](https://resend.com) → **Sign up** (GitHub or email).
2. Confirm your email if prompted.
3. Free tier includes **100 emails/day** and **3,000 emails/month** — sufficient for magic-link auth at early scale.

No API keys or domain setup yet.

---

## Step 2 — Add domain in Resend

1. Resend Dashboard → **Domains** → **Add Domain**.
2. Enter: `peerdisclosures.com` (apex domain, not `www`).
3. Resend shows a list of DNS records to add (typically **SPF** + **DKIM**; Resend may also suggest **DMARC** — optional but recommended for deliverability).

Leave this tab open — you will copy values into Cloudflare in Step 3.

### Pending: paste Resend DNS values here

Resend DKIM CNAME targets are **unique to your account**. After adding the domain in Resend, paste the pending records below (then follow [CLOUDFLARE_RESEND_DNS.md](./CLOUDFLARE_RESEND_DNS.md)):

| Resend Name | Type | Value (from Resend dashboard) |
|-------------|------|-------------------------------|
| `peerdisclosures.com` | TXT | *(paste SPF value)* |
| `resend._domainkey.peerdisclosures.com` | CNAME | *(paste target)* |
| `resend2._domainkey.peerdisclosures.com` | CNAME | *(paste target, if shown)* |

**Known Cloudflare baseline (2026-06-29):** apex SPF is already `v=spf1 include:_spf.mx.cloudflare.net ~all` — **edit** that record to merge Resend (e.g. add `include:amazonses.com`), do not add a second SPF TXT. MX records for Email Routing must stay unchanged.

---

## Step 3 — Map Resend DNS records in Cloudflare

**Detailed checklist:** [CLOUDFLARE_RESEND_DNS.md](./CLOUDFLARE_RESEND_DNS.md) — current DNS audit, merge-SPF instructions, and verification commands.

Open [Cloudflare DNS](https://dash.cloudflare.com) → **peerdisclosures.com** → **DNS** → **Records**.

### Do not touch inbound email (Email Routing)

Cloudflare **Email Routing** uses **MX** records on the apex domain. Those records must stay exactly as they are so `support@`, `billing@`, etc. keep forwarding to your inbox.

| Action | Record types |
|--------|----------------|
| **Keep unchanged** | All existing **MX** records |
| **Keep unchanged** | Email Routing–related records (if any) |
| **Add or update** | Resend **SPF**, **DKIM** (and optional **DMARC**) only |

Resend sends **outbound** mail via SPF/DKIM. It does **not** require MX records for sending. Adding Resend records does not replace Cloudflare’s MX.

### Cloudflare “Name” vs full hostname

Resend displays **full hostnames** (FQDNs). Cloudflare’s **Name** field is the **subdomain part only** — Cloudflare appends `.peerdisclosures.com` automatically.

| Resend shows (example) | Cloudflare **Type** | Cloudflare **Name** | Cloudflare **Content** |
|------------------------|---------------------|---------------------|------------------------|
| `peerdisclosures.com` (SPF TXT) | TXT | `@` | Paste Resend’s SPF value (starts with `v=spf1 ...`) |
| `resend._domainkey.peerdisclosures.com` | CNAME | `resend._domainkey` | Paste Resend’s DKIM target |
| `resend2._domainkey.peerdisclosures.com` | CNAME | `resend2._domainkey` | Paste Resend’s DKIM target |
| `_dmarc.peerdisclosures.com` | TXT | `_dmarc` | Optional DMARC policy (Resend may suggest) |

**Rules:**

- Apex/root → Name = `@`
- Anything before `.peerdisclosures.com` → Name = that prefix only (e.g. `resend._domainkey`, not the full FQDN)
- **Proxy status:** DNS records for email auth must be **DNS only** (grey cloud ☁️), not proxied
- **TTL:** Auto is fine

Use the **exact** names and values Resend shows for your domain — the table above is illustrative; Resend’s dashboard is the source of truth.

### SPF: merge, do not duplicate

If an **SPF TXT** record already exists on `@`:

- You must have **only one** SPF TXT record per hostname
- **Merge** includes: e.g. if Cloudflare or another tool added `v=spf1 include:_spf.mx.cloudflare.net ~all`, combine with Resend’s include in a **single** record (one `v=spf1` with multiple `include:` mechanisms)

**peerdisclosures.com today:** edit the existing `@` TXT to:

```txt
v=spf1 include:_spf.mx.cloudflare.net include:amazonses.com ~all
```

If Resend’s dashboard shows a different SPF string, merge its `include:` into that single record — never add a second SPF TXT on `@`.

If unsure, check existing TXT records on `@` before adding Resend’s SPF.

### After adding records

1. Save each record in Cloudflare.
2. Return to Resend → **Domains** → your domain → **Verify** / wait for automatic verification (often 5–30 minutes; up to 48 hours in edge cases).

---

## Step 4 — Create API key for SMTP

1. Resend Dashboard → **API Keys** → **Create API Key**.
2. Name: e.g. `supabase-smtp-filinggrid-dev`.
3. Permission: **Sending access** (full send is fine; restrict to `peerdisclosures.com` if Resend offers domain scoping).
4. Copy the key once (starts with `re_...`) — you will paste it into Supabase as the SMTP **password**.

**Security:** Store the key in a password manager. Do **not** commit it to git, `.env`, or this repo. If leaked, revoke in Resend and create a new key.

---

## Step 5 — Supabase custom SMTP settings (exact values)

1. Open [Supabase → Project Settings → Authentication → SMTP Settings](https://supabase.com/dashboard/project/cbqiqbcqzvfozewqzqnl/settings/auth).
2. Enable **Custom SMTP**.
3. Enter:

| Field | Value |
|-------|-------|
| **Host** | `smtp.resend.com` |
| **Port** | `465` |
| **Username** | `resend` |
| **Password** | Your Resend API key (`re_...`) |
| **Sender email** | `noreply@peerdisclosures.com` |
| **Sender name** | `Peer Disclosures` |

4. **Save**.

Notes:

- Port **465** uses implicit TLS (standard for Resend SMTP).
- If 465 fails in your region/network, try port **587** with STARTTLS (Supabase supports both; prefer 465 first per Resend docs).
- The sender address must use a domain verified in Resend (`peerdisclosures.com`).

### Related Supabase settings (production)

Confirm these match production URLs — see [SUPABASE_PROD_URLS.md](./SUPABASE_PROD_URLS.md):

| Setting | Value |
|---------|-------|
| Site URL | `https://peerdisclosures.com` |
| Redirect URLs | `https://peerdisclosures.com/auth/callback` |

---

## Step 6 — Test magic link from `/account`

1. Open [https://peerdisclosures.com/account](https://peerdisclosures.com/account).
2. Enter an email you can read (Gmail, iCloud, etc.) → **Send magic link**.
3. Check inbox (and spam/junk for the first send).

**Expected:**

| Check | Expected |
|-------|----------|
| **From** | `Peer Disclosures <noreply@peerdisclosures.com>` |
| **Subject** | `Sign in to Peer Disclosures` |
| **Body** | Branded HTML (from [magic-link template](../supabase/templates/magic-link.html)) |
| **Link** | Opens `https://peerdisclosures.com/auth/callback` and completes sign-in |

For local dev, test at `http://localhost:3000/account` — same SMTP applies if configured on the same Supabase project.

---

## Troubleshooting

### Domain verification still “Pending” in Resend

- Wait 15–30 minutes after DNS changes; Cloudflare is usually fast.
- In Cloudflare, confirm **Name** is the short form (`resend._domainkey`, not `resend._domainkey.peerdisclosures.com`).
- Confirm CNAME/TXT records are **DNS only** (not orange-cloud proxied).
- Use [dns.google](https://dns.google/) or `nslookup -type=TXT peerdisclosures.com` to confirm TXT propagation.
- Only **one** SPF TXT on `@` — duplicate SPF records cause verification failures.

### Magic link not received

- Supabase Dashboard → **Authentication → Logs** — look for send errors.
- Resend Dashboard → **Logs** — confirm send attempt and bounce/error reason.
- Wrong API key → 535 auth errors in Supabase logs; regenerate key and update SMTP password.
- Rate limits: Supabase auth email limits + Resend free tier (100/day).

### Email lands in spam

- Ensure Resend domain status is **Verified** (DKIM + SPF green).
- Add **DMARC** if not already (`_dmarc` TXT) — start with `p=none` for monitoring.
- First sends to Gmail often hit Promotions/Spam until domain reputation builds.
- Avoid changing From address frequently; keep `noreply@peerdisclosures.com` consistent.

### Supabase dashboard “Gmail may block emails” warning

- That warning appears when using Supabase’s **default** SMTP (`@mail.app.supabase.io`).
- After **Custom SMTP** is saved with a verified domain, the warning should **clear** or no longer apply to your sends.
- If it persists, refresh the page; confirm **Sender email** is `@peerdisclosures.com`, not a Supabase address.

### Inbound email broken after DNS changes

- You should **not** have edited MX records. If forwarding stopped, restore Cloudflare Email Routing MX records from [DNS_PEERDISCLOSURES.md](./DNS_PEERDISCLOSURES.md#email--keep-as-is).
- Resend outbound DNS (SPF/DKIM) does not require MX changes.

### From still shows “Supabase”

- Custom SMTP not enabled or not saved.
- Template-only change does not update **From** — both template ([§ 1](./SUPABASE_EMAIL_BRANDING.md#1-magic-link-template-subject--body)) and SMTP (this doc) are required.

---

## Related docs

- [SUPABASE_EMAIL_BRANDING.md](./SUPABASE_EMAIL_BRANDING.md) — Magic Link template + overview
- [SETUP_RUNBOOK.md § 2d–2e](./SETUP_RUNBOOK.md) — Local/prod Supabase auth setup
- [DNS_PEERDISCLOSURES.md](./DNS_PEERDISCLOSURES.md) — Cloudflare DNS (do not break MX)
- [CLOUDFLARE_RESEND_DNS.md](./CLOUDFLARE_RESEND_DNS.md) — Resend SPF/DKIM in Cloudflare (step-by-step)
- [SUPABASE_PROD_URLS.md](./SUPABASE_PROD_URLS.md) — Production Site URL and redirects
