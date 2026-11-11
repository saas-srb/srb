import { GridFSBucket, type Db } from "mongodb";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

/**
 * Files stored in the SAME MongoDB as the data (GridFS). The pathname the rest of the app stores as `storageKey` (for example
 * `resumes/<uuid>.pdf`) is the GridFS filename, so a database that is moved takes its files with it. No size limit beyond the
 * database; content streams in 255 KB chunks (a Buffer is never copied again). Pure over a `Db`, so it is tested on a throwaway database.
 */

export const FILES_BUCKET = "storage";

export interface StoredFileInfo {
  size: number;
  contentType: string;
}

export interface GridFileStore {
  put(key: string, body: Buffer | Readable, contentType: string, meta?: { companyId?: string | null }): Promise<void>;
  head(key: string): Promise<StoredFileInfo | null>;
  get(key: string): Promise<{ stream: ReadableStream<Uint8Array>; contentType: string; size: number } | null>;
  /** Removes every stored revision of each key; returns how many files went. */
  del(keys: string[]): Promise<number>;
  ensureIndexes(): Promise<void>;
}

export function createGridFileStore(db: Db): GridFileStore {
  const bucket = new GridFSBucket(db, { bucketName: FILES_BUCKET });
  const files = db.collection<{ _id: unknown; filename: string; length: number; uploadDate: Date; metadata?: { contentType?: string; companyId?: string | null } }>(`${FILES_BUCKET}.files`);
  let indexed = false;

  const latest = (key: string) => files.findOne({ filename: key }, { sort: { uploadDate: -1 } });
  const ensureIndexes = async () => {
    if (indexed) return;
    indexed = true;
    await Promise.all([files.createIndex({ filename: 1, uploadDate: -1 }).catch(() => {}), files.createIndex({ "metadata.companyId": 1 }, { sparse: true }).catch(() => {})]);
  };

  return {
    ensureIndexes,

    async put(key, body, contentType, meta) {
      await ensureIndexes();
      const upload = bucket.openUploadStream(key, { metadata: { contentType, companyId: meta?.companyId ?? null } });
      try {
        await pipeline(body instanceof Readable ? body : Readable.from([body]), upload);
      } catch (err) {
        await upload.abort().catch(() => {}); // no half file is ever visible: the files document is written only when the upload completes
        throw err;
      }
      // Replace semantics (a backup rewritten under the same key): older revisions of this key go once the new one is complete.
      const stale = await files.find({ filename: key, _id: { $ne: upload.id } } as never, { projection: { _id: 1 } }).toArray();
      for (const f of stale) await bucket.delete(f._id as never).catch(() => {});
    },

    async head(key) {
      const f = await latest(key);
      return f ? { size: f.length, contentType: f.metadata?.contentType ?? "application/octet-stream" } : null;
    },

    async get(key) {
      const f = await latest(key);
      if (!f) return null;
      const stream = Readable.toWeb(bucket.openDownloadStream(f._id as never)) as unknown as ReadableStream<Uint8Array>;
      return { stream, contentType: f.metadata?.contentType ?? "application/octet-stream", size: f.length };
    },

    async del(keys) {
      let n = 0;
      for (const f of await files.find({ filename: { $in: keys } }, { projection: { _id: 1 } }).toArray()) {
        await bucket.delete(f._id as never).then(() => n++, () => {});
      }
      return n;
    },
  };
}
