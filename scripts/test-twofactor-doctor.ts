import assert from "node:assert/strict";
import { createCipheriv, randomBytes } from "node:crypto";
import { runDoctor, type DoctorDeps, type DoctorUser } from "../src/lib/platform/keyring/doctor";

// Pure: fakes only. Run with: npx tsx scripts/test-twofactor-doctor.ts
let n = 0;
const t = async (name: string, fn: () => Promise<void>) => { await fn(); n++; console.log("  ✓", name); };
const sealWith = (key: Buffer, aad: string) => {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key, iv);
  c.setAAD(Buffer.from(aad));
  const ct = Buffer.concat([c.update("x"), c.final()]);
  return { c: ct.toString("base64"), iv: iv.toString("base64"), t: c.getAuthTag().toString("base64") };
};
const real = randomBytes(32);
const lost = randomBytes(32);
const mk = (id: string, key: Buffer, company = "c1"): DoctorUser => ({ companyId: company, companyName: "Acme", adminId: id, email: `${id}@acme.test`, twoFactor: { secret: sealWith(key, `2fa:${company}:${id}`) } });

function deps(users: DoctorUser[], over: Partial<DoctorDeps> = {}) {
  const calls = { cleared: [] as string[], backups: [] as unknown[][], audits: [] as string[], notified: [] as string[], logs: [] as string[] };
  const d: DoctorDeps = {
    dbName: "prod_db",
    keyring: { state: "ok", keys: [{ key: real, verified: true }] },
    users: async () => users,
    writeBackup: async (rows) => { calls.backups.push(rows); return "backup.json"; },
    clear: async (u) => { calls.cleared.push(u.adminId); return true; },
    audit: async (e) => void calls.audits.push(e.action),
    notify: async (u) => { calls.notified.push(u.adminId); return true; },
    confirm: async () => "prod_db",
    log: (l) => calls.logs.push(l),
    ...over,
  };
  return { d, calls };
}

(async () => {
  await t("read-only by default: lists only unreadable users (masked), changes nothing", async () => {
    const { d, calls } = deps([mk("ok1", real), mk("lost1", lost)]);
    const r = await runDoctor(d, { apply: false });
    assert.deepEqual([r.ok, r.unreadable, r.cleared], [true, 1, 0]);
    assert.ok(calls.logs.some((l) => l.includes("l****@acme.test") || l.includes("l***@acme.test")) && !calls.logs.some((l) => l.includes("lost1@acme.test")), "email is masked");
    assert.deepEqual(calls.cleared, []);
  });
  await t("--apply clears ONLY the provably unreadable ones, backs up first, audits, notifies", async () => {
    const { d, calls } = deps([mk("ok1", real), mk("lost1", lost), mk("lost2", lost, "c2")]);
    const r = await runDoctor(d, { apply: true });
    assert.deepEqual(calls.cleared.sort(), ["lost1", "lost2"]);
    assert.equal(calls.backups.length, 1);
    assert.equal(calls.backups[0].length, 2);
    assert.deepEqual(calls.audits, ["two_step.doctor_cleared"]);
    assert.deepEqual(calls.notified.sort(), ["lost1", "lost2"]);
    assert.equal(r.cleared, 2);
  });
  await t("a user whose secret opens with ANY key is never touched", async () => {
    const { d, calls } = deps([mk("a", real), mk("b", lost)], { keyring: { state: "ok", keys: [{ key: real, verified: true }, { key: lost, verified: false }] } });
    const r = await runDoctor(d, { apply: true });
    assert.deepEqual(calls.cleared, []);
    assert.equal(r.unreadable, 0);
  });
  await t("refuses with a locked keyring, a missing keyring, or no verified key", async () => {
    for (const keyring of [{ state: "locked" as const, keys: [] }, { state: "missing" as const, keys: [] }, { state: "ok" as const, keys: [{ key: lost, verified: false }] }]) {
      const { d, calls } = deps([mk("lost1", lost)], { keyring });
      const r = await runDoctor(d, { apply: true });
      assert.equal(r.ok, false);
      assert.ok(r.refused);
      assert.deepEqual(calls.cleared, []);
    }
  });
  await t("needs the typed database name: a wrong one changes nothing", async () => {
    const { d, calls } = deps([mk("lost1", lost)], { confirm: async () => "something else" });
    const r = await runDoctor(d, { apply: true });
    assert.equal(r.ok, false);
    assert.deepEqual(calls.cleared, []);
    assert.equal(calls.backups.length, 0);
    const ok = deps([mk("lost1", lost)]);
    assert.equal((await runDoctor(ok.d, { apply: true, confirmDb: "prod_db" })).cleared, 1);
  });
  await t("a pending (half-finished) secret that can't be opened also counts; users without two-step are ignored", async () => {
    const u = { ...mk("p1", real), twoFactor: null, twoFactorPending: { secret: sealWith(lost, "2fa:c1:p1") } } as DoctorUser;
    const none = { companyId: "c1", companyName: "Acme", adminId: "n1", email: "n1@acme.test" } as DoctorUser;
    const { d, calls } = deps([u, none]);
    await runDoctor(d, { apply: true });
    assert.deepEqual(calls.cleared, ["p1"]);
  });
  console.log(`\n${n} passed`);
})().catch((e) => { console.error(e); process.exit(1); });
