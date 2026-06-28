# Competitive Compare Handoff — Peer Disclosures vs BamSEC & Calcbench

**Product:** [Peer Disclosures](https://peerdisclosures.com)  
**Workspace:** `c:\Users\davel\TECH\Reporting - Comparative Viewer`  
**Created:** 2026-06-27  
**Purpose:** Self-contained brief to continue competitive positioning and killer-feature integration in a **new Cursor chat**. Documentation only — no implementation in the thread that produced this file.

---

## 1. Topic title

**Competitive positioning vs BamSEC & Calcbench; killer feature integration roadmap**

---

## 2. Product context (brief)

**Peer Disclosures** is a web compare workspace for SEC disclosure research:

| Dimension | Detail |
|-----------|--------|
| **Core UX** | Multi-column synchronized compare — one section nav drives all peer columns in lockstep |
| **Pricing** | Free: 3 columns, current-year filings, no login. **Professional: $29/mo** — 8 columns, full archive, full GAAP XBRL statements, saved peer groups |
| **Section taxonomy** | Normalized Item 1–9 + 25+ footnote categories (`note-revenue`, `note-leases`, `note-stock-comp`, etc.) mapped via `section_extractor.py` / `lib/sections.ts` |
| **Data sources** | Parsed filing HTML excerpts + XBRL headline metrics (free) and full GAAP statements (Pro) |
| **Forms** | 10-K, 10-Q, 20-F, 6-K with fiscal-period alignment via shared period picker |
| **URLs** | Shareable slugs, e.g. `/compare/aapl-vs-msft-vs-nvda` |

**Positioning in one line:** The fast, affordable multi-peer disclosure grid — not a terminal, not a redline tool, not a universe-wide search engine.

---

## 3. Strict compare-tool comparison

These are **different product categories**. Compare only on overlapping jobs-to-be-done.

### BamSEC compare

| Aspect | Reality |
|--------|---------|
| **What it is** | **Temporal redline** — same company, two filings (e.g. FY23 10-K vs FY24 10-K) |
| **What it is NOT** | Multi-peer side-by-side grid across tickers |
| **Strength** | Section-level change highlighting within one issuer over time |
| **Weakness vs Peer** | No synchronized cross-peer footnote taxonomy; no 8-column peer bench at $29/mo |

### Calcbench

| Aspect | Reality |
|--------|---------|
| **What it is** | Cross-peer **disclosure query / search / pattern matrix** + deep XBRL terminal |
| **What it is NOT** | A clean synchronized reading grid for 3–8 peers on one section |
| **Strength** | Universe-scale search (“who discloses X?”), Excel export, API, disclosure pattern tables |
| **Weakness vs Peer** | Heavier, pricier, optimized for quant/query workflows not narrative compare |

### Peer Disclosures — wins today

1. **Synchronized multi-peer section grid** — `CompareGrid` + `SectionNav` + `FilingColumn`; one click jumps all columns to the same normalized section ID
2. **Normalized footnote taxonomy** — 30+ `note-*` section IDs from `SECTION_DEFINITIONS` in `backend/sec/section_extractor.py`, grouped in `lib/sections.ts` (`getNavGroups`)
3. **Price & simplicity** — free 3-column entry, $29/mo Pro, no terminal contract
4. **Shareable compare URLs** + progressive load (XBRL bootstrap while sections parse)
5. **ADR + domestic** — 10-K/10-Q/20-F/6-K period merge via `find_filing_for_period` (`backend/sec/filing_periods.py`)

### Peer Disclosures — gaps vs competitors

| Gap | BamSEC has it | Calcbench has it |
|-----|---------------|------------------|
| YoY / period-over-period redline (same ticker) | ✅ | partial |
| Cross-company full-universe search | ❌ | ✅ |
| Excel export / API | ❌ | ✅ |
| Disclosure pattern matrix at scale | ❌ | ✅ |
| Deep XBRL terminal / custom queries | partial (Pro GAAP tables) | ✅ |

**Strategic frame:** Peer Disclosures should **borrow killer slices** from each competitor without becoming either one. Stay the best **multi-peer synchronized reading grid**; add redline and in-session search as accelerators inside that grid.

---

## 4. Killer features to integrate

### From BamSEC — Section-level filing redline

**Job:** Same ticker, prior period vs current period, for the **active section only**.

- User is on `note-revenue` for AAPL FY24 → toggle “Compare to prior period” → see insertions/deletions vs FY23 `note-revenue`
- Scoped to one column + one section — not a full-document diff
- Complements (does not replace) the multi-peer grid

### From Calcbench — Cross-peer disclosure search (in-session)

**Job:** Search disclosure text **across tickers already loaded** in the compare session.

- Query: e.g. `"asc 842"` or `"revenue recognition policy"`
- Results: ticker × section hits with snippet + jump-to-section
- **Optional extension:** **Coverage matrix** — rows = section IDs (or footnote topics), columns = loaded tickers, cells = present / absent / snippet preview

**Explicit non-goal for v1:** Calcbench-scale indexing of the entire SEC universe. Scope = loaded compare tickers (+ cached section text already in `parse_cache`).

---

## 5. What each would look like in the product

### 5A. Coverage matrix (priority #1)

**UX sketch**

```
┌─────────────────────────────────────────────────────────────┐
│ Compare: AAPL · MSFT · GOOGL · AMZN          [Coverage ▾]  │
├─────────────────────────────────────────────────────────────┤
│ Section / Note          │ AAPL │ MSFT │ GOOGL │ AMZN      │
│─────────────────────────┼──────┼──────┼───────┼───────────│
│ note-revenue            │  ✓   │  ✓   │   ✓   │    ✓      │
│ note-leases             │  ✓   │  ✓   │   —   │    ✓      │
│ note-stock-comp         │  ✓   │  —   │   ✓   │    ✓      │
│ mda                     │  ✓   │  ✓   │   ✓   │    ✓      │
└─────────────────────────────────────────────────────────────┘
Click cell → jump to that section for that ticker (existing nav)
```

- Entry: toolbar button **“Coverage”** or section nav footer link
- Modal or right drawer; filter to Footnotes only / All sections
- Uses existing `availableSectionIds` per column — no new backend for MVP

**API (optional backend enrichment)**

```
GET /compare/coverage?tickers=AAPL,MSFT&period=annual-2024
→ { columns: [{ ticker, cache_key, sections: [{ id, label, has_content: bool }] }] }
```

Can be computed client-side from `ParseResponse.columns[].sections` today; backend endpoint only needed if section index is lazy-loaded without full metadata.

---

### 5B. In-session peer search (priority #2)

**UX sketch**

```
┌─────────────────────────────────────────────────────────────┐
│ 🔍 Search in this compare…  [asc 606                    ] │
├─────────────────────────────────────────────────────────────┤
│ MSFT · note-revenue        "…adopted ASC 606 in fiscal…"  │
│ GOOGL · note-revenue       "…revenue from contracts with…"│
│ AAPL · mda                 "…ASC 606 did not have a material│
│ AMZN · note-recent-standards "…new guidance on segment…"   │
└─────────────────────────────────────────────────────────────┘
```

- Search bar in compare header (next to period picker)
- Scope toggle: **Active section only** vs **All loaded sections**
- Click result → `setActiveSection(id)` + scroll column to ticker
- Pro gating: optional — could be free for 3 columns to drive differentiation

**API endpoint ideas**

```
POST /compare/search
Body: {
  "tickers": ["AAPL","MSFT"],
  "period": "annual-2024",
  "query": "asc 606",
  "section_ids": null | ["note-revenue", "mda"],
  "limit": 50
}
Response: {
  "hits": [{
    "ticker": "MSFT",
    "section_id": "note-revenue",
    "section_label": "Note — Revenue Recognition",
    "snippet": "…",
    "score": 0.92
  }]
}
```

**Implementation path:** Batch-fetch plain text via existing `GET /parse/section?format=text` (or bulk internal call to `extract_section_text`) for each `(ticker, section_id)` in the intersection of catalog × `availableSectionIds`. Index in memory per session; no persistent search index for v1.

---

### 5C. Section redline — same ticker, prior period (priority #3)

**UX sketch**

```
┌─ AAPL ─────────────────────────────────────────────────────┐
│ FY24 10-K · note-revenue          [◉ vs FY23] [vs peers]  │
├──────────────────────────────────────────────────────────┤
│  …policy for revenue recognition…                         │
│  - We recognize revenue when control transfers…  (removed)│
│  + We recognize revenue upon delivery of…        (added)  │
│  …performance obligations…                              │
└──────────────────────────────────────────────────────────┘
```

- Per-column toggle: **“Compare to prior period”** (only when a prior period exists in `fetchFilingPeriods`)
- Diff applies to **active section** HTML/text only
- Default view stays side-by-side peers; redline mode can expand one column to split-pane (current | prior) or inline highlights

**API endpoint ideas**

```
GET /parse/section/diff
  ?ticker=AAPL
  &section_id=note-revenue
  &period=annual-2024
  &base_period=annual-2023
  &format=html|text

Response: {
  "ticker": "AAPL",
  "section_id": "note-revenue",
  "current": { "period": "annual-2024", "cache_key": "...", "html": "..." },
  "prior": { "period": "annual-2023", "cache_key": "...", "html": "..." },
  "diff": {
    "format": "html",  // word-level <ins>/<del> or unified text
    "html": "..."
  }
}
```

**Prior period resolution:** Reuse `find_filing_for_period` with prior fiscal year / interim slot from `FilingPeriodPicker` options. `FilingPeriodPicker` already loads merged periods via `GET /filings/periods`.

---

## 6. Implementation feasibility (existing codebase)

### Building blocks already in repo

| Capability | Location | Notes |
|------------|----------|-------|
| Section text extraction | `extract_section_text()`, `extract_section_html()` in `backend/sec/section_extractor.py` | Reuses `_prepare_filing_structure` / structure cache |
| Section index (metadata only) | `parse_filing_section_index()` | Fast path without full HTML |
| Period → filing resolution | `find_filing_for_period()` in `backend/sec/filing_periods.py` | Annual + interim + 20-F/6-K |
| Period picker UI | `components/compare/FilingPeriodPicker.tsx` | URL params `year`, `period`; Pro paywall for historical |
| Parse cache | `backend/parse_cache.py` | `load_parsed_column`, `get_filing_structure`, `store_filing_structure` — 64-entry LRU |
| Compare grid + section union | `components/compare/CompareGrid.tsx` | `availableSectionIds` = union of `data.columns[].sections` (+ Pro GAAP IDs) |
| Section taxonomy / nav | `lib/sections.ts`, `SECTION_DEFINITIONS` in `section_extractor.py` | `getNavGroups(isPro)`, 25+ footnote IDs |
| On-demand section fetch | `GET /parse/section` in `backend/main.py` → `get_section_html()` in `filing_parser.py` | `format=html|text` |
| Bulk parse | `POST /parse`, `POST /parse/stream` | Returns `ParseResponse` with per-column `sections[]` metadata |
| Client section text | `fetchSectionText()` in `lib/api.ts` | Wraps `/parse/section?format=text` |

### Effort estimates

| Feature | Estimate | Rationale |
|---------|----------|-----------|
| **Coverage matrix** | **2–4 days** | Mostly UI over existing `ParseResponse`; optional thin API |
| **In-session peer search** | **1–2 weeks** | Batch text extraction, simple in-memory index, search UI, result linking; rate limits / lazy load for large section sets |
| **Section redline MVP** | **2–4 weeks** | Prior-period fetch + text/HTML diff + per-column UI; word-level diff is tractable, **table diff inside footnotes is hard** |

### Hard parts (do not underestimate)

1. **Table diff** — Footnotes are HTML tables; naive text diff destroys structure. MVP should diff plain text or paragraph-level blocks; table-aware diff is a later phase.
2. **Full Calcbench-scale indexing** — Universe-wide inverted index, nightly ingestion, Excel/API — different product; out of scope for “in-session search.”
3. **Prior period alignment** — Interim slots (Q2 vs Q2) must use `interim_slot` logic in `filing_periods.py`, not just `fiscal_year - 1`.
4. **Cache cold paths** — Redline/search may trigger 2× section extractions per ticker; rely on `parse_cache` + `get_filing_structure` to avoid re-parsing DOM.
5. **Free vs Pro** — Historical periods already gated (`check_free_period_access`); redline to prior year may naturally require Pro.

### Suggested file touch map (for implementer)

| Feature | Backend | Frontend |
|---------|---------|----------|
| Coverage matrix | optional `compare/coverage` route | `CoverageMatrix.tsx`, hook in `CompareGrid` |
| In-session search | `compare/search` or extend `filing_parser.py` | `CompareSearchBar.tsx`, `lib/compare-search.ts` |
| Section redline | `get_section_diff()` in `filing_parser.py`, route `/parse/section/diff` | `RedlineToggle` on `FilingColumn`, diff renderer component |

---

## 7. Recommended priority

| Order | Feature | Why |
|-------|---------|-----|
| **1** | **Coverage matrix** | Lowest effort, high “Calcbench-like” signal, uses data already on parse response; helps users see which peers lack a footnote |
| **2** | **In-session peer search** | Strong differentiation inside the compare workflow; scoped scope avoids universe index |
| **3** | **Section redline** | BamSEC parity for power users; higher complexity (diff quality, prior period UX, table footnotes) |

---

## 8. Suggested first message for new chat

Copy-paste the block below into a **new Agent chat** in this workspace:

```
Continue competitive feature work for Peer Disclosures (peerdisclosures.com).

Read docs/COMPETITIVE_COMPARE_HANDOFF.md first — it is the source of truth for positioning vs BamSEC & Calcbench and the killer-feature roadmap.

Task: Implement the Coverage Matrix (priority #1).

Requirements:
- Add a Coverage view to the compare workspace for tickers already loaded in CompareGrid.
- Rows = section IDs from the navigable catalog (respect Pro GAAP sections when applicable).
- Columns = loaded tickers.
- Cell = present/absent based on each column's parsed sections (availableSectionIds per column, not just the union).
- Clicking a cell jumps to that section and focuses that column.
- Prefer client-side computation from existing ParseResponse; add a backend endpoint only if needed.
- Match existing UI patterns (Tailwind, CompareGrid toolbar, SectionNav grouping from lib/sections.ts).
- Do not build universe-scale search or redline in this task.

Key files: components/compare/CompareGrid.tsx, components/compare/SectionNav.tsx, lib/sections.ts, lib/api.ts, backend/filing_parser.py (if API needed).

After implementation, summarize UX and note any follow-ups for in-session search and section redline.
```

**Alternate prompts** (swap the Task section):

- *Spec only:* “Draft an OpenAPI-style spec for `GET /parse/section/diff` including prior-period resolution via `find_filing_for_period`.”
- *Search next:* “Implement in-session peer search (priority #2) per the handoff doc.”
- *Redline spike:* “Build a backend spike for section-level text diff between two periods for one ticker/section, using `extract_section_text` and structure cache.”

---

## Quick reference — competitor one-liners (for marketing copy)

- **vs BamSEC:** “We compare peers side-by-side; BamSEC redlines one company over time. We’re adding section redline — without giving up the multi-peer grid.”
- **vs Calcbench:** “We’re the reading grid; Calcbench is the query terminal. Coverage matrix + in-session search bring pattern-finding into your compare session — without a $10k+ contract.”
- **vs Excel/EDGAR tabs:** “Normalized footnotes across 8 peers, one click, one URL — $29/mo.”

---

*End of handoff. No features were implemented in the thread that created this document.*
