/**
 * The previous Vercel project is kept automatically when the project changes (so the next move needs no token paste), on a throwaway database.
 * Vercel is never contacted (VERCEL_API_URL points nowhere).
 *   MONGODB_URI=mongodb://127.0.0.1:27017/zz_throwaway_prev_$(date +%s) \
 *     npx --yes tsx --require ./scripts/lib/next-server-shims.cjs scripts/test-previous-project.ts
 */
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";

if (!/zz_throwaway/.test(process.env.MONGODB_URI ?? "")) { console.error("MONGODB_URI must name a throwaway database"); process.exit(2); }
process.env.PLATFORM_ENCRYPTION_KEY = randomBytes(32).toString("base64");
process.env.VERCEL_API_URL = "http://127.0.0.1:1";
for (const k of ["VERCEL", "VERCEL_PROJECT_ID", "VERCEL_TEAM_ID", "VERCEL_API_TOKEN", "DOMAIN_PROVIDER"]) delete process.env[k];
(((globalThis as unknown as { __keyring: { loaded: unknown } }).__keyring ??= { loaded: null }).loaded) = { state: "unavailable", keys: [], action: null, message: null, at: Date.now() + 1e12 };

let passed = 0;
const failures: string[] = [];
async function check(name: string, fn: () => Promise<void>) {
  try { await fn(); passed++; console.log("  ✓", name); } catch (e) { failures.push(name); console.log("  ✗", name, "\n   ", e instanceof Error ? e.message : e); }
}

(async () => {
  const { clientPromise } = await import("../src/lib/mongodb");
  const integ = await import("../src/lib/platform/integrations");
  const store = await import("../src/lib/platform/integrations/store");
  const resolve = await import("../src/lib/platform/integrations/resolve");
  const run = await import("../src/lib/platform/domains/sync/run");
  const db = (await clientPromise).db();
  await db.dropDatabase();
  const input = (token: string, projectId: string, teamId: string) => ({ email: { provider: "" as const, apiKey: "", clearApiKey: false, from: "" }, domains: { provider: "vercel" as const, token, clearToken: false, projectId, teamId, rootDomain: "" } });
  const prev = async () => resolve.previousVercelConfigFrom(await store.loadIntegrationsDoc());

  await check("first configuration: nothing is 'previous' yet", async () => {
    assert.deepEqual(await integ.saveIntegrations(input("tok_account_one_1111", "prj_one", "team_one"), "tester"), { ok: true });
    assert.equal((await integ.getPreviousProjectView()).saved, false);
  });

  await check("moving to another project in the Console keeps the project being LEFT as 'previous' automatically (token, project, team)", async () => {
    assert.deepEqual(await integ.saveIntegrations(input("tok_account_two_2222", "prj_two", "team_two"), "tester"), { ok: true });
    const p = await prev();
    assert.deepEqual(p, { token: "tok_account_one_1111", project: "prj_one", team: "team_one" });
    const view = await integ.getPreviousProjectView();
    assert.ok(view.saved && view.projectId === "prj_one" && view.tokenLast4 === "1111");
    assert.ok(!JSON.stringify(view).includes("tok_account_one"), "the view never carries the token");
  });

  await check("an existing previous project is not overwritten by a later change", async () => {
    await integ.saveIntegrations(input("tok_account_three_3333", "prj_three", "team_three"), "tester");
    assert.equal((await prev())?.project, "prj_one");
  });

  await check("'Remove the previous token now' clears it", async () => {
    assert.deepEqual(await integ.savePreviousProject({ token: "", projectId: "", teamId: "", clear: true }, "tester"), { ok: true });
    assert.equal(await prev(), null);
  });

  await check("a deployment that boots on a DIFFERENT project keeps the saved credentials as 'previous' (no manual paste), only when none is saved", async () => {
    await db.collection("platform_settings").updateOne({ _id: "domain_sync_state" as never }, { $set: { lastProjectId: "prj_three" } }, { upsert: true });
    process.env.VERCEL = "1";
    process.env.VERCEL_PROJECT_ID = "prj_boot";
    process.env.VERCEL_API_TOKEN = "tok_env_new_account_9999";
    store.bustIntegrationsCache();
    await run.maybeSyncOnProjectChange();
    const p = await prev();
    assert.deepEqual(p, { token: "tok_account_three_3333", project: "prj_three", team: "team_three" });
    // calling again changes nothing
    await run.maybeSyncOnProjectChange();
    assert.equal((await prev())?.project, "prj_three");
    await new Promise((r) => setTimeout(r, 500)); // let the (unreachable-Vercel) background run give up
  });

  await check("a deployment on the same project as last synced leaves things alone", async () => {
    await integ.savePreviousProject({ token: "", projectId: "", teamId: "", clear: true }, "tester");
    await db.collection("platform_settings").updateOne({ _id: "domain_sync_state" as never }, { $set: { lastProjectId: "prj_boot" } });
    store.bustIntegrationsCache();
    await run.maybeSyncOnProjectChange();
    assert.equal(await prev(), null);
  });

  await db.dropDatabase();
  (await clientPromise).close();
  console.log(`\n${passed} passed${failures.length ? `, ${failures.length} failed: ${failures.join("; ")}` : ""}`);
  process.exit(failures.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
