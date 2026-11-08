#!/usr/bin/env node
/**
 * Used by the build workflow after electron-builder: uploads this platform's installers to a GitHub release (in the public
 * releases repository, so the company's people can download them without a GitHub account) and reports the download links to the
 * platform. Needs: GH_TOKEN (can create releases in RELEASES_REPO), RELEASES_REPO (`owner/repo`), BUILD_ID, PLATFORM, DIST.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { report } from "./ci-report.mjs";

const { RELEASES_REPO, BUILD_ID, PLATFORM, DIST } = process.env;
const fail = async (m) => {
  console.error(`✗ ${m}`);
  await report("failed", { error: m });
  process.exit(1);
};
if (!RELEASES_REPO || !DIST || !PLATFORM) await fail("Missing RELEASES_REPO, DIST or PLATFORM.");

const WANT = { win: [/\.exe$/i], mac: [/\.dmg$/i], linux: [/\.AppImage$/i, /\.deb$/i], android: [/\.apk$/i, /android-studio-project\.zip$/i], ios: [/xcode-project\.zip$/i] }[PLATFORM];
if (!WANT) { console.error(`Unknown platform ${PLATFORM}`); process.exit(1); }
const files = fs.existsSync(DIST) ? fs.readdirSync(DIST).filter((f) => WANT.some((re) => re.test(f))).map((f) => path.join(DIST, f)) : [];
if (files.length === 0) await fail(`No installer found in ${DIST} for ${PLATFORM}.`);

const tag = `build-${(BUILD_ID || Date.now().toString(36)).slice(0, 8)}`;
const gh = (args) => spawnSync("gh", args, { encoding: "utf8" });
// The release may already exist (the other platforms create it too).
gh(["release", "create", tag, "--repo", RELEASES_REPO, "--title", tag, "--notes", "Desktop app build"]);
const up = gh(["release", "upload", tag, ...files, "--repo", RELEASES_REPO, "--clobber"]);
if (up.status !== 0) await fail(`Upload failed: ${(up.stderr || up.stdout).slice(0, 200)}`);

const view = gh(["release", "view", tag, "--repo", RELEASES_REPO, "--json", "assets"]);
if (view.status !== 0) await fail("Could not read the release back.");
const wanted = new Set(files.map((f) => path.basename(f).replace(/ /g, ".")));
const assets = JSON.parse(view.stdout).assets.filter((a) => wanted.has(a.name));
if (assets.length === 0) await fail("The uploaded files are not on the release.");

await report("ready", { files: assets.map((a) => ({ name: a.name, url: a.url, size: a.size })) });
console.log(`✓ Published ${assets.map((a) => a.name).join(", ")}`);
