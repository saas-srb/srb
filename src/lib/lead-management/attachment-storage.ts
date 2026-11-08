import "server-only";
import { randomUUID } from "node:crypto";
import { putObject, getObject } from "@/lib/storage/blob";

/**
 * Lead-message attachments — served only through the authenticated route
 * `/api/lead-messages/files/[key]` (which re-derives access from the
 * message the file is attached to). Mirrors `src/lib/huddle-ai/attachments.ts`,
 * minus its `chat_shared_files` ledger — there's no Files hub for Lead
 * Management, so that bookkeeping isn't needed here.
 */

const FOLDER = "lead-message-files";

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024; // 25 MB

const ALLOWED_EXT = new Set([
  "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt", "csv", "md",
  "png", "jpg", "jpeg", "gif", "webp", "svg",
  "mp4", "webm", "mov", "m4a", "mp3", "ogg", "wav",
  "zip",
]);

export type AttachmentKind = "image" | "voice" | "video" | "file";

export interface Attachment {
  storageKey: string;
  filename: string;
  contentType: string;
  size: number;
  kind: AttachmentKind;
}

function extOf(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase();
  return ext && /^[a-z0-9]+$/.test(ext) ? ext : "bin";
}

export function kindFor(contentType: string, filename: string): AttachmentKind {
  const ext = extOf(filename);
  if (contentType.startsWith("image/") || ["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(ext)) return "image";
  if (contentType.startsWith("video/") || ["mp4", "webm", "mov"].includes(ext)) return "video";
  if (contentType.startsWith("audio/") || ["m4a", "mp3", "ogg", "wav"].includes(ext)) return "voice";
  return "file";
}

export async function saveLeadAttachment(file: File): Promise<Attachment> {
  if (file.size > MAX_UPLOAD_BYTES) throw new Error("File is larger than 25 MB.");
  const ext = extOf(file.name);
  if (!ALLOWED_EXT.has(ext)) throw new Error(`Files of type .${ext} aren't allowed.`);

  const key = `${randomUUID()}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  const contentType = file.type || "application/octet-stream";
  const { storageKey } = await putObject(FOLDER, key, buffer, contentType);

  return { storageKey, filename: file.name, contentType, size: file.size, kind: kindFor(contentType, file.name) };
}

export async function readLeadAttachmentStream(storageKey: string) {
  return getObject(storageKey);
}
