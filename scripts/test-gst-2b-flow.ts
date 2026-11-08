import assert from "node:assert/strict";
import { getDb } from "../src/lib/mongodb";
import { getPlatformDb } from "../src/lib/platform/tenancy/platform-db";
import { runAsCompany } from "../src/lib/platform/tenancy/context";
import { updateCompanyDetails, getCompanyDetails } from "../src/lib/products/talentos/company";
import { getActiveUpload, listSupersededUploads, loadGstr2bView, saveGstr2bUpload } from "../src/lib/products/cashflow-ai/gst/gstr2b-store";

// Runs only against a throwaway database (MONGODB_URI=…/zz_throwaway_*).
const t = async (name: string, fn: () => Promise<void>) => { await fn(); console.log("  ✓", name); };
const actor = { id: "u1", email: null };
const MH = "27AAPFU0939F1ZV";
const KA = "29AAACH7409R1ZX";

const file = (inv: Record<string, unknown>[], over: Record<string, unknown> = {}) =>
  JSON.stringify({ data: { gstin: MH, rtnprd: "102026", docdata: { b2b: [{ ctin: KA, trdnm: "Far Vendor", inv }], cdnr: [{ ctin: KA, nt: [{ ntnum: "CN1", typ: "C", dt: "20-10-2026", txval: 100, igst: 18 }] }] }, ...over } });
const inv = (n: string, tax = 180, dt = "05-10-2026") => ({ inum: n, dt, val: 1000 + tax, txval: 1000, igst: tax });

