import "server-only";
import { put, get, del, head } from "@vercel/blob";
import { BillingLimitError, assertStorageAvailable, meterStorage } from "@/lib/platform/billing/enforce";
import { recordBlockedUpload, scanUpload } from "@/lib/storage/upload-scan";
import { blobAuth } from "@/lib/storage/blob-token";

/**
 * Shared Vercel Blob core — every `*-storage.ts` module in this codebase
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
  await put(storageKey, body, {
    ...(await blobAuth()),
    access: "private",
    contentType: resolvedContentType,
    addRandomSuffix: false, // the key is already a random UUID — don't let Blob mangle it further
  });
  await meterStorage(body.byteLength, { source: folder, detail: `${contentType || "file"} · ${filename}` });
  return { storageKey, contentType: resolvedContentType, size: body.byteLength };
}

/** Returns `null` on a clean "not found"; throws on any other failure (auth error, outage, ...) so that never gets silently mapped to a 404. */
export async function getObject(storageKey: string): Promise<GetResult | null> {
  const result = await get(storageKey, { ...(await blobAuth()), access: "private" });
  if (!result || result.statusCode !== 200 || !result.stream) return null;
  return { stream: result.stream, contentType: result.blob.contentType };
}

export async function deleteObject(storageKey: string | null | undefined): Promise<void> {
  if (!storageKey) return;
  // Size first (best effort) so the storage meter can be credited back.
  const size = await head(storageKey, await blobAuth()).then((b) => b.size, () => 0);
  let deleted = true;
  await del(storageKey, await blobAuth()).catch(() => {
    deleted = false;
  });
  if (deleted && size > 0) await meterStorage(-size, { source: storageKey.split("/")[0] || "files", detail: `deleted ${storageKey.split("/").slice(1).join("/")}` });
}
