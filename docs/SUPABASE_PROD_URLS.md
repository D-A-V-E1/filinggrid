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

## Optional — custom SMTP

For magic links from `noreply@peerdisclosures.com`, configure **Project Settings** → **Authentication** → **SMTP**. See [SETUP_RUNBOOK.md](../docs/SETUP_RUNBOOK.md).

## Verify

1. Open `https://peerdisclosures.com/account`
2. Request magic link with your email
3. Link should redirect to `https://peerdisclosures.com/auth/callback` (not localhost)
