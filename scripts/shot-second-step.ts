/**
 * Visual check of the second-step sign-in screen: opens the dev-only harness page (src/app/dev-editor-harness/second-step, 404 in production)
 * and saves a screenshot of each fixture, plus a phone-width one. Needs `next dev` running (BASE_URL, default http://localhost:3100).
 *   PLAYWRIGHT_CORE=<path to playwright-core> npx tsx scripts/shot-second-step.ts [outDir]
 */
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";

const req = createRequire(import.meta.url ?? __filename);
const pw = req(process.env.PLAYWRIGHT_CORE ?? "playwright-core") as typeof import("playwright-core");
const base = process.env.BASE_URL ?? "http://localhost:3100";
const out = process.argv[2] ?? "/tmp";

(async () => {
  mkdirSync(out, { recursive: true });
  const browser = await pw.chromium.launch({ executablePath: process.env.CHROME_PATH ?? "/usr/bin/google-chrome", headless: true });
  for (const [label, w, h] of [["desktop", 1280, 1100], ["phone", 390, 900]] as const) {
    const page = await browser.newPage({ viewport: { width: w, height: h } });
    await page.goto(`${base}/dev-editor-harness/second-step`, { waitUntil: "networkidle", timeout: 120000 });
    await page.waitForSelector("[data-fixture]", { timeout: 60000 });
    await page.waitForTimeout(800);
    const n = await page.locator("[data-fixture]").count();
    for (let i = 0; i < n; i++) {
      await page.locator(`[data-fixture="${i}"]`).screenshot({ path: `${out}/second-step-${label}-${i}.png` });
    }
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    console.log(`${label}: ${n} fixtures, horizontal overflow: ${overflow}`);
    await page.close();
  }
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
