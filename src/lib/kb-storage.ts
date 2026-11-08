import "server-only";
import { randomUUID } from "node:crypto";
import { putObject, getObject, deleteObject } from "@/lib/storage/blob";

const FOLDER = "knowledge-base";

export interface StoredKbFile {
  storageKey: string;
  filename: string;
  contentType: string;
  size: number;
}

function extensionFor(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase();
  return ext && /^[a-z0-9]+$/.test(ext) ? ext : "bin";
}

export async function saveKbFile(file: File): Promise<StoredKbFile> {
  const key = `${randomUUID()}.${extensionFor(file.name)}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  const contentType = file.type || "application/octet-stream";
  const { storageKey } = await putObject(FOLDER, key, buffer, contentType);
  return { storageKey, filename: file.name, contentType, size: file.size };
}

export async function readKbFileStream(storageKey: string) {
  return getObject(storageKey);
}

export async function readKbFileBuffer(storageKey: string): Promise<Buffer> {
  const result = await getObject(storageKey);
  if (!result) throw new Error(`Knowledge-base file not found: ${storageKey}`);
  return Buffer.from(await new Response(result.stream).arrayBuffer());
}

export async function deleteKbFile(storageKey: string): Promise<void> {
  await deleteObject(storageKey);
}
