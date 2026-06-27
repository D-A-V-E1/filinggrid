# Launch & Traction Plan — Peer Disclosures

Actionable go-to-market plan for [peerdisclosures.com](https://peerdisclosures.com): a free SEC filing comparison workspace (3 columns, no login) with **Professional** at **$29/mo** for power users.

---

## Positioning (use everywhere)

**One-liner:** Side-by-side SEC footnotes, MD&A, and XBRL — without Excel copy-paste or ten EDGAR tabs.

**Proof points**

- Synchronized section navigation across 10-K, 10-Q, 20-F, 6-K
- Free tier: 3 tickers, current-year filings, no account required
- Filings cached on server for speed — **not sold**, not used for AI training (see Privacy Policy)
- Professional: 8 columns, full history, GAAP statements, saved peer groups

**Who it’s for (priority order)**

1. **Equity research / investment analysts** — comp footnotes, MD&A tone, risk-factor diffs during earnings season
2. **Corp dev / strategy** — quick peer disclosure scans before meetings or board prep
3. **Accounting advisory / Big 4 juniors** — disclosure benchmarking across clients (research use only; not audit evidence)
4. **Independent investors / FinTwit** — readable peer context without a Bloomberg seat
5. **Business school students** (secondary) — case prep, interview demos; lower willingness to pay

---

## Pre-launch checklist (1–2 weeks before)

### Product & trust

- [ ] Production live at `https://peerdisclosures.com` with `NEXT_PUBLIC_APP_URL` set
- [ ] Run through `docs/SEO_SETUP.md` verification (sitemap, OG, Search Console)
- [ ] Smoke-test: home search → compare → section nav → XBRL strip; Stripe checkout on staging then prod
- [ ] Privacy + Terms linked in footer; support email monitored (`support@peerdisclosures.com`)
- [ ] Prepare 3–5 **screenshot/GIF assets**: hero compare (e.g. AAPL vs MSFT), section sync, paywall value prop

### Content ready at launch

- [ ] **5 compare landing URLs** indexed and shareable (already in sitemap):
  - `/compare/aapl-vs-msft`
  - `/compare/nvda-vs-amd-vs-intc`
  - `/compare/jpm-vs-gs-vs-ms`
  - `/compare/goog-vs-meta`
  - `/compare/ko-vs-pep`
- [ ] **Launch post draft** (300–500 words): problem → demo link → free tier → privacy line
- [ ] **Short demo video** (60–90s, Loom or screen record): search tickers → jump to MD&A → show sync

### Accounts & listings

- [ ] Product Hunt maker profile + draft listing (tagline, gallery, first comment ready)
- [ ] Hacker News account in good standing (for Show HN)
- [ ] LinkedIn personal + company page (or founder profile as company voice)
- [ ] X/Twitter thread outline (5–7 tweets + compare link)
- [ ] List 10 target newsletters / Substacks (see Partnerships below)

---

## Launch week (days 1–7)

### Day 0 — Soft launch (internal + friends)

- Share with 5–10 analysts or finance contacts for **structured feedback** (one question: “Would you use this during earnings?”)
- Fix any P0 bugs; note top requested tickers for next compare landing pages

### Day 1 — Product Hunt (Tuesday–Thursday ideal)

**Listing**

- **Name:** Peer Disclosures
- **Tagline:** Compare SEC footnotes and MD&A side by side — no Excel
- **Description:** Lead with free/no-login; mention Professional for teams living in filings
- **First comment:** Founder story — built because EDGAR tab sprawl wastes hours every earnings season; link to AAPL vs MSFT compare

**Tactics**

- Ask network to upvote + **leave genuine comments** (not “great product!” spam)
- Reply to every comment within 2 hours
- Post PH link on LinkedIn and X once (don’t ask for upvotes on LinkedIn — PH rules)

### Day 1–2 — Hacker News Show HN

**Title format:** `Show HN: Peer Disclosures – side-by-side SEC 10-K footnotes and MD&A`

**Post body**

- 2 paragraphs: technical angle (EDGAR parse, section alignment, XBRL) + link
- Be in thread all day; HN rewards substantive replies
- **Do not** vote ring; one submission only

### Day 2–3 — LinkedIn

**Personal post (founder)**

- Hook: “I still see analysts copying footnotes into Excel. We shipped something better.”
- Embed GIF of section sync
- CTA: free compare link + “DM me if you want Professional for your team”

**Comment strategy**

- Post thoughtful comments on earnings posts from analysts; when relevant, mention tool (no drive-by spam)
- Share in finance Slack/Discord only where self-promo is allowed (ask mods first)

### Day 3–4 — Reddit (follow sub rules)

| Subreddit | Angle | Rule note |
|-----------|-------|-----------|
| r/SecurityAnalysis | “Tool for footnote/MD&A peer review” | Check self-promo megathread / weekend thread |
| r/investing | Focus on free research workflow | Many subs require karma / no pure promo |
| r/Accounting | Disclosure benchmarking for learning | Frame as research/education, not audit tool |

**Post template:** Problem → what it does → free tier → link to one compare page → disclaimer (research only, not investment advice)

### Day 4–5 — FinTwit / X

- Thread: “5 ways I compare peer disclosures faster” → each tweet one feature → final tweet with link
- Quote-tweet during a major earnings week with a **specific** insight from a live compare (e.g. risk factor length diff)
- Engage replies; don’t mass-DM

### Day 5–7 — Newsletter outreach (batch 10)

See Partnerships — send short pitch + free access / extended trial for their audience

---

## Weeks 2–4 — Growth loops

### SEO content loop

1. Add 2 new popular compare slugs per week to `POPULAR_COMPARISONS` (sector earnings calendar driven)
2. Request indexing in Search Console for each new URL
3. Internal link from home “Popular comparisons” when a slug graduates from test to featured
4. Target long-tail queries: `{TICKER} vs {TICKER} 10-K comparison`, `{sector} footnote comparison`

### Community loop

- Weekly LinkedIn post: one **specific** disclosure diff screenshot from a current compare (redacts nothing public)
- Monthly “compare of the month” email if you add a mailing list later

### Product loop (conversion)

- Free tier as wedge: 3 columns covers most casual users
- Trigger Professional when user hits: 4th column, historical period, full statements, saved peer group
- In-app paywall already explains value — A/B test copy around “earnings week” urgency in month 2

### Partnership loop

**Newsletter / Substack targets (examples — pick aligned authors)**

- Financier subscriptions (value investing, special sits)
- Earnings recap writers who link primary sources
- Accounting policy blogs (ASC adoption, revenue recognition)

**Pitch (email)**

> Subject: Free SEC compare tool for your readers — side-by-side footnotes  
>  
> I built Peer Disclosures — {one line value prop}. Free, no login: {compare link}.  
> Happy to give your audience a Professional trial code if useful for a mention or tools roundup.

Offer: unique Stripe promotion code or 30-day Pro for newsletter readers (track redemption).

### Discord / Slack

- Value investing servers, ER associate communities, MBA finance clubs
- Lead with demo GIF; offer to run a 15-min live walkthrough for the group

---

## Channel cheat sheet

| Channel | Best audience | Content type | Frequency post-launch |
|---------|---------------|--------------|------------------------|
| Product Hunt | Tech-forward analysts, indie hackers | Launch spike | Once |
| Hacker News | Engineers, quant-curious | Technical Show HN | Once per major release |
| LinkedIn | ER, corp dev, accounting | Screenshots, earnings hooks | 2×/week |
| Reddit | Retail + serious investors | Compare deep-dives | 1×/week max, rule-compliant |
| X / FinTwit | Independent investors | Threads, earnings reactions | 3–5×/week |
| SEO compare pages | Organic “ticker vs ticker” | Static landing + live tool | 2 new slugs/week |
| Newsletters | Engaged niche | Tools roundup, sponsor | 2–4 outreaches/week until 3 bites |

---

## Messaging by audience

| Audience | Lead message | Objection handling |
|----------|--------------|-------------------|
| Equity research | “Same section, every column — MD&A and footnotes aligned” | “Not a replacement for your model; faster first pass on disclosures” |
| Corp dev | “Peer scan in minutes before a strategy offsite” | “Public data only; research use” |
| Big 4 / advisory | “Benchmark disclosure wording across peers” | “Not audit evidence — point to original filing” |
| Retail / FinTwit | “Free, no login — see how NVDA footnotes differ from AMD” | Disclaimer visible in footer |
| Students | “Interview demo: compare AAPL vs MSFT footnotes live” | Free tier sufficient |

---

## Metrics & targets

Track weekly in a simple spreadsheet or analytics tool.

| Metric | Definition | Launch week target | Week 4 target |
|--------|------------|-------------------|---------------|
| **Unique visitors** | Site sessions | 500–2,000 (PH/HN spike) | 1,000+/week organic+social |
| **Compare sessions** | Hit `/compare/*` with ≥2 columns loaded | 200+ | 500+/week |
| **Signups** | Magic-link accounts created | 20+ | 50+/week |
| **Checkout starts** | Stripe session created | 5+ | 15+/week |
| **Paid conversions** | Active Professional subs | 2–5 | 10+ cumulative |
| **Organic search** | GSC impressions / clicks | Baseline | ↑20% wow on compare URLs |

**North star:** compare sessions per week (habit signal). **Revenue signal:** checkout conversion from paywall modal.

---

## Risks & guardrails

- **Subreddit bans:** read rules; use megathreads; never astroturf
- **HN skepticism:** respond with technical detail; admit limitations
- **Legal:** footer disclaimers always visible; don’t claim investment advice
- **SEC affiliation:** never imply SEC endorsement (already in footer)

---

## Top 5 actions for this week

1. **Set `NEXT_PUBLIC_APP_URL` on Vercel** and complete Google Search Console + sitemap submit (`docs/SEO_SETUP.md`).
2. **Record a 60s demo GIF** (AAPL vs MSFT, section jump) for PH, LinkedIn, and X.
3. **Schedule Product Hunt** for Tuesday–Thursday; prep gallery + first comment tonight.
4. **Draft Show HN post** and LinkedIn founder post; queue for launch morning (stagger PH and HN by a few hours).
5. **Email 10 finance newsletter authors** with the AAPL vs MSFT link and an offer of Pro trial codes for readers.

---

## After month 1

- Review GSC queries → add compare slugs for unexpected ticker pairs
- Double down on the channel with best compare-session-to-signup ratio
- Consider lightweight content: “How we parse EDGAR sections” (SEO + HN credibility)
- Explore integrations mention only if asked: export snippets, watchlists (product roadmap, not launch blocker)

---

## See also

- [LAUNCH_AUTOMATION.md](./LAUNCH_AUTOMATION.md) — each checklist item tagged auto / semi / manual, with scripts and Cursor vs founder tasks
- [COMPARE_SLUGS_SEO.md](./COMPARE_SLUGS_SEO.md) — weekly compare-slug workflow (`POPULAR_COMPARISONS` → sitemap → GSC)
- [SEO_SETUP.md](./SEO_SETUP.md) — Search Console, sitemap, and OG verification
- [POST_PROD_CHECKLIST.md](./POST_PROD_CHECKLIST.md) — post-launch ops and smoke tests
