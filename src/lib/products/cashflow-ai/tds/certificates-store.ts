import "server-only";
import { getDb } from "@/lib/mongodb";
import { newId, createStamp, updateStamp, notDeleted, type AuditFields } from "@/lib/products/cashflow-ai/db";
import { recordAudit } from "@/lib/products/cashflow-ai/audit";
import { VENDORS_COLLECTION } from "@/lib/products/spendiq/vendors";
import { isFinancialYear, isQuarter, type Quarter } from "@/lib/products/cashflow-ai/tds/core";
import { certificateProblem, certificateTasks, lowerCertProblem, type CertificateTask, type LowerCertInput } from "@/lib/products/cashflow-ai/tds/certificates-core";
import { loadDeductions } from "@/lib/products/cashflow-ai/tds/store";
import { todayIst } from "@/lib/products/cashflow-ai/month-close/core";

/**
 * Form 16A tracking (was the certificate issued to this vendor for this quarter?) and the register of lower / nil deduction
 * certificates. The certificate itself comes from the TRACES portal; both collections are notes for the team, not filings.
 */
export const TDS_CERTIFICATES_COLLECTION = "fms_tds_certificates";
export const TDS_LOWER_CERTS_COLLECTION = "fms_tds_lower_certs";

type Actor = { id: string; email: string | null };
type Result = { ok: true } | { ok: false; error: string };

export interface TdsCertificateDoc extends AuditFields {
  _id: string;
  vendorId: string;
  vendorName: string;
  section: string;
  fy: string;
  quarter: Quarter;
  issuedOn: string;
  certificateNumber: string;
  note: string | null;
}

export interface LowerCertDoc extends AuditFields {
  _id: string;
  vendorId: string;
  vendorName: string;
  section: string;
  certificateNumber: string;
  nil: boolean;
  rate: number | null;
  validFrom: string;
  validTo: string;
  maxAmount: number | null;
  note: string | null;
}

let certIndexed = false;
async function certCol() {
  const col = (await getDb()).collection<TdsCertificateDoc>(TDS_CERTIFICATES_COLLECTION);
  if (!certIndexed) {
    certIndexed = true;
    // one certificate record per vendor, section and quarter
    await col.createIndex({ vendorId: 1, section: 1, fy: 1, quarter: 1 }, { unique: true }).catch(() => {});
  }
  return col;
}
const lowerCol = async () => (await getDb()).collection<LowerCertDoc>(TDS_LOWER_CERTS_COLLECTION);

const periodProblem = (fy: string, quarter: number) => (!isFinancialYear(fy) ? "Choose a financial year like 2026-27." : !isQuarter(quarter) ? "Choose a quarter, 1 to 4." : null);

export async function listCertificates(fy: string, quarter: Quarter): Promise<TdsCertificateDoc[]> {
  return (await certCol()).find({ fy, quarter, ...notDeleted }).toArray();
}

/** Every vendor and section with tax deducted in the quarter, each with its certificate record if one was made. */
export async function loadCertificateTasks(fy: string, quarter: Quarter): Promise<CertificateTask[]> {
  const { rows } = await loadDeductions(fy, quarter);
  return certificateTasks(rows, await listCertificates(fy, quarter));
}

export interface CertificateRecordInput {
  vendorId: string;
  section: string;
  fy: string;
  quarter: number;
  issuedOn: string;
  certificateNumber: string;
  note?: string | null;
}

export async function recordCertificate(input: CertificateRecordInput, actor: Actor): Promise<Result> {
  const bad = periodProblem(input.fy, input.quarter) ?? certificateProblem(input, todayIst());
  if (bad) return { ok: false, error: bad };
  const quarter = input.quarter as Quarter;
  const section = input.section.trim().toUpperCase();
  // only a vendor that really had tax deducted in the quarter gets a certificate record
  const task = (await loadCertificateTasks(input.fy, quarter)).find((t) => t.vendorId === input.vendorId && t.section === section);
  if (!task) return { ok: false, error: "No tax was deducted from this vendor under this section in this quarter, so there is no certificate to track." };
  const col = await certCol();
  const body = { issuedOn: input.issuedOn, certificateNumber: input.certificateNumber.trim(), note: input.note?.trim().slice(0, 500) || null };
  const key = { vendorId: input.vendorId, section, fy: input.fy, quarter };
  const existing = await col.findOne({ ...key, ...notDeleted });
  if (existing) await col.updateOne({ _id: existing._id }, { $set: { ...body, vendorName: task.vendorName, ...updateStamp(actor.id) } });
  else {
    try {
      await col.insertOne({ _id: newId(), ...key, vendorName: task.vendorName, ...body, ...createStamp(actor.id) });
    } catch {
      // two people recording at once: the unique index keeps one row, the later save updates it
      await col.updateOne(key, { $set: { ...body, vendorName: task.vendorName, ...updateStamp(actor.id) } });
    }
  }
  await recordAudit({ actorId: actor.id, actorEmail: actor.email, action: existing ? "update" : "record", entity: "tds_certificate", entityId: `tds-cert:${input.vendorId}:${section}:${input.fy}:Q${quarter}`, entityLabel: `Form 16A ${task.vendorName} ${section} ${input.fy} Q${quarter}`, summary: `issued ${body.issuedOn}, number ${body.certificateNumber}` });
  return { ok: true };
}

