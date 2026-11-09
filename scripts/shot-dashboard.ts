/**
 * Visual check of the Playbook dashboard over seeded sample rows (dev-only harness, 404 in production). Needs `next dev` running.
 *   PLAYWRIGHT_CORE=<path to playwright-core> npx tsx scripts/shot-dashboard.ts <outDir>
 */
import { createRequire } from "node:module";
const req = createRequire(import.meta.url ?? __filename);
const pw = req(process.env.PLAYWRIGHT_CORE ?? "playwright-core") as typeof import("playwright-core");
const out = process.argv[2] ?? "/tmp";
const base = process.env.BASE_URL ?? "http://localhost:3000";
(async () => {
  const browser = await pw.chromium.launch({ executablePath: process.env.CHROME_PATH ?? "/usr/bin/google-chrome", headless: true });
  for (const [name, path, w, h, dark] of [["wide", "/dev-editor-harness/dashboard?range=30&ref=1", 1440, 900, false], ["dark", "/dev-editor-harness/dashboard?range=90", 1440, 900, true], ["mobile", "/dev-editor-harness/dashboard?range=30", 390, 800, false], ["empty", "/dev-editor-harness/dashboard?empty=1", 1280, 800, false], ["cf", "/dev-editor-harness/cf-dashboard?range=30", 1440, 900, false], ["cf-mobile", "/dev-editor-harness/cf-dashboard?range=30", 390, 800, false], ["pb-filtered", "/dev-editor-harness/dashboard?range=90&type=document&source=library&q=offer", 1440, 900, false], ["cf-filtered", "/dev-editor-harness/cf-dashboard?range=custom&from=2026-10-01&to=2026-11-05&recipient=employee&status=signed", 1440, 900, false]] as const) {
    const page = await browser.newPage({ viewport: { width: w, height: h }, colorScheme: dark ? "dark" : "light" });
    await page.goto(`${base}${path}`, { waitUntil: "networkidle", timeout: 120000 });
    await page.waitForSelector("main, section", { timeout: 60000 });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${out}/dash-${name}.png`, fullPage: !name.endsWith("filtered") });
    console.log(name, "ok");
    await page.close();
  }
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
