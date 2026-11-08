import "server-only";
import { randomBytes } from "node:crypto";
import { getDb } from "@/lib/mongodb";
import { COLLECTIONS, escapeRx, newId, nextSequence, notDeleted, updateStamp, type AuditFields } from "@/lib/products/evaliq/db";
import { OtsInputError, NotFoundError } from "@/lib/products/evaliq/viewer";
import { effectiveRelease, type Assignment } from "@/lib/products/evaliq/assignments";
import { getTest } from "@/lib/products/evaliq/tests";
import { getOtsSettings } from "@/lib/products/evaliq/settings";
import { describeCandidates } from "@/lib/products/evaliq/people";
import { recordAudit } from "@/lib/products/evaliq/audit";
import { notifyCandidates } from "@/lib/products/evaliq/notifications";
import type { CandidateRef } from "@/lib/products/evaliq/constants";

/**
 * Certificates for certification tests. Issued automatically when a
 * certificate-enabled test's assignment is PASSED and its result has been
 * released to the candidate (never for "admin only" results — staff can
 * issue those by hand). Names are frozen onto the certificate at issue time,
 * since a certificate is a record of what was awarded. Verified publicly at
 * `/verify/<code>` (the same page as TMS training certificates).
 */

export interface OtsCertificate extends AuditFields {
  _id: string;
  certificateNumber: string;
  verificationCode: string;
  assignmentId: string;
  attemptId: string | null;
  testId: string;
  candidate: CandidateRef;
  candidateKey: string;
  candidateName: string;
  testName: string;
  title: string;
  score: number;
  totalMarks: number;
  percentage: number;
  organization: string;
  issuedOn: Date;
  validUntil: Date | null;
  revoked: boolean;
  revokedAt: Date | null;
  revokedReason: string | null;
  /** null = issued automatically. */
  issuedBy: string | null;
}

async function col() {
  const db = await getDb();
  return db.collection<OtsCertificate>(COLLECTIONS.certificates);
}

export function certificateState(c: Pick<OtsCertificate, "revoked" | "validUntil">, now = new Date()): "valid" | "revoked" | "expired" {
  if (c.revoked) return "revoked";
  if (c.validUntil && c.validUntil < now) return "expired";
  return "valid";
}

async function certificateNumber(): Promise<string> {
  const settings = await getOtsSettings();
  const seq = await nextSequence("certificate_number");
  return settings.certificateNumberFormat.replace(/\{yyyy\}/g, String(new Date().getFullYear())).replace(/\{n\}/g, String(seq).padStart(4, "0"));
}

async function issue(asg: Assignment, actor: { id: string; email: string | null }, manual: boolean): Promise<OtsCertificate> {
  const test = await getTest(asg.testId);
  if (!test) throw new NotFoundError();
  const [settings, people] = await Promise.all([getOtsSettings(), describeCandidates([asg.candidate])]);
  const person = people.get(asg.candidateKey);
  const months = test.certificate.validityMonths ?? settings.defaultValidityMonths;
  const issuedOn = new Date();
  let validUntil: Date | null = null;
  if (months > 0) {
    validUntil = new Date(issuedOn);
    validUntil.setMonth(validUntil.getMonth() + months);
  }
  const r = asg.result!;
  const doc: OtsCertificate = {
    _id: newId(),
    certificateNumber: await certificateNumber(),
    verificationCode: randomBytes(9).toString("base64url"),
    assignmentId: asg._id,
    attemptId: r.attemptId,
    testId: test._id,
    candidate: asg.candidate,
    candidateKey: asg.candidateKey,
    candidateName: person?.exists ? person.name : asg.candidateLabel,
    testName: test.name,
    title: test.certificate.title || `${test.name} — Certified`,
    score: r.score,
    totalMarks: r.total,
    percentage: r.percentage,
    organization: settings.organizationName,
    issuedOn,
    validUntil,
    revoked: false,
    revokedAt: null,
    revokedReason: null,
    issuedBy: manual ? actor.id : null,
    createdAt: issuedOn,
    updatedAt: issuedOn,
    createdBy: actor.id,
    updatedBy: actor.id,
    deletedAt: null,
  };
  await (await col()).insertOne(doc);
  await recordAudit({ actorId: actor.id, actorEmail: actor.email, action: "certificate_generated", entity: "certificate", entityId: doc._id, entityLabel: `${doc.certificateNumber} · ${doc.candidateName}`, testId: test._id, summary: `${doc.testName}: ${doc.percentage}%${manual ? " (issued manually)" : ""}` });
  await notifyCandidates([{ ref: asg.candidate, assignmentId: asg._id, type: "ots_certificate", title: `Certificate issued: ${test.name}`, body: `Certificate ${doc.certificateNumber} is ready to view and download.`, dedupeKey: `ots_cert:${doc._id}` }]);
  return doc;
}

/** Auto-issue hook, called whenever an assignment's result settles. Idempotent. */
export async function issueCertificateIfEligible(assignmentId: string, actor: { id: string; email: string | null }): Promise<OtsCertificate | null> {
  const db = await getDb();
  const asg = await db.collection<Assignment>(COLLECTIONS.assignments).findOne({ _id: assignmentId });
  if (!asg || !asg.certificateEligible || !asg.result?.passed || !asg.resultPublishedAt) return null;
  const test = await getTest(asg.testId);
  if (!test?.certificate.enabled || effectiveRelease(asg, test) === "never") return null;
  const existing = await (await col()).findOne({ assignmentId, ...notDeleted });
  if (existing) return null;
  return issue(asg, actor, false);
}

