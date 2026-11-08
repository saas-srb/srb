import "server-only";
import { randomUUID } from "node:crypto";
import { putObject, getObject, deleteObject } from "@/lib/storage/blob";

const FOLDER = "resumes";

export interface StoredResume {
  storageKey: string;
  filename: string;
  contentType: string;
  size: number;
}

function extensionFor(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase();
  return ext && /^[a-z0-9]+$/.test(ext) ? ext : "bin";
}

export async function saveResumeFile(file: File): Promise<StoredResume> {
  const key = `${randomUUID()}.${extensionFor(file.name)}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  const contentType = file.type || "application/octet-stream";
  const { storageKey } = await putObject(FOLDER, key, buffer, contentType);
  return { storageKey, filename: file.name, contentType, size: file.size };
}

export async function readResumeFile(storageKey: string) {
  return getObject(storageKey);
}

export async function deleteResumeFile(storageKey: string) {
  await deleteObject(storageKey);
}
