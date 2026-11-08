import { tmsEvents } from "@/lib/notify/triggers/tms";
import "server-only";
import { notifyStudent } from "@/lib/products/cohort-ai/notifications";
import { randomBytes } from "node:crypto";
import { getDb } from "@/lib/mongodb";
import { newId, createStamp, updateStamp, notDeleted, nextSequence, type AuditFields } from "@/lib/products/cohort-ai/db";
import { getTmsSettings } from "@/lib/products/cohort-ai/settings";
import { CERTIFICATE_TYPES, isValidCertificateType, type CertificateType } from "@/lib/products/cohort-ai/constants";
import { PROGRAMS_COLLECTION } from "@/lib/products/cohort-ai/programs";
import { BATCHES_COLLECTION } from "@/lib/products/cohort-ai/batches";

export const CERTIFICATES_COLLECTION = "certificates";
const STUDENTS_COLLECTION = "training_students";

export { isValidCertificateType };
export type { CertificateType };

export interface Certificate extends AuditFields {
  _id: string;
  certificateNumber: string;
  /** URL-safe token embedded in the QR / verification link. */
  verificationCode: string;
  type: CertificateType;
  studentId: string;
  programId: string;
  batchId: string | null;
  /** Free-text — e.g. the project name for a project-completion certificate. */
  title: string | null;
  issuedOn: string; // ISO yyyy-mm-dd
  grade: string | null;
  revoked: boolean;
  revokedReason: string | null;
  /** When this certificate supersedes a reissued one. */
  reissuedFromId: string | null;
}

