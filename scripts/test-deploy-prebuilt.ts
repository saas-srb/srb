import assert from "node:assert/strict";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

// Logic of scripts/deploy-prebuilt.sh with STUBS for npm/npx (nothing is built or uploaded, no real token). Run: npx tsx scripts/test-deploy-prebuilt.ts
let n = 0;
const t = (name: string, fn: () => void) => { fn(); n++; console.log("  ✓", name); };

function run(env: Record<string, string>, args: string[] = [], failOn?: string) {
  const dir = mkdtempSync(join(tmpdir(), "deploy-stub-"));
  const log = join(dir, "calls.log");
  mkdirSync(join(dir, "bin"));
  for (const bin of ["npm", "npx"]) {
    writeFileSync(join(dir, "bin", bin), `#!/usr/bin/env bash\necho "${bin} $*" >> "${log}"\n${failOn ? `case "$*" in *"${failOn}"*) exit 1;; esac` : ""}\nexit 0\n`);
    chmodSync(join(dir, "bin", bin), 0o755);
  }
  const r = spawnSync("bash", ["scripts/deploy-prebuilt.sh", ...args], { env: { PATH: `${join(dir, "bin")}:/usr/bin:/bin`, HOME: dir, ...env }, encoding: "utf8" });
  let calls: string[] = [];
  try { calls = readFileSync(log, "utf8").trim().split("\n"); } catch { /* none */ }
  return { status: r.status, out: `${r.stdout}${r.stderr}`, calls };
}
const full = { VERCEL_TOKEN: "tok_secret_value", VERCEL_ORG_ID: "team_x", VERCEL_PROJECT_ID: "prj_x" };

t("refuses to run when a required value is missing, names it, and runs nothing", () => {
  for (const k of Object.keys(full)) {
    const { [k]: _omit, ...rest } = full as Record<string, string>;
    void _omit;
    const r = run(rest);
    assert.equal(r.status, 2);
    assert.match(r.out, new RegExp(`Missing ${k}`));
    assert.deepEqual(r.calls, []);
  }
});
t("full run: type-check, pull, build, function check, then deploy (in that order)", () => {
  const r = run(full);
  assert.equal(r.status, 0, r.out);
  const joined = r.calls.join("\n");
  const order = ["typecheck", "pull --yes --environment=production", "build --prod", "check-functions.ts --output .vercel/output", "deploy --prebuilt --prod"].map((s) => joined.indexOf(s));
  assert.ok(order.every((i) => i >= 0), joined);
  assert.deepEqual([...order].sort((a, b) => a - b), order);
});
t("--dry stops after the build and the checks: nothing is deployed", () => {
  const r = run(full, ["--dry"]);
  assert.equal(r.status, 0);
  assert.ok(!r.calls.join("\n").includes("deploy"));
  assert.match(r.out, /dry run/);
});
t("a failing step stops the run before the next one (type errors never reach the build or the upload)", () => {
  const r = run(full, [], "typecheck");
  assert.notEqual(r.status, 0);
  assert.deepEqual(r.calls.length, 1);
  const r2 = run(full, [], "check-functions");
  assert.notEqual(r2.status, 0);
  assert.ok(!r2.calls.join("\n").includes("deploy --prebuilt"));
});
t("the token is never printed or put on a command line", () => {
  const r = run(full);
  assert.ok(!r.out.includes("tok_secret_value"));
  assert.ok(!r.calls.join("\n").includes("tok_secret_value"));
});
t("an unknown option is refused", () => assert.equal(run(full, ["--now"]).status, 2));
console.log(`\n${n} passed`);
