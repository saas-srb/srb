import "server-only";
import { createHash } from "node:crypto";
import { clientIp } from "@/lib/security/rate-limit";
import { cfClones, cfRequests, cfSigners } from "./cf-db";
import type { CloneDoc } from "./clone-types";
import { markSignatureApplied } from "./clones";
import { ensureSealed } from "./seal";
import { markVersionStatus } from "./clone-versions";
import { appendEvent } from "./events";
import { isIdentityVerified, otpChannels } from "./otp";
import type { SignerAccess } from "./public-access";
import { CONSENT_TEXT, CONSENT_VERSION, HOW_IT_WORKS, MANDATORY_NOTICE, TYPED_SIGNATURE_STYLES, reviewMarker } from "./sign-consent";
import type { RequestDoc, SignatureArtefact, SignerDoc } from "./sign-types";
import { deleteSignatureImage, saveSignatureImage } from "./signature-store";

/**
 * What a signer sees and does on the public page (B4). Everything here runs inside the signer's company (the caller uses
 * `access.inCompany`). The checks are the real gate: the page only hides buttons.
 *
 * Order of the signing step, and why:
 *  1. every check (open request, one-time code passed, document opened, consent, name, turn, content unchanged, signature image valid);
 *  2. CLAIM the signer atomically (open -> signed, token used). Only one submit can win, so a double click or a replay cannot sign twice;
 *  3. `markSignatureApplied` on the clone straight away, which locks its content for good. If that is refused (the document was edited in the
 *     instant between the checks and the claim) the claim is undone and nothing was signed. If the process dies between 2 and 3, the clone's
 *     own save refuses and locks as soon as it sees a signed signer, so a signed document can never be edited.
 */

export const consentTextSha256 = () => createHash("sha256").update(CONSENT_TEXT, "utf8").digest("hex");

export type FlowCode = "identity_required" | "document_not_viewed" | "consent_required" | "name_required" | "not_your_turn" | "closed" | "document_changed" | "bad_signature" | "already_done" | "unavailable";
export type FlowFail = { ok: false; code: FlowCode; message: string };
const fail = (code: FlowCode, message: string): FlowFail => ({ ok: false, code, message });

const ctrl = /[\u0000-\u001f\u007f]/g;
const clean = (s: unknown, max: number) => (typeof s === "string" ? s.replace(ctrl, " ").replace(/\s+/g, " ").trim().slice(0, max) : "");

/** The clone behind a request, without a viewer: the signer is not a ContractFlow user. Null when the request has no clone in this store. */
export async function cloneForRequest(request: Pick<RequestDoc, "cloneId">): Promise<CloneDoc | null> {
  return (await cfClones()).findOne({ _id: request.cloneId });
}

export interface SigningView {
  title: string;
  signerName: string;
  role: SignerDoc["role"];
  designationSuggestion: string;
  expiresAt: string;
  identityVerified: boolean;
  documentViewed: boolean;
  documentAvailable: boolean;
  /** Names (not addresses) of the people who must sign before this signer, in sequential mode. */
  waitingFor: string[];
  canSignNow: boolean;
  channels: { email: { available: boolean; reason: string | null }; sms: { available: boolean; reason: string | null }; hasPhone: boolean };
  consent: { version: string; text: string; notice: string; howItWorks: string; reviewMarker: string };
  typedStyles: { key: string; label: string; css: string }[];
}

async function others(request: RequestDoc, signer: Pick<SignerDoc, "_id">) {
  return (await cfSigners()).find({ requestId: request._id, _id: { $ne: signer._id } }).toArray();
}
function waiting(request: RequestDoc, signer: Pick<SignerDoc, "order">, rest: SignerDoc[]): string[] {
  if (request.orderMode !== "sequential") return [];
  return rest.filter((s) => s.order < signer.order && s.status !== "signed").map((s) => s.name);
}

export async function getSigningView(access: SignerAccess): Promise<SigningView> {
  return access.inCompany(async () => {
    const signer = (await (await cfSigners()).findOne({ _id: access.signer._id }))!;
    const rest = await others(access.request, signer);
    const wait = waiting(access.request, signer, rest);
    const clone = await cloneForRequest(access.request);
    const ch = await otpChannels();
    return {
      title: access.request.title,
      signerName: signer.name,
      role: signer.role,
      designationSuggestion: "",
      expiresAt: access.request.expiresAt.toISOString(),
      identityVerified: await isIdentityVerified(signer._id),
      documentViewed: !!signer.documentViewedAt,
      documentAvailable: !!clone,
      waitingFor: wait,
      canSignNow: wait.length === 0,
      channels: { email: ch.email, sms: ch.sms, hasPhone: !!signer.phone },
      consent: { version: CONSENT_VERSION, text: CONSENT_TEXT, notice: MANDATORY_NOTICE, howItWorks: HOW_IT_WORKS, reviewMarker: reviewMarker() },
      typedStyles: TYPED_SIGNATURE_STYLES.map((s) => ({ key: s.key, label: s.label, css: s.css })),
    };
  });
}

