import "server-only";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { del, get, put } from "@vercel/blob";
import { getDb } from "@/lib/mongodb";
import { currentCompanyId } from "@/lib/platform/tenancy/context";
import { buildArchive } from "@/lib/products/commandos/data-archive";
import { blobAuth, blobTokenConfigured } from "@/lib/storage/blob-token";

/**
 * Backups of a company's workspace: the archive from `data-archive.ts`, saved in private storage with a history row for each. Scheduled ones
 * are made by the daily job (one per company a week), manual ones by the Director, and the system takes one automatically before every
 * restore and before data is deleted. Every backup stays downloadable: what you download is the very file that is stored, and the very file a
 * restore reads. These files are the platform's own safety copies: they don't count against the company's storage allowance.
 */
export const BACKUPS_COLLECTION = "company_backups";
export const KEEP_SCHEDULED = 8;
export const KEEP_MANUAL = 10;
export const SAFETY_KEEP_DAYS = 30;

export type BackupKind = "scheduled" | "manual" | "pre_restore" | "pre_wipe" | "pre_delete";
export const BACKUP_KIND_LABELS: Record<BackupKind, string> = {
  scheduled: "Scheduled (weekly)",
  manual: "Made by you",
  pre_restore: "Safety copy before a restore",
  pre_wipe: "Safety copy before deleting data",
  pre_delete: "Safety copy before scheduling deletion",
};

export interface BackupDoc {
  _id: string;
  at: Date;
  kind: BackupKind;
  status: "ok" | "failed";
  storageKey: string | null;
  bytes: number;
  rows: number;
  collections: number;
  byEmail: string | null;
  error?: string;
  /** Safety copies are kept until this date, then removed. */
  keepUntil?: Date | null;
}

/** Where the files live. Private blob storage in production; a test can swap it. */
export interface BackupStorage {
  put(key: string, body: Buffer): Promise<void>;
  get(key: string): Promise<{ stream: ReadableStream<Uint8Array> } | null>;
  read(key: string): Promise<Buffer | null>;
  del(key: string): Promise<void>;
}
const blobStorage: BackupStorage = {
  async put(key, body) {
    await put(key, body, { ...(await blobAuth()), access: "private", contentType: "application/zip", addRandomSuffix: false, allowOverwrite: true });
  },
  async get(key) {
    const r = await get(key, { ...(await blobAuth()), access: "private" });
    return r && r.statusCode === 200 && r.stream ? { stream: r.stream } : null;
  },
  async read(key) {
    const r = await get(key, { ...(await blobAuth()), access: "private" });
    if (!r || r.statusCode !== 200 || !r.stream) return null;
    return Buffer.from(await new Response(r.stream).arrayBuffer());
  },
  async del(key) {
    await del(key, await blobAuth());
  },
};
/** Development only, with no Blob token: files in the machine's temp folder, so the pages can be tried locally. Never used in production. */
const devDir = path.join(tmpdir(), "selfrun-dev-backups");
const devPath = (key: string) => path.join(devDir, key.replace(/[^a-zA-Z0-9_.-]/g, "_"));
const diskStorage: BackupStorage = {
  async put(key, body) {
    await mkdir(devDir, { recursive: true });
    await writeFile(devPath(key), body);
  },
  async get(key) {
    const b = await readFile(devPath(key)).catch(() => null);
    return b ? { stream: new Response(new Uint8Array(b)).body! } : null;
  },
  async read(key) {
    return readFile(devPath(key)).catch(() => null);
  },
  async del(key) {
    await rm(devPath(key), { force: true });
  },
};
let override: BackupStorage | null = null;
const storageNow = async (): Promise<BackupStorage> => override ?? (process.env.NODE_ENV !== "production" && !(await blobTokenConfigured()) ? diskStorage : blobStorage);
/** A proxy so the code below keeps calling `storage.put(...)`. */
const storage: BackupStorage = { put: async (k, b) => (await storageNow()).put(k, b), get: async (k) => (await storageNow()).get(k), read: async (k) => (await storageNow()).read(k), del: async (k) => (await storageNow()).del(k) };
export function useBackupStorage(s: BackupStorage | null): void {
  override = s;
}

const col = async () => (await getDb()).collection<BackupDoc>(BACKUPS_COLLECTION);

