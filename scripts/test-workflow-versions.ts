/**
 * Automation version history: every change adds a version, any earlier one can be put back (as a new version), versions go with the
 * automation, and another company never sees them. Throwaway database.
 *
 *   MONGODB_URI=mongodb://127.0.0.1:27017/wfv_test_$(date +%s) \
 *     npx --yes tsx --require ./scripts/lib/next-server-shims.cjs scripts/test-workflow-versions.ts
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { clientPromise, getPlatformDb } from "@/lib/platform/tenancy/platform-db";
import { runAsCompany } from "@/lib/platform/tenancy/context";
import { listPlans } from "@/lib/platform/billing/plans";
import { createWorkflow, deleteWorkflow, getWorkflow, setWorkflowEnabled, updateWorkflow } from "@/lib/platform/workflows";
import { listWorkflowVersions, restoreWorkflowVersion } from "@/lib/platform/workflows/versions";

let passed = 0;
async function check(name: string, fn: () => Promise<void> | void) {
  await fn();
  passed++;
  console.log(`  ✓ ${name}`);
}
const input = (name: string, subject: string) => ({ name, enabled: true, trigger: "lead.created", conditions: [], actions: [{ type: "email", to: "owner@alpha.test", subject, body: "Hello" }] });

async function main() {
  const pdb = await getPlatformDb();
  if (!/test/.test(pdb.databaseName)) throw new Error(`Refusing to run against "${pdb.databaseName}"`);
  await listPlans();
  const A = randomUUID();
  const B = randomUUID();
  const now = new Date();
  await pdb.collection("companies").insertMany([
    { _id: A as never, slug: "alpha", name: "Alpha", status: "active", isPlatformOwner: false, createdAt: now, updatedAt: now },
    { _id: B as never, slug: "beta", name: "Beta", status: "active", isPlatformOwner: false, createdAt: now, updatedAt: now },
  ]);
  const inA = <T,>(fn: () => Promise<T>) => runAsCompany(A, fn);
  let id = "";

  await check("creating, editing and switching off each add a numbered version, newest first, with who and why", async () => {
    const c = await inA(() => createWorkflow(input("New lead", "First subject"), "u1", "boss@alpha.test"));
    assert.ok(c.ok, c.ok ? "" : c.error);
    if (!c.ok) return;
    id = c.workflow.id;
    assert.ok((await inA(() => updateWorkflow(id, input("New lead", "Second subject"), "boss@alpha.test"))).ok);
    assert.ok(await inA(() => setWorkflowEnabled(id, false, "boss@alpha.test")));
    const v = await inA(() => listWorkflowVersions(id));
    assert.deepEqual(v.map((x) => [x.version, x.reason, x.current]), [[3, "turned_off", true], [2, "edited", false], [1, "created", false]]);
    assert.equal(v[0].by, "boss@alpha.test");
    assert.equal(v[0].enabled, false);
    assert.equal(v[2].enabled, true);
  });
  await check("an earlier version can be put back, becomes the newest version, and nothing is lost", async () => {
    const before = await inA(() => listWorkflowVersions(id));
    const firstId = before.find((x) => x.version === 1)!.id;
    assert.equal(await inA(() => restoreWorkflowVersion(id, firstId, "boss@alpha.test")), null);
    const now = await inA(() => getWorkflow(id));
    assert.equal((now!.actions[0] as { subject: string }).subject, "First subject");
    assert.equal(now!.enabled, true);
    const v = await inA(() => listWorkflowVersions(id));
    assert.deepEqual(v.map((x) => x.version), [4, 3, 2, 1]);
    assert.deepEqual([v[0].reason, v[0].note], ["restored", "Back to version 1"]);
  });
  await check("a version of another automation or company can't be restored", async () => {
    const v = await inA(() => listWorkflowVersions(id));
    assert.match((await runAsCompany(B, () => restoreWorkflowVersion(id, v[0].id, "x"))) ?? "", /no longer exists/);
    assert.deepEqual(await runAsCompany(B, () => listWorkflowVersions(id)), []);
    assert.match((await inA(() => restoreWorkflowVersion("other-id", v[0].id, "x"))) ?? "", /no longer exists/);
  });
  await check("deleting the automation deletes its versions", async () => {
    assert.ok(await inA(() => deleteWorkflow(id)));
    assert.deepEqual(await inA(() => listWorkflowVersions(id)), []);
  });

  console.log(`${passed} checks passed`);
  await (await clientPromise).db().dropDatabase();
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
