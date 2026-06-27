# SEO Setup — Peer Disclosures

Configuration for search engines, social previews, and structured data on [peerdisclosures.com](https://peerdisclosures.com).

## Environment variables

| Variable | Example | Purpose |
|----------|---------|---------|
| `NEXT_PUBLIC_APP_URL` | `https://peerdisclosures.com` | Canonical base URL for `metadataBase`, Open Graph absolute URLs, `sitemap.xml`, `robots.txt`, and JSON-LD |

Set on **Vercel → Project → Settings → Environment Variables** for Production (and Preview if you want correct OG URLs on preview deploys).

Local dev defaults to `http://localhost:3000` when unset.

**Checklist**

- [ ] Production value is `https://peerdisclosures.com` (no trailing slash, HTTPS, non-www)
- [ ] `vercel.json` redirects `www.peerdisclosures.com` → apex (already configured)
- [ ] `APP_URL` (backend) matches the same origin for Stripe redirects

## What ships in the app

| Route / file | SEO behavior |
|--------------|--------------|
| `app/layout.tsx` | Site-wide `metadataBase`, title template, description, keywords, Open Graph, Twitter cards |
| `app/page.tsx` | Organization + WebApplication JSON-LD |
| `app/pricing/page.tsx` | Pricing metadata + canonical `/pricing` |
| `app/privacy/page.tsx`, `app/terms/page.tsx` | Legal page metadata + canonicals |
| `app/account/page.tsx` | `noindex` (private account UI) |
| `app/compare/[peer_slug]/layout.tsx` | Dynamic title/description per ticker set; JSON-LD; dynamic OG image |
| `app/sitemap.ts` | Home, pricing, privacy, terms, popular compare slugs |
| `app/robots.ts` | Allow public routes; disallow `/account`; sitemap link |
| `app/manifest.ts` | PWA manifest with theme color and icons |
| `app/icon.svg` | Favicon (SVG) |
| `public/og-default.svg` | Default Open Graph / Twitter preview image |
| `lib/seo.ts` | Shared helpers, popular compare slugs, JSON-LD builders |

Popular compare URLs in the sitemap are defined once in `lib/seo.ts` (`POPULAR_COMPARISONS`).

## Post-deploy verification

### 1. Raw endpoints

```bash
curl -sI https://peerdisclosures.com/robots.txt
curl -s https://peerdisclosures.com/sitemap.xml
curl -sI https://peerdisclosures.com/manifest.webmanifest
```

Expect `200` responses. Sitemap should list `/`, `/pricing`, `/privacy`, `/terms`, and `/compare/*` presets.

### 2. Meta tags (home)

View page source or use [Facebook Sharing Debugger](https://developers.facebook.com/tools/debug/) on `https://peerdisclosures.com`:

- `<title>` and `og:title`
- `og:description`, `og:url`, `og:site_name`
- `twitter:card` = `summary_large_image`
- `og:image` pointing at `/og-default.svg` (replace with `public/og-default.png` for broader social crawler support if needed)

Repeat for a compare page, e.g. `https://peerdisclosures.com/compare/aapl-vs-msft`.

### 3. JSON-LD

Use [Google Rich Results Test](https://search.google.com/test/rich-results) on home and a compare URL. Expect `WebApplication` and `Organization` (home) and `WebPage` + app schema (compare).

### 4. Google Search Console

1. Go to [Google Search Console](https://search.google.com/search-console)
2. Add property: **URL prefix** `https://peerdisclosures.com`
3. Verify via DNS TXT (recommended) or HTML file upload
4. Submit sitemap: `https://peerdisclosures.com/sitemap.xml`
5. Use **URL Inspection** on `/` and `/compare/aapl-vs-msft` → **Request indexing** after launch

### 5. Bing Webmaster Tools (optional)

1. [Bing Webmaster](https://www.bing.com/webmasters)
2. Import from Google Search Console or verify domain
3. Submit the same sitemap URL

### 6. Analytics hooks (recommended next)

Search Console shows queries and impressions; add product analytics separately (e.g. Plausible, PostHog) to track compare sessions and checkout conversion. Not required for basic SEO.

## Adding new indexable compare landing pages

1. Add `{ slug, label }` to `POPULAR_COMPARISONS` in `lib/seo.ts`
2. Deploy — sitemap regenerates on build
3. Request indexing in Search Console for high-priority pairs

Arbitrary `/compare/{slug}` URLs are still crawlable via internal links; only curated slugs are in the sitemap.

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| OG image shows localhost | Set `NEXT_PUBLIC_APP_URL` on Vercel Production and redeploy |
| Duplicate www/non-www in index | Confirm apex redirect in `vercel.json`; set canonical host in Search Console |
| `/account` in search results | Should be blocked by `robots.txt` + `noindex`; request removal in Search Console if already indexed |
| Compare page thin content warning | sr-only H1/H2 and visible compare UI provide content; ensure tickers resolve to real filings |

## Related docs

- `docs/LAUNCH_AND_TRACTION_PLAN.md` — go-to-market and SEO content strategy
- `docs/PRODUCTION_DEPLOY.md` — full production env reference