export interface BackupView { id: string; at: string; kind: BackupKind; label: string; status: "ok" | "failed"; bytes: number; rows: number; collections: number; byEmail: string | null; error: string | null; downloadable: boolean; keepUntil: string | null }
export const backupView = (d: BackupDoc): BackupView => ({
  id: d._id, at: d.at.toISOString(), kind: d.kind, label: BACKUP_KIND_LABELS[d.kind], status: d.status, bytes: d.bytes, rows: d.rows, collections: d.collections,
  byEmail: d.byEmail, error: d.error ?? null, downloadable: d.status === "ok" && !!d.storageKey, keepUntil: d.keepUntil ? d.keepUntil.toISOString() : null,
});

export async function listBackups(limit = 50): Promise<BackupView[]> {
  return (await (await col()).find({}).sort({ at: -1 }).limit(limit).toArray()).map(backupView);
}

/** Makes a backup of the current company now. A failed attempt is recorded too, so the history tells the truth. */
export async function createBackup(kind: BackupKind, actor: { email: string } | null): Promise<{ ok: true; backup: BackupView } | { ok: false; error: string }> {
  const companyId = await currentCompanyId();
  const id = randomUUID();
  const at = new Date();
  const keepUntil = kind.startsWith("pre_") ? new Date(at.getTime() + SAFETY_KEEP_DAYS * 86_400_000) : null;
  const base: BackupDoc = { _id: id, at, kind, status: "failed", storageKey: null, bytes: 0, rows: 0, collections: 0, byEmail: actor?.email ?? null, keepUntil };
  const c = await col();
  try {
    const built = await buildArchive(companyId, { email: actor?.email ?? "scheduled backup" });
    if (!built.ok) {
      await c.insertOne({ ...base, error: built.error });
      return { ok: false, error: built.error };
    }
    const key = `backups/${companyId}/${id}.zip`;
    await storage.put(key, built.data);
    const doc: BackupDoc = { ...base, status: "ok", storageKey: key, bytes: built.data.length, rows: built.rows, collections: built.collections };
    await c.insertOne(doc);
    await applyRetention();
    return { ok: true, backup: backupView(doc) };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[backup] failed", message);
    await c.insertOne({ ...base, error: "The backup could not be saved. It will be tried again." }).catch(() => {});
    return { ok: false, error: "The backup could not be saved. Try again in a moment." };
  }
}

/** Removes the oldest scheduled / manual backups past the limits, and safety copies past their date. */
export async function applyRetention(): Promise<number> {
  const c = await col();
  const all = await c.find({}).sort({ at: -1 }).toArray();
  const drop: BackupDoc[] = [];
  const seen: Record<string, number> = {};
  for (const b of all) {
    if (b.kind === "scheduled" || b.kind === "manual") {
      seen[b.kind] = (seen[b.kind] ?? 0) + 1;
      if (seen[b.kind] > (b.kind === "scheduled" ? KEEP_SCHEDULED : KEEP_MANUAL)) drop.push(b);
    } else if (b.keepUntil && b.keepUntil.getTime() < Date.now()) drop.push(b);
  }
  for (const b of drop) {
    if (b.storageKey) await storage.del(b.storageKey).catch(() => {});
    await c.deleteOne({ _id: b._id });
  }
  return drop.length;
}

export async function backupFile(id: string): Promise<{ stream: ReadableStream<Uint8Array>; filename: string; bytes: number } | null> {
  const b = await (await col()).findOne({ _id: id });
  if (!b || b.status !== "ok" || !b.storageKey) return null;
  const f = await storage.get(b.storageKey);
  if (!f) return null;
  return { stream: f.stream, filename: `backup-${b.at.toISOString().slice(0, 16).replace(/[:T]/g, "-")}.zip`, bytes: b.bytes };
}

export async function backupBuffer(id: string): Promise<{ data: Buffer; doc: BackupDoc } | null> {
  const b = await (await col()).findOne({ _id: id });
  if (!b || b.status !== "ok" || !b.storageKey) return null;
  const data = await storage.read(b.storageKey);
  return data ? { data, doc: b } : null;
}

/** Deletes every backup file of a company (used when the company is deleted for good). */
export async function deleteAllBackups(): Promise<number> {
  const c = await col();
  const all = await c.find({}).toArray();
  for (const b of all) if (b.storageKey) await storage.del(b.storageKey).catch(() => {});
  await c.deleteMany({});
  return all.length;
}

/** Whether the company is due its weekly backup (no good scheduled backup in the last 6 days) and has something to save. */
export async function scheduledBackupDue(): Promise<boolean> {
  const last = await (await col()).findOne({ kind: "scheduled", status: "ok" }, { sort: { at: -1 } });
  return !last || Date.now() - last.at.getTime() > 6 * 86_400_000;
}
