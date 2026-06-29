/**
 * Validate popular peer groups and stamp refresh dates.
 *
 * Usage:
 *   node scripts/refresh-popular-comparisons.mjs           # validate only
 *   node scripts/refresh-popular-comparisons.mjs --stamp   # set lastRefreshed to today
 *   node scripts/refresh-popular-comparisons.mjs --dry-run
 *
 * Phase 1 uses curated tickers in data/popular-peer-groups.json.
 * Optional: wire a market-cap API here later to reorder tickers within a group.
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const CATALOG_FILE = path.join(ROOT, "data", "popular-peer-groups.json");

const SLUG_RE = /^[a-z0-9.-]+(-vs-[a-z0-9.-]+)+$/;
const TICKER_RE = /^[A-Z][A-Z0-9.-]{0,9}$/;

function slugFromTickers(tickers) {
  return tickers.map((t) => t.toLowerCase()).join("-vs-");
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

const stamp = process.argv.includes("--stamp");
const dryRun = process.argv.includes("--dry-run");

const raw = fs.readFileSync(CATALOG_FILE, "utf8");
const catalog = JSON.parse(raw);
const errors = [];

for (const section of catalog.sections ?? []) {
  for (const group of section.groups ?? []) {
    if (!group.id || !group.label || !group.slug || !Array.isArray(group.tickers)) {
      errors.push(`${section.id}/${group.id ?? "?"}: missing required fields`);
      continue;
    }
    if (!SLUG_RE.test(group.slug)) {
      errors.push(`${group.id}: invalid slug "${group.slug}"`);
    }
    if (group.tickers.length === 0 || group.tickers.length > 8) {
      errors.push(`${group.id}: ticker count must be 1–8`);
    }
    for (const t of group.tickers) {
      if (!TICKER_RE.test(t)) {
        errors.push(`${group.id}: invalid ticker "${t}"`);
      }
    }
    const expectedSlug = slugFromTickers(group.tickers);
    if (group.slug !== expectedSlug) {
      errors.push(
        `${group.id}: slug "${group.slug}" does not match tickers (expected "${expectedSlug}")`
      );
    }
  }
}

if (errors.length) {
  console.error("Catalog validation failed:\n" + errors.map((e) => `  - ${e}`).join("\n"));
  process.exit(1);
}

const groupCount = catalog.sections.reduce((n, s) => n + s.groups.length, 0);
console.log(
  `Validated ${groupCount} peer groups in ${catalog.sections.length} sections (catalog v${catalog.catalogVersion}).`
);

if (stamp) {
  const refreshed = todayIso();
  catalog.lastCatalogRefresh = refreshed;
  for (const section of catalog.sections) {
    for (const group of section.groups) {
      group.lastRefreshed = refreshed;
    }
  }
  if (dryRun) {
    console.log(`Dry run — would set lastRefreshed to ${refreshed}`);
  } else {
    fs.writeFileSync(CATALOG_FILE, JSON.stringify(catalog, null, 2) + "\n", "utf8");
    console.log(`Stamped lastRefreshed=${refreshed} on catalog and all groups.`);
  }
} else {
  console.log("Tip: run with --stamp after quarterly ticker review (see docs/POPULAR_COMPARISONS.md).");
}
