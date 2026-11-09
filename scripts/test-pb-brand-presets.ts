import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { readFileSync } from "node:fs";
import JSZip from "jszip";
import { applyBrandToDoc, brandRenderOptions, loadBrand } from "../src/lib/products/playbook-ai/brand/apply";
import { BRAND_PRESETS, applyPreset } from "../src/lib/products/playbook-ai/brand/presets";
import { DEFAULT_BRAND, validateBrandInput } from "../src/lib/products/playbook-ai/brand/types";
import { renderDocx } from "../src/lib/products/playbook-ai/doc/render/docx";
import { renderPdf } from "../src/lib/products/playbook-ai/doc/render/pdf";
import { buildLibraryDoc } from "../src/lib/products/playbook-ai/item-library";
import type { ZoneBlock } from "../src/lib/products/playbook-ai/doc/types";

/** Brand checks (pure): defaults and every preset validate, resolve with missing company fields without empty labels, and render to PDF and DOCX once. */
const t = async (name: string, fn: () => Promise<void> | void) => { await fn(); console.log("  ✓", name); };
const FULL = { "company.name": "Northwind Demo", "company.legal_name": "Northwind Demo Private Limited", "company.address": "12 Example Road, Pune, India", "company.cin": "U12345MH2020PTC000000", "company.gstin": "27AAAAA0000A1Z5", "company.pan": "AAAAA0000A", "company.tan": "PNEA00000A", "company.email": "hello@example.test", "company.phone": "+91 20 0000 0000", "company.website": "www.example.test" };
const MIN = { "company.name": "Tiny Co" };
const textOf = (zone: ZoneBlock[]): string[] => zone.flatMap((b) => (b.type === "paragraph" ? [b.content.map((n) => (n.type === "text" ? n.text : n.type === "field" ? `<${n.field}>` : "")).join("")] : []));
const hasPdftotext = (() => { try { execFileSync("pdftotext", ["-v"], { stdio: "ignore" }); return true; } catch { return false; } })();

(async () => {
  await t("defaults validate", () => { const v = validateBrandInput(DEFAULT_BRAND); assert.ok(v.ok, JSON.stringify(v)); });
  await t("a colour too light for white paper is refused in plain words", () => {
    const v = validateBrandInput({ ...DEFAULT_BRAND, colors: { primary: "#F5E6A8", secondary: "#B45309" } });
    assert.ok(!v.ok && v.errors.some((e) => /too light/.test(e)));
  });
  for (const p of BRAND_PRESETS) {
    await t(`preset ${p.id}: valid, no empty labels, one header and footer, PDF and DOCX`, async () => {
      const brand = applyPreset(DEFAULT_BRAND, p.id);
      const v = validateBrandInput(brand);
      assert.ok(v.ok, `${p.id}: ${JSON.stringify(v)}`);
      const doc = buildLibraryDoc("sop.hr.leave")!.doc;
      for (const values of [MIN, FULL]) {
        const merged = applyBrandToDoc(doc, brand, values, { docNumber: "HR/1" });
        for (const line of [...textOf(merged.header), ...textOf(merged.footer)]) {
          assert.ok(line.trim() !== "" && !/:\s*$/.test(line.trim()), `${p.id}: empty label in "${line}"`);
        }
        const pages = JSON.stringify(merged.footer).split('"field":"pageNumber"').length - 1;
        assert.equal(pages, 1, `${p.id}: one page number`);
      }
      const merged = applyBrandToDoc(doc, brand, FULL, { docNumber: "HR/1" });
      const loaded = await loadBrand(brand);
      const opts = { meta: { title: "Leave", dateIso: "2026-11-09", docNumber: "HR/1", version: "1" }, values: FULL, brand: brandRenderOptions(loaded), allowUnresolved: true };
      const pdf = await renderPdf(merged, opts);
      assert.ok(pdf.pages >= 1);
      const dx = await renderDocx(merged, opts);
      const zip = await JSZip.loadAsync(dx.buffer);
      for (const f of Object.keys(zip.files).filter((n) => /^word\/footer\d*\.xml$/.test(n))) assert.ok(((await zip.file(f)!.async("string")).match(/ PAGE/g) ?? []).length <= 1, `${p.id}: ${f}`);
      if (hasPdftotext) {
        const dir = mkdtempSync(path.join(tmpdir(), "pbbr-"));
        writeFileSync(path.join(dir, "x.pdf"), pdf.buffer);
        const text = execFileSync("pdftotext", ["-layout", path.join(dir, "x.pdf"), "-"], { encoding: "utf8" });
        const fmt = brand.footer.pageFormat;
        assert.ok(fmt === "x_of_y" ? /Page 1 of/.test(text) : fmt === "x_slash_y" ? /1 \/ \d/.test(text) : true, `${p.id}: page number format`);
        if (brand.footer.confidential) assert.ok(/Confidential/.test(text), `${p.id}: confidential line`);
      }
    });
  }
  await t("brand preview code has no sample or dummy text", () => {
    for (const f of ["src/lib/products/playbook-ai/brand/preview.ts", "src/lib/products/playbook-ai/brand/preview-items.ts", "src/components/products/playbook-ai/brand/BrandForm.tsx", "src/lib/products/playbook-ai/brand/types.ts", "src/lib/products/playbook-ai/brand/presets.ts"]) {
      const text = readFileSync(f, "utf8");
      assert.ok(!/sample item|lorem|ipsum|SAMPLE\/|Sample document|sample text/i.test(text), `${f} contains sample or dummy text`);
    }
  });
  console.log("done");
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
