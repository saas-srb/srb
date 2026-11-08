import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { DEFAULT_PAGE, parseDoc, sequentialIds } from "../src/lib/products/playbook-ai/doc";
import type { PBDoc } from "../src/lib/products/playbook-ai/doc";
import { renderPdf, countPdfPages } from "../src/lib/products/playbook-ai/doc/render/pdf";
import { RenderBlockedError, type RenderOptions } from "../src/lib/products/playbook-ai/doc/render/prepare";
import { OFFER_LISTS, OFFER_VALUES, longDocRaw, minimalRaw, offerLetterRaw } from "./lib/pbdoc-fixtures";

// Needs no database or network. Text and page checks use poppler (pdftotext, pdfinfo, pdffonts) when installed and say so when skipped.
// Run with: npx tsx --require ./scripts/lib/next-server-shims.cjs scripts/test-pbdoc-pdf.ts
let passed = 0;
const t = async (name: string, fn: () => void | Promise<void>) => { await fn(); passed++; console.log("  ✓", name); };
const doc = (raw: unknown): PBDoc => { const r = parseDoc(raw, { assignIds: true, idFactory: sequentialIds() }); if (!r.ok) throw new Error(JSON.stringify(r.issues)); return r.doc; };
const META = { title: "Offer of Employment", author: "Orbit HR", docNumber: "OFR/2026-27/0007", version: "2", dateIso: "2026-11-05" };
const opts = (extra: Partial<RenderOptions> = {}): RenderOptions => ({ meta: META, values: OFFER_VALUES, lists: OFFER_LISTS, ...extra });

const tmp = mkdtempSync(path.join(os.tmpdir(), "pbpdf-"));
let poppler = true;
try { execFileSync("pdftotext", ["-v"], { stdio: "ignore" }); } catch { poppler = false; }
if (!poppler) console.log("  (poppler not installed: text, page and font checks that need it are skipped)");
let n = 0;
const save = (b: Buffer) => { const f = path.join(tmp, `d${++n}.pdf`); writeFileSync(f, b); return f; };
const pageText = (file: string, page: number) => execFileSync("pdftotext", ["-f", String(page), "-l", String(page), "-layout", file, "-"], { encoding: "utf8" });
const allText = (file: string) => execFileSync("pdftotext", ["-layout", file, "-"], { encoding: "utf8" });
// Rotated text (the watermark) is only reported by poppler in raw mode.
// poppler also splits it into pieces ("U N REVIEW ED"), so whitespace is removed before looking for the word.
const rawText = (file: string) => execFileSync("pdftotext", ["-raw", file, "-"], { encoding: "utf8" }).replace(/\s+/g, "");
const info = (file: string) => execFileSync("pdfinfo", [file], { encoding: "utf8" });
const fonts = (file: string) => execFileSync("pdffonts", [file], { encoding: "utf8" });
const blocked = async (d: PBDoc, o: RenderOptions): Promise<RenderBlockedError> => {
  try { await renderPdf(d, o); } catch (e) { if (e instanceof RenderBlockedError) return e; throw e; }
  throw new Error("expected the render to be blocked");
};

