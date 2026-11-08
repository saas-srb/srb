import "server-only";
import { getDb } from "@/lib/mongodb";
import { PB_COLLECTIONS } from "@/lib/products/playbook-ai/pb-collections";
import { newId } from "@/lib/products/playbook-ai/db";
import type { PbVersionRecord, PbVersionSummary } from "@/lib/products/playbook-ai/documents-types";

/**
 * `pb_versions`: immutable version rows. This module exports NO update or delete of content: rows are written once by `insertVersion`
 * (used by `documents.ts`, which holds the permission and status checks), read back, and nothing else. A unique (documentId, number)
 * index makes a duplicate number fail at the database. The only later write is `attachSealedExport`, which sets a sealed export
 * reference once and never overwrites it. Rows go away only with their document (`purgeVersionsOfDocument`, behind MANAGE_RETENTION).
 */

let indexesEnsured = false;
async function col() {
  const db = await getDb();
  const c = db.collection<PbVersionRecord>(PB_COLLECTIONS.versions);
  if (!indexesEnsured) {
    indexesEnsured = true;
    await Promise.all([
      c.createIndex({ documentId: 1, number: 1 }, { unique: true }).catch(() => {}),
      c.createIndex({ documentId: 1, createdAt: -1 }).catch(() => {}),
    ]);
  }
  return c;
}

/** Test hook: forget that indexes were created (after the test drops its database). */
export function resetPbVersionIndexes(): void {
  indexesEnsured = false;
}

export type NewVersion = Omit<PbVersionRecord, "_id" | "createdAt" | "exports">;

/** Writes one immutable version. Throws on a duplicate (documentId, number). */
export async function insertVersion(v: NewVersion): Promise<PbVersionRecord> {
  const c = await col();
  const row: PbVersionRecord = { ...v, _id: newId(), createdAt: new Date(), exports: {} };
  await c.insertOne(row);
  return row;
}

export async function listVersionSummaries(documentId: string): Promise<PbVersionSummary[]> {
  const c = await col();
  return c.find({ documentId }, { projection: { pbdoc: 0, variableSnapshot: 0 } }).sort({ number: -1 }).toArray() as Promise<PbVersionSummary[]>;
}

export async function getVersionByNumber(documentId: string, number: number): Promise<PbVersionRecord | null> {
  const c = await col();
  return c.findOne({ documentId, number });
}

export async function getLatestVersion(documentId: string): Promise<PbVersionRecord | null> {
  const c = await col();
  return c.find({ documentId }).sort({ number: -1 }).limit(1).next();
}

/**
 * Records where a sealed export of an ISSUED version is stored (A5). Set once per format: a second call returns false and changes nothing,
 * so an issued export can never be silently replaced.
 */
export async function attachSealedExport(documentId: string, number: number, format: "pdf" | "docx", ref: { key: string; sha256: string }): Promise<boolean> {
  const c = await col();
  const r = await c.updateOne(
    { documentId, number, kind: "issue", [`exports.${format}`]: { $exists: false } } as never,
    { $set: { [`exports.${format}`]: { ...ref, at: new Date() } } } as never
  );
  return r.modifiedCount === 1;
}

/** Removes every version of a purged document. Only `purgeDocument` calls this. */
export async function purgeVersionsOfDocument(documentId: string): Promise<number> {
  const c = await col();
  return (await c.deleteMany({ documentId })).deletedCount;
}
