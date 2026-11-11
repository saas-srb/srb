import "server-only";
import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import { getPlatformDb } from "@/lib/platform/tenancy/platform-db";
import { getConfig } from "@/lib/platform/config/store";
import { acquireLease, releaseLease, renewLease } from "@/lib/cron/lease";
import { emptyBlobCounts, migrateBlobs, type BlobFailure, type BlobMigrationCounts, type BlobStoreApi } from "@/lib/storage/blob-migrate";
import { createBlobStoreApi } from "@/lib/storage/blob-migrate-run";
import { gridStore } from "@/lib/storage/blob";

/**
 * Background copier: files that still live in the (old) Vercel Blob store are copied into the database (GridFS), so the database alone holds
 * everything. Same resumable, size-verified, concurrency-limited engine as the Blob-to-Blob migration; reads Blob with the token saved in the
 * Console; NEVER deletes from Blob. Driven by the daily `domains` cron tick, the Console tick and first boot.
 */

const COLLECTION = "blob_migrations";
const DOC_ID = "gridfs-copy";
const LEASE_KEY = "gridfs-copy";
const LEASE_SECONDS = 330;

interface CopyDoc {
  _id: typeof DOC_ID;
  runId: string;
  status: "running" | "done";
  startedAt: Date;
  updatedAt: Date;
  finishedAt: Date | null;
  cursor: string | null;
  counts: BlobMigrationCounts;
  failures: BlobFailure[];
  error: string | null;
}

const col = async () => (await getPlatformDb()).collection<CopyDoc>(COLLECTION);

async function gridApi(): Promise<BlobStoreApi> {
  const grid = await gridStore();
  return {
    list: async () => ({ blobs: [], cursor: null }),
    head: (p) => grid.head(p).then((h) => (h ? { size: h.size } : null)),
    get: async (p) => {
      const r = await grid.get(p);
      return r ? { body: r.stream, contentType: r.contentType } : null;
    },
    async put(p, body, contentType) {
      const stream = body instanceof Uint8Array ? Buffer.from(body) : Readable.fromWeb(body as never);
      await grid.put(p, stream, contentType, {});
    },
  };
}

export interface FileCopyView {
  state: "no-blob" | "idle" | "running" | "done";
  /** Objects found in Blob so far / already in the database (copied or already there). */
  listed: number;
  inDatabase: number;
  remaining: number;
  failed: number;
  bytes: number;
  error: string | null;
  finishedAt: string | null;
}

export async function legacyCopyStatus(): Promise<FileCopyView> {
  const token = await getConfig("BLOB_READ_WRITE_TOKEN").catch(() => null);
  const d = await (await col()).findOne({ _id: DOC_ID });
  if (!d) return { state: token ? "idle" : "no-blob", listed: 0, inDatabase: 0, remaining: 0, failed: 0, bytes: 0, error: null, finishedAt: null };
  const inDatabase = d.counts.copied + d.counts.skipped;
  return { state: d.status, listed: d.counts.listed, inDatabase, remaining: Math.max(0, d.counts.listed - inDatabase), failed: d.counts.failed, bytes: d.counts.bytes, error: d.error, finishedAt: d.finishedAt ? d.finishedAt.toISOString() : null };
}

/** Starts a pass over the Blob store when a token is saved and none has run yet (or `force`). Safe to call often. */
export async function ensureLegacyCopy(force = false): Promise<void> {
  if (!(await getConfig("BLOB_READ_WRITE_TOKEN").catch(() => null))) return;
  const c = await col();
  const cur = await c.findOne({ _id: DOC_ID });
  if (cur && !force) return;
  if (cur?.status === "running") return;
  const now = new Date();
  await c.replaceOne({ _id: DOC_ID }, { runId: randomUUID(), status: "running", startedAt: now, updatedAt: now, finishedAt: null, cursor: null, counts: emptyBlobCounts(), failures: [], error: null }, { upsert: true });
}

/** Copies for up to `budgetMs`. Never throws. */
export async function runLegacyCopyTick(budgetMs: number): Promise<FileCopyView> {
  const c = await col();
  const doc = await c.findOne({ _id: DOC_ID });
  if (!doc || doc.status !== "running") return legacyCopyStatus();
  const token = await getConfig("BLOB_READ_WRITE_TOKEN").catch(() => null);
  if (!token) return legacyCopyStatus();
  const holder = randomUUID();
  if (!(await acquireLease(LEASE_KEY, LEASE_SECONDS, holder))) return legacyCopyStatus();
  try {
    const { progress, ended } = await migrateBlobs(createBlobStoreApi(token), await gridApi(), { cursor: doc.cursor, counts: doc.counts, failures: doc.failures }, {
      dryRun: false,
      budgetMs,
      onProgress: async (p) => {
        await c.updateOne({ _id: DOC_ID, runId: doc.runId }, { $set: { cursor: p.cursor, counts: p.counts, failures: p.failures, updatedAt: new Date() } });
        await renewLease(LEASE_KEY, LEASE_SECONDS, holder);
      },
    });
    await c.updateOne({ _id: DOC_ID, runId: doc.runId }, { $set: { cursor: progress.cursor, counts: progress.counts, failures: progress.failures, updatedAt: new Date(), error: null, ...(ended ? { status: "done" as const, finishedAt: new Date() } : {}) } });
  } catch (err) {
    // The old store can't be listed (token revoked, account closed): keep the run, show why, files already copied stay copied.
    await c.updateOne({ _id: DOC_ID, runId: doc.runId }, { $set: { error: err instanceof Error ? err.message.slice(0, 200) : "error", updatedAt: new Date() } });
  } finally {
    await releaseLease(LEASE_KEY, holder);
  }
  return legacyCopyStatus();
}