/** Takes the "issued" mark off (it was recorded by mistake, or the certificate was withdrawn). The row is removed so it can be recorded again. */
export async function clearCertificate(input: { vendorId: string; section: string; fy: string; quarter: number }, actor: Actor): Promise<Result> {
  const bad = periodProblem(input.fy, input.quarter);
  if (bad) return { ok: false, error: bad };
  const section = input.section.trim().toUpperCase();
  const res = await (await certCol()).findOneAndDelete({ vendorId: input.vendorId, section, fy: input.fy, quarter: input.quarter as Quarter });
  if (!res) return { ok: false, error: "There is no certificate record to clear." };
  await recordAudit({ actorId: actor.id, actorEmail: actor.email, action: "delete", entity: "tds_certificate", entityId: `tds-cert:${input.vendorId}:${section}:${input.fy}:Q${input.quarter}`, entityLabel: `Form 16A ${res.vendorName} ${section} ${input.fy} Q${input.quarter}`, summary: `cleared (was number ${res.certificateNumber}, issued ${res.issuedOn})` });
  return { ok: true };
}

// ───────────────────────────── lower / nil deduction certificates ─────────────────────────────

export async function listLowerCerts(): Promise<LowerCertDoc[]> {
  return (await lowerCol()).find({ ...notDeleted }).sort({ validTo: -1, vendorName: 1 }).toArray();
}

async function vendorName(vendorId: string): Promise<string | null> {
  const v = (await (await getDb()).collection(VENDORS_COLLECTION).findOne({ _id: vendorId as never, ...notDeleted })) as unknown as { companyName?: string } | null;
  return v ? String(v.companyName ?? "") || "Vendor" : null;
}

function cleaned(input: LowerCertInput): LowerCertInput {
  return { ...input, section: (input.section ?? "").trim().toUpperCase(), certificateNumber: (input.certificateNumber ?? "").trim(), rate: input.nil ? null : input.rate, maxAmount: input.maxAmount ?? null, note: input.note?.trim().slice(0, 500) || null };
}

export async function saveLowerCert(id: string | null, raw: LowerCertInput, actor: Actor): Promise<Result> {
  const c = cleaned(raw);
  const bad = lowerCertProblem(c);
  if (bad) return { ok: false, error: bad };
  const name = await vendorName(c.vendorId);
  if (!name) return { ok: false, error: "That vendor was not found." };
  const col = await lowerCol();
  const body = { vendorId: c.vendorId, vendorName: name, section: c.section, certificateNumber: c.certificateNumber, nil: c.nil, rate: c.rate, validFrom: c.validFrom, validTo: c.validTo, maxAmount: c.maxAmount, note: c.note ?? null };
  const summary = `${c.nil ? "nil deduction" : `${c.rate}%`}, ${c.validFrom} to ${c.validTo}`;
  if (id) {
    const res = await col.updateOne({ _id: id, ...notDeleted }, { $set: { ...body, ...updateStamp(actor.id) } });
    if (res.matchedCount === 0) return { ok: false, error: "Certificate not found." };
    await recordAudit({ actorId: actor.id, actorEmail: actor.email, action: "update", entity: "tds_lower_certificate", entityId: `tds-lower:${id}`, entityLabel: `Lower-deduction certificate ${c.certificateNumber} (${name}, ${c.section})`, summary });
  } else {
    const newDoc = newId();
    await col.insertOne({ _id: newDoc, ...body, ...createStamp(actor.id) });
    await recordAudit({ actorId: actor.id, actorEmail: actor.email, action: "create", entity: "tds_lower_certificate", entityId: `tds-lower:${newDoc}`, entityLabel: `Lower-deduction certificate ${c.certificateNumber} (${name}, ${c.section})`, summary });
  }
  return { ok: true };
}

export async function removeLowerCert(id: string, actor: Actor): Promise<Result> {
  const col = await lowerCol();
  const doc = await col.findOne({ _id: id, ...notDeleted });
  if (!doc) return { ok: false, error: "Certificate not found." };
  await col.updateOne({ _id: id }, { $set: { deletedAt: new Date(), ...updateStamp(actor.id) } });
  await recordAudit({ actorId: actor.id, actorEmail: actor.email, action: "delete", entity: "tds_lower_certificate", entityId: `tds-lower:${id}`, entityLabel: `Lower-deduction certificate ${doc.certificateNumber} (${doc.vendorName}, ${doc.section})` });
  return { ok: true };
}

/** Vendors to pick from on the lower-deduction form. */
export async function listVendorChoices(): Promise<{ id: string; name: string }[]> {
  const vendors = (await (await getDb()).collection(VENDORS_COLLECTION).find({ ...notDeleted }).project({ companyName: 1 }).toArray()) as unknown as { _id: string; companyName?: string }[];
  return vendors.map((v) => ({ id: String(v._id), name: String(v.companyName ?? "Vendor") })).sort((a, b) => a.name.localeCompare(b.name));
}
