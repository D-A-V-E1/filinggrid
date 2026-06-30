# Popular peer group catalog

Curated industry peer sets for the landing page, sitemap, and SEO compare URLs.

## Source of truth

| File | Role |
|------|------|
| `data/popular-peer-groups.json` | Catalog: sections, groups, tickers, GICS/SIC notes, `lastRefreshed` |
| `lib/popular-comparisons.ts` | Types and exports consumed by UI, sitemap, `lib/seo.ts` |
| `scripts/refresh-popular-comparisons.mjs` | Validate slugs/tickers; optional `--stamp` for refresh dates |
| `scripts/add-popular-compare.mjs` | Append one group to a section |

## Group shape

Each group includes:

- `id` — stable key (e.g. `mega-cap-tech`)
- `label` — link text on the home page
- `slug` — `/compare/{slug}` URL (must equal lowercase tickers joined with `-vs-`)
- `tickers` — SEC symbols, ordered by relevance (mega-cap leaders first)
- `industryTag` — short tag for filtering
- `sicOrSector` — human-readable GICS/SIC reference for refresh notes
- `lastRefreshed` — ISO date of last review
- `featured` (optional) — highlights for compact surfaces

Sections group the landing UI: **Technology**, **Financials**, **Consumer**.

## Quarterly refresh (manual, Phase 1)

1. Review mega-cap leaders by sector (earnings calendar, 10-K SIC codes).
2. Edit tickers in `data/popular-peer-groups.json`; keep slug in sync with tickers.
3. Run validation:
   ```bash
   node scripts/refresh-popular-comparisons.mjs
   npm test -- lib/popular-comparisons.test.ts
   ```
4. Stamp refresh dates:
   ```bash
   node scripts/refresh-popular-comparisons.mjs --stamp
   ```
5. Commit, deploy, request indexing for new slugs in GSC.

No automated SEC scraping in Phase 1. A future script pass may fetch market cap from a free API to suggest ticker order within a group.

## Adding a group

```bash
node scripts/add-popular-compare.mjs technology crm-vs-now crm-vs-now "CRM vs ServiceNow" CRM NOW
```

Update `sicOrSector` in the JSON after adding.

## Consumers

- `components/landing/PopularCompareLinks.tsx` — industry sections on home
- `app/sitemap.ts` — all group slugs via `POPULAR_COMPARE_SLUGS`
- `lib/seo.ts` — re-exports for backward compatibility

See also [COMPARE_SLUGS_SEO.md](./COMPARE_SLUGS_SEO.md) for GSC workflow.
