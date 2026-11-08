import "server-only";
import { getObject, putObject } from "@/lib/storage/blob";
import { getPlatformOwnerCompanyId } from "@/lib/platform/tenancy/companies";
import { runAsCompany } from "@/lib/platform/tenancy/context";
import { messagesCol, requestsCol } from "@/lib/support/db";
import type { CompanyCaller } from "@/lib/support/requests";
import type { Attachment } from "@/lib/support/types";

/**
 * Screenshots and files on requests. Stored in the platform's private blob store under the platform owner's account (the
 * service is SelfRun AI's, so the files never count against a customer's storage plan) and served only through
 * `/api/resolveiq/attachments`, which checks the viewer may see the request the file belongs to.
 */

export const MAX_ATTACHMENTS = 5;
export const MAX_ATTACHMENT_BYTES = 4 * 1024 * 1024; // stays inside the platform's request-body limit

/** Content types we accept, and the extension we store them under (never trust the uploaded file name's extension). */
export const ATTACHMENT_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "application/pdf": "pdf",
  "text/plain": "txt",
};
export const ATTACHMENT_ACCEPT = Object.keys(ATTACHMENT_TYPES).join(",");

const safeName = (n: string) => n.replace(/[^\w.\- ()]/g, "_").slice(0, 120) || "file";

export async function saveAttachment(caller: CompanyCaller, file: File): Promise<{ ok: true; attachment: Attachment } | { ok: false; error: string }> {
  const ext = ATTACHMENT_TYPES[file.type];
  if (!ext) return { ok: false, error: "Attach an image (PNG, JPG, WebP, GIF), a PDF or a text file." };
  if (file.size === 0) return { ok: false, error: "That file is empty." };
  if (file.size > MAX_ATTACHMENT_BYTES) return { ok: false, error: "Each file can be up to 4 MB." };
  const body = Buffer.from(await file.arrayBuffer());
  const filename = `${caller.companyId}/${caller.user.id}/${crypto.randomUUID()}.${ext}`;
  const ownerId = await getPlatformOwnerCompanyId();
  const put = ownerId ? await runAsCompany(ownerId, () => putObject("support", filename, body, file.type)) : await putObject("support", filename, body, file.type);
  return { ok: true, attachment: { key: put.storageKey, name: safeName(file.name), size: put.size, type: file.type } };
}

/** Only files this very user uploaded for their own company may be attached to a request or reply. */
export function validateAttachments(caller: CompanyCaller, list: unknown): Attachment[] {
  const prefix = `support/${caller.companyId}/${caller.user.id}/`;
  const out: Attachment[] = [];
  for (const raw of Array.isArray(list) ? list : []) {
    const a = raw as Partial<Attachment>;
    if (typeof a.key !== "string" || !a.key.startsWith(prefix) || a.key.includes("..") || out.some((x) => x.key === a.key)) continue;
    out.push({ key: a.key, name: safeName(String(a.name ?? "file")), size: Math.max(0, Number(a.size) || 0), type: ATTACHMENT_TYPES[String(a.type)] ? String(a.type) : "application/octet-stream" });
  }
  return out.slice(0, MAX_ATTACHMENTS);
}

/** The company a stored attachment belongs to (found through the request or message that references it), or null. */
export async function attachmentOwnerCompany(key: string): Promise<{ companyId: string; name: string; type: string } | null> {
  const fromRequest = await (await requestsCol()).findOne({ "attachments.key": key }, { projection: { companyId: 1, attachments: 1 } });
  const fromMessage = fromRequest ? null : await (await messagesCol()).findOne({ "attachments.key": key }, { projection: { companyId: 1, attachments: 1 } });
  const doc = fromRequest ?? fromMessage;
  const meta = doc?.attachments?.find((a) => a.key === key);
  return doc && meta ? { companyId: doc.companyId, name: meta.name, type: meta.type } : null;
}

export { getObject };
