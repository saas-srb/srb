import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import * as cheerio from "cheerio";
import JSZip from "jszip";
import sharp from "sharp";
import { parseDoc, sequentialIds } from "../src/lib/products/playbook-ai/doc";
import type { PBDoc } from "../src/lib/products/playbook-ai/doc";
import { renderDocx, type DocxOptions } from "../src/lib/products/playbook-ai/doc/render/docx";
import { renderPdf } from "../src/lib/products/playbook-ai/doc/render/pdf";
import { RenderBlockedError } from "../src/lib/products/playbook-ai/doc/render/prepare";
import { OFFER_LISTS, OFFER_VALUES, longDocRaw, minimalRaw, offerLetterRaw } from "./lib/pbdoc-fixtures";

// Needs no database or network. Run with: npx tsx --require ./scripts/lib/next-server-shims.cjs scripts/test-pbdoc-docx.ts
// Word itself is not available here, so the file is checked structurally: every part parses, relationships/ids/styles resolve, the
// page, header/footer, numbering, table, picture, watermark and font parts have the standard shape, and the text equals the PDF's.
let passed = 0;
const t = async (name: string, fn: () => void | Promise<void>) => { await fn(); passed++; console.log("  ✓", name); };
const doc = (raw: unknown): PBDoc => { const r = parseDoc(raw, { assignIds: true, idFactory: sequentialIds() }); if (!r.ok) throw new Error(JSON.stringify(r.issues)); return r.doc; };
const META = { title: "Offer of Employment", author: "Orbit HR", docNumber: "OFR/2026-27/0007", version: "2", dateIso: "2026-11-05" };
const opts = (extra: Partial<DocxOptions> = {}): DocxOptions => ({ meta: META, values: OFFER_VALUES, lists: OFFER_LISTS, ...extra });
const xml = (s: string) => cheerio.load(s, { xml: true });
let poppler = true;
try { execFileSync("pdftotext", ["-v"], { stdio: "ignore" }); } catch { poppler = false; }
const tmp = mkdtempSync(path.join(os.tmpdir(), "pbdocx-"));

async function parts(buf: Buffer) {
  const zip = await JSZip.loadAsync(buf);
  const names = Object.keys(zip.files).filter((n) => !zip.files[n].dir);
  const text = async (n: string) => zip.file(n)!.async("string");
  return { zip, names, text };
}

/** Text a reader sees in a WordprocessingML part, paragraph per line (tabs as one space). */
function paragraphs(s: string): string[] {
  const $ = xml(s);
  const out: string[] = [];
  $("w\\:p").each((_, p) => {
    let line = "";
    $(p).find("w\\:t, w\\:tab, w\\:br").each((__, e) => { line += e.name === "w:t" ? $(e).text() : " "; });
    out.push(line.replace(/\s+/g, " ").trim());
  });
  return out;
}

