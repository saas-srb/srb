/** Visual check of the micro-level matrix (CyberVault): step 2 searched and expanded, and step 3 preview, at desktop and phone widths. Needs `next dev`.
 *  PLAYWRIGHT_CORE=<path> npx tsx scripts/shot-micro.ts <outDir> */
import { createRequire } from "node:module";
const req = createRequire(import.meta.url ?? __filename);
const pw = req(process.env.PLAYWRIGHT_CORE ?? "playwright-core") as typeof import("playwright-core");
const out = process.argv[2] ?? "/tmp";
const base = process.env.BASE_URL ?? "http://localhost:3000";
(async () => {
  const browser = await pw.chromium.launch({ executablePath: process.env.CHROME_PATH ?? "/usr/bin/google-chrome", headless: true });
  for (const [w, h] of [[1280, 1000], [390, 900]] as const) {
    const page = await browser.newPage({ viewport: { width: w, height: h } });
    await page.goto(`${base}/dev-editor-harness/people?view=step2`, { waitUntil: "networkidle", timeout: 180000 });
    const search = page.locator('[aria-label="Search products and features"]');
    await search.waitFor({ timeout: 90000 });
    await search.fill("cybervault");
    await page.waitForTimeout(800);
    const sw = await page.evaluate(() => document.documentElement.scrollWidth);
    if (sw > w + 2) console.log(`overflow: step2 at ${w}px is ${sw}px wide`);
    await page.screenshot({ path: `${out}/micro-step2-${w}.png`, fullPage: true });
    await page.goto(`${base}/dev-editor-harness/people?view=step3`, { waitUntil: "networkidle", timeout: 180000 });
    await page.waitForSelector("text=Seats", { timeout: 90000 });
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${out}/micro-step3-${w}.png`, fullPage: true });
    await page.close();
  }
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
