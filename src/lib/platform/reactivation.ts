import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { Binary } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { getPlatformDb } from "@/lib/platform/tenancy/platform-db";
import { getCompany, getPlatformOwnerCompanyId } from "@/lib/platform/tenancy/companies";
import { runAsCompany } from "@/lib/platform/tenancy/context";
import { setCompanyStatus } from "@/lib/platform/console/companies";
import { recordPlatformAudit } from "@/lib/platform/audit";
import { decryptPlatformSecret, encryptPlatformSecret, isPlatformEncryptionConfigured, type EncryptedValue } from "@/lib/platform/crypto";
import { sendEmail } from "@/lib/platform/email";
import { renderEmail } from "@/lib/platform/email/template";
import { scanUploadBuiltIn } from "@/lib/storage/upload-scan";
import { ID_MAX_BYTES, ID_TYPES, fileError, reasonError, requestInputError, sniffIdType, type RequestInput, type RequestStatus } from "@/lib/platform/reactivation-rule";

export type { RequestStatus } from "@/lib/platform/reactivation-rule";

/**
 * A suspended company asks to be switched back on. Anyone who reaches the company's address sees the "suspended" page and can send ONE
 * open request at a time: who they are, why, and a government ID. Platform staff (Console → Companies → the company) approve it, which
 * reactivates the company, or reject it with a reason that is emailed. The ID is stored encrypted at rest, separate from the request, and
 * only a Console user who may change company status can open it (every view is audited). Everything lives in the platform database,
 * because a suspended company has no workspace to act in.
 */
const REQUESTS = "reactivation_requests";
const DOCS = "reactivation_documents";
const MAX_PER_DAY = 3;

export interface ReactivationRequest {
  _id: string;
  companyId: string;
  companyName: string;
  name: string;
  email: string;
  message: string;
  /** The email belongs to a Director of the company (the reviewer's first signal; never shown to the requester). */
  emailMatchesDirector: boolean;
  idFile: { name: string; type: string; size: number };
  status: RequestStatus;
  decisionReason: string | null;
  decidedBy: string | null;
  decidedAt: Date | null;
  createdAt: Date;
  /** sha256 of the sender's address (rate limiting / abuse review, no raw IP). */
  ipHash: string;
}

interface DocRow {
  _id: string;
  companyId: string;
  type: string;
  enc: EncryptedValue | null;
  raw: Binary | null;
}

let indexed = false;
async function cols() {
  const db = await getPlatformDb();
  const requests = db.collection<ReactivationRequest>(REQUESTS);
  const docs = db.collection<DocRow>(DOCS);
  if (!indexed) {
    indexed = true;
    await Promise.all([requests.createIndex({ companyId: 1, createdAt: -1 }), requests.createIndex({ status: 1, createdAt: -1 })]).catch(() => {});
  }
  return { requests, docs };
}

const ctx = (id: string) => `reactivation:${id}`;

export type SubmitResult = { ok: true; reference: string } | { ok: false; error: string };

