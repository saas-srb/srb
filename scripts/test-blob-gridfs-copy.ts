/**
 * The Blob -> database copier when the file backend is GridFS and the ONLY Blob token is the one pasted in the Console, on a throwaway database
 * with a fake Blob store (no network).
 *   MONGODB_URI=mongodb://127.0.0.1:27017/zz_throwaway_gridcopy_$(date +%s) \
 *     npx --yes tsx --require ./scripts/lib/next-server-shims.cjs scripts/test-blob-gridfs-copy.ts
 */
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";

if (!/zz_throwaway/.test(process.env.MONGODB_URI ?? "")) { console.error("MONGODB_URI must name a throwaway database"); process.exit(2); }
process.env.PLATFORM_ENCRYPTION_KEY = randomBytes(32).toString("base64");
delete process.env.FILE_BACKEND;
delete process.env.BLOB_READ_WRITE_TOKEN;
(((globalThis as unknown as { __keyring: { loaded: unknown } }).__keyring ??= { loaded: null }).loaded) = { state: "unavailable", keys: [], action: null, message: null, at: Date.now() + 1e12 };

let passed = 0;
const failures: string[] = [];
async function check(name: string, fn: () => Promise<void>) {
  try { await fn(); passed++; console.log("  ✓", name); } catch (e) { failures.push(name); console.log("  ✗", name, "\n   ", e instanceof Error ? e.message : e); }
}

(async () => {
  const { clientPromise } = await import("../src/lib/mongodb");
  const copier = await import("../src/lib/storage/blob-to-gridfs");
  const blob = await import("../src/lib/storage/blob");
  const { saveConfig } = await import("../src/lib/platform/config/store");
  const db = (await clientPromise).db();
  await db.dropDatabase();

  // The old Blob store: 3 files. The data refers to 5 (two were never in Blob).
  const store = new Map<string, string>([["resumes/a.pdf", "AAAA"], ["resumes/b.pdf", "BB"], ["cv/c.pdf", "CCCCCC"]]);
  const source = {
    list: async (cursor: string | null, limit: number) => { const keys = [...store.keys()].sort(); const from = cursor ? Number(cursor) : 0; return { blobs: keys.slice(from, from + limit).map((p) => ({ pathname: p, size: store.get(p)!.length })), cursor: from + limit < keys.length ? String(from + limit) : null }; },
    head: async (p: string) => (store.has(p) ? { size: store.get(p)!.length } : null),
    get: async (p: string) => (store.has(p) ? { body: new TextEncoder().encode(store.get(p)!), contentType: "application/pdf" } : null),
    put: async () => { throw new Error("the old store is never written to"); },
  };
  await db.collection("career_applications").insertMany([
    { companyId: "c1", resume: { storageKey: "resumes/a.pdf" } }, { companyId: "c1", resume: { storageKey: "resumes/b.pdf" } }, { companyId: "c2", resume: { storageKey: "cv/c.pdf" } },
    { companyId: "c2", resume: { storageKey: "resumes/gone1.pdf" } }, { companyId: "c3", resume: { storageKey: "resumes/gone2.pdf" } },
  ] as never[]);

  await check("pasting the only Blob token (backend = database) starts a resumable copy that fills the database", async () => {
    assert.equal((await copier.legacyCopyStatus()).state, "no-blob");
    assert.ok((await saveConfig({ BLOB_READ_WRITE_TOKEN: "vercel_blob_rw_pasted_1234" }, "tester")).ok);
    await copier.ensureLegacyCopy(true);
    const view = await copier.runLegacyCopyTick(30_000, { source });
    assert.equal(view.state, "done");
    assert.equal(view.listed, 3);
    assert.equal(view.inDatabase, 3);
    assert.equal(view.remaining, 0);
    const grid = await blob.gridStore();
    assert.equal((await grid.head("resumes/b.pdf"))?.size, 2);
    assert.equal(store.size, 3, "nothing was deleted from the old store");
  });

  await check("served from the database afterwards (no Blob needed)", async () => {
    const got = await blob.getObject("resumes/a.pdf");
    assert.ok(got);
    assert.equal(Buffer.from(await new Response(got!.stream).arrayBuffer()).toString(), "AAAA");
  });

  await check("referenced files that exist nowhere are reported per storage key (not silent), with a CSV", async () => {
    const view = await copier.legacyCopyStatus();
    assert.equal(view.missing, 2);
    const csv = await copier.missingFilesCsv();
    assert.match(csv, /resumes\/gone1\.pdf,"career_applications","c2"|"resumes\/gone1\.pdf","career_applications","c2"/);
    assert.match(csv, /resumes\/gone2\.pdf/);
    assert.ok(!csv.includes("resumes/a.pdf"));
  });

  await check("a missing file is a clean null (the download route answers 'file not available'), never a thrown error", async () => {
    delete process.env.BLOB_READ_WRITE_TOKEN;
    await db.collection("platform_settings").updateOne({ _id: "platform_config" as never }, { $unset: { "values.BLOB_READ_WRITE_TOKEN": "" } });
    (globalThis as unknown as { __platformConfig?: { at: number } }).__platformConfig && ((globalThis as unknown as { __platformConfig: { at: number } }).__platformConfig.at = 0);
    assert.equal(await blob.getObject("resumes/gone1.pdf"), null);
  });

  await db.dropDatabase();
  (await clientPromise).close();
  console.log(`\n${passed} passed${failures.length ? `, ${failures.length} failed: ${failures.join("; ")}` : ""}`);
  process.exit(failures.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
