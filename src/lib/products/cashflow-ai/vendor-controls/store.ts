import "server-only";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { newId } from "@/lib/products/cashflow-ai/db";
import { encryptField, decryptField, isEncryptionConfigured, type EncryptedValue } from "@/lib/products/cashflow-ai/crypto";
import { getBeneficiaryByEntity, listBeneficiaries, revealBeneficiaryAccount, type BeneficiaryBankAccount } from "@/lib/products/cashflow-ai/beneficiaries";
import { alertOwners } from "@/lib/products/cashflow-ai/payment-alerts";
import { recordAudit } from "@/lib/products/cashflow-ai/audit";
import { getInvoice } from "@/lib/products/spendiq/invoices";
import { listPaymentsForInvoice } from "@/lib/products/spendiq/payments";
import {
  adjustProblem, bankStatus, fromPaise, last4Of, msmeBill, parsePaymentDays, sameDetails, toPaise, validateAdvance, validateMsme, validateVerification, verifierProblem,
  type AdvanceKind, type AdvanceStatus, type BankDetails, type BankStatus, type MsmeBillState, type MsmeCategory, type VerifyMethod,
} from "@/lib/products/cashflow-ai/vendor-controls/core";

/**
 * Vendor controls, with the database. Three records, all per company:
 *  - `fms_vendor_bank_state`: for each vendor, the bank details a person has verified (what payments use) and any newer details still waiting
 *    for a second person. Payments never use the Bank Directory row directly, so a changed account cannot be paid until it is verified.
 *  - `fms_vendor_msme`: Udyam number and category, kept here so the SpendIQ vendor record is untouched.
 *  - `fms_vendor_advances`: money paid ahead to a vendor. A register only: nothing is posted to the ledger (it is cash-basis).
 */

const BANK = "fms_vendor_bank_state";
const MSME = "fms_vendor_msme";
const ADVANCES = "fms_vendor_advances";
const SETTINGS = "fms_vendor_controls_settings";
const OPEN_BILL = ["pending", "approved", "partially_paid", "overdue"];

type Actor = { id: string; email: string | null };

/* ---------- Bank details ---------- */

interface HistoryEntry {
  at: Date;
  by: string | null;
  kind: "first_entry" | "changed" | "reverted" | "verified";
  /** Only the last four digits of an account number are ever kept here. */
  oldLast4: string | null;
  newLast4: string | null;
  ifscChanged: boolean;
  upiChanged: boolean;
  method?: VerifyMethod;
  note?: string;
}

interface Snapshot {
  detailsEnc: EncryptedValue;
  last4: string;
  ifsc: string | null;
  upiSet: boolean;
}

interface BankState {
  _id: string;
  vendorName: string;
  /** What payments use. Null until someone verifies (or, for a first entry never changed since, until the baseline is taken). */
  verified: (Snapshot & { verifiedBy: string | null; verifiedAt: Date; method: VerifyMethod | null; note: string | null; baseline: boolean }) | null;
  /** Newer details waiting for a second person. `token` names exactly these details, so a verification cannot bless later ones. */
  pending: (Snapshot & { token: string; changedBy: string | null; changedAt: Date }) | null;
  history: HistoryEntry[];
}

async function bankCol() {
  return (await getDb()).collection<BankState>(BANK);
}

const detailsOf = (b: BeneficiaryBankAccount): BankDetails => ({ name: b.beneficiaryName, account: revealBeneficiaryAccount(b), ifsc: b.ifsc, upi: b.upiId });

function snapshot(d: BankDetails): Snapshot {
  return { detailsEnc: encryptField(JSON.stringify(d)), last4: last4Of(d.account), ifsc: d.ifsc ?? null, upiSet: !!d.upi };
}

function open(s: Pick<Snapshot, "detailsEnc">): BankDetails | null {
  const raw = decryptField(s.detailsEnc);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as BankDetails;
  } catch {
    return null;
  }
}

/** True when the Bank Directory row has not been edited since it was first saved (rows saved before edits were tracked count as such). */
function neverChanged(b: BeneficiaryBankAccount): boolean {
  if (!b.detailsChangedAt) return true;
  return Math.abs(b.detailsChangedAt.getTime() - b.createdAt.getTime()) < 200; // both stamped in the same save
}

