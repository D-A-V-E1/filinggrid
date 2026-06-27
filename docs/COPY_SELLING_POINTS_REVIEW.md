# Copy & Selling Points Review

**Product:** Peer Disclosures (peerdisclosures.com)  
**Review date:** 2026-06-27  
**Scope:** Landing, pricing, paywall, account onboarding, privacy strip, layout metadata, SEO/OG, README intro.

---

## Executive summary

Core product value is communicated clearly: synchronized multi-column SEC disclosure comparison, XBRL alongside narrative, ADR + domestic filers, free 3-column tier without login, and Professional at $29/mo for depth. Privacy and research-only disclaimers are strong and consistent.

The largest gaps are **competitive positioning** (vs EDGAR tabs, Excel, paid terminals), **conversion friction reducers** (no credit card), **workflow affordances** (shareable compare URLs, period picker, structured footnote taxonomy), and **audience-specific hooks** for equity research, corp dev, and accounting advisory. Several strong phrases exist only in social/OG metadata (`opengraph-image.tsx`, `lib/seo.ts`) and never appear on the visible landing page.

---

## Currently communicated well

- **Synchronized section navigation** — Home feature grid and free-tier pricing bullet explain jumping to Business, Risk Factors, MD&A, footnotes with all columns aligned.
- **XBRL + narrative in one workspace** — Hero and feature card tie headline metrics to disclosure text; Pro tier clearly adds full GAAP statements.
- **Multi-form / ADR support** — 10-K, 10-Q, 20-F, 6-K and fiscal-quarter alignment are called out on the home page and in metadata keywords.
- **Free tier mechanics** — 3 columns, current-year filings, no login (home hero + pricing).
- **Professional tier packaging** — 8 columns, full archive, GAAP line items, saved peer groups, $29/mo across ProCallout, pricing, and paywall modal.
- **Speed / caching** — Feature card, footer, and PrivacyStrip explain EDGAR streaming with server cache; not re-downloading on repeat views.
- **Privacy posture** — “Not stored in account database,” no AI training, research-only disclaimer (PrivacyStrip, footer, privacy policy).
- **SEO foundation** — `layout.tsx` description, compare-page metadata, sitemap presets, JSON-LD offers, equity-research keywords in `lib/seo.ts`.
- **Low-friction entry** — Ticker search on hero, popular compare links, header “Try demo” CTA.
- **Pro onboarding** — AccountWelcome walks new subscribers through 8-column workspace, saved groups, and GAAP expansion.

---

## Missing or underemphasized selling points

| Gap | Severity | Notes |
|-----|----------|-------|
| **No competitive frame** (vs EDGAR multi-tab, Excel copy-paste, Bloomberg/CapIQ cost) | **High** | “No Excel copy-paste” appears only in `app/opengraph-image.tsx`, not on visible pages. No “faster than opening five EDGAR filings” message. |
| **No credit card on free tier** | **High** | “No login required” is stated; credit-card-free trial is a standard conversion lever and is absent from hero, pricing, and paywall. |
| **Shareable compare URLs** (`/compare/aapl-vs-msft-vs-nvda`) | **High** | README documents slug URLs; users cannot discover bookmark/share workflow from marketing copy. Valuable for teams and client deliverables. |
| **Structured footnote taxonomy** (30+ note categories in section nav) | **High** | Product maps filings into granular footnote sections; copy only says generic “footnotes.” Differentiator for accounting advisory and footnote benchmarking. |
| **Target audience callouts** (equity analysts, corp dev, accounting advisory, researchers) | **Medium** | ProCallout says “analysts who live in footnotes”; no corp dev, advisory, or independent-investor hooks. `lib/seo.ts` has “equity research” keyword only in metadata. |
| **Period picker / fiscal alignment** | **Medium** | Explained in AccountWelcome free onboarding only; not on landing or pricing as a workflow feature. |
| **Progressive load / XBRL fast path** | **Medium** | Columns and headline XBRL load as parsing completes; reduces perceived wait vs downloading full filings. Technical advantage not surfaced. |
| **Filing excerpts + link to EDGAR** | **Medium** | Compare columns offer parsed excerpts and “Open on EDGAR”; supports trust and verification story alongside research disclaimer. |
| **$29/mo value anchor** | **Medium** | Price is clear; value vs terminals ($20k+/yr) or manual analyst time is not implied. |
| **6-K interim ADR updates** | **Low** | Listed in form types but not explained as a use case (e.g. TSMC/Sony interim disclosures). |
| **Passwordless magic-link auth** | **Low** | Fine for Pro checkout; minor convenience angle for teams avoiding passwords. |
| **Cancel anytime** | **Low** | On pricing page footer only; could reinforce on ProCallout or paywall. |

