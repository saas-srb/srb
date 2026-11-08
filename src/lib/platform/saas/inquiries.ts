import "server-only";
import { randomUUID } from "node:crypto";
import { getPlatformDb } from "@/lib/platform/tenancy/platform-db";
import { sendEmail } from "@/lib/platform/email";
import { saasContact } from "@/lib/platform/saas/brand";

/** Demo requests and contact messages sent from the product website by people who are not (yet) a company. */
export const INQUIRIES_COLLECTION = "saas_inquiries";

export { parseInquiry, PRIVACY_REQUEST_DAYS, PRIVACY_REQUEST_TYPES } from "@/lib/platform/saas/inquiries-shared";
export type { Inquiry, InquiryInput, InquiryKind } from "@/lib/platform/saas/inquiries-shared";
import { PRIVACY_REQUEST_DAYS, type Inquiry, type InquiryInput } from "@/lib/platform/saas/inquiries-shared";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);

/** Stores the inquiry and tells the sales/resolveiq mailbox. Storage is what matters: a failed email never fails the request. */
export async function saveInquiry(input: InquiryInput, host: string): Promise<{ reference?: string }> {
  const now = new Date();
  const privacy = input.kind === "privacy";
  // A privacy request gets a reference the person can quote, and a due date: it is a legal deadline, so it is stored with the request.
  const reference = privacy ? `PR-${randomUUID().slice(0, 8).toUpperCase()}` : undefined;
  const doc: Inquiry = { _id: randomUUID(), ...input, status: "new", createdAt: now, ...(privacy ? { reference, dueAt: new Date(now.getTime() + PRIVACY_REQUEST_DAYS * 86_400_000) } : {}) };
  await (await getPlatformDb()).collection<Inquiry>(INQUIRIES_COLLECTION).insertOne(doc);
  const contact = saasContact(host);
  const title = privacy ? `Privacy request ${reference}` : input.kind === "demo" ? "New demo request" : "New contact message";
  const labels = privacy ? { company: "Country or region", interest: "Request" } : { company: "Company", interest: "Interested in" };
  const rows: [string, string][] = [["Name", input.name], ["Email", input.email], [labels.company, input.company], ["Phone", input.phone], ["Team size", input.teamSize], [labels.interest, input.interest], ["Message", input.message], ...(privacy ? ([["Reference", reference ?? ""], ["Answer by", doc.dueAt!.toISOString().slice(0, 10)]] as [string, string][]) : [])];
  await sendEmail({
    to: privacy ? contact.privacy : input.kind === "demo" ? contact.sales : contact.hello,
    subject: `${title}: ${input.name}${!privacy && input.company ? ` (${input.company})` : ""}`,
    html: `<h2>${esc(title)}</h2><table cellpadding="6">${rows.filter(([, v]) => v).map(([k, v]) => `<tr><td><strong>${esc(k)}</strong></td><td>${esc(v).replace(/\n/g, "<br>")}</td></tr>`).join("")}</table>`,
    text: rows.filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join("\n"),
    replyTo: input.email,
  }).catch(() => {});
  // Tell the person we have it, with the reference and the date to expect an answer by (the first step of the procedure).
  if (privacy) {
    await sendEmail({
      to: input.email,
      subject: `We received your privacy request (${reference})`,
      html: `<p>Hello ${esc(input.name)},</p><p>We have received your request: <strong>${esc(input.interest)}</strong>. Your reference is <strong>${esc(reference ?? "")}</strong>.</p><p>We will reply to this email address within ${PRIVACY_REQUEST_DAYS} days (by ${doc.dueAt!.toISOString().slice(0, 10)}). To protect your information we may ask you to confirm who you are before we act on it.</p><p>If you did not make this request, you can ignore this email.</p>`,
      text: `Hello ${input.name},\n\nWe have received your request: ${input.interest}. Your reference is ${reference}.\n\nWe will reply to this email address within ${PRIVACY_REQUEST_DAYS} days (by ${doc.dueAt!.toISOString().slice(0, 10)}). To protect your information we may ask you to confirm who you are before we act on it.\n\nIf you did not make this request, you can ignore this email.`,
    }).catch(() => {});
  }
  return { reference };
}
