/**
 * Append a popular compare slug to lib/seo.ts (POPULAR_COMPARISONS).
 *
 * Usage:
 *   node scripts/add-popular-compare.mjs <slug> "<label>"
 *   node scripts/add-popular-compare.mjs aapl-vs-msft "Apple vs Microsoft" --dry-run
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const SEO_FILE = path.join(ROOT, "lib", "seo.ts");

const SLUG_RE = /^[a-z0-9.-]+(-vs-[a-z0-9.-]+)+$/;

function usage() {
  console.error(`Usage: node scripts/add-popular-compare.mjs <slug> "<label>" [--dry-run]`);
  process.exit(1);
}

const args = process.argv.slice(2).filter((a) => a !== "--dry-run");
const dryRun = process.argv.includes("--dry-run");
const [slug, label] = args;

if (!slug || !label) usage();

if (!SLUG_RE.test(slug)) {
  console.error(`Invalid slug "${slug}". Use lowercase tickers separated by -vs- (e.g. crm-vs-now).`);
  process.exit(1);
}

const src = fs.readFileSync(SEO_FILE, "utf8");

if (src.includes(`slug: "${slug}"`)) {
  console.error(`Slug already exists: ${slug}`);
  process.exit(1);
}

const marker = "] as const;";
const idx = src.lastIndexOf(marker);
if (idx === -1) {
  console.error(`Could not find POPULAR_COMPARISONS closing "${marker}" in lib/seo.ts`);
  process.exit(1);
}

const escapedLabel = label.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
const entry = `  { slug: "${slug}", label: "${escapedLabel}" },\n`;
const updated = src.slice(0, idx) + entry + src.slice(idx);

if (dryRun) {
  console.log("Dry run — would append:\n" + entry);
  process.exit(0);
}

fs.writeFileSync(SEO_FILE, updated, "utf8");
console.log(`Added ${slug} to POPULAR_COMPARISONS in lib/seo.ts`);
console.log(`Next: verify /compare/${slug}, commit, deploy, request GSC indexing.`);
