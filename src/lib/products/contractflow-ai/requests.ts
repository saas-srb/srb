import "server-only";
import { randomUUID } from "node:crypto";
import { lpmsCan } from "@/lib/lpms-roles";
import { cfClones, cfRequests, cfSigners } from "./cf-db";
import { appendEvent } from "./events";
import { generateToken, hashToken } from "./tokens";
import { SIGNER_ROLES, type OrderMode, type RequestDoc, type SignerDoc } from "./sign-types";
import type { NewSigner } from "./requests-types";
import type { LpmsViewer } from "./types";

/**
 * Creating and managing signature requests (company side). Raw link tokens are returned to the caller ONCE so it can put them in the
 * signer's link; only their hashes are stored. Every change appends an event.
 */

export class RequestError extends Error {
  constructor(message: string, readonly code: "forbidden" | "invalid" | "not_found" | "conflict") {
    super(message);
    this.name = "RequestError";
  }
}

const ctx = (v: LpmsViewer) => ({ roles: v.roles, permissionOverrides: v.overrides });
const mayManage = (v: LpmsViewer) => lpmsCan(ctx(v), "SIGN") || lpmsCan(ctx(v), "MANAGE_DOCUMENTS");
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const clean = (s: unknown, max: number) => (typeof s === "string" ? s.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max) : "");
export const MAX_SIGNERS = 20;
export const MAX_EXPIRY_DAYS = 365;
const DAY = 86_400_000;

export type { NewSigner };

export interface CreateRequestInput {
  cloneId: string;
  title: string;
  partyId?: string | null;
  orderMode?: OrderMode;
  expiresAt: Date;
  signers: NewSigner[];
}

export interface IssuedLink {
  signerId: string;
  email: string;
  /** The only time the raw token exists outside the signer's link. Not stored. */
  token: string;
}

export async function createRequest(v: LpmsViewer, input: CreateRequestInput, now = new Date()): Promise<{ request: RequestDoc; links: IssuedLink[] }> {
  if (!mayManage(v)) throw new RequestError("You may not request signatures.", "forbidden");
  const cloneId = clean(input.cloneId, 64);
  const title = clean(input.title, 200);
  if (!cloneId || !title) throw new RequestError("A request needs a document and a title.", "invalid");
  if (!(input.expiresAt instanceof Date) || Number.isNaN(input.expiresAt.getTime()) || input.expiresAt.getTime() <= now.getTime() + 60_000) throw new RequestError("The expiry must be in the future.", "invalid");
  if (input.expiresAt.getTime() > now.getTime() + MAX_EXPIRY_DAYS * DAY) throw new RequestError(`The expiry cannot be more than ${MAX_EXPIRY_DAYS} days away.`, "invalid");
  if (!Array.isArray(input.signers) || input.signers.length < 1 || input.signers.length > MAX_SIGNERS) throw new RequestError(`A request needs between 1 and ${MAX_SIGNERS} signers.`, "invalid");
  const seen = new Set<string>();
  const rows = input.signers.map((s, i) => {
    const email = clean(s.email, 200).toLowerCase();
    const name = clean(s.name, 160);
    if (!SIGNER_ROLES.includes(s.role)) throw new RequestError("A signer's role is not valid.", "invalid");
    if (name.length < 2) throw new RequestError("Every signer needs a name.", "invalid");
    if (!EMAIL.test(email)) throw new RequestError(`The email address for ${name} is not valid.`, "invalid");
    if (seen.has(email)) throw new RequestError(`${email} is listed twice.`, "invalid");
    seen.add(email);
    const phone = clean(s.phone, 30) || null;
    if (phone && !/^[+0-9][0-9 \-()]{6,28}$/.test(phone)) throw new RequestError(`The phone number for ${name} is not valid.`, "invalid");
    return { s, email, name, phone, order: Number.isInteger(s.order) && (s.order as number) >= 1 ? (s.order as number) : i + 1 };
  });

  // A real clone must be ready (its content frozen) before anyone is asked to sign it; the request then records what they will be shown.
  const clone = await (await cfClones()).findOne({ _id: cloneId });
  if (clone && (clone.status !== "ready" || !clone.frozenContentSha256)) throw new RequestError("Mark the document ready before sending it for signature.", "invalid");

  const request: RequestDoc = {
    _id: randomUUID(),
    cloneId,
    title,
    partyId: input.partyId ? clean(input.partyId, 64) : null,
    orderMode: input.orderMode === "sequential" ? "sequential" : "parallel",
    status: "sent",
    authMode: "otp",
    provider: "built-in",
    expiresAt: input.expiresAt,
    createdBy: v.userId,
    createdAt: now,
    updatedAt: now,
    voidedAt: null,
    voidReason: null,
    contentSha256: clone?.frozenContentSha256 ?? null,
  };
  const links: IssuedLink[] = [];
  const signers: SignerDoc[] = rows.map((r) => {
    const token = generateToken();
    const doc: SignerDoc = {
      _id: randomUUID(),
      requestId: request._id,
      role: r.s.role,
      name: r.name,
      email: r.email,
      phone: r.phone,
      order: r.order,
      status: "sent",
      tokenHash: hashToken(token),
      tokenPurpose: "sign",
      tokenExpiresAt: request.expiresAt,
      tokenUsedAt: null,
      tokenRevokedAt: null,
      signedAt: null,
      ip: null,
      userAgent: null,
      declineReason: null,
      createdAt: now,
    };
    links.push({ signerId: doc._id, email: doc.email, token });
    return doc;
  });
  await (await cfRequests()).insertOne(request);
  await (await cfSigners()).insertMany(signers);
  if (clone) {
    const moved = await (await cfClones()).updateOne({ _id: clone._id, status: "ready", rev: clone.rev }, { $set: { status: "sent", requestId: request._id, updatedAt: now } });
    if (moved.matchedCount === 0) {
      await (await cfRequests()).deleteOne({ _id: request._id });
      await (await cfSigners()).deleteMany({ requestId: request._id });
      throw new RequestError("The document changed while the request was being made. Try again.", "conflict");
    }
  }
  await appendEvent({ requestId: request._id, type: "request_created", actorType: "user", actorId: v.userId, data: { signers: signers.length, orderMode: request.orderMode } });
  for (const s of signers) await appendEvent({ requestId: request._id, signerId: s._id, type: "link_issued", actorType: "user", actorId: v.userId, data: { role: s.role } });
  return { request, links };
}

