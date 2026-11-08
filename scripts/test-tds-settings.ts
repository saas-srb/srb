import assert from "node:assert/strict";
import { getDb } from "../src/lib/mongodb";
import { getPlatformDb } from "../src/lib/platform/tenancy/platform-db";
import { runAsCompany } from "../src/lib/platform/tenancy/context";
import { parseOptionalNumber, parseSectionForm, resolveBillSection } from "../src/lib/products/cashflow-ai/tds/section-input";
import { listSections, saveSection } from "../src/lib/products/cashflow-ai/tds/store";
import { createInvoice, updateInvoice, getInvoice, type InvoiceWriteData } from "../src/lib/products/spendiq/invoices";
import { validateVendor } from "../src/lib/products/spendiq/validation";

// Runs only against a throwaway database (MONGODB_URI=…/zz_throwaway_*).
const t = async (name: string, fn: () => Promise<void> | void) => { await fn(); console.log("  ✓", name); };
const actor = { id: "u1", email: null };

(async () => {
  assert.ok((await getPlatformDb()).databaseName.startsWith("zz_throwaway_"), "refusing: not a throwaway database");
  await (await getPlatformDb()).dropDatabase();

  await t("numbers are parsed strictly; empty is not entered, never 0", () => {
    assert.deepEqual(parseOptionalNumber("", "Rate", 100), { ok: true, value: null });
    assert.deepEqual(parseOptionalNumber("  ", "Rate", 100), { ok: true, value: null });
    assert.deepEqual(parseOptionalNumber("0", "Rate", 100), { ok: true, value: 0 });
    assert.deepEqual(parseOptionalNumber("1,00,000", "Limit", 1e10), { ok: true, value: 100000 });
    for (const bad of ["abc", "-1", "1e3", "0x10", "10%", "101", "1.2.3"]) assert.equal(parseOptionalNumber(bad, "Rate", 100).ok, false, bad);
  });

  await t("the section form is validated as a whole", () => {
    const ok = parseSectionForm({ code: "194j", label: " Fees ", rate: "10", annualThreshold: "30,000", singleThreshold: "", noPanRate: "" });
    assert.ok(ok.ok && ok.value.code === "194J" && ok.value.rate === 10 && ok.value.annualThreshold === 30000 && ok.value.singleThreshold === null && ok.value.active);
    assert.equal(parseSectionForm({ code: "", label: "x" }).ok, false);
    const noRate = parseSectionForm({ code: "194J", label: "Fees", confirmed: true, rate: "" });
    assert.ok(!noRate.ok && noRate.errors.rate);
    const badNum = parseSectionForm({ code: "194J", label: "Fees", rate: "ten" });
    assert.ok(!badNum.ok && badNum.errors.rate);
  });

  await t("a bill section must be a set-up, active section (old ones may be kept)", () => {
    const secs = [{ code: "194J", active: true }, { code: "194C", active: false }];
    assert.deepEqual(resolveBillSection("", secs), { ok: true, value: null });
    assert.deepEqual(resolveBillSection("194j", secs), { ok: true, value: "194J" });
    assert.equal(resolveBillSection("194Z", secs).ok, false);
    assert.equal(resolveBillSection("194C", secs).ok, false);
    assert.deepEqual(resolveBillSection("194C", secs, "194C"), { ok: true, value: "194C" });
  });

  await t("vendor save refuses a malformed PAN and accepts empty", () => {
    const base = { companyName: "Acme" };
    const bad = validateVendor({ ...base, pan: "ABC123" });
    assert.ok(!bad.valid && bad.errors.pan);
    assert.ok(validateVendor({ ...base, pan: "abcpe1234f" }).valid, "a good PAN passes (any case)");
    const fourth = validateVendor({ ...base, pan: "ABCDE1234F" });
    assert.ok(!fourth.valid && fourth.errors.pan, "4th letter must be a holder type");
    const empty = validateVendor({ ...base, pan: "" });
    assert.ok(empty.valid);
  });

  await runAsCompany("co_tds_set", async () => {
    const db = await getDb();
    await t("a bill saved with a section keeps it; editing without one keeps it; an attachment-only update leaves it", async () => {
      assert.ok((await saveSection({ code: "194J", label: "Fees", rate: 10, singleThreshold: null, annualThreshold: null, noPanRate: null, confirmed: false, active: true }, actor)).ok);
      const secs = await listSections();
      assert.deepEqual(resolveBillSection("194j", secs), { ok: true, value: "194J" });
      assert.equal(resolveBillSection("nope", secs).ok, false);
      const data: InvoiceWriteData = { vendorId: "v1", vendorName: "Acme", vendorInvoiceNumber: "A-1", poId: null, poNumber: null, invoiceDate: "2026-10-10", dueDate: null, subtotal: 1000, gstAmount: 0, tdsRate: 10, tdsSection: "194J", currency: "INR", notes: null };
      const created = await createInvoice(data, "u1");
      assert.equal((await getInvoice(created._id))!.tdsSection, "194J");
      const { tdsSection: _omit, ...noSection } = data;
      void _omit;
      assert.ok((await updateInvoice(created._id, { ...noSection, notes: "x" }, "u1")).ok);
      assert.equal((await getInvoice(created._id))!.tdsSection, "194J");
      assert.ok((await updateInvoice(created._id, { ...data, tdsSection: null }, "u1")).ok);
      assert.equal((await getInvoice(created._id))!.tdsSection, null);
      void db;
    });
  });

  await (await getPlatformDb()).dropDatabase();
  console.log("done");
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
