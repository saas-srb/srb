import assert from "node:assert/strict";

// Party model and adapters (B9). Throwaway database only: MONGODB_URI=mongodb://127.0.0.1:27017/zz_throwaway_<n>. No network.
const uri = process.env.MONGODB_URI ?? "";
assert.ok(/zz_throwaway_/.test(uri) && !/\.env/.test(uri), "Run with MONGODB_URI=mongodb://127.0.0.1:27017/zz_throwaway_<n>");
const t = async (name: string, fn: () => Promise<void> | void) => { await fn(); console.log("  ✓", name); };

(async () => {
  const { ObjectId } = await import("mongodb");
  const { getDb, getPlatformDb } = await import("../src/lib/mongodb");
  const { runAsCompany } = await import("../src/lib/platform/tenancy/context");
  const P = await import("../src/lib/products/contractflow-ai/parties");
  type Viewer = import("../src/lib/products/contractflow-ai/types").LpmsViewer;
  const pdb = await getPlatformDb();
  assert.ok(/zz_throwaway_/.test(pdb.databaseName), "refusing to run on " + pdb.databaseName);
  await pdb.dropDatabase();

  const viewer = (roles: string[], companyId = "coA"): Viewer => ({ userId: "u_" + roles.join("_"), email: "x@test.invalid", roles, overrides: {}, lpmsRoles: [], employeeId: null, companyId });
  const HR = viewer(["hr", "lpms_viewer"]);
  const SALES = viewer(["pms_manager", "lpms_author"]);
  const PROC = viewer(["procurement_manager", "lpms_author"]);
  const LEGAL = viewer(["lpms_admin"]); // sees every party type
  const PLAIN = viewer(["lpms_viewer"]);
  const AUTHOR = viewer(["lpms_author"]);

  const eid = new ObjectId();
  await runAsCompany("coA", async () => {
    const db = await getDb();
    await db.collection("pms_clients").insertMany([
      { _id: "cl1", companyName: "Acme Industries", clientCode: "C-1", primaryContact: { name: "Asha", email: "asha@acme.test", phone: "+91 90000 00001" }, deletedAt: null },
      { _id: "cl2", companyName: "Gone Clients", primaryContact: { name: "Old" }, deletedAt: new Date() },
    ] as never);
    await db.collection("prms_vendors").insertOne({ _id: "v1", companyName: "Bolt Supplies", vendorCode: "V-1", email: "sales@bolt.test", deletedAt: null } as never);
    await db.collection("hrms_employees").insertOne({ _id: "e1", firstName: "Ravi", lastName: "Kumar", workEmail: "ravi@coa.test", employeeCode: "E001", deletedAt: null } as never);
    await db.collection("career_applications").insertOne({ _id: eid, name: "Candy Date", email: "candy@x.test", positionTitle: "Designer" } as never);
  });
  await runAsCompany("coB", async () => {
    await (await getDb()).collection("pms_clients").insertOne({ _id: "cl1b", companyName: "Other Company's Client", primaryContact: {}, deletedAt: null } as never);
  });

  const inA = <T,>(fn: () => Promise<T>) => runAsCompany("coA", fn);
  const inB = <T,>(fn: () => Promise<T>) => runAsCompany("coB", fn);
  const rejects = async (fn: () => Promise<unknown>, code: string) => {
    await assert.rejects(fn, (e: unknown) => (e as { code?: string }).code === code, `expected ${code}`);
  };

  console.log("pickers and permissions");
  await t("each adapter finds its own product's records (clients, vendors, employees, candidates)", () => inA(async () => {
    assert.deepEqual((await P.searchParties(SALES, { type: "client", q: "acme" })).map((h) => h.displayName), ["Acme Industries"]);
    assert.deepEqual((await P.searchParties(PROC, { type: "vendor", q: "bolt" })).map((h) => h.displayName), ["Bolt Supplies"]);
    assert.deepEqual((await P.searchParties(HR, { type: "employee", q: "ravi" })).map((h) => h.displayName), ["Ravi Kumar"]);
    assert.deepEqual((await P.searchParties(HR, { type: "candidate", q: "candy" })).map((h) => h.displayName), ["Candy Date"]);
  }));
  await t("soft-deleted source records are not offered", () => inA(async () => {
    assert.equal((await P.searchParties(SALES, { type: "client", q: "gone" })).length, 0);
    await rejects(() => P.linkParty(SALES, { type: "client", recordId: "cl2" }), "not_found");
  }));
  await t("search text is treated as text, never as a pattern", () => inA(async () => {
    assert.equal((await P.searchParties(SALES, { type: "client", q: ".*" })).length, 0);
    assert.equal((await P.searchParties(SALES, { type: "client", q: "(" })).length, 0);
  }));
  await t("party-type access: HR data only for HR (and ContractFlow admins); procurement and sales are kept apart", () => inA(async () => {
    await rejects(() => P.searchParties(SALES, { type: "employee" }), "forbidden");
    await rejects(() => P.searchParties(PROC, { type: "candidate" }), "forbidden");
    await rejects(() => P.searchParties(HR, { type: "vendor" }), "forbidden");
    await rejects(() => P.searchParties(PLAIN, { type: "client" }), "forbidden");
    await rejects(() => P.linkParty(SALES, { type: "employee", recordId: "e1" }), "forbidden");
    assert.equal((await P.searchParties(LEGAL, { type: "employee", q: "ravi" })).length, 1);
    assert.deepEqual(P.visiblePartyTypes(HR).sort(), ["candidate", "employee", "other", "partner", "freelancer", "trainee"].sort());
    assert.ok(!P.visiblePartyTypes(PLAIN).includes("employee"));
  }));

  console.log("link, not copy");
  let clientParty = "";
  await t("a linked party stores a reference and a last-seen name only, never contact details", () => inA(async () => {
    const p = await P.linkParty(SALES, { type: "client", recordId: "cl1" });
    clientParty = p.id;
    assert.equal(p.linked, true);
    assert.equal(p.email, "asha@acme.test", "read live from the source");
    const raw = await (await getDb()).collection("cf_parties").findOne({ _id: p.id } as never) as unknown as Record<string, unknown>;
    assert.equal(raw.contact, null);
    assert.deepEqual(raw.source, { product: "sprintos", collection: "pms_clients", id: "cl1" });
    assert.ok(!JSON.stringify(raw).includes("asha@acme.test"));
    assert.ok(!JSON.stringify(raw).includes("90000"));
  }));
  await t("linking the same record twice gives the same party (also under a race)", () => inA(async () => {
    const again = await P.linkParty(SALES, { type: "client", recordId: "cl1" });
    assert.equal(again.id, clientParty);
    const [x, y] = await Promise.all([P.linkParty(HR, { type: "employee", recordId: "e1" }), P.linkParty(HR, { type: "employee", recordId: "e1" })]);
    assert.equal(x.id, y.id);
    assert.equal(await (await getDb()).collection("cf_parties").countDocuments({ "source.id": "e1" } as never), 1);
  }));
  await t("a rename in the source shows up at once (the index is not a copy)", () => inA(async () => {
    await (await getDb()).collection("pms_clients").updateOne({ _id: "cl1" } as never, { $set: { companyName: "Acme Renamed" } });
    assert.equal((await P.getParty(SALES, clientParty)).displayName, "Acme Renamed");
  }));
  await t("a deleted source is reported as missing with the last name seen, and recovers if restored", () => inA(async () => {
    const col = (await getDb()).collection("pms_clients");
    await col.updateOne({ _id: "cl1" } as never, { $set: { deletedAt: new Date() } });
    const gone = await P.getParty(SALES, clientParty);
    assert.equal(gone.sourceMissing, true);
    assert.equal(gone.status, "source_missing");
    assert.equal(gone.displayName, "Acme Renamed");
    assert.equal(gone.email, null, "no stale contact details are shown");
    assert.equal((await P.listParties(SALES, { type: "client" })).length, 0, "hidden from the default list");
    assert.equal((await P.listParties(SALES, { type: "client", includeMissing: true }))[0].sourceMissing, true);
    await col.updateOne({ _id: "cl1" } as never, { $set: { deletedAt: null } });
    assert.equal((await P.getParty(SALES, clientParty)).status, "active");
  }));
  await t("a hard-deleted source is handled the same way", () => inA(async () => {
    const v = await P.linkParty(PROC, { type: "vendor", recordId: "v1" });
    await (await getDb()).collection("prms_vendors").deleteOne({ _id: "v1" } as never);
    const gone = await P.getParty(PROC, v.id);
    assert.equal(gone.sourceMissing, true);
    assert.equal(gone.displayName, "Bolt Supplies");
  }));
  await t("reading a party needs access to its type", () => inA(async () => {
    await rejects(() => P.getParty(PROC, clientParty), "forbidden");
    await rejects(() => P.getParty(SALES, "nope"), "not_found");
  }));

  console.log("manual parties");
  await t("partners, freelancers, trainees and others are kept in ContractFlow with validated contact", () => inA(async () => {
    const p = await P.createManualParty(AUTHOR, { type: "freelancer", name: "  Meera   Iyer ", email: "Meera@Free.TEST", phone: "+91 98765 43210" });
    assert.equal(p.displayName, "Meera Iyer");
    assert.equal(p.email, "meera@free.test");
    assert.equal(p.linked, false);
    assert.deepEqual((await P.searchParties(AUTHOR, { type: "freelancer", q: "meera" })).map((h) => h.partyId), [p.id]);
    await rejects(() => P.createManualParty(AUTHOR, { type: "partner", name: "X" }), "invalid");
    await rejects(() => P.createManualParty(AUTHOR, { type: "partner", name: "Partner Co", email: "not-an-email" }), "invalid");
    await rejects(() => P.createManualParty(AUTHOR, { type: "partner", name: "Partner Co", phone: "abc" }), "invalid");
    await rejects(() => P.createManualParty(AUTHOR, { type: "client", name: "Should link instead" }), "invalid");
    await rejects(() => P.createManualParty(PLAIN, { type: "other", name: "Not allowed" }), "forbidden");
  }));
  await t("archived parties leave pickers and lists", () => inA(async () => {
    const p = await P.createManualParty(LEGAL, { type: "other", name: "Temp Party" });
    await P.archiveParty(LEGAL, p.id);
    assert.equal((await P.searchParties(LEGAL, { type: "other", q: "temp" })).length, 0);
    await rejects(() => P.archiveParty(PLAIN, p.id), "forbidden");
  }));

  console.log("two-company isolation");
  await t("company B cannot see, link or read company A's parties, and its own record is a different party; it cannot link A's record by id", async () => {
    await inB(async () => {
      assert.equal((await P.listParties(LEGAL)).length, 0);
      await rejects(() => P.getParty(LEGAL, clientParty), "not_found");
      const mine = await P.linkParty(viewer(["pms_manager"], "coB"), { type: "client", recordId: "cl1b" });
      await rejects(() => P.linkParty(viewer(["pms_manager"], "coB"), { type: "client", recordId: "cl1" }), "not_found");
      assert.notEqual(mine.id, clientParty);
      assert.equal(mine.displayName, "Other Company's Client");
    });
    await inA(async () => assert.equal((await P.getParty(SALES, clientParty)).displayName, "Acme Renamed"));
  });

  await pdb.dropDatabase();
  console.log("contractflow parties: all passed");
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
