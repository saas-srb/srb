/**
 * Copies every private Vercel Blob object from one store to another, keeping each pathname (the database stores the pathname as
 * `storageKey`, so nothing in the database changes). Pure: it talks to `BlobStoreApi`, so it is tested with fakes; the real
 * adapter and the saved progress are in `blob-migrate-run.ts`.
 *
 * Safe by construction: the old store is only ever read; an object that already exists at the target with the same size is
 * skipped (idempotent, so a re-run costs almost nothing); an existing object with a DIFFERENT size is reported, never overwritten;
 * every copy is verified by size; one failing object never stops the rest; progress is resumable from a list cursor.
 */

export interface BlobObject {
  pathname: string;
  size: number;
}

export interface BlobStoreApi {
  /** One page of objects (`cursor` null = first page). `cursor` in the result is null on the last page. */
  list(cursor: string | null, limit: number): Promise<{ blobs: BlobObject[]; cursor: string | null }>;
  /** Size of the object, or null when it doesn't exist. */
  head(pathname: string): Promise<{ size: number } | null>;
  /** The object's bytes, or null when it doesn't exist. */
  get(pathname: string): Promise<{ body: Uint8Array | ReadableStream<Uint8Array>; contentType: string } | null>;
  /** Writes a private object at exactly `pathname` (no random suffix). */
  put(pathname: string, body: Uint8Array | ReadableStream<Uint8Array>, contentType: string): Promise<void>;
}

export interface BlobMigrationCounts {
  listed: number;
  copied: number;
  skipped: number;
  failed: number;
  bytes: number;
  wouldCopy: number;
}
export const emptyBlobCounts = (): BlobMigrationCounts => ({ listed: 0, copied: 0, skipped: 0, failed: 0, bytes: 0, wouldCopy: 0 });

export interface BlobFailure {
  pathname: string;
  error: string;
}

export interface BlobMigrationProgress {
  cursor: string | null;
  counts: BlobMigrationCounts;
  failures: BlobFailure[];
}

export interface BlobMigrationOptions {
  dryRun: boolean;
  budgetMs: number;
  concurrency?: number;
  pageSize?: number;
  now?: () => number;
  /** Called after each finished page (save progress). */
  onProgress?: (p: BlobMigrationProgress) => Promise<void>;
}

export const MAX_RECORDED_FAILURES = 200;

async function pool<T>(items: T[], size: number, fn: (item: T) => Promise<void>): Promise<void> {
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.max(1, Math.min(size, items.length)) }, async () => {
      while (i < items.length) await fn(items[i++]);
    }),
  );
}

async function copyOne(source: BlobStoreApi, target: BlobStoreApi, o: BlobObject, dryRun: boolean, p: BlobMigrationProgress): Promise<void> {
  const c = p.counts;
  const fail = (error: string) => {
    c.failed++;
    if (p.failures.length < MAX_RECORDED_FAILURES) p.failures.push({ pathname: o.pathname, error });
  };
  try {
    const existing = await target.head(o.pathname);
    if (existing) {
      if (existing.size === o.size) c.skipped++;
      else fail(`Already in the new store with a different size (${existing.size} instead of ${o.size}); not overwritten`);
      return;
    }
    if (dryRun) {
      c.wouldCopy++;
      c.bytes += o.size;
      return;
    }
    const src = await source.get(o.pathname);
    if (!src) return fail("Not found in the old store (deleted since it was listed)");
    await target.put(o.pathname, src.body, src.contentType || "application/octet-stream");
    const after = await target.head(o.pathname);
    if (!after || after.size !== o.size) return fail(`Copy check failed: expected ${o.size} bytes, the new store has ${after ? after.size : "nothing"}`);
    c.copied++;
    c.bytes += o.size;
  } catch (err) {
    fail(err instanceof Error ? err.message : String(err));
  }
}

/** Continues from `progress.cursor` until the end of the old store or the time budget. Returns the updated progress and whether the listing ended. */
export async function migrateBlobs(source: BlobStoreApi, target: BlobStoreApi, progress: BlobMigrationProgress, opts: BlobMigrationOptions): Promise<{ progress: BlobMigrationProgress; ended: boolean }> {
  const now = opts.now ?? Date.now;
  const started = now();
  const p: BlobMigrationProgress = { cursor: progress.cursor, counts: { ...progress.counts }, failures: [...progress.failures] };
  for (;;) {
    if (now() - started >= opts.budgetMs) return { progress: p, ended: false };
    const page = await source.list(p.cursor, opts.pageSize ?? 100);
    await pool(page.blobs, opts.concurrency ?? 5, (o) => copyOne(source, target, o, opts.dryRun, p));
    p.counts.listed += page.blobs.length;
    p.cursor = page.cursor; // moves only after the whole page finished
    await opts.onProgress?.(p).catch(() => {});
    if (page.cursor === null) return { progress: p, ended: true };
  }
}

/** A finished run may offer "Switch to the new store" only when it really copied (not a dry run), reached the end and nothing failed. */
export function canSwitch(run: { dryRun: boolean; ended: boolean; counts: BlobMigrationCounts }): boolean {
  return !run.dryRun && run.ended && run.counts.failed === 0;
}
