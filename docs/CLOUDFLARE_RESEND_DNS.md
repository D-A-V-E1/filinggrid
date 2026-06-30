# Cloudflare DNS — Resend for peerdisclosures.com

**Goal:** Add Resend outbound email auth (SPF + DKIM) without touching Cloudflare Email Routing **MX** records.

**Dashboards:**

- [Cloudflare DNS → peerdisclosures.com](https://dash.cloudflare.com/?to=/:account/peerdisclosures.com/dns/records)
- [Resend → Domains → peerdisclosures.com](https://resend.com/domains)

---

## Current DNS (verified 2026-06-29)

| Type | Name | Content | Action |
|------|------|---------|--------|
| MX | `@` | `route1.mx.cloudflare.net` (pref 6), `route2.mx.cloudflare.net` (21), `route3.mx.cloudflare.net` (65) | **Do not change** |
| TXT | `@` | `v=spf1 include:_spf.mx.cloudflare.net ~all` | **Edit** — merge Resend (see below) |
| TXT | `_dmarc` | `v=DMARC1; p=quarantine; adkim=r; aspf=r; rua=mailto:dmarc_rua@onsecureserver.net;` | Leave as-is |
| CNAME | `resend._domainkey` | — | **Add** (value from Resend) |
| CNAME | `resend2._domainkey` | — | **Add** (value from Resend, if shown) |

Resend DKIM CNAME targets are **unique per Resend account** — copy them from your Resend domain page.

---

## Step 1 — Copy values from Resend

1. Log in to [resend.com/domains](https://resend.com/domains).
2. Open **peerdisclosures.com** (add the domain first if missing).
3. Copy each pending record’s **Type**, **Name** (full hostname), and **Value**.

Paste into the table below (for your records):

| Resend shows (Name) | Type | Cloudflare **Name** | Cloudflare **Content** (paste from Resend) |
|---------------------|------|---------------------|---------------------------------------------|
| `peerdisclosures.com` | TXT | `@` | *(paste Resend SPF value)* |
| `resend._domainkey.peerdisclosures.com` | CNAME | `resend._domainkey` | *(paste Resend DKIM target)* |
| `resend2._domainkey.peerdisclosures.com` | CNAME | `resend2._domainkey` | *(paste if Resend lists it)* |
| `_dmarc.peerdisclosures.com` | TXT | `_dmarc` | *(optional — already have DMARC)* |

---

## Step 2 — Add records in Cloudflare

[Cloudflare DNS → peerdisclosures.com → Records](https://dash.cloudflare.com/?to=/:account/peerdisclosures.com/dns/records)

For **every** new/edited record:

- **Proxy status:** DNS only (grey cloud ☁️)
- **TTL:** Auto

### SPF — merge, do not duplicate

You already have one SPF TXT on `@`. **Edit** that record (do not add a second SPF TXT).

**Current:**

```
v=spf1 include:_spf.mx.cloudflare.net ~all
```

**After merge** (keeps Cloudflare Email Routing + authorizes Resend/SES):

```
v=spf1 include:_spf.mx.cloudflare.net include:amazonses.com ~all
```

If Resend’s dashboard shows a different SPF `include:` (e.g. a custom subdomain), use Resend’s value **and** keep `include:_spf.mx.cloudflare.net` in the same single record.

Rules:

- Exactly **one** `v=spf1` TXT on `@`
- One `~all` or `-all` at the end
- Multiple `include:` mechanisms in one string

### DKIM — add CNAME(s)

| Type | Name | Content | Proxy |
|------|------|---------|-------|
| CNAME | `resend._domainkey` | *(from Resend)* | DNS only |
| CNAME | `resend2._domainkey` | *(from Resend, if listed)* | DNS only |

Cloudflare **Name** = subdomain part only (not `resend._domainkey.peerdisclosures.com`).

### DMARC — optional

`_dmarc` TXT already exists. Resend verification does not require changing it. Optional Resend-suggested monitoring record:

```
v=DMARC1; p=none; rua=mailto:dmarc@peerdisclosures.com
```

Only replace existing DMARC if you intentionally want a new policy.

---

## Step 3 — Verify

**DNS propagation** (PowerShell):

```powershell
nslookup -type=TXT peerdisclosures.com
nslookup -type=CNAME resend._domainkey.peerdisclosures.com
nslookup -type=MX peerdisclosures.com   # should still show route*.mx.cloudflare.net
```

**Resend:** Domains → peerdisclosures.com → **Verify** (or wait for auto-check, usually 5–30 minutes).

**Expected:** Domain status **Verified**; SPF and DKIM green.

---

## Checklist

- [ ] Resend domain `peerdisclosures.com` added
- [ ] SPF on `@` merged (not duplicated)
- [ ] `resend._domainkey` CNAME added (DNS only)
- [ ] `resend2._domainkey` CNAME added if Resend requires it
- [ ] MX records unchanged
- [ ] Resend shows **Verified**

Next: [RESEND_SETUP.md § Step 4–6](./RESEND_SETUP.md) — API key + Supabase SMTP + test magic link.
