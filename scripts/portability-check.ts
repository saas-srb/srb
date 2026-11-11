import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { MongoClient } from "mongodb";

/**
 * `npm run portability:check`: proves a deployment with ONLY MONGODB_URI and SAAS_HOSTS can open an existing database.
 * Needs PORTABILITY_MONGODB_URI pointing at a THROWAWAY database (its name must contain "zz_throwaway" or "portability"); it creates
 * and drops three small databases next to it and never reads .env.local. Each step runs in a child process with a clean environment.
 */
const base = process.env.PORTABILITY_MONGODB_URI;
if (!base) {
  console.error("Set PORTABILITY_MONGODB_URI to a throwaway database, e.g. mongodb://127.0.0.1:27017/zz_throwaway_portability");
  process.exit(2);
}
const m = /^(mongodb(?:\+srv)?:\/\/[^/]+)\/([^?]+)(\?.*)?$/.exec(base);
if (!m || !/zz_throwaway|portability/i.test(m[2])) {
  console.error("Refusing: the database name must contain 'zz_throwaway' or 'portability'.");
  process.exit(2);
}
if (process.env.MONGODB_URI && process.env.MONGODB_URI === base) {
  console.error("Refusing: PORTABILITY_MONGODB_URI equals MONGODB_URI.");
  process.exit(2);
}
const withDb = (name: string) => `${m[1]}/${name}${m[3] ?? ""}`;
const names = { main: m[2], fresh: `${m[2]}_fresh`, orphan: `${m[2]}_orphan` };

const hosts = "portability.test,www.portability.test";
const results: { name: string; ok: boolean; detail: string }[] = [];

function run(phase: string, db: string, extra: Record<string, string> = {}) {
  // A CLEAN environment: only PATH/HOME plus what this step is allowed to have.
  const env: Record<string, string> = { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "", MONGODB_URI: withDb(db), SAAS_HOSTS: hosts, ...extra };
  const r = spawnSync("npx", ["--yes", "tsx", "--require", "./scripts/lib/next-server-shims.cjs", "scripts/portability-child.ts", phase], { env, encoding: "utf8", timeout: 120_000 });
  for (const line of (r.stdout ?? "").split("\n")) {
    try {
      const j = JSON.parse(line);
      if (typeof j.name === "string") results.push(j);
    } catch {
      /* not a result line */
    }
  }
  if (r.status !== 0 && !(r.stdout ?? "").includes('"ok"')) results.push({ name: `step ${phase}`, ok: false, detail: (r.stderr ?? "").slice(-300) });
}

(async () => {
  const client = await new MongoClient(base).connect();
  for (const n of Object.values(names)) await client.db(n).dropDatabase();
  const key = randomBytes(32).toString("base64");
  const hrms = randomBytes(32).toString("base64");
  run("seed", names.main, { PLATFORM_ENCRYPTION_KEY: key, CRON_SECRET: "old-secret", SAAS_ADMIN_EMAIL: "owner@portability.test", SAAS_ADMIN_PASSWORD: "portability-pass-1", OPENAI_API_KEY: "sk-test-openai-1234", BLOB_READ_WRITE_TOKEN: "vercel_blob_rw_test_9999", RESEND_API_KEY: "re_test_key_5555", GITHUB_DISPATCH_TOKEN: "gh-token-xyz", DESKTOP_BUILD_SECRET: "desktop-secret-123", HRMS_ENCRYPTION_KEY: hrms, VERCEL_PROJECT_ID: "prj_old" });
  run("verify", names.main);
  run("fresh", names.fresh);
  await client.db(names.orphan).collection("companies").insertOne({ _id: "c1", slug: "acme" } as never);
  run("orphan", names.orphan);
  for (const n of Object.values(names)) await client.db(n).dropDatabase();
  await client.close();
  for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}${r.ok || !r.detail ? "" : `: ${r.detail}`}`);
  const failed = results.filter((r) => !r.ok).length;
  console.log(failed || !results.length ? `\n${failed || "no checks ran"} FAILED` : `\nAll ${results.length} checks passed`);
  process.exit(failed || !results.length ? 1 : 0);
})();
