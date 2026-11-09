/**
 * Visual check of the shared editor: opens the dev-only harness page (src/app/dev-editor-harness, 404 in production) with a catalogue template
 * and saves screenshots of the first, a middle and the last sheet at 1280 and 1920 wide (tall viewport so a whole sheet is visible). Needs `next dev` running.
 *   npx tsx scripts/shot-editor.ts [templateId] [outDir]
 * Uses Playwright from PLAYWRIGHT_CORE (path) or `playwright-core` if installed, and the system Chrome (CHROME_PATH or /usr/bin/google-chrome).
 */
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";

const req = createRequire(import.meta.url ?? __filename);
const pw = req(process.env.PLAYWRIGHT_CORE ?? "playwright-core") as typeof import("playwright-core");
const base = process.env.BASE_URL ?? "http://localhost:3000";
const tpl = process.argv[2] ?? "ct.msa";
const out = process.argv[3] ?? "/tmp";

(async () => {
  mkdirSync(out, { recursive: true });
  const browser = await pw.chromium.launch({ executablePath: process.env.CHROME_PATH ?? "/usr/bin/google-chrome", headless: true });
  for (const [w, h] of (process.env.SIZES ? process.env.SIZES.split(",").map((s) => s.split("x").map(Number) as [number, number]) : [[1280, 1300], [1920, 1300]]) as readonly (readonly [number, number])[] as const) {
    const page = await browser.newPage({ viewport: { width: w, height: h } });
    if (process.env.RIGHT) await page.addInitScript(() => sessionStorage.setItem("pb-panel:harness:open", "1"));
    await page.goto(`${base}/dev-editor-harness?t=${encodeURIComponent(tpl)}`, { waitUntil: "networkidle", timeout: 120000 });
    await page.waitForSelector(".pb-sheet", { timeout: 60000 });
    await page.waitForTimeout(2500);
    const n = await page.locator(".pb-sheet").count();
    const geo = await page.evaluate(() => {
      const s = document.querySelector(".pb-sheet")!.getBoundingClientRect();
      const o = document.querySelector(".pb-sheets-outer")!.getBoundingClientRect();
      return { sheet: [s.left, s.width, s.height], outer: [o.left, o.width] };
    });
    console.log(`${w}x${h}: ${n} sheets`, JSON.stringify(geo));
    for (const [label, i] of [["first", 0], ["middle", Math.floor((n - 1) / 2)], ["last", n - 1]] as const) {
      await page.locator(".pb-sheet").nth(i).scrollIntoViewIfNeeded();
      await page.waitForTimeout(400);
      await page.screenshot({ path: `${out}/editor-${tpl}-${w}-${label}.png` });
    }
    await page.close();
  }
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
