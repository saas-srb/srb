import "server-only";
import { lpmsCan } from "@/lib/lpms-roles";
import { sendEmail } from "@/lib/platform/email";
import { escapeHtml } from "@/lib/platform/email/template";
import { appUrlForCompany } from "@/lib/platform/tenancy/site-url";
import { getCompany } from "@/lib/platform/tenancy/companies";
import { currentCompanyId } from "@/lib/platform/tenancy/context";
import { cfClones, cfRequests } from "./cf-db";
import { markVersionStatus } from "./clone-versions";
import type { CloneDoc, CloneResult } from "./clone-types";
import { createRequest, RequestError, resendLink, type IssuedLink } from "./requests";
import { MANDATORY_NOTICE } from "./sign-consent";
import type { RequestDoc } from "./sign-types";
import type { LpmsViewer } from "./types";

/**
 * Sending a READY clone to its signers: makes the signature request from the clone's plan (signers, order, expiry) and emails each signer
 * their own link. The link carries the secret token; the email is the only place it is ever shown. If an email cannot be sent the request is
 * still made, and the result lists who was not reached so the sender can re-send.
 */
export interface Mailer {
  send(to: string, subject: string, text: string, html: string): Promise<boolean>;
}
const realMailer: Mailer = {
  async send(to, subject, text, html) {
    return (await sendEmail({ to, subject, text, html })).ok;
  },
};
let mailer: Mailer = realMailer;
/** Tests only. */
export function __setSigningMailer(m: Mailer | null) {
  mailer = m ?? realMailer;
}

export interface SendResult {
  request: RequestDoc;
  delivered: string[];
  notDelivered: string[];
}

export async function sendCloneToSigners(v: LpmsViewer, cloneId: string, opts: { baseUrl?: string; now?: Date } = {}): Promise<CloneResult<{ result: SendResult; clone: CloneDoc }>> {
  const ctx = { roles: v.roles, permissionOverrides: v.overrides };
  if (!lpmsCan(ctx, "SIGN") && !lpmsCan(ctx, "MANAGE_DOCUMENTS")) return { ok: false, error: { code: "forbidden", message: "You may not send documents for signature." } };
  const clone = await (await cfClones()).findOne({ _id: cloneId });
  if (!clone) return { ok: false, error: { code: "not_found", message: "That document was not found." } };
  if (clone.status !== "ready") return { ok: false, error: { code: "bad_status", message: clone.status === "clone_draft" ? "Mark the document ready before sending it." : "This document is not waiting to be sent." } };
  const now = opts.now ?? new Date();
  let created: { request: RequestDoc; links: IssuedLink[] };
  try {
    created = await createRequest(v, {
      cloneId: clone._id,
      title: clone.title,
      partyId: clone.party.partyId,
      orderMode: clone.options.orderMode,
      expiresAt: new Date(now.getTime() + clone.options.expiryDays * 86_400_000),
      signers: clone.signerPlan,
    }, now);
  } catch (e) {
    if (e instanceof RequestError) return { ok: false, error: { code: e.code === "forbidden" ? "forbidden" : e.code === "conflict" ? "conflict" : "invalid", message: e.message } };
    throw e;
  }
  const companyId = await currentCompanyId();
  const base = (opts.baseUrl ?? (await appUrlForCompany(companyId))).replace(/\/+$/, "");
  const company = await getCompany(companyId).catch(() => null);
  const from = company?.name ?? "A company";
  const delivered: string[] = [];
  const notDelivered: string[] = [];
  for (const link of created.links) {
    const signer = clone.signerPlan.find((s) => s.email.toLowerCase() === link.email) ?? { name: link.email };
    const url = `${base}/sign/${link.token}`;
    const when = created.request.expiresAt.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
    const text = `Hello ${signer.name},\n\n${from} has asked you to review and sign "${clone.title}".\n\nOpen this link to read it and sign: ${url}\n\nThe link is personal to you and works until ${when}. Do not forward it.${clone.options.orderMode === "sequential" ? "\n\nThe document is signed in order; if it is not your turn yet the page will tell you." : ""}\n\n${MANDATORY_NOTICE}\n`;
    const html = `<p>Hello ${escapeHtml(signer.name)},</p><p>${escapeHtml(from)} has asked you to review and sign <strong>${escapeHtml(clone.title)}</strong>.</p><p><a href="${escapeHtml(url)}">Open the document and sign</a></p><p>The link is personal to you and works until ${escapeHtml(when)}. Do not forward it.</p><p style="color:#555;font-size:12px">${escapeHtml(MANDATORY_NOTICE)}</p>`;
    let ok = false;
    try {
      ok = await mailer.send(link.email, `Please sign: ${clone.title}`, text, html);
    } catch {
      ok = false;
    }
    (ok ? delivered : notDelivered).push(link.email);
  }
  const after = (await (await cfClones()).findOne({ _id: cloneId }))!;
  await markVersionStatus(cloneId, after.rev, "sent", `${delivered.length} signer${delivered.length === 1 ? "" : "s"}`);
  return { ok: true, result: { request: created.request, delivered, notDelivered }, clone: after };
}

/** Replaces one signer's link (the old one stops working) and emails the new one. For a signer who lost or never received the email. */
export async function resendToSigner(v: LpmsViewer, cloneId: string, signerId: string, opts: { baseUrl?: string } = {}): Promise<CloneResult<{ delivered: boolean; email: string }>> {
  const ctx = { roles: v.roles, permissionOverrides: v.overrides };
  if (!lpmsCan(ctx, "SIGN") && !lpmsCan(ctx, "MANAGE_DOCUMENTS")) return { ok: false, error: { code: "forbidden", message: "You may not send documents for signature." } };
  const clone = await (await cfClones()).findOne({ _id: cloneId });
  if (!clone || !clone.requestId) return { ok: false, error: { code: "not_found", message: "This document has not been sent." } };
  let link: IssuedLink;
  try {
    link = await resendLink(v, clone.requestId, signerId);
  } catch (e) {
    if (e instanceof RequestError) return { ok: false, error: { code: e.code === "forbidden" ? "forbidden" : e.code === "not_found" ? "not_found" : "bad_status", message: e.message } };
    throw e;
  }
  const request = await (await cfRequests()).findOne({ _id: clone.requestId });
  const companyId = await currentCompanyId();
  const base = (opts.baseUrl ?? (await appUrlForCompany(companyId))).replace(/\/+$/, "");
  const company = await getCompany(companyId).catch(() => null);
  const from = company?.name ?? "A company";
  const signer = clone.signerPlan.find((s) => s.email.toLowerCase() === link.email) ?? { name: link.email };
  const url = `${base}/sign/${link.token}`;
  const when = (request?.expiresAt ?? new Date(Date.now() + 14 * 86_400_000)).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
  const text = `Hello ${signer.name},\n\n${from} has sent you a new link to review and sign "${clone.title}". Earlier links no longer work.\n\nOpen this link: ${url}\n\nThe link is personal to you and works until ${when}. Do not forward it.\n\n${MANDATORY_NOTICE}\n`;
  const html = `<p>Hello ${escapeHtml(signer.name)},</p><p>${escapeHtml(from)} has sent you a new link to review and sign <strong>${escapeHtml(clone.title)}</strong>. Earlier links no longer work.</p><p><a href="${escapeHtml(url)}">Open the document and sign</a></p><p>The link is personal to you and works until ${escapeHtml(when)}. Do not forward it.</p>`;
  let delivered = false;
  try {
    delivered = await mailer.send(link.email, `Please sign: ${clone.title}`, text, html);
  } catch {
    delivered = false;
  }
  return { ok: true, delivered, email: link.email };
}
