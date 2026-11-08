import "server-only";
import { randomUUID } from "node:crypto";
import { putObject, getObject, deleteObject } from "@/lib/storage/blob";

/** Task attachment storage — served only via the authed route. */

const FOLDER = "pms-attachments";

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
