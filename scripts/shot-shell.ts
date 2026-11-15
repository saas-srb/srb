/**
 * Visual check of the unified shell: opens the dev-only harness (src/app/dev-editor-harness/shell, 404 in production) and screenshots the Workspace
 * sidebar for a Director, a person with partial access and a person with none, a locked page and a product sidebar, at desktop and phone widths.
 * Needs `next dev` running.   PLAYWRIGHT_CORE=<path> npx tsx scripts/shot-shell.ts <outDir>
 */
import { createRequire } from "node:module";
const req = createRequire(import.meta.url ?? __filename);
const pw = req(process.env.PLAYWRIGHT_CORE ?? "playwright-core") as typeof import("playwright-core");
const out = process.argv[2] ?? "/tmp";
(async () => {
  const browser = await pw.chromium.launch({ executablePath: process.env.CHROME_PATH ?? "/usr/bin/google-chrome", headless: true });
  for (const [w, h] of [[1280, 1100], [390, 900]] as const) {
    for (const view of ["director", "partial", "none", "locked", "product"]) {
      const page = await browser.newPage({ viewport: { width: w, height: h } });
      await page.goto(`${process.env.BASE_URL ?? "http://localhost:3000"}/dev-editor-harness/shell?view=${view}`, { waitUntil: "networkidle", timeout: 180000 });
      await page.waitForSelector("nav, [role=region]", { timeout: 90000 });
      await page.waitForTimeout(500);
      const sw = await page.evaluate(() => document.documentElement.scrollWidth);
      if (sw > w + 2) console.log(`overflow: ${view} at ${w}px is ${sw}px wide`);
      await page.screenshot({ path: `${out}/shell-${view}-${w}.png`, fullPage: true });
      await page.close();
    }
  }
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
