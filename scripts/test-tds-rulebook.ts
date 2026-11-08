import assert from "node:assert/strict";
import { getDb } from "../src/lib/mongodb";
import { getPlatformDb } from "../src/lib/platform/tenancy/platform-db";
import { runAsCompany } from "../src/lib/platform/tenancy/context";
import { builtinRulebook } from "../src/lib/products/cashflow-ai/rulebook/rules";
import { forgetRulebook, saveRulebook } from "../src/lib/products/cashflow-ai/rulebook/rules-store";
import { loadDeductions, saveSection, sectionMap, setSectionUse, TDS_SECTIONS_COLLECTION } from "../src/lib/products/cashflow-ai/tds/store";
import { resolveBillSection } from "../src/lib/products/cashflow-ai/tds/section-input";

// Runs only against a throwaway database (MONGODB_URI=…/zz_throwaway_*).
const t = async (name: string, fn: () => Promise<void>) => { await fn(); console.log("  ✓", name); };
const actor = { id: "u1", email: null };
const admin = { id: "admin", email: "admin@x.in" };
const FY = "2026-27";
const PREV = "2025-26";

(async () => {
  assert.ok((await getPlatformDb()).databaseName.startsWith("zz_throwaway_"), "refusing: not a throwaway database");
  await (await getPlatformDb()).dropDatabase();
  forgetRulebook();

  await runAsCompany("co_rb_a", async () => {
    const db = await getDb();
    const now = new Date();

    await t("the rulebook's sections appear with no company rows, unconfirmed, with the law's numbers", async () => {
      const m = await sectionMap(FY);
      const law = builtinRulebook(FY).tds;
      assert.equal(m.size, law.length);
      const j = m.get("194J(B)")!;
      assert.deepEqual([j.rate, j.noPanRate, j.annualThreshold, j.active, j.confirmed, j.basis], [10, 20, 50000, true, false, "rulebook"]);
      assert.ok([...m.values()].every((s) => !s.confirmed), "the built-in table is unconfirmed everywhere");
      assert.equal((await sectionMap()).size, law.length, "default year works");
    });

    await t("the on/off switch hides a section and keeps the law's numbers; switching back works", async () => {
      assert.ok((await setSectionUse("194h", false, actor, FY)).ok);
      assert.equal((await sectionMap(FY)).get("194H")!.active, false);
      assert.equal((await sectionMap(FY)).get("194H")!.rate, 2);
      assert.equal(resolveBillSection("194H", [...(await sectionMap(FY)).values()]).ok, false);
      assert.ok((await setSectionUse("194H", true, actor, FY)).ok);
      assert.equal((await sectionMap(FY)).get("194H")!.active, true);
      assert.equal(resolveBillSection("194h", [...(await sectionMap(FY)).values()]).ok, true);
      assert.equal((await setSectionUse("194ZZ", true, actor, FY)).ok, false, "only sections on the platform's list");
      assert.equal(await db.collection(TDS_SECTIONS_COLLECTION).countDocuments({ code: "194H" }), 1, "one row, however often it is switched");
    });

    await t("an override wins only with override:true; the law wins otherwise", async () => {
      const row = { code: "194C", label: "Contractors (certificate)", rate: 0.5, singleThreshold: null, annualThreshold: null, noPanRate: null, confirmed: true, active: true };
      assert.ok((await saveSection({ ...row, override: false }, actor)).ok);
      assert.equal((await sectionMap(FY)).get("194C")!.rate, 2, "numbers ignored without the flag");
      assert.ok((await saveSection({ ...row, override: true }, actor)).ok);
      const c = (await sectionMap(FY)).get("194C")!;
      assert.deepEqual([c.rate, c.confirmed, c.basis], [0.5, true, "override"]);
      assert.equal((await sectionMap(PREV)).get("194C")!.rate, 0.5, "an override is the company's, for every year");
    });

    await t("a bracketed section code can be saved as an override", async () => {
      assert.ok((await saveSection({ code: "194i(b)", label: "Rent", rate: 5, singleThreshold: null, annualThreshold: null, noPanRate: null, confirmed: false, active: true, override: true }, actor)).ok);
      assert.equal((await sectionMap(FY)).get("194I(B)")!.rate, 5);
    });

    await t("old rows keep their meaning: no flag = on/off only for rulebook sections; own codes keep their numbers", async () => {
      const base = { note: null, confirmedAt: null, confirmedBy: null, createdAt: now, updatedAt: now, deletedAt: null };
      await db.collection(TDS_SECTIONS_COLLECTION).insertMany([
        { _id: "old1", code: "194A", label: "Interest", rate: 7, singleThreshold: null, annualThreshold: 1, noPanRate: null, confirmed: true, active: true, ...base },
        { _id: "old2", code: "194R", label: "Benefit", rate: 3, singleThreshold: null, annualThreshold: null, noPanRate: null, confirmed: true, active: false, ...base },
        { _id: "old3", code: "194J", label: "Old own code", rate: 12, singleThreshold: null, annualThreshold: 30000, noPanRate: null, confirmed: false, active: true, ...base },
      ] as never);
      const m = await sectionMap(FY);
      assert.equal(m.get("194A")!.rate, 10, "the old number 7 is ignored");
      assert.equal(m.get("194A")!.confirmed, false, "confirmed comes from the rulebook, not the old row");
      assert.equal(m.get("194R")!.active, false, "the old switch-off is respected");
      assert.equal(m.get("194R")!.rate, 10);
      assert.deepEqual([m.get("194J")!.rate, m.get("194J")!.basis], [12, "own"]);
    });

    await t("a bill in an earlier year is checked against that year's table, and unconfirmed/confirmed propagates", async () => {
      await db.collection("prms_vendors").insertOne({ _id: "v1", companyName: "Acme", pan: "ABCPE1234F", createdAt: now, updatedAt: now, deletedAt: null } as never);
      const bill = (id: string, date: string) => ({ _id: id, invoiceNumber: `B-${id}`, vendorId: "v1", vendorName: "Acme", invoiceDate: date, subtotal: 100000, gstAmount: 0, tdsRate: 0, tdsAmount: 0, tdsSection: "194H", status: "pending", createdAt: now, updatedAt: now, deletedAt: null });
      await db.collection("prms_invoices").insertMany([bill("p", "2025-08-01"), bill("c", "2026-08-01")] as never);

      // 2025-26 is published with a different 194H rate and confirmed; 2026-27 stays the built-in (unconfirmed)
      const prev = structuredClone(builtinRulebook(PREV)); // the built-in arrays are shared, never mutate them
      prev.tds.find((s) => s.code === "194H")!.rate = 5;
      assert.ok((await saveRulebook(PREV, prev, true, admin)).ok);

      const old = (await loadDeductions(PREV)).all.find((r) => r.bill.billId === "p")!;
      assert.equal(old.expected, 5000, "5% of 100,000 under last year's table");
      assert.ok(!old.flags.includes("numbers_unconfirmed"), "a confirmed year carries no unconfirmed flag");
      const cur = (await loadDeductions(FY)).all.find((r) => r.bill.billId === "c")!;
      assert.equal(cur.expected, 2000, "2% under this year's table");
      assert.ok(cur.flags.includes("numbers_unconfirmed"), "an unconfirmed year is flagged");
      assert.equal((await sectionMap(PREV)).get("194H")!.confirmed, true);
    });
  });

  await runAsCompany("co_rb_b", async () => {
    await t("another company's switches and overrides do not reach this one", async () => {
      const c = (await sectionMap(FY)).get("194C")!;
      assert.deepEqual([c.rate, c.basis, c.active], [2, "rulebook", true]);
      assert.equal((await sectionMap(FY)).get("194R")!.active, true);
    });
  });

  console.log("tds rulebook tests passed");
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
