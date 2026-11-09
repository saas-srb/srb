import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { getDb, getPlatformDb } from "../src/lib/mongodb";
import { runAsCompany } from "../src/lib/platform/tenancy/context";
import { DEFAULT_PAGE, parseDoc, type PBDoc } from "../src/lib/products/playbook-ai/doc";
import {
  createDocument, getDocument, getDocumentVersion, resetPbDocumentIndexes, setStatusPolicy, transitionDocument,
} from "../src/lib/products/playbook-ai/documents";
import { resetPbVersionIndexes } from "../src/lib/products/playbook-ai/versions";
import { listPbAudit, resetPbAuditIndexes } from "../src/lib/products/playbook-ai/pb-audit";
import { NEUTRAL_STATUS_POLICY } from "../src/lib/products/playbook-ai/status";
import {
  MAX_PAGES, exportDocument, exportFilename, sealIssuedVersion, setSealedExportStore, setTemplateReviewLookup, type SealedExportStore,
} from "../src/lib/products/playbook-ai/exports-store";
import type { PbActor } from "../src/lib/products/playbook-ai/documents-types";

// Runs only against a throwaway database: MONGODB_URI=mongodb://127.0.0.1:27017/zz_throwaway_<n>. The blob store is replaced by memory.
const t = async (name: string, fn: () => Promise<void> | void) => { await fn(); console.log("  ✓", name); };
const actor = (id: string, roles: string[], name: string): PbActor => ({ id, name, email: `${name.toLowerCase()}@co.test`, roles, permissionOverrides: null });
const ann = actor("u_ann", ["sop_author"], "Ann"), ann2 = actor("u_ann2", ["sop_author"], "Anna"), mona = actor("u_mona", ["sop_manager"], "Mona"), adam = actor("u_adam", ["sop_admin"], "Adam"), emma = actor("u_emma", ["sop_employee"], "Emma");
const ok = <T extends { ok: boolean }>(r: T): Extract<T, { ok: true }> => { assert.equal(r.ok, true, JSON.stringify(r)); return r as Extract<T, { ok: true }>; };
const bad = <T extends { ok: boolean }>(r: T, code: string) => { assert.equal(r.ok, false, "expected a failure"); const e = (r as unknown as { error: { code: string; message: string } }).error; assert.equal(e.code, code, JSON.stringify(e)); return e; };
const mk = (inline: unknown[], extra: unknown[] = []): PBDoc => {
  const r = parseDoc({ schemaVersion: 1, lang: "en", page: DEFAULT_PAGE, header: [], footer: [], body: [{ type: "heading", level: 1, content: [{ type: "text", text: "Letter" }] }, { type: "paragraph", content: inline }, ...extra] }, { assignIds: true });
  if (!r.ok) throw new Error(JSON.stringify(r.issues));
  return r.doc;
};
const txt = (s: string) => ({ type: "text", text: s });

class MemoryStore implements SealedExportStore {
  blobs = new Map<string, Buffer>(); puts = 0; gets = 0; deletes = 0;
  async put(key: string, b: Buffer) { this.puts++; this.blobs.set(key, b); }
  async get(key: string) { this.gets++; return this.blobs.get(key) ?? null; }
  async delete(key: string) { this.deletes++; this.blobs.delete(key); }
}

