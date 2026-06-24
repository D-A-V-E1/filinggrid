# DNS — peerdisclosures.com (Cloudflare)

Domain registrar: **GoDaddy** · DNS managed in **Cloudflare** · Email routing already active.

**Current state:** Apex may still point to GoDaddy Website Builder (“X Files” placeholder). Update these records to launch PeerDisclosures.

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
| **Render** | CNAME | `api` | `<service>.onrender.com` |
| **Railway** | CNAME | `api` | `<service>.up.railway.app` |

Enable HTTPS on the API host (automatic on Render/Railway).

### Email — do not change

Keep existing **Cloudflare Email Routing** MX records. Do **not** re-add Mailgun or Google Workspace MX unless you migrate email.

Forwarded addresses (already configured):

- `support@peerdisclosures.com` → your Gmail
- `billing@`, `security@`, `legal@`, `privacy@` → forward as needed

---

## Verification checklist

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
