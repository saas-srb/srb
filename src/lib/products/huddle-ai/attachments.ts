import "server-only";
import { randomUUID } from "node:crypto";
import { getDb } from "@/lib/mongodb";
import { newId } from "@/lib/products/huddle-ai/db";
import { putObject, getObject, deleteObject } from "@/lib/storage/blob";
import type { MessageScope } from "@/lib/products/huddle-ai/messages";

/**
 * Message attachments are served only through the authenticated route
 * `/api/huddle-ai/files/[key]` (which re-checks that the caller can see the
 * message the file is attached to). Mirrors `src/lib/sprintos/document-storage.ts`.
 *
 * Every upload also drops a row in `chat_shared_files` (the spec's
 * `shared_files`) so the future Files hub + the dashboard KPI have a ledger.
 */

const FOLDER = "messenger-files";
export const SHARED_FILES_COLLECTION = "chat_shared_files";

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
  /** Voice notes / video: length in ms when known. */
  durationMs?: number;
}

export interface SharedFile {
  _id: string;
  name: string;
  contentType: string;
  size: number;
  storageKey: string;
  kind: AttachmentKind;
  scopeType: "channel" | "dm";
  scopeId: string;
  messageId: string;
  uploadedBy: string;
  category: string;
  createdAt: Date;
  deletedAt: Date | null;
}

let sharedIdx = false;

