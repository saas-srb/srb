import "server-only";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { sendEmail } from "@/lib/platform/email";
import { escapeHtml } from "@/lib/platform/email/template";
import { getCompany } from "@/lib/platform/tenancy/companies";
import { currentCompanyId } from "@/lib/platform/tenancy/context";
import { appUrlForCompany } from "@/lib/platform/tenancy/site-url";
import { getObject, putObject } from "@/lib/storage/blob";
import { DEFAULT_PAGE } from "@/lib/products/playbook-ai/doc/page";
import { sequentialIds } from "@/lib/products/playbook-ai/doc/ids";
import { parseDoc } from "@/lib/products/playbook-ai/doc/validate";
import type { PBDoc } from "@/lib/products/playbook-ai/doc/types";
import { cfClones, cfRequests, cfSealIndex, cfSealed, cfSigners } from "./cf-db";
import { renderCloneDoc } from "./clone-render";
import type { CloneDoc, SealedDoc } from "./clone-types";
import { listEvents, verifyChain } from "./events";
import { MANDATORY_NOTICE } from "./sign-consent";
import type { SignerDoc } from "./sign-types";
import { getSignatureImage } from "./signature-store";

/**
 * Sealing (P10): when the last signer has signed, the clone's content (which is locked) is drawn once more as the FINAL PDF: the signatures are
 * placed in the document's signature blocks (matched by role, in order; any left over go on a signature page), followed by a certificate of
 * completion (who signed, when, how they were verified, the document's SHA-256, the event-chain check and the plain statement of what kind of
 * signature this is). The PDF's own SHA-256 is recorded, the file is stored privately, a public verify code is issued, and the signed copy is
 * emailed to every signer and to the company. Sealing is idempotent (one sealed copy per clone) and never undoes a signature if it fails:
 * the clone stays signed and `ensureSealed` can be run again.
 */

type Raw = Record<string, unknown>;
const IST = "Asia/Kolkata";
const when = (d: Date | null | undefined): string => (d ? `${d.toLocaleString("en-IN", { timeZone: IST, day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true })} IST` : "-");
const text = (t: string, bold = false): Raw => (bold ? { type: "text", text: t, marks: [{ type: "bold" }] } : { type: "text", text: t });
const para = (t: string, bold = false): Raw => ({ type: "paragraph", content: [text(t, bold)] });
const heading = (t: string, level = 2): Raw => ({ type: "heading", level, content: [text(t)] });
const cell = (t: string, bold = false): Raw => ({ content: [para(t || "-", bold)] });
function table(widths: number[], header: string[] | null, rows: string[][]): Raw {
  const rs: Raw[] = [];
  if (header) rs.push({ cells: header.map((h) => cell(h, true)) });
  for (const r of rows) rs.push({ cells: r.map((t, i) => cell(t, !header && i === 0)) });
  return { type: "table", colWidths: widths, headerRow: !!header, rows: rs };
}

