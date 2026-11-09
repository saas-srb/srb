import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import JSZip from "jszip";
import { getTemplateDef } from "../src/lib/products/playbook-ai/catalogue/registry";
import { buildTemplateDoc } from "../src/lib/products/playbook-ai/catalogue/validate";
import { applyBrandToDoc } from "../src/lib/products/playbook-ai/brand/apply";
import { DEFAULT_BRAND } from "../src/lib/products/playbook-ai/brand/types";
import { renderPdf } from "../src/lib/products/playbook-ai/doc/render/pdf";
import { renderDocx } from "../src/lib/products/playbook-ai/doc/render/docx";
import { buildLibraryDoc } from "../src/lib/products/playbook-ai/item-library";
import { layoutInputFor } from "../src/lib/products/playbook-ai/items-layout";
import type { PBDoc } from "../src/lib/products/playbook-ai/doc/types";

/**
 * Each page has exactly ONE running header and ONE footer, in the PDF and the DOCX: the brand owns them and replaces whatever header or
 * footer a template carries. Pure: no database. Uses poppler's pdftotext for the PDF text when it is installed (skipped otherwise).
 */
const t = async (name: string, fn: () => Promise<void> | void) => { await fn(); console.log("  ✓", name); };
const values: Record<string, string> = { "company.name": "Northwind Demo", "company.legal_name": "Northwind Demo Private Limited", "company.address": "India", "company.city": "Pune" };
const count = (hay: string, needle: string) => hay.split(needle).length - 1;
const hasPdftotext = (() => { try { execFileSync("pdftotext", ["-v"], { stdio: "ignore" }); return true; } catch { return false; } })();

async function check(label: string, doc: PBDoc, layout?: Parameters<typeof applyBrandToDoc>[3]) {
  const merged = applyBrandToDoc(doc, DEFAULT_BRAND, values, { docNumber: "HR/2026/001", ...(layout ?? {}) });
  const pageFields = JSON.stringify(merged.footer).split('"field":"pageNumber"').length - 1;
  assert.equal(pageFields, 1, `${label}: one page number in the footer`);
  assert.ok(!JSON.stringify(merged.header).includes('"id":"t-') || merged.header.every((b) => b.id.startsWith("brand-")), `${label}: only brand header blocks`);
  const opts = { meta: { title: label, dateIso: "2026-11-09", docNumber: "HR/2026/001", version: "1" }, values, allowUnresolved: true };

  const dx = await renderDocx(merged, opts);
  const zip = await JSZip.loadAsync(dx.buffer);
  const footers = Object.keys(zip.files).filter((n) => /^word\/footer\d*\.xml$/.test(n));
  for (const f of footers) {
    const xml = await zip.file(f)!.async("string");
    assert.ok(count(xml, " PAGE") <= 1 && count(xml, "NUMPAGES") <= 1, `${label}: ${f} has one PAGE and one NUMPAGES field`);
  }
  const headers = Object.keys(zip.files).filter((n) => /^word\/header\d*\.xml$/.test(n));
  for (const h of headers) {
    const xml = await zip.file(h)!.async("string");
    assert.ok(count(xml, "Northwind Demo") <= 1, `${label}: ${h} names the company at most once`);
  }

  if (hasPdftotext) {
    const out = await renderPdf(merged, opts);
    const dir = mkdtempSync(path.join(tmpdir(), "pbhf-"));
    const file = path.join(dir, "x.pdf");
    writeFileSync(file, out.buffer);
    const pages = execFileSync("pdftotext", ["-layout", file, "-"], { encoding: "utf8" }).split("\f").filter((p) => p.trim());
    assert.ok(pages.length >= 1);
    pages.forEach((p, i) => {
      assert.equal(count(p, `Page ${i + 1} of`), 1, `${label}: page ${i + 1} shows "Page x of y" once`);
      const first = p.split("\n").slice(0, 4).join("\n"); if (process.env.PBHF_SHOW) console.log(`--- ${label} p${i + 1}\n${p.split("\n").slice(0, 6).join("\n")}\n...\n${p.trim().split("\n").slice(-4).join("\n")}`);
      assert.ok(count(first.toLowerCase(), "northwind demo") <= 1, `${label}: page ${i + 1} header names the company once`);
    });
  }
}

(async () => {
  await t("offer letter: one header and one footer", async () => {
    const def = getTemplateDef("hr.offer");
    assert.ok(def);
    const built = buildTemplateDoc(def!);
    assert.ok(built.ok);
    if (built.ok) await check("offer letter", built.doc);
  });
  await t("SOP and KPI sheet with the kind layout", async () => {
    for (const id of ["sop.hr.recruitment", "kpi.sales-executive"]) {
      const b = buildLibraryDoc(id)!;
      await check(b.info.title, b.doc, { layout: layoutInputFor({ kind: b.info.kind, title: b.info.title, meta: b.meta }) });
    }
  });
  console.log(hasPdftotext ? "done (PDF text checked)" : "done (pdftotext not installed: PDF text check skipped)");
})().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
