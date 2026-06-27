# Launch Automation — Peer Disclosures

Maps every actionable item in [LAUNCH_AND_TRACTION_PLAN.md](./LAUNCH_AND_TRACTION_PLAN.md) to **automation level**, tooling, and who runs it (founder vs Cursor agent vs CI).

**Related runbooks**

- [LAUNCH_AND_TRACTION_PLAN.md](./LAUNCH_AND_TRACTION_PLAN.md) — full GTM plan
- [SEO_SETUP.md](./SEO_SETUP.md) — sitemap, OG, Search Console
- [POST_PROD_CHECKLIST.md](./POST_PROD_CHECKLIST.md) — post-launch ops cadence
- [COMPARE_SLUGS_SEO.md](./COMPARE_SLUGS_SEO.md) — weekly compare-slug workflow

**Legend**

| Tag | Meaning |
|-----|---------|
| 🤖 **Auto** | Script, CI, or deploy pipeline runs it with no human judgment |
| ⚙️ **Semi** | Tool-assisted; founder or agent executes a documented checklist |
| 👤 **Manual** | Requires human creativity, relationships, or subjective review |

---

## Automation summary

| Phase | Items | 🤖 Auto | ⚙️ Semi | 👤 Manual |
|-------|------:|--------:|--------:|----------:|
| Pre-launch | 16 | 1 (6%) | 5 (31%) | 10 (63%) |
| Launch week | 18 | 0 (0%) | 4 (22%) | 14 (78%) |
| Weeks 2–4 | 14 | 0 (0%) | 6 (43%) | 8 (57%) |
| Metrics | 6 | 1 (17%) | 3 (50%) | 2 (33%) |
| **Total** | **54** | **2 (4%)** | **18 (33%)** | **34 (63%)** |

**Target band (planning):** ~25–35% full auto, ~30–40% semi once highest-ROI scripts land. Today most launch work is founder-led; product/ops items skew semi-automatable.

**Who runs what**

| Runner | Best for |
|--------|----------|
| **CI / deploy** | Build, sitemap generation, health probes after deploy |
| **Cursor agent** | Edit `lib/seo.ts`, draft copy, run smoke scripts, open PRs |
| **Founder only** | PH/HN posts, newsletter outreach, GIF/video, community tone |

---

## Pre-launch (1–2 weeks before)

### Product & trust

| Item | Level | How to automate / tool |
|------|-------|------------------------|
| Production live at `peerdisclosures.com` + `NEXT_PUBLIC_APP_URL` | ⚙️ Semi | Vercel auto-deploy on `main`; verify env in Vercel UI or `vercel env ls`. Agent can grep docs for required vars. |
| Run [SEO_SETUP.md](./SEO_SETUP.md) verification | ⚙️ Semi | `curl` robots/sitemap/manifest (documented in SEO_SETUP); GSC property + sitemap submit is manual once. |
| Smoke-test home → compare → nav → XBRL; Stripe checkout | ⚙️ Semi | `backend/scripts/prod_smoke_check.py`, [POST_PROD_CHECKLIST.md](./POST_PROD_CHECKLIST.md); billing E2E stays manual (real card). |
| Privacy + Terms in footer; support email monitored | 👤 Manual | Visual QA; inbox setup (MX/forwarding). |
| Prepare 3–5 screenshot/GIF assets | 👤 Manual | Screen record / Loom; no repo automation. |

### Content ready at launch

| Item | Level | How to automate / tool |
|------|-------|------------------------|
| 5+ compare URLs indexed (`POPULAR_COMPARISONS`) | 🤖 Auto | Slugs in `lib/seo.ts` → `app/sitemap.ts` on build. See [COMPARE_SLUGS_SEO.md](./COMPARE_SLUGS_SEO.md). |
| Launch post draft (300–500 words) | 👤 Manual | Agent can draft; founder edits voice. |
| Short demo video (60–90s) | 👤 Manual | Founder records. |

