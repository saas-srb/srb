import assert from "node:assert/strict";
import { getDb } from "../src/lib/mongodb";
import { getPlatformDb } from "../src/lib/platform/tenancy/platform-db";
import { runAsCompany } from "../src/lib/platform/tenancy/context";
import { listSections, loadDeductions, removeSection, saveSection } from "../src/lib/products/cashflow-ai/tds/store";

// Runs only against a throwaway database (MONGODB_URI=…/zz_throwaway_*).
const t = async (name: string, fn: () => Promise<void>) => { await fn(); console.log("  ✓", name); };
const actor = { id: "u1", email: null };
const sec = (o: Record<string, unknown> = {}) => ({ code: "194j", label: "Professional fees", rate: 10, singleThreshold: null, annualThreshold: 30000, noPanRate: null, confirmed: false, active: true, ...o }) as Parameters<typeof saveSection>[0];

(async () => {
  assert.ok((await getPlatformDb()).databaseName.startsWith("zz_throwaway_"), "refusing: not a throwaway database");
  await (await getPlatformDb()).dropDatabase();

  await runAsCompany("co_tds_a", async () => {
    const db = await getDb();
    const now = new Date();

    await t("a section is saved with its code in capitals, once, and confirmation needs a rate", async () => {
      assert.equal((await saveSection(sec({ code: "" }), actor)).ok, false);
      assert.equal((await saveSection(sec({ confirmed: true, rate: null }), actor)).ok, false);
      assert.ok((await saveSection(sec(), actor)).ok);
      assert.ok((await saveSection(sec({ rate: 12 }), actor)).ok, "saving again updates it");
      await Promise.all([1, 2, 3].map(() => saveSection(sec({ code: "194C", label: "Contractors" }), actor)));
      const list = await listSections();
      assert.deepEqual(list.map((s) => s.code), ["194C", "194J"]);
      assert.equal(list.find((s) => s.code === "194J")!.rate, 12);
    });

    await t("confirming records who and when, and un-confirming clears it", async () => {
      assert.ok((await saveSection(sec({ rate: 12, confirmed: true }), actor)).ok);
      const s = (await listSections()).find((x) => x.code === "194J")!;
      assert.equal(s.confirmed, true);
      assert.equal(s.confirmedBy, "u1");
      assert.ok(s.confirmedAt);
      assert.ok((await saveSection(sec({ rate: 12, confirmed: false }), actor)).ok);
      assert.equal((await listSections()).find((x) => x.code === "194J")!.confirmedAt, null);
    });

    await t("vendor bills of a financial year become deductions, with the vendor's PAN, by quarter", async () => {
      await db.collection("prms_vendors").insertMany([
        { _id: "v1", companyName: "Acme", pan: "ABCPE1234F", createdAt: now, updatedAt: now, deletedAt: null },
        { _id: "v2", companyName: "No PAN Co", pan: null, createdAt: now, updatedAt: now, deletedAt: null },
      ] as never);
      const bill = (id: string, vendorId: string, date: string, sub: number, tds: number, section: string | null, status = "pending") => ({ _id: id, invoiceNumber: `BILL-${id}`, vendorId, vendorName: vendorId, invoiceDate: date, subtotal: sub, gstAmount: sub * 0.18, tdsRate: tds ? 10 : 0, tdsAmount: tds, tdsSection: section, status, createdAt: now, updatedAt: now, deletedAt: null });
      await db.collection("prms_invoices").insertMany([
        bill("a", "v1", "2026-04-10", 50000, 5000, "194J"),
        bill("b", "v1", "2026-10-10", 20000, 2000, "194J"),
        bill("c", "v2", "2026-10-12", 40000, 0, "194J"),
        bill("d", "v1", "2027-04-02", 1000, 100, "194J"), // next financial year
        bill("e", "v1", "2026-11-01", 9000, 900, "194J", "cancelled"),
        bill("f", "v1", "2026-11-05", 1000, 0, null),
      ] as never);
      const { all, rows } = await loadDeductions("2026-27");
      assert.deepEqual(all.map((r) => r.bill.billId).sort(), ["a", "b", "c"].sort(), "cancelled, other-year and no-TDS bills are not deductions; c is listed because TDS was expected");
      const q3 = (await loadDeductions("2026-27", 3)).rows;
      assert.deepEqual(q3.map((r) => r.bill.billId).sort(), ["b", "c"]);
      assert.equal(rows.length, 3);
      const c = all.find((r) => r.bill.billId === "c")!;
      assert.ok(c.flags.includes("pan_missing") && c.flags.includes("not_deducted_but_expected"));
      assert.equal(c.expected, 4800, "10... the saved rate is 12%, on 40,000");
      await assert.rejects(() => loadDeductions("2026-28"));
    });

    await t("a section that was removed can be added again", async () => {
      assert.ok((await saveSection(sec({ code: "194H", label: "Commission" }), actor)).ok);
      assert.ok((await removeSection("194H", actor)).ok);
      assert.equal((await listSections()).some((s) => s.code === "194H"), false);
      assert.ok((await saveSection(sec({ code: "194H", label: "Commission", rate: 5 }), actor)).ok);
      const back = (await listSections()).find((s) => s.code === "194H");
      assert.ok(back && back.rate === 5, "it is visible again");
      await removeSection("194H", actor);
    });

    await t("a section in use by bills cannot be removed, an unused one can", async () => {
      assert.equal((await removeSection("194J", actor)).ok, false);
      assert.ok((await removeSection("194C", actor)).ok);
      assert.deepEqual((await listSections()).map((s) => s.code), ["194J"]);
    });
  });

  await t("another company sees none of this", async () => {
    await runAsCompany("co_tds_b", async () => {
      assert.equal((await listSections()).length, 0);
      assert.equal((await loadDeductions("2026-27")).all.length, 0);
    });
  });

  console.log("tds store tests passed");
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
