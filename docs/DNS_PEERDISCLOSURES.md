# DNS — peerdisclosures.com (Cloudflare)

Domain registrar: **GoDaddy** · DNS managed in **Cloudflare** · Email routing already active.

**Current state (verified 2026-06-26):**

| Record | Status |
|---|---|
| `peerdisclosures.com` (apex) | ⏸ GoDaddy Website Builder placeholder — not Vercel yet |
| `api.peerdisclosures.com` | ⏸ **NXDOMAIN** — no CNAME to Render |
| Email (MX) | ✅ Cloudflare Email Routing — do not change |

**Next:** Connect Vercel → update apex/`www` records below → add `api` CNAME after Render custom domain is configured.

---

## Records to add or update

### Frontend → Vercel

After adding `peerdisclosures.com` in Vercel → Project → Settings → Domains, Vercel shows the exact values. Typical setup:

| Type | Name | Content | Proxy |
|---|---|---|---|
| A | `@` | `76.76.21.21` | DNS only (grey cloud) per Vercel docs |
| CNAME | `www` | `cname.vercel-dns.com` | DNS only |

> Use the values Vercel displays for your project — they may differ slightly.

### API → Render or Railway

After deploying the API, add a custom domain in your host dashboard, then:

| Host | Type | Name | Content |
|---|---|---|---|
| **Render** | CNAME | `api` | `peerdisclosures-api.onrender.com` |
| **Railway** | CNAME | `api` | `<service>.up.railway.app` |

Enable HTTPS on the API host (automatic on Render/Railway).

### Email — do not change

Keep existing **Cloudflare Email Routing** MX records. Do **not** re-add Mailgun or Google Workspace MX unless you migrate email.

Forwarded addresses (already configured):

- `support@peerdisclosures.com` → your Gmail
- `billing@`, `security@`, `legal@`, `privacy@` → forward as needed

---

## Verification checklist

**Interim (Render default hostname — works today):**

```powershell
curl.exe -s https://peerdisclosures-api.onrender.com/health
# Expect {"status":"ok",...}
```

**After DNS + Vercel (full launch):**

```powershell
# Apex should return Vercel (not GoDaddy builder)
curl.exe -sI https://peerdisclosures.com | findstr /i "server x-vercel"

# API health
curl.exe -s https://api.peerdisclosures.com/health

# Frontend proxy to API
curl.exe -s https://peerdisclosures.com/api/backend/health
```

---

## Propagation

DNS changes usually propagate within minutes on Cloudflare. Clear browser cache if you still see the old GoDaddy site.
