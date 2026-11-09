/** Screenshot of the Playbook and ContractFlow sidebars from the dev-only harness (needs `next dev`). PLAYWRIGHT_CORE=<path> npx tsx scripts/shot-sidebars.ts <outDir> */
import { createRequire } from "node:module";
const req = createRequire(import.meta.url ?? __filename);
const pw = req(process.env.PLAYWRIGHT_CORE ?? "playwright-core") as typeof import("playwright-core");
(async () => {
  const browser = await pw.chromium.launch({ executablePath: process.env.CHROME_PATH ?? "/usr/bin/google-chrome", headless: true });
  const page = await browser.newPage({ viewport: { width: 1500, height: 700 } });
  await page.goto(`${process.env.BASE_URL ?? "http://localhost:3000"}/dev-editor-harness/sidebars`, { waitUntil: "networkidle", timeout: 120000 });
  await page.waitForSelector("nav", { timeout: 60000 });
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${process.argv[2] ?? "/tmp"}/sidebars.png`, fullPage: true });
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
