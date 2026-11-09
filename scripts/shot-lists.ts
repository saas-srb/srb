/**
 * Visual check of the list tables: opens the dev-only harness (src/app/dev-editor-harness/lists, 404 in production), screenshots the page at wide and
 * narrow widths and with a row menu open. Needs `next dev` running.   PLAYWRIGHT_CORE=<path> npx tsx scripts/shot-lists.ts <outDir>
 */
import { createRequire } from "node:module";
const req = createRequire(import.meta.url ?? __filename);
const pw = req(process.env.PLAYWRIGHT_CORE ?? "playwright-core") as typeof import("playwright-core");
const out = process.argv[2] ?? "/tmp";
(async () => {
  const browser = await pw.chromium.launch({ executablePath: process.env.CHROME_PATH ?? "/usr/bin/google-chrome", headless: true });
  for (const [w, h] of [[1280, 900], [700, 900], [390, 800]] as const) {
    const page = await browser.newPage({ viewport: { width: w, height: h } });
    await page.goto(`${process.env.BASE_URL ?? "http://localhost:3000"}/dev-editor-harness/lists`, { waitUntil: "networkidle", timeout: 120000 });
    await page.waitForSelector("table", { timeout: 60000 });
    await page.screenshot({ path: `${out}/lists-${w}.png` });
    if (w === 1280) {
      await page.getByRole("button", { name: /More actions for Employee Onboarding/ }).first().click();
      await page.waitForTimeout(400);
      await page.screenshot({ path: `${out}/lists-${w}-menu.png` });
      await page.keyboard.press("Escape");
      const focused = await page.evaluate(() => document.activeElement?.getAttribute("aria-label") ?? "");
      console.log("focus after Escape:", focused);
    }
    await page.close();
  }
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