(async () => {
  await t("filename rules: {docNumber}-{title}-v{n}.ext, safe everywhere (pure)", () => {
    assert.equal(exportFilename({ docNumber: "OFR/2026-27/0007", title: "Offer letter – Ravi Kumar", version: 3, ext: "pdf", draft: false }), "OFR-2026-27-0007-Offer-letter-Ravi-Kumar-v3.pdf");
    assert.equal(exportFilename({ docNumber: null, title: "Draft NDA", version: null, ext: "docx", draft: true }), "DRAFT-Draft-NDA.docx");
    assert.equal(exportFilename({ docNumber: null, title: "a/b\\c:d*e?f\"g<h>i|j", version: 1, ext: "pdf", draft: false }), "a-b-c-d-e-f-g-h-i-j-v1.pdf");
    assert.equal(exportFilename({ docNumber: null, title: "../../etc/passwd", version: 2, ext: "pdf", draft: false }), "etc-passwd-v2.pdf");
    assert.equal(exportFilename({ docNumber: null, title: "???", version: null, ext: "pdf", draft: false }), "document.pdf");
    assert.ok(exportFilename({ docNumber: "N".repeat(80), title: "T".repeat(300), version: 99, ext: "pdf", draft: false }).length <= 125);
    assert.match(exportFilename({ docNumber: null, title: "नमस्ते", version: 1, ext: "pdf", draft: false }), /^[A-Za-z0-9._-]+$/);
  });

  await t("route and config are wired (static): withTransport, maxDuration, rate limit, fonts traced", () => {
    const root = path.resolve(__dirname, "..");
    const route = readFileSync(path.join(root, "src/app/(products)/api/playbook-ai/documents/[id]/export/route.ts"), "utf8");
    assert.match(route, /export const GET = withTransport\(handleGET\)/);
    assert.match(route, /export const maxDuration = \d+/);
    assert.match(route, /userRateLimit\("pb-export"/);
    assert.match(route, /attachment; filename=/);
    assert.match(readFileSync(path.join(root, "next.config.ts"), "utf8"), /"\/api\/playbook-ai\/\*\*": \["\.\/src\/lib\/fonts\/noto\/\*"\]/);
  });

  const db0 = await runAsCompany("co_a", () => getDb());
  assert.ok(db0.databaseName.startsWith("zz_throwaway_"), "refusing: not a throwaway database");
  await (await getPlatformDb()).dropDatabase();
  resetPbDocumentIndexes(); resetPbVersionIndexes(); resetPbAuditIndexes();
  setStatusPolicy(NEUTRAL_STATUS_POLICY);
  const store = new MemoryStore();
  setSealedExportStore(store);

  let issuedId = "";
  await runAsCompany("co_a", async () => {
    const db = await getDb();
    await db.collection("hrms_company").insertOne({ _id: "org", name: "Acme Pvt Ltd", legalName: "Acme Private Limited", addressLine1: "12 MG Road", addressLine2: "", city: "Pune", state: "Maharashtra", postalCode: "411001", country: "India", email: "", phone: "", website: "", pan: "", gstin: "", cin: "", tan: "", pfEstablishmentCode: "", esiEstablishmentCode: "", lin: "", ptRegistration: "", signatoryName: "", signatoryDesignation: "", payslipNote: "", updatedAt: new Date(), updatedBy: null } as never);

    let draftId = "";
    await t("a draft exports as PDF and Word, always watermarked DRAFT, nothing stored; unfilled values do not block", async () => {
      const d = ok(await createDocument(ann, { title: "Offer for Ravi", pbdoc: mk([txt("Dear "), { type: "var", key: "employee.name" }, txt(" at "), { type: "var", key: "company.name" }]) })).document;
      draftId = d._id;
      const pdf = ok(await exportDocument(ann, { id: draftId, format: "pdf" })).file;
      assert.equal(pdf.bytes.subarray(0, 5).toString(), "%PDF-");
      assert.equal(pdf.watermark, "DRAFT"); assert.equal(pdf.sealed, false);
      assert.match(pdf.filename, /^DRAFT-Offer-for-Ravi\.pdf$/);
      assert.equal(pdf.contentType, "application/pdf");
      const docx = ok(await exportDocument(ann, { id: draftId, format: "docx", version: "draft" })).file;
      assert.equal(docx.bytes.subarray(0, 2).toString(), "PK");
      assert.equal(docx.watermark, "DRAFT");
      assert.equal(store.puts, 0, "a draft is never stored");
      assert.equal(pdf.sha256.length, 64);
    });

    await t("an unreviewed template marks the draft UNREVIEWED (hook for A9)", async () => {
      setTemplateReviewLookup(async () => false);
      const f = ok(await exportDocument(ann, { id: draftId, format: "pdf" })).file;
      assert.equal(f.watermark, "UNREVIEWED");
      setTemplateReviewLookup(async () => null);
    });

    await t("permission: no EXPORT right, no access to the document, or no such version", async () => {
      bad(await exportDocument(emma, { id: draftId, format: "pdf" }), "forbidden");
      bad(await exportDocument(ann2, { id: draftId, format: "pdf" }), "not_found");
      bad(await exportDocument(ann, { id: "nope", format: "pdf" }), "not_found");
      bad(await exportDocument(ann, { id: draftId, format: "pdf", version: 9 }), "not_found");
      bad(await exportDocument(ann, { id: draftId, format: "xls" as never }), "invalid");
      ok(await exportDocument(mona, { id: draftId, format: "pdf" })); // a manager sees every document
      assert.equal(ok(await getDocument(ann, draftId)).capabilities.export, true);
    });

    await t("every download is audited with format, version, sealed flag and fingerprint", async () => {
      const a = await listPbAudit(adam, { documentId: draftId });
      assert.ok(a.ok);
      const exports = a.items.filter((i) => i.action === "export");
      assert.ok(exports.length >= 4);
      assert.ok(exports.every((e) => (e.metadata as { sha256: string }).sha256.length === 64));
      assert.ok(exports.some((e) => (e.metadata as { format: string }).format === "docx"));
      const blocked = exports.length;
      bad(await exportDocument(emma, { id: draftId, format: "pdf" }), "forbidden");
      const b = await listPbAudit(adam, { documentId: draftId });
      assert.equal(b.ok && b.items.filter((i) => i.action === "export").length, blocked, "a refused download is not recorded as a download");
    });

    await t("issued: rendered ONCE from the snapshot, no watermark, stored with sha256; later downloads serve identical stored bytes", async () => {
      const d = ok(await createDocument(mona, { title: "Welcome Letter", pbdoc: mk([txt("Welcome to "), { type: "var", key: "company.name" }, txt(".")]) })).document;
      issuedId = d._id;
      ok(await transitionDocument(mona, { id: issuedId, transition: "submit" }));
      ok(await transitionDocument(mona, { id: issuedId, transition: "approve" }));
      const iss = ok(await transitionDocument(mona, { id: issuedId, transition: "issue", now: new Date("2026-11-03T05:00:00Z") }));
      const n = iss.document.docNumber!;
      const first = ok(await exportDocument(mona, { id: issuedId, format: "pdf" })).file;
      assert.equal(first.sealed, true); assert.equal(first.watermark, null);
      assert.equal(first.filename, `${n.replace(/\//g, "-")}-Welcome-Letter-v${iss.version!.number}.pdf`);
      assert.equal(store.puts, 1);
      const rec = ok(await getDocumentVersion(mona, issuedId, iss.version!.number)).version;
      assert.equal(rec.exports.pdf!.sha256, first.sha256);
      assert.ok(rec.exports.pdf!.key.startsWith(`playbook-exports/co_a/${issuedId}/v${iss.version!.number}-`));
      // change the company profile: the sealed copy must not change
      await db.collection("hrms_company").updateOne({ _id: "org" } as never, { $set: { name: "Renamed Co", legalName: "Renamed Co" } });
      const again = ok(await exportDocument(mona, { id: issuedId, format: "pdf" })).file;
      assert.equal(store.puts, 1, "not rendered again");
      assert.equal(again.sha256, first.sha256);
      assert.ok(again.bytes.equals(first.bytes), "byte-identical");
      assert.equal(again.sealed, true);
      // Word is sealed separately, once
      const w1 = ok(await exportDocument(mona, { id: issuedId, format: "docx" })).file;
      const w2 = ok(await exportDocument(adam, { id: issuedId, format: "docx" })).file;
      assert.equal(store.puts, 2);
      assert.ok(w1.bytes.equals(w2.bytes));
      // an explicit version number serves the same sealed bytes
      const byNo = ok(await exportDocument(mona, { id: issuedId, format: "pdf", version: iss.version!.number })).file;
      assert.ok(byNo.bytes.equals(first.bytes));
      assert.equal(await sealIssuedVersion(mona, issuedId).then((r) => r.ok && r.sealed.length), 2);
      assert.equal(store.puts, 2, "sealing again changes nothing");
    });

    await t("the sealed bytes are checked on the way out: a tampered or missing copy is never served", async () => {
      const rec = ok(await getDocumentVersion(mona, issuedId, 3)).version;
      const key = rec.exports.pdf!.key;
      const good = store.blobs.get(key)!;
      store.blobs.set(key, Buffer.concat([good, Buffer.from("tamper")]));
      assert.match(bad(await exportDocument(mona, { id: issuedId, format: "pdf" }), "render_failed").message, /does not match/);
      store.blobs.delete(key);
      assert.match(bad(await exportDocument(mona, { id: issuedId, format: "pdf" }), "render_failed").message, /could not be read/);
      store.blobs.set(key, good);
      ok(await exportDocument(mona, { id: issuedId, format: "pdf" }));
    });

    await t("racing first downloads: one sealed copy is kept, everyone gets the same bytes, the losers' copies are deleted", async () => {
      const d = ok(await createDocument(mona, { title: "Race", pbdoc: mk([txt("x")]) })).document;
      ok(await transitionDocument(mona, { id: d._id, transition: "submit" }));
      ok(await transitionDocument(mona, { id: d._id, transition: "approve" }));
      ok(await transitionDocument(mona, { id: d._id, transition: "issue" }));
      const before = store.blobs.size;
      const rs = await Promise.all(Array.from({ length: 4 }, () => exportDocument(mona, { id: d._id, format: "pdf" })));
      const files = rs.filter((r) => r.ok).map((r) => (r as { file: { bytes: Buffer; sha256: string } }).file);
      assert.ok(files.length >= 1);
      assert.ok(rs.every((r) => r.ok || r.error.code === "busy"), "a render is either done or told to wait");
      assert.equal(new Set(files.map((f) => f.sha256)).size, 1);
      const rec = ok(await getDocumentVersion(mona, d._id, 3)).version;
      assert.equal(store.blobs.size, before + 1, "exactly one blob on record");
      assert.ok(store.blobs.has(rec.exports.pdf!.key));
    });

    await t("not-issued versions are always watermarked: an old submit version after a revise, and a revised draft", async () => {
      ok(await transitionDocument(mona, { id: issuedId, transition: "revise" }));
      const draftAgain = ok(await exportDocument(mona, { id: issuedId, format: "pdf" })).file;
      assert.equal(draftAgain.sealed, false); assert.equal(draftAgain.watermark, "DRAFT");
      const submitVersion = ok(await exportDocument(mona, { id: issuedId, format: "pdf", version: 1 })).file;
      assert.equal(submitVersion.watermark, "DRAFT"); assert.equal(submitVersion.sealed, false);
      assert.match(submitVersion.filename, /^.*-Welcome-Letter-v1\.pdf$/);
    });

    await t("the page cap: a document estimated over 120 pages is refused with a clear message, before any rendering", async () => {
      assert.equal(MAX_PAGES, 120);
      const big = mk([txt("start")], Array.from({ length: 900 }, (_, i) => ({ type: "paragraph", content: [txt(`Paragraph ${i}. ` + "Lorem ipsum dolor sit amet, ".repeat(70))] })));
      const d = ok(await createDocument(ann, { title: "Huge", pbdoc: big })).document;
      const t0 = Date.now();
      const e = bad(await exportDocument(ann, { id: d._id, format: "pdf" }), "too_large");
      assert.match(e.message, /120 pages/);
      assert.match(e.message, /split it into parts/i);
      assert.ok(Date.now() - t0 < 10_000, "refused up front, not after a long render");
      bad(await exportDocument(ann, { id: d._id, format: "docx" }), "too_large");
    });
  });

  await runAsCompany("co_b", async () => {
    await t("two companies: another company cannot export or reach sealed copies", async () => {
      bad(await exportDocument(adam, { id: issuedId, format: "pdf" }), "not_found");
      bad(await exportDocument(adam, { id: issuedId, format: "pdf", version: 3 }), "not_found");
      assert.ok([...store.blobs.keys()].every((k) => k.startsWith("playbook-exports/co_a/")));
    });
  });
  setSealedExportStore(null);
  await (await getPlatformDb()).dropDatabase();
  console.log("test-pb-export: all passed");
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
