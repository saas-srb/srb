import "server-only";
import { randomUUID } from "node:crypto";
import { BlobNotFoundError, get, head, list, put } from "@vercel/blob";
import { decryptPlatformSecret, encryptPlatformSecret, isPlatformEncryptionConfigured, last4 } from "@/lib/platform/crypto";
import type { EncryptedValue } from "@/lib/platform/crypto";
import { getPlatformDb } from "@/lib/platform/tenancy/platform-db";
import { recordPlatformAudit } from "@/lib/platform/audit";
import { getConfig, saveConfig } from "@/lib/platform/config/store";
import { acquireLease, releaseLease, renewLease } from "@/lib/cron/lease";
import { canSwitch, emptyBlobCounts, migrateBlobs, type BlobFailure, type BlobMigrationCounts, type BlobStoreApi } from "@/lib/storage/blob-migrate";

/** The real Vercel Blob adapter and the saved progress of "Migrate from another Blob store" (Console → Integrations → File storage). Tokens are never logged. */

const COLLECTION = "blob_migrations";
const DOC_ID = "current";
const LEASE_KEY = "blob-migration";
const LEASE_SECONDS = 330;
const CTX = { source: "storage:blob-migration:source", target: "storage:blob-migration:target" } as const;

interface SecretBox {
  enc: EncryptedValue;
  last4: string;
}

export interface BlobMigrationDoc {
  _id: typeof DOC_ID;
  runId: string;
  status: "running" | "done" | "failed";
  dryRun: boolean;
  startedAt: Date;
  updatedAt: Date;
  finishedAt: Date | null;
  cursor: string | null;
  counts: BlobMigrationCounts;
  failures: BlobFailure[];
  ended: boolean;
  /** Source token: kept only when the owner asked (or until the run ends). Target token: kept until switched or discarded. */
  sourceToken: SecretBox | null;
  keepSourceToken: boolean;
  targetToken: SecretBox | null;
  switched: boolean;
  error: string | null;
}

async function col() {
  return (await getPlatformDb()).collection<BlobMigrationDoc>(COLLECTION);
}

export function createBlobStoreApi(token: string): BlobStoreApi {
  return {
    async list(cursor, limit) {
      const res = await list({ token, limit, ...(cursor ? { cursor } : {}) });
      return { blobs: res.blobs.map((b) => ({ pathname: b.pathname, size: b.size })), cursor: res.hasMore && res.cursor ? res.cursor : null };
    },
    async head(pathname) {
      try {
        return { size: (await head(pathname, { token })).size };
      } catch (err) {
        if (err instanceof BlobNotFoundError) return null;
        throw err;
      }
    },
    async get(pathname) {
      const res = await get(pathname, { token, access: "private" });
      if (!res || res.statusCode !== 200 || !res.stream) return null;
      return { body: res.stream, contentType: res.blob.contentType };
    },
    async put(pathname, body, contentType) {
      await put(pathname, body as Parameters<typeof put>[1], { token, access: "private", contentType, addRandomSuffix: false });
    },
  };
}

export interface BlobMigrationView {
  status: "none" | "running" | "done" | "failed";
  dryRun: boolean;
  startedAt: string | null;
  finishedAt: string | null;
  counts: BlobMigrationCounts;
  failures: BlobFailure[];
  ended: boolean;
  canSwitch: boolean;
  switched: boolean;
  hasTargetToken: boolean;
  error: string | null;
}

const EMPTY: BlobMigrationView = { status: "none", dryRun: false, startedAt: null, finishedAt: null, counts: emptyBlobCounts(), failures: [], ended: false, canSwitch: false, switched: false, hasTargetToken: false, error: null };

export async function getBlobMigrationView(): Promise<BlobMigrationView> {
  const d = await (await col()).findOne({ _id: DOC_ID });
  if (!d) return EMPTY;
  return {
    status: d.status,
    dryRun: d.dryRun,
    startedAt: d.startedAt.toISOString(),
    finishedAt: d.finishedAt ? d.finishedAt.toISOString() : null,
    counts: d.counts,
    failures: d.failures,
    ended: d.ended,
    canSwitch: d.status === "done" && !d.switched && Boolean(d.targetToken) && canSwitch(d),
    switched: d.switched,
    hasTargetToken: Boolean(d.targetToken),
    error: d.error,
  };
}

