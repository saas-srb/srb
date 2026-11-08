/**
 * SaaS invoice checks — GSTIN validation, tax split + rounding, numbering
 * across financial years, idempotency, credit notes, settings-driven seller /
 * tax / prefix, tenant isolation, PDF — against a throwaway database dropped
 * at the end.
 *
 *   EMAIL_PROVIDER=console MONGODB_URI=mongodb://127.0.0.1:27099/p2d_test_$(date +%s) \
 *     npx --yes tsx --require ./scripts/lib/next-server-shims.cjs scripts/test-saas-invoices.ts
 *
 * Exit 2 = every data check passed but the PDF could not be rendered under tsx
 * (@react-pdf/hyphenate export map); the e2e test downloads real PDFs.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { clientPromise, getPlatformDb } from "@/lib/platform/tenancy/platform-db";
import { getBillingSettings, saveBillingSettings } from "@/lib/platform/billing/settings";
import type { Quote } from "@/lib/platform/billing/quote";
import {
  financialYear,
  getCompanySaasInvoice,
  getSaasInvoice,
  getSaasInvoiceForViewer,
  issueSaasCreditNote,
  issueSaasInvoice,
  listCompanySaasInvoices,
  listCreditNotes,
  listSaasInvoices,
  markSaasInvoicePaid,
  voidSaasInvoice,
} from "@/lib/platform/billing/invoices";
import { allocate, chargeTotal, computeGst, creditNoteAmounts, gstStateCode, gstinError, isValidGstin, splitTax, stateCodeFromGstin, taxOn } from "@/lib/platform/billing/gst";

let checks = 0;
function ok(cond: unknown, msg: string) {
  assert.ok(cond, msg);
  checks++;
}
function eq<T>(a: T, b: T, msg: string) {
  assert.deepEqual(a, b, msg);
  checks++;
}

/** Builds a checksum-valid GSTIN for a state + PAN. */
function makeGstin(state: string, pan: string): string {
  const chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const body = `${state}${pan}1Z`;
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const p = chars.indexOf(body[i]) * (i % 2 === 0 ? 1 : 2);
    sum += Math.floor(p / 36) + (p % 36);
  }
  return body + chars[(36 - (sum % 36)) % 36];
}

function quote(lines: Quote["lines"], rate = 18): Quote {
  const subtotal = lines.filter((l) => l.amount > 0).reduce((a, l) => a + l.amount, 0);
  const discount = -lines.filter((l) => l.amount < 0).reduce((a, l) => a + l.amount, 0);
  return { planId: "growth", interval: "monthly", currency: "INR", lines, subtotal, discount, taxable: subtotal - discount, gstRatePercent: rate, couponId: discount ? "c1" : null, couponError: null };
}

