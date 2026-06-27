# Google Search Console — weekly log

Weekly sitemap health check + URL Inspection indexing requests for **peerdisclosures.com**.

---

## 2026-06-27 — Weekly sitemap + indexing pass

**Date:** 2026-06-27  
**Environment:** Production (`https://peerdisclosures.com`)  
**Method:** PowerShell `Invoke-WebRequest` (HEAD) + cursor-ide-browser MCP (GSC)  
**Operator:** Cursor agent (automated HTTP; GSC blocked at Google OAuth)

### Sitemap fetch

| Check | Result | Notes |
|-------|--------|-------|
| `GET https://peerdisclosures.com/sitemap.xml` | **200** | 13 URLs; `lastmod` 2026-06-27T13:32:53.805Z |

Sitemap URLs (from live XML):

1. `https://peerdisclosures.com`
2. `https://peerdisclosures.com/pricing`
3. `https://peerdisclosures.com/privacy`
4. `https://peerdisclosures.com/terms`
5. `https://peerdisclosures.com/compare/aapl-vs-msft`
6. `https://peerdisclosures.com/compare/aapl-vs-msft-vs-nvda`
7. `https://peerdisclosures.com/compare/nvda-vs-amd-vs-intc`
8. `https://peerdisclosures.com/compare/jpm-vs-gs-vs-ms`
9. `https://peerdisclosures.com/compare/aapl-vs-nvda-vs-tsm`
10. `https://peerdisclosures.com/compare/goog-vs-meta`
11. `https://peerdisclosures.com/compare/amzn-vs-shop`
12. `https://peerdisclosures.com/compare/tsla-vs-f`
13. `https://peerdisclosures.com/compare/ko-vs-pep`

### HTTP status (all sitemap URLs)

| URL | HTTP status | Index requested |
|-----|-------------|-----------------|
| `https://peerdisclosures.com/` | 200 | **needs login** |
| `https://peerdisclosures.com/pricing` | 200 | **needs login** |
| `https://peerdisclosures.com/privacy` | 200 | skip (static legal) |
| `https://peerdisclosures.com/terms` | 200 | skip (static legal) |
| `https://peerdisclosures.com/compare/aapl-vs-msft` | 200 | **needs login** |
| `https://peerdisclosures.com/compare/aapl-vs-msft-vs-nvda` | 200 | **needs login** |
| `https://peerdisclosures.com/compare/nvda-vs-amd-vs-intc` | 200 | **needs login** |
| `https://peerdisclosures.com/compare/jpm-vs-gs-vs-ms` | 200 | **needs login** |
| `https://peerdisclosures.com/compare/aapl-vs-nvda-vs-tsm` | 200 | **needs login** |
| `https://peerdisclosures.com/compare/goog-vs-meta` | 200 | **needs login** |
| `https://peerdisclosures.com/compare/amzn-vs-shop` | 200 | **needs login** |
| `https://peerdisclosures.com/compare/tsla-vs-f` | 200 | **needs login** |
| `https://peerdisclosures.com/compare/ko-vs-pep` | 200 | **needs login** |

**HTTP summary:** 13/13 → **200** · 0 failures

### Google Search Console — URL Inspection

**Result:** **BLOCKED** — browser redirected to Google sign-in (`accounts.google.com`). OAuth cannot be completed by the agent.

**GSC entry point used:**  
`https://search.google.com/search-console/inspect?resource_id=sc-domain%3Apeerdisclosures.com`

#### Manual indexing steps (owner action)

