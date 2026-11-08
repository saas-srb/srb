/**
 * End-to-end check that each company's public SEO surface uses ITS OWN site
 * origin (`companySiteUrl()`): /sitemap.xml, /robots.txt, and a page's
 * <link rel="canonical"> / og:url.
 *
 *   OWNER_BASE_URL=https://example.com \
 *   OWNER_SITE_URL=https://example.com \
 *   TENANT_BASE_URL=https://acme.example.com \
 *   TENANT_SITE_URL=https://acme.example.com \
 *   PAGE_PATH=/offers \
 *     node scripts/e2e/site-url.e2e.mjs
 *
 * *_BASE_URL = where to reach the host (e.g. http://acme.localhost:3000 locally);
 * *_SITE_URL = the origin its URLs must use (defaults to the base URL).
 * PAGE_PATH  = a public page that sets a canonical and/or og:url (default /offers).
 */

import assert from "node:assert/strict";
import { chromium } from "playwright";

const hosts = [
  { label: "owner", base: process.env.OWNER_BASE_URL, site: process.env.OWNER_SITE_URL },
  { label: "tenant", base: process.env.TENANT_BASE_URL, site: process.env.TENANT_SITE_URL },
].map((h) => ({ ...h, base: h.base?.replace(/\/$/, ""), site: (h.site || h.base)?.replace(/\/$/, "") }));
const PAGE_PATH = process.env.PAGE_PATH || "/offers";

if (hosts.some((h) => !h.base)) {
  console.error("Set OWNER_BASE_URL and TENANT_BASE_URL (and optionally OWNER_SITE_URL / TENANT_SITE_URL, PAGE_PATH).");
  process.exit(1);
}
assert.notEqual(hosts[0].site, hosts[1].site, "owner and tenant must have different site origins");

let passed = 0;
const failures = [];
async function check(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failures.push(name);
    console.log(`  ✗ ${name}\n      ${err instanceof Error ? err.message : String(err)}`);
  }
}

const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  // Fetch through a real page: the browser resolves *.localhost, Node's request client doesn't.
  const fetchText = async (url) => {
    const p = await context.newPage();
    try {
      const res = await p.goto(url);
      const status = res.status();
      const body = await res.text();
      return { status: () => status, text: async () => body };
    } finally {
      await p.close();
    }
  };
  for (const h of hosts) {
    const other = hosts.find((x) => x !== h).site;
    console.log(`${h.label} (${h.base} → ${h.site})`);

    await check("sitemap.xml lists only this company's own URLs", async () => {
      const res = await fetchText(`${h.base}/sitemap.xml`);
      assert.equal(res.status(), 200);
      const locs = [...(await res.text()).matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
      assert.ok(locs.length > 0, "no <loc> entries");
      const foreign = locs.filter((l) => !l.startsWith(`${h.site}/`) && l !== h.site);
      assert.deepEqual(foreign, [], `URLs not on ${h.site}`);
      assert.ok(!locs.some((l) => l.startsWith(`${other}/`)), `sitemap lists the other company's site ${other}`);
    });

    await check("robots.txt points at this company's own sitemap", async () => {
      const res = await fetchText(`${h.base}/robots.txt`);
      assert.equal(res.status(), 200);
      const sitemaps = [...(await res.text()).matchAll(/^Sitemap:\s*(\S+)/gim)].map((m) => m[1]);
      assert.ok(sitemaps.length > 0, "no Sitemap: line");
      // The owner's historical file uses the www. host; accept it or the bare origin.
      const ok = (u) => u.startsWith(`${h.site}/`) || u.startsWith(h.site.replace("://", "://www.") + "/");
      assert.ok(sitemaps.every(ok), `Sitemap lines ${sitemaps.join(", ")} not on ${h.site}`);
    });

    await check(`${PAGE_PATH}: canonical / og:url use this company's origin`, async () => {
      const page = await context.newPage();
      try {
        const res = await page.goto(`${h.base}${PAGE_PATH}`, { waitUntil: "domcontentloaded" });
        assert.ok(res && res.status() < 400, `HTTP ${res?.status()}`);
        const canonical = await page.locator('link[rel="canonical"]').first().getAttribute("href").catch(() => null);
        const ogUrl = await page.locator('meta[property="og:url"]').first().getAttribute("content").catch(() => null);
        assert.ok(canonical || ogUrl, "page has neither a canonical link nor og:url");
        for (const [name, v] of [["canonical", canonical], ["og:url", ogUrl]]) {
          if (!v) continue;
          assert.ok(v.startsWith(`${h.site}/`) || v === h.site, `${name} ${v} not on ${h.site}`);
        }
        const ld = await page.locator('script[type="application/ld+json"]').allTextContents();
        assert.ok(!ld.some((t) => t.includes(`${other}/`)), `JSON-LD mentions the other company's site ${other}`);
      } finally {
        await page.close();
      }
    });
  }
} finally {
  await browser.close();
}

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) process.exit(1);
