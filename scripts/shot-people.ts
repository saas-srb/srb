/**
 * Visual check of People & Access: opens the dev-only harness (src/app/dev-editor-harness/people, 404 in production), and screenshots the list,
 * step 1, step 2 (a product expanded), step 3 and a person with a withheld case, at desktop and phone widths. Needs `next dev` running.
 *   PLAYWRIGHT_CORE=<path> npx tsx scripts/shot-people.ts <outDir>
 */
import { createRequire } from "node:module";
const req = createRequire(import.meta.url ?? __filename);
const pw = req(process.env.PLAYWRIGHT_CORE ?? "playwright-core") as typeof import("playwright-core");
const out = process.argv[2] ?? "/tmp";
const base = process.env.BASE_URL ?? "http://localhost:3000";
(async () => {
  const browser = await pw.chromium.launch({ executablePath: process.env.CHROME_PATH ?? "/usr/bin/google-chrome", headless: true });
  const waits: Record<string, string> = { list: "table", step1: "text=Person details", step2: "[aria-label=\"Search products and features\"]", step3: "text=Seats", withheld: "text=Seats" };
  for (const [w, h] of [[1280, 900], [390, 800]] as const) {
    for (const view of ["list", "step1", "step2", "step3", "withheld"]) {
      const page = await browser.newPage({ viewport: { width: w, height: h } });
      await page.goto(`${base}/dev-editor-harness/people?view=${view}`, { waitUntil: "networkidle", timeout: 180000 });
      await page.waitForSelector(waits[view], { timeout: 90000 });
      await page.waitForTimeout(600);
      const sw = await page.evaluate(() => document.documentElement.scrollWidth);
      if (sw > w + 2) console.log(`overflow: ${view} at ${w}px is ${sw}px wide`);
      await page.screenshot({ path: `${out}/people-${view}-${w}.png`, fullPage: true });
      if (view === "list" && w === 1280) {
        await page.getByRole("button", { name: /More actions for Meera Iyer/ }).first().click();
        await page.waitForTimeout(400);
        await page.screenshot({ path: `${out}/people-list-menu-${w}.png` });
      }
      await page.close();
    }
  }
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