async function main() {
  const db = await getPlatformDb();
  if (!/test/.test(db.databaseName)) throw new Error(`Refusing to run against "${db.databaseName}"`);

  // ── GSTIN validation (one implementation, shared with settings) ──
  eq(isValidGstin("27AAPFU0939F1ZV"), true, "well-known valid GSTIN");
  ok(gstinError("27AAPFU0939F1ZX"), "bad check char rejected");
  ok(gstinError("27AAPFU0939F1Z"), "14 chars rejected");
  ok(gstinError("00AAPFU0939F1ZV"), "unknown state code rejected");
  eq(gstinError("27aapfu0939f1zv"), null, "lowercase is normalised");
  eq(stateCodeFromGstin("27AAPFU0939F1ZV"), "27", "state from GSTIN");
  eq(gstStateCode("Uttar Pradesh"), "09", "state by name");
  eq(gstStateCode("orissa"), "21", "old spelling");
  eq(gstStateCode("9"), "09", "state by code");
  eq(gstStateCode("Atlantis"), null, "unknown state");

  // ── Tax split + rounding ──
  eq(taxOn(100_000, 18), 18_000, "18% of ₹1,000");
  eq(taxOn(25, 18), 5, "4.5 paise rounds half-up");
  eq(splitTax(9, "intra"), { cgst: 4, sgst: 5, igst: 0 }, "odd paisa → SGST");
  eq(splitTax(9, "inter"), { cgst: 0, sgst: 0, igst: 9 }, "inter → IGST");
  for (const total of [1, 99, 100, 117_882, 999_000, 1_178_820, 353_882, 12_345_677]) {
    const intra = computeGst({ amounts: [total], ratePercent: 18, pricesIncludeTax: true, sellerStateCode: "09", buyerStateCode: "09" });
    ok(intra.supplyType === "intra" && intra.taxable + intra.cgst + intra.sgst === total && intra.total === total, `inclusive intra sums for ${total}`);
    const inter = computeGst({ amounts: [total], ratePercent: 18, pricesIncludeTax: true, sellerStateCode: "09", buyerStateCode: "27" });
    ok(inter.supplyType === "inter" && inter.cgst + inter.sgst === 0 && inter.taxable + inter.igst === total, `inclusive inter sums for ${total}`);
    const excl = computeGst({ amounts: [total], ratePercent: 18, pricesIncludeTax: false, sellerStateCode: "09", buyerStateCode: "09" });
    ok(excl.taxable === total && excl.total === total + taxOn(total, 18) && excl.cgst + excl.sgst === excl.tax, `exclusive sums for ${total}`);
    eq(excl.total, chargeTotal(total, 18, false), `chargeTotal matches for ${total}`);
  }
  eq(computeGst({ amounts: [118_000], ratePercent: 18, pricesIncludeTax: true, sellerStateCode: "09", buyerStateCode: "09" }).taxable, 100_000, "₹1,180 incl. → ₹1,000 taxable");
  eq(computeGst({ amounts: [1000], ratePercent: 18, pricesIncludeTax: false, sellerStateCode: "09", buyerStateCode: null }).supplyType, "inter", "unknown buyer state → IGST");
  // Lines with add-on + discount, inclusive: line taxable values sum exactly.
  const mixed = computeGst({ amounts: [99_900, 33_333, -13_323], ratePercent: 18, pricesIncludeTax: true, sellerStateCode: "09", buyerStateCode: "09" });
  eq(mixed.lineTaxable.reduce((a, b) => a + b, 0), mixed.taxable, "inclusive line taxable values sum to the invoice taxable");
  ok(mixed.lineTaxable[2] < 0, "discount line stays negative");
  eq(allocate(10, [1, 1, 1]), [4, 3, 3], "largest remainder allocation");
  eq(computeGst({ amounts: [1000], ratePercent: 0, pricesIncludeTax: false, sellerStateCode: "09", buyerStateCode: "09" }).tax, 0, "0% rate");
  assert.throws(() => computeGst({ amounts: [100, -200], ratePercent: 18, pricesIncludeTax: false, sellerStateCode: null, buyerStateCode: null }), "negative total rejected");
  checks++;

  // Credit note split: partials never exceed any head; the last one closes exactly.
  let rem = { taxable: 100_001, cgst: 9_000, sgst: 9_001, igst: 0, total: 118_002 };
  for (const amt of [33_333, 33_333, 1, 7]) {
    const p = creditNoteAmounts(rem, amt, "intra");
    ok(p.taxable + p.cgst + p.sgst === amt && p.taxable <= rem.taxable && p.cgst <= rem.cgst && p.sgst <= rem.sgst, `partial credit ${amt} within remainder`);
    rem = { taxable: rem.taxable - p.taxable, cgst: rem.cgst - p.cgst, sgst: rem.sgst - p.sgst, igst: 0, total: rem.total - amt };
  }
  eq(creditNoteAmounts(rem, rem.total, "intra"), rem, "crediting the remainder reverses it exactly");
  assert.throws(() => creditNoteAmounts(rem, rem.total + 1, "intra"));
  checks++;

  // ── FY ──
  eq(financialYear(new Date("2026-03-31T18:29:59Z")), "2025-26", "31 Mar 23:59 IST");
  eq(financialYear(new Date("2026-03-31T18:30:00Z")), "2026-27", "1 Apr 00:00 IST");

  // ── Platform billing settings drive the seller, tax and numbering ──
  const now = new Date();
  const owner = randomUUID();
  const intra = randomUUID();
  const inter = randomUUID();
  const fallback = randomUUID();
  const sellerGstin = makeGstin("09", "AAACY1234A");
  const buyerGstin = makeGstin("27", "AABCB5678C");
  ok(isValidGstin(sellerGstin) && isValidGstin(buyerGstin), "test GSTINs valid");
  const sub = (billingDetails: unknown) => ({ planId: "growth", status: "active", interval: "monthly", billingDetails, updatedAt: now });
  await db.collection("companies").insertMany([
    { _id: owner as never, slug: "owner", name: "Owner", status: "active", isPlatformOwner: true, createdAt: now, updatedAt: now },
    { _id: intra as never, slug: "intra", name: "Intra Co", status: "active", isPlatformOwner: false, createdAt: now, updatedAt: now, subscription: sub({ legalName: "Intra Co Pvt Ltd", gstin: null, address: "1 MG Road, Lucknow", state: "Uttar Pradesh", email: "billing@intra.test" }) },
    { _id: inter as never, slug: "inter", name: "Inter Co", status: "active", isPlatformOwner: false, createdAt: now, updatedAt: now, subscription: sub({ legalName: "Inter Co LLP", gstin: buyerGstin, address: "Pune", state: "Karnataka", email: "billing@inter.test" }) },
    { _id: fallback as never, slug: "fallback", name: "Fallback Co", status: "active", isPlatformOwner: false, createdAt: now, updatedAt: now },
  ]);
  await db.collection("admin_users").insertOne({ companyId: fallback, email: "boss@fallback.test", roles: ["super_admin"], createdAt: now });
  await db.collection("billing_plans").insertOne({ _id: "growth" as never, name: "Growth", currency: "INR", priceMonthly: 99_900, priceYearly: 999_000, active: true });

  const base = await getBillingSettings();
  const bad = await saveBillingSettings({ ...base, seller: { ...base.seller, legalName: "X", gstin: "09AAACY1234A1ZX", stateCode: "09" } }, "test");
  ok(!bad.ok && "seller.gstin" in bad.errors, "settings reject a GSTIN with a bad check character (shared validator)");
  const saved = await saveBillingSettings(
    {
      seller: { legalName: "Platform Seller Pvt Ltd", tradeName: "PlatformCo", gstin: sellerGstin, stateCode: "", address: "10 Hazratganj, Lucknow", email: "billing@platform.test", phone: "", pan: "" },
      tax: { gstRatePercent: 18, sacCode: "998315", pricesIncludeTax: false },
      invoice: { prefix: "PLT", footerNote: "Thanks for your business.", terms: "Payable on receipt." },
      billing: base.billing,
    },
    "test",
  );
  ok(saved.ok, "billing settings saved");
  eq((await getBillingSettings()).seller.stateCode, "09", "seller state taken from GSTIN");

  const period = { start: new Date("2026-10-01T00:00:00+05:30"), end: new Date("2026-10-31T23:59:59+05:30") };
  const q = quote([
    { kind: "plan", refId: "growth", label: "Growth (monthly)", amount: 99_900 },
    { kind: "addon", refId: "seats5", label: "5 extra seats", amount: 25_000 },
    { kind: "discount", refId: "c1", label: "Coupon WELCOME10", amount: -12_490 },
  ]);
  const expected = chargeTotal(q.taxable, 18, false);
  const fy = financialYear(now);

  // ── Numbering + idempotency ──
  const r1 = await issueSaasInvoice({ companyId: intra, quote: q, period, paymentRef: "pay_1", paidAt: now, expectedTotal: expected });
  eq(r1?.number, `PLT/${fy.slice(2)}/00001`, "prefix from settings, short FY, 5-digit sequence (≤16 chars)");
  eq(r1?.total, expected, "total = quote taxable + GST");
  eq(await issueSaasInvoice({ companyId: intra, quote: q, period, paymentRef: "pay_1", paidAt: now }), r1, "same paymentRef → same invoice");
  const racers = await Promise.all(Array.from({ length: 5 }, () => issueSaasInvoice({ companyId: inter, quote: q, period, paymentRef: "pay_race", paidAt: now })));
  eq(new Set(racers.map((r) => r?.number)).size, 1, "concurrent duplicates → one invoice");
  eq(racers[0]?.number, `PLT/${fy.slice(2)}/00002`, "no number burnt by the race");
  const parallel = await Promise.all(Array.from({ length: 6 }, (_, i) => issueSaasInvoice({ companyId: intra, lines: [{ kind: "plan", refId: "growth", label: "Growth", amount: 99_900 + i }], paymentRef: `pay_p${i}`, paidAt: now })));
  eq(parallel.map((r) => Number(r!.number.split("/")[2])).sort((a, b) => a - b), [3, 4, 5, 6, 7, 8], "concurrent distinct payments → gap-free sequence");
  eq(await db.collection("saas_invoices").countDocuments({ paymentRef: "pay_race" }), 1, "one document for the raced payment");
  await assert.rejects(issueSaasInvoice({ companyId: intra, quote: q, paymentRef: "pay_mismatch", paidAt: now, expectedTotal: expected + 1 }), /charged/);
  checks++;
  await assert.rejects(issueSaasInvoice({ companyId: intra, quote: q, paidAt: now }), /payment id/);
  checks++;

  // ── Numbering across FY ──
  const lastFy = await issueSaasInvoice({ companyId: intra, lines: [{ kind: "plan", refId: "growth", label: "Growth", amount: 1000 }], paymentRef: "pay_old", paidAt: new Date("2026-03-31T18:00:00Z") });
  eq(lastFy?.number, "PLT/25-26/00001", "previous FY has its own sequence");
  const nextFy = await issueSaasInvoice({ companyId: intra, lines: [{ kind: "plan", refId: "growth", label: "Growth", amount: 1000 }], paymentRef: "pay_new", paidAt: new Date("2027-04-01T00:00:00+05:30") });
  eq(nextFy?.number, "PLT/27-28/00001", "next FY restarts at 1");

  // ── Stored invoice: tax split, lines, snapshots ──
  const i1 = (await getSaasInvoice(r1!.id))!;
  eq(i1.supplyType, "intra", "UP seller → UP buyer = CGST+SGST");
  eq(i1.taxable, 112_410, "taxable = plan + add-on − discount");
  eq(i1.taxable + i1.cgst + i1.sgst, i1.total, "intra parts sum");
  eq(i1.igst, 0, "no IGST intra");
  eq(i1.items.length, 3, "plan, add-on and discount lines");
  eq(i1.items.reduce((a, it) => a + it.taxable, 0), i1.taxable, "lines sum to taxable");
  eq(i1.sac, "998315", "SAC from settings");
  eq(i1.items[0].sac, "998315", "line SAC from settings");
  eq(i1.seller.legalName, "Platform Seller Pvt Ltd", "seller from settings");
  eq(i1.seller.gstin, sellerGstin, "seller GSTIN from settings");
  eq(i1.footerNote, "Thanks for your business.", "footer from settings");
  eq(i1.planName, "Growth", "plan name");
  ok(/^Growth \(monthly\) — 1 Oct 2026 to 31 Oct 2026$/.test(i1.items[0].description), "plan line carries the period");
  ok(i1.emailedAt, "buyer emailed on a paid invoice");
  const i2 = (await getSaasInvoice(racers[0]!.id))!;
  eq(i2.supplyType, "inter", "UP → MH = IGST");
  eq(i2.buyer.stateCode, "27", "GSTIN state wins over the typed state");
  eq(i2.taxable + i2.igst, i2.total, "inter parts sum");
  const fb = await issueSaasInvoice({ companyId: fallback, lines: [{ kind: "plan", refId: "growth", label: "Growth", amount: 99_900 }], paymentRef: "pay_fb", paidAt: now });
  const i3 = (await getSaasInvoice(fb!.id))!;
  eq(i3.buyer.email, "boss@fallback.test", "fallback to owner email");
  eq(i3.supplyType, "inter", "no buyer state → IGST");
  eq(await issueSaasInvoice({ companyId: owner, lines: [{ kind: "plan", refId: "growth", label: "x", amount: 1000 }], paymentRef: "pay_owner", paidAt: now }), null, "owner never invoiced");
  eq(await issueSaasInvoice({ companyId: randomUUID(), lines: [{ kind: "plan", refId: "growth", label: "x", amount: 1000 }], paymentRef: "pay_ghost", paidAt: now }), null, "unknown company");

  // Settings change → new invoices, old ones untouched.
  const s2 = await getBillingSettings();
  await saveBillingSettings({ ...s2, tax: { ...s2.tax, pricesIncludeTax: true }, invoice: { ...s2.invoice, prefix: "NEW" } }, "test");
  const incl = await issueSaasInvoice({ companyId: intra, lines: [{ kind: "plan", refId: "growth", label: "Growth", amount: 118_000 }], paymentRef: "pay_incl", paidAt: now });
  eq(incl?.number, `NEW/${fy.slice(2)}/00010`, "new prefix, same FY counter");
  const iIncl = (await getSaasInvoice(incl!.id))!;
  eq([iIncl.total, iIncl.taxable, iIncl.cgst, iIncl.sgst], [118_000, 100_000, 9_000, 9_000], "prices-include-tax back-calculates");
  eq((await getSaasInvoice(r1!.id))!.seller.legalName, "Platform Seller Pvt Ltd", "issued invoice keeps its snapshot");

  // ── Unpaid → paid / void ──
  const u1 = await issueSaasInvoice({ companyId: inter, lines: [{ kind: "plan", refId: "growth", label: "Growth", amount: 50_000 }] });
  eq((await getSaasInvoice(u1!.id))!.status, "unpaid", "no payment → unpaid");
  eq((await markSaasInvoicePaid(u1!.id, { paymentRef: "pay_1", actorId: "admin" })).ok, false, "a payment ref already used is refused");
  eq((await markSaasInvoicePaid(u1!.id, { paymentRef: "NEFT-123", actorId: "admin" })).ok, true, "mark paid");
  eq((await getSaasInvoice(u1!.id))!.status, "paid", "now paid");
  eq((await markSaasInvoicePaid(u1!.id, { actorId: "admin" })).ok, false, "can't mark paid twice");
  eq((await voidSaasInvoice(u1!.id, { reason: "oops", actorId: "admin" })).ok, false, "paid invoice can't be voided");
  const u2 = await issueSaasInvoice({ companyId: inter, lines: [{ kind: "plan", refId: "growth", label: "Growth", amount: 50_000 }] });
  eq((await voidSaasInvoice(u2!.id, { reason: "", actorId: "admin" })).ok, false, "void needs a reason");
  eq((await voidSaasInvoice(u2!.id, { reason: "Issued in error", actorId: "admin" })).ok, true, "void unpaid");
  eq((await issueSaasCreditNote({ invoiceId: u2!.id, reason: "x", actorId: "admin" })).ok, false, "no credit note on a void invoice");

  // ── Credit notes ──
  const cnA = await issueSaasCreditNote({ invoiceId: r1!.id, amount: 50_000, reason: "Partial refund", refundRef: "rfnd_1", actorId: "system" });
  assert.ok(cnA.ok);
  eq(cnA.creditNote.number, `CN/${fy.slice(2)}/00001`, "credit notes have their own series");
  eq((await issueSaasCreditNote({ invoiceId: r1!.id, amount: 50_000, reason: "Partial refund", refundRef: "rfnd_1", actorId: "system" })), cnA, "same refundRef → same credit note");
  const over = await issueSaasCreditNote({ invoiceId: r1!.id, amount: i1.total, reason: "too much", actorId: "admin" });
  eq(over.ok, false, "can't credit more than what's left");
  const concurrent = await Promise.all([1, 2, 3].map((n) => issueSaasCreditNote({ invoiceId: r1!.id, amount: 10_000, reason: `c${n}`, refundRef: `rfnd_c${n}`, actorId: "system" })));
  ok(concurrent.filter((c) => c.ok).length >= 1, "at least one concurrent credit note succeeds (others told to retry)");
  const rest = await issueSaasCreditNote({ invoiceId: r1!.id, reason: "Cancelled", actorId: "admin" });
  assert.ok(rest.ok);
  const notes = await listCreditNotes(r1!.id);
  const sum = (k: "taxable" | "cgst" | "sgst" | "igst" | "total") => notes.reduce((a, n) => a + n[k], 0);
  eq([sum("taxable"), sum("cgst"), sum("sgst"), sum("igst"), sum("total")], [i1.taxable, i1.cgst, i1.sgst, i1.igst, i1.total], "credit notes reverse the invoice exactly, head by head");
  eq((await getSaasInvoice(r1!.id))!.credited.total, i1.total, "invoice shows fully credited");
  eq((await issueSaasCreditNote({ invoiceId: r1!.id, reason: "again", actorId: "admin" })).ok, false, "nothing left to credit");
  const cnDoc = (await getSaasInvoice(cnA.creditNote.id))!;
  eq([cnDoc.kind, cnDoc.original?.number, cnDoc.supplyType], ["credit_note", r1!.number, "intra"], "credit note links to its invoice with the same tax treatment");

  // ── Tenant isolation ──
  eq((await getCompanySaasInvoice(inter, r1!.id)), null, "company can't fetch another company's invoice");
  eq((await getSaasInvoiceForViewer(r1!.id, { companyId: inter, isPlatformAdmin: false })), null, "viewer from another company → not found");
  eq((await getSaasInvoiceForViewer(cnA.creditNote.id, { companyId: inter, isPlatformAdmin: false })), null, "…nor its credit note");
  eq((await getSaasInvoiceForViewer(r1!.id, { companyId: null, isPlatformAdmin: false })), null, "no company → not found");
  eq((await getSaasInvoiceForViewer(r1!.id, { companyId: intra, isPlatformAdmin: false }))?._id, r1!.id, "own company → found");
  eq((await getSaasInvoiceForViewer(r1!.id, { companyId: owner, isPlatformAdmin: true }))?._id, r1!.id, "platform admin → any");
  ok((await listCompanySaasInvoices(inter)).every((d) => d.companyId === inter), "company list only has its own documents");

  // ── Product list + filters + totals ──
  const all = await listSaasInvoices();
  const cnCount = await db.collection("saas_invoices").countDocuments({ kind: "credit_note" });
  eq(all.totals.creditCount, cnCount, "credit notes counted");
  eq(all.totals.net, all.totals.total - all.totals.credited, "net = invoiced − credited");
  eq(all.totals.taxable + all.totals.tax, all.totals.total, "invoice totals add up");
  eq((await listSaasInvoices({ q: "Inter Co" })).rows.every((r) => r.companyId === inter), true, "search by company name");
  eq((await listSaasInvoices({ fy: "2025-26" })).total, 1, "FY filter");
  eq((await listSaasInvoices({ from: "2026-03-31", to: "2026-03-31" })).total, 1, "IST date range filter");
  eq((await listSaasInvoices({ status: "void" })).total, 1, "status filter");
  eq((await listSaasInvoices({ kind: "credit_note", companyId: intra })).total, cnCount, "kind + company filter");
  eq((await listSaasInvoices({ status: "void" })).totals.total, 0, "void invoices excluded from totals");

  // ── Audit ──
  const actions = await db.collection("platform_audit_log").distinct("action");
  ok(["invoice.issue", "invoice.mark_paid", "invoice.void", "invoice.credit_note"].every((a) => actions.includes(a)), "every change audited");

  // ── PDF ──
  try {
    const { renderSaasInvoicePdf } = await import("@/components/platform/billing/SaasInvoicePdf");
    for (const doc of [i1, i2, cnDoc, (await getSaasInvoice(u2!.id))!]) {
      const pdf = await renderSaasInvoicePdf(doc);
      eq(pdf.subarray(0, 5).toString(), "%PDF-", `PDF renders (${doc.kind} ${doc.status})`);
    }
  } catch (err) {
    console.warn("  pdf: NOT verified under tsx —", err instanceof Error ? err.message.split("\n")[0] : err);
    process.exitCode = 2;
  }
  console.log(`saas invoices: ${checks} checks passed`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    const c = await clientPromise;
    await c.db().dropDatabase();
    await c.close();
  });