/**
 * Brings the verification record up to date with the Bank Directory row, the one place a vendor's payable details live. Safe to call at any
 * time and from any screen: if the details differ from what was verified, they become "waiting" (and the owners are told, once); if they were
 * changed back to the verified ones the wait is dropped. A vendor first saved and never edited is taken as the starting point, so a company
 * is not locked out of paying existing vendors, but it is shown as "not independently checked" until a person verifies it.
 */
export async function syncVendorBank(vendorId: string): Promise<{ state: BankState | null; current: BeneficiaryBankAccount | null }> {
  const col = await bankCol();
  const b = await getBeneficiaryByEntity("vendor", vendorId);
  let state = await col.findOne({ _id: vendorId });
  if (!b || !isEncryptionConfigured()) return { state, current: b };
  const cur = detailsOf(b);
  const now = new Date();
  const first = (kind: HistoryEntry["kind"], oldLast4: string | null): HistoryEntry => ({ at: now, by: b.updatedBy ?? null, kind, oldLast4, newLast4: last4Of(cur.account), ifscChanged: false, upiChanged: false });

  if (!state) {
    const snap = snapshot(cur);
    const doc: BankState = neverChanged(b)
      ? { _id: vendorId, vendorName: b.beneficiaryName, verified: { ...snap, verifiedBy: null, verifiedAt: now, method: null, note: null, baseline: true }, pending: null, history: [first("first_entry", null)] }
      : { _id: vendorId, vendorName: b.beneficiaryName, verified: null, pending: { ...snap, token: newId(), changedBy: b.updatedBy ?? null, changedAt: b.detailsChangedAt ?? now }, history: [first("changed", null)] };
    const made = await col.updateOne({ _id: vendorId }, { $setOnInsert: doc }, { upsert: true });
    if (made.upsertedCount === 1 && doc.pending) await tellOwnersChanged(b, null, doc.pending.last4);
    state = await col.findOne({ _id: vendorId });
    return { state, current: b };
  }

  const verified = state.verified ? open(state.verified) : null;
  if (verified && sameDetails(verified, cur)) {
    if (state.pending) {
      await col.updateOne({ _id: vendorId, "pending.token": state.pending.token }, { $set: { pending: null }, $push: { history: { $each: [{ ...first("reverted", state.pending.last4), oldLast4: state.pending.last4 }], $slice: -100 } } as never });
      state = await col.findOne({ _id: vendorId });
    }
    return { state, current: b };
  }
  const pending = state.pending ? open(state.pending) : null;
  if (pending && sameDetails(pending, cur)) return { state, current: b };

  // New details, not yet seen: they wait. The filter makes sure only one of two simultaneous readers records (and announces) the change.
  const snap = snapshot(cur);
  const old = verified;
  const entry: HistoryEntry = { ...first("changed", state.pending?.last4 ?? state.verified?.last4 ?? null), ifscChanged: !!old && (old.ifsc ?? "") !== (cur.ifsc ?? ""), upiChanged: !!old && (old.upi ?? "") !== (cur.upi ?? "") };
  const res = await col.updateOne(
    { _id: vendorId, "pending.token": state.pending?.token ?? null },
    { $set: { vendorName: b.beneficiaryName, pending: { ...snap, token: newId(), changedBy: b.updatedBy ?? null, changedAt: b.detailsChangedAt ?? now } }, $push: { history: { $each: [entry], $slice: -100 } } as never },
  );
  if (res.modifiedCount === 1) {
    await tellOwnersChanged(b, state.verified?.last4 ?? null, snap.last4);
    await recordAudit({ actorId: b.updatedBy ?? "system", action: "update", entity: "vendor", entityId: vendorId, entityLabel: b.beneficiaryName, summary: `Bank details changed (account ending ${state.verified?.last4 ?? "none"} → ${snap.last4}); waiting for verification` }).catch(() => {});
  }
  return { state: await col.findOne({ _id: vendorId }), current: b };
}

async function tellOwnersChanged(b: BeneficiaryBankAccount, oldLast4: string | null, newLast4: string) {
  await alertOwners("A vendor's bank details need independent verification", [
    `${b.beneficiaryName}: the bank account now ends ${newLast4}${oldLast4 ? ` (it was ${oldLast4})` : ""}.`,
    oldLast4 ? "Until a second person verifies the new details with the vendor, payments keep going to the old verified account." : "Until a second person verifies the details with the vendor, this vendor cannot be paid.",
    "A person other than whoever made the change must check them (for example by phoning a number you already had) under CashFlow → Vendor controls.",
  ]);
}

