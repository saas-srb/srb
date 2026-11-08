import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import JSZip from "jszip";
import sharp from "sharp";
import { getDb } from "../src/lib/mongodb";
import { getPlatformDb } from "../src/lib/platform/tenancy/platform-db";
import { runAsCompany } from "../src/lib/platform/tenancy/context";
import { getCompanyDetails, updateCompanyDetails } from "../src/lib/products/talentos/company";
import { parseDoc, sequentialIds } from "../src/lib/products/playbook-ai/doc";
import type { PBDoc } from "../src/lib/products/playbook-ai/doc";
import { renderPdf } from "../src/lib/products/playbook-ai/doc/render/pdf";
import { renderDocx } from "../src/lib/products/playbook-ai/doc/render/docx";
import { DEFAULT_BRAND, validateBrandInput, type BrandSettings } from "../src/lib/products/playbook-ai/brand/types";
import { BRAND_IMAGE_LIMITS, deleteUnreferencedAssets, getBrandAsset, setBrandAssetStore, type BrandAssetStore } from "../src/lib/products/playbook-ai/brand/assets";
import { getBrand, saveBrand, uploadBrandImage } from "../src/lib/products/playbook-ai/brand/store";
import { applyBrandToDoc, brandRenderOptions, brandWatermark, loadBrand } from "../src/lib/products/playbook-ai/brand/apply";
import { loadCompanyValues } from "../src/lib/products/playbook-ai/brand/company-values";
import { renderBrandPreview, renderBrandPreviewDocx } from "../src/lib/products/playbook-ai/brand/preview";
import { PB_COLLECTIONS } from "../src/lib/products/playbook-ai/pb-collections";
import { longDocRaw, minimalRaw } from "./lib/pbdoc-fixtures";

// Runs only against a throwaway database (MONGODB_URI=mongodb://127.0.0.1:27017/zz_throwaway_pbbrand) and an in-memory image store: no real
// provider is contacted. Run with: npx tsx --require ./scripts/lib/next-server-shims.cjs scripts/test-playbook-brand.ts
let passed = 0;
const t = async (name: string, fn: () => void | Promise<void>) => { await fn(); passed++; console.log("  ✓", name); };
const admin = { id: "u_admin", email: "admin@a.example", name: "Admin", roles: ["sop_admin"] };
const reader = { id: "u_reader", email: "r@a.example", name: "Reader", roles: ["sop_employee"] };
const author = { id: "u_author", email: "w@a.example", name: "Author", roles: ["sop_author"] };

const memory = new Map<string, Buffer>();
const store: BrandAssetStore = {
  async put(k, b) { memory.set(k, b); },
  async get(k) { return memory.get(k) ?? null; },
  async delete(k) { memory.delete(k); },
};
const doc = (raw: unknown): PBDoc => { const r = parseDoc(raw, { assignIds: true, idFactory: sequentialIds() }); if (!r.ok) throw new Error(JSON.stringify(r.issues)); return r.doc; };
const png = (w: number, h: number, bg = "#1e3a5f", alpha = false) => sharp({ create: { width: w, height: h, channels: alpha ? 4 : 3, background: alpha ? { r: 30, g: 58, b: 95, alpha: 0.5 } : bg } }).png().toBuffer();
const tmp = mkdtempSync(path.join(os.tmpdir(), "pbbrand-"));
let poppler = true;
try { execFileSync("pdftotext", ["-v"], { stdio: "ignore" }); } catch { poppler = false; }
const pageText = (buf: Buffer, page: number) => { const f = path.join(tmp, "p.pdf"); writeFileSync(f, buf); return execFileSync("pdftotext", ["-f", String(page), "-l", String(page), "-layout", f, "-"], { encoding: "utf8" }); };
const fontsOf = (buf: Buffer) => { const f = path.join(tmp, "f.pdf"); writeFileSync(f, buf); return execFileSync("pdffonts", [f], { encoding: "utf8" }); };

