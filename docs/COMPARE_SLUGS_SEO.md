# Compare Slugs & SEO — Peer Disclosures

How popular compare URLs are defined, published to the sitemap, and indexed for organic search. Complements [SEO_SETUP.md](./SEO_SETUP.md) and the SEO loop in [LAUNCH_AND_TRACTION_PLAN.md](./LAUNCH_AND_TRACTION_PLAN.md).

**Related**

- [LAUNCH_AUTOMATION.md](./LAUNCH_AUTOMATION.md) — automation levels and weekly operator checklist
- [lib/seo.ts](../lib/seo.ts) — single source of truth for curated compare URLs

---

## How it works in the codebase

| Piece | Role |
|-------|------|
| `lib/seo.ts` → `POPULAR_COMPARISONS` | `{ slug, label }[]` — **only place** to add curated compare landing pages |
| `POPULAR_COMPARE_SLUGS` | Derived slug list for sitemap |
| `app/sitemap.ts` | Emits `/compare/{slug}` for each popular slug at build time |
| `app/compare/[peer_slug]/layout.tsx` | Per-slug title, description, OG image, JSON-LD |
| `lib/utils.ts` → `parsePeerSlug()` | Splits slug on `-vs-` → ticker symbols |
| `components/landing/PopularCompareLinks.tsx` | Shows **first 4** entries from `POPULAR_COMPARISONS` on the home page |

Any `/compare/{slug}` URL works if tickers resolve to filings; only `POPULAR_COMPARISONS` slugs are in `sitemap.xml` and prioritized for SEO.

---

## Slug naming convention

Format: **`ticker-vs-ticker`** or **`ticker-vs-ticker-vs-ticker`** (2–8 tickers).

| Rule | Example |
|------|---------|
| Lowercase tickers | `aapl-vs-msft` |
| Separated by `-vs-` | `nvda-vs-amd-vs-intc` |
| Use common symbols (not company names) | `goog-vs-meta` not `alphabet-vs-meta` |
| 2–4 tickers typical for landing pages | `jpm-vs-gs-vs-ms` |
| Label is human-readable for UI | `"Apple vs Microsoft"` |

Parsing (from `parsePeerSlug`):

```ts
"aapl-vs-msft".split("-vs-") → ["AAPL", "MSFT"]
```

**Validate before adding:** open `/compare/{slug}` locally or on preview and confirm all columns load filings.

### Example slugs (current)

| Slug | Label |
|------|-------|
| `aapl-vs-msft` | Apple vs Microsoft |
| `nvda-vs-amd-vs-intc` | NVDA vs AMD vs Intel |
| `jpm-vs-gs-vs-ms` | JPM vs Goldman vs Morgan Stanley |
| `goog-vs-meta` | Alphabet vs Meta |
| `ko-vs-pep` | Coca-Cola vs PepsiCo |
| `tsla-vs-f` | Tesla vs Ford |

---

## Step-by-step: add a new popular compare slug

### 1. Choose the pair (earnings-calendar driven)

Each week, pick **2 slugs** tied to reporting season:

- Same sector reporting the same week (e.g. banks, mega-cap tech, consumer staples).
- Tickers with liquid, comparable 10-K/10-Q disclosure (footnotes, MD&A).
- Long-tail intent: `{TICKER} vs {TICKER} 10-K`, `{sector} footnote comparison`.

Sources: earnings calendars (Nasdaq, Yahoo Finance, your broker), GSC queries, user requests from soft launch.

### 2. Add to `POPULAR_COMPARISONS`

**Option A — script (recommended)**

```bash
node scripts/add-popular-compare.mjs crm-vs-now "Salesforce vs ServiceNow"
```

**Option B — manual edit** in `lib/seo.ts`:

```ts
export const POPULAR_COMPARISONS = [
  // ...existing entries...
  { slug: "crm-vs-now", label: "Salesforce vs ServiceNow" },
] as const;
```

Avoid duplicate slugs. Keep labels concise for home page chips.

### 3. Verify locally (optional)

```bash
npm run dev
# Open http://localhost:3000/compare/crm-vs-now
```

### 4. Commit and deploy

Merge to `main` → Vercel production build regenerates `sitemap.xml`.

### 5. Confirm sitemap

```bash
curl -s https://peerdisclosures.com/sitemap.xml | grep crm-vs-now
```

Expect a `<loc>` for `https://peerdisclosures.com/compare/crm-vs-now`.

### 6. Request indexing (Google Search Console)

1. [Google Search Console](https://search.google.com/search-console) → property `https://peerdisclosures.com`
2. **URL Inspection** → paste full compare URL
3. **Request indexing** (after deploy shows live 200)

Repeat for each new slug. Optional: Bing Webmaster Tools (import from GSC).

### 7. Promote (optional)

- Move high-priority slugs **earlier** in `POPULAR_COMPARISONS` to surface on home (top 4).
- Link from LinkedIn/X posts during earnings week.
- Internal links from pricing or account CTAs only when strategically useful — avoid slug spam.

---

## Weekly workflow (2 slugs)

| Day | Action |
|-----|--------|
| **Monday** | Review earnings calendar for the week; pick 2 peer pairs |
| **Monday** | Run `add-popular-compare.mjs` twice (or one PR with two entries) |
| **After deploy** | Sitemap grep + GSC indexing requests |
| **Earnings week** | Social post linking to the live compare URL |

Track added slugs and index status in a simple sheet: slug, deploy date, GSC indexed Y/N, impressions (monthly).

---

## Home page vs sitemap

- **Sitemap:** all entries in `POPULAR_COMPARISONS`
- **Home “Popular comparisons”:** first **4** entries only (`PopularCompareLinks.tsx`)

To feature a new slug on home, move it into the top four positions in the array (order matters).

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Slug 404 or empty columns | Ticker typo; check `parsePeerSlug` output; verify SEC ticker |
| Not in sitemap | Slug missing from `POPULAR_COMPARISONS`; redeploy |
| GSC “URL not on Google” | Normal for new URLs; request indexing; wait 3–14 days |
| Duplicate content across slugs | Each URL has unique tickers/titles via `layout.tsx` metadata |
| `add-popular-compare.mjs` errors | Slug must match `/^[a-z0-9.-]+(-vs-[a-z0-9.-]+)+$/` |

---

## Script reference

`scripts/add-popular-compare.mjs` appends one entry to `POPULAR_COMPARISONS` in `lib/seo.ts`.

```bash
node scripts/add-popular-compare.mjs <slug> "<label>"

# Examples
node scripts/add-popular-compare.mjs dis-vs-cmcsa "Disney vs Comcast"
node scripts/add-popular-compare.mjs xom-vs-cvx "Exxon vs Chevron"
```

Dry-run (no file write):

```bash
node scripts/add-popular-compare.mjs dis-vs-cmcsa "Disney vs Comcast" --dry-run
```
