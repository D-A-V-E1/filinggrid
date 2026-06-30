# Supabase production URL configuration
# Dashboard: https://supabase.com/dashboard/project/cbqiqbcqzvfozewqzqnl/auth/url-configuration

## Required settings

| Field | Value |
|---|---|
| **Site URL** | `https://peerdisclosures.com` |
| **Redirect URLs** | `https://peerdisclosures.com/auth/callback` |
| | `https://peerdisclosures.com/**` (optional wildcard) |

## Steps

1. Open **Authentication** → **URL Configuration**.
2. Set **Site URL** to `https://peerdisclosures.com`.
3. Under **Redirect URLs**, add:
   - `https://peerdisclosures.com/auth/callback`
   - `https://peerdisclosures.com/**` (optional — allows deep links after magic link)
4. Remove or keep `http://localhost:3000` entries for local dev (both can coexist).
5. Save.

## Magic-link email branding

Sign-in emails are configured in Supabase (not in app code). Apply both steps so users see **Peer Disclosures**, not Supabase:

1. **Email template** — Authentication → Email Templates → Magic Link → use [`supabase/templates/magic-link.html`](../supabase/templates/magic-link.html)
2. **Custom SMTP** — Project Settings → Authentication → SMTP → sender name `Peer Disclosures`, email `noreply@peerdisclosures.com`

Full checklist: [SUPABASE_EMAIL_BRANDING.md](./SUPABASE_EMAIL_BRANDING.md)

## Verify

1. Open `https://peerdisclosures.com/account`
2. Request magic link with your email
3. Link should redirect to `https://peerdisclosures.com/auth/callback` (not localhost)