---

## Top 5 missing selling points (priority)

1. **Competitive replacement narrative** — Position as the alternative to juggling EDGAR tabs and pasting into Excel; bring OG tagline onto the landing page.
2. **No credit card for free compare** — Pair with “no login” in hero and free pricing card.
3. **Shareable peer compare links** — URLs encode ticker sets; teams can bookmark and share without accounts (free tier).
4. **Granular footnote section mapping** — Revenue recognition, leases, stock comp, segments, etc. in one click across peers.
5. **Audience-specific outcomes** — One line each for equity research (peer MD&A), corp dev (competitive disclosure scan), accounting advisory (policy footnote compare).

---

## Recommended copy additions

### `app/page.tsx` — Hero subline (implemented partially)

- **Add:** “No credit card required.” next to “No login required.”
- **Add:** Short competitive hook, e.g. “Skip the EDGAR tab sprawl and Excel copy-paste.”

### `app/page.tsx` — Optional fifth feature card or sub-hero bullet row

- **Title:** Shareable compare links  
- **Body:** Every comparison gets a clean URL (`peerdisclosures.com/compare/...`) you can bookmark, drop in a memo, or share with colleagues — no account needed on the free tier.

### `app/page.tsx` — Optional audience strip (below features)

- **Heading:** Built for disclosure-heavy workflows  
- **Bullets:** Equity research · Corporate development · Accounting advisory · Independent investors

### `components/pricing/PricingPlans.tsx` — Free plan features

- **Add:** “No credit card required”
- **Add:** “Shareable compare URLs”

### `components/pricing/PricingPlans.tsx` — Professional description

- **Expand:** “…and structured footnote navigation across up to 8 peers.”

### `components/landing/ProCallout.tsx`

- **Add bullet:** “Shareable 8-column compare URLs”
- **Optional:** “Cancel anytime via Stripe” (mirrors pricing footer)

### `components/billing/PaywallModal.tsx`

- **Add** under feature list: “Cancel anytime — self-serve via Stripe”
- **Optional** trust line: “Start with 3 columns free — no credit card”

### `app/pricing/page.tsx` — Subhead

- **Add:** “Try three tickers free with no login and no credit card.”

### `lib/seo.ts` — `DEFAULT_DESCRIPTION`

- **Consider:** Append “No credit card for free tier.” and “Shareable compare URLs.” (keep under ~160 chars for SERP or trim elsewhere)

### `app/opengraph-image.tsx`

- Already strong; align visible hero copy with OG subline for message consistency.

### `components/PrivacyStrip.tsx` / compare toolbar

- **Consider:** Surface a shortened privacy trust line on the compare page (PrivacyStrip today only appears under `TickerSearchBar` on home, not in the compare workspace).

### `README.md`

- Developer-facing; optional one-line “Positioning” blurb if reused for GitHub visitors — not a launch priority.

---

## Audience → message matrix

| Audience | Pain | Message to add |
|----------|------|----------------|
| Equity analysts | Peer MD&A and risk factor benchmarking | “Line up peer MD&A and risk factors in one view — switch sections once, read all columns.” |
| Corp dev | Competitive intelligence from filings | “Scan how peers describe strategy, risk, and M&A in the same filing period.” |
| Accounting advisory | Policy and footnote consistency | “Jump to revenue, leases, or stock comp footnotes across clients’ peers instantly.” |
| Independent investors | Free access, no terminal | “Terminal-grade side-by-side disclosure review — free for three tickers, no signup.” |
| Researchers | Reproducible links, public data | “Bookmarkable compare URLs over public EDGAR data; cached for fast revisits.” |

---

## What not to overclaim

- **Synchronized scroll** — `broadcastScrollSync` exists in `lib/utils.ts` but is not wired; marketing should say **section navigation sync**, not scroll-lock across columns.
- **Accuracy** — Research-only disclaimer is appropriate; emphasize “verify on EDGAR” when citing excerpts.
- **6-K coverage** — Mention only if parser coverage is reliable for target ADR names.

---

## Implementation log

| Date | Change |
|------|--------|
| 2026-06-27 | Created this review. Minimal hero copy tweak in `app/page.tsx` (no credit card + EDGAR/Excel hook). |

---

## Next steps (optional)

1. A/B hero competitive line vs audience strip.
2. Add shareable-URL feature card after analytics show compare-page bounce.
3. Add compare-page privacy/trust strip for Pro conversion on long sessions.
4. Create `docs/LAUNCH_AND_TRACTION_PLAN.md` messaging section linking here when launch marketing work resumes.