export interface VendorPayable {
  ok: true;
  name: string;
  details: BankDetails;
  /** When the details being paid were last changed, for the cooling-off wait: set only when the Bank Directory row is exactly what was verified. */
  holdFrom: Date | null;
}

/** The details a payment to this vendor may use: the verified ones, never newer unverified ones. */
export async function vendorVerifiedPayee(vendorId: string, vendorName: string): Promise<VendorPayable | { ok: false; error: string }> {
  const who = vendorName || "This vendor";
  if (!isEncryptionConfigured()) return { ok: false, error: "Secure storage for bank details is not set up on this server (PLATFORM_ENCRYPTION_KEY), so vendor bank details cannot be checked." };
  const { state, current } = await syncVendorBank(vendorId);
  if (!current && !state?.verified) return { ok: false, error: `${who} has no bank details saved. Add them under Beneficiaries first, then pay.` };
  const verified = state?.verified ? open(state.verified) : null;
  if (!verified) {
    return state?.pending
      ? { ok: false, error: `${current?.beneficiaryName ?? who}'s bank details have not been verified yet. A second person must check them with the vendor under Vendor controls before this vendor can be paid.` }
      : { ok: false, error: `${current?.beneficiaryName ?? who}'s bank details could not be read. Save them again under Beneficiaries.` };
  }
  if (!verified.account && !verified.upi) return { ok: false, error: `${who}'s bank details could not be read. Save them again under Beneficiaries.` };
  const same = !!current && sameDetails(verified, detailsOf(current));
  return { ok: true, name: verified.name || who, details: verified, holdFrom: same ? (current.detailsChangedAt ?? null) : null };
}

/**
 * For the payout starter: null when `payee` is exactly the verified details of the vendor, else the sentence to show. A payment typed in by
 * hand for a vendor, or built from the Bank Directory row, cannot go to details nobody has verified.
 */
export async function vendorPayoutProblem(vendorId: string, payee: { accountNumber?: string | null; ifsc?: string | null; upiId?: string | null; name?: string | null }): Promise<string | null> {
  const v = await vendorVerifiedPayee(vendorId, payee.name ?? "");
  if (!v.ok) return v.error;
  const same = sameDetails({ ...v.details, name: null }, { name: null, account: payee.accountNumber ?? null, ifsc: payee.ifsc ?? null, upi: payee.upiId ?? null });
  return same ? null : "These bank details are not the ones verified for this vendor. Use the verified details, or have a second person verify the new ones under Vendor controls.";
}

export async function verifyVendorDetails(vendorId: string, input: { token: unknown; method: unknown; note: unknown }, actor: Actor): Promise<{ ok: true } | { ok: false; error: string }> {
  const v = validateVerification(input);
  if (!v.ok) return v;
  if (!isEncryptionConfigured()) return { ok: false, error: "Secure storage for bank details is not set up on this server." };
  const { state, current } = await syncVendorBank(vendorId);
  const pending = state?.pending;
  if (!state || !pending || !current) return { ok: false, error: "There is nothing waiting for verification for this vendor." };
  if (pending.token !== input.token) return { ok: false, error: "The details changed again while you were checking. Reload the page and verify the new ones." };
  const own = verifierProblem(actor.id, pending.changedBy);
  if (own) return { ok: false, error: own };
  const now = new Date();
  const entry: HistoryEntry = { at: now, by: actor.id, kind: "verified", oldLast4: state.verified?.last4 ?? null, newLast4: pending.last4, ifscChanged: false, upiChanged: false, method: v.method, note: v.note };
  const { token, changedBy, changedAt, ...snap } = pending;
  void token; void changedBy; void changedAt;
  const res = await (await bankCol()).updateOne(
    { _id: vendorId, "pending.token": pending.token },
    { $set: { verified: { ...snap, verifiedBy: actor.id, verifiedAt: now, method: v.method, note: v.note, baseline: false }, pending: null }, $push: { history: { $each: [entry], $slice: -100 } } as never },
  );
  if (res.modifiedCount !== 1) return { ok: false, error: "Someone else just verified or changed these details. Reload the page." };
  await recordAudit({ actorId: actor.id, actorEmail: actor.email, action: "approve", entity: "vendor", entityId: vendorId, entityLabel: state.vendorName, summary: `Bank details ending ${pending.last4} verified (${v.method}): ${v.note}` }).catch(() => {});
  await alertOwners("A vendor's new bank details were verified", [
    `${state.vendorName}: the account ending ${pending.last4} was verified by ${actor.email ?? "a team member"} (${v.method.replace(/_/g, " ")}).`,
    `Their note: ${v.note}`,
    "Payments to this vendor now use these details, after the usual cooling-off wait. If you do not recognise this, review Payments at once.",
  ]);
  return { ok: true };
}

