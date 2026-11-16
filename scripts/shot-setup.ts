/**
 * Visual check of Setup progress: the dev-only harness (src/app/dev-editor-harness/setup, 404 in production) at desktop and phone widths.
 * Needs `next dev` running.   PLAYWRIGHT_CORE=<path> npx tsx scripts/shot-setup.ts <outDir>
 */
import { createRequire } from "node:module";
const req = createRequire(import.meta.url ?? __filename);
const pw = req(process.env.PLAYWRIGHT_CORE ?? "playwright-core") as typeof import("playwright-core");
const out = process.argv[2] ?? "/tmp";
(async () => {
  const browser = await pw.chromium.launch({ executablePath: process.env.CHROME_PATH ?? "/usr/bin/google-chrome", headless: true });
  for (const [w, h] of [[1280, 1000], [390, 900]] as const) {
    for (const view of ["p0", "p50", "na", "p100", "dashboard", "console"]) {
      const page = await browser.newPage({ viewport: { width: w, height: h } });
      await page.goto(`${process.env.BASE_URL ?? "http://localhost:3000"}/dev-editor-harness/setup?view=${view}`, { waitUntil: "networkidle", timeout: 180000 });
      await page.waitForSelector("main, section, table, [role=grid], h1", { timeout: 90000 });
      await page.waitForTimeout(600);
      const sw = (await page.evaluate("document.documentElement.scrollWidth")) as number;
      if (sw > w + 2) console.log(`overflow: ${view} at ${w}px is ${sw}px wide`);
      await page.screenshot({ path: `${out}/setup-${view}-${w}.png`, fullPage: false, clip: { x: 0, y: 0, width: w, height: view === "console" || view === "dashboard" ? 900 : 1500 } });
      await page.close();
    }
  }
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