/** Records that the signer opened the document itself (signing needs it). Idempotent. */
export async function markDocumentViewed(access: SignerAccess, headers: Headers): Promise<void> {
  await access.inCompany(async () => {
    const r = await (await cfSigners()).updateOne({ _id: access.signer._id, documentViewedAt: { $in: [null, undefined] } as never }, { $set: { documentViewedAt: new Date() } });
    if (r.modifiedCount === 1) await appendEvent({ requestId: access.request._id, signerId: access.signer._id, type: "document_viewed", actorType: "signer", actorId: access.signer._id, ip: clientIp(new Request("http://signing.invalid/", { headers })), userAgent: headers.get("user-agent") });
  });
}

export type SignatureInput =
  | { kind: "drawn"; dataUrl: string }
  | { kind: "uploaded"; base64: string }
  | { kind: "typed"; text: string; style: string };

export interface SubmitInput {
  signedName: string;
  designation?: string;
  consentAccepted: boolean;
  consentVersion: string;
  signature: SignatureInput;
}

function decodeBase64(b64: unknown, max: number): Buffer | null {
  if (typeof b64 !== "string" || b64.length > max * 1.4 || !/^[A-Za-z0-9+/=\s]+$/.test(b64)) return null;
  const buf = Buffer.from(b64, "base64");
  return buf.length > 0 && buf.length <= max ? buf : null;
}

async function artefact(sig: SignatureInput): Promise<{ ok: true; art: SignatureArtefact } | FlowFail> {
  if (sig?.kind === "typed") {
    const text = clean(sig.text, 80);
    if (text.length < 2) return fail("bad_signature", "Type your name to sign.");
    if (!TYPED_SIGNATURE_STYLES.some((s) => s.key === sig.style)) return fail("bad_signature", "Choose a signature style.");
    return { ok: true, art: { kind: "typed", storageKey: null, sha256: createHash("sha256").update(`${sig.style}:${text}`).digest("hex"), widthPx: null, heightPx: null, typedText: text, style: sig.style } };
  }
  if (sig?.kind === "drawn" || sig?.kind === "uploaded") {
    let raw: string | undefined;
    if (sig.kind === "drawn") {
      const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(typeof sig.dataUrl === "string" ? sig.dataUrl.slice(0, 2_100_000) : "");
      raw = m?.[1];
    } else raw = sig.base64;
    const bytes = decodeBase64(raw, 1_500_000);
    if (!bytes) return fail("bad_signature", "The signature image is missing or too large.");
    const saved = await saveSignatureImage(bytes);
    if (!saved.ok) return fail("bad_signature", saved.message);
    return { ok: true, art: { kind: sig.kind, storageKey: saved.storageKey, sha256: saved.sha256, widthPx: saved.widthPx, heightPx: saved.heightPx, typedText: null, style: null } };
  }
  return fail("bad_signature", "Choose how you want to sign.");
}

const ipOf = (headers: Headers) => clientIp(new Request("http://signing.invalid/", { headers }));

