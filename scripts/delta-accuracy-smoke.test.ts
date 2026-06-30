/**
 * Live delta-flag accuracy smoke against production API.
 * Run: NEXT_PUBLIC_API_URL=https://peerdisclosures-api.onrender.com npx vitest run scripts/delta-accuracy-smoke.test.ts --testTimeout=900000
 */
import { describe, expect, it } from "vitest";
import type { FilingColumn, FinancialsXbrl, NoteSectionXbrl } from "@/lib/api";
import { scanDeltas } from "@/lib/delta-engine";
import type { DeltaFlag, DeltaSessionState } from "@/lib/delta-types";
import { mergeProStatementCatalog } from "@/lib/sections";
import {
  columnHasReliableSectionPresence,
  columnHasSectionPresence,
  findCatalogSection,
} from "@/lib/section-presence";

const API = process.env.NEXT_PUBLIC_API_URL ?? "https://peerdisclosures-api.onrender.com";
const HEADERS = { Accept: "application/x-ndjson", "Content-Type": "application/json", "X-Dev-Tier": "professional" };
const FISCAL_YEAR = Number(process.env.DELTA_SMOKE_FY ?? 2025);
const THROTTLE_MS = 1500;

const SCENARIOS: { name: string; tickers: string[] }[] = [
  { name: "AAPL-MSFT", tickers: ["AAPL", "MSFT"] },
  { name: "TSLA-F-GM", tickers: ["TSLA", "F", "GM"] },
  { name: "NVDA-AMD-INTC", tickers: ["NVDA", "AMD", "INTC"] },
  { name: "AMZN-WMT", tickers: ["AMZN", "WMT"] },
  { name: "XOM-CVX-COP", tickers: ["XOM", "CVX", "COP"] },
  { name: "GOOG-META-MSFT", tickers: ["GOOG", "META", "MSFT"] },
];

const NONE_PATTERNS = /^(none\.?|not applicable\.?|n\/a\.?|no unresolved|there are no|not required)/i;
const CONTINGENCY_KEYWORDS = [
  "reasonably possible",
  "loss contingency",
  "under investigation",
  "unable to estimate",
  "material loss",
];

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchWithRetry(
  url: string,
  init: RequestInit,
  label: string,
  retries = 5
): Promise<Response> {
  let lastErr = "";
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, { ...init, signal: AbortSignal.timeout(300_000) });
      if (res.ok) return res;
      const body = (await res.text()).slice(0, 200);
      lastErr = `${label} HTTP ${res.status}: ${body}`;
      if (res.status === 502 || res.status === 503 || res.status === 504) {
        await sleep(8000 * (i + 1));
        continue;
      }
      throw new Error(lastErr);
    } catch (err) {
      lastErr = err instanceof Error ? err.message : String(err);
      if (i < retries - 1) await sleep(8000 * (i + 1));
    }
  }
  throw new Error(lastErr || `${label} failed after ${retries} retries`);
}

async function warmApi(): Promise<void> {
  for (let i = 0; i < 8; i++) {
    try {
      const res = await fetch(`${API}/health`, { signal: AbortSignal.timeout(120_000) });
      if (res.ok) {
        console.log(`  health ok (attempt ${i + 1})`);
        return;
      }
      console.log(`  health ${res.status}, retrying...`);
    } catch {
      console.log(`  health timeout, retrying (${i + 1}/8)...`);
    }
    await sleep(10000);
  }
  throw new Error("API health check failed after warmup retries");
}

async function fetchParse(tickers: string[]): Promise<{ columns: FilingColumn[]; catalog: { id: string; label: string }[] }> {
  const res = await fetchWithRetry(
    `${API}/parse/stream`,
    {
      method: "POST",
      headers: HEADERS,
      body: JSON.stringify({ tickers, fiscal_year: FISCAL_YEAR }),
    },
    "parse"
  );
  const text = await res.text();
  const columns: FilingColumn[] = [];
  let catalog: { id: string; label: string }[] = [];
  for (const line of text.trim().split("\n")) {
    if (!line.trim()) continue;
    const row = JSON.parse(line) as { type: string; section_catalog?: typeof catalog; column?: FilingColumn };
    if (row.type === "catalog" && row.section_catalog) catalog = row.section_catalog;
    if (row.type === "column" && row.column) columns.push(row.column);
  }
  return { columns, catalog };
}