export async function generateCertificate(assignmentId: string, actor: { id: string; email: string | null }): Promise<OtsCertificate> {
  const db = await getDb();
  const asg = await db.collection<Assignment>(COLLECTIONS.assignments).findOne({ _id: assignmentId, ...notDeleted });
  if (!asg) throw new NotFoundError();
  if (!asg.result?.passed) throw new OtsInputError("Certificates can only be issued for a passed, fully evaluated result.");
  const existing = await (await col()).findOne({ assignmentId, ...notDeleted });
  if (existing) throw new OtsInputError(`Certificate ${existing.certificateNumber} already exists for this assignment${existing.revoked ? " (revoked — restore it instead)" : ""}.`);
  return issue(asg, actor, true);
}

export async function setRevoked(id: string, revoked: boolean, reason: string, actor: { id: string; email: string | null }): Promise<OtsCertificate> {
  const c = await (await col()).findOne({ _id: id, ...notDeleted });
  if (!c) throw new NotFoundError();
  if (revoked && !reason.trim()) throw new OtsInputError("Give a reason for revoking.");
  const patch = revoked ? { revoked: true, revokedAt: new Date(), revokedReason: reason.trim().slice(0, 300) } : { revoked: false, revokedAt: null, revokedReason: null };
  await (await col()).updateOne({ _id: id }, { $set: { ...patch, ...updateStamp(actor.id) } });
  await recordAudit({ actorId: actor.id, actorEmail: actor.email, action: revoked ? "certificate_revoked" : "certificate_restored", entity: "certificate", entityId: id, entityLabel: `${c.certificateNumber} · ${c.candidateName}`, testId: c.testId, summary: revoked ? reason.trim().slice(0, 200) : null });
  // The holder is told when it is withdrawn (with the reason) or given back.
  if (!!c.revoked !== revoked && c.assignmentId) {
    try {
      const asg = await (await getDb()).collection<Assignment>(COLLECTIONS.assignments).findOne({ _id: c.assignmentId });
      if (asg) await notifyCandidates([{ ref: asg.candidate, assignmentId: asg._id, type: revoked ? "ots_certificate_revoked_alert" : "ots_certificate_restored", title: revoked ? `Certificate ${c.certificateNumber} was revoked` : `Certificate ${c.certificateNumber} is valid again`, body: revoked ? reason.trim().slice(0, 200) : undefined }]);
    } catch {
      /* never fails the change */
    }
  }
  return { ...c, ...patch };
}

export async function getCertificate(id: string): Promise<OtsCertificate | null> {
  return (await col()).findOne({ _id: id, ...notDeleted });
}

export async function getCertificateByCode(code: string): Promise<OtsCertificate | null> {
  if (!/^[A-Za-z0-9_-]{6,40}$/.test(code)) return null;
  return (await col()).findOne({ verificationCode: code, ...notDeleted });
}

/** Staff lookup by certificate number OR verification code. */
export async function findCertificate(term: string): Promise<OtsCertificate | null> {
  const t = term.trim();
  if (!t) return null;
  return (await col()).findOne({ ...notDeleted, $or: [{ verificationCode: t }, { certificateNumber: { $regex: `^${escapeRx(t)}$`, $options: "i" } }] });
}

export async function listCertificates(f: { q?: string; testId?: string; state?: string; candidateKeys?: string[]; page?: number; pageSize?: number }) {
  const and: Record<string, unknown>[] = [notDeleted];
  if (f.testId) and.push({ testId: f.testId });
  if (f.candidateKeys) and.push({ candidateKey: { $in: f.candidateKeys } });
  const now = new Date();
  if (f.state === "revoked") and.push({ revoked: true });
  else if (f.state === "expired") and.push({ revoked: false, validUntil: { $ne: null, $lt: now } });
  else if (f.state === "valid") and.push({ revoked: false, $or: [{ validUntil: null }, { validUntil: { $gte: now } }] });
  if (f.q?.trim()) {
    const rx = new RegExp(escapeRx(f.q.trim()), "i");
    and.push({ $or: [{ candidateName: rx }, { certificateNumber: rx }, { testName: rx }] });
  }
  const filter = { $and: and };
  const page = Math.max(f.page ?? 1, 1);
  const pageSize = Math.min(Math.max(f.pageSize ?? 25, 1), 100);
  const c = await col();
  const [items, total] = await Promise.all([c.find(filter).sort({ issuedOn: -1 }).skip((page - 1) * pageSize).limit(pageSize).toArray(), c.countDocuments(filter)]);
  return { items, total, page, pageSize, totalPages: Math.max(Math.ceil(total / pageSize), 1) };
}

export async function certificatesForAssignments(assignmentIds: string[]): Promise<Map<string, OtsCertificate>> {
  if (assignmentIds.length === 0) return new Map();
  const rows = await (await col()).find({ assignmentId: { $in: assignmentIds }, ...notDeleted }).toArray();
  return new Map(rows.map((c) => [c.assignmentId, c]));
}
