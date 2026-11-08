"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { net, nativeImage } = require("electron");
const store = require("./store.cjs");

/**
 * The company's identity, read from the workspace on every start (and every half hour): name, colours, icon, shortcuts.
 * Nothing about a company is built into this app. The last answer is kept so the app still opens with no connection.
 */
const FALLBACK = {
  version: "fallback",
  name: "Workspace",
  shortName: "Workspace",
  description: "",
  themeColor: "#4338ca",
  themeColorDark: "#0b1020",
  backgroundColor: "#ffffff",
  startUrl: "/workspace",
  shortcuts: [],
  icons: {},
};

async function fetchJson(url, timeoutMs = 8000) {
  const res = await net.fetch(url, { signal: AbortSignal.timeout(timeoutMs), headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function downloadIcon(brand) {
  const url = brand.icons && (brand.icons[512] || brand.icons[256] || brand.icons[128]);
  if (!url) return null;
  const dest = store.file(path.join("icons", `${brand.version}.png`));
  try {
    if (!fs.existsSync(dest)) {
      const res = await net.fetch(url, { signal: AbortSignal.timeout(10000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
      // Keep only the current icon.
      for (const f of fs.readdirSync(path.dirname(dest))) if (f !== path.basename(dest)) fs.rmSync(path.join(path.dirname(dest), f), { force: true });
    }
    const img = nativeImage.createFromPath(dest);
    return img.isEmpty() ? null : { path: dest, image: img };
  } catch (err) {
    console.error("[brand] icon download failed", err.message);
    return null;
  }
}

/** Fresh branding for `origin`, else the saved copy, else a neutral fallback. Never throws. */
async function loadBrand(origin) {
  let brand = null;
  try {
    brand = await fetchJson(`${origin}/api/desktop/branding`);
    if (brand && brand.app === "selfrun-desktop") store.writeJson("brand-cache.json", { origin, brand });
    else brand = null;
  } catch (err) {
    console.error("[brand] could not reach the workspace:", err.message);
  }
  if (!brand) {
    const cached = store.readJson("brand-cache.json", null);
    brand = cached && cached.origin === origin ? cached.brand : { ...FALLBACK };
  }
  const icon = await downloadIcon(brand);
  return { ...brand, icon };
}

module.exports = { loadBrand, fetchJson, FALLBACK };
