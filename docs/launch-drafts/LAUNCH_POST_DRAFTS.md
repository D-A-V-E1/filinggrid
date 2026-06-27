# Launch post drafts — Peer Disclosures

**Status:** Draft only — do not post until founder review.  
**Demo link:** https://peerdisclosures.com/compare/aapl-vs-msft  
**Pricing:** https://peerdisclosures.com/pricing

---

## Product Hunt listing

### Name

Peer Disclosures

### Tagline (60 chars max)

Compare SEC footnotes and MD&A side by side — no Excel

### Description

Peer Disclosures is a free SEC filing comparison workspace. Open three tickers — no account required — and read 10-K, 10-Q, 20-F, and 6-K disclosures in aligned columns. Jump to MD&A, risk factors, or footnotes once; every column follows.

**Why we built it:** Earnings season still means ten EDGAR tabs and copy-paste into spreadsheets. We wanted the same section, every column, with XBRL financials inline.

**Free tier:** 3 tickers, current-year filings, no login.

**Professional ($29/mo):** 8 columns, full filing history, complete GAAP statements, saved peer groups.

Filings are cached on our servers for speed — not sold and not used for AI training. Research use only; not investment advice.

**Try it:** https://peerdisclosures.com/compare/aapl-vs-msft

### Gallery assets (manual)

- [ ] Hero screenshot: AAPL vs MSFT compare with Financial Statements visible
- [ ] Section sync GIF: jump MD&A → all columns update
- [ ] Paywall value prop screenshot (4th column)
- [ ] Optional: NVDA vs AMD vs INTC segment disclosure inline

### First comment (maker)

I built Peer Disclosures after one too many earnings nights copying footnotes between EDGAR tabs.

The free tier is deliberately useful: three tickers, no signup, synchronized sections. Professional is for analysts who live in filings — eight columns, full history, saved peer groups.

Start here: https://peerdisclosures.com/compare/aapl-vs-msft

Happy to answer questions about how we parse EDGAR sections and align XBRL. Feedback on which compare pages to add next is especially welcome.

---

## Show HN

### Title

Show HN: Peer Disclosures – side-by-side SEC 10-K footnotes and MD&A

### Body

I built a web workspace for comparing SEC filings without Excel or a dozen EDGAR tabs. You pick tickers (e.g. AAPL vs MSFT), and each column loads the same filing period. Section navigation is synchronized — click MD&A or a footnote category once and every column jumps there. Financial statement line items come from XBRL where available; narrative sections fall back to parsed EDGAR HTML.

Free tier: 3 columns, current-year filings, no account. Professional adds 8 columns, full archive, GAAP statements, and saved peer groups ($29/mo). We cache public filings server-side for latency; we don't sell filing data or train models on it.

Live demo: https://peerdisclosures.com/compare/aapl-vs-msft

Stack: Next.js frontend, Python API, EDGAR + XBRL parsing with a disk cache. Would appreciate feedback on section alignment edge cases (foreign filers, amended 10-Ks) and which ticker pairs would be most useful as landing pages.

---

## LinkedIn founder post (~300 words)

I still see equity analysts copying footnote tables into Excel every earnings season.

Ten EDGAR tabs. Misaligned scroll positions. MD&A in one window, risk factors in another. It works — until you're comparing five peers under a deadline.

We shipped **Peer Disclosures** to fix the first pass on peer disclosures.

Open **Apple vs Microsoft** (or any three tickers) — no login required:  
https://peerdisclosures.com/compare/aapl-vs-msft

**What it does**

- Loads 10-K, 10-Q, 20-F, and 6-K side by side
- **Synchronized sections** — jump to MD&A, risk factors, or footnotes once; every column follows
- **XBRL financials** inline where the filer tags them
- Free for three tickers and current-year filings

**Professional** ($29/mo) adds eight columns, full filing history, complete GAAP statements, and saved peer groups — built for people who live in filings during earnings.

**[INSERT 60s GIF: section sync on AAPL vs MSFT — manual asset]**

This is a research tool, not investment advice. Public SEC data only; we cache filings for speed but don't sell them or use them for AI training.

If you run peer comps during earnings, I'd love your take: what tickers or sections should we prioritize next?

DM me if you want Professional for your team — happy to share a trial code for serious users.

#equityresearch #SEC #earnings #fintech

---

## X / Twitter — 3-tweet thread outline

### Tweet 1 (hook)

Earnings week hack: compare peer footnotes without 10 EDGAR tabs.

Peer Disclosures — free, no login, 3 tickers side by side with synchronized MD&A + footnotes.

https://peerdisclosures.com/compare/aapl-vs-msft

### Tweet 2 (feature)

Click **Risk Factors** once → every column jumps there.

XBRL financials inline. 10-K, 10-Q, 20-F, 6-K.

Built for the first pass before your model — not a Bloomberg replacement.

### Tweet 3 (CTA + Pro)

Free: 3 columns, current year.

Pro ($29/mo): 8 columns, full history, saved peer groups.

**[Optional GIF: section sync — manual]**

Try NVDA vs AMD vs Intel: https://peerdisclosures.com/compare/nvda-vs-amd-vs-intc

Feedback welcome — what compare page should we ship next?

---

## Newsletter pitch email template

**Subject:** Free SEC compare tool for your readers — side-by-side footnotes

**Body:**

Hi [Name],

I'm [Founder name], builder of **Peer Disclosures** — a free workspace for comparing SEC 10-K/10-Q filings side by side with synchronized MD&A and footnotes (no Excel, no login for the first three tickers).

**Live demo:** https://peerdisclosures.com/compare/aapl-vs-msft

I thought your [newsletter name / recent piece on X] audience might find it useful when [specific hook: earnings season / disclosure benchmarking / primary-source research].

**Free tier:** 3 tickers, current-year filings.  
**Professional:** 8 columns, full history, GAAP statements, saved peer groups ($29/mo).

Happy to give your readers a **30-day Professional trial** (or a unique Stripe promo code) if you'd like to mention it in a tools roundup or earnings-season post. No obligation — I mostly want feedback from people who actually read footnotes.

Would a one-line blurb or a short walkthrough be helpful?

Best,  
[Name]  
https://peerdisclosures.com  
support@peerdisclosures.com

---

## Manual assets still required

| Asset | Used on | Status |
|-------|---------|--------|
| 60s demo GIF (AAPL vs MSFT, section jump) | PH gallery, LinkedIn, X | **Manual — not recorded** |
| 3–5 screenshots | Product Hunt gallery | **Manual** |
| Schedule PH launch (Tue–Thu) | Product Hunt | **Manual** |
| Send 10 newsletter emails | Outreach | **Manual — drafts only** |
