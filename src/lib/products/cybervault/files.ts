import "server-only";
import { randomUUID } from "node:crypto";
import { putObject, getObject } from "@/lib/storage/blob";
import { LIMITS } from "@/lib/products/cybervault/constants";

/**
 * DLMS file storage. Files live in the shared PRIVATE Vercel Blob store (see
 * `lib/storage/blob.ts`) and are ONLY served through `/api/cybervault/files/[id]`,
 * which re-checks login, scope and the download permission on every request —
 * a leaked URL is useless (there is no public URL at all). Uploads are checked
 * by extension, by a server-side extension→MIME map (the client's claimed type
 * is ignored) and by magic bytes, so a renamed executable or an HTML/SVG file
 * cannot be stored.
 */

const FOLDER = "dlms-files";

export type FileKind = "image" | "pdf" | "document" | "archive";

interface TypeRule {
  kind: FileKind;
  mime: string;
  sniff: (b: Uint8Array) => boolean;
}

const startsWith = (b: Uint8Array, sig: number[], at = 0) => sig.every((x, i) => b[at + i] === x);
const looksLikeText = (b: Uint8Array) => !b.subarray(0, 4096).includes(0);
const isZip = (b: Uint8Array) => startsWith(b, [0x50, 0x4b, 0x03, 0x04]);
const isOle = (b: Uint8Array) => startsWith(b, [0xd0, 0xcf, 0x11, 0xe0]);

const OOXML = "application/vnd.openxmlformats-officedocument";
const RULES: Record<string, TypeRule> = {
  png: { kind: "image", mime: "image/png", sniff: (b) => startsWith(b, [0x89, 0x50, 0x4e, 0x47]) },
  jpg: { kind: "image", mime: "image/jpeg", sniff: (b) => startsWith(b, [0xff, 0xd8, 0xff]) },
  jpeg: { kind: "image", mime: "image/jpeg", sniff: (b) => startsWith(b, [0xff, 0xd8, 0xff]) },
  gif: { kind: "image", mime: "image/gif", sniff: (b) => startsWith(b, [0x47, 0x49, 0x46, 0x38]) },
  webp: { kind: "image", mime: "image/webp", sniff: (b) => startsWith(b, [0x52, 0x49, 0x46, 0x46]) && startsWith(b, [0x57, 0x45, 0x42, 0x50], 8) },
  pdf: { kind: "pdf", mime: "application/pdf", sniff: (b) => startsWith(b, [0x25, 0x50, 0x44, 0x46]) },
  doc: { kind: "document", mime: "application/msword", sniff: isOle },
  xls: { kind: "document", mime: "application/vnd.ms-excel", sniff: isOle },
  ppt: { kind: "document", mime: "application/vnd.ms-powerpoint", sniff: isOle },
  docx: { kind: "document", mime: `${OOXML}.wordprocessingml.document`, sniff: isZip },
  xlsx: { kind: "document", mime: `${OOXML}.spreadsheetml.sheet`, sniff: isZip },
  pptx: { kind: "document", mime: `${OOXML}.presentationml.presentation`, sniff: isZip },
  csv: { kind: "document", mime: "text/csv", sniff: looksLikeText },
  txt: { kind: "document", mime: "text/plain", sniff: looksLikeText },
  zip: { kind: "archive", mime: "application/zip", sniff: isZip },
};

export const ALLOWED_EXTENSIONS = Object.keys(RULES);

function extensionFor(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  return /^[a-z0-9]{1,5}$/.test(ext) ? ext : "";
}

export function safeFilename(name: string): string {
  const cleaned = name.replace(/[\u0000-\u001F\u007F"\\/]/g, "_").trim().slice(0, 150);
  return cleaned || "file";
}

export interface StoredFile {
  storageKey: string;
  filename: string;
  contentType: string;
  size: number;
  kind: FileKind;
}

export async function saveDlmsFile(file: File): Promise<{ ok: true; stored: StoredFile } | { ok: false; error: string }> {
  if (file.size === 0) return { ok: false, error: "That file is empty." };
  if (file.size > LIMITS.fileBytes) return { ok: false, error: `File exceeds the ${Math.round(LIMITS.fileBytes / 1024 / 1024)} MB limit.` };
  const ext = extensionFor(file.name);
  const rule = RULES[ext];
  if (!rule) return { ok: false, error: `.${ext || "?"} files are not allowed. Allowed: ${ALLOWED_EXTENSIONS.join(", ")}.` };
  const buffer = Buffer.from(await file.arrayBuffer());
  if (!rule.sniff(buffer)) return { ok: false, error: "The file's contents do not match its extension." };
  const { storageKey } = await putObject(FOLDER, `${randomUUID()}.${ext}`, buffer, rule.mime);
  return { ok: true, stored: { storageKey, filename: safeFilename(file.name), contentType: rule.mime, size: buffer.byteLength, kind: rule.kind } };
}

export async function readDlmsFile(storageKey: string) {
  return getObject(storageKey);
}
