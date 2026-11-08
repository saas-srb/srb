/**
 * The upload safety check: what it refuses (programs, macros, scripts, EICAR, bad archives, PDFs that launch programs) and, as important,
 * what it lets through (ordinary PDFs, images, Office files, text, archives). Throwaway database, dropped at the end.
 *
 *   MONGODB_URI=mongodb://127.0.0.1:27017/scan_test_$(date +%s) \
 *     npx --yes tsx --require ./scripts/lib/next-server-shims.cjs scripts/test-upload-scan.ts
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import JSZip from "jszip";
import { clientPromise, getPlatformDb } from "@/lib/platform/tenancy/platform-db";
import { runAsCompany } from "@/lib/platform/tenancy/context";
import { isBillingLimitError } from "@/lib/platform/billing/enforce";
import { putObject } from "@/lib/storage/blob";
import { recentBlockedUploads, scanUploadBuiltIn } from "@/lib/storage/upload-scan";

let passed = 0;
async function check(name: string, fn: () => Promise<void> | void) {
  await fn();
  passed++;
  console.log(`  ✓ ${name}`);
}
const scan = (filename: string, body: Buffer | string, contentType = "application/octet-stream") => scanUploadBuiltIn({ filename, contentType, body: Buffer.isBuffer(body) ? body : Buffer.from(body) });
const refused = async (filename: string, body: Buffer | string, why: RegExp) => {
  const r = await scan(filename, body);
  assert.ok(!r.ok, `${filename} should be refused`);
  if (!r.ok) assert.match(r.reason, why);
};
const allowed = async (filename: string, body: Buffer | string) => assert.ok((await scan(filename, body)).ok, `${filename} should be allowed`);

const pe = () => {
  const b = Buffer.alloc(256);
  b.write("MZ", 0);
  b.writeUInt32LE(128, 0x3c);
  b.write("PE\0\0", 128, "latin1");
  return b;
};
const zipOf = async (files: Record<string, string>) => {
  const z = new JSZip();
  for (const [n, c] of Object.entries(files)) z.file(n, c);
  return z.generateAsync({ type: "nodebuffer" });
};

async function main() {
  const pdb = await getPlatformDb();
  if (!/test/.test(pdb.databaseName)) throw new Error(`Refusing to run against "${pdb.databaseName}"`);

  await check("programs are refused by name and by their bytes (a renamed program too)", async () => {
    await refused("setup.exe", "anything", /programs, scripts/);
    await refused("invoice.pdf.exe", "anything", /programs, scripts/);
    await refused("report.pdf", pe(), /program/);
    await refused("notes.txt", Buffer.from([0x7f, 0x45, 0x4c, 0x46, 2, 1, 1, 0]), /program/);
    await refused("run.txt", "#!/bin/sh\nrm -rf /\n", /program/);
    await refused("cleanup.ps1", "Get-Process", /programs, scripts/);
  });
  await check("the standard antivirus test file is refused", async () => {
    await refused("eicar.txt", "X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*", /EICAR/);
  });
  await check("macro documents are refused: by extension, inside a new-format file, and in an old-format file", async () => {
    await refused("budget.xlsm", "x", /macro-enabled/);
    await refused("budget.xlsx", await zipOf({ "[Content_Types].xml": "<x/>", "xl/vbaProject.bin": "VBA" }), /macros/);
    const ole = Buffer.concat([Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), Buffer.alloc(100), Buffer.from("_VBA_PROJECT_CUR", "latin1")]);
    await refused("old.xls", ole, /macros/);
  });
  await check("archives that hold programs, or are built to blow up, are refused", async () => {
    await refused("files.zip", await zipOf({ "readme.txt": "hi", "tools/setup.exe": "x" }), /program or script/);
    const many: Record<string, string> = {};
    for (let i = 0; i < 10_001; i++) many[`f${i}.txt`] = "";
    await refused("many.zip", await zipOf(many), /too many files/);
  });
  await check("PDFs that launch programs, web pages and scripted images are refused", async () => {
    await refused("a.pdf", "%PDF-1.4\n1 0 obj << /Type /Action /S /Launch /F (cmd.exe) >> endobj", /launch a program/);
    await refused("page.txt", "<!DOCTYPE html><html><body>hi</body></html>", /web page/);
    await refused("logo.svg", '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>', /carries script/);
    await refused("logo.svg", '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"></svg>', /carries script/);
  });
  await check("ordinary files go through", async () => {
    await allowed("report.pdf", "%PDF-1.7\n1 0 obj << /Type /Catalog >> endobj\n%%EOF");
    await allowed("photo.png", Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]));
    await allowed("photo.jpg", Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]));
    await allowed("data.csv", "name,email\nAsha,asha@example.com\n");
    await allowed("notes.txt", "MZ is just two letters here.\n");
    await allowed("logo.svg", '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="red"/></svg>');
    await allowed("letter.docx", await zipOf({ "[Content_Types].xml": "<x/>", "word/document.xml": "<w:document/>" }));
    await allowed("photos.zip", await zipOf({ "a.txt": "a", "pics/b.txt": "b" }));
    await allowed("voice.mp3", Buffer.from([0x49, 0x44, 0x33, 3, 0, 0, 0, 0, 0, 0]));
  });
  await check("the real storage path refuses before anything is stored, with a message the products already show, and records it", async () => {
    const A = randomUUID();
    await pdb.collection("companies").insertOne({ _id: A as never, slug: "alpha", name: "Alpha", status: "active", isPlatformOwner: false, createdAt: new Date(), updatedAt: new Date() });
    await runAsCompany(A, async () => {
      let err: unknown;
      await putObject("docs", `${randomUUID()}.exe`, pe(), "application/octet-stream").catch((e) => (err = e));
      assert.ok(isBillingLimitError(err), "a friendly error");
      assert.equal((err as { status: number }).status, 422);
      assert.match((err as Error).message, /^This file can't be uploaded/);
      const rows = await recentBlockedUploads();
      assert.equal(rows.length, 1);
      assert.equal(rows[0].folder, "docs");
    });
  });

  console.log(`${passed} checks passed`);
  await (await clientPromise).db().dropDatabase();
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
