import "server-only";
import { randomUUID } from "node:crypto";
import { getDb } from "@/lib/mongodb";
import { putObject, getObject } from "@/lib/storage/blob";
import { COLLECTIONS, newId } from "@/lib/products/playbook-ai/db";
import { LIMITS } from "@/lib/products/playbook-ai/constants";
import type { SopFileDoc } from "@/lib/products/playbook-ai/types";

/**
 * SOP file storage. Files live in the shared private Vercel Blob store (see
 * `src/lib/storage/blob.ts`) and are ONLY served through `/api/playbook-ai/files/[id]`,
 * which re-checks SOP read access on every request. Uploads are validated by
 * extension, by a server-side extension→MIME map (the client's claimed type is
 * ignored), and by magic bytes, so a renamed executable or an SVG/HTML file
 * cannot be stored as an "image".
 */

const FOLDER = "sop-files";

interface TypeRule {
  kind: SopFileDoc["kind"];
  mime: string;
  /** Returns true when the leading bytes plausibly match the type. */
  sniff: (b: Uint8Array) => boolean;
}

const startsWith = (b: Uint8Array, sig: number[], at = 0) => sig.every((x, i) => b[at + i] === x);
const looksLikeText = (b: Uint8Array) => !b.subarray(0, 4096).includes(0);
const isZip = (b: Uint8Array) => startsWith(b, [0x50, 0x4b, 0x03, 0x04]);
const isOle = (b: Uint8Array) => startsWith(b, [0xd0, 0xcf, 0x11, 0xe0]);

const RULES: Record<string, TypeRule> = {
  png: { kind: "image", mime: "image/png", sniff: (b) => startsWith(b, [0x89, 0x50, 0x4e, 0x47]) },
  jpg: { kind: "image", mime: "image/jpeg", sniff: (b) => startsWith(b, [0xff, 0xd8, 0xff]) },
  jpeg: { kind: "image", mime: "image/jpeg", sniff: (b) => startsWith(b, [0xff, 0xd8, 0xff]) },
  gif: { kind: "image", mime: "image/gif", sniff: (b) => startsWith(b, [0x47, 0x49, 0x46, 0x38]) },
  webp: { kind: "image", mime: "image/webp", sniff: (b) => startsWith(b, [0x52, 0x49, 0x46, 0x46]) && startsWith(b, [0x57, 0x45, 0x42, 0x50], 8) },
  mp4: { kind: "video", mime: "video/mp4", sniff: (b) => startsWith(b, [0x66, 0x74, 0x79, 0x70], 4) },
  webm: { kind: "video", mime: "video/webm", sniff: (b) => startsWith(b, [0x1a, 0x45, 0xdf, 0xa3]) },
  pdf: { kind: "document", mime: "application/pdf", sniff: (b) => startsWith(b, [0x25, 0x50, 0x44, 0x46]) },
  doc: { kind: "document", mime: "application/msword", sniff: isOle },
  xls: { kind: "document", mime: "application/vnd.ms-excel", sniff: isOle },
  ppt: { kind: "document", mime: "application/vnd.ms-powerpoint", sniff: isOle },
  docx: { kind: "document", mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", sniff: isZip },
  xlsx: { kind: "document", mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", sniff: isZip },
  pptx: { kind: "document", mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation", sniff: isZip },
  csv: { kind: "document", mime: "text/csv", sniff: looksLikeText },
  txt: { kind: "document", mime: "text/plain", sniff: looksLikeText },
};

export const ACCEPT_ATTR = Object.keys(RULES).map((e) => `.${e}`).join(",");

function extensionFor(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  return /^[a-z0-9]{1,5}$/.test(ext) ? ext : "";
}

export function safeFilename(name: string): string {
  // eslint-disable-next-line no-control-regex
  const cleaned = name.replace(/[\u0000-\u001F\u007F"\\/]/g, "_").trim().slice(0, 150);
  return cleaned || "file";
}

export async function saveSopFile(
  sopId: string,
  file: File,
  actorId: string
): Promise<{ ok: true; doc: SopFileDoc } | { ok: false; error: string }> {
  if (file.size === 0) return { ok: false, error: "That file is empty." };
  if (file.size > LIMITS.fileBytes) return { ok: false, error: `File exceeds the ${Math.round(LIMITS.fileBytes / 1024 / 1024)} MB limit.` };
  const ext = extensionFor(file.name);
  const rule = RULES[ext];
  if (!rule) return { ok: false, error: `.${ext || "?"} files are not allowed. Allowed: ${Object.keys(RULES).join(", ")}.` };

  const buffer = Buffer.from(await file.arrayBuffer());
  if (!rule.sniff(buffer)) return { ok: false, error: "The file's contents do not match its extension." };

  const key = `${randomUUID()}.${ext}`;
  const { storageKey } = await putObject(FOLDER, key, buffer, rule.mime);
  const doc: SopFileDoc = {
    _id: newId(),
    sopId,
    storageKey,
    filename: safeFilename(file.name),
    contentType: rule.mime,
    size: buffer.byteLength,
    kind: rule.kind,
    uploadedBy: actorId,
    createdAt: new Date(),
  };
  const db = await getDb();
  await db.collection<SopFileDoc>(COLLECTIONS.files).insertOne(doc);
  return { ok: true, doc };
}

export async function getSopFile(id: string): Promise<SopFileDoc | null> {
  const db = await getDb();
  return db.collection<SopFileDoc>(COLLECTIONS.files).findOne({ _id: id });
}

export async function listSopFiles(sopId: string): Promise<SopFileDoc[]> {
  const db = await getDb();
  const col = db.collection<SopFileDoc>(COLLECTIONS.files);
  await col.createIndex({ sopId: 1 }).catch(() => {});
  return col.find({ sopId }).sort({ createdAt: -1 }).toArray();
}

export async function readSopFile(doc: SopFileDoc) {
  return getObject(doc.storageKey);
}