export async function submitReactivationRequest(input: { companyId: string; fields: RequestInput; file: { name: string; type: string; bytes: Buffer }; ipHash: string; origin: string }): Promise<SubmitResult> {
  const company = await getCompany(input.companyId);
  if (!company || company.status !== "suspended" || company.isPlatformOwner) return { ok: false, error: "This workspace isn't suspended." };
  const bad = requestInputError(input.fields) ?? fileError({ size: input.file.bytes.length, type: input.file.type });
  if (bad) return { ok: false, error: bad };
  if (input.file.bytes.length > ID_MAX_BYTES) return { ok: false, error: "The file is larger than 4 MB." };
  const type = sniffIdType(input.file.bytes);
  if (!type) return { ok: false, error: "Upload your ID as a PDF, JPG, PNG or WebP file." };
  const scan = await scanUploadBuiltIn({ filename: `id.${ID_TYPES[type]}`, contentType: type, body: input.file.bytes });
  if (!scan.ok) return { ok: false, error: "That file can't be accepted. Upload a clean scan or photo of your ID." };
  const encrypted = isPlatformEncryptionConfigured();
  if (!encrypted && process.env.NODE_ENV === "production") return { ok: false, error: "We can't take ID documents right now. Please contact support." };

  const { requests, docs } = await cols();
  if (await requests.findOne({ companyId: company._id, status: "pending" }, { projection: { _id: 1 } })) return { ok: false, error: "A request for this workspace is already being reviewed. We'll email you when there is a decision." };
  if ((await requests.countDocuments({ companyId: company._id, createdAt: { $gt: new Date(Date.now() - 86_400_000) } })) >= MAX_PER_DAY) return { ok: false, error: "Too many requests for this workspace today. Please try again tomorrow." };

  const email = input.fields.email.trim().toLowerCase();
  const matches = await runAsCompany(company._id, async () => !!(await (await getDb()).collection("admin_users").findOne({ email, $or: [{ designationId: "director" }, { roles: "super_admin" }] }, { projection: { _id: 1 } }))).catch(() => false);

  const id = randomUUID();
  const reference = `RA-${id.slice(0, 8).toUpperCase()}`;
  await docs.insertOne({
    _id: id,
    companyId: company._id,
    type,
    ...(encrypted ? { enc: encryptPlatformSecret(input.file.bytes.toString("base64"), ctx(id)), raw: null } : { enc: null, raw: new Binary(input.file.bytes) }),
  });
  try {
    await requests.insertOne({
      _id: id,
      companyId: company._id,
      companyName: company.name,
      name: input.fields.name.trim(),
      email,
      message: input.fields.message.trim(),
      emailMatchesDirector: matches,
      idFile: { name: input.file.name.replace(/[^\w.\- ]+/g, "_").slice(0, 80) || `id.${ID_TYPES[type]}`, type, size: input.file.bytes.length },
      status: "pending",
      decisionReason: null,
      decidedBy: null,
      decidedAt: null,
      createdAt: new Date(),
      ipHash: input.ipHash,
    });
  } catch (err) {
    await docs.deleteOne({ _id: id }).catch(() => {});
    throw err;
  }
  await recordPlatformAudit({ actorId: "system", action: "reactivation.request", target: { type: "company", id: company._id }, companyId: company._id, details: { reference, emailMatchesDirector: matches } });
  await mail(email, {
    heading: "We received your reactivation request",
    paragraphs: [`Hi ${input.fields.name.trim()},`, `We have your request to reactivate ${company.name} (reference ${reference}). Our team reviews it and the ID you sent, and you will get an email with the decision.`],
    footnote: "If you didn't send this request, you can ignore this email.",
  });
  return { ok: true, reference };
}

/** Platform mail: sent in the platform owner's scope, because the company's own workspace is switched off. */
async function mail(to: string, c: { heading: string; paragraphs: string[]; footnote?: string }): Promise<void> {
  try {
    const owner = await getPlatformOwnerCompanyId();
    const send = async () => {
      const { html, text } = renderEmail({ brand: "SelfRun AI", ...c });
      await sendEmail({ to, subject: c.heading, html, text });
    };
    if (owner) await runAsCompany(owner, send);
    else await send();
  } catch (err) {
    console.error("[reactivation] email failed", err);
  }
}

export interface PublicRequestState {
  status: RequestStatus;
  reference: string;
  createdAt: Date;
  decidedAt: Date | null;
  /** Shown to the company only for a rejection (it is the explanation they were emailed). */
  reason: string | null;
}

/** The latest request of a company, as the suspended page may show it. */
export async function latestRequestState(companyId: string): Promise<PublicRequestState | null> {
  const { requests } = await cols();
  const r = await requests.findOne({ companyId }, { sort: { createdAt: -1 } });
  if (!r) return null;
  return { status: r.status, reference: `RA-${r._id.slice(0, 8).toUpperCase()}`, createdAt: r.createdAt, decidedAt: r.decidedAt, reason: r.status === "rejected" ? r.decisionReason : null };
}