export interface SerializedCertificate extends Omit<Certificate, "createdAt" | "updatedAt" | "deletedAt"> {
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export function serializeCertificate(c: Certificate): SerializedCertificate {
  return {
    ...c,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
    deletedAt: c.deletedAt ? c.deletedAt.toISOString() : null,
  };
}

let indexesEnsured = false;

async function getCollection() {
  const db = await getDb();
  const collection = db.collection<Certificate>(CERTIFICATES_COLLECTION);
  if (!indexesEnsured) {
    indexesEnsured = true;
    await Promise.all([
      collection.createIndex({ certificateNumber: 1 }, { unique: true }).catch(() => {}),
      collection.createIndex({ verificationCode: 1 }, { unique: true }).catch(() => {}),
      collection.createIndex({ studentId: 1 }).catch(() => {}),
      collection.createIndex({ programId: 1 }).catch(() => {}),
      collection.createIndex({ createdAt: -1 }).catch(() => {}),
    ]);
  }
  return collection;
}

/** Fills `{n}` (padded sequence) and `{yyyy}` (year) in the settings format. */
export async function generateCertificateNumber(): Promise<string> {
  const settings = await getTmsSettings();
  const seq = await nextSequence("certificate_number");
  return settings.certificateNumberFormat
    .replace(/\{yyyy\}/g, String(new Date().getFullYear()))
    .replace(/\{n\}/g, String(seq).padStart(4, "0"));
}

function newVerificationCode(): string {
  return randomBytes(9).toString("base64url");
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function getCertificate(id: string): Promise<Certificate | null> {
  const collection = await getCollection();
  return collection.findOne({ _id: id, ...notDeleted });
}

export async function getCertificateByNumber(certificateNumber: string): Promise<Certificate | null> {
  const collection = await getCollection();
  return collection.findOne({ certificateNumber });
}

export async function getCertificateByCode(verificationCode: string): Promise<Certificate | null> {
  const collection = await getCollection();
  return collection.findOne({ verificationCode });
}

export interface CertificateView extends Certificate {
  studentName: string;
  studentCode: string | null;
  programName: string;
  batchName: string | null;
  typeLabel: string;
}

async function attachMeta(rows: Certificate[]): Promise<CertificateView[]> {
  if (rows.length === 0) return [];
  const db = await getDb();
  const [students, programs, batches] = await Promise.all([
    db.collection<{ _id: string; fullName: string; studentCode: string }>(STUDENTS_COLLECTION).find({ _id: { $in: rows.map((r) => r.studentId) } }, { projection: { fullName: 1, studentCode: 1 } }).toArray(),
    db.collection<{ _id: string; name: string }>(PROGRAMS_COLLECTION).find({ _id: { $in: rows.map((r) => r.programId) } }, { projection: { name: 1 } }).toArray(),
    db.collection<{ _id: string; name: string }>(BATCHES_COLLECTION).find({ _id: { $in: rows.map((r) => r.batchId).filter(Boolean) as string[] } }, { projection: { name: 1 } }).toArray(),
  ]);
  const studentById = new Map(students.map((s) => [s._id, s]));
  const programName = new Map(programs.map((p) => [p._id, p.name]));
  const batchName = new Map(batches.map((b) => [b._id, b.name]));
  return rows.map((r) => ({
    ...r,
    studentName: studentById.get(r.studentId)?.fullName ?? "Unknown student",
    studentCode: studentById.get(r.studentId)?.studentCode ?? null,
    programName: programName.get(r.programId) ?? "Unknown program",
    batchName: r.batchId ? batchName.get(r.batchId) ?? null : null,
    typeLabel: CERTIFICATE_TYPES.find((t) => t.value === r.type)?.label ?? "Certificate",
  }));
}

export interface CertificateFilter {
  search?: string;
  type?: CertificateType;
  programId?: string;
  studentId?: string;
}

export async function listCertificates(opts: CertificateFilter = {}, limit = 500): Promise<CertificateView[]> {
  const collection = await getCollection();
  const filter: Record<string, unknown> = { ...notDeleted };
  if (opts.type) filter.type = opts.type;
  if (opts.programId) filter.programId = opts.programId;
  if (opts.studentId) filter.studentId = opts.studentId;
  if (opts.search?.trim()) {
    const rx = new RegExp(opts.search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    filter.$or = [{ certificateNumber: rx }, { title: rx }];
  }
  const rows = await collection.find(filter).sort({ createdAt: -1 }).limit(limit).toArray();
  return attachMeta(rows);
}

export async function certificateWithMeta(id: string): Promise<CertificateView | null> {
  const cert = await getCertificate(id);
  if (!cert) return null;
  return (await attachMeta([cert]))[0] ?? null;
}

export async function countCertificates(opts: CertificateFilter = {}): Promise<number> {
  const collection = await getCollection();
  const filter: Record<string, unknown> = { ...notDeleted };
  if (opts.type) filter.type = opts.type;
  if (opts.programId) filter.programId = opts.programId;
  if (opts.studentId) filter.studentId = opts.studentId;
  return collection.countDocuments(filter);
}

export async function listCertificatesForStudent(studentId: string): Promise<CertificateView[]> {
  return listCertificates({ studentId });
}

function buildCertificateFilter(opts: CertificateFilter): Record<string, unknown> {
  const filter: Record<string, unknown> = { ...notDeleted };
  if (opts.type) filter.type = opts.type;
  if (opts.programId) filter.programId = opts.programId;
  if (opts.studentId) filter.studentId = opts.studentId;
  if (opts.search?.trim()) {
    const rx = new RegExp(opts.search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    filter.$or = [{ certificateNumber: rx }, { title: rx }];
  }
  return filter;
}

export interface SearchCertificatesOptions extends CertificateFilter {
  page?: number;
  pageSize?: number;
  sortBy?: "createdAt" | "issuedOn";
  sortDir?: "asc" | "desc";
}

/** Paginated variant of `listCertificates` — for a browsable listing. */
export async function searchCertificates(opts: SearchCertificatesOptions = {}) {
  const collection = await getCollection();
  const page = Math.max(opts.page ?? 1, 1);
  const pageSize = Math.min(Math.max(opts.pageSize ?? 20, 1), 100);
  const filter = buildCertificateFilter(opts);
  const sortField = opts.sortBy ?? "createdAt";
  const sortDir = opts.sortDir === "asc" ? 1 : -1;

  const [rows, total] = await Promise.all([
    collection.find(filter).sort({ [sortField]: sortDir }).skip((page - 1) * pageSize).limit(pageSize).toArray(),
    collection.countDocuments(filter),
  ]);
  const items = await attachMeta(rows);
  return { items, total, page, pageSize, totalPages: Math.max(Math.ceil(total / pageSize), 1) };
}

const EXPORT_ROW_LIMIT = 5000;

export async function exportCertificates(opts: CertificateFilter & { ids?: string[] } = {}): Promise<CertificateView[]> {
  const collection = await getCollection();
  const filter = opts.ids && opts.ids.length > 0 ? { _id: { $in: opts.ids }, ...notDeleted } : buildCertificateFilter(opts);
  const rows = await collection.find(filter).sort({ createdAt: -1 }).limit(EXPORT_ROW_LIMIT).toArray();
  return attachMeta(rows);
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

export interface CertificateIssueData {
  type: CertificateType;
  studentId: string;
  programId: string;
  batchId: string | null;
  title: string | null;
  issuedOn: string;
  grade: string | null;
}

export async function issueCertificate(data: CertificateIssueData, actorId: string): Promise<Certificate> {
  const collection = await getCollection();
  const doc: Certificate = {
    _id: newId(),
    certificateNumber: await generateCertificateNumber(),
    verificationCode: newVerificationCode(),
    type: data.type,
    studentId: data.studentId,
    programId: data.programId,
    batchId: data.batchId,
    title: data.title,
    issuedOn: data.issuedOn,
    grade: data.grade,
    revoked: false,
    revokedReason: null,
    reissuedFromId: null,
    ...createStamp(actorId),
  };
  await collection.insertOne(doc);
  await tmsEvents.certificateIssued(String(doc.studentId ?? ""), String(doc.title ?? "Certificate"), doc._id);
  return doc;
}

export async function setCertificateRevoked(
  id: string,
  revoked: boolean,
  reason: string | null,
  actorId: string
): Promise<Certificate | null> {
  const collection = await getCollection();
  const before = await collection.findOne({ _id: id, ...notDeleted }, { projection: { revoked: 1 } });
  const cert = await collection.findOneAndUpdate(
    { _id: id, ...notDeleted },
    { $set: { revoked, revokedReason: revoked ? reason : null, ...updateStamp(actorId) } },
    { returnDocument: "after" }
  );
  // The student is told their certificate was withdrawn (with the reason) or given back.
  if (cert && before && !!before.revoked !== revoked) {
    await notifyStudent(cert.studentId, {
      type: revoked ? "certificate_revoked_alert" : "certificate_reinstated",
      title: revoked ? `Your certificate ${cert.certificateNumber} was revoked` : `Your certificate ${cert.certificateNumber} is valid again`,
      body: revoked ? reason : null,
      link: "/cohort-ai/notifications",
    });
  }
  return cert;
}

/** Reissue: revokes the original and mints a fresh certificate number + code. */
export async function reissueCertificate(id: string, actorId: string): Promise<Certificate | null> {
  const collection = await getCollection();
  const original = await collection.findOne({ _id: id, ...notDeleted });
  if (!original) return null;
  await collection.updateOne({ _id: id }, { $set: { revoked: true, revokedReason: "Reissued", ...updateStamp(actorId) } });
  const doc: Certificate = {
    ...original,
    _id: newId(),
    certificateNumber: await generateCertificateNumber(),
    verificationCode: newVerificationCode(),
    revoked: false,
    revokedReason: null,
    reissuedFromId: original._id,
    issuedOn: new Date().toISOString().slice(0, 10),
    ...createStamp(actorId),
  };
  await collection.insertOne(doc);
  await notifyStudent(doc.studentId, { type: "certificate_reissued", title: `Your certificate was reissued as ${doc.certificateNumber}`, body: "Use the new number; the old one no longer verifies.", link: "/cohort-ai/notifications" });
  return doc;
}

export async function deleteCertificate(id: string, actorId: string): Promise<boolean> {
  const collection = await getCollection();
  const res = await collection.updateOne(
    { _id: id, ...notDeleted },
    { $set: { deletedAt: new Date(), ...updateStamp(actorId) } }
  );
  return res.modifiedCount === 1;
}
