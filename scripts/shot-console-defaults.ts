/** Screenshots of Platform Console → Integrations (dev harness) at desktop and phone widths. Needs `next dev`. PLAYWRIGHT_CORE=<path> npx tsx scripts/shot-console-defaults.ts <outDir> */
import { createRequire } from "node:module";
const req = createRequire(import.meta.url ?? __filename);
const pw = req(process.env.PLAYWRIGHT_CORE ?? "playwright-core") as typeof import("playwright-core");
const out = process.argv[2] ?? "/tmp";
const base = process.env.BASE_URL ?? "http://localhost:3000";
(async () => {
  const browser = await pw.chromium.launch({ executablePath: process.env.CHROME_PATH ?? "/usr/bin/google-chrome", headless: true });
  for (const [w, h] of [[1280, 1000], [390, 900]] as const) {
    for (const [name, query] of [["grid", ""], ["openai", "?open=openai"], ["razorpay", "?open=razorpay"]] as const) {
      const page = await browser.newPage({ viewport: { width: w, height: h } });
      await page.goto(`${base}/dev-editor-harness/console-defaults${query}`, { waitUntil: "networkidle", timeout: 240000 });
      await page.waitForSelector("[data-settings-card]", { timeout: 90000 });
      await page.waitForTimeout(700);
      const sw = await page.evaluate(() => document.documentElement.scrollWidth);
      if (sw > w + 2) console.log(`overflow: ${name} at ${w}px is ${sw}px wide`);
      await page.screenshot({ path: `${out}/console-${name}-${w}.png`, fullPage: name === "grid" });
      await page.close();
    }
  }
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