(async () => {
  assert.ok((await getPlatformDb()).databaseName.startsWith("zz_throwaway_"), "refusing: not a throwaway database");
  await (await getPlatformDb()).dropDatabase();
  setBrandAssetStore(store);

  console.log("validation (pure)");
  await t("the defaults are valid, neutral and use the company profile for the letterhead", () => {
    const v = validateBrandInput(DEFAULT_BRAND);
    assert.ok(v.ok, v.ok ? "" : v.errors.join("; "));
    assert.equal(DEFAULT_BRAND.headerLines[0].key, "company.legal_name");
    assert.equal(DEFAULT_BRAND.letterhead, "all");
    assert.equal(DEFAULT_BRAND.page.size, "A4");
  });
  await t("colours must be #RRGGBB, font pairs are the bundled ones, positions and scopes are fixed lists", () => {
    const bad = (o: object) => validateBrandInput({ ...DEFAULT_BRAND, ...o });
    assert.equal(bad({ colors: { primary: "red", secondary: "#B45309" } }).ok, false);
    assert.equal(bad({ colors: { primary: "#12345", secondary: "#B45309" } }).ok, false);
    assert.equal(bad({ colors: { primary: "#1E3A5F;background:url(x)", secondary: "#B45309" } }).ok, false);
    assert.equal(bad({ fontPair: "comic" }).ok, false);
    assert.equal(bad({ fontPair: "classic" }).ok, true);
    assert.equal(bad({ letterhead: "sometimes" }).ok, false);
    assert.equal(bad({ logo: { assetId: null, position: "top", widthMm: 30 } }).ok, false);
    assert.equal(bad({ logo: { assetId: null, position: "left", widthMm: 500 } }).ok, false);
    assert.equal(bad({ logo: { assetId: "../../etc/passwd", position: "left", widthMm: 30 } }).ok, false);
  });
  await t("header and footer lines may read only company or custom values; text is length-limited and control characters refused", () => {
    const lines = (l: unknown[]) => validateBrandInput({ ...DEFAULT_BRAND, headerLines: l });
    assert.equal(lines([{ key: "employee.salary", text: "", bold: false }]).ok, false);
    assert.equal(lines([{ key: "input.secret", text: "", bold: false }]).ok, false);
    assert.equal(lines([{ key: "company.cin", text: "CIN: ", bold: false }, { key: "custom.tagline", text: "", bold: true }]).ok, true);
    assert.equal(lines([{ key: null, text: "", bold: false }]).ok, false);
    assert.equal(lines([{ key: null, text: "x".repeat(121), bold: false }]).ok, false);
    assert.equal(lines([{ key: null, text: "bad\u0007bell", bold: false }]).ok, false);
    assert.equal(lines(Array.from({ length: 7 }, () => ({ key: null, text: "line", bold: false }))).ok, false);
  });
  await t("margins use the same safe limits as documents; watermark words and signatory slots are validated", () => {
    const page = (m: object, z: object = {}) => validateBrandInput({ ...DEFAULT_BRAND, page: { ...DEFAULT_BRAND.page, margins: { ...DEFAULT_BRAND.page.margins, ...m }, ...z } });
    assert.equal(page({ left: 5 }).ok, false);
    assert.equal(page({ left: 51 }).ok, false);
    assert.equal(page({ left: 50, right: 50 }).ok, true);
    assert.equal(page({}, { headerHeightMm: 31 }).ok, false, "header zone must fit the top margin");
    assert.equal(validateBrandInput({ ...DEFAULT_BRAND, page: { ...DEFAULT_BRAND.page, size: "Letter" } }).ok, false);
    assert.equal(validateBrandInput({ ...DEFAULT_BRAND, watermarks: { draft: "", unreviewed: "X" } }).ok, false);
    assert.equal(validateBrandInput({ ...DEFAULT_BRAND, watermarks: { draft: "a".repeat(25), unreviewed: "X" } }).ok, false);
    const sig = (o: object) => validateBrandInput({ ...DEFAULT_BRAND, signatories: [{ id: "sig1", kind: "signature", label: "Director", name: "Asha Rao", designation: "Director", assetId: null, ...o }] });
    assert.equal(sig({}).ok, true);
    assert.equal(sig({ kind: "seal" }).ok, false);
    assert.equal(sig({ label: "" }).ok, false);
    assert.equal(sig({ id: "bad id" }).ok, false);
    assert.equal(validateBrandInput({ ...DEFAULT_BRAND, signatories: [{ id: "a", kind: "stamp", label: "x", name: "", designation: "", assetId: null }, { id: "a", kind: "stamp", label: "y", name: "", designation: "", assetId: null }] }).ok, false);
  });

  console.log("storage, permissions and audit (two companies)");
  let logoA = "";
  await runAsCompany("co_brand_a", async () => {
    const c = await getCompanyDetails();
    const { _id, updatedAt, updatedBy, ...rest } = c;
    void _id; void updatedAt; void updatedBy;
    await updateCompanyDetails({ ...rest, name: "Orbit", legalName: "Orbit Software Private Limited", addressLine1: "Unit 4, Tech Park", city: "Mumbai", state: "Maharashtra", postalCode: "400093", cin: "U72900MH2020PTC123456", gstin: "27AAPFU0939F1ZV", email: "hello@orbit.example" }, "u_admin");

    await t("an unconfigured company gets the neutral defaults", async () => {
      const b = await getBrand();
      assert.equal(b.revision, 0);
      assert.deepEqual(b.colors, DEFAULT_BRAND.colors);
    });
    await t("the company values come from the company profile; empty values are absent", async () => {
      const v = await loadCompanyValues();
      assert.equal(v["company.legal_name"], "Orbit Software Private Limited");
      assert.ok(String(v["company.address"]).includes("Mumbai"));
      assert.equal(v["company.cin"], "U72900MH2020PTC123456");
      assert.equal(v["company.tan"], undefined);
    });
    await t("readers and authors cannot upload images or save the brand; administrators can", async () => {
      const img = await png(300, 120);
      for (const who of [reader, author]) {
        assert.deepEqual(await uploadBrandImage(who, "logo", img), { ok: false, error: "You don't have permission to change the brand." });
        const r = await saveBrand(who, DEFAULT_BRAND);
        assert.equal(r.ok, false);
      }
      assert.equal((await uploadBrandImage(admin, "logo", img)).ok, true);
    });
    await t("images are re-encoded to PNG: JPEG, WebP and GIF accepted, SVG, scripts, empty and oversize refused", async () => {
      const jpg = await sharp({ create: { width: 400, height: 200, channels: 3, background: "#b45309" } }).jpeg().toBuffer();
      const webp = await sharp({ create: { width: 400, height: 200, channels: 3, background: "#0f766e" } }).webp().toBuffer();
      const gif = await sharp({ create: { width: 64, height: 64, channels: 3, background: "#222222" } }).gif().toBuffer();
      for (const [label, b] of [["jpeg", jpg], ["webp", webp], ["gif", gif]] as const) {
        const r = await uploadBrandImage(admin, "logo", b);
        assert.ok(r.ok, `${label}: ${r.ok ? "" : r.error}`);
        if (r.ok) {
          const data = memory.get(r.asset.storageKey)!;
          assert.deepEqual([...data.subarray(0, 4)], [0x89, 0x50, 0x4e, 0x47], `${label} stored as PNG`);
          assert.equal(r.asset.contentType, "image/png");
        }
      }
      const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
      assert.match((await uploadBrandImage(admin, "logo", svg) as { error: string }).error, /SVG and other formats are not accepted/);
      assert.equal((await uploadBrandImage(admin, "logo", Buffer.from("MZ\x90\x00 not an image"))).ok, false);
      assert.equal((await uploadBrandImage(admin, "logo", Buffer.alloc(0))).ok, false);
      assert.match((await uploadBrandImage(admin, "logo", Buffer.alloc(BRAND_IMAGE_LIMITS.maxUploadBytes + 1, 1)) as { error: string }).error, /under 2 MB/);
      const polyglot = Buffer.concat([await png(100, 100), Buffer.from("<script>alert(1)</script>")]);
      const p = await uploadBrandImage(admin, "stamp", polyglot);
      if (p.ok) assert.ok(!memory.get(p.asset.storageKey)!.includes(Buffer.from("<script>")), "trailing bytes are not stored");
      const tiny = await uploadBrandImage(admin, "logo", await png(8, 8));
      assert.equal(tiny.ok, false);
    });
    await t("large images are scaled down to the kind's box, transparency is kept, keys carry the company id", async () => {
      const big = await sharp({ create: { width: 3000, height: 1500, channels: 4, background: { r: 10, g: 20, b: 30, alpha: 0.5 } } }).png().toBuffer();
      const r = await uploadBrandImage(admin, "logo", big);
      assert.ok(r.ok);
      if (!r.ok) return;
      assert.ok(r.asset.widthPx <= 1200 && r.asset.heightPx <= 600, `${r.asset.widthPx}x${r.asset.heightPx}`);
      assert.equal(Math.round((r.asset.widthPx / r.asset.heightPx) * 100), 200, "proportions kept");
      const meta = await sharp(memory.get(r.asset.storageKey)!).metadata();
      assert.equal(meta.hasAlpha, true);
      assert.match(r.asset.storageKey, /^playbook-brand\/co_brand_a\/[0-9a-f-]{36}\.png$/);
      assert.equal(r.asset.sha256.length, 64);
      logoA = r.asset._id;
      const sig = await uploadBrandImage(admin, "signature", big);
      assert.ok(sig.ok && sig.asset.widthPx <= 800 && sig.asset.heightPx <= 300);
    });
    await t("a brand referencing a missing or wrong-kind image is refused", async () => {
      assert.match((await saveBrand(admin, { ...DEFAULT_BRAND, logo: { ...DEFAULT_BRAND.logo, assetId: "does-not-exist-1" } }) as { error: string }).error, /logo image is missing/);
      const stamp = await uploadBrandImage(admin, "stamp", await png(200, 200));
      assert.ok(stamp.ok);
      if (stamp.ok) assert.equal((await saveBrand(admin, { ...DEFAULT_BRAND, logo: { ...DEFAULT_BRAND.logo, assetId: stamp.asset._id } })).ok, false, "a stamp cannot be the logo");
    });
    await t("saving raises the revision, stores the brand, and writes an audit entry naming what changed", async () => {
      const r = await saveBrand(admin, { ...DEFAULT_BRAND, colors: { primary: "#7C2D12", secondary: "#0F766E" }, fontPair: "classic", logo: { assetId: logoA, position: "right", widthMm: 40 }, watermarks: { draft: "Draft copy", unreviewed: "Not reviewed" } });
      assert.ok(r.ok, r.ok ? "" : r.error);
      const b = await getBrand();
      assert.equal(b.revision, 1);
      assert.equal(b.colors.primary, "#7C2D12");
      assert.equal(b.watermarks.draft, "DRAFT COPY", "watermark words are upper-cased");
      assert.equal(b.logo.assetId, logoA);
      const audit = await (await getDb()).collection(PB_COLLECTIONS.audit).find({ action: "brand_change" }).toArray();
      assert.equal(audit.length, 1);
      assert.equal(audit[0].actorId, "u_admin");
      assert.match(String(audit[0].summary), /colours/);
      assert.match(String(audit[0].summary), /font pair/);
      assert.match(String(audit[0].summary), /logo/);
      assert.equal((await saveBrand(admin, b)).ok, true);
      assert.equal((await getBrand()).revision, 2);
    });
    await t("unattached uploads older than the grace period are removed; attached ones never are", async () => {
      const before = memory.size;
      const orphan = await uploadBrandImage(admin, "logo", await png(200, 100, "#ff0000"));
      assert.ok(orphan.ok);
      assert.equal(memory.size, before + 1);
      const b = await getBrand();
      assert.equal(await deleteUnreferencedAssets(new Set([b.logo.assetId!]), 60_000), 0, "inside the grace period nothing is removed");
      const removed = await deleteUnreferencedAssets(new Set([b.logo.assetId!]), 0);
      assert.ok(removed >= 1);
      assert.ok(await getBrandAsset(logoA), "the attached logo survives");
      if (orphan.ok) assert.equal(await getBrandAsset(orphan.asset._id), null);
    });
  });

  await runAsCompany("co_brand_b", async () => {
    await t("another company sees no brand, no images, and cannot use company A's image id", async () => {
      assert.equal((await getBrand()).revision, 0);
      assert.equal(await getBrandAsset(logoA), null, "A's asset id is invisible to B");
      const r = await saveBrand(admin, { ...DEFAULT_BRAND, logo: { ...DEFAULT_BRAND.logo, assetId: logoA } });
      assert.equal(r.ok, false, "B cannot attach A's image");
      assert.equal(await (await getDb()).collection(PB_COLLECTIONS.brandAssets).countDocuments({}), 0);
      assert.equal(await (await getDb()).collection(PB_COLLECTIONS.audit).countDocuments({ action: "brand_change" }), 0);
    });
    await t("company B can save its own brand without touching A's (the fixed _id is per company)", async () => {
      const r = await saveBrand(admin, { ...DEFAULT_BRAND, colors: { primary: "#111827", secondary: "#2563EB" } });
      assert.ok(r.ok);
      assert.equal((await getBrand()).colors.primary, "#111827");
    });
  });
  await runAsCompany("co_brand_a", async () => {
    await t("company A's brand is unchanged by B's save", async () => {
      const b = await getBrand();
      assert.equal(b.colors.primary, "#7C2D12");
      assert.equal(b.revision, 2);
    });
  });
  await t("the raw collection holds one brand document per company under company-prefixed ids", async () => {
    const raw = await (await getPlatformDb()).collection(PB_COLLECTIONS.brand).find({}).toArray();
    const ids = raw.map((d) => String(d._id)).sort();
    assert.deepEqual(ids, ["co_brand_a::main", "co_brand_b::main"]);
  });

  console.log("applying the brand to documents");
  await runAsCompany("co_brand_a", async () => {
    const values = await loadCompanyValues();
    await t("letterhead and footer lines come from the company values and skip empty ones", async () => {
      const b = await getBrand();
      const d = applyBrandToDoc(doc(minimalRaw()), { ...b, headerLines: [...b.headerLines, { key: "company.tan", text: "TAN: ", bold: false }, { key: null, text: "Registered office, Mumbai", bold: false }] }, values, { docNumber: "OFR/2026-27/0007" });
      const text = JSON.stringify(d.header);
      assert.ok(text.includes("Orbit Software Private Limited") && text.includes("CIN: U72900MH2020PTC123456") && text.includes("GSTIN: 27AAPFU0939F1ZV") && text.includes("Registered office, Mumbai"));
      assert.ok(!text.includes("TAN:"), "no TAN on file, so no TAN line");
      assert.ok(JSON.stringify(d.footer).includes("docNumber") && JSON.stringify(d.footer).includes("totalPages"));
      assert.equal(d.header.at(-1)?.type, "divider");
    });
    await t("the document number is left out of the footer until the document has one", async () => {
      const b = await getBrand();
      const d = applyBrandToDoc(doc(minimalRaw()), b, values);
      assert.ok(!JSON.stringify(d.footer).includes("docNumber"));
      assert.ok(JSON.stringify(d.footer).includes("pageNumber"));
      const none = applyBrandToDoc(doc(minimalRaw()), { ...b, footer: { ...b.footer, showPageNumbers: false, showDocNumber: false }, footerLines: [] }, values);
      assert.equal(none.footer.length, 0);
    });
    await t("letterhead 'none' adds no header; the company's margins and zones replace the document's, size and orientation stay", async () => {
      const b = await getBrand();
      const d = applyBrandToDoc(doc(minimalRaw()), { ...b, letterhead: "none", page: { ...b.page, margins: { top: 40, right: 25, bottom: 30, left: 25 }, headerHeightMm: 30 } }, values);
      assert.equal(d.header.length, 0);
      assert.deepEqual(d.page.margins, { top: 40, right: 25, bottom: 30, left: 25 });
      assert.equal(d.page.headerHeightMm, 30);
      assert.equal(d.page.size, "A4");
      assert.equal(d.page.orientation, "portrait");
    });
    await t("the document's own header and footer blocks are kept alongside the letterhead", async () => {
      const own = doc({ ...minimalRaw(), header: [{ type: "paragraph", content: [{ type: "text", text: "Confidential" }] }], footer: [{ type: "paragraph", content: [{ type: "text", text: "Internal use" }] }] });
      const d = applyBrandToDoc(own, await getBrand(), values);
      assert.ok(JSON.stringify(d.header).includes("Confidential") && JSON.stringify(d.footer).includes("Internal use"));
      const ids = [...d.header, ...d.footer, ...d.body].map((b) => b.id);
      assert.equal(new Set(ids).size, ids.length, "unique ids");
    });
    await t("watermark words follow the document state", async () => {
      const b = await getBrand();
      assert.equal(brandWatermark(b, "draft"), "DRAFT COPY");
      assert.equal(brandWatermark(b, "unreviewed"), "NOT REVIEWED");
      assert.equal(brandWatermark(b, "final"), null);
    });
  });

  console.log("both renderers consume the brand; changing it changes the export; another company is unaffected");
  const logoPng = await png(240, 80, "#7c2d12");
  const exportBoth = async (company: string, raw: unknown, withBrand: boolean) => runAsCompany(company, async () => {
    const loaded = await loadBrand();
    const values = await loadCompanyValues();
    const base = doc(raw);
    const d = withBrand ? applyBrandToDoc(base, loaded.settings, values, { docNumber: "MSA/2026-27/0001" }) : base;
    const o = { meta: { title: "Master Services Agreement", docNumber: "MSA/2026-27/0001", dateIso: "2026-11-05" }, values, ...(withBrand ? { brand: brandRenderOptions(loaded) } : {}) };
    return { pdf: (await renderPdf(d, o)).buffer, docx: (await renderDocx(d, o)).buffer, loaded };
  });
  // No header or footer of its own: the letterhead comes only from the brand.
const long = { ...longDocRaw({ sections: 6, paras: 3, tables: true, clauses: 3 }), header: [], footer: [] };
  let aBefore: { pdf: Buffer; docx: Buffer } | null = null;
  let bBefore: { pdf: Buffer; docx: Buffer } | null = null;
  await t("company A (serif headings, red-brown, logo on the right) exports differently from the default brand, in both formats", async () => {
    const a = await exportBoth("co_brand_a", long, true);
    const plain = await exportBoth("co_brand_b", long, false);
    aBefore = a;
    bBefore = await exportBoth("co_brand_b", long, true);
    assert.ok(!a.pdf.equals(plain.pdf) && !a.docx.equals(plain.docx));
    // fonts: Noto Serif headings plus Noto Sans text in the PDF
    const raw = a.pdf.toString("latin1");
    assert.ok(/\/BaseFont\s*\/[A-Z]{6}\+NotoSerif/.test(raw) && /\/BaseFont\s*\/[A-Z]{6}\+NotoSans/.test(raw), "both families embedded");
    if (poppler) {
      const f = fontsOf(a.pdf);
      assert.ok(/NotoSerif-Bold/.test(f) && /NotoSans-Regular/.test(f));
      assert.ok(pageText(a.pdf, 1).includes("Orbit Software Private Limited") && pageText(a.pdf, 1).includes("CIN: U72900MH2020PTC123456"));
    }
    // DOCX: heading style uses Noto Serif, colour from the brand, both families embedded, letterhead in the header part
    const z = await JSZip.loadAsync(a.docx);
    const styles = await z.file("word/styles.xml")!.async("string");
    assert.ok(/w:styleId="Heading1"[\s\S]*?w:rFonts[^>]*Noto Serif/.test(styles), "headings in Noto Serif");
    assert.ok(styles.includes("7C2D12"), "primary colour in heading style");
    const ft = await z.file("word/fontTable.xml")!.async("string");
    assert.ok(ft.includes('w:name="Noto Serif"') && ft.includes('w:name="Noto Sans"'));
    const header = await z.file("word/header1.xml")!.async("string");
    assert.ok(header.includes("Orbit Software Private Limited") && header.includes("CIN: U72900MH2020PTC123456"));
    const plainZip = await JSZip.loadAsync(plain.docx);
    assert.ok(!(await plainZip.file("word/styles.xml")!.async("string")).includes("7C2D12"));
  });
  await t("company B (default font and colours, its own saved brand) is untouched by company A's brand", async () => {
    const b = bBefore!;
    const raw = b.pdf.toString("latin1");
    assert.ok(!/NotoSerif/.test(raw), "B uses no serif font");
    const z = await JSZip.loadAsync(b.docx);
    const styles = await z.file("word/styles.xml")!.async("string");
    assert.ok(!styles.includes("7C2D12"), "A's primary colour does not leak into B");
    assert.ok(!((await z.file("word/header1.xml")?.async("string")) ?? "").includes("Orbit Software Private Limited"), "B has no company profile filled in, so nothing of A's appears");
    assert.ok(!b.pdf.equals(aBefore!.pdf));
  });
  await t("change the brand, export again: the output differs accordingly (colour, font pair, letterhead scope, watermark words)", async () => {
    await runAsCompany("co_brand_a", async () => {
      const before = await exportBoth("co_brand_a", long, true);
      const b = await getBrand();
      // 1. colour only
      assert.ok((await saveBrand(admin, { ...b, colors: { primary: "#14532D", secondary: b.colors.secondary } })).ok);
      const colour = await exportBoth("co_brand_a", long, true);
      assert.ok(!colour.pdf.equals(before.pdf) && !colour.docx.equals(before.docx));
      assert.ok((await (await JSZip.loadAsync(colour.docx)).file("word/styles.xml")!.async("string")).includes("14532D"));
      // 2. font pair back to sans: no serif left
      const b2 = await getBrand();
      assert.ok((await saveBrand(admin, { ...b2, fontPair: "sans" })).ok);
      const sans = await exportBoth("co_brand_a", long, true);
      assert.ok(!/NotoSerif/.test(sans.pdf.toString("latin1")));
      assert.ok(!(await (await JSZip.loadAsync(sans.docx)).file("word/fontTable.xml")!.async("string")).includes("Noto Serif"));
      // 3. letterhead first page only: header text on page 1 and not on page 2 (PDF); titlePage with a first header (DOCX)
      const b3 = await getBrand();
      assert.ok((await saveBrand(admin, { ...b3, letterhead: "first" })).ok);
      const first = await exportBoth("co_brand_a", long, true);
      if (poppler) {
        assert.ok(pageText(first.pdf, 1).includes("CIN: U72900MH2020PTC123456"));
        assert.ok(!pageText(first.pdf, 2).includes("CIN: U72900MH2020PTC123456"), "no letterhead on page 2");
        assert.ok(pageText(first.pdf, 2).includes("Page 2 of"), "the footer still repeats");
      }
      const fz = await JSZip.loadAsync(first.docx);
      const docXml = await fz.file("word/document.xml")!.async("string");
      assert.ok(docXml.includes("<w:titlePg"), "different first page");
      assert.ok(docXml.includes('w:type="first"') && docXml.includes('w:type="default"'));
      // 4. no letterhead
      const b4 = await getBrand();
      assert.ok((await saveBrand(admin, { ...b4, letterhead: "none" })).ok);
      const none = await exportBoth("co_brand_a", long, true);
      if (poppler) assert.ok(!pageText(none.pdf, 1).includes("CIN: U72900MH2020PTC123456"));
      assert.ok(!(await (await JSZip.loadAsync(none.docx)).file("word/header1.xml")?.async("string") ?? "").includes("CIN:"));
      // 5. watermark words
      const b5 = await getBrand();
      assert.ok((await saveBrand(admin, { ...b5, letterhead: "all", watermarks: { draft: "Preview only", unreviewed: "Unchecked" } })).ok);
      const loaded = await loadBrand();
      const wm = await renderPdf(applyBrandToDoc(doc(minimalRaw()), loaded.settings, await loadCompanyValues()), { meta: { title: "t", dateIso: "2026-11-05" }, values: {}, brand: brandRenderOptions(loaded), watermark: brandWatermark(loaded.settings, "draft") });
      if (poppler) {
        const f = path.join(tmp, "wm.pdf");
        writeFileSync(f, wm.buffer);
        assert.ok(execFileSync("pdftotext", ["-raw", f, "-"], { encoding: "utf8" }).replace(/\s+/g, "").includes("PREVIEWONLY"));
      }
    });
  });
  await t("the logo is embedded in the PDF and the DOCX at the brand's width and position", async () => {
    await runAsCompany("co_brand_a", async () => {
      const up = await uploadBrandImage(admin, "logo", logoPng);
      assert.ok(up.ok);
      if (!up.ok) return;
      const b = await getBrand();
      assert.ok((await saveBrand(admin, { ...b, letterhead: "all", logo: { assetId: up.asset._id, position: "center", widthMm: 36 } })).ok);
      const out = await exportBoth("co_brand_a", minimalRaw(), true);
      assert.ok((out.pdf.toString("latin1").match(/\/Subtype\s*\/Image/g) ?? []).length >= 1);
      const z = await JSZip.loadAsync(out.docx);
      assert.ok(Object.keys(z.files).some((n) => n.startsWith("word/media/")));
      const hdr = await z.file("word/header1.xml")!.async("string");
      assert.ok(hdr.includes('w:jc w:val="center"'));
      assert.ok(hdr.includes(`cx="${Math.round((36 / 25.4) * 96) * 9525}"`), "36 mm wide");
    });
  });

  console.log("preview through the real renderer");
  await runAsCompany("co_brand_a", async () => {
    await t("the preview is a real PDF of the sample document with the company's letterhead and the brand being edited", async () => {
      const p = await renderBrandPreview();
      assert.ok(p.pdf.subarray(0, 5).toString() === "%PDF-" && p.pages >= 1 && p.pages <= 2);
      if (poppler) {
        const txt = pageText(p.pdf, 1).replace(/\s+/g, " ");
        assert.ok(txt.includes("Orbit Software Private Limited") && txt.includes("Sample document") && txt.includes("1. Definitions") && txt.includes("SAMPLE/2026-27/0001"));
      }
    });
    await t("an unsaved draft brand previews without being saved, and a watermark state can be previewed", async () => {
      const saved = await getBrand();
      const draft: BrandSettings = { ...saved, colors: { primary: "#6D28D9", secondary: "#DB2777" }, fontPair: "serif", watermarks: { draft: "Trial", unreviewed: "Trial" } };
      const p = await renderBrandPreview(draft, "draft");
      assert.ok(/NotoSerif/.test(p.pdf.toString("latin1")));
      if (poppler) { const f = path.join(tmp, "d.pdf"); writeFileSync(f, p.pdf); assert.ok(execFileSync("pdftotext", ["-raw", f, "-"], { encoding: "utf8" }).replace(/\s+/g, "").includes("TRIAL")); }
      assert.deepEqual((await getBrand()).colors, saved.colors, "nothing was saved");
      assert.equal((await getBrand()).revision, saved.revision);
    });
    await t("a Word preview of the same sample is produced from the same brand", async () => {
      const z = await JSZip.loadAsync(await renderBrandPreviewDocx());
      assert.ok(Object.keys(z.files).includes("word/header1.xml"));
    });
  });

  setBrandAssetStore(null);
  await (await getPlatformDb()).dropDatabase();
  console.log(`\nall ${passed} tests passed`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
