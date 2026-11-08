#!/usr/bin/env node
/**
 * Builds the Android or iOS app of ONE company: a native shell (Capacitor) that opens the company's own app address, named, iconed
 * and coloured as the company. Every image and colour comes from the workspace's generated asset pack, so nothing is built in; the
 * content is the live workspace, so the app is always current.
 *
 *   node scripts/build-company-mobile.mjs --origin https://acme-app.selfrunbusiness.com --platform android --version 1.0.3 --out dist-mobile
 *
 * android: writes <Name>-<version>-android.apk (debug-signed, installs on any device that allows unknown apps) and the Android Studio
 *          project ZIP (open it, sign with your own key, publish to Google Play).
 * ios:     writes the Xcode project ZIP (open it, choose your Apple Developer team, archive and submit to the App Store); iOS apps
 *          can't be installed without Apple signing, so the project is the deliverable.
 * Options: --no-build (android: make the project and ZIP but skip Gradle, e.g. when there is no Android SDK).
 * Android builds need JDK 21+ (Capacitor 8) and the Android SDK; iOS projects need macOS.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import JSZip from "jszip";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const opt = (n) => { const i = args.indexOf(`--${n}`); return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : undefined; };
const fail = (m) => { console.error(`✗ ${m}`); process.exit(1); };
const run = (cmd, a, cwd) => { const r = spawnSync(cmd, a, { cwd, stdio: "inherit", shell: process.platform === "win32" }); if (r.status !== 0) fail(`${cmd} ${a.join(" ")} failed.`); };

const origin = (opt("origin") ?? fail("Give --origin <the company's app address>.")).replace(/\/+$/, "");
const platform = opt("platform") ?? fail("Give --platform android or ios.");
if (!["android", "ios"].includes(platform)) fail('--platform must be "android" or "ios".');
const version = opt("version") || "1.0.0";
const out = path.resolve(opt("out") || path.join(root, "dist-mobile"));
const noBuild = args.includes("--no-build");

const getJson = async (u) => { const r = await fetch(u, { signal: AbortSignal.timeout(20000) }); if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); };
const brand = await getJson(`${origin}/api/desktop/branding`).catch((e) => fail(`Couldn't read the workspace (${e.message}).`));
if (brand.app !== "selfrun-desktop") fail("That address is not a SelfRun workspace.");

const host = new URL(brand.origin || origin).hostname;
const slug = host.replace(/^app\./, "").replace(/-app(\.|$)/, "$1").replace(/\..*$/, "").replace(/[^a-z0-9]/g, "") || "workspace";
// The app's identity is the company's own, never the platform's.
const appId = `app.${/^[a-z]/.test(slug) ? slug : `c${slug}`}.mobile`;
const appName = brand.name.replace(/[<>&"']/g, "").trim().slice(0, 30) || "Workspace";
const fileBase = `${appName.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "") || "App"}-${version}`;
console.log(`Company: ${brand.name}\nAddress: ${brand.origin || origin}\nApp:     ${appName} (${appId}) v${version} for ${platform}`);

const work = path.join(root, "work", `${slug}-${platform}`);
fs.rmSync(work, { recursive: true, force: true });
fs.mkdirSync(path.join(work, "www"), { recursive: true });
fs.mkdirSync(out, { recursive: true });

// 1. the generated asset pack of this company (icons for every density, splash, colours)
const packRes = await fetch(`${brand.origin || origin}/api/apps/assets/pack/${platform}`, { signal: AbortSignal.timeout(120000) });
if (!packRes.ok) fail(`Couldn't download the asset pack (HTTP ${packRes.status}).`);
const pack = await JSZip.loadAsync(Buffer.from(await packRes.arrayBuffer()));
console.log(`✓ Asset pack (${Object.keys(pack.files).length} files)`);

// 2. the shell project
fs.writeFileSync(path.join(work, "package.json"), JSON.stringify({ name: `${slug}-${platform}`, version, private: true, dependencies: { "@capacitor/core": "^8.5.2", "@capacitor/android": "^8.5.2", "@capacitor/ios": "^8.5.2" }, devDependencies: { "@capacitor/cli": "^8.5.2" } }, null, 2));
fs.writeFileSync(path.join(work, "www", "index.html"), `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${appName}</title><body style="margin:0;display:flex;min-height:100vh;align-items:center;justify-content:center;background:${brand.backgroundColor};color:${brand.themeColor};font:600 18px system-ui,sans-serif">${appName}</body>`);
fs.writeFileSync(path.join(work, "capacitor.config.json"), JSON.stringify({
  appId,
  appName,
  webDir: "www",
  server: { url: brand.origin || origin, cleartext: (brand.origin || origin).startsWith("http://"), allowNavigation: [host] },
  // The user agent tells the workspace it is inside the app, so its pages are not drawn under the status bar and the navigation bar.
  android: { backgroundColor: brand.backgroundColor, appendUserAgent: "WorkspaceNative" },
  ios: { backgroundColor: brand.backgroundColor, contentInset: "always", appendUserAgent: "WorkspaceNative" },
  // Android 15 draws apps edge to edge: `native` keeps the page inside the system bars (the page asks for no viewport-fit=cover).
  plugins: { SystemBars: { insetsHandling: "native" } },
}, null, 2));
// Link this project to the Capacitor installed here (no second download of the native libraries).
fs.symlinkSync(path.join(root, "node_modules"), path.join(work, "node_modules"), "junction");

const cap = path.join(root, "node_modules", ".bin", process.platform === "win32" ? "cap.cmd" : "cap");
run(cap, ["add", platform], work);

// 3. put the company's assets into the project
const write = async (rel, to) => {
  const f = pack.file(rel);
  if (!f) return;
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.writeFileSync(to, await f.async("nodebuffer"));
};
if (platform === "android") {
  const res = path.join(work, "android", "app", "src", "main", "res");
  for (const name of Object.keys(pack.files).filter((n) => n.startsWith("res/") && !pack.files[n].dir)) await write(name, path.join(res, name.slice(4)));
  // Capacitor's default adaptive icon and splash images: remove them so ours (colour + mipmap foreground, one splash) are the ones used.
  for (const d of ["drawable-v24/ic_launcher_foreground.xml", "drawable/ic_launcher_background.xml"]) fs.rmSync(path.join(res, d), { force: true });
  for (const d of fs.readdirSync(res).filter((n) => /^drawable-(land|port)-/.test(n))) fs.rmSync(path.join(res, d, "splash.png"), { force: true });
  const gradle = path.join(work, "android", "app", "build.gradle");
  let g = fs.readFileSync(gradle, "utf8");
  const code = version.split(".").reduce((n, p) => n * 100 + (parseInt(p, 10) || 0), 0) || 1;
  g = g.replace(/versionCode\s+\d+/, `versionCode ${code}`).replace(/versionName\s+"[^"]*"/, `versionName "${version}"`);
  fs.writeFileSync(gradle, g);
} else {
  const set = path.join(work, "ios", "App", "App", "Assets.xcassets", "AppIcon.appiconset");
  for (const name of Object.keys(pack.files).filter((n) => n.startsWith("AppIcon.appiconset/") && !pack.files[n].dir)) await write(name, path.join(set, name.slice("AppIcon.appiconset/".length)));
  fs.rmSync(path.join(set, "AppIcon-512@2x.png"), { force: true }); // the stock icon, no longer referenced
  // The launch image: every file the stock Splash image set lists becomes the company's splash.
  const splashSet = path.join(work, "ios", "App", "App", "Assets.xcassets", "Splash.imageset");
  const splash = pack.file("LaunchScreen/splash-2732.png");
  if (splash && fs.existsSync(path.join(splashSet, "Contents.json"))) {
    const data = await splash.async("nodebuffer");
    for (const im of JSON.parse(fs.readFileSync(path.join(splashSet, "Contents.json"), "utf8")).images ?? []) if (im.filename) fs.writeFileSync(path.join(splashSet, im.filename), data);
  }
  const pbx = path.join(work, "ios", "App", "App.xcodeproj", "project.pbxproj");
  const build = version.split(".").reduce((n, p) => n * 100 + (parseInt(p, 10) || 0), 0) || 1;
  fs.writeFileSync(pbx, fs.readFileSync(pbx, "utf8").replace(/MARKETING_VERSION = [^;]+;/g, `MARKETING_VERSION = ${version};`).replace(/CURRENT_PROJECT_VERSION = [^;]+;/g, `CURRENT_PROJECT_VERSION = ${build};`));
}
console.log("✓ Company assets applied");

// 4. outputs
const zipFolder = async (dir, dest, skip) => {
  const z = new JSZip();
  const walk = (d, rel = "") => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (skip.some((s) => r === s || r.startsWith(`${s}/`) || e.name === s)) continue;
      if (e.isDirectory()) walk(path.join(d, e.name), r);
      else if (e.isFile()) z.file(`${fileBase}-${platform}-project/${r}`, fs.readFileSync(path.join(d, e.name)), { unixPermissions: fs.statSync(path.join(d, e.name)).mode & 0o777 });
    }
  };
  walk(dir);
  fs.writeFileSync(dest, await z.generateAsync({ type: "nodebuffer", compression: "DEFLATE", platform: "UNIX" }));
};
// The project folder is self-contained: capacitor.config.json at its root keeps the company's address and name.
fs.cpSync(path.join(work, "capacitor.config.json"), path.join(work, platform, "capacitor.config.json"));

if (platform === "android") {
  if (!noBuild) {
    const gradlew = path.join(work, "android", process.platform === "win32" ? "gradlew.bat" : "gradlew");
    run(gradlew, ["assembleDebug", "--no-daemon"], path.join(work, "android"));
    const apk = path.join(work, "android", "app", "build", "outputs", "apk", "debug", "app-debug.apk");
    if (!fs.existsSync(apk)) fail("Gradle finished but no APK was produced.");
    fs.copyFileSync(apk, path.join(out, `${fileBase}-android.apk`));
    console.log(`✓ ${fileBase}-android.apk`);
  }
  await zipFolder(path.join(work, "android"), path.join(out, `${fileBase}-android-studio-project.zip`), ["build", ".gradle", "local.properties", ".idea", "captures"]);
  console.log(`✓ ${fileBase}-android-studio-project.zip`);
} else {
  await zipFolder(path.join(work, "ios"), path.join(out, `${fileBase}-ios-xcode-project.zip`), ["Pods", "build", "DerivedData", "xcuserdata"]);
  console.log(`✓ ${fileBase}-ios-xcode-project.zip`);
}
console.log(`\nDone. Files are in ${out}`);