export async function listRequests(companyId: string): Promise<ReactivationRequest[]> {
  const { requests } = await cols();
  return requests.find({ companyId }).sort({ createdAt: -1 }).limit(20).toArray();
}

export async function pendingRequestCount(): Promise<number> {
  const { requests } = await cols();
  return requests.countDocuments({ status: "pending" });
}

export type DecideResult = { ok: true } | { ok: false; error: string };

/** Approve (reactivates the company) or reject (needs a reason). A request can be decided once. */
export async function decideRequest(requestId: string, decision: "approved" | "rejected", reason: string, actorId: string): Promise<DecideResult> {
  const note = reason.trim();
  if (decision === "rejected") {
    const bad = reasonError(note);
    if (bad) return { ok: false, error: bad };
  }
  const { requests } = await cols();
  const claimed = await requests.findOneAndUpdate(
    { _id: requestId, status: "pending" },
    { $set: { status: decision, decisionReason: note || null, decidedBy: actorId, decidedAt: new Date() } },
    { returnDocument: "after" },
  );
  if (!claimed) return { ok: false, error: "This request was already decided." };
  if (decision === "approved") {
    const res = await setCompanyStatus(claimed.companyId, "active", actorId);
    if (!res.ok) {
      await requests.updateOne({ _id: requestId }, { $set: { status: "pending", decisionReason: null, decidedBy: null, decidedAt: null } });
      return res;
    }
  }
  await recordPlatformAudit({
    actorId,
    action: decision === "approved" ? "reactivation.approve" : "reactivation.reject",
    target: { type: "company", id: claimed.companyId },
    companyId: claimed.companyId,
    details: { reference: `RA-${requestId.slice(0, 8).toUpperCase()}`, ...(note ? { reason: note } : {}) },
  });
  await mail(
    claimed.email,
    decision === "approved"
      ? { heading: `${claimed.companyName} is active again`, paragraphs: [`Hi ${claimed.name},`, `Your reactivation request was approved. ${claimed.companyName} is back online, with all of its data as it was. You can sign in as usual.`, ...(note ? [`Note from our team: ${note}`] : [])] }
      : { heading: "Your reactivation request was not approved", paragraphs: [`Hi ${claimed.name},`, `We reviewed your request to reactivate ${claimed.companyName} and could not approve it.`, `Reason: ${note}`, "You can send a new request from your workspace address once the reason is addressed."] },
  );
  return { ok: true };
}

/** A company brought back by hand (Company page → Reactivate) closes whatever was waiting. */
export async function closePendingOnReactivate(companyId: string, actorId: string): Promise<void> {
  const { requests } = await cols();
  await requests.updateMany({ companyId, status: "pending" }, { $set: { status: "approved", decisionReason: "Reactivated from the company page.", decidedBy: actorId, decidedAt: new Date() } }).catch(() => {});
}

/** The stored ID, decrypted. Callers must have checked the viewer's permission and audit the view. */
export async function readIdDocument(requestId: string): Promise<{ bytes: Buffer; type: string; name: string; companyId: string } | null> {
  const { requests, docs } = await cols();
  const [row, req] = await Promise.all([docs.findOne({ _id: requestId }), requests.findOne({ _id: requestId }, { projection: { idFile: 1 } })]);
  if (!row || !req) return null;
  if (row.enc) {
    const plain = decryptPlatformSecret(row.enc, ctx(requestId));
    return plain ? { bytes: Buffer.from(plain, "base64"), type: row.type, name: req.idFile.name, companyId: row.companyId } : null;
  }
  return row.raw ? { bytes: Buffer.from(row.raw.buffer), type: row.type, name: req.idFile.name, companyId: row.companyId } : null;
}

export const hashIp = (ip: string) => createHash("sha256").update(ip).digest("hex").slice(0, 32);