async function readPrivate(key: string): Promise<Buffer | null> {
  const obj = await getObject(key);
  if (!obj) return null;
  const chunks: Uint8Array[] = [];
  const reader = obj.stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

interface Placed { signer: SignerDoc; fileId: string | null }

/** The blocks that show one signature: the image (or the typed name), then the name, designation and time. */
function signatureBlocks(p: Placed, label: string | null): Raw[] {
  const s = p.signer;
  const out: Raw[] = [];
  if (label) out.push(para(label, true));
  if (p.fileId) out.push({ type: "image", fileId: p.fileId, alt: `Signature of ${s.signedName ?? s.name}`, widthPct: 28, align: "left" });
  else if (s.signature?.typedText) out.push({ type: "paragraph", content: [{ type: "text", text: s.signature.typedText, marks: [{ type: "bold" }, { type: "italic" }] }] });
  out.push(para(`${s.signedName ?? s.name}${s.designation ? `, ${s.designation}` : ""}`));
  out.push(para(`Signed electronically on ${when(s.signedAt)}`));
  return out;
}

/** Replaces each signature block with the matching signer's signature; returns what is left unplaced. */
function placeSignatures(body: Raw[], pool: Placed[]): Raw[] {
  const out: Raw[] = [];
  for (const b of body) {
    const t = b.type;
    if (t === "signatureBlock") {
      const idx = pool.findIndex((p) => p.signer.role === b.partyRole);
      if (idx >= 0) { const [p] = pool.splice(idx, 1); out.push(...signatureBlocks(p, typeof b.label === "string" ? b.label : null)); }
      else out.push(b);
    } else if ((t === "section" || t === "conditional" || t === "repeat") && Array.isArray(b.children)) out.push({ ...b, children: placeSignatures(b.children as Raw[], pool) });
    else out.push(b);
  }
  return out;
}

export interface SealInputs { clone: CloneDoc; signers: SignerDoc[]; verifyUrl: string; chain: { ok: boolean; count: number }; events: { at: Date; type: string; signer: string }[]; requestId: string; companyName: string }

/** The signed content (signatures placed in the signature blocks) and the appendix (signature page and certificate of completion). */
export function buildSealedDoc(i: SealInputs, fileIds: Map<string, string>): { content: PBDoc; appendix: PBDoc["body"] } | null {
  const pool: Placed[] = i.signers.filter((s) => s.status === "signed").sort((a, b) => a.order - b.order).map((s) => ({ signer: s, fileId: fileIds.get(s._id) ?? null }));
  const content = placeSignatures(structuredClone(i.clone.pbdoc.body) as unknown as Raw[], pool);
  const appendix: Raw[] = [];
  if (pool.length) {
    appendix.push({ type: "pageBreak" }, heading("Signatures"));
    for (const p of pool) appendix.push(...signatureBlocks(p, p.signer.role.replace(/_/g, " ")), { type: "divider" });
  }
  const signedRows = i.signers.map((s) => [s.signedName ?? s.name, `${s.email}`, s.role.replace(/_/g, " "), s.status === "signed" ? when(s.signedAt) : s.status, s.signature ? (s.signature.kind === "typed" ? "Typed" : s.signature.kind === "drawn" ? "Drawn" : "Uploaded image") : "-", when(s.otpVerifiedAt ?? null), s.ip ?? "-"]);
  const keyEvents = i.events.slice(0, 40).map((e) => [when(e.at), e.type.replace(/_/g, " "), e.signer]);
  appendix.push(
    { type: "pageBreak" },
    heading("Certificate of completion"),
    table([32, 68], null, [
      ["Document", i.clone.title],
      ["Issued by", i.companyName],
      ["Signature request", i.requestId],
      ["Document fingerprint (SHA-256 of the signed content)", i.clone.contentSha256],
      ["Event record check", i.chain.ok ? `Intact (${i.chain.count} events, each linked to the one before)` : "The event record could not be verified"],
      ["Verify this document", i.verifyUrl],
    ]),
    heading("Signers", 3),
    table([16, 20, 12, 18, 10, 14, 10], ["Name", "Email", "Role", "Signed", "Signature", "Identity confirmed (one-time code)", "IP address"], signedRows),
    heading("Record of events", 3),
    table([34, 34, 32], ["Time", "Event", "Who"], keyEvents.length ? keyEvents : [["-", "-", "-"]]),
    para("What this signature is", true),
    para(MANDATORY_NOTICE),
  );
  const mk = (body: Raw[], prefix: string) => parseDoc({ schemaVersion: 1, lang: "en", page: i.clone.pbdoc.page ?? DEFAULT_PAGE, header: i.clone.pbdoc.header, footer: i.clone.pbdoc.footer, body }, { assignIds: true, idFactory: sequentialIds(prefix) });
  const c = mk(content, "y");
  const a2 = mk(appendix, "z");
  return c.ok && a2.ok ? { content: c.doc, appendix: a2.doc.body } : null;
}

const newVerifyCode = (): string => randomBytes(12).toString("base64url").replace(/[-_]/g, "x").slice(0, 16);

async function emailSigned(sealed: SealedDoc, clone: CloneDoc, bytes: Buffer, recipients: { name: string; email: string }[], company: string, verifyUrl: string): Promise<{ ok: string[]; failed: string[] }> {
  const ok: string[] = [];
  const failed: string[] = [];
  const subject = `Signed: ${clone.title}`;
  for (const r of recipients) {
    const body = `Hello ${r.name},\n\n"${clone.title}" has been signed by everyone, and the signed copy is attached.\n\nYou can check that it is genuine at ${verifyUrl}.\n\n${company}\n`;
    const html = `<p>Hello ${escapeHtml(r.name)},</p><p><strong>${escapeHtml(clone.title)}</strong> has been signed by everyone, and the signed copy is attached.</p><p>You can check that it is genuine at <a href="${escapeHtml(verifyUrl)}">${escapeHtml(verifyUrl)}</a>.</p><p>${escapeHtml(company)}</p>`;
    try {
      const res = await sendEmail({ to: r.email, subject, text: body, html, files: [{ filename: `${clone.title.replace(/[^A-Za-z0-9._-]+/g, "_").slice(0, 60) || "signed"}-signed.pdf`, content: bytes, contentType: "application/pdf" }] });
      (res.ok ? ok : failed).push(r.email);
    } catch {
      failed.push(r.email);
    }
  }
  void sealed;
  return { ok, failed };
}

/** Seals a fully signed clone. Safe to call again: returns the existing sealed copy. Must run inside the clone's company. */
export async function ensureSealed(cloneId: string): Promise<{ ok: true; sealed: SealedDoc } | { ok: false; message: string }> {
  const existing = await (await cfSealed()).findOne({ cloneId });
  if (existing) return { ok: true, sealed: existing };
  const clone = await (await cfClones()).findOne({ _id: cloneId });
  if (!clone) return { ok: false, message: "That document was not found." };
  if (clone.status !== "signed" || !clone.requestId) return { ok: false, message: "Only a fully signed document can be sealed." };
  const request = await (await cfRequests()).findOne({ _id: clone.requestId });
  if (!request || request.status !== "completed") return { ok: false, message: "The signature request is not complete." };
  const signers = await (await cfSigners()).find({ requestId: request._id }).sort({ order: 1 }).toArray();
  if (signers.length === 0 || signers.some((s) => s.status !== "signed")) return { ok: false, message: "Not every signer has signed." };

  const companyId = await currentCompanyId();
  const company = await getCompany(companyId).catch(() => null);
  const companyName = company?.name ?? "The company";
  const verifyCode = newVerifyCode();
  const base = (await appUrlForCompany(companyId)).replace(/\/+$/, "");
  const verifyUrl = `${base}/verify/${verifyCode}`;

  // Signature images, by a file id the document model accepts.
  const images: Record<string, Uint8Array> = {};
  const fileIds = new Map<string, string>();
  for (const s of signers) {
    const key = s.signature?.storageKey;
    if (!key) continue;
    const bytes = await getSignatureImage(key).catch(() => null);
    if (!bytes) continue;
    const fileId = `sig${createHash("sha256").update(s._id).digest("hex").slice(0, 24)}`;
    images[fileId] = new Uint8Array(bytes);
    fileIds.set(s._id, fileId);
  }
  const events = await listEvents(request._id);
  const nameOf = new Map(signers.map((s) => [s._id, s.signedName ?? s.name]));
  const keyTypes = new Set(["request_created", "link_viewed", "document_viewed", "otp_verified", "signer_signed", "signer_declined", "request_voided", "request_expired"]);
  const chain = await verifyChain(request._id);
  const doc = buildSealedDoc({
    clone, signers, verifyUrl, chain: { ok: chain.ok, count: chain.count }, requestId: request._id, companyName,
    events: events.filter((e) => keyTypes.has(e.type)).map((e) => ({ at: e.at, type: e.type, signer: e.signerId ? nameOf.get(e.signerId) ?? "Signer" : e.actorType === "user" ? "Sender" : "System" })),
  }, fileIds);
  if (!doc) return { ok: false, message: "The signed document could not be assembled." };

  let rendered: Awaited<ReturnType<typeof renderCloneDoc>>;
  try {
    rendered = await renderCloneDoc(clone, "pdf", { doc: doc.content, appendix: doc.appendix, strict: true, images });
  } catch (e) {
    return { ok: false, message: e instanceof Error && e.message ? `The signed PDF could not be made: ${e.message}` : "The signed PDF could not be made." };
  }
  const bytes = rendered.buffer;
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const filename = `${randomUUID()}.pdf`;
  const stored = await putObject(`contractflow-sealed/${companyId}`, filename, bytes, "application/pdf");

  const sealed: SealedDoc = {
    _id: randomUUID(), cloneId: clone._id, requestId: request._id, verifyCode, storageKey: stored.storageKey, sha256, bytes: bytes.byteLength, pages: rendered.pages, sealedAt: new Date(),
    title: clone.title, companyName, contentSha256: clone.contentSha256,
    signers: signers.map((s) => ({ name: s.signedName ?? s.name, email: s.email, role: s.role, designation: s.designation ?? null, signedAt: s.signedAt })),
    emailedTo: [], emailFailed: [],
  };
  try {
    await (await cfSealed()).insertOne(sealed);
  } catch (e) {
    if ((e as { code?: number }).code === 11000) {
      // Another request sealed it at the same moment: theirs is the one on record.
      const theirs = await (await cfSealed()).findOne({ cloneId });
      if (theirs) return { ok: true, sealed: theirs };
    }
    throw e;
  }
  await (await cfSealIndex()).updateOne({ _id: verifyCode }, { $set: { companyId, sealedId: sealed._id } }, { upsert: true });

  // Deliver: every signer and the company contact (the person who sent it).
  const recipients = signers.map((s) => ({ name: s.signedName ?? s.name, email: s.email }));
  const sender = await senderContact(clone.createdBy);
  if (sender && !recipients.some((r) => r.email.toLowerCase() === sender.email.toLowerCase())) recipients.push(sender);
  const mail = await emailSigned(sealed, clone, bytes, recipients, companyName, verifyUrl);
  await (await cfSealed()).updateOne({ _id: sealed._id }, { $set: { emailedTo: mail.ok, emailFailed: mail.failed } });
  return { ok: true, sealed: { ...sealed, emailedTo: mail.ok, emailFailed: mail.failed } };
}

async function senderContact(userId: string): Promise<{ name: string; email: string } | null> {
  try {
    if (!ObjectId.isValid(userId)) return null;
    const u = await (await getDb()).collection<{ _id: ObjectId; email?: string; name?: string }>("admin_users").findOne({ _id: new ObjectId(userId) }, { projection: { email: 1, name: 1 } });
    return u?.email ? { name: u.name || u.email, email: u.email } : null;
  } catch {
    return null;
  }
}

/** The sealed PDF's bytes, checked against the recorded hash (a tampered or missing copy is refused). */
export async function readSealedPdf(sealed: Pick<SealedDoc, "storageKey" | "sha256">): Promise<Buffer | null> {
  const bytes = await readPrivate(sealed.storageKey);
  if (!bytes || createHash("sha256").update(bytes).digest("hex") !== sealed.sha256) return null;
  return bytes;
}
