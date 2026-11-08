#!/usr/bin/env node
/**
 * One command to build the SelfRun apps for every platform, with the checks each one needs.
 *
 *   npm run build:linux                                   # desktop app: AppImage + .deb   (build on Linux)
 *   npm run build:windows                                 # desktop app: NSIS installer    (build on Windows)
 *   npm run build:macos                                   # desktop app: .dmg + .zip       (build on a Mac)
 *   npm run build:android -- --origin https://acme-app.selfrunbusiness.com
 *   npm run build:ios     -- --origin https://acme-app.selfrunbusiness.com
 *   npm run build:apps -- --origin <app address>          # everything this computer can build
 *   npm run apps:check                                    # what this computer can build, and what is missing
 *
 * Every build is an app that opens straight on its workspace, with no "Connect your workspace" screen. Each company gets its own app:
 * give --origin (the company's app address, such as https://app.selfrunbusiness.com or http://app.localhost:3000) or --address
 * (a workspace name or domain) and the app is built with that company's name and icon. With neither, the app opens on the platform's
 * own app address: SELFRUN_APP_ORIGIN, default https://app.selfrunbusiness.com.
 * Add --generic for the one app that asks "Connect your workspace" on first start (desktop only).
 *
 * Options: --origin <https://…>  --address <name or domain>  --generic  --version <x.y.z>  --no-build (android: project + ZIP only)  --dir (desktop: unpacked app only, a quick check)
 * Output:  desktop/dist (generic desktop)   desktop/dist-company/<name> (company desktop)   mobile/dist-mobile (Android, iOS)
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const desktop = path.join(root, "desktop");
const mobile = path.join(root, "mobile");
const [cmd = "help", ...rest] = process.argv.slice(2);
const opt = (n) => { const i = rest.indexOf(`--${n}`); return i >= 0 && rest[i + 1] && !rest[i + 1].startsWith("--") ? rest[i + 1] : undefined; };
const flag = (n) => rest.includes(`--${n}`);
const win = process.platform === "win32";
const OS = { linux: process.platform === "linux", windows: win, macos: process.platform === "darwin" };
const origin = opt("origin") || process.env.SELFRUN_ORIGIN;
/** Where an app built without a company points: the platform's own app. */
const DEFAULT_APP_ORIGIN = (process.env.SELFRUN_APP_ORIGIN || "https://app.selfrunbusiness.com").replace(/\/+$/, "");
const address = opt("address");
const version = opt("version");