/** The signing step. See the header comment for the order. */
export async function submitSignature(access: SignerAccess, input: SubmitInput, headers: Headers, now = new Date()): Promise<{ ok: true; complete: boolean } | FlowFail> {
  return access.inCompany(async () => {
    const signers = await cfSigners();
    const signer = await signers.findOne({ _id: access.signer._id });
    const request = await (await cfRequests()).findOne({ _id: access.request._id });
    if (!signer || !request) return fail("unavailable", "This request is no longer available.");
    if (signer.status === "signed" || signer.status === "declined" || signer.tokenUsedAt) return fail("already_done", "You have already answered this request.");
    if (!["sent", "in_progress"].includes(request.status) || signer.tokenRevokedAt || request.expiresAt.getTime() <= now.getTime()) return fail("closed", "This request is closed.");
    if (!(await isIdentityVerified(signer._id, now))) return fail("identity_required", "Confirm the one-time code sent to you before signing.");
    if (!signer.documentViewedAt) return fail("document_not_viewed", "Open and read the document before signing.");
    if (input?.consentAccepted !== true || input.consentVersion !== CONSENT_VERSION) return fail("consent_required", "Tick the box to confirm you agree before signing.");
    const signedName = clean(input.signedName, 160);
    if (signedName.length < 2) return fail("name_required", "Enter the name you are signing as.");
    const designation = clean(input.designation, 100) || null;
    const rest = await others(request, signer);
    if (waiting(request, signer, rest).length) return fail("not_your_turn", "Other people must sign before you. You will be able to sign when it is your turn.");
    const clone = await cloneForRequest(request);
    if (clone) {
      if (!["sent", "partially_signed"].includes(clone.status) || (request.contentSha256 && clone.contentSha256 !== request.contentSha256)) return fail("document_changed", "The document was changed after it was sent. Ask the sender for a new link.");
    }
    const art = await artefact(input.signature);
    if (!art.ok) return art;

    const claimed = await signers.findOneAndUpdate(
      { _id: signer._id, status: { $in: ["sent", "viewed", "otp_verified"] }, tokenUsedAt: null, tokenRevokedAt: null },
      { $set: { status: "signed", signedAt: now, tokenUsedAt: now, ip: ipOf(headers), userAgent: headers.get("user-agent")?.slice(0, 300) ?? null, signedName, designation, signature: art.art, consent: { version: CONSENT_VERSION, textSha256: consentTextSha256(), at: now }, signedContentSha256: request.contentSha256 ?? clone?.contentSha256 ?? null } },
      { returnDocument: "after" }
    );
    if (!claimed) {
      if (art.art.storageKey) await deleteSignatureImage(art.art.storageKey);
      return fail("already_done", "You have already answered this request.");
    }
    const complete = rest.every((s) => s.status === "signed");
    if (clone) {
      const locked = await markSignatureApplied(clone._id, { complete, by: signer._id });
      if (!locked) {
        await signers.updateOne({ _id: signer._id }, { $set: { status: "otp_verified", tokenUsedAt: null, signedAt: null, signature: null, consent: null, signedName: null, designation: null, signedContentSha256: null } });
        if (art.art.storageKey) await deleteSignatureImage(art.art.storageKey);
        return fail("document_changed", "The document was changed just now, so nothing was signed. Ask the sender for a new link.");
      }
    }
    await (await cfRequests()).updateOne({ _id: request._id, status: { $in: ["sent", "in_progress"] } }, { $set: { status: complete ? "completed" : "in_progress", updatedAt: now } });
    await appendEvent({ requestId: request._id, signerId: signer._id, type: "signer_signed", actorType: "signer", actorId: signer._id, ip: ipOf(headers), userAgent: headers.get("user-agent"), data: { role: signer.role, kind: art.art.kind, signatureSha256: art.art.sha256, contentSha256: claimed.signedContentSha256 ?? null, consentVersion: CONSENT_VERSION, complete } });
    // Everyone has signed: draw the final PDF with the signatures and the certificate, store it, and email it. A problem here never undoes
    // the signatures; the sealed copy can be made again from the document page.
    if (complete && clone) await ensureSealed(clone._id).catch((e) => console.error("[contractflow] sealing failed", e instanceof Error ? e.message : e));
    return { ok: true as const, complete };
  });
}

/** The signer says no. The request ends as declined, every other link stops working, and the evidence is kept. */
export async function submitDecline(access: SignerAccess, reason: unknown, headers: Headers, now = new Date()): Promise<{ ok: true } | FlowFail> {
  return access.inCompany(async () => {
    const signers = await cfSigners();
    const signer = await signers.findOne({ _id: access.signer._id });
    const request = await (await cfRequests()).findOne({ _id: access.request._id });
    if (!signer || !request) return fail("unavailable", "This request is no longer available.");
    if (signer.status === "signed" || signer.status === "declined" || signer.tokenUsedAt) return fail("already_done", "You have already answered this request.");
    if (!["sent", "in_progress"].includes(request.status) || signer.tokenRevokedAt || request.expiresAt.getTime() <= now.getTime()) return fail("closed", "This request is closed.");
    if (!(await isIdentityVerified(signer._id, now))) return fail("identity_required", "Confirm the one-time code sent to you first.");
    const why = clean(reason, 500);
    if (why.length < 3) return fail("name_required", "Please tell the sender why you are declining.");
    const claimed = await signers.findOneAndUpdate({ _id: signer._id, status: { $in: ["sent", "viewed", "otp_verified"] }, tokenUsedAt: null, tokenRevokedAt: null }, { $set: { status: "declined", declineReason: why, tokenUsedAt: now, ip: ipOf(headers), userAgent: headers.get("user-agent")?.slice(0, 300) ?? null } }, { returnDocument: "after" });
    if (!claimed) return fail("already_done", "You have already answered this request.");
    await (await cfRequests()).updateOne({ _id: request._id }, { $set: { status: "declined", updatedAt: now } });
    await signers.updateMany({ requestId: request._id, _id: { $ne: signer._id }, tokenRevokedAt: null }, { $set: { tokenRevokedAt: now } });
    await (await cfClones()).updateOne({ _id: request.cloneId, status: { $in: ["ready", "sent", "partially_signed"] } }, { $set: { status: "declined", updatedAt: now } });
    const declinedClone = await cloneForRequest(request);
    if (declinedClone) await markVersionStatus(declinedClone._id, declinedClone.rev, "declined", why);
    await appendEvent({ requestId: request._id, signerId: signer._id, type: "signer_declined", actorType: "signer", actorId: signer._id, ip: ipOf(headers), userAgent: headers.get("user-agent"), data: { reason: why } });
    return { ok: true as const };
  });
}