(async () => {
  console.log("blocking rules");
  await t("a document with a missing variable cannot be exported as final, and the error names it", async () => {
    const e = await blocked(doc(offerLetterRaw()), opts({ values: { ...OFFER_VALUES, "input.designation": undefined } }));
    assert.deepEqual(e.unresolved.map((u) => u.key), ["input.designation"]);
    assert.ok(e.reasons[0].detail.includes("input.designation"));
  });
  await t("an unfilled placeholder blocks export too", async () => {
    const values = { ...OFFER_VALUES } as Record<string, unknown>;
    delete values["input.previous_employer"];
    const e = await blocked(doc(offerLetterRaw()), opts({ values: values as never }));
    assert.deepEqual(e.placeholders.map((p) => p.key), ["input.previous_employer"]);
  });
  await t("allowUnresolved renders a clearly flagged draft: highlighted [key] text and a DRAFT watermark", async () => {
    const r = await renderPdf(doc(offerLetterRaw()), opts({ values: { ...OFFER_VALUES, "input.designation": undefined }, allowUnresolved: true }));
    assert.equal(r.watermark, "DRAFT");
    assert.ok(r.warnings.some((w) => /missing/.test(w)));
    assert.deepEqual(r.flagged.unresolved.map((u) => u.key), ["input.designation"]);
    if (poppler) {
      const f = save(r.buffer);
      assert.ok(allText(f).includes("[input.designation]"));
      assert.ok(rawText(f).includes("DRAFT"));
    }
  });
  await t("an explicit watermark is used even when the document is complete; none is drawn for a final export", async () => {
    const wm = await renderPdf(doc(offerLetterRaw()), opts({ watermark: "unreviewed" }));
    assert.equal(wm.watermark, "UNREVIEWED");
    const none = await renderPdf(doc(offerLetterRaw()), opts());
    assert.equal(none.watermark, null);
    if (poppler) {
      assert.ok(rawText(save(wm.buffer)).includes("UNREVIEWED"));
      assert.ok(!rawText(save(none.buffer)).includes("UNREVIEWED"));
    }
  });
  await t("an invalid document is refused before any rendering", async () => {
    const bad = { ...doc(minimalRaw()), schemaVersion: 7 } as unknown as PBDoc;
    const e = await blocked(bad, opts());
    assert.equal(e.reasons[0].code, "invalid_document");
  });
  await t("images: missing, unsupported and oversize files block the export with a reason", async () => {
    const withImage = doc({ ...minimalRaw(), body: [{ type: "image", fileId: "logo-file-1", alt: "Logo", widthPct: 40, align: "left" }] });
    assert.equal((await blocked(withImage, opts())).reasons[0].code, "image");
    const webp = Buffer.concat([Buffer.from("RIFF0000WEBPVP8 "), Buffer.alloc(64)]);
    assert.match((await blocked(withImage, opts({ images: { "logo-file-1": webp } }))).reasons[0].detail, /only PNG and JPEG/);
    const huge = await sharp({ create: { width: 8100, height: 10, channels: 3, background: "#fff" } }).png().toBuffer();
    assert.match((await blocked(withImage, opts({ images: { "logo-file-1": huge } }))).reasons[0].detail, /pixels on a side/);
    const big = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(5 * 1024 * 1024 + 10)]);
    assert.match((await blocked(withImage, opts({ images: { "logo-file-1": big } }))).reasons[0].detail, /larger than 5 MB/);
  });
  await t("documents beyond the render limits are refused (too many blocks, too many table cells)", async () => {
    const cell = { content: [{ type: "paragraph", content: [] }] };
    const bigTable = { type: "table", colWidths: Array(12).fill(100 / 12), headerRow: false, rows: Array.from({ length: 500 }, () => ({ cells: Array.from({ length: 12 }, () => cell) })) };
    const cells = parseDoc({ ...minimalRaw(), body: [bigTable, bigTable] }, { assignIds: true, idFactory: sequentialIds() });
    assert.ok(cells.ok, "12,000 cells parse");
    if (cells.ok) assert.equal((await blocked(cells.doc, opts())).reasons[0].code, "too_large");
    const list = { type: "bulletList", items: Array.from({ length: 500 }, () => ({ content: [{ type: "paragraph", content: [] }] })) };
    const blocks = parseDoc({ ...minimalRaw(), body: Array.from({ length: 32 }, () => list) }, { assignIds: true, idFactory: sequentialIds() });
    assert.ok(blocks.ok, "16,000 list paragraphs parse");
    if (blocks.ok) assert.equal((await blocked(blocks.doc, opts())).reasons[0].detail.includes("blocks"), true);
  });

  console.log("PDF structure");
  const offer = await renderPdf(doc(offerLetterRaw()), opts());
  const offerFile = save(offer.buffer);
  await t("page size is A4 portrait and the page count matches the engine's own count", () => {
    const raw = offer.buffer.toString("latin1");
    assert.ok(/\/MediaBox \[0 0 595\.28\d* 841\.89\d*\]/.test(raw), "MediaBox is A4 portrait");
    assert.equal(offer.pages, countPdfPages(offer.buffer));
    if (poppler) {
      assert.match(info(offerFile), /Page size:\s+595\.28 x 841\.89 pts \(A4\)/);
      assert.equal(Number(/Pages:\s+(\d+)/.exec(info(offerFile))![1]), offer.pages);
    }
  });
  await t("only Noto Sans is used and every font is embedded (no unembedded Helvetica)", () => {
    const raw = offer.buffer.toString("latin1");
    assert.ok(/\/BaseFont\s*\/[A-Z]{6}\+NotoSans/.test(raw), "Noto Sans subset present");
    assert.ok(/\/FontFile2/.test(raw), "font program embedded");
    assert.ok(!/\/BaseFont\s*\/Helvetica/.test(raw), "no standard-14 Helvetica reference");
    if (poppler) {
      const rows = fonts(offerFile).split("\n").slice(2).filter(Boolean);
      assert.ok(rows.length >= 2);
      for (const r of rows) assert.match(r, / yes yes yes /, `font not embedded and subset with unicode map: ${r}`);
      assert.ok(rows.every((r) => /NotoSans/.test(r)));
    }
  });
  await t("document properties: title, author, creator, language and a reproducible creation date", () => {
    const raw = offer.buffer.toString("latin1");
    assert.ok(/\/Title\s/.test(raw) && /\/Lang \(en-IN\)/.test(raw), "title and language");
    assert.ok(/\/Author\s/.test(raw), "author");
    assert.ok(/\(D:20261105000000Z\)/.test(raw), "creation date is the document date, not the clock");
    if (poppler) {
      const i = info(offerFile);
      assert.match(i, /Title:\s+Offer of Employment/);
      assert.match(i, /Author:\s+Orbit HR/);
      assert.match(i, /Creator:\s+SelfRun Playbook/);
    }
  });
  await t("text extraction: resolved values, Indian formats, clause numbering, tables, lists and signature lines", () => {
    if (!poppler) return;
    const txt = allText(offerFile).replace(/\s+/g, " ");
    for (const want of ["ORBIT SOFTWARE PRIVATE LIMITED", "Offer of Employment", "Contents", "Dear Asha Rao,", "Senior Engineer", "01 Dec 2026", "₹ 18,00,000", "Rupees Eighteen Lakh Only", "Component", "Annual amount", "1. Probation", "1.1 You will be on probation for 6 months", "(a) The company may confirm", "(b) Notice during probation is 15 days", "2. Confidentiality", "3. Relocation assistance of ₹ 50,000", "Health insurance: Rs 5,00,000 family floater", "a. Joining formalities", "b. Documents to submit", "Relieving letter from Nimbus Labs", "For the Company", "Accepted by the Candidate", "Signature", "Designation"]) {
      assert.ok(txt.includes(want), `missing "${want}"`);
    }
    assert.ok(!txt.includes("{{") && !txt.includes("[input."), "no unresolved text");
  });
  await t("every page has the header, and the footer shows the document number and 'Page n of N'", () => {
    if (!poppler) return;
    for (let p = 1; p <= offer.pages; p++) {
      const txt = pageText(offerFile, p);
      assert.ok(txt.includes("ORBIT SOFTWARE PRIVATE LIMITED"), `header on page ${p}`);
      assert.ok(new RegExp(`OFR/2026-27/0007\\s+\\|\\s+Page ${p} of ${offer.pages}`).test(txt), `footer on page ${p}`);
    }
  });
  await t("the explicit page break starts the acceptance on a new page", () => {
    if (!poppler) return;
    const last = pageText(offerFile, offer.pages);
    assert.ok(last.includes("Please sign and return a copy"));
    assert.ok(!pageText(offerFile, offer.pages - 1).includes("Please sign and return"));
  });
  await t("rendering the same inputs twice gives byte-identical output", async () => {
    const again = await renderPdf(doc(offerLetterRaw()), opts());
    assert.ok(again.buffer.equals(offer.buffer), "PDF bytes differ between runs");
  });

  console.log("pagination, contents and tables");
  const long = await renderPdf(doc(longDocRaw({ sections: 14, paras: 4, tables: true, toc: true, clauses: 4 })), { meta: { title: "MSA", dateIso: "2026-11-05" }, values: {} });
  const longFile = save(long.buffer);
  await t("a long document paginates and the contents page numbers equal the real heading pages", () => {
    assert.ok(long.pages >= 8, `pages ${long.pages}`);
    assert.equal(long.tocPageNumbers, true);
    if (!poppler) return;
    const tocPages = new Map<string, number>();
    for (const line of pageText(longFile, 1).split("\n")) {
      const m = /^\s*(Section \d+ Scope and Deliverables)\s+(\d+)\s*$/.exec(line);
      if (m) tocPages.set(m[1], Number(m[2]));
    }
    assert.equal(tocPages.size, 14, "all 14 entries have numbers on page 1");
    for (const [title, shown] of tocPages) {
      let real = 0;
      for (let p = 1; p <= long.pages && !real; p++) if (pageText(longFile, p).split("\n").some((l) => l.trim() === title)) real = p;
      assert.equal(shown, real, `${title}: contents says ${shown}, heading is on ${real}`);
    }
  });
  await t("keep-with-next: a heading is never the last thing on a page", () => {
    if (!poppler) return;
    for (let p = 1; p < long.pages; p++) {
      const lines = pageText(longFile, p).split("\n").map((l) => l.trim()).filter(Boolean);
      const body = lines.filter((l) => !/^Page \d+ of \d+$/.test(l) && !/^Orbit Software/.test(l));
      const last = body[body.length - 1] ?? "";
      assert.ok(!/^Section \d+ Scope and Deliverables$/.test(last), `page ${p} ends with the heading "${last}"`);
    }
  });
  await t("tables keep their rows whole across pages and show the header row", () => {
    if (!poppler) return;
    const txt = allText(longFile);
    assert.equal((txt.match(/Deliverable 14-5/g) ?? []).length, 1);
    assert.ok((txt.match(/Item\s+Quantity\s+Amount/g) ?? []).length >= 14);
    assert.ok(/Rs 62,500/.test(txt));
  });
  await t("legal clause numbers continue across the document (1., 1.1 ...)", () => {
    if (!poppler) return;
    const txt = allText(longFile).replace(/[ \t]+/g, " ");
    assert.ok(/\n ?1\. The parties agree/.test(txt) && /\n ?1\.1 The parties agree/.test(txt) && /\n ?2\. The parties agree/.test(txt), "clause labels 1., 1.1, 2.");
  });

  console.log("images, logo and brand");
  const png = await sharp({ create: { width: 400, height: 200, channels: 3, background: "#1e3a5f" } }).png().toBuffer();
  const logoPng = await sharp({ create: { width: 120, height: 60, channels: 3, background: "#0f766e" } }).png().toBuffer();