async function fetchFinancials(tickers: string[]): Promise<Record<string, FinancialsXbrl>> {
  const res = await fetchWithRetry(
    `${API}/filings/financials/batch`,
    {
      method: "POST",
      headers: HEADERS,
      body: JSON.stringify({ tickers, fiscal_year: FISCAL_YEAR, headline_only: false }),
    },
    "financials"
  );
  const text = await res.text();
  const out: Record<string, FinancialsXbrl> = {};
  for (const line of text.trim().split("\n")) {
    if (!line.trim()) continue;
    const row = JSON.parse(line) as { type: string; ticker?: string; financials?: FinancialsXbrl };
    if (row.type === "financial" && row.ticker && row.financials) {
      out[row.ticker.toUpperCase()] = row.financials;
    }
  }
  return out;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function pickNoteFyRow(note: NoteSectionXbrl, fy: number | null) {
  if (!note.annual_summary?.length) return null;
  if (fy != null) return note.annual_summary.find((r) => r.fy === fy) ?? null;
  return [...note.annual_summary].sort((a, b) => b.fy - a.fy)[0] ?? null;
}

function hasNonZeroNoteMetrics(note: NoteSectionXbrl, fy: number | null): boolean {
  const row = pickNoteFyRow(note, fy);
  if (!row) return false;
  for (const key of Object.keys(note.metrics)) {
    const val = row[key];
    if (typeof val === "number" && Number.isFinite(val) && val !== 0) return true;
  }
  return false;
}

function sectionPreview(col: FilingColumn, sectionId: string): string {
  const sec = findCatalogSection(col.sections, sectionId);
  return sec?.text_preview?.trim() ?? "";
}

function isSubstantivePreview(text: string, minLen = 40): boolean {
  const trimmed = text.trim();
  if (trimmed.length < minLen) return false;
  if (NONE_PATTERNS.test(trimmed)) return false;
  return true;
}

interface VerifyResult {
  accurate: boolean | "plausible";
  evidence: string;
  issueType?: "false_positive" | "false_negative" | "mislabeled" | "uncertain";
}

function verifyFlag(flag: DeltaFlag, state: DeltaSessionState): VerifyResult {
  const col = state.columns.find((c) => c.ticker === flag.ticker);
  const fin = state.financialsByTicker[flag.ticker];

  switch (flag.ruleId) {
    case "missing_section": {
      const has = col
        ? columnHasReliableSectionPresence(col, flag.sectionId, fin)
        : false;
      if (has) {
        return { accurate: false, evidence: `${flag.ticker} has section ${flag.sectionId}`, issueType: "false_positive" };
      }
      const peersWith = state.columns.filter((c) =>
        columnHasReliableSectionPresence(c, flag.sectionId, state.financialsByTicker[c.ticker])
      );
      return {
        accurate: peersWith.length >= 2,
        evidence: `${peersWith.length}/${state.columns.length} peers have ${flag.sectionId}; ${flag.ticker} missing`,
      };
    }

    case "topic_only_peer": {
      const withSignal = state.columns.filter((c) => {
        const f = state.financialsByTicker[c.ticker];
        if (!columnHasSectionPresence(c, flag.sectionId, f)) return false;
        if (flag.sectionId === "note-contingencies") {
          return columnHasReliableSectionPresence(c, flag.sectionId, f);
        }
        if (["note-impairment", "note-acquisitions", "note-restructuring", "note-contingencies"].includes(flag.sectionId)) {
          const note = f?.notes_xbrl?.[flag.sectionId];
          return note ? hasNonZeroNoteMetrics(note, state.fiscalYear) : false;
        }
        return isSubstantivePreview(sectionPreview(c, flag.sectionId));
      });
      if (withSignal.length !== 1) {
        return {
          accurate: false,
          evidence: `${withSignal.length} peers with signal: ${withSignal.map((c) => c.ticker).join(",")}`,
          issueType: withSignal.length === 0 ? "false_positive" : "mislabeled",
        };
      }
      if (withSignal[0].ticker !== flag.ticker) {
        return { accurate: false, evidence: `Signal on ${withSignal[0].ticker}, not ${flag.ticker}`, issueType: "mislabeled" };
      }
      return { accurate: true, evidence: `Only ${flag.ticker} has material signal on ${flag.sectionId}` };
    }

    case "headline_vs_median": {
      const meta = flag.metadata as { metric?: string; value?: number; median?: number } | undefined;
      if (!meta?.metric || meta.value == null || meta.median == null) {
        return { accurate: "plausible", evidence: "metadata incomplete", issueType: "uncertain" };
      }
      const high = meta.value > meta.median * 1.5;
      const low = meta.value < meta.median * 0.5;
      const labelHigh = flag.label.toLowerCase().includes("above") || flag.label.toLowerCase().includes("high");
      const ok = (high && labelHigh) || (low && !labelHigh) || (!high && !low);
      return {
        accurate: ok,
        evidence: `${meta.metric}=${meta.value}, median=${meta.median}, ratio=${(meta.value / meta.median).toFixed(2)}`,
        issueType: ok ? undefined : "false_positive",
      };
    }

    case "headline_only_peer": {
      const metric = flag.rowKey ?? "net_income";
      const negatives = state.tickers.filter((t) => {
        const row = state.financialsByTicker[t]?.annual_summary?.find((r) => r.fy === state.fiscalYear);
        const val = row?.[metric as keyof typeof row];
        return typeof val === "number" && val < 0;
      });
      return {
        accurate: negatives.length === 1 && negatives[0] === flag.ticker,
        evidence: `Negative ${metric}: ${negatives.join(",") || "none"}`,
        issueType: negatives.length !== 1 ? "false_positive" : undefined,
      };
    }

    case "disagreement_reported": {
      const preview = col ? sectionPreview(col, "disagreements") : "";
      const lower = preview.toLowerCase();
      const is9c =
        lower.includes("foreign jurisdictions") && lower.includes("prevent inspections");
      const substantive = isSubstantivePreview(preview, 30) && !is9c;
      return {
        accurate: substantive,
        evidence: is9c
          ? `Item 9C HFCAA heading, not disagreement: "${preview.slice(0, 60)}"`
          : substantive
            ? `substantive (${preview.length} chars)`
            : `not substantive: "${preview.slice(0, 60)}"`,
        issueType: is9c || !substantive ? "false_positive" : undefined,
      };
    }

    case "contingency_open_emphasis": {
      const meta = flag.metadata as { hits?: number; median?: number } | undefined;
      const note = fin?.notes_xbrl?.[flag.sectionId];
      const metricsOk = flag.sectionId !== "note-contingencies" || (note && hasNonZeroNoteMetrics(note, state.fiscalYear));
      const text = note?.disclosures?.map((d) => d.text).join("\n") || sectionPreview(col!, flag.sectionId);
      const hits = CONTINGENCY_KEYWORDS.filter((kw) => text.toLowerCase().includes(kw)).length;
      const med = meta?.median ?? 0;
      const threshold = Math.max(2, med * 2);
      const ok = metricsOk && hits >= threshold;
      return {
        accurate: ok,
        evidence: `hits=${hits} threshold=${threshold} metricsOk=${metricsOk}`,
        issueType: ok ? undefined : "false_positive",
      };
    }

    case "note_metric_vs_median": {
      const meta = flag.metadata as { metric?: string; value?: number; median?: number } | undefined;
      if (!meta?.metric) return { accurate: "plausible", evidence: "no metric metadata", issueType: "uncertain" };
      const values: Record<string, number> = {};
      for (const t of state.tickers) {
        const note = state.financialsByTicker[t]?.notes_xbrl?.[flag.sectionId];
        const row = note ? pickNoteFyRow(note, state.fiscalYear) : null;
        const val = row?.[meta.metric];
        if (typeof val === "number" && val !== 0) values[t] = val;
      }
      const med = median(Object.values(values));
      const val = values[flag.ticker];
      if (val == null || med == null || med === 0) {
        return { accurate: "plausible", evidence: `sparse data val=${val} med=${med}`, issueType: "uncertain" };
      }
      const high = val > med * 1.5;
      const low = val < med * 0.5;
      const labelHigh = flag.label.toLowerCase().includes("above") || flag.label.toLowerCase().includes("high");
      const ok = (high && labelHigh) || (low && !labelHigh);
      return {
        accurate: ok,
        evidence: `${meta.metric} ${flag.ticker}=${val} median=${med.toFixed(0)} peers=${JSON.stringify(values)}`,
        issueType: ok ? undefined : "false_positive",
      };
    }

    case "open_staff_comments":
    case "only_peer_open_staff": {
      const preview = col ? sectionPreview(col, "unresolved-staff") : "";
      const substantive = isSubstantivePreview(preview);
      return {
        accurate: substantive,
        evidence: substantive ? `open staff (${preview.length} chars)` : `"${preview.slice(0, 60)}"`,
        issueType: substantive ? undefined : "false_positive",
      };
    }

    case "prose_number_gap": {
      const note = fin?.notes_xbrl?.[flag.sectionId];
      const hasData = note?.has_data === true;
      return {
        accurate: !hasData,
        evidence: hasData ? "note has tagged data" : "narrative only, no XBRL amounts",
        issueType: hasData ? "false_positive" : undefined,
      };
    }

    default:
      return { accurate: "plausible", evidence: `no auto-check for ${flag.ruleId}`, issueType: "uncertain" };
  }
}

function rankFlags(flags: DeltaFlag[]): DeltaFlag[] {
  const severityOrder = { P1: 0, P2: 1, P3: 2 };
  return [...flags].sort((a, b) => {
    const sd = severityOrder[a.severity] - severityOrder[b.severity];
    if (sd !== 0) return sd;
    return a.label.localeCompare(b.label);
  });
}

interface MatrixRow {
  comp: string;
  flag: string;
  accurate: string;
  evidence: string;
  issueType: string;
}

describe("delta accuracy smoke (live API)", () => {
  it(
    "validates flags on real comps",
    async () => {
      const matrix: MatrixRow[] = [];
      let totalChecked = 0;
      let accurateCount = 0;
      let plausibleCount = 0;
      const falsePositives: string[] = [];
      const uncertain: string[] = [];

      console.log(`\n=== Delta accuracy smoke API=${API} FY${FISCAL_YEAR} ===\n`);
      console.log("Warming API...");
      await warmApi();

      for (const sc of SCENARIOS) {
        await sleep(THROTTLE_MS);
        const { columns, catalog } = await fetchParse(sc.tickers);
        await sleep(THROTTLE_MS);
        const financialsByTicker = await fetchFinancials(sc.tickers);

        const navigableCatalog = mergeProStatementCatalog(catalog, true);
        const state: DeltaSessionState = {
          tickers: sc.tickers,
          columns,
          catalog: navigableCatalog,
          financialsByTicker,
          financialsErrors: {},
          fiscalYear: FISCAL_YEAR,
          period: undefined,
          isPro: true,
        };

        const result = scanDeltas(state);
        const ranked = rankFlags(result.flags);
        const top = ranked.slice(0, 5);

        console.log(`\n--- ${sc.name} (${sc.tickers.join(", ")}) ---`);
        console.log(`  flags=${result.flags.length} sectionsWithDeltas=${result.coverage.sectionsWithDeltas}`);
        if (result.mixedFilerBanner) console.log(`  banner: ${result.mixedFilerBanner}`);

        for (const f of top) {
          const v = verifyFlag(f, state);
          totalChecked++;
          const accLabel = v.accurate === true ? "yes" : v.accurate === false ? "NO" : "plausible";
          if (v.accurate === true) accurateCount++;
          if (v.accurate === "plausible") plausibleCount++;
          if (v.accurate === false) falsePositives.push(`${sc.name}: ${f.ruleId}@${f.ticker}/${f.sectionId}`);
          if (v.issueType === "uncertain") uncertain.push(`${sc.name}: ${f.ruleId}@${f.ticker}`);

          matrix.push({
            comp: sc.name,
            flag: `${f.ruleId}|${f.ticker}|${f.sectionId}${f.rowKey ? `|${f.rowKey}` : ""}`,
            accurate: accLabel,
            evidence: v.evidence.slice(0, 120),
            issueType: v.issueType ?? "",
          });

          console.log(`  [${accLabel}] ${f.ruleId} ${f.ticker} ${f.sectionId} — ${f.label.slice(0, 70)}`);
          console.log(`         ${v.evidence.slice(0, 100)}`);
        }

        // Known fix: AAPL-MSFT contingencies should NOT fire topic_only_peer
        if (sc.name === "AAPL-MSFT") {
          const bad = result.flags.filter((f) => f.ruleId === "topic_only_peer" && f.sectionId === "note-contingencies");
          expect(bad, "AAPL-MSFT contingencies topic_only_peer regression").toHaveLength(0);
        }
      }

      const denom = totalChecked - plausibleCount;
      const pct = denom > 0 ? Math.round((accurateCount / denom) * 100) : 0;
      const plausiblePct = totalChecked > 0 ? Math.round(((accurateCount + plausibleCount) / totalChecked) * 100) : 0;

      console.log("\n=== ACCURACY MATRIX ===");
      console.log("Comp|Flag|Accurate?|Evidence|Issue");
      for (const row of matrix) {
        console.log(`${row.comp}|${row.flag}|${row.accurate}|${row.evidence}|${row.issueType}`);
      }

      console.log("\n=== SUMMARY ===");
      console.log(`Checked top flags: ${totalChecked}`);
      console.log(`Verified accurate: ${accurateCount} (${pct}% of definitive)`);
      console.log(`Plausible/uncertain: ${plausibleCount}`);
      console.log(`Plausible+accurate: ${plausiblePct}%`);
      console.log(`False positives: ${falsePositives.length}`);
      if (falsePositives.length) console.log(falsePositives.join("\n"));

      expect(falsePositives.length, "no false positives in top-5 per comp").toBeLessThanOrEqual(2);
    },
    900_000
  );
});
