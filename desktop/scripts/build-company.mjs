#!/usr/bin/env node
/**
 * Builds the desktop installers for ONE company, named and iconed as that company: its name, icon and address are read from its
 * workspace (the same settings as its mobile app: Workspace → Settings → Mobile app). The built app is still branded from the
 * server every time it starts, so later changes of colours, shortcuts or the name appear without a new installer; only the
 * installer's own file name, the Start-menu/Applications name and the icon on disk are fixed at build time.
 *
 *   npm run build:company -- --address acme                       # a workspace on the platform domain
 *   npm run build:company -- --address acme.com                   # a company's own domain (app.acme.com)
 *   npm run build:company -- --address acme --platform mac,win,linux
 *   npm run build:company -- --origin https://acme-app.selfrunbusiness.com
 *
 * Options: --root-domain <domain> (default selfrunbusiness.com), --platform mac|win|linux (comma separated; default: this computer),
 *          --out <folder> (default dist-company/<slug>), --version <x.y.z>, --dir (only the unpacked app folder, no installer: quick check).
 * Note: Windows installers build on Windows (or Linux with Wine), macOS ones on a Mac, Linux ones on Linux.
 */
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { candidates, DEFAULT_ROOT } = require("../src/address.cjs");
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));

const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(`--${name}`); return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : undefined; };
const fail = (m) => { console.error(`✗ ${m}`); process.exit(1); };

async function getJson(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(15000), headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

const rootDomain = opt("root-domain") || DEFAULT_ROOT;
let origin = opt("origin")?.replace(/\/+$/, "");
let brand = null;
if (origin) {
  brand = await getJson(`${origin}/api/desktop/branding`).catch((e) => fail(`Couldn't read ${origin}/api/desktop/branding (${e.message}).`));
} else {
  const input = opt("address") ?? fail("Give --address <name or domain> (or --origin <https://…>).");
  for (const c of candidates(input, rootDomain)) {
    try {
      const b = await getJson(`${c}/api/desktop/branding`);
      if (b.app === "selfrun-desktop") { origin = c; brand = b; break; }
    } catch { /* try the next one */ }
  }
  if (!brand) fail(`No SelfRun workspace answered for "${input}". Check the address and that the workspace is online.`);
}
if (brand.app !== "selfrun-desktop") fail("That address is not a SelfRun workspace.");

const host = new URL(brand.origin || origin).hostname;
const slug = host.replace(/^app\./, "").replace(/-app(\.|$)/, "$1").replace(/\..*$/, "").replace(/[^a-z0-9-]/g, "") || "workspace";
const productName = brand.name.replace(/[\\/:*?"<>|]/g, "").trim().slice(0, 60) || "Workspace";
// The app's identity is the company's own, never the platform's: its id comes from the company's address.
const appId = `app.${/^[a-z]/.test(slug.replace(/-/g, "")) ? slug.replace(/-/g, "") : `c${slug.replace(/-/g, "")}`}.desktop`;
const out = path.resolve(opt("out") || path.join(root, "dist-company", slug));
const buildDir = path.join(root, "build", `company-${slug}`);

console.log(`Company: ${brand.name}`);
console.log(`Address: ${brand.origin || origin}`);
console.log(`Product: ${productName}  (${appId})`);

fs.mkdirSync(buildDir, { recursive: true });
const iconUrl = brand.icons?.["512"] || brand.icons?.["256"];
if (!iconUrl) fail("The workspace has no icon yet. Set one in Workspace → Settings → Mobile app (or Branding).");
const iconRes = await fetch(iconUrl, { signal: AbortSignal.timeout(20000) });
if (!iconRes.ok) fail(`Couldn't download the icon (HTTP ${iconRes.status}).`);
fs.writeFileSync(path.join(buildDir, "icon.png"), Buffer.from(await iconRes.arrayBuffer()));
console.log("✓ Icon downloaded");

// Only the workspace address is built in. Everything visible is read from the server at run time.
const brandJson = path.join(root, "brand.json");
fs.writeFileSync(brandJson, JSON.stringify({ address: brand.origin || origin, rootDomain, appId, built: new Date().toISOString() }, null, 2));

const base = pkg.build;
const config = {
  ...base,
  appId,
  productName,
  copyright: `© ${new Date().getFullYear()} ${productName}`,
  artifactName: `${productName.replace(/\s+/g, "-")}-\${version}-\${os}-\${arch}.\${ext}`,
  directories: { ...base.directories, output: out, buildResources: buildDir },
  extraMetadata: { name: `${slug}-desktop`, desktopName: `${slug}-desktop.desktop`, author: { name: productName, email: `noreply@${host.replace(/^app\./, "")}` }, homepage: brand.origin || origin, productName, description: brand.description || `${productName} desktop app`, version: opt("version") || pkg.version },
  linux: { ...base.linux, executableName: `${slug}-desktop`, icon: path.join(buildDir, "icon.png"), maintainer: `${productName} <noreply@${host.replace(/^app\./, "")}>`, vendor: productName },
  nsis: { ...base.nsis, shortcutName: productName, uninstallDisplayName: productName },
};
const cfgFile = path.join(buildDir, "electron-builder.json");
fs.writeFileSync(cfgFile, JSON.stringify(config, null, 2));

const platforms = (opt("platform") || { darwin: "mac", win32: "win", linux: "linux" }[process.platform]).split(",");
const flags = platforms.map((p) => ({ mac: "--mac", win: "--win", linux: "--linux" })[p] ?? fail(`Unknown platform "${p}" (use mac, win or linux).`));
const bin = path.join(root, "node_modules", ".bin", process.platform === "win32" ? "electron-builder.cmd" : "electron-builder");
if (!fs.existsSync(bin)) fail("Run `npm install` in the desktop folder first.");

console.log(`Building ${platforms.join(", ")} …`);
const run = spawnSync(bin, ["--config", cfgFile, "--publish", "never", ...flags, ...(args.includes("--dir") ? ["--dir"] : [])], { cwd: root, stdio: "inherit", shell: process.platform === "win32" });
fs.rmSync(brandJson, { force: true });
if (run.status !== 0) fail("electron-builder failed (see the output above).");
console.log(`\n✓ Done. Installers are in ${out}`);