(async () => {
  assert.ok((await getPlatformDb()).databaseName.startsWith("zz_throwaway_"), "refusing: not a throwaway database");
  await (await getPlatformDb()).dropDatabase();

  await runAsCompany("co_2b_a", async () => {
    const db = await getDb();
    const now = new Date();
    const c = await getCompanyDetails();
    const { _id, updatedAt, updatedBy, ...rest } = c;
    void _id; void updatedAt; void updatedBy;

    await t("without a company GSTIN nothing is accepted", async () => {
      const r = await saveGstr2bUpload({ month: "2026-10", fileName: "a.json", text: file([inv("A")]) }, actor);
      assert.equal(r.ok, false);
    });
    await updateCompanyDetails({ ...rest, gstin: MH, state: "Maharashtra" }, "u1");

    await db.collection("prms_vendors").insertMany([
      { _id: "v_ka", companyName: "Far Vendor", gstin: KA, state: "Karnataka", createdAt: now, updatedAt: now, deletedAt: null },
      { _id: "v_none", companyName: "Unregistered", gstin: null, state: null, createdAt: now, updatedAt: now, deletedAt: null },
    ] as never);
    const bill = (id: string, ref: string, date: string, vendorId = "v_ka", gst = 180, status = "pending") => ({ _id: id, invoiceNumber: `BILL-${id}`, vendorInvoiceNumber: ref, invoiceDate: date, vendorId, vendorName: vendorId, currency: "INR", subtotal: 1000, gstAmount: gst, totalAmount: 1000 + gst, netPayable: 1000 + gst, status, createdAt: now, updatedAt: now, deletedAt: null });
    await db.collection("prms_invoices").insertMany([
      bill("b1", "inv-001", "2026-10-03"), // matches INV/001
      bill("b2", "B2", "2026-09-25"), // earlier month, reported in October's 2B
      bill("b3", "B3", "2026-10-10", "v_ka", 200), // amount differs
      bill("b4", "B4", "2026-10-11"), // not in 2B
      bill("b5", "B5", "2026-10-12", "v_none"), // no GSTIN
      bill("b6", "B6", "2026-10-13", "v_ka", 180, "cancelled"), // cancelled: left out
      bill("b7", "B7", "2026-07-01"), // too old for the window
    ] as never);

    const text = file([inv("INV/001"), inv("B2"), inv("B3", 180), inv("ONLY2B"), inv("B7")]);
    await t("an upload is stored and compared with the bills of the month and the two before", async () => {
      const r = await saveGstr2bUpload({ month: "2026-10", fileName: "r2b.json", text }, actor);
      assert.ok(r.ok && r.rows === 5 && r.notes === 1 && !r.replaced);
      const v = (await loadGstr2bView("2026-10"))!;
      assert.deepEqual(v.comparedMonths, ["2026-08", "2026-09", "2026-10"]);
      const by = (s: string) => v.recon.rows.filter((x) => x.status === s).map((x) => x.twoB?.invoiceNumber ?? x.book?.vendorInvoiceNumber).sort();
      assert.deepEqual(by("matched"), ["B2", "INV/001"]);
      assert.deepEqual(by("amount_differs"), ["B3"]);
      assert.deepEqual(by("in_2b_not_in_books"), ["B7", "ONLY2B"]);
      assert.deepEqual(by("in_books_not_in_2b"), ["B4"]);
      assert.deepEqual(v.recon.cannotMatch.map((c) => c.book.billId), ["b5"]);
      assert.equal(v.notes.length, 1);
    });

    await t("the books are read again each time: fixing a bill changes the result with no new upload", async () => {
      await db.collection("prms_invoices").updateOne({ _id: "b3" as never }, { $set: { gstAmount: 180 } });
      const v = (await loadGstr2bView("2026-10"))!;
      assert.equal(v.recon.totals.amount_differs.count, 0);
      assert.equal(v.recon.totals.matched.count, 3);
    });

    await t("the same file again is refused", async () => {
      const r = await saveGstr2bUpload({ month: "2026-10", fileName: "again.json", text }, actor);
      assert.equal(r.ok, false);
    });

    await t("a different file for the month replaces the old; the old stays on record as superseded and its rows go", async () => {
      const first = (await getActiveUpload("2026-10"))!;
      const r = await saveGstr2bUpload({ month: "2026-10", fileName: "r2b-v2.json", text: file([inv("INV/001")]) }, actor);
      assert.ok(r.ok && r.replaced);
      const now2 = (await getActiveUpload("2026-10"))!;
      assert.notEqual(now2._id, first._id);
      const old = await listSupersededUploads("2026-10");
      assert.equal(old.length, 1);
      assert.equal(old[0]._id, first._id);
      assert.equal(old[0].supersededBy, now2._id);
      assert.equal(await db.collection("fms_gstr2b_rows").countDocuments({ uploadId: first._id }), 0);
      assert.equal(await db.collection("fms_gstr2b_uploads").countDocuments({ period: "2026-10" }), 2);
      assert.equal((await loadGstr2bView("2026-10"))!.twoBRows, 1);
      assert.equal(await db.collection("fms_activity_logs").countDocuments({ entityLabel: "GSTR-2B 2026-10" }), 2, "every upload is in the audit trail");
    });

    await t("hostile and wrong files are refused and leave the stored upload alone", async () => {
      const before = (await getActiveUpload("2026-10"))!._id;
      const bad = [
        "{nope",
        file([inv("X")], { gstin: KA }),
        file([inv("X")], { rtnprd: "092026" }),
        "x".repeat(5 * 1024 * 1024 + 10),
        file([], { docdata: { b2b: [{ ctin: KA, inv: [{ inum: "", dt: "bad" }] }] } }),
        '{"data":{"gstin":"' + MH + '","rtnprd":"102026","docdata":{"b2b":{"__proto__":1}}}}',
      ];
      for (const text of bad) assert.equal((await saveGstr2bUpload({ month: "2026-10", fileName: "bad", text }, actor)).ok, false);
      assert.equal((await saveGstr2bUpload({ month: "2026-13", fileName: "bad", text: file([inv("X")]) }, actor)).ok, false);
      assert.equal((await getActiveUpload("2026-10"))!._id, before);
    });

    await t("a CSV is accepted for another month", async () => {
      const csv = `Supplier GSTIN,Invoice Number,Invoice Date,Taxable Value,IGST,CGST,SGST\n${KA},B7,2026-07-01,1000,180,0,0\n`;
      const r = await saveGstr2bUpload({ month: "2026-09", fileName: "ca.csv", text: csv }, actor);
      assert.ok(r.ok && r.rows === 1);
      const v = (await loadGstr2bView("2026-09"))!;
      assert.equal(v.upload.source, "csv");
      assert.equal(v.recon.totals.matched.count, 1, "the July bill B7 is inside September's window (two months back)");
    });
  });

  await t("a bill found in an earlier month's statement is not reported missing from a later month's", async () => {
    await runAsCompany("co_2b_c", async () => {
      const db = await getDb();
      const now = new Date();
      const c = await getCompanyDetails();
      const { _id, updatedAt, updatedBy, ...rest } = c;
      void _id; void updatedAt; void updatedBy;
      await updateCompanyDetails({ ...rest, gstin: MH, state: "Maharashtra" }, "u1");
      await db.collection("prms_vendors").insertOne({ _id: "v_x", companyName: "X", gstin: KA, state: "Karnataka", createdAt: now, updatedAt: now, deletedAt: null } as never);
      const bill = (id: string, ref: string, date: string) => ({ _id: id, invoiceNumber: `BILL-${id}`, vendorInvoiceNumber: ref, invoiceDate: date, vendorId: "v_x", vendorName: "X", currency: "INR", subtotal: 1000, gstAmount: 180, totalAmount: 1180, netPayable: 1180, status: "pending", createdAt: now, updatedAt: now, deletedAt: null });
      await db.collection("prms_invoices").insertMany([bill("sep", "SEP-1", "2026-09-10"), bill("oct", "OCT-1", "2026-10-05"), bill("lost", "LOST-1", "2026-09-12")] as never);
      const csv = (rows: string[]) => `Supplier GSTIN,Invoice Number,Invoice Date,Taxable Value,IGST,CGST,SGST\n${rows.map((r) => `${KA},${r},2026-09-10,1000,180,0,0`).join("\n")}\n`;
      assert.ok((await saveGstr2bUpload({ month: "2026-09", fileName: "sep.csv", text: csv(["SEP-1"]) }, actor)).ok);
      assert.ok((await saveGstr2bUpload({ month: "2026-10", fileName: "oct.csv", text: csv(["OCT-1"]) }, actor)).ok);
      const v = (await loadGstr2bView("2026-10"))!;
      const missing = v.recon.rows.filter((r) => r.status === "in_books_not_in_2b").map((r) => r.book!.billNumber);
      assert.deepEqual(missing, ["BILL-lost"], "SEP-1 was settled in September's statement; only the bill that never appeared is reported");
    });
  });

  await t("another company sees nothing of this", async () => {
    await runAsCompany("co_2b_b", async () => {
      assert.equal(await getActiveUpload("2026-10"), null);
      assert.equal(await loadGstr2bView("2026-10"), null);
      assert.equal((await listSupersededUploads("2026-10")).length, 0);
    });
  });

  console.log("gst 2b flow tests passed");
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