async function load(requestId: string) {
  const request = typeof requestId === "string" && requestId.length <= 64 ? await (await cfRequests()).findOne({ _id: requestId }) : null;
  if (!request) throw new RequestError("Request not found.", "not_found");
  return request;
}

/** Replaces a signer's link: the old one stops working at once. Allowed only while the request is open and the signer has not signed. */
export async function resendLink(v: LpmsViewer, requestId: string, signerId: string): Promise<IssuedLink> {
  if (!mayManage(v)) throw new RequestError("You may not manage signature requests.", "forbidden");
  const request = await load(requestId);
  if (request.status === "completed" || request.status === "declined" || request.status === "voided" || request.status === "expired") throw new RequestError("This request is closed.", "conflict");
  const col = await cfSigners();
  const signer = await col.findOne({ _id: signerId, requestId });
  if (!signer) throw new RequestError("Signer not found.", "not_found");
  if (signer.status === "signed" || signer.status === "declined") throw new RequestError("This signer has already answered.", "conflict");
  const token = generateToken();
  await col.updateOne({ _id: signer._id }, { $set: { tokenHash: hashToken(token), tokenRevokedAt: null, tokenUsedAt: null, tokenExpiresAt: request.expiresAt, status: "sent", otpVerifiedAt: null, otpLockedUntil: null } });
  await appendEvent({ requestId, signerId, type: "link_revoked", actorType: "user", actorId: v.userId, data: { reason: "resent" } });
  await appendEvent({ requestId, signerId, type: "link_issued", actorType: "user", actorId: v.userId, data: { role: signer.role, resent: true } });
  return { signerId, email: signer.email, token };
}

/** Switches one signer's link off without voiding the request. */
export async function revokeLink(v: LpmsViewer, requestId: string, signerId: string): Promise<void> {
  if (!mayManage(v)) throw new RequestError("You may not manage signature requests.", "forbidden");
  await load(requestId);
  const r = await (await cfSigners()).updateOne({ _id: signerId, requestId, tokenRevokedAt: null }, { $set: { tokenRevokedAt: new Date() } });
  if (r.matchedCount === 0) throw new RequestError("Signer not found, or the link is already revoked.", "not_found");
  await appendEvent({ requestId, signerId, type: "link_revoked", actorType: "user", actorId: v.userId, data: { reason: "revoked" } });
}

/** Voids the request and revokes every link. Evidence (signers, events) is kept. */
export async function voidRequest(v: LpmsViewer, requestId: string, reason: string): Promise<void> {
  if (!mayManage(v)) throw new RequestError("You may not manage signature requests.", "forbidden");
  const why = clean(reason, 500);
  if (why.length < 3) throw new RequestError("A reason is required to void a request.", "invalid");
  await load(requestId);
  await closeRequest(requestId, why, { type: "user", id: v.userId });
}

/**
 * The void itself, without a permission check: for code that already checked its own (voiding a clone, editing a clone that is out for
 * signature). Idempotent. A completed request cannot be voided.
 */
export async function closeRequest(requestId: string, reason: string, actor: { type: "user" | "system"; id: string | null }): Promise<void> {
  const request = await load(requestId);
  if (request.status === "voided") return;
  if (request.status === "completed") throw new RequestError("A completed request cannot be voided.", "conflict");
  const now = new Date();
  await (await cfRequests()).updateOne({ _id: requestId }, { $set: { status: "voided", voidedAt: now, voidReason: reason, updatedAt: now } });
  await (await cfSigners()).updateMany({ requestId, tokenRevokedAt: null }, { $set: { tokenRevokedAt: now } });
  await appendEvent({ requestId, type: "request_voided", actorType: actor.type, actorId: actor.id, data: { reason } });
}

/** Marks an open request expired once its time has passed (also done lazily when a link is opened). */
export async function expireIfDue(requestId: string, now = new Date()): Promise<boolean> {
  const col = await cfRequests();
  const r = await col.updateOne({ _id: requestId, status: { $in: ["sent", "in_progress"] }, expiresAt: { $lte: now } }, { $set: { status: "expired", updatedAt: now } });
  if (r.modifiedCount === 0) return false;
  await (await cfSigners()).updateMany({ requestId, tokenRevokedAt: null }, { $set: { tokenRevokedAt: now } });
  await appendEvent({ requestId, type: "request_expired", actorType: "system" });
  return true;
}

export async function getRequest(requestId: string) {
  const request = await load(requestId);
  const signers = await (await cfSigners()).find({ requestId }).sort({ order: 1 }).toArray();
  // Never hand the token hashes to a caller that renders them.
  return { request, signers: signers.map(({ tokenHash: _t, ...rest }) => rest) };
}
