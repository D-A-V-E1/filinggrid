# Supabase magic-link email branding

Magic-link sign-in emails are sent by **Supabase Auth**, not from app code. To show **Peer Disclosures** as the sender (not Supabase) and use on-brand copy, configure both the **email template** and **custom SMTP** in the Supabase dashboard.

**Project:** [cbqiqbcqzvfozewqzqnl](https://supabase.com/dashboard/project/cbqiqbcqzvfozewqzqnl/auth/templates)

---

## 1. Magic Link template (subject + body)

1. Open **Authentication → Email Templates → Magic Link**.
2. Set **Subject** to:

   ```
   Sign in to Peer Disclosures
   ```

3. Paste the **Message body** from [`supabase/templates/magic-link.html`](../supabase/templates/magic-link.html) (source of truth in this repo).
4. **Save**.

The template uses Supabase variables (`{{ .ConfirmationURL }}`, etc.). Do not remove `{{ .ConfirmationURL }}` — it is required for the link to work.

### Verify

1. Go to `https://peerdisclosures.com/account`
2. Request a magic link
3. Confirm:
   - **Subject** is “Sign in to Peer Disclosures”
   - **Body** references Peer Disclosures (not Supabase)
   - Link redirects to `https://peerdisclosures.com/auth/callback`

---

## 2. Custom SMTP (sender name + From address)

The template alone does **not** change the **From** header. Without custom SMTP, inbox clients often show **Supabase** or a generic `noreply@mail.app.supabase.io` sender.

**Primary path (recommended):** [RESEND_SETUP.md](./RESEND_SETUP.md) — step-by-step for Resend + Cloudflare DNS + Supabase project `cbqiqbcqzvfozewqzqnl`, sender `Peer Disclosures <noreply@peerdisclosures.com>`.

Summary:

1. Open **Project Settings → Authentication → SMTP Settings**.
2. Enable **Custom SMTP**.
3. Use [Resend](./RESEND_SETUP.md) (or another provider: SendGrid, Postmark, Amazon SES).
4. Set:
   - **Sender email:** `noreply@peerdisclosures.com`
   - **Sender name:** `Peer Disclosures`
5. Add DNS records (SPF, DKIM) per provider — **keep Cloudflare Email Routing MX unchanged** ([DNS_PEERDISCLOSURES.md](./DNS_PEERDISCLOSURES.md)).
6. Save and send a test magic link from `/account`.

### Expected result

| Field | Before (default) | After (branded) |
|-------|------------------|-----------------|
| From name | Supabase / generic | **Peer Disclosures** |
| From address | `@mail.app.supabase.io` | `noreply@peerdisclosures.com` |
| Subject | Default Supabase copy | Sign in to Peer Disclosures |
| Body | Default Supabase copy | Branded HTML from repo |

---

## 3. Related dashboard settings

| Setting | Location | Recommended |
|---------|----------|-------------|
| Site URL | Authentication → URL Configuration | `https://peerdisclosures.com` |
| Redirect URLs | Same | `https://peerdisclosures.com/auth/callback` |
| Link expiry | Authentication → Settings | 3600s (1 hour) is fine for magic links |

See [SUPABASE_PROD_URLS.md](./SUPABASE_PROD_URLS.md) for URL configuration.

---

## 4. Local dev

For localhost testing, the same template applies. Magic links should redirect to `http://localhost:3000/auth/callback` when Site URL is set for dev (see [SETUP_RUNBOOK.md § 2](./SETUP_RUNBOOK.md)).

Custom SMTP is optional for local dev; production should use custom SMTP for deliverability and branding.

---

## Related

- [RESEND_SETUP.md](./RESEND_SETUP.md) — **primary** custom SMTP guide (Resend + Cloudflare + Supabase)
- [SETUP_RUNBOOK.md § 2d–2e](./SETUP_RUNBOOK.md) — auth setup overview
- [PRODUCTION_DEPLOY.md § Custom SMTP](./PRODUCTION_DEPLOY.md) — production checklist
