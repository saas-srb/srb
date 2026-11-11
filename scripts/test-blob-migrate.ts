import assert from "node:assert/strict";
import { canSwitch, emptyBlobCounts, migrateBlobs, type BlobMigrationProgress, type BlobStoreApi } from "../src/lib/storage/blob-migrate";

// Pure: fake stores only. Run with: npx tsx scripts/test-blob-migrate.ts
let n = 0;
const t = async (name: string, fn: () => Promise<void> | void) => {
  await fn();
  n++;
  console.log("  ✓", name);
};

function fakeStore(initial: Record<string, string> = {}, opts: { pageSize?: number; failPut?: Set<string>; corruptPut?: Set<string> } = {}) {
  const files = new Map<string, { body: string; type: string }>(Object.entries(initial).map(([k, v]) => [k, { body: v, type: "application/pdf" }]));
  const calls = { put: 0, get: 0, del: 0, list: 0 };
  const api: BlobStoreApi = {
    async list(cursor, limit) {
      calls.list++;
      const all = [...files.keys()].sort();
      const from = cursor ? Number(cursor) : 0;
      const size = Math.min(limit, opts.pageSize ?? limit);
      return { blobs: all.slice(from, from + size).map((p) => ({ pathname: p, size: files.get(p)!.body.length })), cursor: from + size < all.length ? String(from + size) : null };
    },
    async head(p) {
      const f = files.get(p);
      return f ? { size: f.body.length } : null;
    },
    async get(p) {
      calls.get++;
      const f = files.get(p);
      return f ? { body: new TextEncoder().encode(f.body), contentType: f.type } : null;
    },
    async put(p, body, type) {
      calls.put++;
      if (opts.failPut?.has(p)) throw new Error("put failed");
      const text = new TextDecoder().decode(body as Uint8Array);
      files.set(p, { body: opts.corruptPut?.has(p) ? text.slice(1) : text, type });
    },
  };
  return { api, files, calls };
}
const fresh = (): BlobMigrationProgress => ({ cursor: null, counts: emptyBlobCounts(), failures: [] });
const opts = { dryRun: false, budgetMs: 60_000, pageSize: 2 };
const data = { "resumes/a.pdf": "aaaa", "resumes/b.pdf": "bb", "cv/c.pdf": "cccccc", "cv/d.pdf": "d" };

(async () => {
  await t("copies every object with the same pathname and content type, and verifies size", async () => {
    const src = fakeStore(data, { pageSize: 2 });
    const dst = fakeStore();
    const r = await migrateBlobs(src.api, dst.api, fresh(), opts);
    assert.equal(r.ended, true);
    assert.equal(r.progress.counts.copied, 4);
    assert.equal(r.progress.counts.bytes, 13);
    assert.deepEqual([...dst.files.keys()].sort(), Object.keys(data).sort());
    assert.equal(dst.files.get("cv/c.pdf")!.type, "application/pdf");
    assert.equal(canSwitch({ dryRun: false, ended: true, counts: r.progress.counts }), true);
  });

  await t("never deletes from or writes to the old store", async () => {
    const src = fakeStore(data);
    await migrateBlobs(src.api, fakeStore().api, fresh(), opts);
    assert.equal(src.calls.put, 0);
    assert.equal(src.files.size, 4);
  });

  await t("idempotent: a second run skips everything", async () => {
    const src = fakeStore(data);
    const dst = fakeStore();
    await migrateBlobs(src.api, dst.api, fresh(), opts);
    const putsBefore = dst.calls.put;
    const again = await migrateBlobs(src.api, dst.api, fresh(), opts);
    assert.equal(again.progress.counts.skipped, 4);
    assert.equal(again.progress.counts.copied, 0);
    assert.equal(dst.calls.put, putsBefore);
  });

  await t("dry run copies nothing and cannot be switched to", async () => {
    const dst = fakeStore();
    const r = await migrateBlobs(fakeStore(data).api, dst.api, fresh(), { ...opts, dryRun: true });
    assert.equal(dst.calls.put, 0);
    assert.equal(r.progress.counts.wouldCopy, 4);
    assert.equal(canSwitch({ dryRun: true, ended: r.ended, counts: r.progress.counts }), false);
  });

  await t("resumable: stops at the budget with a cursor, continues from it", async () => {
    let clock = 0;
    const src = fakeStore(data, { pageSize: 2 });
    const dst = fakeStore();
    const first = await migrateBlobs(src.api, dst.api, fresh(), { ...opts, budgetMs: 100, now: () => clock, onProgress: async () => void (clock += 150) });
    assert.equal(first.ended, false);
    assert.equal(first.progress.counts.copied, 2);
    assert.equal(first.progress.cursor, "2");
    const second = await migrateBlobs(src.api, dst.api, first.progress, opts);
    assert.equal(second.ended, true);
    assert.equal(second.progress.counts.copied, 4);
    assert.equal(second.progress.counts.listed, 4);
  });

  await t("failures are isolated and block the switch", async () => {
    const dst = fakeStore({}, { failPut: new Set(["resumes/b.pdf"]), corruptPut: new Set(["cv/c.pdf"]) });
    const r = await migrateBlobs(fakeStore(data).api, dst.api, fresh(), opts);
    assert.equal(r.progress.counts.copied, 2);
    assert.equal(r.progress.counts.failed, 2);
    assert.match(r.progress.failures.find((f) => f.pathname === "cv/c.pdf")!.error, /Copy check failed/);
    assert.equal(canSwitch({ dryRun: false, ended: r.ended, counts: r.progress.counts }), false);
  });

  await t("an existing object of a different size is reported, never overwritten", async () => {
    const dst = fakeStore({ "resumes/a.pdf": "OLDER-DIFFERENT" });
    const r = await migrateBlobs(fakeStore(data).api, dst.api, fresh(), opts);
    assert.equal(r.progress.counts.failed, 1);
    assert.equal(dst.files.get("resumes/a.pdf")!.body, "OLDER-DIFFERENT");
  });

  console.log(`\n${n} passed`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
