import { chromium } from "playwright";

const baseUrl = process.argv[2] || "http://localhost:3010";
const routes = ["/compare/aapl-vs-msft", "/pricing"];

const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [];

page.on("pageerror", (err) => errors.push(`PAGE: ${err.message}`));
page.on("console", (msg) => {
  if (msg.type() === "error") errors.push(`CONSOLE: ${msg.text()}`);
});

for (const route of routes) {
  errors.length = 0;
  await page.goto(`${baseUrl}${route}`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForSelector("header", { timeout: 30000 });
  const logo = page.locator("header a").first();
  await logo.click();
  await page.waitForURL(`${baseUrl}/`, { timeout: 15000 });
  console.log(`${route} -> / : OK`);
  if (errors.length) console.log("  Errors:", errors.join(" | "));
}

await browser.close();
process.exit(0);
