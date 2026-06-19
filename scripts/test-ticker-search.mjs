import { chromium } from "playwright";

const baseUrl = process.argv[2] || "http://localhost:3002";

const browser = await chromium.launch();
const page = await browser.newPage();
const network = [];

page.on("request", (req) => {
  if (req.url().includes("/tickers/search")) {
    network.push({ type: "req", url: req.url(), time: Date.now() });
  }
});
page.on("response", async (res) => {
  if (res.url().includes("/tickers/search")) {
    let body = "";
    try {
      body = (await res.text()).slice(0, 120);
    } catch {
      body = "<unreadable>";
    }
    network.push({
      type: "res",
      url: res.url(),
      status: res.status(),
      body,
      time: Date.now(),
    });
  }
});

await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
const input = page.getByPlaceholder(/Enter ticker|Add ticker/i);
await input.waitFor({ state: "visible", timeout: 30000 });
await input.click();
await page.waitForTimeout(300);
const popularVisible = await page.getByText("Popular tickers").isVisible().catch(() => false);
const listbox = page.locator('[role="listbox"]');
const listboxVisible = await listbox.isVisible().catch(() => false);
const listboxBox = listboxVisible ? await listbox.boundingBox() : null;

await input.fill("TSLA");
await page.waitForTimeout(1500);
const tslaButton = page.locator('[role="listbox"] button', { hasText: "TSLA" });
const tslaVisible = await tslaButton.isVisible().catch(() => false);
const listboxHtml = (await listbox.innerHTML().catch(() => "")).slice(0, 400);

console.log(
  JSON.stringify(
    {
      baseUrl,
      popularVisible,
      listboxVisible,
      listboxBox,
      tslaVisible,
      listboxSnippet: listboxHtml,
      network,
    },
    null,
    2
  )
);

await browser.close();