export interface BankReviewRow {
  vendorId: string;
  name: string;
  status: BankStatus;
  /** Verified account ends (null when none), and whether that was a person's check or just the first entry. */
  verifiedLast4: string | null;
  verifiedBy: string | null;
  verifiedAt: string | null;
  baseline: boolean;
  pending: { token: string; last4: string; ifsc: string | null; upiSet: boolean; changedBy: string | null; changedById: string | null; changedAt: string } | null;
  history: { at: string; by: string | null; kind: HistoryEntry["kind"]; oldLast4: string | null; newLast4: string | null; ifscChanged: boolean; upiChanged: boolean; note: string | null }[];
}

/** Names for people ids, for showing who changed and who verified. */
async function whoIs(ids: (string | null)[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const valid = [...new Set(ids.filter((i): i is string => !!i && ObjectId.isValid(i)))];
  if (valid.length === 0) return out;
  const rows = await (await getDb()).collection<{ _id: ObjectId; email?: string; name?: string }>("admin_users").find({ _id: { $in: valid.map((i) => new ObjectId(i)) } }, { projection: { email: 1, name: 1 } }).toArray();
  for (const r of rows) out.set(String(r._id), r.name || r.email || String(r._id));
  return out;
}

/** Every vendor with saved bank details, brought up to date, plus the active vendors that have none. */
export async function listBankReview(): Promise<{ rows: BankReviewRow[]; noDetails: { vendorId: string; name: string }[] }> {
  const beneficiaries = await listBeneficiaries("vendor");
  const rows: BankReviewRow[] = [];
  for (const b of beneficiaries) {
    const { state } = await syncVendorBank(b.entityId);
    const verified = !!state?.verified && sameDetails(open(state.verified) ?? { name: null, account: null, ifsc: null, upi: null }, detailsOf(b));
    rows.push({
      vendorId: b.entityId,
      name: b.beneficiaryName,
      status: bankStatus(true, !!state?.verified, verified),
      verifiedLast4: state?.verified?.last4 ?? null,
      verifiedBy: state?.verified?.verifiedBy ?? null,
      verifiedAt: state?.verified?.verifiedAt.toISOString() ?? null,
      baseline: !!state?.verified?.baseline,
      pending: state?.pending ? { token: state.pending.token, last4: state.pending.last4, ifsc: state.pending.ifsc, upiSet: state.pending.upiSet, changedBy: state.pending.changedBy, changedById: state.pending.changedBy, changedAt: state.pending.changedAt.toISOString() } : null,
      history: (state?.history ?? []).slice(-8).reverse().map((h) => ({ at: h.at.toISOString(), by: h.by, kind: h.kind, oldLast4: h.oldLast4, newLast4: h.newLast4, ifscChanged: h.ifscChanged, upiChanged: h.upiChanged, note: h.note ?? null })),
    });
  }
  const names = await whoIs(rows.flatMap((r) => [r.verifiedBy, r.pending?.changedBy ?? null, ...r.history.map((h) => h.by)]));
  const nm = (id: string | null) => (id ? names.get(id) ?? "a team member" : null);
  for (const r of rows) {
    r.verifiedBy = nm(r.verifiedBy);
    if (r.pending) r.pending.changedBy = nm(r.pending.changedBy);
    for (const h of r.history) h.by = nm(h.by);
  }
  const have = new Set(beneficiaries.map((b) => b.entityId));
  const vendors = await (await getDb()).collection<{ _id: string; companyName: string }>("prms_vendors").find({ deletedAt: null, status: "active" }, { projection: { companyName: 1 } }).sort({ companyName: 1 }).toArray();
  return { rows, noDetails: vendors.filter((v) => !have.has(v._id)).map((v) => ({ vendorId: v._id, name: v.companyName })) };
}

/* ---------- MSME ---------- */

interface MsmeDoc { _id: string; category: MsmeCategory; udyam: string | null; updatedBy: string; updatedAt: Date }

export async function getMsme(vendorId: string): Promise<{ category: MsmeCategory; udyam: string | null } | null> {
  const d = await (await getDb()).collection<MsmeDoc>(MSME).findOne({ _id: vendorId });
  return d ? { category: d.category, udyam: d.udyam } : null;
}

export async function saveMsme(vendorId: string, input: { category: unknown; udyam: unknown }, actor: Actor): Promise<{ ok: true } | { ok: false; error: string }> {
  const v = validateMsme(input);
  if (!v.ok) return v;
  const vendor = await (await getDb()).collection<{ _id: string; companyName: string }>("prms_vendors").findOne({ _id: vendorId, deletedAt: null }, { projection: { companyName: 1 } });
  if (!vendor) return { ok: false, error: "That vendor was not found." };
  await (await getDb()).collection<MsmeDoc>(MSME).updateOne({ _id: vendorId }, { $set: { category: v.category, udyam: v.udyam, updatedBy: actor.id, updatedAt: new Date() } }, { upsert: true });
  await recordAudit({ actorId: actor.id, actorEmail: actor.email, action: "update", entity: "vendor", entityId: vendorId, entityLabel: vendor.companyName, summary: `MSME status: ${v.category}${v.udyam ? ` (${v.udyam})` : ""}` }).catch(() => {});
  return { ok: true };
}

/** The days the company pays MSME vendors within, as the company or its CA entered them. Null: not confirmed. */
export async function getMsmeDays(): Promise<number | null> {
  const d = await (await getDb()).collection<{ _id: string; msmePaymentDays?: number | null }>(SETTINGS).findOne({ _id: "main" });
  return typeof d?.msmePaymentDays === "number" ? d.msmePaymentDays : null;
}

export async function saveMsmeDays(raw: unknown, actor: Actor): Promise<{ ok: true } | { ok: false; error: string }> {
  const p = parsePaymentDays(raw);
  if (!p.ok) return p;
  await (await getDb()).collection<{ _id: string }>(SETTINGS).updateOne({ _id: "main" }, { $set: { msmePaymentDays: p.days, updatedBy: actor.id, updatedAt: new Date() } }, { upsert: true });
  await recordAudit({ actorId: actor.id, actorEmail: actor.email, action: "update", entity: "settings", entityId: "vendor_controls", entityLabel: "MSME payment days", summary: `MSME payment days: ${p.days ?? "not confirmed"}` }).catch(() => {});
  return { ok: true };
}

export interface MsmeVendorRow { vendorId: string; name: string; category: MsmeCategory; udyam: string | null }
export interface MsmeBillRow { billId: string; billNumber: string; vendorId: string; vendorName: string; category: MsmeCategory; billDate: string; outstanding: number; dueBy: string | null; state: MsmeBillState; daysLate: number }

export async function listMsmeVendors(): Promise<MsmeVendorRow[]> {
  const db = await getDb();
  const docs = await db.collection<MsmeDoc>(MSME).find({ category: { $ne: "none" } }).toArray();
  if (docs.length === 0) return [];
  const vendors = await db.collection<{ _id: string; companyName: string }>("prms_vendors").find({ _id: { $in: docs.map((d) => d._id) }, deletedAt: null }, { projection: { companyName: 1 } }).toArray();
  const nameOf = new Map(vendors.map((v) => [v._id, v.companyName]));
  return docs.filter((d) => nameOf.has(d._id)).map((d) => ({ vendorId: d._id, name: nameOf.get(d._id)!, category: d.category, udyam: d.udyam })).sort((a, b) => a.name.localeCompare(b.name));
}

/** Unpaid bills of MSME vendors with the date each must be paid by. `today` is a YYYY-MM-DD date in India time. */
export async function listMsmeBills(today: string): Promise<{ days: number | null; bills: MsmeBillRow[] }> {
  const [days, vendors] = await Promise.all([getMsmeDays(), listMsmeVendors()]);
  if (vendors.length === 0) return { days, bills: [] };
  const by = new Map(vendors.map((v) => [v.vendorId, v]));
  const invoices = await (await getDb()).collection<{ _id: string; invoiceNumber: string; vendorId: string; invoiceDate: string; netPayable: number; amountPaid: number; status: string }>("prms_invoices")
    .find({ vendorId: { $in: vendors.map((v) => v.vendorId) }, status: { $in: OPEN_BILL }, deletedAt: null }).toArray();
  const adjusted = await adjustedByBill(invoices.map((i) => i._id));
  const bills: MsmeBillRow[] = [];
  for (const i of invoices) {
    const outstanding = fromPaise(toPaise(i.netPayable) - toPaise(i.amountPaid) - (adjusted.get(i._id) ?? 0));
    if (outstanding <= 0.005) continue;
    const v = by.get(i.vendorId)!;
    const m = msmeBill(i.invoiceDate, days, today);
    bills.push({ billId: i._id, billNumber: i.invoiceNumber, vendorId: v.vendorId, vendorName: v.name, category: v.category, billDate: i.invoiceDate, outstanding, ...m });
  }
  const rank: Record<MsmeBillState, number> = { overdue: 0, due_soon: 1, on_time: 2, unconfirmed: 3 };
  bills.sort((a, b) => rank[a.state] - rank[b.state] || (a.dueBy ?? "9999").localeCompare(b.dueBy ?? "9999"));
  return { days, bills };
}

/* ---------- Advances and deposits ---------- */

interface Adjustment { id: string; billId: string; billNumber: string; amountPaise: number; at: Date; by: string }
interface AdvanceDoc {
  _id: string;
  vendorId: string;
  vendorName: string;
  kind: AdvanceKind;
  amountPaise: number;
  remainingPaise: number;
  paidOn: string;
  purpose: string;
  reference: string | null;
  status: AdvanceStatus;
  adjustments: Adjustment[];
  refund: { on: string; note: string | null; amountPaise: number; by: string } | null;
  createdAt: Date;
  createdBy: string;
}

async function advCol() {
  const c = (await getDb()).collection<AdvanceDoc>(ADVANCES);
  return c;
}

/** Paise adjusted against each bill from the register. Payments must leave this much of a bill unpaid-by-cash. */
async function adjustedByBill(billIds: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (billIds.length === 0) return out;
  const rows = await (await advCol()).aggregate<{ _id: string; paise: number }>([
    { $match: { "adjustments.billId": { $in: billIds } } },
    { $unwind: "$adjustments" },
    { $match: { "adjustments.billId": { $in: billIds } } },
    { $group: { _id: "$adjustments.billId", paise: { $sum: "$adjustments.amountPaise" } } },
  ]).toArray();
  for (const r of rows) out.set(r._id, r.paise);
  return out;
}

/** Rupees of a bill already covered by an advance or deposit. */
export async function adjustedAgainstBill(billId: string): Promise<number> {
  return fromPaise((await adjustedByBill([billId])).get(billId) ?? 0);
}

export async function createAdvance(vendorId: string, input: Record<string, unknown>, today: string, actor: Actor): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const v = validateAdvance(input, today);
  if (!v.ok) return v;
  const vendor = await (await getDb()).collection<{ _id: string; companyName: string }>("prms_vendors").findOne({ _id: vendorId, deletedAt: null }, { projection: { companyName: 1 } });
  if (!vendor) return { ok: false, error: "Choose a vendor from your vendor list." };
  const doc: AdvanceDoc = { _id: newId(), vendorId, vendorName: vendor.companyName, ...v.data, remainingPaise: v.data.amountPaise, status: "open", adjustments: [], refund: null, createdAt: new Date(), createdBy: actor.id };
  await (await advCol()).insertOne(doc);
  await recordAudit({ actorId: actor.id, actorEmail: actor.email, action: "record", entity: "vendor", entityId: vendorId, entityLabel: vendor.companyName, summary: `${doc.kind} of ₹${fromPaise(doc.amountPaise)} recorded: ${doc.purpose}` }).catch(() => {});
  return { ok: true, id: doc._id };
}

