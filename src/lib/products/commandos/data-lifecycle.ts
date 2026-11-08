import "server-only";
import { randomUUID } from "node:crypto";
import { del } from "@vercel/blob";
import type { AnyBulkWriteOperation, Document } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { getPlatformDb } from "@/lib/platform/tenancy/platform-db";
import { currentCompanyId, forEachCompany, runAsCompany } from "@/lib/platform/tenancy/context";
import { COMPANIES_COLLECTION, forgetCompanyRouting, getCompany, type Company } from "@/lib/platform/tenancy/companies";
import { KEY_SEPARATOR, isKeyedCollection } from "@/lib/platform/tenancy/collections";
import { assertWritable } from "@/lib/platform/billing/enforce";
import { recordPlatformAudit } from "@/lib/platform/audit";
import { purgeCompanyNow } from "@/lib/platform/console/delete-company";
import { companyCollections, ownRows, parseRecords, readArchive } from "@/lib/products/commandos/data-archive";
import { applyRetention, backupBuffer, createBackup, deleteAllBackups, scheduledBackupDue, type BackupKind } from "@/lib/products/commandos/backups";
import { blobAuth } from "@/lib/storage/blob-token";

/**
 * What happens to a company's data over its life: restoring a backup, deleting all its data, and deleting the company itself after a 30-day
 * wait. Each of these is recorded: restores in their own history, the others in the data-events history, both shown on Settings → Backups & data.
 * The multi-step confirmation lives in `danger.ts`; callers confirm first and only then call these.
 */
export const RESTORES_COLLECTION = "company_restores";
export const EVENTS_COLLECTION = "company_data_events";
export const DELETION_GRACE_DAYS = 30;

type Actor = { id: string; email: string };

// ── history ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
interface RestoreDoc {
  _id: string;
  at: Date;
  finishedAt: Date | null;
  byEmail: string;
  backupId: string;
  backupAt: Date;
  safetyBackupId: string | null;
  status: "running" | "done" | "failed";
  collections: { name: string; restored: number; removed: number }[];
  error?: string;
}
export interface RestoreView { id: string; at: string; finishedAt: string | null; byEmail: string; backupId: string; backupAt: string; safetyBackupId: string | null; status: RestoreDoc["status"]; records: number; removed: number; collections: number; error: string | null }
const restoreView = (d: RestoreDoc): RestoreView => ({
  id: d._id, at: d.at.toISOString(), finishedAt: d.finishedAt ? d.finishedAt.toISOString() : null, byEmail: d.byEmail, backupId: d.backupId, backupAt: d.backupAt.toISOString(),
  safetyBackupId: d.safetyBackupId, status: d.status, records: d.collections.reduce((n, c) => n + c.restored, 0), removed: d.collections.reduce((n, c) => n + c.removed, 0), collections: d.collections.length, error: d.error ?? null,
});
export async function listRestores(limit = 30): Promise<RestoreView[]> {
  return (await (await getDb()).collection<RestoreDoc>(RESTORES_COLLECTION).find({}).sort({ at: -1 }).limit(limit).toArray()).map(restoreView);
}

export type DataEventKind = "wipe" | "delete_scheduled" | "delete_cancelled";
export const DATA_EVENT_LABELS: Record<DataEventKind, string> = { wipe: "All data deleted", delete_scheduled: "Company deletion scheduled", delete_cancelled: "Company deletion cancelled" };
interface EventDoc { _id: string; at: Date; kind: DataEventKind; byEmail: string; note: string }
export interface DataEventView { id: string; at: string; kind: DataEventKind; label: string; byEmail: string; note: string }
async function recordEvent(kind: DataEventKind, actor: Actor, note: string): Promise<void> {
  await (await getDb()).collection<EventDoc>(EVENTS_COLLECTION).insertOne({ _id: randomUUID(), at: new Date(), kind, byEmail: actor.email, note }).catch((e) => console.error("[data-events]", e));
  await recordPlatformAudit({ actorId: actor.id, companyId: await currentCompanyId(), action: `company.data.${kind}`, target: { type: "company", id: await currentCompanyId() }, details: { note } });
}
export async function listDataEvents(limit = 30): Promise<DataEventView[]> {
  return (await (await getDb()).collection<EventDoc>(EVENTS_COLLECTION).find({}).sort({ at: -1 }).limit(limit).toArray()).map((e) => ({ id: e._id, at: e.at.toISOString(), kind: e.kind, label: DATA_EVENT_LABELS[e.kind], byEmail: e.byEmail, note: e.note }));
}

// ── restore ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
/**
 * Puts the workspace back to the state in a backup: records in the backup are written back (over the same record where it still exists),
 * and records made since are removed. Accounts and sign-ins are never touched (their passwords are not in a backup). A safety copy of the
 * current state is taken first and kept for 30 days, so a restore can itself be undone by restoring that copy.
 */
