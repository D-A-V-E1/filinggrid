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

## Log template (future weeks)

Copy the section above; update date, HTTP table, and GSC index status.
