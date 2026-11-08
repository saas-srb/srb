/**
 * Isolation test for the company-scoped data layer (`src/lib/platform/tenancy/scoped-db.ts`),
 * run against a real MongoDB in a throwaway database that is dropped at the end.
 *
 *   npx tsx --env-file=.env scripts/test-tenancy-isolation.ts
 *
 * Two companies (A and B) share every collection; each check asserts that one
 * company's operations can neither see nor change the other's documents.
 */

import assert from "node:assert/strict";
import { MongoClient, type Db } from "mongodb";
import { scopeDb, TenantScopeError } from "@/lib/platform/tenancy/scoped-db";

const TEST_DB = `demo_mtunit_${Date.now()}`;
const A = "company-a";
const B = "company-b";

let passed = 0;
const failures: string[] = [];
async function check(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failures.push(name);
    console.log(`  ✗ ${name}\n      ${err instanceof Error ? err.message : String(err)}`);
  }
}

interface Lead { _id: string; name: string; email: string; status?: string; companyId?: string }

async function run(raw: Db) {
  const a = scopeDb(raw, A);
  const b = scopeDb(raw, B);
  const leadsA = a.collection<Lead>("leads");
  const leadsB = b.collection<Lead>("leads");

  console.log("Basic CRUD");
  await check("insert stamps companyId and mirrors _id onto the caller's object only", async () => {
    const doc: Partial<Lead> = { name: "Asha", email: "shared@x.com" };
    await leadsA.insertOne(doc as Lead);
    assert.ok(doc._id, "caller doc got an _id");
    assert.equal(doc.companyId, undefined, "caller doc not polluted with companyId");
    const stored = await raw.collection("leads").findOne({ _id: doc._id as never });
    assert.equal(stored?.companyId, A);
  });
  await leadsA.insertMany([{ _id: "a2", name: "Ben", email: "ben@a.com" }, { _id: "a3", name: "Cy", email: "cy@a.com" }]);
  await leadsB.insertMany([{ _id: "b1", name: "Bo", email: "shared@x.com" }, { _id: "b2", name: "Bea", email: "bea@b.com" }]);

  await check("find / count only see own company", async () => {
    assert.equal((await leadsA.find({}).toArray()).length, 3);
    assert.equal((await leadsB.find().toArray()).length, 2);
    assert.equal(await leadsA.countDocuments({}), 3);
    assert.equal(await leadsA.estimatedDocumentCount(), 3);
    assert.equal(await leadsA.countDocuments({ email: "shared@x.com" }), 1);
  });
  await check("findOne by another company's _id returns null", async () => {
    assert.equal(await leadsA.findOne({ _id: "b1" }), null);
    assert.ok(await leadsB.findOne({ _id: "b1" }));
  });
  await check("cursor chaining (sort/skip/limit/project) still works", async () => {
    const rows = await leadsA.find({}, { projection: { name: 1 } }).sort({ name: 1 }).skip(1).limit(1).toArray();
    assert.deepEqual(rows.map((r) => r.name), ["Ben"]);
  });
  await check("updateOne/updateMany can't reach another company", async () => {
    const r1 = await leadsA.updateOne({ _id: "b1" }, { $set: { status: "hacked" } });
    assert.equal(r1.matchedCount, 0);
    const r2 = await leadsA.updateMany({}, { $set: { status: "seen" } });
    assert.equal(r2.matchedCount, 3);
    assert.equal(await leadsB.countDocuments({ status: "seen" }), 0);
  });
  await check("update operators can't change or unset companyId", async () => {
    await leadsA.updateOne({ _id: "a2" }, { $set: { companyId: B, name: "Ben2" } as Partial<Lead> });
    await leadsA.updateOne({ _id: "a3" }, { $unset: { companyId: "" } as never });
    const docs = await raw.collection("leads").find({ _id: { $in: ["a2", "a3"] } as never }).toArray();
    assert.deepEqual(docs.map((d) => d.companyId), [A, A]);
    assert.equal(docs.find((d) => d._id === ("a2" as never))?.name, "Ben2");
  });
  await check("a filter naming another companyId is ANDed, not obeyed", async () => {
    assert.equal(await leadsA.countDocuments({ companyId: B } as never), 0);
  });
  await check("upsert creates the doc inside the company", async () => {
    await leadsA.updateOne({ email: "new@a.com" }, { $set: { name: "New" }, $setOnInsert: { _id: "a-up" } }, { upsert: true });
    const stored = await raw.collection("leads").findOne({ _id: "a-up" as never });
    assert.equal(stored?.companyId, A);
  });
  await check("findOneAndUpdate / findOneAndDelete / replaceOne are confined", async () => {
    assert.equal(await leadsA.findOneAndUpdate({ _id: "b2" }, { $set: { status: "x" } }), null);
    assert.equal(await leadsA.findOneAndDelete({ _id: "b2" }), null);
    const r = await leadsA.replaceOne({ _id: "b2" }, { name: "stolen", email: "s@s" });
    assert.equal(r.matchedCount, 0);
    await leadsA.replaceOne({ _id: "a3" }, { name: "Cy2", email: "cy@a.com" });
    assert.equal((await raw.collection("leads").findOne({ _id: "a3" as never }))?.companyId, A);
    assert.ok(await leadsB.findOne({ _id: "b2", name: "Bea" }));
  });
  await check("pipeline-style update keeps companyId", async () => {
    await leadsA.updateOne({ _id: "a2" }, [{ $set: { name: { $concat: ["$name", "!"] } } }]);
    const d = await raw.collection("leads").findOne({ _id: "a2" as never });
    assert.equal(d?.name, "Ben2!");
    assert.equal(d?.companyId, A);
  });
  await check("distinct only returns own values", async () => {
    const emails = await leadsA.distinct("email");
    assert.ok(!emails.includes("bea@b.com"));
  });
  await check("bulkWrite is confined", async () => {
    await leadsA.bulkWrite([
      { insertOne: { document: { _id: "a-bulk", name: "Bulk", email: "bulk@a.com" } } },
      { updateOne: { filter: { _id: "b1" }, update: { $set: { status: "bulk-hack" } } } },
      { deleteMany: { filter: { email: "bea@b.com" } } },
    ]);
    assert.equal((await raw.collection("leads").findOne({ _id: "a-bulk" as never }))?.companyId, A);
    assert.equal((await leadsB.findOne({ _id: "b1" }))?.status, undefined);
    assert.ok(await leadsB.findOne({ _id: "b2" }));
  });
  await check("deleteMany({}) only deletes own documents", async () => {
    const tmpA = a.collection("tmp");
    const tmpB = b.collection("tmp");
    await tmpA.insertMany([{ x: 1 }, { x: 2 }]);
    await tmpB.insertOne({ x: 3 });
    const r = await tmpA.deleteMany({});
    assert.equal(r.deletedCount, 2);
    assert.equal(await tmpB.countDocuments(), 1);
  });

  console.log("Aggregation");
  const notesA = a.collection("notes");
  const notesB = b.collection("notes");
  await notesA.insertMany([{ leadEmail: "shared@x.com", text: "A's note" }]);
  await notesB.insertMany([{ leadEmail: "shared@x.com", text: "B's secret note" }]);
  await check("aggregate $group only counts own documents", async () => {
    const [row] = await leadsA.aggregate<{ n: number }>([{ $group: { _id: null, n: { $sum: 1 } } }]).toArray();
    assert.equal(row.n, 5);
  });
  await check("$lookup by a shared key (email) can't join another company's rows", async () => {
    const rows = await leadsA
      .aggregate<{ notes: { text: string }[] }>([{ $match: { email: "shared@x.com" } }, { $lookup: { from: "notes", localField: "email", foreignField: "leadEmail", as: "notes" } }])
      .toArray();
    assert.deepEqual(rows[0].notes.map((n) => n.text), ["A's note"]);
  });
  await check("$lookup with a sub-pipeline is confined too", async () => {
    const rows = await leadsA
      .aggregate<{ notes: unknown[] }>([{ $match: { email: "shared@x.com" } }, { $lookup: { from: "notes", let: { e: "$email" }, pipeline: [{ $match: { $expr: { $eq: ["$leadEmail", "$$e"] } } }], as: "notes" } }])
      .toArray();
    assert.equal(rows[0].notes.length, 1);
  });
  await check("$lookup nested inside $facet is confined", async () => {
    const [row] = await leadsA
      .aggregate<{ j: { notes: unknown[] }[] }>([{ $match: { email: "shared@x.com" } }, { $facet: { j: [{ $lookup: { from: "notes", localField: "email", foreignField: "leadEmail", as: "notes" } }] } }])
      .toArray();
    assert.equal(row.j[0].notes.length, 1);
  });
  await check("$unionWith only brings in own documents", async () => {
    const rows = await leadsA.aggregate([{ $project: { _id: 1 } }, { $unionWith: "notes" }]).toArray();
    assert.equal(rows.length, 6);
  });
  await check("$out / $merge are refused", async () => {
    assert.throws(() => leadsA.aggregate([{ $out: "stolen" }]), TenantScopeError);
  });

  console.log("Keyed collections (counters, settings, rollups)");
  const countersA = a.collection<{ _id: string; seq: number }>("pms_counters");
  const countersB = b.collection<{ _id: string; seq: number }>("pms_counters");
  const bump = (c: typeof countersA) => c.findOneAndUpdate({ _id: "project" }, { $inc: { seq: 1 } }, { upsert: true, returnDocument: "after" });
  await check("same counter key runs independently per company", async () => {
    assert.equal((await bump(countersA))?.seq, 1);
    assert.equal((await bump(countersA))?.seq, 2);
    const bDoc = await bump(countersB);
    assert.equal(bDoc?.seq, 1);
    assert.equal(bDoc?._id, "project", "callers see the bare key");
    const stored = await raw.collection("pms_counters").find({}).toArray();
    assert.deepEqual(stored.map((d) => d._id).sort(), [`${A}::project`, `${B}::project`]);
  });
  await check("settings singleton via $setOnInsert with _id", async () => {
    const setA = a.collection<{ _id: string; theme: string }>("pms_settings");
    const setB = b.collection<{ _id: string; theme: string }>("pms_settings");
    await setA.updateOne({ _id: "org" }, { $setOnInsert: { _id: "org", theme: "red" } }, { upsert: true });
    await setB.updateOne({ _id: "org" }, { $setOnInsert: { _id: "org", theme: "blue" } }, { upsert: true });
    assert.equal((await setA.findOne({ _id: "org" }))?.theme, "red");
    assert.equal((await setB.findOne({ _id: "org" }))?.theme, "blue");
    assert.equal((await setA.findOne({ _id: "org" }))?._id, "org");
  });
  await check("insertOne with a fixed key + duplicate detection per company", async () => {
    const locksA = a.collection<{ _id: string }>("wallet_idempotency_locks");
    const locksB = b.collection<{ _id: string }>("wallet_idempotency_locks");
    const r = await locksA.insertOne({ _id: "k1" });
    assert.equal(r.insertedId, "k1");
    await assert.rejects(locksA.insertOne({ _id: "k1" }));
    await locksB.insertOne({ _id: "k1" });
  });
  await check("date-range query + aggregate over keyed rollups", async () => {
    const rollA = a.collection<{ _id: string; n: number }>("chat_daily_rollup");
    const rollB = b.collection<{ _id: string; n: number }>("chat_daily_rollup");
    for (const d of ["2026-09-01", "2026-09-02", "2026-09-10"]) await rollA.updateOne({ _id: d }, { $inc: { n: 1 } }, { upsert: true });
    await rollB.updateOne({ _id: "2026-09-02" }, { $inc: { n: 100 } }, { upsert: true });
    const rows = await rollA.find({ _id: { $gte: "2026-09-01", $lte: "2026-09-05" } }).sort({ _id: 1 }).toArray();
    assert.deepEqual(rows.map((r) => r._id), ["2026-09-01", "2026-09-02"]);
    const [agg] = await rollA.aggregate<{ _id: null; total: number }>([{ $match: { _id: { $gte: "2026-09-01" } } }, { $group: { _id: null, total: { $sum: "$n" } } }]).toArray();
    assert.equal(agg.total, 3);
    const ids = await rollA.aggregate<{ _id: string }>([{ $sort: { _id: 1 } }, { $limit: 1 }]).toArray();
    assert.equal(ids[0]._id, "2026-09-01");
  });

  console.log("Indexes");
  await check("unique index is per company", async () => {
    const usersA = a.collection<{ email: string }>("admin_users");
    const usersB = b.collection<{ email: string }>("admin_users");
    await usersA.createIndex({ email: 1 }, { unique: true });
    const idx = await raw.collection("admin_users").indexes();
    assert.ok(idx.some((i) => JSON.stringify(i.key) === JSON.stringify({ companyId: 1, email: 1 }) && i.unique));
    await usersA.insertOne({ email: "boss@x.com" });
    await usersB.insertOne({ email: "boss@x.com" });
    await assert.rejects(usersA.insertOne({ email: "boss@x.com" }), /duplicate key/);
  });
  await check("TTL index is left single-field", async () => {
    await a.collection("admin_sessions").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
    const idx = await raw.collection("admin_sessions").indexes();
    assert.ok(idx.some((i) => JSON.stringify(i.key) === JSON.stringify({ expiresAt: 1 })));
  });

  console.log("Guard rails");
  await check("collection-wide operations throw", async () => {
    assert.throws(() => (leadsA as unknown as { drop: () => unknown }).drop(), TenantScopeError);
    assert.throws(() => (leadsA as unknown as { rename: (n: string) => unknown }).rename("x"), TenantScopeError);
    assert.throws(() => leadsA.watch(), TenantScopeError);
    assert.throws(() => (a as unknown as { dropDatabase: () => unknown }).dropDatabase(), TenantScopeError);
  });
  await check("global collections are not scoped", async () => {
    await a.collection("companies").insertOne({ _id: "x" as never, slug: "x" });
    assert.equal(await b.collection("companies").countDocuments({ _id: "x" as never }), 1);
  });
}

async function main() {
  const client = new MongoClient(process.env.MONGODB_URI!);
  await client.connect();
  const raw = client.db(TEST_DB);
  console.log(`Scratch database: ${TEST_DB}\n`);
  try {
    await run(raw);
  } finally {
    await raw.dropDatabase();
    await client.close();
    console.log(`\nDropped ${TEST_DB}.`);
  }
  console.log(`${passed} passed, ${failures.length} failed`);
  if (failures.length) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
