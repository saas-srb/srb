import assert from "node:assert/strict";
import { getDb } from "../src/lib/mongodb";
import { getPlatformDb } from "../src/lib/platform/tenancy/platform-db";
import { runAsCompany } from "../src/lib/platform/tenancy/context";
import { updateCompanyDetails, getCompanyDetails } from "../src/lib/products/talentos/company";
import { loadInwardRows, saveItcDecision } from "../src/lib/products/cashflow-ai/gst/store";
import { loadPurchasesView } from "../src/lib/products/cashflow-ai/gst/purchases-data";
import { summarisePurchases } from "../src/lib/products/cashflow-ai/gst/purchases-core";
import { buildPurchasesCsv } from "../src/lib/products/cashflow-ai/gst/purchases-csv";
import { canManageCompliance, canViewFinancialStatements } from "../src/lib/fms-roles";

// Runs only against a throwaway database (MONGODB_URI=…/zz_throwaway_*).
const t = async (name: string, fn: () => Promise<void> | void) => { await fn(); console.log("  ✓", name); };
const actor = { id: "u1", email: null };
const MH = "27AAPFU0939F1ZV";
const KA = "29AAACH7409R1ZX";

(async () => {
  assert.ok((await getPlatformDb()).databaseName.startsWith("zz_throwaway_"), "refusing: not a throwaway database");
  await (await getPlatformDb()).dropDatabase();

  await runAsCompany("co_pur_a", async () => {
    const db = await getDb();
    const now = new Date();
    const c = await getCompanyDetails();
    const { _id, updatedAt, updatedBy, ...rest } = c;
    void _id; void updatedAt; void updatedBy;
    await updateCompanyDetails({ ...rest, gstin: MH, state: "Maharashtra" }, "u1");
    await db.collection("prms_vendors").insertMany([
      { _id: "v_mh", companyName: "Local", gstin: MH, state: "Maharashtra", createdAt: now, updatedAt: now, deletedAt: null },
      { _id: "v_ka", companyName: "Far", gstin: KA, state: "Karnataka", createdAt: now, updatedAt: now, deletedAt: null },
      { _id: "v_none", companyName: "Unregistered", gstin: null, state: null, createdAt: now, updatedAt: now, deletedAt: null },
    ] as never);
    const bill = (id: string, vendorId: string, date: string, sub = 1000, gst = 180, status = "pending") => ({ _id: id, invoiceNumber: `BILL-${id}`, vendorInvoiceNumber: `V-${id}`, invoiceDate: date, vendorId, vendorName: vendorId, currency: "INR", subtotal: sub, gstAmount: gst, totalAmount: sub + gst, netPayable: sub + gst, status, createdAt: now, updatedAt: now, deletedAt: null });
    await db.collection("prms_invoices").insertMany([bill("p", "v_mh", "2026-10-02"), bill("q", "v_ka", "2026-10-20", 2000, 360), bill("r", "v_none", "2026-10-25"), bill("z", "v_mh", "2026-10-26", 500, 0), bill("s", "v_mh", "2026-10-27", 1000, 180, "cancelled"), bill("u", "v_mh", "2026-11-02")] as never);

    await t("decisions and notes are saved and reflected in the register", async () => {
      assert.ok((await saveItcDecision({ billId: "p", decision: "eligible", note: "office rent" }, actor)).ok);
      assert.ok((await saveItcDecision({ billId: "q", decision: "reverse_charge" }, actor)).ok);
      assert.ok((await saveItcDecision({ billId: "r", decision: "blocked", note: "  =danger  " }, actor)).ok);
      const rows = await loadInwardRows("2026-10");
      assert.equal(rows.length, 4, "cancelled and other months left out");
      assert.equal(rows.find((r) => r.billId === "p")!.decision, "eligible");
      assert.equal(rows.find((r) => r.billId === "z")!.decision, "review");
      const view = await loadPurchasesView("2026-10");
      assert.equal(view.notes.get("p"), "office rent");
      assert.equal(view.notes.get("r"), "=danger");
      assert.equal(view.notes.has("q"), false);
      assert.equal(view.vendorIds.get("q"), "v_ka");
      assert.equal(view.registration.gstin, MH);
    });

    await t("a changed decision replaces the old one and clearing the note clears it", async () => {
      assert.ok((await saveItcDecision({ billId: "p", decision: "ineligible", note: "" }, actor)).ok);
      const view = await loadPurchasesView("2026-10");
      assert.equal(view.rows.find((r) => r.billId === "p")!.decision, "ineligible");
      assert.equal(view.notes.has("p"), false);
    });

    await t("summary cards equal the rows; the CSV matches them", async () => {
      const { rows, notes } = await loadPurchasesView("2026-10");
      const s = summarisePurchases(rows);
      assert.equal(s.claimed.total, 360);
      assert.deepEqual(s.claimed.heads, { cgst: 0, sgst: 0, igst: 360 });
      assert.equal(s.blocked.total, 180);
      assert.equal(s.ineligible.total, 180);
      assert.equal(s.toReview.count, 0);
      assert.equal(s.billsWithoutGst, 1);
      const sum = rows.reduce((n, r) => n + Math.round((r.heads.cgst + r.heads.sgst + r.heads.igst) * 100), 0);
      assert.equal(sum, Math.round((s.claimed.total + s.blocked.total + s.ineligible.total + s.toReview.total) * 100));
      const lines = buildPurchasesCsv(rows, notes).trim().split("\r\n");
      assert.equal(lines.length, 5);
      assert.ok(lines.some((l) => l.endsWith(",Blocked,'=danger")));
    });

    await t("permissions: managing needs canManageCompliance, viewing canViewFinancialStatements", () => {
      const u = (roles: string[], permissionOverrides: Record<string, boolean> = {}) => ({ roles, permissionOverrides });
      assert.equal(canManageCompliance(u(["accountant"])), true);
      assert.equal(canViewFinancialStatements(u(["accountant"])), true);
      assert.equal(canManageCompliance(u([])), false);
      assert.equal(canViewFinancialStatements(u([])), false);
      assert.equal(canManageCompliance(u(["accountant"], { "fms.canManageCompliance": false })), false);
    });
  });

  await t("another company sees none of these bills, decisions or notes", async () => {
    await runAsCompany("co_pur_b", async () => {
      const v = await loadPurchasesView("2026-10");
      assert.equal(v.rows.length, 0);
      assert.equal(v.notes.size, 0);
      assert.equal((await saveItcDecision({ billId: "p", decision: "eligible" }, actor)).ok, false, "cannot decide on another company's bill");
    });
  });

  console.log("gst purchases flow tests passed");
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