export interface AdvanceRow {
  id: string; vendorId: string; vendorName: string; kind: AdvanceKind; amount: number; remaining: number; paidOn: string; purpose: string; reference: string | null; status: AdvanceStatus;
  adjustments: { billNumber: string; amount: number; at: string }[];
  refund: { on: string; note: string | null; amount: number } | null;
}

export async function listAdvances(opts: { status?: AdvanceStatus; vendorId?: string } = {}): Promise<AdvanceRow[]> {
  const filter: Record<string, unknown> = {};
  if (opts.status) filter.status = opts.status;
  if (opts.vendorId) filter.vendorId = opts.vendorId;
  const docs = await (await advCol()).find(filter).sort({ paidOn: -1, createdAt: -1 }).limit(500).toArray();
  return docs.map((d) => ({
    id: d._id, vendorId: d.vendorId, vendorName: d.vendorName, kind: d.kind, amount: fromPaise(d.amountPaise), remaining: fromPaise(d.remainingPaise), paidOn: d.paidOn, purpose: d.purpose, reference: d.reference, status: d.status,
    adjustments: d.adjustments.map((a) => ({ billNumber: a.billNumber, amount: fromPaise(a.amountPaise), at: a.at.toISOString() })),
    refund: d.refund ? { on: d.refund.on, note: d.refund.note, amount: fromPaise(d.refund.amountPaise) } : null,
  }));
}

