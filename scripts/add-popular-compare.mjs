/**
 * Append a popular compare group to data/popular-peer-groups.json.
 *
 * Usage:
 *   node scripts/add-popular-compare.mjs <section-id> <group-id> <slug> "<label>" TICKER [TICKER...]
 *   node scripts/add-popular-compare.mjs technology crm-vs-now crm-vs-now "CRM vs ServiceNow" CRM NOW --dry-run
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const CATALOG_FILE = path.join(ROOT, "data", "popular-peer-groups.json");

const SLUG_RE = /^[a-z0-9.-]+(-vs-[a-z0-9.-]+)+$/;
const TICKER_RE = /^[A-Z][A-Z0-9.-]{0,9}$/;

function usage() {
  console.error(
    `Usage: node scripts/add-popular-compare.mjs <section-id> <group-id> <slug> "<label>" TICKER [TICKER...] [--dry-run]`
  );
  process.exit(1);
}

const dryRun = process.argv.includes("--dry-run");
const args = process.argv.slice(2).filter((a) => a !== "--dry-run");
const [sectionId, groupId, slug, label, ...tickers] = args;

if (!sectionId || !groupId || !slug || !label || tickers.length === 0) usage();

if (!SLUG_RE.test(slug)) {
  console.error(`Invalid slug "${slug}". Use lowercase tickers separated by -vs-.`);
  process.exit(1);
}

const normalizedTickers = tickers.map((t) => t.toUpperCase());
for (const t of normalizedTickers) {
  if (!TICKER_RE.test(t)) {
    console.error(`Invalid ticker "${t}".`);
    process.exit(1);
  }
}

const expectedSlug = normalizedTickers.map((t) => t.toLowerCase()).join("-vs-");
if (slug !== expectedSlug) {
  console.error(`Slug "${slug}" does not match tickers (expected "${expectedSlug}").`);
  process.exit(1);
}

const catalog = JSON.parse(fs.readFileSync(CATALOG_FILE, "utf8"));
const section = catalog.sections.find((s) => s.id === sectionId);
if (!section) {
  console.error(`Unknown section "${sectionId}". Options: ${catalog.sections.map((s) => s.id).join(", ")}`);
  process.exit(1);
}

if (section.groups.some((g) => g.id === groupId || g.slug === slug)) {
  console.error(`Group id or slug already exists: ${groupId} / ${slug}`);
  process.exit(1);
}

const today = new Date().toISOString().slice(0, 10);
const entry = {
  id: groupId,
  label,
  slug,
  tickers: normalizedTickers,
  industryTag: sectionId,
  sicOrSector: "TBD — set GICS/SIC on manual review",
  lastRefreshed: today,
};

section.groups.push(entry);

if (dryRun) {
  console.log("Dry run — would append:\n" + JSON.stringify(entry, null, 2));
  process.exit(0);
}

fs.writeFileSync(CATALOG_FILE, JSON.stringify(catalog, null, 2) + "\n", "utf8");
console.log(`Added ${slug} to section "${sectionId}" in data/popular-peer-groups.json`);
console.log(`Next: node scripts/refresh-popular-comparisons.mjs, npm test, deploy, GSC indexing.`);
