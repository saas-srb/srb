import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { Readable } from "node:stream";
import { MongoClient } from "mongodb";
import { createGridFileStore } from "../src/lib/storage/gridfs";

// Throwaway database only (name must contain zz_throwaway). Run with:
//   GRIDFS_TEST_URI=mongodb://127.0.0.1:27017/zz_throwaway_gridfs_1 npx tsx scripts/test-gridfs.ts
const uri = process.env.GRIDFS_TEST_URI;
if (!uri || !/zz_throwaway/.test(uri)) {
  console.error("Set GRIDFS_TEST_URI to a database whose name contains zz_throwaway");
  process.exit(2);
}
let n = 0;
const t = async (name: string, fn: () => Promise<void>) => {
  await fn();
  n++;
  console.log("  ✓", name);
};
const read = async (s: ReadableStream<Uint8Array>) => Buffer.from(await new Response(s).arrayBuffer());

(async () => {
  const client = await new MongoClient(uri).connect();
  const db = client.db();
  await db.dropDatabase();
  const store = createGridFileStore(db);
  const big = randomBytes(3 * 1024 * 1024 + 123); // several 255 KB chunks
  await t("put, head and get keep bytes, size and content type", async () => {
    await store.put("resumes/a.pdf", big, "application/pdf", { companyId: "c1" });
    assert.deepEqual(await store.head("resumes/a.pdf"), { size: big.length, contentType: "application/pdf" });
    const got = await store.get("resumes/a.pdf");
    assert.ok(got && got.contentType === "application/pdf" && got.size === big.length);
    assert.ok((await read(got.stream)).equals(big));
  });
  await t("a missing key is a clean null", async () => {
    assert.equal(await store.head("nope/x.pdf"), null);
    assert.equal(await store.get("nope/x.pdf"), null);
  });
  await t("streams in (a Readable, not a Buffer) and verifies", async () => {
    await store.put("cv/stream.bin", Readable.from([big.subarray(0, 1000), big.subarray(1000, 600_000)]), "application/octet-stream");
    assert.equal((await store.head("cv/stream.bin"))?.size, 600_000);
  });
  await t("a failed upload leaves no visible file", async () => {
    const bad = new Readable({ read() { this.destroy(new Error("boom")); } });
    await assert.rejects(store.put("cv/broken.bin", bad, "x/y"));
    assert.equal(await store.head("cv/broken.bin"), null);
  });
  await t("writing the same key again replaces it (backups), leaving one revision", async () => {
    await store.put("backups/b.zip", Buffer.from("one"), "application/zip");
    await store.put("backups/b.zip", Buffer.from("second"), "application/zip");
    assert.equal((await store.head("backups/b.zip"))?.size, 6);
    assert.equal(await db.collection("storage.files").countDocuments({ filename: "backups/b.zip" }), 1);
  });
  await t("delete removes files and chunks, and only the named keys", async () => {
    assert.equal(await store.del(["resumes/a.pdf", "nope/none"]), 1);
    assert.equal(await store.head("resumes/a.pdf"), null);
    assert.ok(await store.head("backups/b.zip"));
    const chunks = await db.collection("storage.chunks").countDocuments({});
    const left = await db.collection("storage.files").find({}).toArray();
    assert.ok(left.length >= 2 && chunks > 0);
  });
  await t("indexes are created once and are idempotent", async () => {
    await store.ensureIndexes();
    await store.ensureIndexes();
    const idx = (await db.collection("storage.files").indexes()).map((i) => Object.keys(i.key).join(","));
    assert.ok(idx.includes("filename,uploadDate") && idx.includes("metadata.companyId"));
  });
  await db.dropDatabase();
  await client.close();
  console.log(`\n${n} passed`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