/** What can still be adjusted against a bill (paise): owed, less paid, less payments on their way, less advances already adjusted. */
async function billRoomPaise(billId: string, exceptAdjustmentId?: string): Promise<{ ok: true; paise: number; billNumber: string; vendorId: string } | { ok: false; error: string }> {
  const bill = await getInvoice(billId);
  if (!bill) return { ok: false, error: "That bill was not found." };
  if (bill.status === "cancelled") return { ok: false, error: "That bill is cancelled." };
  const inFlight = (await listPaymentsForInvoice(billId)).filter((p) => p.status === "scheduled").reduce((n, p) => n + toPaise(p.amount), 0);
  const rows = await (await advCol()).find({ "adjustments.billId": billId }).toArray();
  const done = rows.flatMap((r) => r.adjustments).filter((a) => a.billId === billId && a.id !== exceptAdjustmentId).reduce((n, a) => n + a.amountPaise, 0);
  return { ok: true, paise: toPaise(bill.netPayable) - toPaise(bill.amountPaid) - inFlight - done, billNumber: bill.invoiceNumber, vendorId: bill.vendorId };
}

/**
 * Sets an advance or deposit against a bill of the same vendor. The advance is reduced in one atomic step that fails if it no longer has the
 * amount, so two people clicking together cannot spend it twice; the bill's room is then re-checked with this adjustment in place and the
 * step is undone if two adjustments together would cover more than the bill owes.
 */
