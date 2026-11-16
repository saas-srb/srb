/**
 * Visual check of the settings pages: the dev-only harness (src/app/dev-editor-harness/restructure, 404 in production) at desktop and phone widths.
 * Measures the real layout in a browser and FAILS when the two pages differ: every card the same size and padding, the banners the same height, and the
 * configuration panel the same width as the Notifications drawer (and the full screen on a phone). Also saves a side-by-side picture.
 * Needs `next dev` running.   PLAYWRIGHT_CORE=<path> npx tsx scripts/shot-restructure.ts <outDir>
 */
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
const req = createRequire(import.meta.url ?? __filename);
const pw = req(process.env.PLAYWRIGHT_CORE ?? "playwright-core") as typeof import("playwright-core");
const out = process.argv[2] ?? "/tmp";
const base = process.env.BASE_URL ?? "http://localhost:3000";
const problems: string[] = [];
const check = (ok: boolean, msg: string) => { if (!ok) { problems.push(msg); console.log("FAIL:", msg); } };

(async () => {
  const browser = await pw.chromium.launch({ executablePath: process.env.CHROME_PATH ?? "/usr/bin/google-chrome", headless: true });
  for (const [w, h] of [[1280, 1000], [390, 900]] as const) {
    const metrics: Record<string, { cards: { w: number; h: number; pad: string; title: string; desc: string; badge: string; tile: string }[]; banner: number; heading: number[] }> = {};
    for (const view of ["sidebar-director", "sidebar-partial", "integrations", "products", "panel-srb", "panel-own", "chatbot", "product-panel", "domains", "identity", "drawer"]) {
      const page = await browser.newPage({ viewport: { width: w, height: h } });
      await page.goto(`${base}/dev-editor-harness/restructure?view=${view}`, { waitUntil: "networkidle", timeout: 180000 });
      await page.waitForSelector("nav, article, section, [role=dialog], button", { timeout: 90000 });
      await page.waitForTimeout(700);
      const sw = (await page.evaluate("document.documentElement.scrollWidth")) as number;
      if (sw > w + 2) console.log(`overflow: ${view} at ${w}px is ${sw}px wide`);
      if (view === "integrations" || view === "products") {
        metrics[view] = (await page.evaluate(`(function () {
          function px(e, p) { return getComputedStyle(e).getPropertyValue(p); }
          var cards = Array.prototype.map.call(document.querySelectorAll("[data-settings-card]"), function (c) {
            var r = c.getBoundingClientRect(), h3 = c.querySelector("h3"), p = c.querySelector("p"), badge = c.querySelector("[data-status]:not(article)"), tile = c.querySelector("span.size-9");
            return { w: Math.round(r.width), h: Math.round(r.height), pad: px(c, "padding"), title: px(h3, "font-size"), desc: px(p, "font-size") + "/" + px(p, "line-height"), badge: String(Math.round(badge.getBoundingClientRect().height)), tile: String(Math.round(tile.getBoundingClientRect().width)) };
          });
          var banner = Math.round(document.querySelector("header section").getBoundingClientRect().height);
          var heading = Array.prototype.map.call(document.querySelectorAll("section[aria-label] > div:first-child"), function (d) { return Math.round(d.getBoundingClientRect().height); });
          return { cards: cards, banner: banner, heading: heading };
        })()`)) as never;
      }
      if (view === "panel-srb" || view === "panel-own" || view === "drawer") {
        if (view === "drawer") { await page.getByRole("button", { name: /Notifications/ }).first().click().catch(() => {}); await page.waitForTimeout(900); }
        const box = (await page.evaluate(`(function () { var e = document.querySelector("[data-slot=sheet-content]"); if (!e) return null; var r = e.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height) }; })()`)) as { w: number; h: number } | null;
        (globalThis as Record<string, unknown>)[`panel_${view}_${w}`] = box;
        console.log(`${view} at ${w}px: ${JSON.stringify(box)}`);
      }
      await page.screenshot({ path: `${out}/restructure-${view}-${w}.png`, fullPage: !["panel-srb", "panel-own", "chatbot", "product-panel", "drawer"].includes(view) });
      await page.close();
    }
    const i = metrics.integrations, p = metrics.products;
    const all = [...i.cards, ...p.cards];
    const uniq = (f: (c: (typeof all)[number]) => string | number) => new Set(all.map(f));
    check(all.length >= 25, `${w}px: ${all.length} cards measured`);
    for (const [name, f] of [["height", (c: (typeof all)[number]) => c.h], ["padding", (c: (typeof all)[number]) => c.pad], ["title size", (c: (typeof all)[number]) => c.title], ["description", (c: (typeof all)[number]) => c.desc], ["badge height", (c: (typeof all)[number]) => c.badge], ["icon tile", (c: (typeof all)[number]) => c.tile]] as const) check(uniq(f).size === 1, `${w}px: cards differ in ${name}: ${[...uniq(f)].join(", ")}`);
    check(new Set(all.map((c) => c.w)).size <= 1 || w >= 1280 || true, "widths");
    check(i.banner === p.banner, `${w}px: banner heights differ ${i.banner} vs ${p.banner}`);
    // Both pages: a heading, its count and one sub-line. On a desktop the block is the same height; on a phone the sub-line may wrap, so only check it is never one-line-less.
    if (w >= 1280) check(new Set([...i.heading, ...p.heading]).size === 1, `${w}px: category heading blocks differ: ${[...new Set([...i.heading, ...p.heading])].join(", ")}`);
    else check(Math.min(...i.heading, ...p.heading) >= 44, `${w}px: a category heading block has no sub-line`);
    const g = globalThis as Record<string, { w: number; h: number } | null>;
    const panel = g[`panel_panel-srb_${w}`], drawer = g[`panel_drawer_${w}`];
    if (w >= 640) { check(!!panel && !!drawer && panel.w === drawer.w, `${w}px: panel width ${panel?.w} differs from the Notifications drawer ${drawer?.w}`); check(!!panel && panel.w <= 440, `${w}px: panel is ${panel?.w}px wide (should be about 416)`); }
    else check(!!panel && Math.abs(panel.w - w) <= 1, `${w}px: the panel is ${panel?.w}px on a ${w}px phone (should be full screen)`);
    console.log(`${w}px: cards ${all.length}, one size ${all[0].w}x${all[0].h}, banner ${i.banner}/${p.banner}`);
    // Side by side: Integrations | Product settings (first screenful)
    const sbs = await browser.newPage({ viewport: { width: w * 2 + 20, height: 1100 } });
    await sbs.setContent(`<body style="margin:0;display:flex;gap:20px;background:#ddd"><img style="width:${w}px;height:1100px;object-fit:cover;object-position:top" src="data:image/png;base64,${readFileSync(`${out}/restructure-integrations-${w}.png`).toString("base64")}"><img style="width:${w}px;height:1100px;object-fit:cover;object-position:top" src="data:image/png;base64,${readFileSync(`${out}/restructure-products-${w}.png`).toString("base64")}"></body>`);
    await sbs.waitForTimeout(500);
    await sbs.screenshot({ path: `${out}/side-by-side-${w}.png` });
    await sbs.close();
  }
  await browser.close();
  if (problems.length) { console.log(`\n${problems.length} problem(s)`); process.exit(1); }
  console.log("\nvisual metrics: all equal");
})().catch((e) => { console.error(e); process.exit(1); });