const log = (m) => console.log(m);
const fail = (m) => { console.error(`\n✗ ${m}\n`); process.exit(1); };
const run = (c, a, cwd, env = {}) => {
  log(`\n$ ${c} ${a.join(" ")}   (in ${path.relative(root, cwd) || "."})`);
  const r = spawnSync(c, a, { cwd, stdio: "inherit", shell: win, env: { ...process.env, ...env } });
  if (r.status !== 0) fail(`"${c} ${a.join(" ")}" failed (exit ${r.status}).`);
};
const has = (c, a = ["--version"]) => spawnSync(c, a, { shell: win, stdio: "ignore" }).status === 0;
const sdk = () => process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || (fs.existsSync(path.join(os.homedir(), "Android", "Sdk")) ? path.join(os.homedir(), "Android", "Sdk") : "");
const majorOf = (bin) => { const r = spawnSync(bin, ["-version"], { shell: win, encoding: "utf8" }); const m = `${r.stderr}${r.stdout}`.match(/version "(\d+)/); return m ? Number(m[1]) : 0; };
const javaMajor = () => majorOf("java");
/** Android apps (Capacitor 8) compile with Java 21. Use the JDK on PATH if it is 21+, otherwise look for an installed JDK 21+ and point the build at it. */
const JDK_MIN = 21;
function findJdk() {
  const onPath = javaMajor();
  if (onPath >= JDK_MIN) return { home: process.env.JAVA_HOME || "", major: onPath };
  const dirs = [process.env.JAVA_HOME, ...["/usr/lib/jvm", "/Library/Java/JavaVirtualMachines", "C:\\Program Files\\Java", "C:\\Program Files\\Eclipse Adoptium", "C:\\Program Files\\Microsoft"].flatMap((d) => (fs.existsSync(d) ? fs.readdirSync(d).map((n) => path.join(d, n, process.platform === "darwin" ? "Contents/Home" : "")) : []))];
  for (const home of dirs.filter(Boolean)) {
    const bin = path.join(home, "bin", win ? "java.exe" : "java");
    if (fs.existsSync(bin)) { const m = majorOf(bin); if (m >= JDK_MIN) return { home, major: m }; }
  }
  return { home: "", major: onPath };
}
const nodeMajor = Number(process.versions.node.split(".")[0]);

function install(dir) {
  if (!fs.existsSync(path.join(dir, "node_modules"))) run("npm", ["install", "--no-audit", "--no-fund"], dir);
}

function checks() {
  const j = findJdk().major;
  const s = sdk();
  const row = (name, ok, need) => log(`${ok ? "✓" : "✗"} ${name.padEnd(9)} ${ok ? "ready" : need}`);
  log(`Node ${process.versions.node} on ${process.platform}${nodeMajor < 22 ? "   (the apps' build needs Node 22 or newer)" : ""}\n`);
  row("Linux", OS.linux, "build this on a Linux computer");
  row("Windows", OS.windows, "build this on Windows (Linux needs Wine; macOS needs Wine too)");
  row("macOS", OS.macos, "build this on a Mac (macOS apps cannot be built elsewhere)");
  row("Android", j >= JDK_MIN && !!s, `needs JDK ${JDK_MIN}+ (found ${j || "none"}; Ubuntu: sudo apt install openjdk-21-jdk) and the Android SDK (ANDROID_HOME ${s ? "= " + s : "not set"}); or use --no-build for the project ZIP only`);
  row("iOS", OS.macos, "needs a Mac with Xcode (the project ZIP can only be made on macOS)");
  return { android: j >= JDK_MIN && !!s };
}

function desktopBuild(target) {
  if (nodeMajor < 22) fail(`Node ${process.versions.node} is too old: the desktop build needs Node 22 or newer.`);
  const wrongHost = { linux: !OS.linux, windows: !OS.windows, macos: !OS.macos }[target];
  if (wrongHost) {
    const why = { linux: "Linux apps are built on Linux", windows: "Windows installers are built on Windows (Linux needs Wine)", macos: "macOS apps can only be built on a Mac" }[target];
    fail(`${why}. This computer is ${process.platform}. Run this command on the right computer, or use the "Desktop apps" GitHub workflow.`);
  }
  install(desktop);
  const flagFor = { linux: "--linux", windows: "--win", macos: "--mac" }[target];
  if (origin || address) {
    // A company's own app: name, icon and address built in.
    const a = ["scripts/build-company.mjs", ...(origin ? ["--origin", origin] : ["--address", address]), "--platform", { linux: "linux", windows: "win", macos: "mac" }[target]];
    if (version) a.push("--version", version);
    if (flag("dir")) a.push("--dir");
    run("node", a, desktop);
    log(`\n✓ Done. Installers are in desktop/dist-company/`);
  } else {
    const a = ["electron-builder", flagFor, "--publish", "never"];
    if (flag("dir")) a.push("--dir");
    if (version) a.push(`--config.extraMetadata.version=${version}`);
    // The app opens straight on its workspace: the address is written into brand.json, which the build packs. --generic leaves it out.
    const brand = path.join(desktop, "brand.json");
    const previous = fs.existsSync(brand) ? fs.readFileSync(brand, "utf8") : null;
    if (flag("generic")) fs.rmSync(brand, { force: true });
    else {
      fs.writeFileSync(brand, JSON.stringify({ address: DEFAULT_APP_ORIGIN, appId: "com.selfrun.desktop", built: new Date().toISOString() }, null, 2));
      log(`App address built in: ${DEFAULT_APP_ORIGIN}`);
    }
    try { run("npx", a, desktop, { CSC_IDENTITY_AUTO_DISCOVERY: "false" }); }
    finally { if (previous !== null) fs.writeFileSync(brand, previous); else fs.rmSync(brand, { force: true }); }
    log(`\n✓ Done. The app is in desktop/dist/`);
  }
}

function mobileBuild(platform) {
  if (nodeMajor < 22) fail(`Node ${process.versions.node} is too old: the mobile build needs Node 22 or newer.`);
  const appOrigin = origin || DEFAULT_APP_ORIGIN;
  if (platform === "ios" && !OS.macos) fail("The iOS project is built on a Mac (it needs Xcode and CocoaPods). This computer is " + process.platform + ".");
  if (platform === "android" && !flag("no-build")) {
    const jdk = findJdk();
    if (jdk.major < JDK_MIN) fail(`Android builds need JDK ${JDK_MIN} or newer (found ${jdk.major || "none"}). Install one (Ubuntu: sudo apt install openjdk-21-jdk), or add --no-build to make only the Android Studio project ZIP.`);
    if (!sdk()) fail("The Android SDK was not found. Install Android Studio, then set ANDROID_HOME (for example ~/Android/Sdk), or add --no-build to make only the project ZIP.");
  }
  install(mobile);
  const a = ["scripts/build-company-mobile.mjs", "--origin", appOrigin, "--platform", platform, "--out", "dist-mobile"];
  if (version) a.push("--version", version);
  if (flag("no-build")) a.push("--no-build");
  const jdk = platform === "android" && !flag("no-build") ? findJdk() : { home: "" };
  const env = platform === "android" ? { ...(sdk() ? { ANDROID_HOME: sdk(), ANDROID_SDK_ROOT: sdk() } : {}), ...(jdk.home ? { JAVA_HOME: jdk.home, PATH: `${path.join(jdk.home, "bin")}${path.delimiter}${process.env.PATH}` } : {}) } : {};
  if (env.JAVA_HOME) log(`Using JDK at ${env.JAVA_HOME}`);
  run("node", a, mobile, env);
  log(`\n✓ Done. Files are in mobile/dist-mobile/`);
}

switch (cmd) {
  case "check": checks(); break;
  case "install": install(desktop); install(mobile); log("✓ Dependencies installed for desktop and mobile."); break;
  case "linux": case "windows": case "macos": desktopBuild(cmd); break;
  case "android": case "ios": mobileBuild(cmd); break;
  case "desktop": desktopBuild(OS.linux ? "linux" : OS.windows ? "windows" : "macos"); break;
  case "all": {
    const c = checks();
    const ran = [];
    desktopBuild(OS.linux ? "linux" : OS.windows ? "windows" : "macos"); ran.push("desktop");
    if (c.android || flag("no-build")) { mobileBuild("android"); ran.push("android"); } else log("\n– Android skipped (JDK 21 + Android SDK needed, or pass --no-build).");
    if (OS.macos) { mobileBuild("ios"); ran.push("ios"); } else log("\n– iOS skipped (needs a Mac).");
    log(`\n✓ Built: ${ran.join(", ")}.`);
    break;
  }
  default:
    log(fs.readFileSync(fileURLToPath(import.meta.url), "utf8").split("*/")[0].replace(/^#!.*\n/, "").replace(/^\/\*\*\n/, "").replace(/^ \* ?/gm, ""));
}