export async function adjustAdvance(advanceId: string, billId: string, rupees: unknown, actor: Actor): Promise<{ ok: true } | { ok: false; error: string }> {
  const amt = Number(String(rupees ?? "").replace(/[, ]/g, ""));
  if (!Number.isFinite(amt) || Math.abs(amt * 100 - Math.round(amt * 100)) > 1e-6) return { ok: false, error: "Enter a valid amount." };
  const amountPaise = toPaise(amt);
  const col = await advCol();
  const adv = await col.findOne({ _id: advanceId });
  if (!adv) return { ok: false, error: "That record was not found." };
  if (adv.status !== "open") return { ok: false, error: adv.status === "refunded" ? "This was refunded, so it cannot be adjusted." : "This has been fully adjusted already." };
  const room = await billRoomPaise(billId);
  if (!room.ok) return room;
  if (room.vendorId !== adv.vendorId) return { ok: false, error: "That bill belongs to a different vendor." };
  const bad = adjustProblem(amountPaise, adv.remainingPaise, room.paise);
  if (bad) return { ok: false, error: bad };

  const adj: Adjustment = { id: newId(), billId, billNumber: room.billNumber, amountPaise, at: new Date(), by: actor.id };
  const took = await col.updateOne({ _id: advanceId, status: "open", remainingPaise: { $gte: amountPaise } }, [
    { $set: { remainingPaise: { $subtract: ["$remainingPaise", amountPaise] }, adjustments: { $concatArrays: [{ $ifNull: ["$adjustments", []] }, [{ $literal: adj }]] } } },
    { $set: { status: { $cond: [{ $eq: ["$remainingPaise", 0] }, "adjusted", "open"] } } },
  ]);
  if (took.modifiedCount !== 1) return { ok: false, error: "This was just adjusted by someone else. Reload to see what is still open." };

  const after = await billRoomPaise(billId);
  if (!after.ok || after.paise < 0) {
    await col.updateOne({ _id: advanceId }, [
      { $set: { remainingPaise: { $add: ["$remainingPaise", amountPaise] }, adjustments: { $filter: { input: "$adjustments", as: "a", cond: { $ne: ["$$a.id", adj.id] } } } } },
      { $set: { status: { $cond: [{ $gt: ["$remainingPaise", 0] }, "open", "$status"] } } },
    ]);
    return { ok: false, error: "Another adjustment on that bill went through at the same moment and it now owes less than this. Reload and check the bill." };
  }
  await recordAudit({ actorId: actor.id, actorEmail: actor.email, action: "update", entity: "vendor", entityId: adv.vendorId, entityLabel: adv.vendorName, summary: `₹${fromPaise(amountPaise)} of ${adv.kind} adjusted against bill ${room.billNumber}` }).catch(() => {});
  return { ok: true };
}