export async function restoreBackup(backupId: string, actor: Actor): Promise<{ ok: true; restore: RestoreView } | { ok: false; error: string }> {
  await assertWritable();
  const companyId = await currentCompanyId();
  const src = await backupBuffer(backupId);
  if (!src) return { ok: false, error: "That backup can't be found or its file is gone." };
  const read = await readArchive(src.data);
  if (!read.ok) return read;
  const { manifest, files } = read.archive;
  const company = await getCompany(companyId);
  if (manifest.companyId ? manifest.companyId !== companyId : manifest.workspace !== company?.slug) return { ok: false, error: "That backup belongs to another workspace." };

  const safety = await createBackup("pre_restore", actor);
  if (!safety.ok) return { ok: false, error: `Nothing was changed: the safety copy of your current data could not be made (${safety.error})` };

  const runs = (await getDb()).collection<RestoreDoc>(RESTORES_COLLECTION);
  const id = randomUUID();
  const doc: RestoreDoc = { _id: id, at: new Date(), finishedAt: null, byEmail: actor.email, backupId, backupAt: src.doc.at, safetyBackupId: safety.backup.id, status: "running", collections: [] };
  await runs.insertOne(doc);
  try {
    const db = await getPlatformDb();
    const allowed = (await companyCollections(companyId, { forRestore: true })).map((c) => c.name);
    const names = new Set<string>([...allowed]);
    for (const n of files.keys()) if (!allowed.includes(n)) files.delete(n); // not a collection a restore may touch
    const results: RestoreDoc["collections"] = [];
    for (const name of names) {
      const target = db.collection(name);
      const rows = files.has(name) ? parseRecords(files.get(name)!) : [];
      const keyed = isKeyedCollection(name);
      const ids: unknown[] = [];
      let ops: AnyBulkWriteOperation<Document>[] = [];
      let restored = 0;
      const flush = async () => {
        if (ops.length) await target.bulkWrite(ops, { ordered: false });
        ops = [];
      };
      for (const row of rows) {
        const { _id, ...rest } = row;
        const key = keyed && typeof _id === "string" ? `${companyId}${KEY_SEPARATOR}${_id}` : _id;
        ids.push(key);
        ops.push({ updateOne: { filter: { _id: key, companyId } as never, update: { $set: { ...rest, companyId } }, upsert: true } });
        restored++;
        if (ops.length >= 500) await flush();
      }
      await flush();
      const gone = await target.deleteMany({ $and: [ownRows(companyId), { _id: { $nin: ids as never[] } }] });
      if (restored > 0 || gone.deletedCount > 0) results.push({ name, restored, removed: gone.deletedCount });
    }
    await runs.updateOne({ _id: id }, { $set: { status: "done", finishedAt: new Date(), collections: results } });
    await recordPlatformAudit({ actorId: actor.id, companyId, action: "company.data.restore", target: { type: "backup", id: backupId }, details: { safetyBackupId: safety.backup.id } });
    return { ok: true, restore: restoreView({ ...doc, status: "done", finishedAt: new Date(), collections: results }) };
  } catch (err) {
    console.error("[restore] failed", err instanceof Error ? err.message : err);
    const message = "The restore stopped part-way. Your data from just before it is saved as a safety copy: restore that copy to get back to where you were.";
    await runs.updateOne({ _id: id }, { $set: { status: "failed", finishedAt: new Date(), error: message } });
    return { ok: false, error: message };
  }
}

// ── delete all data ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
const UUID_KEY = /^[a-z0-9_/-]+\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(\.[a-z0-9]+)?$/i;
/** Kept when "all data" is deleted: custom roles and access history, which accounts refer to. */
const WIPE_KEEP = /^(custom_roles|access_audit.*)$/;

/**
 * Deletes everything the company has stored — records, settings and uploaded files — and keeps the company itself, its accounts and its
 * subscription, so the Director can sign in and start again. A safety copy of the records is made first and kept for 30 days (uploaded
 * files are deleted for good and are not in it).
 */
