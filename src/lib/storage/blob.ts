import "server-only";
import { put, get, del, head } from "@vercel/blob";
import { Readable } from "node:stream";
import { getPlatformDb } from "@/lib/platform/tenancy/platform-db";
import { currentCompanyId } from "@/lib/platform/tenancy/context";
import { getConfig } from "@/lib/platform/config/store";
import { createGridFileStore, type GridFileStore } from "@/lib/storage/gridfs";
import { BillingLimitError, assertStorageAvailable, meterStorage } from "@/lib/platform/billing/enforce";
import { recordBlockedUpload, scanUpload } from "@/lib/storage/upload-scan";
import { blobAuth } from "@/lib/storage/blob-token";

/**
 * Shared file core (the database's GridFS by default, Vercel Blob optionally) — every `*-storage.ts` module in this codebase
 * (resumes, HRMS/PMS/FMS/PRMS documents, chat attachments, KB PDFs, voice
 * audio, ...) wraps these three functions instead of touching `node:fs`
 * directly. This replaced a `process.cwd()/uploads/<dir>` local-disk pattern
 * that silently failed on every write in production — Vercel's serverless
 * functions have a read-only filesystem outside `/tmp`, which doesn't
 * persist across requests either.
 *
 * All blobs are `access: "private"` — every one of these files is sensitive
 * (PII, resumes, financial/HR documents, private chat attachments), so reads
 * require authentication and are only ever delivered through this app's own
 * authenticated routes, never a public, guessable Blob URL. Access mode is
 * fixed at Blob-store creation and cannot be changed later.
 *
 * `storageKey` is the full pathname (including its folder prefix, e.g.
 * `"resumes/<uuid>.pdf"`) and is exactly what callers persist to Mongo —
 * `getObject`/`deleteObject` need nothing else to look a blob up.
 */

export interface PutResult {
  storageKey: string;
  contentType: string;
  size: number;
}

export interface GetResult {
  stream: ReadableStream<Uint8Array>;
  contentType: string;
}

/**
 * `folder` is a fixed literal per storage module (e.g. "resumes"); `filename`
 * is the caller's server-generated key (almost always `${randomUUID()}.${ext}`).
 * `size` is computed from the input here rather than trusted from the SDK
 * response, since `PutBlobResult` doesn't include one.
 */
// ---------------------------------------------------------------------------
// Backends. GridFS (the same database as the data) is the default, so files travel with the database. Vercel Blob is an optional backend
// for NEW uploads (setting FILE_BACKEND=blob plus a token); files that already live in a Blob store are still read from it (when a token is
// saved) and copied into the database on first read and by the background copier (`blob-to-gridfs.ts`). Nothing is ever deleted from Blob by the copy.
// ---------------------------------------------------------------------------

let grid: Promise<GridFileStore> | null = null;
/** The GridFS store of the platform database (indexes created once). */
export async function gridStore(): Promise<GridFileStore> {
  grid ??= getPlatformDb().then(async (db) => {
    const s = createGridFileStore(db);
    await s.ensureIndexes();
    return s;
  });
  return grid;
}

async function blobBackendWanted(): Promise<boolean> {
  const [backend, token] = await Promise.all([getConfig("FILE_BACKEND").catch(() => null), getConfig("BLOB_READ_WRITE_TOKEN").catch(() => null)]);
  return backend?.trim().toLowerCase() === "blob" && Boolean(token);
}

/** The company the request belongs to (kept on each stored file so a company's files can be found), or null outside a company scope. */
const owner = () => currentCompanyId().catch(() => null);

export async function putObject(folder: string, filename: string, body: Buffer, contentType?: string): Promise<PutResult> {
  const storageKey = `${folder}/${filename}`;
  const resolvedContentType = contentType || "application/octet-stream";
  // Safety check (see upload-scan.ts): programs, macros, scripts and known malware never reach storage. The caller's own message handling
  // (the one used for plan limits) shows the reason to the person.
  const scan = await scanUpload({ filename, contentType: resolvedContentType, body, folder });
  if (!scan.ok) {
    await recordBlockedUpload({ filename, reason: scan.reason, size: body.byteLength, folder });
    throw new BillingLimitError("upload_blocked", scan.reason, 422);
  }
  // Plan storage limit (throws a friendly BillingLimitError when full); metered once stored.
  await assertStorageAvailable(body.byteLength);
  await storeBytes(storageKey, body, resolvedContentType);
  await meterStorage(body.byteLength, { source: folder, detail: `${contentType || "file"} · ${filename}` });
  return { storageKey, contentType: resolvedContentType, size: body.byteLength };
}

/** Writes bytes under a key in the active backend (no scan, no plan limit): for internal files such as backups. Replaces an existing key. */
export async function storeBytes(storageKey: string, body: Buffer, contentType: string): Promise<void> {
  if (await blobBackendWanted()) {
    await put(storageKey, body, { ...(await blobAuth()), access: "private", contentType, addRandomSuffix: false, allowOverwrite: true });
    return;
  }
  await (await gridStore()).put(storageKey, body, contentType, { companyId: await owner() });
}

/** Returns `null` on a clean "not found"; throws on any other failure (auth error, outage, ...) so that never gets silently mapped to a 404. */
export async function getObject(storageKey: string): Promise<GetResult | null> {
  const local = await (await gridStore()).get(storageKey);
  if (local) return { stream: local.stream, contentType: local.contentType };
  const auth = await blobAuth();
  if (!auth.token) return null;
  const result = await get(storageKey, { ...auth, access: "private" });
  if (!result || result.statusCode !== 200 || !result.stream) return null;
  // First read of a file that still lives in Blob: copy it into the database while it is being served (best effort; the background copier covers the rest).
  const [forCaller, forCopy] = result.stream.tee();
  void copyIntoGrid(storageKey, forCopy, result.blob.contentType, result.blob.size).catch(() => {});
  return { stream: forCaller, contentType: result.blob.contentType };
}

async function copyIntoGrid(key: string, stream: ReadableStream<Uint8Array>, contentType: string, size: number): Promise<void> {
  const store = await gridStore();
  if (await store.head(key)) return void (await stream.cancel().catch(() => {}));
  await store.put(key, Readable.fromWeb(stream as never), contentType, { companyId: await owner() });
  const after = await store.head(key);
  if (!after || after.size !== size) await store.del([key]); // never keep a short copy: the next read tries again
}

/** Size and type of a stored file (database first, then Blob), or null. */
export async function headObject(storageKey: string): Promise<{ size: number; contentType: string } | null> {
  const local = await (await gridStore()).head(storageKey);
  if (local) return local;
  const auth = await blobAuth();
  if (!auth.token) return null;
  try {
    const b = await head(storageKey, auth);
    return { size: b.size, contentType: b.contentType };
  } catch {
    return null;
  }
}

/** Removes files from every backend that holds them (best effort per backend); returns how many keys were removed from the database. */
export async function deleteObjects(keys: string[]): Promise<number> {
  if (!keys.length) return 0;
  const n = await (await gridStore()).del(keys);
  const auth = await blobAuth();
  if (auth.token) await del(keys, auth).catch(() => {});
  return n;
}

export async function deleteObject(storageKey: string | null | undefined): Promise<void> {
  if (!storageKey) return;
  // Size first (best effort) so the storage meter can be credited back.
  const size = (await headObject(storageKey).catch(() => null))?.size ?? 0;
  await deleteObjects([storageKey]);
  if (size > 0) await meterStorage(-size, { source: storageKey.split("/")[0] || "files", detail: `deleted ${storageKey.split("/").slice(1).join("/")}` });
}
