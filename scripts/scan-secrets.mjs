#!/usr/bin/env node
/**
 * Secret scanning (compliance: "Secret Scanning — detect accidentally exposed credentials and keys"). Looks through every file git tracks for
 * the shapes of real credentials and fails the build if one is found. Placeholders in the documentation are allowed (see ALLOW).
 *
 *   npm run security:scan
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";

const PATTERNS = [
  ["AWS access key", /AKIA[0-9A-Z]{16}/],
  ["GitHub token", /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{30,}\b/],
  ["GitHub fine-grained token", /github_pat_[A-Za-z0-9_]{30,}/],
  ["OpenAI-style key", /\bsk-(?:proj-|live-|test-)?[A-Za-z0-9_-]{32,}/],
  ["Private key", /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----(?:\\n|\s)*[A-Za-z0-9+\/=]{40,}/],
  ["Slack token", /\bxox[baprs]-[A-Za-z0-9-]{10,}/],
  ["Google API key", /\bAIza[0-9A-Za-z_-]{35}\b/],
  ["Stripe live key", /\b(?:sk|rk)_live_[0-9A-Za-z]{20,}/],
  ["Database URL with a password", /mongodb(?:\+srv)?:\/\/[^\s"'<>:@/]+:(?!YourPassword|<|\$|\{|password|PASSWORD|xxxx)[^\s"'<>@/]{6,}@/],
];
/** Files that legitimately hold example values. */
const ALLOW = [/^docs\//, /\.md$/, /^scripts\/scan-secrets\.mjs$/, /^\.env\.example$/];
const SKIP = /\.(png|jpe?g|webp|gif|ico|pdf|woff2?|ttf|zip|mp4|mp3)$|package-lock\.json$/;

const files = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }).split("\0").filter(Boolean);
const found = [];
for (const f of files) {
  if (SKIP.test(f) || ALLOW.some((a) => a.test(f)) || !fs.existsSync(f)) continue;
  let text;
  try { text = fs.readFileSync(f, "utf8"); } catch { continue; }
  text.split("\n").forEach((line, i) => {
    for (const [name, re] of PATTERNS) if (re.test(line)) found.push(`${f}:${i + 1}  ${name}`);
  });
}
if (found.length) {
  console.error(`✗ ${found.length} possible secret(s) in tracked files:\n  ${found.join("\n  ")}\n\nRemove them, rotate the credential, and keep real values in the host's environment variables only.`);
  process.exit(1);
}
console.log(`✓ No secrets found in ${files.length} tracked files.`);