### Accounts & listings

| Item | Level | How to automate / tool |
|------|-------|------------------------|
| Product Hunt maker profile + draft listing | 👤 Manual | |
| Hacker News account in good standing | 👤 Manual | |
| LinkedIn personal + company page | 👤 Manual | |
| X/Twitter thread outline | 👤 Manual | Agent can outline; founder posts. |
| List 10 target newsletters | 👤 Manual | Agent can research list; founder picks targets. |

---

## Launch week (days 1–7)

### Day 0 — Soft launch

| Item | Level | How to automate / tool |
|------|-------|------------------------|
| Share with 5–10 contacts for feedback | 👤 Manual | |
| Fix P0 bugs | ⚙️ Semi | Agent + CI; founder triages. |
| Note top requested tickers for new compare pages | 👤 Manual | Spreadsheet or GitHub issue; feeds weekly slug workflow. |

### Day 1 — Product Hunt

| Item | Level | How to automate / tool |
|------|-------|------------------------|
| Listing copy (name, tagline, description) | 👤 Manual | Agent draft → founder publish. |
| Gallery images | 👤 Manual | Reuse launch GIFs. |
| First comment | 👤 Manual | |
| Reply to comments within 2h | 👤 Manual | |
| Cross-post PH link on LinkedIn/X (no vote asks) | 👤 Manual | |

### Day 1–2 — Hacker News Show HN

| Item | Level | How to automate / tool |
|------|-------|------------------------|
| Title + post body | 👤 Manual | |
| Thread engagement all day | 👤 Manual | |

### Day 2–3 — LinkedIn

| Item | Level | How to automate / tool |
|------|-------|------------------------|
| Founder post with GIF + CTA | 👤 Manual | |
| Comment on earnings posts (non-spam) | 👤 Manual | |
| Share in finance Slack/Discord (with permission) | 👤 Manual | |

### Day 3–4 — Reddit

| Item | Level | How to automate / tool |
|------|-------|------------------------|
| Posts per subreddit table | 👤 Manual | Agent can draft per-sub copy; founder checks rules. |

### Day 4–5 — FinTwit / X

| Item | Level | How to automate / tool |
|------|-------|------------------------|
| Feature thread | 👤 Manual | |
| Earnings-week quote-tweet with live compare insight | 👤 Manual | Compare URL is shareable; insight is founder. |

### Day 5–7 — Newsletter outreach

| Item | Level | How to automate / tool |
|------|-------|------------------------|
| Batch 10 pitches | 👤 Manual | Agent can mail-merge drafts; founder sends. |

---

## Weeks 2–4 — Growth loops

### SEO content loop

| Item | Level | How to automate / tool |
|------|-------|------------------------|
| Add 2 compare slugs/week (`POPULAR_COMPARISONS`) | ⚙️ Semi | `node scripts/add-popular-compare.mjs <slug> "<label>"` → commit → deploy. [COMPARE_SLUGS_SEO.md](./COMPARE_SLUGS_SEO.md). |
| Request indexing in Search Console | ⚙️ Semi | Manual URL Inspection today; future: GSC Indexing API script. |
| Home “Popular comparisons” links (top 4) | ⚙️ Semi | Order in `lib/seo.ts` controls `PopularCompareLinks.tsx` slice; no separate file. |
| Long-tail query targeting | 👤 Manual | Use GSC queries → pick slug pairs. |

### Community loop

| Item | Level | How to automate / tool |
|------|-------|------------------------|
| Weekly LinkedIn disclosure-diff screenshot | 👤 Manual | |
| Monthly “compare of the month” email | 👤 Manual | Future: mailing list provider. |

### Product loop (conversion)

| Item | Level | How to automate / tool |
|------|-------|------------------------|
| Free tier as wedge (3 columns) | 🤖 Auto | Product behavior; no launch task. |
| Professional triggers (4th column, history, etc.) | 🤖 Auto | Paywall in app. |
| A/B paywall copy (“earnings week”) | 👤 Manual | Month 2 experiment; needs analytics vendor. |

