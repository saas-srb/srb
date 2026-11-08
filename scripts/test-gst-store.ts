import assert from "node:assert/strict";
import { getDb } from "../src/lib/mongodb";
import { getPlatformDb } from "../src/lib/platform/tenancy/platform-db";
import { runAsCompany } from "../src/lib/platform/tenancy/context";
import { updateCompanyDetails, getCompanyDetails } from "../src/lib/products/talentos/company";
import { loadGstr3b, loadInwardRows, loadOutwardRows, monthRange, saveItcDecision } from "../src/lib/products/cashflow-ai/gst/store";

// Runs only against a throwaway database (MONGODB_URI=…/zz_throwaway_*).
const t = async (name: string, fn: () => Promise<void>) => { await fn(); console.log("  ✓", name); };
const actor = { id: "u1", email: null };
const MH = "27AAPFU0939F1ZV";
const KA = "29AAACH7409R1ZX";

(async () => {
  assert.ok((await getPlatformDb()).databaseName.startsWith("zz_throwaway_"), "refusing: not a throwaway database");
  await (await getPlatformDb()).dropDatabase();

  await runAsCompany("co_gst_a", async () => {
    const db = await getDb();
    const now = new Date();
    const c = await getCompanyDetails();
    const { _id, updatedAt, updatedBy, ...rest } = c;
    void _id; void updatedAt; void updatedBy;
    await updateCompanyDetails({ ...rest, gstin: MH, state: "Maharashtra" }, "u1");
    await db.collection("pms_clients").insertMany([
      { _id: "c_mh", companyName: "Same State Ltd", billing: { gstin: MH, currency: "INR" }, createdAt: now, updatedAt: now, deletedAt: null },
      { _id: "c_ka", companyName: "Other State Ltd", billing: { gstin: KA, currency: "INR" }, createdAt: now, updatedAt: now, deletedAt: null },
      { _id: "c_none", companyName: "Walk-in", billing: { gstin: null, currency: "INR" }, createdAt: now, updatedAt: now, deletedAt: null },
    ] as never);
    const inv = (id: string, customerId: string, date: string, status = "sent", taxable = 1000, rate = 18) => ({ _id: id, invoiceNumber: `INV-${id}`, invoiceDate: date, customerId, customerName: customerId, currency: "INR", items: [{ description: "Service", quantity: 1, unitPrice: taxable, taxRate: rate, lineTotal: taxable, taxAmount: taxable * rate / 100 }], discount: 0, subtotal: taxable, taxAmount: taxable * rate / 100, totalAmount: taxable * (1 + rate / 100), status, createdAt: now, updatedAt: now, deletedAt: null });
    await db.collection("fms_invoices").insertMany([
      inv("a", "c_mh", "2026-10-03"), inv("b", "c_ka", "2026-10-31"), inv("c", "c_none", "2026-10-15"),
      inv("d", "c_mh", "2026-10-10", "draft"), inv("e", "c_mh", "2026-10-11", "cancelled"), inv("f", "c_mh", "2026-11-01"), inv("g", "c_mh", "2026-09-30"),
    ] as never);
    await db.collection("prms_vendors").insertMany([
      { _id: "v_mh", companyName: "Local Vendor", gstin: MH, state: "Maharashtra", createdAt: now, updatedAt: now, deletedAt: null },
      { _id: "v_ka", companyName: "Far Vendor", gstin: KA, state: "Karnataka", createdAt: now, updatedAt: now, deletedAt: null },
      { _id: "v_none", companyName: "Unregistered", gstin: null, state: null, createdAt: now, updatedAt: now, deletedAt: null },
    ] as never);
    const bill = (id: string, vendorId: string, date: string, sub = 1000, gst = 180, status = "pending") => ({ _id: id, invoiceNumber: `BILL-${id}`, vendorInvoiceNumber: `V-${id}`, invoiceDate: date, vendorId, vendorName: vendorId, currency: "INR", subtotal: sub, gstAmount: gst, totalAmount: sub + gst, netPayable: sub + gst, status, createdAt: now, updatedAt: now, deletedAt: null });
    await db.collection("prms_invoices").insertMany([bill("p", "v_mh", "2026-10-02"), bill("q", "v_ka", "2026-10-20"), bill("r", "v_none", "2026-10-25"), bill("s", "v_mh", "2026-10-26", 1000, 180, "cancelled"), bill("u", "v_mh", "2026-11-02")] as never);

    await t("a month is the first to the last day, including leap February", async () => {
      assert.deepEqual(monthRange("2026-10"), { from: "2026-10-01", to: "2026-10-31" });
      assert.deepEqual(monthRange("2028-02"), { from: "2028-02-01", to: "2028-02-29" });
      assert.deepEqual(monthRange("2027-02"), { from: "2027-02-01", to: "2027-02-28" });
      assert.throws(() => monthRange("2026-13"));
    });

    await t("sales of the month: issued only, month edges included, same-state split and inter-state IGST", async () => {
      const rows = await loadOutwardRows("2026-10");
      assert.deepEqual(rows.map((r) => r.invoiceNumber), ["INV-a", "INV-c", "INV-b"].sort((x, y) => rows.findIndex((r) => r.invoiceNumber === x) - rows.findIndex((r) => r.invoiceNumber === y)));
      assert.equal(rows.length, 3, "draft, cancelled and other months are left out");
      const a = rows.find((r) => r.invoiceId === "a")!;
      assert.equal(a.supply, "intra");
      assert.deepEqual(a.heads, { cgst: 90, sgst: 90, igst: 0 });
      const b = rows.find((r) => r.invoiceId === "b")!;
      assert.deepEqual(b.heads, { cgst: 0, sgst: 0, igst: 180 });
      const c = rows.find((r) => r.invoiceId === "c")!;
      assert.equal(c.kind, "b2c");
      assert.ok(c.flags.includes("place_of_supply_unknown"));
    });

    await t("purchases of the month: cancelled and other months left out; vendor state decides the split; undecided = review", async () => {
      const rows = await loadInwardRows("2026-10");
      assert.equal(rows.length, 3);
      assert.ok(rows.every((r) => r.decision === "review"));
      assert.deepEqual(rows.find((r) => r.billId === "p")!.heads, { cgst: 90, sgst: 90, igst: 0 });
      assert.deepEqual(rows.find((r) => r.billId === "q")!.heads, { cgst: 0, sgst: 0, igst: 180 });
      assert.ok(rows.find((r) => r.billId === "r")!.flags.includes("gst_without_vendor_gstin"));
    });

    await t("the company's decision on input credit is saved, validated, changeable and audited", async () => {
      assert.equal((await saveItcDecision({ billId: "p", decision: "maybe" }, actor)).ok, false);
      assert.equal((await saveItcDecision({ billId: "nope", decision: "eligible" }, actor)).ok, false);
      assert.ok((await saveItcDecision({ billId: "p", decision: "eligible" }, actor)).ok);
      assert.ok((await saveItcDecision({ billId: "q", decision: "blocked", note: "  food and beverages  " }, actor)).ok);
      assert.ok((await saveItcDecision({ billId: "p", decision: "eligible" }, actor)).ok, "saving the same again is fine");
      await Promise.all([1, 2, 3].map(() => saveItcDecision({ billId: "r", decision: "ineligible" }, actor)));
      assert.equal(await db.collection("fms_gst_itc").countDocuments({ billId: "r" }), 1, "one decision per bill, even when saved together");
      const rows = await loadInwardRows("2026-10");
      assert.equal(rows.find((r) => r.billId === "p")!.decision, "eligible");
      assert.equal(rows.find((r) => r.billId === "q")!.decision, "blocked");
    });

    await t("GSTR-3B working for the month adds up from the same rows", async () => {
      const { working } = await loadGstr3b("2026-10");
      assert.equal(working.outward.taxable, 3000);
      assert.deepEqual(working.outward.heads, { cgst: 90 + 90, sgst: 90 + 90, igst: 180 });
      assert.deepEqual(working.itc.claimed, { cgst: 90, sgst: 90, igst: 0 });
      assert.deepEqual(working.itc.blocked, { cgst: 0, sgst: 0, igst: 180 });
      assert.deepEqual(working.netByHead, { cgst: 90, sgst: 90, igst: 180 });
    });

    await t("a customer's state decides IGST for a sale to someone with no GSTIN", async () => {
      await db.collection("pms_clients").insertOne({ _id: "c_ka_b2c", companyName: "Consumer in Bengaluru", billing: { gstin: null, state: "Karnataka", currency: "INR" }, createdAt: now, updatedAt: now, deletedAt: null } as never);
      await db.collection("fms_invoices").insertOne(inv("h", "c_ka_b2c", "2026-10-12") as never);
      const rows = await loadOutwardRows("2026-10");
      const h = rows.find((r) => r.invoiceId === "h")!;
      assert.equal(h.kind, "b2c");
      assert.equal(h.supply, "inter");
      assert.deepEqual(h.heads, { cgst: 0, sgst: 0, igst: 180 });
      assert.ok(!h.flags.includes("place_of_supply_unknown"));
      await db.collection("fms_invoices").deleteOne({ _id: "h" as never });
    });

    await t("credit notes come off the month's sales, debit notes add to purchases, and the month is the Indian month", async () => {
      await db.collection("fms_credit_notes").insertMany([
        { _id: "cn1", creditNoteNumber: "CN-1", invoiceId: "a", amount: 590, status: "issued", issuedAt: new Date("2026-10-20T10:00:00+05:30"), createdAt: now, updatedAt: now, deletedAt: null },
        { _id: "cn_draft", creditNoteNumber: "CN-D", invoiceId: "a", amount: 100, status: "draft", issuedAt: null, createdAt: now, updatedAt: now, deletedAt: null },
        { _id: "cn_next", creditNoteNumber: "CN-N", invoiceId: "a", amount: 100, status: "issued", issuedAt: new Date("2026-10-31T19:00:00Z"), createdAt: now, updatedAt: now, deletedAt: null }, // 00:30 on 1 November in India
      ] as never);
      await db.collection("fms_debit_notes").insertOne({ _id: "dn1", debitNoteNumber: "DN-1", billId: "p", amount: 118, status: "issued", issuedAt: new Date("2026-10-22T10:00:00+05:30"), createdAt: now, updatedAt: now, deletedAt: null } as never);
      const { working, creditNotes, debitNotes } = await loadGstr3b("2026-10");
      assert.equal(creditNotes.length, 1, "only the issued note of the month; the draft and the 1 November (IST) note are left out");
      assert.equal(working.outward.taxable, 2500);
      assert.deepEqual(working.outward.heads, { cgst: 135, sgst: 135, igst: 180 });
      assert.equal(debitNotes.length, 1);
      assert.deepEqual(working.itc.claimed, { cgst: 99, sgst: 99, igst: 0 }, "the debit note carries its bill's 'eligible' decision");
      assert.deepEqual(working.netByHead, { cgst: 36, sgst: 36, igst: 180 });
      const nov = await loadGstr3b("2026-11");
      assert.equal(nov.creditNotes.length, 1);
    });
  });

  await t("another company sees none of this", async () => {
    await runAsCompany("co_gst_b", async () => {
      assert.equal((await loadOutwardRows("2026-10")).length, 0);
      assert.equal((await loadInwardRows("2026-10")).length, 0);
    });
  });

  console.log("gst store tests passed");
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
