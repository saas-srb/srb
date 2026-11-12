import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

/**
 * `npm run check:build-memory`: builds the app under Vercel-like limits (scripts/measure-build.sh: 7.5 GB with no swap, 2 CPU cores, VERCEL=1) and fails when it
 * is killed or its peak anonymous memory is above the threshold. A pre-push check (takes several minutes; Linux with systemd user sessions).
 *   BUILD_MEMORY_MAX_MB=6000 (default 6500)   BUILD_MEMORY_MAX_MINUTES=25 (default)   BUILD_MEMORY_EXTRA="--webpack"
 */
export interface Summary { exitCode: string; totalSeconds: number; peakAnonMb: number }

export function parseSummary(text: string): Summary {
  const exit = /exit code: (\S+)/.exec(text)?.[1] ?? "unknown";
  const total = Number(/total: (\d+)s/.exec(text)?.[1] ?? NaN);
  const peak = Number(/peak anonymous memory: (\d+) MB/.exec(text)?.[1] ?? NaN);
  return { exitCode: exit, totalSeconds: total, peakAnonMb: peak };
}

export function verdict(s: Summary, limits: { maxMb: number; maxMinutes: number }): string[] {
  const problems: string[] = [];
  if (s.exitCode !== "0") problems.push(`the build failed or was killed (exit code ${s.exitCode}; 137/killed means out of memory)`);
  if (!Number.isFinite(s.peakAnonMb)) problems.push("no memory reading was produced");
  else if (s.peakAnonMb > limits.maxMb) problems.push(`peak memory ${s.peakAnonMb} MB is above the limit of ${limits.maxMb} MB`);
  if (Number.isFinite(s.totalSeconds) && s.totalSeconds > limits.maxMinutes * 60) problems.push(`the build took ${Math.round(s.totalSeconds / 60)} min, limit ${limits.maxMinutes} min`);
  return problems;
}

if (process.argv[1]?.endsWith("check-build-memory.ts")) {
  const maxMb = Number(process.env.BUILD_MEMORY_MAX_MB ?? 6500);
  const maxMinutes = Number(process.env.BUILD_MEMORY_MAX_MINUTES ?? 25);
  const out = "/tmp/buildmem-check";
  const extra = (process.env.BUILD_MEMORY_EXTRA ?? "").split(" ").filter(Boolean);
  const r = spawnSync("bash", ["scripts/measure-build.sh", "--label", "check", ...(extra.length ? ["--", ...extra] : [])], { stdio: "inherit", env: { ...process.env, BUILD_MEMORY_OUT: out } });
  let summary: Summary;
  try { summary = parseSummary(readFileSync(`${out}/summary.txt`, "utf8")); } catch { summary = { exitCode: String(r.status), totalSeconds: NaN, peakAnonMb: NaN }; }
  const problems = verdict(summary, { maxMb, maxMinutes });
  if (problems.length) { console.error(`\nFAIL:\n - ${problems.join("\n - ")}`); process.exit(1); }
  console.log(`\nOK: peak ${summary.peakAnonMb} MB (limit ${maxMb}), ${Math.round(summary.totalSeconds / 60)} min (limit ${maxMinutes})`);
}
