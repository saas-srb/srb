import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { runAsCompany } from "../src/lib/platform/tenancy/context";
import { getPlatformDb } from "../src/lib/platform/tenancy/platform-db";
import { PDF_TYPES } from "../src/lib/pdf/catalog";
import { renderSamplePdf } from "../src/lib/pdf/samples";
import { pdfStats, recentPdfActivity, recordPdf } from "../src/lib/pdf/activity";

// A new PDF must not be missed: every function that renders a PDF has to be shown in the library (and made in samples.ts).
function walk(dir: string, out: string[] = []): string[] {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(f)) out.push(p);
  }
  return out;
}
const sources = walk("src").map((f) => [f, readFileSync(f, "utf8")] as const);
const renderers = sources.flatMap(([f, text]) => [...text.matchAll(/export (?:async )?function (render\w*Pdf)\b/g)].map((m) => [m[1], f] as const));
const samples = readFileSync("src/lib/pdf/samples.ts", "utf8");
const missing = renderers.filter(([name, f]) => !f.startsWith("src/lib/pdf/") && !samples.includes(name)).map(([name, f]) => `${name} (${f})`);
// Routes that answer with a PDF that is not one of the company's documents: a file somebody uploaded, or the library's own sample.
const SERVES_UPLOADS = new Set(["src/app/(platform)/api/platform/companies/[id]/reactivation/[reqId]/document/route.ts", "src/app/(products)/api/resolveiq/attachments/route.ts", "src/app/api/pdf-library/preview/[key]/route.ts", "src/app/(platform)/api/platform/pdfs/[key]/preview/route.ts"]);
const routesWithPdf = sources.filter(([f, text]) => f.endsWith("route.ts") && /application\/pdf/.test(text) && !SERVES_UPLOADS.has(f.replace(/\\/g, "/")));
const unrecorded = routesWithPdf.filter(([, text]) => !text.includes("recordPdf(")).map(([f]) => f);
assert.deepEqual(missing, [], `PDF renderers with no sample in the library: ${missing.join(", ")}`);
assert.deepEqual(unrecorded, [], `routes that make a PDF but do not record it: ${unrecorded.join(", ")}`);
console.log(`checked ${renderers.length} PDF renderers and ${routesWithPdf.length} PDF routes against the library`);

// Runs only against a throwaway database: set MONGODB_URI=mongodb://localhost:27017/zz_throwaway_<n>.
(async () => {
  const db = await getPlatformDb();
  assert.ok(db.databaseName.startsWith("zz_throwaway_"), "refusing: not a throwaway database");
  // SelfRun's own billing documents are issued by the platform owner company.
  await db.collection("companies").insertOne({ _id: "owner" as never, isPlatformOwner: true, status: "active", name: "Sample Platform", slug: "sample-platform", createdAt: new Date() });
  const failures: string[] = [];
  let made = 0;
  await runAsCompany("company-a", async () => {
    for (const t of PDF_TYPES) {
      const variants = t.variants?.map((v) => v.key) ?? [undefined];
      for (const v of variants) {
        try {
          const buf = await renderSamplePdf(t.key, v);
          if (t.status !== "active") { assert.equal(buf, null, `${t.key} has no sample`); continue; }
          assert.ok(buf && buf.subarray(0, 5).toString() === "%PDF-" && buf.length > 1500, "valid PDF");
          made++;
        } catch (e) {
          failures.push(`${t.key}${v ? `:${v}` : ""} → ${e instanceof Error ? e.message.split("\n")[0] : e}`);
        }
      }
    }
    await recordPdf({ type: "fms_invoice", ref: "INV-1", by: "a@example.com", role: "staff" });
    await recordPdf({ type: "fms_invoice", ref: "INV-2", by: "a@example.com", role: "staff" });
    await recordPdf({ type: "hrms_payslip", ref: "2026-10", by: "b@example.com", role: "employee" });
    await recordPdf({ type: "not_a_pdf", ref: "x" });
    const stats = await pdfStats();
    assert.equal(stats.fms_invoice.total, 2); assert.equal(stats.hrms_payslip.total, 1); assert.equal(stats.not_a_pdf, undefined);
    assert.equal((await recentPdfActivity({ type: "hrms_payslip" })).entries[0].ref, "2026-10");
  });
  await runAsCompany("company-b", async () => assert.equal(Object.keys(await pdfStats()).length, 0, "another company sees none of it"));
  await db.dropDatabase();
  console.log(`rendered ${made} sample PDFs`);
  if (failures.length) { console.error("FAILED:\n" + failures.join("\n")); process.exit(1); }
  console.log("pdf library tests passed");
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