async function sharedFiles() {
  const db = await getDb();
  const c = db.collection<SharedFile>(SHARED_FILES_COLLECTION);
  if (!sharedIdx) {
    sharedIdx = true;
    await Promise.all([
      c.createIndex({ scopeType: 1, scopeId: 1, createdAt: -1 }).catch(() => {}),
      c.createIndex({ uploadedBy: 1 }).catch(() => {}),
      c.createIndex({ kind: 1 }).catch(() => {}),
      c.createIndex({ storageKey: 1 }, { unique: true }).catch(() => {}),
    ]);
  }
  return c;
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

export function categoryFor(kind: AttachmentKind, filename: string): string {
  if (kind === "image") return "Images";
  if (kind === "video") return "Videos";
  if (kind === "voice") return "Voice notes";
  const ext = extOf(filename);
  if (["pdf"].includes(ext)) return "PDF";
  if (["doc", "docx", "txt", "md"].includes(ext)) return "Documents";
  if (["xls", "xlsx", "csv"].includes(ext)) return "Spreadsheets";
  if (["ppt", "pptx"].includes(ext)) return "Presentations";
  if (["zip"].includes(ext)) return "Archives";
  return "Other";
}

export async function saveAttachment(file: File): Promise<Attachment> {
  if (file.size > MAX_UPLOAD_BYTES) throw new Error("File is larger than 25 MB.");
  const ext = extOf(file.name);
  if (!ALLOWED_EXT.has(ext)) throw new Error(`Files of type .${ext} aren't allowed.`);

  const key = `${randomUUID()}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  const contentType = file.type || "application/octet-stream";
  const { storageKey } = await putObject(FOLDER, key, buffer, contentType);

  return {
    storageKey,
    filename: file.name,
    contentType,
    size: file.size,
    kind: kindFor(contentType, file.name),
  };
}

export async function readAttachmentStream(storageKey: string) {
  return getObject(storageKey);
}

export async function attachmentExists(storageKey: string): Promise<boolean> {
  return (await getObject(storageKey)) !== null;
}

export async function deleteAttachmentFile(storageKey: string): Promise<void> {
  await deleteObject(storageKey);
}

export async function recordSharedFile(args: {
  attachment: Attachment;
  scope: MessageScope;
  messageId: string;
  uploadedBy: string;
}): Promise<void> {
  try {
    const c = await sharedFiles();
    await c.insertOne({
      _id: newId(),
      name: args.attachment.filename,
      contentType: args.attachment.contentType,
      size: args.attachment.size,
      storageKey: args.attachment.storageKey,
      kind: args.attachment.kind,
      scopeType: args.scope.type,
      scopeId: args.scope.id,
      messageId: args.messageId,
      uploadedBy: args.uploadedBy,
      category: categoryFor(args.attachment.kind, args.attachment.filename),
      createdAt: new Date(),
      deletedAt: null,
    });
  } catch {
    // ledger write is best-effort
  }
}

export async function getSharedFileByKey(storageKey: string): Promise<SharedFile | null> {
  return (await sharedFiles()).findOne({ storageKey });
}

export async function countSharedFiles(from?: Date, to?: Date): Promise<number> {
  const c = await sharedFiles();
  const filter: Record<string, unknown> = { deletedAt: null };
  if (from || to) filter.createdAt = { ...(from ? { $gte: from } : {}), ...(to ? { $lte: to } : {}) };
  return c.countDocuments(filter);
}

export async function fileSharingBreakdown(from: Date, to: Date): Promise<{ label: string; value: number }[]> {
  const c = await sharedFiles();
  const rows = await c
    .aggregate<{ _id: string; count: number }>([
      { $match: { createdAt: { $gte: from, $lte: to }, deletedAt: null } },
      { $group: { _id: "$category", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ])
    .toArray();
  return rows.map((r) => ({ label: r._id, value: r.count }));
}

export interface SerializedSharedFile {
  _id: string;
  name: string;
  contentType: string;
  size: number;
  storageKey: string;
  kind: AttachmentKind;
  category: string;
  messageId: string;
  uploadedBy: string;
  createdAt: string;
}

function serializeSharedFile(r: SharedFile): SerializedSharedFile {
  return {
    _id: r._id,
    name: r.name,
    contentType: r.contentType,
    size: r.size,
    storageKey: r.storageKey,
    kind: r.kind,
    category: r.category,
    messageId: r.messageId,
    uploadedBy: r.uploadedBy,
    createdAt: r.createdAt.toISOString(),
  };
}

export async function listSharedFilesForScope(scope: MessageScope, limit = 24): Promise<SerializedSharedFile[]> {
  const c = await sharedFiles();
  const rows = await c
    .find({ scopeType: scope.type, scopeId: scope.id, deletedAt: null })
    .sort({ createdAt: -1 })
    .limit(limit)
    .toArray();
  return rows.map(serializeSharedFile);
}

export interface FilesHubEntry extends SerializedSharedFile {
  scopeType: "channel" | "dm";
  scopeId: string;
  scopeLabel: string;
  uploaderName: string;
}

export interface FilesHubResult {
  files: FilesHubEntry[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  categories: string[];
}

/**
 * The Shared Files hub. Every file the caller can already see — the union of
 * their channel scopes and DM conversations — filterable by category, type and
 * origin, with a free-text name search.
 */
export async function listAccessibleFiles(
  scopes: { channelIds: string[]; conversationIds: string[] },
  opts: { q?: string; category?: string; kind?: AttachmentKind; scopeId?: string; page?: number; pageSize?: number } = {}
): Promise<FilesHubResult> {
  const c = await sharedFiles();
  const db = await getDb();
  const page = Math.max(opts.page ?? 1, 1);
  const pageSize = Math.min(Math.max(opts.pageSize ?? 30, 1), 100);

  const scopeOr: Record<string, unknown>[] = [];
  if (scopes.channelIds.length) scopeOr.push({ scopeType: "channel", scopeId: { $in: scopes.channelIds } });
  if (scopes.conversationIds.length) scopeOr.push({ scopeType: "dm", scopeId: { $in: scopes.conversationIds } });
  if (scopeOr.length === 0) {
    return { files: [], total: 0, page, pageSize, totalPages: 1, categories: [] };
  }

  const filter: Record<string, unknown> = { deletedAt: null, $or: scopeOr };
  if (opts.category) filter.category = opts.category;
  if (opts.kind) filter.kind = opts.kind;
  if (opts.scopeId) filter.scopeId = opts.scopeId;
  if (opts.q?.trim()) filter.name = new RegExp(opts.q.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");

  const [rows, total, categoryRows] = await Promise.all([
    c.find(filter).sort({ createdAt: -1 }).skip((page - 1) * pageSize).limit(pageSize).toArray(),
    c.countDocuments(filter),
    c.aggregate<{ _id: string }>([{ $match: { deletedAt: null, $or: scopeOr } }, { $group: { _id: "$category" } }, { $sort: { _id: 1 } }]).toArray(),
  ]);

  const channelIds = rows.filter((r) => r.scopeType === "channel").map((r) => r.scopeId);
  const uploaderIds = rows.map((r) => r.uploadedBy);

  const [channels, uploaders] = await Promise.all([
    channelIds.length
      ? db.collection<{ _id: string; name: string }>("chat_channels").find({ _id: { $in: channelIds } }).toArray()
      : Promise.resolve([]),
    uploaderIds.length
      ? db.collection<{ _id: string; displayName: string }>("chat_users").find({ _id: { $in: uploaderIds } }).toArray()
      : Promise.resolve([]),
  ]);
  const channelName = new Map(channels.map((c2) => [c2._id, c2.name]));
  const uploaderName = new Map(uploaders.map((u) => [u._id, u.displayName]));

  const files: FilesHubEntry[] = rows.map((r) => ({
    ...serializeSharedFile(r),
    scopeType: r.scopeType,
    scopeId: r.scopeId,
    scopeLabel: r.scopeType === "channel" ? `#${channelName.get(r.scopeId) ?? "channel"}` : "Direct message",
    uploaderName: uploaderName.get(r.uploadedBy) ?? "Unknown",
  }));

  return {
    files,
    total,
    page,
    pageSize,
    totalPages: Math.max(Math.ceil(total / pageSize), 1),
    categories: categoryRows.map((r) => r._id),
  };
}
