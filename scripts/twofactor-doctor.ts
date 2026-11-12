import { writeFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { MongoClient } from "mongodb";
import { deriveKek, resolveKeyring, type KeyringDoc } from "../src/lib/platform/keyring/core";
import { makeProbe } from "../src/lib/platform/keyring/probe";
import { runDoctor, type DoctorDeps, type DoctorUser } from "../src/lib/platform/keyring/doctor";

/**
 * `npm run twofactor:doctor` (read-only) / `npm run twofactor:doctor -- --apply [--confirm-db <name>]`.
 * Needs MONGODB_URI and SAAS_HOSTS (they open the keyring in the database). Lists everyone whose two-step secret no key can open; with --apply
 * (and the typed database name) clears ONLY those people's `twoFactor` / `twoFactorPending` fields after writing a backup file. Nobody whose secret
 * opens with any key is touched. Refuses when the keyring is locked or has no verified key.
 */
const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error("Set MONGODB_URI (and SAAS_HOSTS).");
  process.exit(2);
}
const apply = process.argv.includes("--apply");
const ci = process.argv.indexOf("--confirm-db");
const confirmDb = ci > 0 ? process.argv[ci + 1] : undefined;

(async () => {
  const client = await new MongoClient(uri).connect();
  const db = client.db();
  const keyDoc = await db.collection<KeyringDoc>("platform_settings").findOne({ _id: "keyring" });
  const kek = deriveKek(uri, process.env.SAAS_HOSTS);
  let keyring: DoctorDeps["keyring"] = { state: "missing", keys: [] };
  if (keyDoc) {
    const { collectKnown } = await import("../src/lib/platform/keyring/samples");
    const probe = makeProbe(await collectKnown(db));
    // Judge each stored key by the data (never by a stored flag): verified = it opens at least one existing secret, or no secrets exist at all.
    const r = resolveKeyring({ envKey: null, doc: keyDoc, kek, dbHasData: true, probe });
    keyring = r.state === "ok" ? { state: "ok", keys: r.keys.map((k) => ({ key: k.key, verified: probe.testable === 0 || probe.opens(k.key) > 0 })) } : r.state === "cannot_unwrap" ? { state: "locked", keys: [] } : { state: "missing", keys: [] };
  }
  const companies = new Map((await db.collection<{ _id: string; name: string }>("companies").find({}, { projection: { name: 1 } }).toArray()).map((c) => [c._id, c.name]));
  const deps: DoctorDeps = {
    dbName: db.databaseName,
    keyring,
    log: (l) => console.log(l),
    async users() {
      const rows = await db.collection("admin_users").find({ $or: [{ "twoFactor.secret": { $exists: true } }, { "twoFactorPending.secret": { $exists: true } }] }, { projection: { companyId: 1, email: 1, twoFactor: 1, twoFactorPending: 1 } }).toArray();
      return rows.map((u) => ({ companyId: String(u.companyId), companyName: companies.get(String(u.companyId)) ?? String(u.companyId), adminId: String(u._id), email: String(u.email), twoFactor: u.twoFactor ?? null, twoFactorPending: u.twoFactorPending ?? null })) as DoctorUser[];
    },
    async writeBackup(rows) {
      const file = `twofactor-backup-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
      writeFileSync(file, JSON.stringify(rows, null, 2), { mode: 0o600 });
      return file;
    },
    async clear(u) {
      const filter: Record<string, unknown> = { _id: u.adminId as never };
      // Match on the exact secret we looked at, so a person who re-enrolled meanwhile is not touched.
      if (u.twoFactor?.secret) filter["twoFactor.secret.c"] = u.twoFactor.secret.c;
      const { ObjectId } = await import("mongodb");
      if (ObjectId.isValid(u.adminId)) filter._id = new ObjectId(u.adminId) as never;
      return (await db.collection("admin_users").updateOne(filter, { $unset: { twoFactor: "", twoFactorPending: "" } })).modifiedCount === 1;
    },
    async audit(e) {
      await db.collection("platform_audit_log").insertOne({ at: new Date(), actorId: "system:twofactor-doctor", action: e.action, target: { type: "admin_users", id: "bulk" }, companyId: null, details: e.details });
    },
    async notify(u) {
      // A notice email when an email provider is available in this shell's environment (never fails the run).
      const key = process.env.RESEND_API_KEY;
      const from = process.env.EMAIL_FROM;
      if (!key || !from) return false;
      const res = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify({ from, to: u.email, subject: "Your two-step sign-in was reset", text: "Your two-step sign-in could not be checked, so it was reset by the platform team. You will be asked to set it up again at your next sign-in. If this wasn't you, change your password." }) });
      return res.ok;
    },
    async confirm(prompt) {
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      const a = await rl.question(prompt);
      rl.close();
      return a;
    },
  };
  const res = await runDoctor(deps, { apply, confirmDb });
  await client.close();
  if (!res.ok) {
    console.error(`Refused: ${res.refused}`);
    process.exit(1);
  }
})();