export async function refundAdvance(advanceId: string, input: { on: unknown; note: unknown }, today: string, actor: Actor): Promise<{ ok: true } | { ok: false; error: string }> {
  const on = String(input.on ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(on) || Number.isNaN(Date.parse(on))) return { ok: false, error: "Enter the date it was refunded." };
  if (on > today) return { ok: false, error: "The refund date cannot be in the future." };
  const note = String(input.note ?? "").trim().slice(0, 300) || null;
  const col = await advCol();
  const adv = await col.findOne({ _id: advanceId });
  if (!adv) return { ok: false, error: "That record was not found." };
  if (adv.paidOn > on) return { ok: false, error: "A refund cannot be dated before the payment." };
  const res = await col.updateOne({ _id: advanceId, status: "open", remainingPaise: { $gt: 0 } }, [
    { $set: { refund: { $literal: { on, note, by: actor.id } }, status: "refunded" } },
    { $set: { "refund.amountPaise": "$remainingPaise", remainingPaise: 0 } },
  ]);
  if (res.modifiedCount !== 1) return { ok: false, error: "Only an advance or deposit with an amount still open can be marked refunded." };
  await recordAudit({ actorId: actor.id, actorEmail: actor.email, action: "update", entity: "vendor", entityId: adv.vendorId, entityLabel: adv.vendorName, summary: `${adv.kind} refunded by the vendor on ${on}` }).catch(() => {});
  return { ok: true };
}

/** Unpaid bills of the given vendors with what is still owed on each, for choosing what to adjust an advance against. */
export async function listOpenBills(vendorIds: string[]): Promise<Map<string, { id: string; number: string; outstanding: number }[]>> {
  const out = new Map<string, { id: string; number: string; outstanding: number }[]>();
  if (vendorIds.length === 0) return out;
  const invoices = await (await getDb()).collection<{ _id: string; invoiceNumber: string; vendorId: string; netPayable: number; amountPaid: number }>("prms_invoices")
    .find({ vendorId: { $in: vendorIds }, status: { $in: OPEN_BILL }, deletedAt: null }).sort({ invoiceDate: 1 }).toArray();
  const adjusted = await adjustedByBill(invoices.map((i) => i._id));
  for (const i of invoices) {
    const outstanding = fromPaise(toPaise(i.netPayable) - toPaise(i.amountPaid) - (adjusted.get(i._id) ?? 0));
    if (outstanding <= 0.005) continue;
    out.set(i.vendorId, [...(out.get(i.vendorId) ?? []), { id: i._id, number: i.invoiceNumber, outstanding }]);
  }
  return out;
}

/** Active vendors, for the pickers. */
export async function listVendorChoices(): Promise<{ id: string; name: string }[]> {
  const rows = await (await getDb()).collection<{ _id: string; companyName: string }>("prms_vendors").find({ deletedAt: null }, { projection: { companyName: 1 } }).sort({ companyName: 1 }).limit(2000).toArray();
  return rows.map((r) => ({ id: r._id, name: r.companyName }));
}
