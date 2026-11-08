/**
 * Backups, restore, deleting all data and deleting the company (30 days): history, downloads that are the stored file, a restore that really
 * goes back, accounts kept, other companies untouched, the multi-step confirmation, and the daily job. A throwaway database and an in-memory
 * file store; nothing leaves the machine.
 *
 *   PLATFORM_ENCRYPTION_KEY=$(openssl rand -base64 32) MONGODB_URI=mongodb://127.0.0.1:27017/backups_test_$(date +%s) \
 *     npx --yes tsx --require ./scripts/lib/next-server-shims.cjs scripts/test-backups.ts
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { ObjectId } from "mongodb";
import { clientPromise, getPlatformDb } from "@/lib/platform/tenancy/platform-db";
import { runAsCompany } from "@/lib/platform/tenancy/context";
import { getDb } from "@/lib/mongodb";
import { listPlans } from "@/lib/platform/billing/plans";
import { getEntitlements } from "@/lib/platform/billing/entitlements";
import { isBillingLimitError } from "@/lib/platform/billing/enforce";
import { hashPassword } from "@/lib/lms-auth";
import { KEEP_MANUAL, backupBuffer, backupFile, createBackup, listBackups, useBackupStorage, type BackupStorage } from "@/lib/products/commandos/backups";
import { cancelCompanyDeletion, listDataEvents, listRestores, restoreBackup, runLifecycleJobs, scheduleCompanyDeletion, wipeCompanyData } from "@/lib/products/commandos/data-lifecycle";
import { consumeChallenge, startChallenge } from "@/lib/products/commandos/danger";

let passed = 0;
async function check(name: string, fn: () => Promise<void> | void) {
  await fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

const files = new Map<string, Buffer>();
const fake: BackupStorage = {
  async put(k, b) { files.set(k, Buffer.from(b)); },
  async get(k) { const b = files.get(k); return b ? { stream: new Response(new Uint8Array(b)).body! } : null; },
  async read(k) { return files.get(k) ?? null; },
  async del(k) { files.delete(k); },
};

async function main() {
  const pdb = await getPlatformDb();
  if (!/test/.test(pdb.databaseName)) throw new Error(`Refusing to run against "${pdb.databaseName}"`);
  process.env.EMAIL_PROVIDER = "console";
  useBackupStorage(fake);
  await listPlans();

  const A = randomUUID();
  const B = randomUUID();
  const now = new Date();
  await pdb.collection("companies").insertMany([
    { _id: A as never, slug: "alpha", name: "Alpha Pvt Ltd", status: "active", isPlatformOwner: false, createdAt: now, updatedAt: now },
    { _id: B as never, slug: "beta", name: "Beta", status: "active", isPlatformOwner: false, createdAt: now, updatedAt: now },
  ]);
  const adminId = new ObjectId();
  const actor = { id: adminId.toString(), email: "boss@alpha.test" };
  const created = new Date("2026-03-01T10:00:00Z");
  for (const [id, tag] of [[A, "alpha"], [B, "beta"]] as const) {
    await runAsCompany(id, async () => {
      const db = await getDb();
      await db.collection("leads").insertMany([{ name: `${tag} one`, createdAt: created, value: 100 }, { name: `${tag} two`, createdAt: created, value: 200 }] as never[]);
      await db.collection("hrms_settings").insertOne({ _id: "main", weeklyOff: ["sun"] } as never);
      await db.collection("admin_users").insertOne({ _id: id === A ? adminId : new ObjectId(), email: `boss@${tag}.test`, passwordHash: hashPassword("Correct-horse-1"), roles: ["super_admin"], failedLoginAttempts: 0, lockedUntil: null } as never);
    });
  }
  const inA = <T,>(fn: () => Promise<T>) => runAsCompany(A, fn);
  const leadsOf = (c: string) => runAsCompany(c, async () => (await (await getDb()).collection("leads").find({}).sort({ name: 1 }).toArray()) as unknown as { name: string; value: number; createdAt: Date }[]);

  let first = "";
  await check("a backup is saved, listed, and what you download is the stored file", async () => {
    const r = await inA(() => createBackup("manual", actor));
    assert.ok(r.ok);
    if (!r.ok) return;
    first = r.backup.id;
    assert.deepEqual([r.backup.kind, r.backup.status, r.backup.downloadable, r.backup.rows > 0], ["manual", "ok", true, true]);
    const list = await inA(() => listBackups());
    assert.equal(list.length, 1);
    const dl = await inA(() => backupFile(first));
    const downloaded = Buffer.from(await new Response(dl!.stream).arrayBuffer());
    const stored = [...files.values()][0];
    assert.ok(downloaded.equals(stored), "the download is byte for byte the stored file");
    assert.equal(dl!.bytes, stored.length);
    assert.equal((await runAsCompany(B, () => listBackups())).length, 0, "another company sees none");
    assert.equal(await runAsCompany(B, () => backupFile(first)), null, "nor can it download it");
  });
  await check("only the newest manual backups are kept", async () => {
    for (let i = 0; i < KEEP_MANUAL + 2; i++) await inA(() => createBackup("manual", actor));
    const list = await inA(() => listBackups(100));
    assert.equal(list.filter((b) => b.kind === "manual").length, KEEP_MANUAL);
    assert.equal(files.size, KEEP_MANUAL, "the dropped files are removed from storage too");
    first = (await inA(() => listBackups(100))).filter((b) => b.kind === "manual").at(-1)!.id; // the oldest one still kept
  });

  await check("a restore goes back to the backup, with dates intact, and leaves accounts and other companies alone", async () => {
    const good = (await inA(() => createBackup("manual", actor)))!;
    assert.ok(good.ok);
    if (!good.ok) return;
    await inA(async () => {
      const db = await getDb();
      await db.collection("leads").deleteOne({ name: "alpha one" });
      await db.collection("leads").updateOne({ name: "alpha two" }, { $set: { value: 999 } });
      await db.collection("leads").insertOne({ name: "alpha three (new)", createdAt: new Date(), value: 1 } as never);
      await db.collection("hrms_settings").updateOne({ _id: "main" } as never, { $set: { weeklyOff: ["sat"] } });
      await db.collection("admin_users").updateOne({ email: "boss@alpha.test" }, { $set: { roles: ["super_admin"], note: "changed since" } });
    });
    const betaBefore = JSON.stringify(await leadsOf(B));
    const r = await inA(() => restoreBackup(good.backup.id, actor));
    assert.ok(r.ok, r.ok ? "" : r.error);
    const leads = await leadsOf(A);
    assert.deepEqual(leads.map((l) => [l.name, l.value]), [["alpha one", 100], ["alpha two", 200]]);
    assert.ok(leads[0].createdAt instanceof Date && leads[0].createdAt.getTime() === created.getTime(), "dates come back as dates");
    const settings = await inA(async () => (await getDb()).collection("hrms_settings").findOne({ _id: "main" } as never));
    assert.deepEqual((settings as unknown as { weeklyOff: string[] }).weeklyOff, ["sun"], "keyed records too");
    const user = await inA(async () => (await getDb()).collection("admin_users").findOne({ email: "boss@alpha.test" }));
    assert.ok(user?.passwordHash && user.note === "changed since", "accounts are never rolled back");
    assert.equal(JSON.stringify(await leadsOf(B)), betaBefore, "the other company is untouched");
  });
  await check("every restore is in the history, with its safety copy (which restores the state from just before)", async () => {
    const h = await inA(() => listRestores());
    assert.equal(h.length, 1);
    assert.deepEqual([h[0].status, h[0].byEmail, h[0].records > 0, h[0].removed > 0], ["done", actor.email, true, true]);
    const safety = (await inA(() => listBackups(100))).find((b) => b.id === h[0].safetyBackupId);
    assert.equal(safety?.kind, "pre_restore");
    assert.ok(safety?.keepUntil, "kept for a limited time");
    const undo = await inA(() => restoreBackup(h[0].safetyBackupId!, actor));
    assert.ok(undo.ok);
    assert.ok((await leadsOf(A)).some((l) => l.name === "alpha three (new)"), "the undo brought back what the first restore removed");
    assert.equal((await inA(() => listRestores())).length, 2);
  });
  await check("a backup of another workspace can't be restored", async () => {
    const other = await runAsCompany(B, () => createBackup("manual", { email: "boss@beta.test" }));
    assert.ok(other.ok);
    if (!other.ok) return;
    const r = await inA(() => restoreBackup(other.backup.id, actor));
    assert.ok(!r.ok, "company A has no such backup");
    const buf = await runAsCompany(B, () => backupBuffer(other.backup.id));
    files.set("backups/forged.zip", buf!.data);
    await inA(async () => (await getDb()).collection("company_backups").insertOne({ _id: "forged", at: new Date(), kind: "manual", status: "ok", storageKey: "backups/forged.zip", bytes: 1, rows: 1, collections: 1, byEmail: null } as never));
    const forged = await inA(() => restoreBackup("forged", actor));
    assert.ok(!forged.ok && /another workspace/.test(forged.error));
  });

  await check("the confirmation needs the exact name, phrase and password; it works once and gives up after five wrong tries", async () => {
    const user = { id: actor.id, _id: adminId, passwordHash: hashPassword("Correct-horse-1"), twoFactor: undefined };
    const c = await inA(() => startChallenge(actor.id, "wipe"));
    assert.equal(c.phrase, "DELETE ALL MY DATA");
    const ok = { token: c.token, typedName: "Alpha Pvt Ltd", phrase: c.phrase, password: "Correct-horse-1" };
    assert.ok(!(await inA(() => consumeChallenge(user, "wipe", { ...ok, typedName: "alpha" }))).ok);
    assert.ok(!(await inA(() => consumeChallenge(user, "wipe", { ...ok, phrase: "delete all my data" }))).ok);
    assert.ok(!(await inA(() => consumeChallenge(user, "wipe", { ...ok, password: "nope" }))).ok);
    assert.ok(!(await inA(() => consumeChallenge(user, "delete", ok))).ok, "a challenge for one action can't be used for another");
    assert.ok((await inA(() => consumeChallenge(user, "wipe", ok))).ok);
    assert.ok(!(await inA(() => consumeChallenge(user, "wipe", ok))).ok, "single use");
    const c2 = await inA(() => startChallenge(actor.id, "wipe"));
    for (let i = 0; i < 5; i++) await inA(() => consumeChallenge(user, "wipe", { token: c2.token, typedName: "x", phrase: "x", password: "x" }));
    const late = await inA(() => consumeChallenge(user, "wipe", { token: c2.token, typedName: "Alpha Pvt Ltd", phrase: c2.phrase, password: "Correct-horse-1" }));
    assert.ok(!late.ok && /Too many/.test(late.error));
  });

  await check("deleting all data empties the workspace, keeps the company and its accounts, saves a safety copy, and is recorded", async () => {
    const r = await inA(() => wipeCompanyData(actor));
    assert.ok(r.ok, r.ok ? "" : r.error);
    assert.equal((await leadsOf(A)).length, 0);
    const user = await inA(async () => (await getDb()).collection("admin_users").findOne({ email: "boss@alpha.test" }));
    assert.ok(user);
    assert.ok(await pdb.collection("companies").findOne({ _id: A as never }), "the company stays");
    assert.equal((await leadsOf(B)).length, 2, "the other company is untouched");
    const safety = (await inA(() => listBackups(100))).find((b) => b.kind === "pre_wipe");
    assert.ok(safety);
    assert.equal((await inA(() => listDataEvents()))[0].kind, "wipe");
    const back = await inA(() => restoreBackup(safety!.id, actor));
    assert.ok(back.ok);
    assert.deepEqual((await leadsOf(A)).map((l) => l.name), ["alpha three (new)", "alpha two"], "the safety copy brings the records back");
  });

  await check("deleting the company waits 30 days, is read-only meanwhile, and can be cancelled", async () => {
    const s = await inA(() => scheduleCompanyDeletion(actor));
    assert.ok(s.ok, s.ok ? "" : s.error);
    if (!s.ok) return;
    const days = (s.purgeAt.getTime() - Date.now()) / 86_400_000;
    assert.ok(days > 29.9 && days <= 30, `30 days: ${days}`);
    const ent = await inA(() => getEntitlements());
    assert.equal(ent.readOnly, true);
    assert.ok(ent.pendingDeletionAt);
    const blocked = await inA(() => wipeCompanyData(actor)).catch((e) => e);
    assert.ok(isBillingLimitError(blocked), "nothing else can change meanwhile");
    assert.ok(!(await inA(() => scheduleCompanyDeletion(actor)).catch(() => ({ ok: false }))).ok, "not twice");
    const c = await inA(() => cancelCompanyDeletion(actor));
    assert.ok(c.ok);
    assert.equal((await inA(() => getEntitlements())).readOnly, false);
    assert.deepEqual((await inA(() => listDataEvents())).slice(0, 2).map((e) => e.kind), ["delete_cancelled", "delete_scheduled"]);
  });
  await check("the daily job deletes a company when its 30 days have ended, and nobody else", async () => {
    assert.ok((await inA(() => scheduleCompanyDeletion(actor))).ok);
    const before = [...files.keys()].filter((k) => k.startsWith(`backups/${A}/`)).length;
    assert.ok(before > 0);
    await pdb.collection("companies").updateOne({ _id: A as never }, { $set: { "deletion.purgeAt": new Date(Date.now() - 1000) } });
    const out = await runLifecycleJobs();
    assert.equal(out.deleted, 1);
    assert.equal(await pdb.collection("companies").findOne({ _id: A as never }), null, "gone");
    assert.equal(await pdb.collection("leads").countDocuments({ companyId: A } as never), 0, "with its records");
    assert.equal([...files.keys()].filter((k) => k.startsWith(`backups/${A}/`)).length, 0, "and its backup files");
    assert.equal((await leadsOf(B)).length, 2, "Beta is untouched");
  });
  await check("the daily job makes the weekly backup once, and only for a company that is due", async () => {
    await runAsCompany(B, async () => { await (await getDb()).collection("company_backups").deleteMany({}); });
    const first = await runLifecycleJobs();
    assert.equal(first.backedUp, 1);
    const list = await runAsCompany(B, () => listBackups());
    assert.deepEqual([list.length, list[0].kind, list[0].byEmail], [1, "scheduled", null]);
    assert.equal((await runLifecycleJobs()).backedUp, 0, "not again within the week");
  });

  console.log(`${passed} checks passed`);
  await (await clientPromise).db().dropDatabase();
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
