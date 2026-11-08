import assert from "node:assert/strict";
import { getDb } from "../src/lib/mongodb";
import { getPlatformDb } from "../src/lib/platform/tenancy/platform-db";
import { runAsCompany } from "../src/lib/platform/tenancy/context";
import { updateCompanyDetails, getCompanyDetails } from "../src/lib/products/talentos/company";
import { createInvoice } from "../src/lib/products/cashflow-ai/invoices";
import { loadOutwardRows } from "../src/lib/products/cashflow-ai/gst/store";
import { buildSalesRegister } from "../src/lib/products/cashflow-ai/gst/register";
import { salesCsv } from "../src/lib/products/cashflow-ai/gst/csv";

// Runs only against a throwaway database (MONGODB_URI=…/zz_throwaway_*).
const t = async (name: string, fn: () => Promise<void>) => { await fn(); console.log("  ✓", name); };
const MH = "27AAPFU0939F1ZV";
const KA = "29AAACH7409R1ZX";

(async () => {
  assert.ok((await getPlatformDb()).databaseName.startsWith("zz_throwaway_"), "refusing: not a throwaway database");
  await (await getPlatformDb()).dropDatabase();

  await runAsCompany("co_gst_sales", async () => {
    const db = await getDb();
    const now = new Date();
    const c = await getCompanyDetails();
    const { _id, updatedAt, updatedBy, ...rest } = c;
    void _id; void updatedAt; void updatedBy;
    await updateCompanyDetails({ ...rest, gstin: MH, state: "Maharashtra" }, "u1");
    await db.collection("pms_clients").insertMany([
      { _id: "c_ka", companyName: "Other State Ltd", billing: { gstin: KA, currency: "INR" }, createdAt: now, updatedAt: now, deletedAt: null },
      { _id: "c_none", companyName: "Walk-in", billing: { gstin: null, state: "Maharashtra", currency: "INR" }, createdAt: now, updatedAt: now, deletedAt: null },
    ] as never);
    const base = { projectId: null, invoiceDate: "2026-10-12", dueDate: "2026-11-12", discount: 0, currency: "INR", paymentTerms: null, poNumber: null, notes: null };
    const withHsn = await createInvoice({ ...base, customerId: "c_ka", customerName: "Other State Ltd", items: [{ description: "Consulting", quantity: 2, unitPrice: 500, taxRate: 18, hsnSac: "998314" }] }, "u1");
    const withoutHsn = await createInvoice({ ...base, customerId: "c_none", customerName: "Walk-in", items: [{ description: "Old style line", quantity: 1, unitPrice: 200, taxRate: 5 }] }, "u1");
    // an invoice saved before HSN/SAC existed: the stored line simply has no such field
    await db.collection("fms_invoices").updateOne({ _id: withoutHsn._id as never }, { $set: { items: [{ description: "Old style line", quantity: 1, unitPrice: 200, taxRate: 5, lineTotal: 200, taxAmount: 10 }] } });
    await db.collection("fms_invoices").updateMany({}, { $set: { status: "sent" } });

    await t("hsnSac saved through createInvoice is stored and read back by the GST rows", async () => {
      const stored = await db.collection("fms_invoices").findOne({ _id: withHsn._id as never });
      assert.equal((stored as { items: { hsnSac?: string }[] }).items[0].hsnSac, "998314");
      const rows = await loadOutwardRows("2026-10");
      const r = rows.find((x) => x.invoiceId === withHsn._id)!;
      assert.equal(r.lines[0].hsnSac, "998314");
      assert.ok(!r.flags.includes("hsn_sac_missing"));
      assert.deepEqual(r.heads, { cgst: 0, sgst: 0, igst: 180 });
    });

    await t("an invoice without hsnSac still loads and is flagged", async () => {
      const r = (await loadOutwardRows("2026-10")).find((x) => x.invoiceId === withoutHsn._id)!;
      assert.ok(r.flags.includes("hsn_sac_missing"));
      assert.equal(r.lines[0].hsnSac, null);
      assert.equal(r.kind, "b2c");
    });

    await t("the CSV rows add up to the register totals", async () => {
      const rows = await loadOutwardRows("2026-10");
      const reg = buildSalesRegister(rows);
      const lines = salesCsv(rows).trimEnd().split("\r\n").slice(1).map((l) => l.split(","));
      assert.equal(lines.length, 2);
      const col = (i: number) => Math.round(lines.reduce((n, l) => n + Number(l[i]), 0) * 100) / 100;
      assert.equal(col(7), reg.totals.taxable);
      assert.equal(col(8), reg.totals.heads.igst);
      assert.equal(col(9), reg.totals.heads.cgst);
      assert.equal(col(10), reg.totals.heads.sgst);
    });
  });

  await (await getPlatformDb()).dropDatabase();
  console.log("gst sales flow tests passed");
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
