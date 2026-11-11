import { spawnSync } from "node:child_process";
import { cpSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

/**
 * `npm run check:functions`: counts the serverless functions Vercel would create, OFFLINE (no token, no Vercel API): the build runs in a temporary
 * copy of the project with a fake `.vercel/project.json`, then the distinct `.func` folders of `.vercel/output/functions` are counted (the other
 * entries are links to those). Vercel Hobby allows 12 per deployment; this fails above 10 to keep a margin. It also checks vercel.json has only
 * daily cron schedules (Hobby refuses anything more often). `--output <dir>` counts an existing build output instead of building.
 */
const LIMIT = 10;
const root = resolve(".");

function checkCrons(): string[] {
  const problems: string[] = [];
  const crons: { path: string; schedule: string }[] = JSON.parse(readFileSync(join(root, "vercel.json"), "utf8")).crons ?? [];
  for (const c of crons) {
    const f = c.schedule.trim().split(/\s+/);
    if (f.length !== 5 || !/^\d+$/.test(f[0]) || !/^\d+$/.test(f[1]) || f[2] !== "*" || f[3] !== "*" || f[4] !== "*") problems.push(`${c.path}: "${c.schedule}" is not a once-a-day schedule (Hobby accepts only those)`);
  }
  return problems;
}

function countFunctions(out: string): { count: number; names: string[] } {
  const names: string[] = [];
  const walk = (d: string) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (lstatSync(p).isSymbolicLink()) continue;
      if (e.isDirectory()) {
        if (e.name.endsWith(".func")) names.push(p.slice(out.length + 1));
        else walk(p);
      }
    }
  };
  walk(out);
  return { count: names.length, names };
}

function build(): string {
  const tmp = resolve(root, "..", `.fncount-${process.pid}`);
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(tmp);
  const skip = new Set(["node_modules", ".git", ".next", ".vercel", "desktop", "mobile", "local", "docs"]);
  for (const name of readdirSync(root)) {
    if (skip.has(name) || name.startsWith(".env") || name.endsWith(".tsbuildinfo")) continue;
    cpSync(join(root, name), join(tmp, name), { recursive: true });
  }
  spawnSync("cp", ["-al", join(root, "node_modules"), join(tmp, "node_modules")]); // hard links: no copy, no extra disk
  mkdirSync(join(tmp, ".vercel"));
  writeFileSync(join(tmp, ".vercel", "project.json"), JSON.stringify({ orgId: "team_local", projectId: "prj_local", settings: { framework: "nextjs", buildCommand: null, installCommand: null, outputDirectory: null, rootDirectory: null, nodeVersion: "22.x" } }));
  const env = { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "", MONGODB_URI: process.env.CHECK_FUNCTIONS_MONGODB_URI ?? "mongodb://127.0.0.1:27017/zz_throwaway_build", SAAS_HOSTS: "build.test", VERCEL: "1" };
  const r = spawnSync("npx", ["--yes", "vercel@65.14.0", "build", "--prod"], { cwd: tmp, env, stdio: "inherit" });
  if (r.status !== 0) {
    console.error("The offline build failed; see the output above.");
    rmSync(tmp, { recursive: true, force: true });
    process.exit(2);
  }
  return tmp;
}

const outArg = process.argv.indexOf("--output");
let tmp: string | null = null;
let out = outArg > 0 ? resolve(process.argv[outArg + 1]) : "";
if (!out) {
  tmp = build();
  out = join(tmp, ".vercel", "output");
}
const fnDir = join(out, "functions");
if (!existsSync(fnDir)) {
  console.error(`No functions folder at ${fnDir}`);
  process.exit(2);
}
const { count, names } = countFunctions(fnDir);
if (tmp) rmSync(tmp, { recursive: true, force: true });
const problems = checkCrons();
console.log(`Serverless functions Vercel would create: ${count} (Hobby limit 12, this check fails above ${LIMIT})`);
for (const n of names.sort()) console.log("  -", n);
for (const p of problems) console.error("CRON:", p);
if (count > LIMIT || problems.length) {
  console.error(count > LIMIT ? `FAIL: ${count} > ${LIMIT}` : "FAIL: cron schedules");
  process.exit(1);
}
console.log("OK");
