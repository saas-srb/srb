import "server-only";
import { randomUUID } from "node:crypto";
import { putObject, getObject, deleteObject } from "@/lib/storage/blob";

/**
 * Employee document storage. Sensitive (Aadhaar, PAN, bank proofs) — must
 * only be served through the authenticated download route. Mirrors
 * `src/lib/resume-storage.ts`.
 */

const FOLDER = "hrms-documents";

export interface StoredDocument {
  storageKey: string;
  filename: string;
  contentType: string;
  size: number;
}

function extensionFor(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase();
  return ext && /^[a-z0-9]+$/.test(ext) ? ext : "bin";
}

export async function saveDocumentFile(file: File): Promise<StoredDocument> {
  const key = `${randomUUID()}.${extensionFor(file.name)}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  const contentType = file.type || "application/octet-stream";
  const { storageKey } = await putObject(FOLDER, key, buffer, contentType);
  return { storageKey, filename: file.name, contentType, size: file.size };
}

export async function readDocumentStream(storageKey: string) {
  return getObject(storageKey);
}

export async function deleteDocumentFile(storageKey: string) {
  await deleteObject(storageKey);
}