### Partnership loop

| Item | Level | How to automate / tool |
|------|-------|------------------------|
| Newsletter pitch emails | 👤 Manual | |
| Stripe promotion codes for readers | ⚙️ Semi | Stripe Dashboard or API; track redemption manually. |
| Discord/Slack live walkthrough | 👤 Manual | |

---

## Metrics & targets

| Metric | Level | How to automate / tool |
|--------|-------|------------------------|
| Unique visitors | ⚙️ Semi | Plausible/PostHog/Vercel Analytics when added; GSC for search slice. |
| Compare sessions (`/compare/*`) | ⚙️ Semi | Product analytics event; until then GSC landing pages + server logs. |
| Signups | ⚙️ Semi | Supabase auth dashboard or analytics. |
| Checkout starts / paid conversions | ⚙️ Semi | Stripe Dashboard; webhook logs on API. |
| Organic search (GSC impressions/clicks) | ⚙️ Semi | GSC UI weekly export; API optional. |
| Weekly review spreadsheet | 👤 Manual | Founder ritual; agent can template sheet. |

Launch week and week-4 numeric targets stay in [LAUNCH_AND_TRACTION_PLAN.md](./LAUNCH_AND_TRACTION_PLAN.md#metrics--targets).

---

## Highest-ROI automations to build next

Priority order for moving items from 👤 → ⚙️ or 🤖:

1. **Compare slug helper** — `scripts/add-popular-compare.mjs` (done). Pair with weekly earnings-calendar slug picks.
2. **Post-deploy smoke in CI** — Run `prod_smoke_check.py` against production after Vercel deploy (GitHub Action or Render hook).
3. **SEO curl suite** — Single script: robots, sitemap contains new slug, compare page 200 + canonical. Fail deploy preview if broken.
4. **GSC indexing batch** — Script using Indexing API for new `/compare/*` URLs after each slug PR (OAuth + service account).
5. **Earnings calendar → slug suggestions** — Weekly script or agent prompt: read public earnings calendar, output 2 `{slug, label}` rows for founder approval.
6. **Launch scenario regression** — Extend `scripts/test-launch-scenarios.mjs` for compare slug smoke on preview URLs.

---

## Cursor agents vs founder-only

| Task | Cursor / CI | Founder only |
|------|-------------|--------------|
| Append `POPULAR_COMPARISONS`, open PR | ✅ | Approve merge |
| Run `prod_smoke_check.py`, paste results | ✅ | Interpret billing failures |
| Draft PH/HN/LinkedIn copy | ✅ draft | ✅ publish & engage |
| Product Hunt, HN submission, Reddit posts | ❌ | ✅ |
| Newsletter outreach, partnership tone | ❌ | ✅ |
| Record demo GIF/video | ❌ | ✅ |
| GSC “Request indexing” clicks | ✅ with browser MCP | ✅ |
| Stripe live checkout test | ❌ | ✅ (real payment) |
| Community comment strategy | ❌ | ✅ |

---

## Weekly operator checklist (semi-automated)

After launch, run this every Monday (~15 min + deploy):

1. Pick 2 slug pairs from earnings calendar → `node scripts/add-popular-compare.mjs ...` (see [COMPARE_SLUGS_SEO.md](./COMPARE_SLUGS_SEO.md)).
2. Merge to `main` → wait for Vercel deploy.
3. `curl -s https://peerdisclosures.com/sitemap.xml | grep <new-slug>` — confirm listed.
4. GSC → URL Inspection → Request indexing for each new compare URL.
5. `python backend/scripts/prod_smoke_check.py --api https://api.peerdisclosures.com --app https://peerdisclosures.com`
6. Update metrics row in spreadsheet (GSC + Stripe).