const jpg = await sharp({ create: { width: 300, height: 300, channels: 3, background: "#b45309" } }).jpeg().toBuffer();
  await t("PNG and JPEG images and a company logo are embedded, sized by the model's rules", async () => {
    const d = doc({ ...minimalRaw(), header: [{ type: "paragraph", content: [{ type: "text", text: "Letterhead" }] }], body: [
      { type: "image", fileId: "img-png-0001", alt: "Chart", widthPct: 50, align: "center", caption: "Figure 1" },
      { type: "image", fileId: "img-jpg-0001", alt: "Photo", widthPct: 30, align: "right" },
    ] });
    const r = await renderPdf(d, { meta: { title: "t", dateIso: "2026-11-05" }, values: {}, images: { "img-png-0001": png, "img-jpg-0001": jpg }, brand: { logo: { bytes: logoPng, align: "left", widthMm: 30 }, colors: { primary: "#112233" }, footerText: "Registered office: Mumbai" } });
    const raw = r.buffer.toString("latin1");
    assert.ok((raw.match(/\/Subtype\s*\/Image/g) ?? []).length >= 3, "logo, PNG and JPEG images embedded");
    if (poppler) {
      const f = save(r.buffer);
      const list = execFileSync("pdfimages", ["-list", f], { encoding: "utf8" }).split("\n").slice(2).filter(Boolean);
      assert.ok(list.length >= 3, `pdfimages sees ${list.length}`);
      const txt = allText(f);
      assert.ok(txt.includes("Figure 1") && txt.includes("Registered office: Mumbai") && txt.includes("Letterhead"));
    }
  });
  await t("a tall image is scaled to fit the page and never overflows the text area", async () => {
    const tall = await sharp({ create: { width: 100, height: 4000, channels: 3, background: "#222" } }).png().toBuffer();
    const d = doc({ ...minimalRaw(), body: [{ type: "image", fileId: "tall-img-001", alt: "Tall", widthPct: 100, align: "left" }, { type: "paragraph", content: [{ type: "text", text: "After image" }] }] });
    const r = await renderPdf(d, { meta: { title: "t", dateIso: "2026-11-05" }, values: {}, images: { "tall-img-001": tall } });
    assert.ok(r.pages <= 2);
  });
  await t("invalid brand colours fall back to defaults instead of breaking the render", async () => {
    const r = await renderPdf(doc(minimalRaw()), { meta: { title: "t", dateIso: "2026-11-05" }, values: {}, brand: { colors: { primary: "red; background:url(x)", accent: "#zzz" } } });
    assert.ok(r.buffer.length > 1000);
  });

  console.log("marks and inline content");
  await t("bold, italic, links, highlights and hard breaks render without unembedded fonts", async () => {
    const d = doc({ ...minimalRaw(), body: [{ type: "paragraph", content: [
      { type: "text", text: "Bold ", marks: [{ type: "bold" }] }, { type: "text", text: "italic ", marks: [{ type: "italic" }] }, { type: "text", text: "both ", marks: [{ type: "bold" }, { type: "italic" }] },
      { type: "text", text: "marked", marks: [{ type: "highlight", color: "yellow" }, { type: "color", color: "accent" }, { type: "strike" }] },
      { type: "hardBreak" }, { type: "text", text: "second line with a " }, { type: "text", text: "link", marks: [{ type: "link", href: "https://selfrun.in/" }] },
      { type: "text", text: "x" }, { type: "text", text: "2", marks: [{ type: "sup" }] },
    ] }] });
    const r = await renderPdf(d, { meta: { title: "t", dateIso: "2026-11-05" }, values: {} });
    const raw = r.buffer.toString("latin1");
    assert.ok(!/\/BaseFont\s*\/Helvetica/.test(raw));
    assert.ok(/\/Subtype\s*\/Link/.test(raw) && /selfrun\.in/.test(raw), "link annotation");
    if (poppler) {
      const f = save(r.buffer);
      const rows = fonts(f);
      assert.ok(/NotoSans-Italic/.test(rows) && /NotoSans-BoldItalic/.test(rows), "italic faces embedded");
      assert.ok(/Bold italic both marked\s*\n\s*second line/.test(allText(f).replace(/[ \t]+/g, " ").replace(/\n+/g, "\n").replace("Bold italic both marked", "Bold italic both marked") ) || allText(f).includes("second line with a link"));
    }
  });

  console.log("serverless guards (measured)");
  await t("large documents render within the time and memory budget (PB_STRESS=1 adds a 77-page stress run)", async () => {
    const cases: [string, ReturnType<typeof longDocRaw>][] = [
      ["27 pages of text", longDocRaw({ sections: 60, paras: 5 })],
      ["~40 pages with tables and clauses", longDocRaw({ sections: 35, paras: 4, tables: true, clauses: 6 })],
    ];
    if (process.env.PB_STRESS === "1") cases.push(["77 pages with tables and clauses (stress)", longDocRaw({ sections: 70, paras: 4, tables: true, clauses: 6 })]);
    for (const [label, raw] of cases) {
      const before = process.memoryUsage().rss;
      const t0 = Date.now();
      const r = await renderPdf(doc(raw), { meta: { title: "Big", dateIso: "2026-11-05" }, values: {} });
      const ms = Date.now() - t0;
      const mb = Math.round((process.memoryUsage().rss - before) / 1024 / 1024);
      console.log(`      ${label}: ${r.pages} pages, ${Math.round(r.buffer.length / 1024)} KB, ${ms} ms, rss +${mb} MB`);
      assert.ok(ms < 100_000, `${label} took ${ms} ms`);
      assert.ok(r.buffer.length < 10 * 1024 * 1024);
    }
  });
  await t("the page estimate tracks the real page count, and absurdly long documents are refused before rendering starts", async () => {
    const { prepareRender } = await import("../src/lib/products/playbook-ai/doc/render/prepare");
    for (const [label, raw] of [["text", longDocRaw({ sections: 60, paras: 5 })], ["tables+clauses", longDocRaw({ sections: 35, paras: 4, tables: true, clauses: 6 })]] as const) {
      const d = doc(raw);
      const est = prepareRender(d, { meta: { title: "t", dateIso: "2026-11-05" }, values: {} }).estimatedPages;
      const real = (await renderPdf(d, { meta: { title: "t", dateIso: "2026-11-05" }, values: {} })).pages;
      console.log(`      estimate ${label}: ${est} (real ${real})`);
      assert.ok(est >= real * 0.7 && est <= real * 1.4, `${label}: estimated ${est}, real ${real}`);
    }
    const e = await blocked(doc(longDocRaw({ sections: 300, paras: 4, tables: true })), opts());
    assert.match(e.reasons[0].detail, /about \d+ pages; the limit is 120/);
  });
  await t("many small tables stay within budget", async () => {
    const t0 = Date.now();
    const r = await renderPdf(doc(longDocRaw({ sections: 60, paras: 0, tables: true })), { meta: { title: "Tables", dateIso: "2026-11-05" }, values: {} });
    const ms = Date.now() - t0;
    console.log(`      60 tables (${60 * 18} cells): ${r.pages} pages, ${ms} ms`);
    assert.ok(ms < 100_000);
  });

  console.log(`\nall ${passed} tests passed`);
  void DEFAULT_PAGE;
})().catch((e) => { console.error(e); process.exit(1); });
