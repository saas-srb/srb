import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { CRON_JOBS, vercelCrons } from "../src/lib/cron/registry";
import { isValidCron, intervalMs } from "../src/lib/cron/schedule";

// Pure file checks: no database. Run with: npx tsx scripts/test-cron-registry.ts
const t = (name: string, fn: () => void) => { fn(); console.log("  ✓", name); };
const routeFiles = (dir: string, out: string[] = []): string[] => {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) routeFiles(p, out);
    else if (f === "route.ts") out.push(p);
  }
  return out;
};
const routes = routeFiles("src/app").map((file) => ({ file, text: readFileSync(file, "utf8") }));
// `src/app/(products)/api/x/route.ts` is served at `/api/x`: route groups in parentheses are not part of the URL.
const urlOf = (file: string) => "/" + file.replace(/^src\/app\//, "").replace(/\/route\.ts$/, "").split("/").filter((s) => !/^\(.*\)$/.test(s)).join("/");

t("keys, paths and schedules are unique and valid", () => {
  assert.equal(new Set(CRON_JOBS.map((j) => j.key)).size, CRON_JOBS.length);
  assert.equal(new Set(CRON_JOBS.map((j) => j.path)).size, CRON_JOBS.length);
  for (const j of CRON_JOBS) assert.ok(isValidCron(j.schedule), `${j.key}: ${j.schedule}`);
});
t("vercel.json holds exactly the registry's crons", () => {
  assert.deepEqual(JSON.parse(readFileSync("vercel.json", "utf8")).crons, vercelCrons());
});
t("every job has a route that runs it, with a matching time limit", () => {
  for (const j of CRON_JOBS) {
    const hit = routes.find((r) => urlOf(r.file) === j.path);
    assert.ok(hit, `${j.key}: no route at ${j.path}`);
    assert.ok(hit.text.includes(`cronRoute("${j.key}"`), `${j.key}: ${hit.file} does not run this job`);
    const m = /export const maxDuration = (\d+);/.exec(hit.text);
    assert.equal(Number(m?.[1]), j.maxDurationSec, `${j.key}: maxDuration in ${hit.file} must be ${j.maxDurationSec}`);
  }
});
t("no cron route exists that the registry does not know", () => {
  const known = new Set(CRON_JOBS.map((j) => j.key));
  for (const r of routes) for (const m of r.text.matchAll(/cronRoute\("([^"]+)"/g)) assert.ok(known.has(m[1]), `${r.file} runs unregistered job ${m[1]}`);
});
t("every job has a runner", () => {
  const jobs = readFileSync("src/lib/cron/jobs.ts", "utf8");
  for (const j of CRON_JOBS) assert.ok(new RegExp(`(^|\\n)\\s*("${j.key}"|${j.key}):`).test(jobs), `${j.key} has no runner in jobs.ts`);
});
t("frequent jobs are flagged (Vercel Hobby only accepts daily schedules)", () => {
  for (const j of CRON_JOBS) assert.equal(!!j.frequent, (intervalMs(j.schedule) ?? 0) < 86_400_000, `${j.key}: 'frequent' must match its schedule`);
});
t("the security gate lets every cron path through as a machine endpoint (bearer only)", () => {
  const gate = readFileSync("src/lib/security/gate.ts", "utf8");
  const re = /\\\/cron\$\|\^\\\/api\\\/wallet\\\/expiry-sweep\$/;
  assert.ok(re.test(gate), "the gate still lists /cron and the wallet sweep as machine endpoints");
  for (const j of CRON_JOBS) assert.ok(/\/cron$/.test(j.path) || j.path === "/api/wallet/expiry-sweep", `${j.key}: the gate does not know ${j.path}`);
});
t("no old product paths are scheduled", () => {
  for (const j of CRON_JOBS) assert.ok(existsSync(".") && !/^\/api\/(sop|seo|dlms|smms|ots|hrms|pms|prms|tms|fms|lms|cms)\//.test(j.path), `${j.key} uses an old path ${j.path}`);
});
console.log("cron registry tests passed");
