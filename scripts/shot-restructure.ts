/**
 * Visual check of the restructured Workspace: the dev-only harness (src/app/dev-editor-harness/restructure, 404 in production) at desktop and phone widths.
 * Needs `next dev` running.   PLAYWRIGHT_CORE=<path> npx tsx scripts/shot-restructure.ts <outDir>
 */
import { createRequire } from "node:module";
const req = createRequire(import.meta.url ?? __filename);
const pw = req(process.env.PLAYWRIGHT_CORE ?? "playwright-core") as typeof import("playwright-core");
const out = process.argv[2] ?? "/tmp";
(async () => {
  const browser = await pw.chromium.launch({ executablePath: process.env.CHROME_PATH ?? "/usr/bin/google-chrome", headless: true });
  for (const [w, h] of [[1280, 1000], [390, 900]] as const) {
    for (const view of ["sidebar-director", "sidebar-partial", "integrations", "panel-srb", "panel-own", "chatbot", "products", "product-panel", "domains"]) {
      const page = await browser.newPage({ viewport: { width: w, height: h } });
      await page.goto(`${process.env.BASE_URL ?? "http://localhost:3000"}/dev-editor-harness/restructure?view=${view}`, { waitUntil: "networkidle", timeout: 180000 });
      await page.waitForSelector("nav, article, section, [role=dialog]", { timeout: 90000 });
      await page.waitForTimeout(700);
      const sw = await page.evaluate(() => document.documentElement.scrollWidth);
      if (sw > w + 2) console.log(`overflow: ${view} at ${w}px is ${sw}px wide`);
      await page.screenshot({ path: `${out}/restructure-${view}-${w}.png`, fullPage: view !== "panel-srb" && view !== "panel-own" && view !== "chatbot" && view !== "product-panel" });
      await page.close();
    }
  }
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
