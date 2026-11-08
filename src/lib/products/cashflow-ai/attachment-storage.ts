import "server-only";
import { randomUUID } from "node:crypto";
import { putObject, getObject, deleteObject } from "@/lib/storage/blob";

/**
 * FMS attachment storage (transaction receipts / supporting documents).
 * Served only through the authed API route `/api/cashflow-ai/attachments/[key]`.
 * Mirrors `src/lib/spendiq/attachment-storage.ts`.
 */

const FOLDER = "fms-attachments";

const MAX_BYTES = 15 * 1024 * 1024; // 15 MB
const ALLOWED_EXT = new Set(["pdf", "png", "jpg", "jpeg", "webp", "doc", "docx", "xls", "xlsx", "csv", "txt"]);

export interface StoredAttachment {
  storageKey: string;
  filename: string;
  contentType: string;
  size: number;
}

function extensionFor(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase();
  return ext && /^[a-z0-9]+$/.test(ext) ? ext : "bin";
}

export function isAllowedAttachment(file: File): { ok: true } | { ok: false; error: string } {
  if (file.size > MAX_BYTES) return { ok: false, error: "File exceeds the 15 MB limit." };
  if (!ALLOWED_EXT.has(extensionFor(file.name))) return { ok: false, error: "Unsupported file type." };
  return { ok: true };
}

export async function saveAttachmentFile(file: File): Promise<StoredAttachment> {
  const key = `${randomUUID()}.${extensionFor(file.name)}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  const contentType = file.type || "application/octet-stream";
  const { storageKey } = await putObject(FOLDER, key, buffer, contentType);
  return { storageKey, filename: file.name, contentType, size: file.size };
}

export async function readAttachmentStream(storageKey: string) {
  return getObject(storageKey);
}

export async function deleteAttachmentFile(storageKey: string) {
  await deleteObject(storageKey);
}
