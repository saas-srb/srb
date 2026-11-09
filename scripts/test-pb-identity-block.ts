import assert from "node:assert/strict";
import { applyBrandToDoc, brandRenderOptions, identityFor } from "../src/lib/products/playbook-ai/brand/apply";
import { DEFAULT_BRAND, validateBrandInput } from "../src/lib/products/playbook-ai/brand/types";
import { DEFAULT_IDENTITY, identityBlockInput } from "../src/lib/products/playbook-ai/brand/identity";
import { BRAND_PRESETS, applyPreset } from "../src/lib/products/playbook-ai/brand/presets";
import { layoutInputFor } from "../src/lib/products/playbook-ai/items-layout";
import { renderPdf } from "../src/lib/products/playbook-ai/doc/render/pdf";
import { renderDocx } from "../src/lib/products/playbook-ai/doc/render/docx";
import type { ContentBlock, PBDoc } from "../src/lib/products/playbook-ai/doc/types";
import { minimalRaw } from "./lib/pbdoc-fixtures";
import { parseDoc } from "../src/lib/products/playbook-ai/doc";

// Run with: MONGODB_URI=mongodb://127.0.0.1:27017/zz_throwaway_pbid npx tsx --require ./scripts/lib/next-server-shims.cjs scripts/test-pb-identity-block.ts
const FULL = { "company.legal_name": "Northwind Demo Private Limited", "company.address": "14 Residency Road, Bengaluru 560025", "company.gstin": "29ABCDE1234F1Z5", "company.cin": "U12345KA2020PTC123456", "company.website": "www.northwinddemo.in", "company.email": "hello@northwinddemo.in", "company.phone": "+91 80 4000 1234" };
const texts = (b: ContentBlock[]) => b.flatMap((x) => (x.type === "paragraph" || x.type === "heading" ? [x.content.map((n) => (n.type === "text" ? n.text : "")).join("")] : x.type === "letterhead" ? [x.name, ...x.address, ...x.details.map((d) => `${d.label}: ${d.value}`)] : []));
let n = 0;
const ok = (c: unknown, m: string) => { assert.ok(c, m); n++; };

// 1. Missing fields are left out together with their labels; no empty labels or placeholders.
const sparse = identityBlockInput({ "company.legal_name": "Acme", "company.gstin": "29X" }, DEFAULT_IDENTITY, { align: "left", hasLogo: false, logoWidthMm: 30 });
ok(sparse && sparse.details.length === 1 && sparse.details[0].label === "GSTIN" && sparse.details[0].value === "29X" && sparse.address.length === 0, "only the filled fields print");
ok(!sparse!.details.some((d) => !d.value.trim()) && !JSON.stringify(sparse).includes("undefined"), "no empty labels");
ok(identityBlockInput({}, DEFAULT_IDENTITY, { align: "left", hasLogo: false, logoWidthMm: 30 }) === null, "nothing to print gives no block");
ok(identityBlockInput(FULL, { ...DEFAULT_IDENTITY, show: false }, { align: "left", hasLogo: false, logoWidthMm: 30 }) === null, "switched off gives no block");
const noPan = identityBlockInput({ ...FULL, "company.pan": "ABCDE1234F" }, DEFAULT_IDENTITY, { align: "left", hasLogo: false, logoWidthMm: 30 });
ok(!JSON.stringify(noPan).includes("PAN"), "PAN is off by default");
const withPan = identityBlockInput({ ...FULL, "company.pan": "ABCDE1234F" }, { ...DEFAULT_IDENTITY, pan: true, cin: false }, { align: "left", hasLogo: false, logoWidthMm: 30 });
ok(JSON.stringify(withPan).includes("ABCDE1234F") && !JSON.stringify(withPan).includes("CIN"), "the toggles control PAN and CIN");

// 2. Validation keeps the switches and defaults old brands.
const v = validateBrandInput({ ...DEFAULT_BRAND, identity: undefined });
ok(v.ok && v.value.identity.show === true, "a brand saved before this feature gets the default (on)");
const v2 = validateBrandInput({ ...DEFAULT_BRAND, identity: { ...DEFAULT_IDENTITY, show: false, gstin: false } });
ok(v2.ok && v2.value.identity.show === false && v2.value.identity.gstin === false, "the switches are saved");

// 3. The document: the block is the first thing on page 1, exactly once; the running header is the name only (the renderers leave it off page 1).
const parsed = parseDoc(minimalRaw(), { assignIds: true });
ok(parsed.ok, "fixture parses");
const doc = (parsed as { ok: true; doc: PBDoc }).doc;
for (const p of [{ id: "classic", ...applyPreset(DEFAULT_BRAND, "classic") }, ...BRAND_PRESETS.map((pr) => ({ id: pr.id, ...applyPreset(DEFAULT_BRAND, pr.id) }))]) {
  const out = applyBrandToDoc(doc, p, FULL, { layout: layoutInputFor({ kind: "document", title: "Test", docTypeId: "ct.test" }) });
  const t = texts(out.body);
  ok(t[0] === FULL["company.legal_name"], `${p.id}: the block is first on page 1`);
  ok(t.filter((x) => x === FULL["company.legal_name"]).length === 1, `${p.id}: the company name is in the body once`);
  ok(out.body.some((b) => b.type === "divider"), `${p.id}: a thin rule closes the block`);
  ok(!JSON.stringify(out.footer).includes("@") && !JSON.stringify(out.footer).includes("northwinddemo"), `${p.id}: no email (or any company detail) in the footer`);
  ok(out.header.length === 0, `${p.id}: no running header on any page`);
  ok(out.page.headerHeightMm === 0 && out.page.margins.top <= 15 && out.page.margins.bottom <= 20, `${p.id}: no header band; the body starts at the top margin (at most 15 mm; bottom at most 20 mm)`);
}
const off = applyBrandToDoc(doc, { ...DEFAULT_BRAND, identity: { ...DEFAULT_IDENTITY, show: false } }, FULL, { layout: layoutInputFor({ kind: "document", title: "Test", docTypeId: "ct.test" }) });
ok(texts(off.body)[0] !== FULL["company.legal_name"] && off.header.length === 0, "switched off: no block and still no header");
// Phone and website are in the block by default, with their labels; missing ones leave no label.
const lines = identityBlockInput(FULL, DEFAULT_IDENTITY, { align: "left", hasLogo: false, logoWidthMm: 30 })!.details.map((d) => `${d.label}: ${d.value}`).join(" / ");
ok(lines.includes("Phone: +91 80 4000 1234") && lines.includes("Website: www.northwinddemo.in") && lines.includes("Email: hello@northwinddemo.in") && lines.includes("GSTIN: 29ABCDE1234F1Z5"), "phone, website and GSTIN are printed");


// 4. Both renderers still produce a file with the block on.
(async () => {
  const branded = applyBrandToDoc(doc, DEFAULT_BRAND, FULL, { layout: layoutInputFor({ kind: "document", title: "Test", docTypeId: "ct.test" }) });
  const ro = { meta: { title: "Test", dateIso: "2026-11-09" }, values: FULL, brand: brandRenderOptions({ settings: DEFAULT_BRAND, logo: null }), allowUnresolved: true };
  const pdf = await renderPdf(branded, ro);
  ok(pdf.buffer.length > 1000 && pdf.pages >= 1, "PDF renders with the block");
  const docx = await renderDocx(branded, ro);
  ok(docx.buffer.length > 1000, "DOCX renders with the block");
  console.log(`identity block: ${n} checks passed`);
})().catch((e) => { console.error(e); process.exit(1); });
