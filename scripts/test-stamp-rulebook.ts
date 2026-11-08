import assert from "node:assert/strict";

// Stamp rulebook (B5a). Throwaway database only: MONGODB_URI=mongodb://127.0.0.1:27017/zz_throwaway_<n>. No network.
const uri = process.env.MONGODB_URI ?? "";
assert.ok(/zz_throwaway_/.test(uri) && !/\.env/.test(uri), "Run with MONGODB_URI=mongodb://127.0.0.1:27017/zz_throwaway_<n>");
const t = async (name: string, fn: () => Promise<void> | void) => { await fn(); console.log("  ✓", name); };

(async () => {
  const S = await import("../src/lib/products/contractflow-ai/stamp/structure");
  const store = await import("../src/lib/products/contractflow-ai/stamp/store");
  const { getStampGuidance } = await import("../src/lib/products/contractflow-ai/stamp/guidance");
  const { GLOBAL_COLLECTIONS } = await import("../src/lib/platform/tenancy/collections");
  const { hasPermission, ROUTE_PERMISSIONS, isPlatformPermission } = await import("../src/lib/platform/console/permissions");
  const { getPlatformDb } = await import("../src/lib/platform/tenancy/platform-db");
  const db = await getPlatformDb();
  assert.ok(/zz_throwaway_/.test(db.databaseName), "refusing to run on " + db.databaseName);
  await db.dropDatabase();

  console.log("structure");
  await t("28 states and 8 union territories, unique codes, no amounts anywhere in the structure", () => {
    assert.equal(S.JURISDICTIONS.filter((j) => j.kind === "state").length, 28);
    assert.equal(S.JURISDICTIONS.filter((j) => j.kind === "ut").length, 8);
    assert.equal(new Set(S.JURISDICTIONS.map((j) => j.code)).size, 36);
    assert.ok(S.INSTRUMENT_CATEGORIES.length >= 10);
    for (const c of ["agreement", "affidavit", "power_of_attorney", "lease", "employment", "indemnity", "nda"]) assert.ok(S.INSTRUMENT_CATEGORIES.some((x) => x.key === c), c);
    const blank = S.blankContent("agreement");
    assert.equal(blank.dutyType, "not_entered");
    assert.equal(blank.fixedAmount, null);
    assert.equal(blank.ratePercent, null);
  });
  await t("registered as a GLOBAL collection and behind its own permissions", () => {
    assert.ok(GLOBAL_COLLECTIONS.has("stamp_rulebook"));
    assert.equal(ROUTE_PERMISSIONS["/console/stamp-rulebook"], "stamp.read");
    for (const p of ["stamp.read", "stamp.edit", "stamp.confirm"]) assert.ok(isPlatformPermission(p), p);
    assert.equal(hasPermission(["stamp.edit"], "stamp.confirm"), false, "editing must not imply confirming");
    assert.equal(hasPermission(["stamp.confirm"], "stamp.edit"), false);
    assert.equal(hasPermission(["stamp.edit"], "stamp.read"), true);
    assert.equal(hasPermission(["settings.manage"], "stamp.confirm"), false);
    assert.equal(hasPermission(["*"], "stamp.confirm"), true);
  });
  await t("validation: bad values refused, empty amounts allowed as a draft, confirm needs amount + source + date", () => {
    const b = S.blankContent("agreement");
    assert.deepEqual(S.validateDraft(b), []);
    assert.ok(S.validateDraft({ ...b, fixedAmount: -1 }).length);
    assert.ok(S.validateDraft({ ...b, ratePercent: 120 }).length);
    assert.ok(S.validateDraft({ ...b, sourceUrl: "http://x.test/a" }).length, "https only");
    assert.ok(S.validateDraft({ ...b, sourceUrl: "javascript:alert(1)" }).length);
    assert.ok(S.validateDraft({ ...b, effectiveFrom: "2026-02-31" }).length);
    assert.ok(S.validateDraft({ ...b, minAmount: 10, capAmount: 5 }).length);
    assert.ok(S.validateForConfirm(b).length >= 2);
    const ok = { ...b, dutyType: "fixed" as const, fixedAmount: 100, sourceUrl: "https://example.org/act", effectiveFrom: "2024-01-01" };
    assert.deepEqual(S.validateForConfirm(ok), []);
    assert.ok(S.validateForConfirm({ ...ok, fixedAmount: null }).length);
  });

  const actor = { id: "u1", email: "admin@platform.test" };
  const reviewer = { id: "u2", email: "reviewer@platform.test" };
  console.log("store");
  await t("every state is listed with no entries on a fresh database", async () => {
    const list = await store.listJurisdictions();
    assert.equal(list.length, 36);
    assert.ok(list.every((s) => s.entries === 0 && s.confirmed === 0));
    assert.equal((await store.loadJurisdiction("MH"))!.origin, "structure_only");
    assert.equal(await store.loadJurisdiction("ZZ"), null);
  });
  // The figures below are TEST DATA on a throwaway database, not law.
  const test = { ...S.blankContent("nda"), dutyType: "fixed" as const, fixedAmount: 123, sourceUrl: "https://example.org/act", sourceTitle: "Test source", effectiveFrom: "2020-01-01" };
  let id = "";
  await t("saving an entry makes it unconfirmed; version moves; history and platform audit are written", async () => {
    const r = await store.saveEntry("MH", null, test, 0, actor);
    assert.ok(r.ok);
    id = (r as { entryId: string }).entryId;
    const l = (await store.loadJurisdiction("MH"))!;
    assert.equal(l.version, 1);
    assert.equal(l.entries[0].status, "unconfirmed");
    assert.equal(l.entries[0].confirmation, null);
    assert.equal((await store.jurisdictionHistory("MH"))[0].action, "save");
    assert.ok(await db.collection("platform_audit_log").findOne({ action: "stamp.rulebook.save" }));
  });
  await t("a stale version is refused (nobody overwrites a colleague)", async () => {
    const r = await store.saveEntry("MH", id, { ...test, fixedAmount: 1 }, 0, actor);
    assert.ok(!r.ok && r.conflict);
  });
  await t("a blank or unsourced entry cannot be confirmed", async () => {
    const b = await store.saveEntry("KA", null, S.blankContent("agreement"), 0, actor);
    assert.ok(b.ok);
    const r = await store.confirmEntry("KA", (b as { entryId: string }).entryId, 1, reviewer);
    assert.ok(!r.ok);
    assert.equal((await store.loadJurisdiction("KA"))!.entries[0].status, "unconfirmed");
  });
  await t("confirm stamps confirmedBy/On; any later content change removes the confirmation", async () => {
    const c = await store.confirmEntry("MH", id, 1, reviewer);
    assert.ok(c.ok);
    let e = (await store.loadJurisdiction("MH"))!.entries[0];
    assert.equal(e.status, "confirmed");
    assert.equal(e.confirmation!.by, reviewer.email);
    assert.ok(e.confirmation!.on);
    const same = await store.saveEntry("MH", id, test, 2, actor);
    assert.ok(same.ok);
    assert.equal((await store.loadJurisdiction("MH"))!.entries[0].status, "confirmed", "saving without a change keeps it");
    const ch = await store.saveEntry("MH", id, { ...test, fixedAmount: 124 }, 3, actor);
    assert.ok(ch.ok);
    e = (await store.loadJurisdiction("MH"))!.entries[0];
    assert.equal(e.status, "unconfirmed");
    assert.equal(e.confirmation, null);
  });
  await t("a hand-edited document cannot fake a confirmation (snapshot must match the content)", async () => {
    await db.collection("stamp_rulebook").updateOne({ _id: "MH" as never }, { $set: { "entries.0.confirmation": { by: "x", on: "2026-01-01T00:00:00.000Z", snapshot: "stale" } } });
    assert.equal((await store.loadJurisdiction("MH"))!.entries[0].status, "unconfirmed");
  });
  await t("copy gives unconfirmed drafts that say where they came from; the source is untouched", async () => {
    const v = (await store.loadJurisdiction("MH"))!.version;
    await store.confirmEntry("MH", id, v, reviewer);
    const before = (await store.loadJurisdiction("MH"))!;
    const r = await store.copyEntries("MH", "GJ", 0, actor);
    assert.ok(r.ok && (r as { copied: number }).copied === 1);
    const gj = (await store.loadJurisdiction("GJ"))!;
    assert.equal(gj.entries[0].status, "unconfirmed");
    assert.match(gj.entries[0].notes, /Copied from Maharashtra/);
    assert.notEqual(gj.entries[0].id, id);
    assert.equal((await store.loadJurisdiction("MH"))!.entries[0].status, before.entries[0].status);
    assert.ok(!(await store.copyEntries("MH", "MH", 0, actor)).ok);
  });
  await t("remove works and is recorded", async () => {
    const gj = (await store.loadJurisdiction("GJ"))!;
    assert.ok((await store.removeEntry("GJ", gj.entries[0].id, gj.version, actor)).ok);
    assert.equal((await store.loadJurisdiction("GJ"))!.entries.length, 0);
    assert.equal((await store.jurisdictionHistory("GJ"))[0].action, "remove");
  });

  console.log("read API");
  await t("unknown state, no entry, blank entry: unconfirmed and never authoritative", async () => {
    for (const g of [await getStampGuidance({ state: "XX", category: "nda" }), await getStampGuidance({ state: "TN", category: "nda" }), await getStampGuidance({ state: "KA", category: "agreement" })]) {
      assert.equal(g.authoritative, false);
      assert.equal(g.unconfirmed, true);
      assert.ok(g.disclaimer.includes("not authoritative"));
      assert.equal(g.entries.every((e) => e.fixedAmount === null && e.ratePercent === null), true, "no amount appears from nowhere");
    }
    assert.equal((await getStampGuidance({ state: "TN", category: "nda" })).status, "not_entered");
    assert.equal((await getStampGuidance({ state: "XX", category: "nda" })).status, "unknown_state");
  });
  await t("an unconfirmed entry is flagged; a confirmed one still carries the disclaimer and authoritative:false", async () => {
    const mh = (await store.loadJurisdiction("MH"))!;
    await store.unconfirmEntry("MH", id, mh.version, reviewer);
    const g1 = await getStampGuidance({ state: "MH", category: "nda", asOf: new Date("2026-06-01") });
    assert.equal(g1.status, "unconfirmed");
    assert.equal(g1.unconfirmed, true);
    assert.match(g1.message, /NOT CONFIRMED/);
    assert.equal(g1.entries[0].inForce, true);
    await store.confirmEntry("MH", id, (await store.loadJurisdiction("MH"))!.version, reviewer);
    const g2 = await getStampGuidance({ state: "MH", category: "nda", asOf: new Date("2019-06-01") });
    assert.equal(g2.status, "confirmed");
    assert.equal(g2.unconfirmed, false);
    assert.equal(g2.authoritative, false);
    assert.ok(g2.disclaimer.length > 20);
    assert.equal(g2.entries[0].inForce, false, "not yet in force on that date");
    assert.equal(g2.entries[0].confirmedBy, reviewer.email);
  });

  await db.dropDatabase();
  console.log("stamp rulebook: all passed");
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