(async () => {
  const offer = await renderDocx(doc(offerLetterRaw()), opts());
  const P = await parts(offer.buffer);
  const document = await P.text("word/document.xml");
  const D = xml(document);

  console.log("package structure");
  await t("every part is well-formed XML and the package has the standard parts", async () => {
    for (const n of P.names.filter((x) => /\.(xml|rels)$/.test(x))) {
      const s = await P.text(n);
      assert.ok(s.startsWith("<?xml"), `${n} has an XML declaration`);
      assert.ok(xml(s).root().children().length > 0, `${n} parses`);
    }
    for (const must of ["[Content_Types].xml", "_rels/.rels", "word/document.xml", "word/styles.xml", "word/numbering.xml", "word/settings.xml", "word/fontTable.xml", "word/header1.xml", "word/footer1.xml", "docProps/core.xml"]) {
      assert.ok(P.names.includes(must), `missing part ${must}`);
    }
  });
  await t("if python3 with lxml is present, a strict parser also accepts every part", () => {
    try {
      execFileSync("python3", ["-c", "import lxml"], { stdio: "ignore" });
    } catch { console.log("      (python lxml not installed: skipped)"); return; }
    const f = path.join(tmp, "offer.docx");
    writeFileSync(f, offer.buffer);
    const script = "import sys,zipfile\nfrom lxml import etree\nz=zipfile.ZipFile(sys.argv[1])\nn=0\nfor i in z.namelist():\n    if i.endswith('.xml') or i.endswith('.rels'):\n        etree.fromstring(z.read(i)); n+=1\nprint(n)";
    const n = Number(execFileSync("python3", ["-c", script, f], { encoding: "utf8" }).trim());
    assert.ok(n >= 15);
  });
  await t("[Content_Types] declares every part, and every relationship target exists", async () => {
    const ct = xml(await P.text("[Content_Types].xml"));
    const defaults = new Set(ct("Default").map((_, e) => (ct(e).attr("Extension") ?? "").toLowerCase()).get());
    const overrides = new Set(ct("Override").map((_, e) => ct(e).attr("PartName")).get());
    for (const n of P.names) {
      if (n === "[Content_Types].xml") continue;
      assert.ok(overrides.has(`/${n}`) || defaults.has((n.split(".").pop() ?? "").toLowerCase()), `${n} has no content type`);
    }
    for (const relFile of P.names.filter((n) => n.endsWith(".rels"))) {
      const base = relFile.replace(/(^|.*\/)_rels\/[^/]*$/, "$1");
      const r = xml(await P.text(relFile));
      for (const rel of r("Relationship").get()) {
        if (r(rel).attr("TargetMode") === "External") continue;
        const target = r(rel).attr("Target")!;
        const resolved = target.startsWith("/") ? target.slice(1) : path.posix.normalize(`${base}${target}`);
        assert.ok(P.names.includes(resolved), `${relFile}: target ${target} (${resolved}) is missing`);
      }
    }
  });
  await t("document properties carry title, author and the reproducible document date", async () => {
    const core = await P.text("docProps/core.xml");
    assert.ok(core.includes("<dc:title>Offer of Employment</dc:title>") && core.includes("<dc:creator>Orbit HR</dc:creator>"));
    assert.ok(core.includes("2026-11-05T00:00:00Z"));
    assert.ok(!/20(?!26-11-05)\d\d-\d\d-\d\dT\d\d:\d\d:\d\dZ/.test(core), "no wall-clock date");
  });

  console.log("page, styles and numbering");
  await t("page is A4 portrait: w:pgSz 11906 x 16838 twips, margins and header/footer distances from the page settings", () => {
    const sz = D("w\\:sectPr w\\:pgSz");
    assert.equal(sz.length, 1);
    assert.equal(sz.attr("w:w"), "11906");
    assert.equal(sz.attr("w:h"), "16838");
    assert.equal(sz.attr("w:orient"), "portrait");
    const mar = D("w\\:sectPr w\\:pgMar");
    assert.equal(mar.attr("w:top"), "1417"); // 25 mm
    assert.equal(mar.attr("w:bottom"), "1417");
    assert.equal(mar.attr("w:left"), "1134"); // 20 mm
    assert.equal(mar.attr("w:right"), "1134");
    assert.ok(Number(mar.attr("w:header")) > 0 && Number(mar.attr("w:header")) < 1417);
  });
  await t("heading styles exist with keep-with-next and outline levels, and every style the document uses is defined", async () => {
    const S = xml(await P.text("word/styles.xml"));
    const ids = new Set(S("w\\:style").map((_, e) => S(e).attr("w:styleId")).get());
    for (const id of ["Heading1", "Heading2", "Heading3", "Heading4", "Normal"]) assert.ok(ids.has(id), `style ${id}`);
    for (const id of ["Heading1", "Heading2"]) {
      const st = S(`w\\:style[w\\:styleId="${id}"]`);
      assert.equal(st.find("w\\:keepNext").length, 1, `${id} keepNext`);
      assert.equal(st.find("w\\:outlineLvl").length, 1);
    }
    const used = new Set(D("w\\:pStyle").map((_, e) => D(e).attr("w:val")).get());
    for (const u of used) assert.ok(ids.has(u as string), `document uses undefined style ${u}`);
    assert.ok(used.has("Heading1") && used.has("Heading2"));
  });
  await t("every list paragraph points at a numbering definition that exists, with the right format", async () => {
    const N = xml(await P.text("word/numbering.xml"));
    const numIds = new Set(N("w\\:num").map((_, e) => N(e).attr("w:numId")).get());
    const used = D("w\\:numPr w\\:numId").map((_, e) => D(e).attr("w:val")).get();
    assert.ok(used.length >= 6);
    for (const u of used) assert.ok(numIds.has(u as string), `numId ${u} undefined`);
    const formats = N("w\\:lvl w\\:numFmt").map((_, e) => N(e).attr("w:val")).get();
    assert.ok(formats.includes("bullet") && formats.includes("lowerLetter"), `formats: ${formats.join(",")}`);
    // every abstractNum referenced by a num exists
    const abs = new Set(N("w\\:abstractNum").map((_, e) => N(e).attr("w:abstractNumId")).get());
    for (const e of N("w\\:num w\\:abstractNumId").get()) assert.ok(abs.has(N(e).attr("w:val")!));
  });
  await t("each ordered list has its own numbering instance so it restarts at 1 (or at its own start)", async () => {
    const d = doc({ ...minimalRaw(), body: [
      { type: "orderedList", style: "decimal", items: [{ content: [{ type: "paragraph", content: [{ type: "text", text: "a" }] }] }] },
      { type: "paragraph", content: [{ type: "text", text: "between" }] },
      { type: "orderedList", style: "roman", start: 4, items: [{ content: [{ type: "paragraph", content: [{ type: "text", text: "b" }] }] }] },
    ] });
    const r = await parts((await renderDocx(d, opts({ embedFonts: "none" }))).buffer);
    const N = xml(await r.text("word/numbering.xml"));
    const lvls = N("w\\:lvl").map((_, e) => `${N(e).find("w\\:numFmt").attr("w:val")}:${N(e).find("w\\:start").attr("w:val")}`).get();
    assert.ok(lvls.includes("decimal:1") && lvls.includes("lowerRoman:4"), lvls.join(","));
    const docXml = xml(await r.text("word/document.xml"));
    const nums = docXml("w\\:numPr w\\:numId").map((_, e) => docXml(e).attr("w:val")).get();
    assert.equal(nums.length, 2);
    assert.notEqual(nums[0], nums[1], "two lists, two numbering instances");
  });

  console.log("content");
  await t("text: resolved values, Indian formats, clause labels as text, list items, table, signature lines", () => {
    const lines = paragraphs(document);
    const all = lines.join("\n");
    for (const want of ["Offer of Employment", "Contents", "Dear Asha Rao,", "Senior Engineer", "01 Dec 2026", "₹ 18,00,000", "Rupees Eighteen Lakh Only", "Component", "Annual amount", "1. Probation", "1.1 You will be on probation for 6 months", "(a) The company may confirm", "(b) Notice during probation is 15 days.", "2. Confidentiality", "3. Relocation assistance of ₹ 50,000", "Health insurance: Rs 5,00,000 family floater", "Joining formalities", "Relieving letter from Nimbus Labs", "For the Company", "Accepted by the Candidate", "Signature", "Designation"]) {
      assert.ok(all.includes(want), `missing "${want}"`);
    }
    assert.ok(!all.includes("{{") && !all.includes("[input."));
  });
  await t("tables: fixed layout, exact column widths summing to the text width, header row repeats, rows do not split", () => {
    const tbl = D("w\\:tbl").first();
    assert.equal(tbl.find("w\\:tblLayout").attr("w:type"), "fixed");
    const grid = tbl.find("w\\:tblGrid w\\:gridCol").map((_, e) => Number(D(e).attr("w:w"))).get();
    assert.equal(grid.length, 2);
    assert.equal(grid.reduce((a, b) => a + b, 0), 11906 - 2 * 1134);
    assert.ok(Math.abs(grid[0] / (grid[0] + grid[1]) - 0.6) < 0.001);
    const rows = tbl.find("w\\:tr");
    assert.equal(rows.first().find("w\\:tblHeader").length, 1);
    assert.equal(rows.slice(1).find("w\\:tblHeader").length, 0, "only the first row is a header");
    rows.each((_, r) => { assert.equal(D(r).find("w\\:cantSplit").length, 1); });
    assert.equal(tbl.find("w\\:tr").first().find("w\\:tc w\\:shd").length, 2, "header cells shaded");
  });
  await t("signature blocks are visible lines: a rule, a caption and underscore-leader tab lines for name, designation, date", () => {
    assert.ok(D("w\\:pBdr w\\:bottom").length >= 2, "signature rules");
    const leaders = D("w\\:tab[w\\:leader='underscore']").length;
    assert.equal(leaders, 5, "2 signatories: 3 + 2 lines");
    assert.ok(D("w\\:keepNext").length >= 8);
  });
  await t("an explicit page break becomes pageBreakBefore on the next block", () => {
    assert.equal(D("w\\:pageBreakBefore").length, 1);
    const p = D("w\\:pageBreakBefore").closest("w\\:p");
    assert.ok(p.find("w\\:t").text().includes("Please sign and return"));
  });
  await t("the contents list links to bookmarks on the headings (entries, no page numbers)", () => {
    const anchors = D("w\\:hyperlink[w\\:anchor]").map((_, e) => D(e).attr("w:anchor")).get();
    assert.equal(anchors.length, 4);
    const marks = new Set(D("w\\:bookmarkStart").map((_, e) => D(e).attr("w:name")).get());
    for (const a of anchors) assert.ok(marks.has(a as string), `anchor ${a} has no bookmark`);
    const ids = D("w\\:bookmarkStart").map((_, e) => D(e).attr("w:id")).get();
    assert.equal(new Set(ids).size, ids.length, "bookmark ids are unique");
    assert.equal(D("w\\:bookmarkEnd").length, D("w\\:bookmarkStart").length);
  });
  await t("external links become hyperlink relationships", async () => {
    const rels = await P.text("word/_rels/document.xml.rels");
    assert.ok(rels.includes("https://example.com/policies") && rels.includes('TargetMode="External"'));
  });

  console.log("header, footer, watermark and fonts");
  await t("header carries the letterhead text; the footer has the document number and PAGE / NUMPAGES fields", async () => {
    const h = paragraphs(await P.text("word/header1.xml")).join("\n");
    assert.ok(h.includes("ORBIT SOFTWARE PRIVATE LIMITED") && h.includes("CIN: U72900MH2020PTC123456"));
    const fs = await P.text("word/footer1.xml");
    assert.ok(fs.includes("OFR/2026-27/0007"));
    assert.ok(/PAGE/.test(fs) && /NUMPAGES/.test(fs), "page number fields");
    assert.equal(D("w\\:headerReference").length, 1);
    assert.equal(D("w\\:footerReference").length, 1);
  });
  await t("watermark: Word's own text-watermark shape in the header, only when requested", async () => {
    const wm = await renderDocx(doc(offerLetterRaw()), opts({ watermark: "unreviewed", embedFonts: "none" }));
    const hx = await (await parts(wm.buffer)).text("word/header1.xml");
    assert.ok(hx.includes("v:textpath") && hx.includes("UNREVIEWED"), "WordArt text path");
    assert.ok(hx.includes("PowerPlusWaterMarkObject") || hx.includes("WaterMark"), "named like Word's watermark so Word can remove it");
    assert.ok(!(await (await parts(offer.buffer)).text("word/header1.xml")).includes("v:textpath"), "no watermark on a final export");
    const draft = await renderDocx(doc(offerLetterRaw()), opts({ values: { ...OFFER_VALUES, "input.designation": undefined }, allowUnresolved: true, embedFonts: "none" }));
    assert.equal(draft.watermark, "DRAFT");
    const dx = await parts(draft.buffer);
    assert.ok((await dx.text("word/header1.xml")).includes("DRAFT"));
    assert.ok(paragraphs(await dx.text("word/document.xml")).join("\n").includes("[input.designation]"));
  });
  await t("embedded fonts: Noto Sans regular and bold, valid TrueType after de-obfuscation, keys match the font table", async () => {
    const ft = await P.text("word/fontTable.xml");
    const emb = [...ft.matchAll(/<w:embed(Regular|Bold|Italic|BoldItalic) r:id="(rId\d+)" w:fontKey="\{([0-9A-F-]+)\}"/g)];
    assert.deepEqual(emb.map((e) => e[1]), ["Regular", "Bold"]);
    assert.ok(ft.includes('w:name="Noto Sans"'));
    for (const [, , rid, key] of emb) {
      const n = Number(rid.replace("rId", ""));
      const data = Buffer.from(await P.zip.file(`word/fonts/font${n}.odttf`)!.async("nodebuffer"));
      const k = Buffer.from(key.replace(/-/g, ""), "hex").reverse();
      for (let i = 0; i < 32; i++) data[i] ^= k[i % 16];
      assert.deepEqual([...data.subarray(0, 4)], [0x00, 0x01, 0x00, 0x00], "TrueType header after de-obfuscation");
    }
    const none = await renderDocx(doc(minimalRaw()), opts({ embedFonts: "none" }));
    assert.ok(!(await parts(none.buffer)).names.some((n) => n.includes("odttf")));
    const all = await renderDocx(doc(minimalRaw()), opts({ embedFonts: "all" }));
    assert.equal((await parts(all.buffer)).names.filter((n) => n.includes("odttf")).length, 4);
    console.log(`      sizes: none ${Math.round(none.buffer.length / 1024)} KB, regular+bold ${Math.round(offer.buffer.length / 1024)} KB, all ${Math.round(all.buffer.length / 1024)} KB`);
  });
  await t("images and the logo are real pictures with alt text and the model's sizes", async () => {
    const png = await sharp({ create: { width: 400, height: 200, channels: 3, background: "#1e3a5f" } }).png().toBuffer();
    const jpg = await sharp({ create: { width: 300, height: 300, channels: 3, background: "#b45309" } }).jpeg().toBuffer();
    const logo = await sharp({ create: { width: 120, height: 60, channels: 3, background: "#0f766e" } }).png().toBuffer();
    const d = doc({ ...minimalRaw(), body: [
      { type: "image", fileId: "img-png-0001", alt: "Delivery chart", widthPct: 50, align: "center", caption: "Figure 1" },
      { type: "image", fileId: "img-jpg-0001", alt: "Site photo", widthPct: 30, align: "right" },
    ] });
    const r = await renderDocx(d, { meta: META, values: {}, images: { "img-png-0001": png, "img-jpg-0001": jpg }, brand: { logo: { bytes: logo, align: "right", widthMm: 30 }, footerText: "Registered office: Mumbai" }, embedFonts: "none" });
    const x = await parts(r.buffer);
    const media = x.names.filter((n) => n.startsWith("word/media/"));
    assert.ok(media.length >= 3, `media: ${media.join(",")}`);
    const dx = xml(await x.text("word/document.xml"));
    const ext = dx("wp\\:extent").map((_, e) => `${dx(e).attr("cx")}x${dx(e).attr("cy")}`).get();
    // 50% of the 170 mm text width = 85 mm = 321 px at 96 dpi, height half of that.
    assert.equal(ext[0], `${Math.round((85 / 25.4) * 96) * 9525}x${Math.round(((85 / 2) / 25.4) * 96) * 9525}`);
    assert.ok(dx("wp\\:docPr[descr='Delivery chart']").length === 1 && dx("wp\\:docPr[descr='Site photo']").length === 1);
    assert.ok((await x.text("word/header1.xml")).includes("Company logo"));
    assert.ok((await x.text("word/footer1.xml")).includes("Registered office: Mumbai"));
  });

  console.log("blocking rules, parity and reproducibility");
  await t("the same blocking rules as the PDF: missing variables, placeholders, bad images, invalid documents", async () => {
    const fail = async (d: PBDoc, o: DocxOptions) => { try { await renderDocx(d, o); } catch (e) { if (e instanceof RenderBlockedError) return e; throw e; } throw new Error("expected block"); };
    assert.deepEqual((await fail(doc(offerLetterRaw()), opts({ values: { ...OFFER_VALUES, "input.designation": undefined } }))).unresolved.map((u) => u.key), ["input.designation"]);
    const values = { ...OFFER_VALUES } as Record<string, unknown>;
    delete values["input.previous_employer"];
    assert.deepEqual((await fail(doc(offerLetterRaw()), opts({ values: values as never }))).placeholders.map((p) => p.key), ["input.previous_employer"]);
    const withImage = doc({ ...minimalRaw(), body: [{ type: "image", fileId: "missing-img-1", alt: "x", widthPct: 50, align: "left" }] });
    assert.equal((await fail(withImage, opts())).reasons[0].code, "image");
    assert.equal((await fail({ ...doc(minimalRaw()), schemaVersion: 3 } as unknown as PBDoc, opts())).reasons[0].code, "invalid_document");
  });
  await t("parity: the DOCX and the PDF contain the same words in the same order (offer letter and a 14-section contract)", async () => {
    if (!poppler) { console.log("      (poppler not installed: skipped)"); return; }
    const words = (s: string) => s.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
    // Headers and footers repeat on every PDF page and exist once in the DOCX, so the body is compared on its own. Bare numbers are dropped:
    // the PDF's contents list has page numbers, the DOCX's does not (documented difference).
    const bodyOnly = (d: PBDoc): PBDoc => ({ ...d, header: [], footer: [] });
    // List markers are drawn text in the PDF but Word numbering in the DOCX (not part of the XML text), so they are dropped on both sides.
    const noNumbers = (w: string[]) => w.filter((x) => !/^\d+$/.test(x) && !/^[\u2022\u2013]$/.test(x) && !/^[a-z]\.$/.test(x) && !/^[ivx]+\.$/.test(x));
    for (const [label, d, o] of [
      ["offer letter", bodyOnly(doc(offerLetterRaw())), opts()],
      ["contract", bodyOnly(doc(longDocRaw({ sections: 14, paras: 3, tables: true, clauses: 4, toc: true }))), { meta: { title: "MSA", dateIso: "2026-11-05" }, values: {} } as DocxOptions],
    ] as const) {
      const dx = await renderDocx(d, { ...o, embedFonts: "none" });
      const a = noNumbers(words(paragraphs(await (await parts(dx.buffer)).text("word/document.xml")).join(" ")));
      const pdf = await renderPdf(d, o);
      const f = path.join(tmp, `${label.replace(/\W/g, "")}.pdf`);
      writeFileSync(f, pdf.buffer);
      const b = noNumbers(words(execFileSync("pdftotext", ["-layout", f, "-"], { encoding: "utf8" })));
      assert.equal(a.length, b.length, `${label}: word counts differ (docx ${a.length}, pdf ${b.length})`);
      const at = a.findIndex((w, i) => w !== b[i]);
      assert.ok(at === -1, `${label}: sequences differ at word ${at}: docx "${a.slice(at - 2, at + 4).join(" ")}" vs pdf "${b.slice(at - 2, at + 4).join(" ")}"`);
    }
  });
  await t("rendering the same inputs twice gives byte-identical files (fonts re-keyed deterministically)", async () => {
    const again = await renderDocx(doc(offerLetterRaw()), opts());
    assert.ok(again.buffer.equals(offer.buffer), "DOCX bytes differ between runs");
  });
  await t("zip entries carry the fixed document date and no wall-clock time", async () => {
    for (const n of P.names) assert.equal(P.zip.files[n].date.getUTCFullYear(), 2026, n);
  });

  console.log("serverless guards (measured)");
  await t("large documents render within the time, size and memory budget", async () => {
    const cases: [string, ReturnType<typeof longDocRaw>][] = [
      ["27 pages of text", longDocRaw({ sections: 60, paras: 5 })],
      ["~80 pages with tables and clauses", longDocRaw({ sections: 70, paras: 4, tables: true, clauses: 6 })],
    ];
    for (const [label, raw] of cases) {
      const before = process.memoryUsage().rss;
      const t0 = Date.now();
      const r = await renderDocx(doc(raw), { meta: META, values: {}, embedFonts: "regular_bold" });
      const ms = Date.now() - t0;
      console.log(`      ${label}: ${Math.round(r.buffer.length / 1024)} KB, ${ms} ms, rss +${Math.round((process.memoryUsage().rss - before) / 1024 / 1024)} MB`);
      assert.ok(ms < 20_000, `${label} took ${ms} ms`);
    }
  });

  console.log(`\nall ${passed} tests passed`);
})().catch((e) => { console.error(e); process.exit(1); });
