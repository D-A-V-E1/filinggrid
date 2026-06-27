# Simple Professional testing guide — Peer Disclosures

Plain-language checklist for **non-technical testers** to verify that **Professional** subscription works on the live site: [https://peerdisclosures.com](https://peerdisclosures.com).

**Time:** about **20–30 minutes**  
**Cost:** you will be charged **$29** for one month unless you **cancel** at the end (Step 8). Use a card you are comfortable testing with.

**Developers / technical runbook:** [PRODUCTION_PRO_TESTING.md](./PRODUCTION_PRO_TESTING.md)

---

## What you need

| Item | Notes |
|---|---|
| **Email address** | Any inbox you can open (Gmail, iCloud, work email, etc.). No special “corporate” email required. |
| **Credit or debit card** | Real card for live checkout. You will be charged $29 unless you cancel. |
| **Web browser** | Chrome, Safari, Firefox, or Edge on a computer or tablet. |

---

## Steps (1–8)

### 1. Sign in with magic link

1. Open [https://peerdisclosures.com/account](https://peerdisclosures.com/account).
2. Enter your email address.
3. Click **Send magic link**.
4. Open the email from Peer Disclosures and click the sign-in link.
5. You should land back on the site, signed in. The site should say **Peer Disclosures** (not “FilingGrid”).

### 2. Upgrade to Professional → Stripe checkout

1. From your account page, click **Upgrade to Professional**  
   — or try adding a **4th company** on a compare page until the upgrade prompt appears.
2. Stripe’s payment page opens in a new tab or window.
3. Check the branding:
   - Product name: **Peer Disclosures Professional**
   - Price: **$29/month**
   - Merchant / business name: **Peer Disclosures**

### 3. Pay and return to the site

1. Enter your card details and complete payment on Stripe’s page.
2. After payment, you are sent back to Peer Disclosures.
3. You should see a success message or banner that Professional is active (it may take a few seconds).

### 4. Verify Professional on Account + 4-ticker compare

**Account page**

1. Go to [https://peerdisclosures.com/account](https://peerdisclosures.com/account).
2. Confirm your plan shows **Professional** (not Free).

**Compare page (4 companies)**

1. Open this link (or any compare with 4 tickers):  
   [https://peerdisclosures.com/compare/aapl-vs-msft-vs-nvda-vs-googl](https://peerdisclosures.com/compare/aapl-vs-msft-vs-nvda-vs-googl)
2. All **four** company columns should load — no paywall blocking the 4th column.
3. Look for a **Professional** badge or label in the page header.

### 5. Saved groups

1. Go to [https://peerdisclosures.com/peer-groups](https://peerdisclosures.com/peer-groups).
2. Create a new saved peer group (pick a few tickers and save).
3. Refresh the page — your saved group should still be there.

### 6. Full income statement *(optional)*

1. On a compare page, open the **Income Statement** (or similar financial table).
2. As a Professional user, you should see **full line items**, not a locked “upgrade to see more” panel.
3. Try picking an **older filing period** (not just the most recent year) — it should load without a historical-data paywall.

### 7. Manage billing / receipt *(optional)*

1. On [https://peerdisclosures.com/account](https://peerdisclosures.com/account), click **Manage billing**.
2. Stripe’s billing portal should open where you can view your subscription and receipts.
3. Check your email inbox for a Stripe receipt (if enabled).

### 8. Cancel subscription *(important for test-only)*

**Do this when you are finished testing** so you are not charged again next month.

1. On [https://peerdisclosures.com/account](https://peerdisclosures.com/account), click **Manage billing**.
2. In Stripe’s portal, choose **Cancel subscription** and confirm.
3. Wait about 30 seconds, then refresh your account page.
4. Your plan should show **Free** again.
5. Optional check: open the 4-ticker compare link again — adding or viewing a 4th column should show the upgrade paywall again.

---

## Quick checklist

Copy this table and tick boxes as you go:

| Step | What to check | Done? |
|---|---|---|
| 1 | Signed in via magic link; **Peer Disclosures** branding | ☐ |
| 2 | Upgrade opened Stripe; **Peer Disclosures Professional**, **$29/mo** | ☐ |
| 3 | Payment succeeded; returned to site with success / Pro active | ☐ |
| 4 | Account shows **Professional**; 4-ticker compare loads all columns | ☐ |
| 5 | Saved group created and still visible after refresh | ☐ |
| 6 *(optional)* | Full income statement / older period loads | ☐ |
| 7 *(optional)* | Manage billing opens; receipt received | ☐ |
| 8 | Subscription **cancelled**; account back to **Free** | ☐ |

---

## If something goes wrong

| What you see | What it probably means | What to try |
|---|---|---|
| Magic link email never arrives | Delay or spam filter | Wait 2–3 minutes; check spam/junk; request a new link |
| Magic link opens the wrong site (e.g. “localhost”) | Site configuration issue | Stop testing; tell the team — do not pay yet |
| Stripe page shows **FilingGrid** instead of **Peer Disclosures** | Old product name in billing setup | Note exactly what you see; tell the team before paying |
| Paid but account still says **Free** after 1 minute | Upgrade not applied yet | Wait 30–60 seconds and refresh; sign out and back in |
| Paid but still **Free** after 5 minutes | Payment may not have linked to your account | Do **not** pay again; send the team your email and time of payment |
| 4th company column still blocked after payment | Pro features not unlocked | Refresh the page; sign out and sign in again |
| **Manage billing** does nothing or errors | Billing portal not set up | Tell the team; you may need help cancelling in Stripe |
| Charged $29 and forgot to cancel | Normal for a live test | Use **Manage billing** to cancel immediately; one month’s charge may still apply |

For technical details (webhooks, API checks, env vars), see [PRODUCTION_PRO_TESTING.md](./PRODUCTION_PRO_TESTING.md).

---

## After testing

- If this was a **one-time test**, Step 8 (cancel) is required.
- Keep your Stripe receipt email if you need it for expense or reimbursement.
- Report PASS/FAIL and any “something went wrong” rows to whoever asked you to run this test.