/** Starts a migration. A blank source token means the one saved now in File storage; the target token is required and must differ. */
export async function startBlobMigration(input: { sourceToken: string; targetToken: string; dryRun: boolean; keepSourceToken: boolean }, actorId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isPlatformEncryptionConfigured()) return { ok: false, error: "Set PLATFORM_ENCRYPTION_KEY on the server first." };
  const target = input.targetToken.trim();
  const source = input.sourceToken.trim() || (await getConfig("BLOB_READ_WRITE_TOKEN")) || "";
  if (!source) return { ok: false, error: "Enter the old store's token (nothing is saved in File storage yet)." };
  if (!target) return { ok: false, error: "Enter the new store's read-write token." };
  if (source === target) return { ok: false, error: "The old and new tokens are the same store." };
  const c = await col();
  const existing = await c.findOne({ _id: DOC_ID });
  if (existing?.status === "running" && Date.now() - existing.updatedAt.getTime() < 30 * 60_000) return { ok: false, error: "A migration is already running." };
  const now = new Date();
  const doc: BlobMigrationDoc = {
    _id: DOC_ID,
    runId: randomUUID(),
    status: "running",
    dryRun: input.dryRun,
    startedAt: now,
    updatedAt: now,
    finishedAt: null,
    cursor: null,
    counts: emptyBlobCounts(),
    failures: [],
    ended: false,
    sourceToken: { enc: encryptPlatformSecret(source, CTX.source), last4: last4(source) },
    keepSourceToken: input.keepSourceToken,
    targetToken: { enc: encryptPlatformSecret(target, CTX.target), last4: last4(target) },
    switched: false,
    error: null,
  };
  await c.replaceOne({ _id: DOC_ID }, doc, { upsert: true });
  await recordPlatformAudit({ actorId, action: "storage.blob_migration.start", target: { type: "blob_migration", id: doc.runId }, details: { dryRun: input.dryRun, keepSourceToken: input.keepSourceToken } });
  return { ok: true };
}

/** Works on the running migration for up to `budgetMs`. Safe to call from anywhere (UI, cron); a lease keeps it to one worker. */
export async function runBlobMigrationTick(budgetMs: number): Promise<BlobMigrationView> {
  const c = await col();
  const doc = await c.findOne({ _id: DOC_ID });
  if (!doc || doc.status !== "running") return getBlobMigrationView();
  const holder = randomUUID();
  if (!(await acquireLease(LEASE_KEY, LEASE_SECONDS, holder))) return getBlobMigrationView();
  try {
    const sourceToken = doc.sourceToken ? decryptPlatformSecret(doc.sourceToken.enc, CTX.source) : null;
    const targetToken = doc.targetToken ? decryptPlatformSecret(doc.targetToken.enc, CTX.target) : null;
    if (!sourceToken || !targetToken) {
      await c.updateOne({ _id: DOC_ID, runId: doc.runId }, { $set: { status: "failed", error: "The saved tokens can't be read (encryption key changed?). Start again.", finishedAt: new Date() } });
      return getBlobMigrationView();
    }
    const { progress, ended } = await migrateBlobs(
      createBlobStoreApi(sourceToken),
      createBlobStoreApi(targetToken),
      { cursor: doc.cursor, counts: doc.counts, failures: doc.failures },
      {
        dryRun: doc.dryRun,
        budgetMs,
        onProgress: async (p) => {
          await c.updateOne({ _id: DOC_ID, runId: doc.runId }, { $set: { cursor: p.cursor, counts: p.counts, failures: p.failures, updatedAt: new Date() } });
          await renewLease(LEASE_KEY, LEASE_SECONDS, holder);
        },
      },
    );
    await c.updateOne(
      { _id: DOC_ID, runId: doc.runId },
      {
        $set: { cursor: progress.cursor, counts: progress.counts, failures: progress.failures, updatedAt: new Date(), ended, error: null, ...(ended ? { status: "done" as const, finishedAt: new Date() } : {}) },
      },
    );
    if (ended && !doc.keepSourceToken) await c.updateOne({ _id: DOC_ID, runId: doc.runId }, { $set: { sourceToken: null } });
  } catch (err) {
    // A listing/auth failure: keep the run so the next tick retries from the same cursor.
    await c.updateOne({ _id: DOC_ID, runId: doc.runId }, { $set: { error: err instanceof Error ? err.message : String(err), updatedAt: new Date() } });
  } finally {
    await releaseLease(LEASE_KEY, holder);
  }
  return getBlobMigrationView();
}

/** Saves the new store's token as the app's Blob token. Only after a real, complete run with no failures. */
export async function switchToNewBlobStore(actorId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const c = await col();
  const doc = await c.findOne({ _id: DOC_ID });
  if (!doc || doc.status !== "done" || doc.switched || !doc.targetToken || !canSwitch(doc)) return { ok: false, error: "Only a finished, complete copy (not a dry run, nothing failed) can be switched to." };
  const token = decryptPlatformSecret(doc.targetToken.enc, CTX.target);
  if (!token) return { ok: false, error: "The new store's token can't be read. Start the migration again." };
  const res = await saveConfig({ BLOB_READ_WRITE_TOKEN: token }, actorId);
  if (!res.ok) return { ok: false, error: "Couldn't save the new token in File storage." };
  await c.updateOne({ _id: DOC_ID }, { $set: { switched: true, targetToken: null } });
  await recordPlatformAudit({ actorId, action: "storage.blob_migration.switch", target: { type: "blob_migration", id: doc.runId }, details: { copied: doc.counts.copied, skipped: doc.counts.skipped } });
  return { ok: true };
}

/** Forget the saved tokens and the run (nothing is deleted from either store). */
export async function discardBlobMigration(actorId: string): Promise<void> {
  await (await col()).deleteOne({ _id: DOC_ID });
  await recordPlatformAudit({ actorId, action: "storage.blob_migration.discard", target: { type: "blob_migration", id: DOC_ID }, details: {} });
}