export async function wipeCompanyData(actor: Actor): Promise<{ ok: true; rows: number; files: number } | { ok: false; error: string }> {
  await assertWritable();
  const companyId = await currentCompanyId();
  const safety = await createBackup("pre_wipe", actor);
  if (!safety.ok) return { ok: false, error: `Nothing was deleted: the safety copy could not be made (${safety.error})` };
  const db = await getPlatformDb();
  const names = (await companyCollections(companyId, { forRestore: true })).map((c) => c.name).filter((n) => !WIPE_KEEP.test(n));
  const keys = new Set<string>();
  const walk = (v: unknown, depth = 0) => {
    if (depth > 12 || v == null) return;
    if (typeof v === "string") { if (UUID_KEY.test(v)) keys.add(v); }
    else if (Array.isArray(v)) v.forEach((x) => walk(x, depth + 1));
    else if (typeof v === "object" && !(v instanceof Date)) Object.values(v as Record<string, unknown>).forEach((x) => walk(x, depth + 1));
  };
  for (const name of names) for await (const doc of db.collection(name).find(ownRows(companyId))) walk(doc);
  let files = 0;
  const all = [...keys];
  for (let i = 0; i < all.length; i += 100) {
    try { await del(all.slice(i, i + 100), await blobAuth()); files += Math.min(100, all.length - i); } catch (err) { console.error("[wipe] file removal failed", err instanceof Error ? err.message : err); }
  }
  let rows = 0;
  for (const name of names) rows += (await db.collection(name).deleteMany(ownRows(companyId))).deletedCount;
  await recordEvent("wipe", actor, `${rows.toLocaleString("en-IN")} records and ${files} files deleted. Safety copy kept for ${30} days.`);
  return { ok: true, rows, files };
}

// ── delete the company (after 30 days) ──────────────────────────────────────────────────────────────────────────────────────────────────────
export async function scheduleCompanyDeletion(actor: Actor): Promise<{ ok: true; purgeAt: Date } | { ok: false; error: string }> {
  await assertWritable();
  const companyId = await currentCompanyId();
  const company = await getCompany(companyId);
  if (!company) return { ok: false, error: "Unknown company." };
  if (company.isPlatformOwner || company.isDemo) return { ok: false, error: "This workspace can't be deleted." };
  if (company.deletion) return { ok: false, error: "Deletion is already scheduled." };
  const safety = await createBackup("pre_delete", actor);
  if (!safety.ok) return { ok: false, error: `Nothing was scheduled: the safety copy could not be made (${safety.error})` };
  const now = new Date();
  const purgeAt = new Date(now.getTime() + DELETION_GRACE_DAYS * 86_400_000);
  await (await getPlatformDb()).collection<Company>(COMPANIES_COLLECTION).updateOne({ _id: companyId }, { $set: { deletion: { requestedAt: now, purgeAt, requestedBy: actor.email }, updatedAt: now } });
  forgetCompanyRouting();
  await recordEvent("delete_scheduled", actor, `The company and all its data will be deleted for good on ${purgeAt.toISOString().slice(0, 10)}. It can be restored until then.`);
  return { ok: true, purgeAt };
}

/** Cancelling is allowed while the workspace is read-only: it is how the account comes back. */
export async function cancelCompanyDeletion(actor: Actor): Promise<{ ok: true } | { ok: false; error: string }> {
  const companyId = await currentCompanyId();
  const company = await getCompany(companyId);
  if (!company?.deletion) return { ok: false, error: "No deletion is scheduled." };
  await (await getPlatformDb()).collection<Company>(COMPANIES_COLLECTION).updateOne({ _id: companyId }, { $unset: { deletion: "" }, $set: { updatedAt: new Date() } });
  forgetCompanyRouting();
  await recordEvent("delete_cancelled", actor, "The deletion was cancelled and the workspace is writable again.");
  return { ok: true };
}

// ── the daily job ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
/** Weekly backups for the companies that are due, retention, and the deletion of companies whose 30 days have ended. Stops before `deadlineMs`. */
export async function runLifecycleJobs(deadlineMs = Date.now() + 240_000): Promise<{ backedUp: number; failed: number; skipped: number; deleted: number; pruned: number }> {
  const out = { backedUp: 0, failed: 0, skipped: 0, deleted: 0, pruned: 0 };
  const db = await getPlatformDb();
  const due = await db.collection<Company>(COMPANIES_COLLECTION).find({ "deletion.purgeAt": { $lte: new Date() } }).toArray();
  for (const c of due) {
    if (Date.now() > deadlineMs) break;
    await runAsCompany(c._id, deleteAllBackups).catch(() => 0);
    const res = await purgeCompanyNow(c._id);
    if (res.ok) {
      out.deleted++;
      await recordPlatformAudit({ actorId: "system", action: "company.delete.after_grace", target: { type: "company", id: c._id }, details: { name: c.name, rows: res.rowsRemoved, files: res.filesRemoved } });
    } else console.error("[lifecycle] deletion failed", c._id, res.error);
  }
  await forEachCompany(async (companyId) => {
    if (Date.now() > deadlineMs) return;
    const company = await getCompany(companyId);
    if (!company || company.isPlatformOwner || company.isDemo || company.deletion) return;
    out.pruned += await applyRetention().catch(() => 0);
    if (!(await scheduledBackupDue())) return;
    const rows = (await companyCollections(companyId)).reduce((n, c) => n + c.rows, 0);
    if (rows === 0) { out.skipped++; return; }
    const res = await createBackup("scheduled", null);
    if (res.ok) out.backedUp++;
    else out.failed++;
  });
  return out;
}
export type { BackupKind };