1. Sign in at [Google Search Console](https://search.google.com/search-console) with the verified property owner account.
2. Confirm property: **peerdisclosures.com** (domain or URL prefix).
3. Open **URL Inspection** (left nav or direct link above).
4. For each URL below: paste → Enter → wait for inspection → click **Request indexing** (if offered).
5. Optional: **Pages** → scan for crawl/index errors on `/compare/*` and `/pricing`.

#### Priority URLs to request indexing (minimum)

| # | URL |
|---|-----|
| 1 | `https://peerdisclosures.com/` |
| 2 | `https://peerdisclosures.com/pricing` |
| 3 | `https://peerdisclosures.com/compare/aapl-vs-msft` |
| 4 | `https://peerdisclosures.com/compare/nvda-vs-amd-vs-intc` |
| 5 | `https://peerdisclosures.com/compare/jpm-vs-gs-vs-ms` |
| 6 | `https://peerdisclosures.com/compare/goog-vs-meta` |
| 7 | `https://peerdisclosures.com/compare/ko-vs-pep` |

#### Additional compare URLs (same workflow)

| # | URL |
|---|-----|
| 8 | `https://peerdisclosures.com/compare/aapl-vs-msft-vs-nvda` |
| 9 | `https://peerdisclosures.com/compare/aapl-vs-nvda-vs-tsm` |
| 10 | `https://peerdisclosures.com/compare/amzn-vs-shop` |
| 11 | `https://peerdisclosures.com/compare/tsla-vs-f` |

After completing manual requests, update the **Index requested** column above from `needs login` → `Y` (or note GSC status: “URL is on Google”, “Discovered – currently not indexed”, etc.).

### Pages report (crawl/index issues)

Not inspected — requires GSC login. After sign-in, check **Indexing → Pages** for:

- Compare URLs excluded or “Crawled – currently not indexed”
- Soft 404s or redirect errors on `/compare/*`
- Unexpected `/account` URLs in index (should be `noindex` + disallowed in `robots.txt`)

### Weekly checklist reference

- Sitemap: [SEO_SETUP.md](./SEO_SETUP.md) § Post-deploy verification
- Compare slug workflow: [COMPARE_SLUGS_SEO.md](./COMPARE_SLUGS_SEO.md) § Request indexing
- Launch automation notes: [LAUNCH_AUTOMATION.md](./LAUNCH_AUTOMATION.md)

---

## 2026-06-27 follow-up pass

**Date:** 2026-06-27 (second pass)  
**Environment:** Production (`https://peerdisclosures.com`)  
**Method:** PowerShell `Invoke-WebRequest` (HEAD) + web search `site:peerdisclosures.com` + cursor-ide-browser MCP (GSC)  
**Operator:** Cursor agent

### Sitemap fetch

| Check | Result | Notes |
|-------|--------|-------|
| `GET https://peerdisclosures.com/sitemap.xml` | **200** | 13 URLs; `lastmod` 2026-06-27T13:44:32.862Z; all `<loc>` use `https://peerdisclosures.com` (production canonical) |

### HTTP status (all sitemap URLs)

| URL | HTTP status | Index requested |
|-----|-------------|-----------------|
| `https://peerdisclosures.com/` | 200 | **needs login** |
| `https://peerdisclosures.com/pricing` | 200 | **needs login** |
| `https://peerdisclosures.com/privacy` | 200 | skip (static legal) |
| `https://peerdisclosures.com/terms` | 200 | skip (static legal) |
| `https://peerdisclosures.com/compare/aapl-vs-msft` | 200 | **needs login** |
| `https://peerdisclosures.com/compare/aapl-vs-msft-vs-nvda` | 200 | **needs login** |
| `https://peerdisclosures.com/compare/nvda-vs-amd-vs-intc` | 200 | **needs login** |
| `https://peerdisclosures.com/compare/jpm-vs-gs-vs-ms` | 200 | **needs login** |
| `https://peerdisclosures.com/compare/aapl-vs-nvda-vs-tsm` | 200 | **needs login** |
| `https://peerdisclosures.com/compare/goog-vs-meta` | 200 | **needs login** |
| `https://peerdisclosures.com/compare/amzn-vs-shop` | 200 | **needs login** |
| `https://peerdisclosures.com/compare/tsla-vs-f` | 200 | **needs login** |
| `https://peerdisclosures.com/compare/ko-vs-pep` | 200 | **needs login** |

**HTTP summary:** 13/13 → **200** · 0 failures (unchanged from morning pass)

### Google index visibility (`site:` query)

| Check | Result |
|-------|--------|
| `site:peerdisclosures.com` (web search, 2026-06-27) | **No results found** — zero indexed pages visible in search; expected for new domain until GSC indexing requests complete |

### Google Search Console — URL Inspection

**Result:** **BLOCKED** — browser redirected to Google sign-in (`accounts.google.com/v3/signin/identifier`). OAuth cannot be completed by the agent.

**GSC entry point:**  
`https://search.google.com/search-console/inspect?resource_id=sc-domain%3Apeerdisclosures.com`

#### Copy-paste checklist (owner action)

1. Sign in at [Google Search Console](https://search.google.com/search-console) with the verified property owner account.
2. Open URL Inspection (direct link above) for property **peerdisclosures.com**.
3. For each URL: paste → Enter → **Request indexing** (if offered).
4. After completion, update the **Index requested** column in this section to `Y` and note GSC status text.

| # | URL |
|---|-----|
| 1 | `https://peerdisclosures.com/` |
| 2 | `https://peerdisclosures.com/pricing` |
| 3 | `https://peerdisclosures.com/compare/aapl-vs-msft` |
| 4 | `https://peerdisclosures.com/compare/nvda-vs-amd-vs-intc` |
| 5 | `https://peerdisclosures.com/compare/jpm-vs-gs-vs-ms` |
| 6 | `https://peerdisclosures.com/compare/goog-vs-meta` |
| 7 | `https://peerdisclosures.com/compare/ko-vs-pep` |
| 8 | `https://peerdisclosures.com/compare/aapl-vs-msft-vs-nvda` |
| 9 | `https://peerdisclosures.com/compare/aapl-vs-nvda-vs-tsm` |
| 10 | `https://peerdisclosures.com/compare/amzn-vs-shop` |
| 11 | `https://peerdisclosures.com/compare/tsla-vs-f` |

5. Optional: **Indexing → Pages** — scan for compare URLs “Discovered – currently not indexed” or crawl errors.

### Optional compare slugs (earnings calendar)

**Skipped** — week of 2026-06-30 has no new mega-cap pair clearly missing from `POPULAR_COMPARISONS` (Mag-7 reports cluster in late July; AMD/F/KO/PEP already covered). Revisit after July earnings calendar updates.

### `NEXT_PUBLIC_APP_URL` verification (code + live)

| Check | Result |
|-------|--------|
| `lib/seo.ts` → `getSiteUrl()` | Uses `process.env.NEXT_PUBLIC_APP_URL` with localhost fallback |
| Docs / examples | `https://peerdisclosures.com` in `.env.production.example`, `scripts/vercel-production-env.example`, `docs/SEO_SETUP.md` |
| Live sitemap `<loc>` | All URLs use `https://peerdisclosures.com` (confirms production env set on Vercel) |

---

## 2026-06-27 indexing request pass

**Date:** 2026-06-27 (third pass — recommended indexing steps)  
**Environment:** Production (`https://peerdisclosures.com`)  
**Method:** PowerShell `Invoke-WebRequest` (HEAD) + cursor-ide-browser MCP (GSC URL Inspection)  
**Operator:** Cursor agent

### Sitemap fetch

| Check | Result | Notes |
|-------|--------|-------|
| `GET https://peerdisclosures.com/sitemap.xml` | **200** | 13 URLs; `lastmod` 2026-06-27T14:01:14.674Z |

### HTTP status (all sitemap URLs)

| URL | HTTP status | Index requested |
|-----|-------------|-----------------|
| `https://peerdisclosures.com/` | 200 | **blocked (login)** |
| `https://peerdisclosures.com/pricing` | 200 | **blocked (login)** |
| `https://peerdisclosures.com/privacy` | 200 | skip (static legal) |
| `https://peerdisclosures.com/terms` | 200 | skip (static legal) |
| `https://peerdisclosures.com/compare/aapl-vs-msft` | 200 | **blocked (login)** |
| `https://peerdisclosures.com/compare/aapl-vs-msft-vs-nvda` | 200 | **blocked (login)** |
| `https://peerdisclosures.com/compare/nvda-vs-amd-vs-intc` | 200 | **blocked (login)** |
| `https://peerdisclosures.com/compare/jpm-vs-gs-vs-ms` | 200 | **blocked (login)** |
| `https://peerdisclosures.com/compare/aapl-vs-nvda-vs-tsm` | 200 | **blocked (login)** |
| `https://peerdisclosures.com/compare/goog-vs-meta` | 200 | **blocked (login)** |
| `https://peerdisclosures.com/compare/amzn-vs-shop` | 200 | **blocked (login)** |
| `https://peerdisclosures.com/compare/tsla-vs-f` | 200 | **blocked (login)** |
| `https://peerdisclosures.com/compare/ko-vs-pep` | 200 | **blocked (login)** |

**HTTP summary:** 13/13 → **200** · 0 failures

### Google Search Console — URL Inspection

**Result:** **BLOCKED** — browser redirected to Google sign-in (`accounts.google.com/v3/signin/identifier`). OAuth cannot be completed by the agent; **0 indexing requests submitted**.

**GSC entry point used:**  
`https://search.google.com/search-console/inspect?resource_id=sc-domain%3Apeerdisclosures.com`

**Property note (Domain vs URL prefix):** The inspect link targets a **Domain property** (`sc-domain:peerdisclosures.com`). A separate URL-prefix property (`https://peerdisclosures.com/`) was not verified in this pass. Domain property creation was **not** attempted (requires DNS TXT — owner decision). After sign-in, confirm which property type is verified under **Settings → Ownership verification**.

#### Priority URLs — manual indexing required

| # | URL | Index requested | GSC status |
|---|-----|-----------------|------------|
| 1 | `https://peerdisclosures.com/` | **blocked (login)** | — |
| 2 | `https://peerdisclosures.com/pricing` | **blocked (login)** | — |
| 3 | `https://peerdisclosures.com/compare/aapl-vs-msft` | **blocked (login)** | — |
| 4 | `https://peerdisclosures.com/compare/nvda-vs-amd-vs-intc` | **blocked (login)** | — |
| 5 | `https://peerdisclosures.com/compare/jpm-vs-gs-vs-ms` | **blocked (login)** | — |
| 6 | `https://peerdisclosures.com/compare/goog-vs-meta` | **blocked (login)** | — |
| 7 | `https://peerdisclosures.com/compare/ko-vs-pep` | **blocked (login)** | — |
| 8 | `https://peerdisclosures.com/compare/aapl-vs-msft-vs-nvda` | **blocked (login)** | — |
| 9 | `https://peerdisclosures.com/compare/aapl-vs-nvda-vs-tsm` | **blocked (login)** | — |
| 10 | `https://peerdisclosures.com/compare/amzn-vs-shop` | **blocked (login)** | — |
| 11 | `https://peerdisclosures.com/compare/tsla-vs-f` | **blocked (login)** | — |

**Indexing summary:** 0 requested · 11 blocked (login) · 2 skipped (legal pages)

#### Owner action

1. Sign in at [Google Search Console](https://search.google.com/search-console) (verified owner account).
2. Open URL Inspection via the direct link above (or left nav).
3. For each URL in the table: paste → Enter → **Request indexing** (if offered).
4. Update the **Index requested** / **GSC status** columns in this section after completion.

---

## Log template (future weeks)

Copy the section above; update date, HTTP table, and GSC index status.
