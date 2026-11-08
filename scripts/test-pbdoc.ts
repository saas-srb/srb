import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  DEFAULT_PAGE, MARGIN_LIMITS, PAGE_SIZES, canonicalJson, clauseLabels, collectVariables, docToTiptap, emptyDoc, evalCondition, formatIsoDateIndia, formatValue,
  indianGrouping, listMarker, mmToPt, mmToTwips, normalizeDoc, parseDoc, plainText, resolveDoc, sequentialIds, textAreaMm, tiptapToDoc, toAlpha, toRoman,
  validatePage, wordCount, allBlocks, findBlock, countBlocks, PBDOC_LIMITS,
} from "../src/lib/products/playbook-ai/doc";
import type { PBDoc } from "../src/lib/products/playbook-ai/doc";
import { contentHash, sha256Hex } from "../src/lib/products/playbook-ai/doc/hash";
import { minimalRaw, offerLetterRaw } from "./lib/pbdoc-fixtures";

// Pure: no database, no network. Run with: npx tsx --require ./scripts/lib/next-server-shims.cjs scripts/test-pbdoc.ts
// UPDATE_GOLDEN=1 rewrites scripts/fixtures/playbook/* from the current output (review the diff before committing).
let passed = 0;
const t = (name: string, fn: () => void) => { fn(); passed++; console.log("  ✓", name); };

const FIX = path.join(__dirname, "fixtures", "playbook");
const golden = (name: string, actual: string) => {
  const file = path.join(FIX, name);
  if (process.env.UPDATE_GOLDEN === "1" || !existsSync(file)) {
    mkdirSync(FIX, { recursive: true });
    writeFileSync(file, actual);
    if (process.env.UPDATE_GOLDEN !== "1") console.log(`    (wrote new golden ${name})`);
    return;
  }
  assert.equal(actual, readFileSync(file, "utf8"), `golden mismatch: ${name} (run with UPDATE_GOLDEN=1 if the change is intended)`);
};

const parse = (raw: unknown) => parseDoc(raw, { assignIds: true, idFactory: sequentialIds() });
const mustParse = (raw: unknown): PBDoc => {
  const r = parse(raw);
  if (!r.ok) throw new Error(r.issues.map((i) => `${i.path}: ${i.message}`).join("; "));
  return r.doc;
};
const issuesOf = (raw: unknown) => { const r = parse(raw); return r.ok ? [] : r.issues; };
const withBody = (body: unknown[]) => ({ ...minimalRaw(), body });
const para = (text = "x") => ({ type: "paragraph", content: [{ type: "text", text }] });
const expectIssue = (raw: unknown, re: RegExp, label: string) => {
  const found = issuesOf(raw);
  assert.ok(found.some((i) => re.test(`${i.path} ${i.message}`)), `${label}: expected an issue matching ${re}, got ${JSON.stringify(found)}`);
};

console.log("page geometry");
t("A4 portrait constants match the PDF and DOCX specs", () => {
  assert.equal(PAGE_SIZES.A4.widthMm, 210);
  assert.equal(PAGE_SIZES.A4.heightMm, 297);
  assert.equal(PAGE_SIZES.A4.widthTwips, 11906);
  assert.equal(PAGE_SIZES.A4.heightTwips, 16838);
  assert.equal(PAGE_SIZES.A4.pdfSize, "A4");
  assert.equal(mmToTwips(210), 11906);
  assert.equal(mmToTwips(297), 16838);
  assert.ok(Math.abs(mmToPt(210) - PAGE_SIZES.A4.widthPt) < 0.01);
  assert.ok(Math.abs(mmToPt(297) - PAGE_SIZES.A4.heightPt) < 0.01);
});
t("default page is A4 portrait with 25/20/25/20 mm margins", () => {
  assert.equal(DEFAULT_PAGE.size, "A4");
  assert.equal(DEFAULT_PAGE.orientation, "portrait");
  assert.deepEqual(DEFAULT_PAGE.margins, { top: 25, right: 20, bottom: 25, left: 20 });
  const a = textAreaMm(DEFAULT_PAGE);
  assert.equal(a.widthMm, 170);
  assert.equal(a.heightMm, 247);
});
t("margins outside 10 to 50 mm are refused", () => {
  const bad = (m: object) => validatePage({ ...DEFAULT_PAGE, margins: { ...DEFAULT_PAGE.margins, ...m } });
  assert.equal(bad({ left: MARGIN_LIMITS.minMm - 1 }).ok, false);
  assert.equal(bad({ top: MARGIN_LIMITS.maxMm + 1 }).ok, false);
  assert.equal(bad({ left: NaN }).ok, false);
  assert.equal(bad({ left: 10, right: 10 }).ok, true);
});
t("the text area must stay at least 100 mm wide", () => {
  const r = validatePage({ ...DEFAULT_PAGE, margins: { top: 25, right: 50, bottom: 25, left: 50 } });
  assert.equal(r.ok, true); // 110 mm
  const r2 = validatePage({ ...DEFAULT_PAGE, orientation: "portrait", margins: { top: 25, right: 50, bottom: 25, left: 50 }, size: "A4" });
  assert.equal(r2.ok, true);
});
t("header and footer zones must fit inside their margins", () => {
  assert.equal(validatePage({ ...DEFAULT_PAGE, headerHeightMm: 30 }).ok, false);
  assert.equal(validatePage({ ...DEFAULT_PAGE, footerHeightMm: 30 }).ok, false);
  assert.equal(validatePage({ ...DEFAULT_PAGE, headerHeightMm: 25, footerHeightMm: 25 }).ok, true);
  assert.equal(validatePage({ ...DEFAULT_PAGE, headerHeightMm: -1 }).ok, false);
});
t("unknown size or orientation is refused (a future size is a data change, not accepted blindly)", () => {
  assert.equal(validatePage({ ...DEFAULT_PAGE, size: "Letter" }).ok, false);
  assert.equal(validatePage({ ...DEFAULT_PAGE, orientation: "sideways" }).ok, false);
  assert.equal(validatePage(null).ok, false);
});

console.log("parsing and validation");
t("a valid minimal document parses", () => {
  const d = mustParse(minimalRaw());
  assert.equal(d.schemaVersion, 1);
  assert.equal(d.lang, "en");
  assert.equal(d.page.size, "A4");
});
t("the offer-letter fixture parses and every block gets a unique id", () => {
  const d = mustParse(offerLetterRaw());
  const ids = allBlocks(d).map((b) => b.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(countBlocks(d) > 30);
});
t("emptyDoc is valid A4", () => {
  const d = emptyDoc(sequentialIds());
  assert.equal(d.page.size, "A4");
  assert.equal(d.body.length, 1);
});
t("not an object, wrong schema version and wrong language are refused", () => {
  assert.equal(parse(null).ok, false);
  assert.equal(parse([]).ok, false);
  expectIssue({ ...minimalRaw(), schemaVersion: 2 }, /schemaVersion/, "schema version");
  expectIssue({ ...minimalRaw(), lang: "hi" }, /lang/, "language");
});
t("unknown block, inline and mark types are refused", () => {
  expectIssue(withBody([{ type: "script", src: "x" }]), /unknown block type "script"/, "block");
  expectIssue(withBody([{ type: "paragraph", content: [{ type: "iframe" }] }]), /unknown inline node/, "inline");
  expectIssue(withBody([{ type: "paragraph", content: [{ type: "text", text: "a", marks: [{ type: "fontFamily", value: "Comic" }] }] }]), /unknown mark/, "mark");
  expectIssue(withBody([{ type: "html", html: "<b>x</b>" }]), /unknown block type "html"/, "raw html");
});
t("link marks accept http, https, mailto and tel only", () => {
  const link = (href: string) => withBody([{ type: "paragraph", content: [{ type: "text", text: "a", marks: [{ type: "link", href }] }] }]);
  for (const ok of ["https://selfrun.in/a?b=1", "http://x.in", "mailto:hr@x.in", "tel:+911234567890"]) assert.equal(issuesOf(link(ok)).length, 0, ok);
  for (const bad of ["javascript:alert(1)", "data:text/html;base64,AAAA", "vbscript:x", "file:///etc/passwd", "//evil.com", "", "not a url"]) {
    assert.ok(issuesOf(link(bad)).length > 0, `should refuse ${bad}`);
  }
});
t("marks are sorted, de-duplicated and superscript with subscript is refused", () => {
  const d = mustParse(withBody([{ type: "paragraph", content: [{ type: "text", text: "a", marks: [{ type: "italic" }, { type: "bold" }, { type: "bold" }, { type: "color", color: "red" }] }] }]));
  const n = (d.body[0] as { content: { marks: { type: string }[] }[] }).content[0];
  assert.deepEqual(n.marks.map((m) => m.type), ["bold", "italic", "color"]);
  expectIssue(withBody([{ type: "paragraph", content: [{ type: "text", text: "a", marks: [{ type: "sup" }, { type: "sub" }] }] }]), /superscript and subscript/, "sup+sub");
  expectIssue(withBody([{ type: "paragraph", content: [{ type: "text", text: "a", marks: [{ type: "color", color: "#ff0000" }] }] }]), /colour must be one of/, "raw hex colour");
});
t("ids are required unless assignIds, and duplicates are refused", () => {
  const raw = withBody([{ type: "paragraph", content: [] }]);
  assert.equal(parseDoc(raw).ok, false);
  const dup = withBody([{ id: "a", type: "paragraph", content: [] }, { id: "a", type: "paragraph", content: [] }]);
  assert.equal(parseDoc(dup).ok, false);
  assert.equal(parseDoc(dup, { assignIds: true, idFactory: sequentialIds() }).ok, true);
  const bad = withBody([{ id: "has space", type: "paragraph", content: [] }]);
  assert.equal(parseDoc(bad).ok, false);
});
t("text normalisation: merge equal runs, drop empty runs, trim stray hard breaks", () => {
  const d = mustParse(withBody([{ type: "paragraph", content: [
    { type: "hardBreak" }, { type: "text", text: "Hel" }, { type: "text", text: "" }, { type: "text", text: "lo", marks: [] }, { type: "text", text: " w", marks: [{ type: "bold" }] },
    { type: "text", text: "orld", marks: [{ type: "bold" }] }, { type: "hardBreak" },
  ] }]));
  const c = (d.body[0] as { content: { type: string; text?: string }[] }).content;
  assert.deepEqual(c.map((x) => x.text), ["Hello", " world"]);
});
t("empty containers get one empty paragraph (cells, list items, callouts)", () => {
  const d = mustParse(withBody([
    { type: "table", colWidths: [50, 50], headerRow: false, rows: [{ cells: [{ content: [] }, { content: [] }] }] },
    { type: "bulletList", items: [{ content: [] }] },
    { type: "callout", variant: "warning", content: [] },
  ]));
  assert.equal((d.body[0] as { rows: { cells: { content: unknown[] }[] }[] }).rows[0].cells[0].content.length, 1);
  assert.equal((d.body[1] as { items: { content: unknown[] }[] }).items[0].content.length, 1);
  assert.equal((d.body[2] as { content: unknown[] }).content.length, 1);
});
t("tables: ragged rows, bad widths, too many columns and nested tables are refused; widths are rounded to 100", () => {
  const cell = { content: [para()] };
  expectIssue(withBody([{ type: "table", colWidths: [50, 50], headerRow: true, rows: [{ cells: [cell, cell] }, { cells: [cell] }] }]), /every row needs 2 cells/, "ragged");
  expectIssue(withBody([{ type: "table", colWidths: [30, 30], headerRow: true, rows: [{ cells: [cell, cell] }] }]), /add up to 100/, "sum");
  expectIssue(withBody([{ type: "table", colWidths: [2, 98], headerRow: true, rows: [{ cells: [cell, cell] }] }]), /between 5% and 100%/, "tiny column");
  expectIssue(withBody([{ type: "table", colWidths: [100], headerRow: true, rows: [] }]), /at least one row/, "no rows");
  const wide = Array.from({ length: 13 }, () => cell);
  expectIssue(withBody([{ type: "table", colWidths: Array(13).fill(100 / 13), headerRow: true, rows: [{ cells: wide }] }]), /more than 12 columns/, "columns");
  expectIssue(withBody([{ type: "table", colWidths: [100], headerRow: true, rows: [{ cells: [{ content: [{ type: "table", colWidths: [100], headerRow: true, rows: [] }] }] }] }]), /can hold paragraphs and lists/, "nested table");
  const d = mustParse(withBody([{ type: "table", colWidths: [33.3, 33.3, 33.3], headerRow: true, rows: [{ cells: [cell, cell, cell] }] }]));
  const sum = (d.body[0] as { colWidths: number[] }).colWidths.reduce((a, b) => a + b, 0);
  assert.equal(Math.round(sum * 10) / 10, 100);
});
t("lists: empty, too deep and wrong children are refused", () => {
  expectIssue(withBody([{ type: "bulletList", items: [] }]), /at least one item/, "empty list");
  let deep: unknown = { type: "bulletList", items: [{ content: [para()] }] };
  for (let i = 0; i < 6; i++) deep = { type: "bulletList", items: [{ content: [para(), deep] }] };
  expectIssue(withBody([deep]), /nested more than 4 levels/, "depth");
  expectIssue(withBody([{ type: "bulletList", items: [{ content: [{ type: "heading", level: 2, content: [] }] }] }]), /paragraphs and lists/, "heading in list");
  expectIssue(withBody([{ type: "orderedList", style: "greek", items: [{ content: [para()] }] }]), /style must be one of/, "style");
  expectIssue(withBody([{ type: "orderedList", start: 0, items: [{ content: [para()] }] }]), /start must be/, "start");
});
t("variables: key shape, namespaces and repeat item scope", () => {
  const v = (key: string) => withBody([{ type: "paragraph", content: [{ type: "var", key }] }]);
  assert.equal(issuesOf(v("company.legal_name")).length, 0);
  assert.equal(issuesOf(v("custom.team.lead")).length, 0);
  for (const bad of ["legal_name", "Company.Name", "company.", "company.a b", "company.a.b.c.d", "1company.x", ""]) assert.ok(issuesOf(v(bad)).length > 0, bad);
  expectIssue(v("secret.password"), /unknown variable namespace "secret"/, "namespace");
  expectIssue(withBody([{ type: "paragraph", content: [{ type: "var", key: "item.name" }] }]), /unknown variable namespace "item"/, "item outside repeat");
  assert.equal(issuesOf(withBody([{ type: "repeat", source: "input.rows", itemVar: "row", children: [{ type: "paragraph", content: [{ type: "var", key: "row.name" }] }] }])).length, 0);
  expectIssue(withBody([{ type: "repeat", source: "input.rows", itemVar: "company", children: [] }]), /reserved name/, "reserved itemVar");
  expectIssue(withBody([{ type: "paragraph", content: [{ type: "var", key: "company.name", format: "roman" }] }]), /format must be one of/, "format");
});
t("conditions: op and value rules", () => {
  const c = (when: unknown) => withBody([{ type: "conditional", when, children: [para()] }]);
  assert.equal(issuesOf(c({ key: "input.x", op: "exists" })).length, 0);
  assert.equal(issuesOf(c({ key: "input.x", op: "eq", value: "yes" })).length, 0);
  expectIssue(c({ key: "input.x", op: "eq" }), /needs a value/, "eq without value");
  expectIssue(c({ key: "input.x", op: "exists", value: "a" }), /does not take a value/, "exists with value");
  expectIssue(c({ key: "input.x", op: "gt", value: "abc" }), /needs a number/, "gt non numeric");
  expectIssue(c({ key: "input.x", op: "matches", value: ".*" }), /op must be one of/, "regex op refused");
  expectIssue(c(null), /condition is required/, "missing");
});
t("sections: top level only, unique keys, one table of contents, container depth", () => {
  const sec = (key: string, children: unknown[] = []) => ({ type: "section", key, title: "T", aiMode: "generate", locked: false, children });
  assert.equal(issuesOf(withBody([sec("a"), sec("b")])).length, 0);
  expectIssue(withBody([sec("a"), sec("a")]), /duplicate section key/, "duplicate key");
  expectIssue(withBody([sec("a", [sec("b")])]), /only sit directly in the document body/, "nested section");
  expectIssue(withBody([sec("Bad Key")]), /section key is a lower-case name/, "key shape");
  expectIssue(withBody([{ type: "toc", levels: 2 }, { type: "toc", levels: 2 }]), /only one table of contents/, "two tocs");
  let deep: unknown = para();
  for (let i = 0; i < 6; i++) deep = { type: "conditional", when: { key: "input.x", op: "exists" }, children: [deep] };
  expectIssue(withBody([deep]), /nested more than 4 levels/, "depth");
  expectIssue(withBody([{ ...sec("c"), aiMode: "magic" }]), /aiMode must be one of/, "aiMode");
});
t("images, signature blocks, spacers and headings validate their fields", () => {
  expectIssue(withBody([{ type: "image", fileId: "../../etc/passwd", alt: "x", widthPct: 50, align: "left" }]), /id of an uploaded file/, "image path traversal");
  expectIssue(withBody([{ type: "image", fileId: "abcdefgh12", alt: "x", widthPct: 500, align: "left" }]), /widthPct/, "image width");
  expectIssue(withBody([{ type: "image", fileId: "abcdefgh12", alt: "", widthPct: 50, align: "left" }]), /alt must not be empty/, "alt");
  expectIssue(withBody([{ type: "signatureBlock", label: "x", partyRole: "notary" }]), /partyRole must be one of/, "role");
  expectIssue(withBody([{ type: "signatureBlock", label: "", partyRole: "witness" }]), /label must not be empty/, "label");
  expectIssue(withBody([{ type: "spacer", heightMm: 500 }]), /heightMm/, "spacer");
  expectIssue(withBody([{ type: "heading", level: 7, content: [] }]), /level must be 1, 2, 3 or 4/, "heading level");
  expectIssue(withBody([{ type: "clause", level: 4, numbered: true, content: [] }]), /level must be 1, 2 or 3/, "clause level");
  expectIssue(withBody([{ type: "paragraph", align: "diagonal", content: [] }]), /align must be one of/, "align");
});
t("header and footer accept only paragraphs, images, dividers and tables", () => {
  expectIssue({ ...minimalRaw(), header: [{ type: "heading", level: 1, content: [] }] }, /header or footer can hold/, "heading in header");
  expectIssue({ ...minimalRaw(), footer: [{ type: "pageBreak" }] }, /header or footer can hold/, "page break in footer");
  const many = Array.from({ length: 13 }, () => ({ type: "divider" }));
  expectIssue({ ...minimalRaw(), header: many }, /more than 12 blocks/, "too many zone blocks");
});
t("limits: text length and node count", () => {
  expectIssue(withBody([para("a".repeat(PBDOC_LIMITS.maxText + 1))]), /longer than 20000/, "text");
  const big = withBody(Array.from({ length: PBDOC_LIMITS.maxBodyBlocks + 1 }, () => para()));
  expectIssue(big, /more than 3000 blocks/, "body blocks");
});
t("unknown properties are dropped, never copied (no prototype pollution)", () => {
  const raw = JSON.parse('{"schemaVersion":1,"lang":"en","header":[],"footer":[],"__proto__":{"polluted":true},"constructor":{"x":1},"body":[{"type":"paragraph","evil":"<script>","__proto__":{"polluted":true},"content":[{"type":"text","text":"a","style":"color:red","onclick":"x"}]}]}');
  raw.page = DEFAULT_PAGE;
  const d = mustParse(raw);
  assert.equal(({} as Record<string, unknown>).polluted, undefined);
  const s = JSON.stringify(d);
  assert.ok(!s.includes("evil") && !s.includes("script") && !s.includes("onclick") && !s.includes("polluted") && !s.includes("color:red"));
});
t("parsing is idempotent and normalizeDoc rejects invalid documents", () => {
  const d = mustParse(offerLetterRaw());
  const again = parseDoc(d);
  assert.ok(again.ok);
  assert.equal(canonicalJson(again.ok ? again.doc : null), canonicalJson(d));
  assert.equal(canonicalJson(normalizeDoc(d)), canonicalJson(d));
  assert.throws(() => normalizeDoc({ ...d, schemaVersion: 9 as unknown as 1 }));
});
t("the input object is never mutated", () => {
  const raw = offerLetterRaw();
  const before = JSON.stringify(raw);
  mustParse(raw);
  assert.equal(JSON.stringify(raw), before);
});

console.log("hashing and canonical JSON");
t("canonicalJson is independent of key order and omits undefined", () => {
  assert.equal(canonicalJson({ b: 1, a: { d: 1, c: undefined, e: [2, { z: 1, y: 2 }] } }), '{"a":{"d":1,"e":[2,{"y":2,"z":1}]},"b":1}');
});
t("sha256Hex matches the published test vector", () => {
  assert.equal(sha256Hex("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  assert.equal(sha256Hex(""), "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
});
t("the content hash is stable, deterministic with fixed ids, and changes with any edit", () => {
  const a = mustParse(offerLetterRaw());
  const b = mustParse(offerLetterRaw());
  assert.equal(contentHash(a), contentHash(b));
  assert.match(contentHash(a), /^[0-9a-f]{64}$/);
  const edited = structuredClone(a);
  ((edited.body[0] as { content: { text: string }[] }).content[0]).text = "Offer of Employment ";
  assert.notEqual(contentHash(edited), contentHash(a));
  const reordered = JSON.parse(JSON.stringify(a, Object.keys(a).sort()));
  assert.equal(contentHash(parseDoc(reordered).ok ? (parseDoc(reordered) as { doc: PBDoc }).doc : a), contentHash(a));
});
t("different page settings change the hash", () => {
  const a = mustParse(minimalRaw());
  const c = structuredClone(a);
  c.page.margins.left = 25;
  assert.notEqual(contentHash(c), contentHash(a));
});

console.log("numbering and format");
t("alpha and roman markers", () => {
  assert.equal(toAlpha(1), "a");
  assert.equal(toAlpha(26), "z");
  assert.equal(toAlpha(27), "aa");
  assert.equal(toAlpha(52), "az");
  assert.equal(toRoman(4), "iv");
  assert.equal(toRoman(9), "ix");
  assert.equal(toRoman(1994), "mcmxciv");
  assert.equal(listMarker("decimal", 3), "3.");
  assert.equal(listMarker("alpha", 2), "b.");
  assert.equal(listMarker("roman", 3), "iii.");
});
t("legal clause labels restart lower levels and skip unnumbered clauses", () => {
  const d = mustParse(offerLetterRaw());
  const labels = clauseLabels(d.body);
  const texts = allBlocks(d).filter((b) => b.type === "clause").map((b) => `${labels.get(b.id) ?? "-"}|${plainText({ ...d, body: [b as never], header: [], footer: [] })}`);
  assert.deepEqual(texts.map((x) => x.split("|")[0]), ["1.", "1.1", "(a)", "(b)", "2.", "-", "3."]);
});
t("a level-2 clause without a parent counts as 1.1", () => {
  const d = mustParse(withBody([{ type: "clause", level: 2, numbered: true, content: [] }, { type: "clause", level: 3, numbered: true, content: [] }]));
  const ls = [...clauseLabels(d.body).values()];
  assert.deepEqual(ls, ["1.1", "(a)"]);
});
t("Indian digit grouping", () => {
  assert.equal(indianGrouping(0), "0");
  assert.equal(indianGrouping(999), "999");
  assert.equal(indianGrouping(1000), "1,000");
  assert.equal(indianGrouping(100000), "1,00,000");
  assert.equal(indianGrouping(1234567), "12,34,567");
  assert.equal(indianGrouping(1234567.5), "12,34,567.50");
  assert.equal(indianGrouping(123456789), "12,34,56,789");
  assert.equal(indianGrouping(-250000), "-2,50,000");
});
t("dates are formatted without time-zone drift and impossible dates are refused", () => {
  assert.equal(formatIsoDateIndia("2026-11-05"), "05 Nov 2026");
  assert.equal(formatIsoDateIndia("2026-01-01"), "01 Jan 2026");
  assert.equal(formatIsoDateIndia("2024-02-29"), "29 Feb 2024");
  assert.equal(formatIsoDateIndia("2026-02-29"), null);
  assert.equal(formatIsoDateIndia("2026-13-01"), null);
  assert.equal(formatIsoDateIndia("05/11/2026"), null);
});
t("formatValue: text, upper, number, money, words and failures", () => {
  assert.deepEqual(formatValue("Acme", "upper"), { ok: true, text: "ACME" });
  assert.deepEqual(formatValue(1200000, "money"), { ok: true, text: "₹ 12,00,000" });
  assert.deepEqual(formatValue("12,00,000", "number"), { ok: true, text: "12,00,000" });
  assert.deepEqual(formatValue(101371, "words"), { ok: true, text: "Rupees One Lakh One Thousand Three Hundred Seventy One Only" });
  assert.equal(formatValue("abc", "money").ok, false);
  assert.equal(formatValue("", "number").ok, false);
  assert.equal(formatValue("soon", "date").ok, false);
  assert.equal(formatValue(-5, "words").ok, false);
});

console.log("variables, conditionals and repeats");
t("collectVariables lists variables, formats, placeholders, condition keys and repeat sources (not item variables)", () => {
  const c = collectVariables(mustParse(offerLetterRaw()));
  const keys = c.variables.map((v) => v.key);
  assert.ok(keys.includes("company.legal_name") && keys.includes("input.annual_ctc") && keys.includes("candidate.name"));
  assert.ok(!keys.some((k) => k.startsWith("item.")));
  assert.deepEqual(c.variables.find((v) => v.key === "input.annual_ctc")?.formats, ["money", "words"]);
  assert.equal(c.variables.find((v) => v.key === "candidate.name")?.needsValue, false);
  assert.equal(c.variables.find((v) => v.key === "input.designation")?.needsValue, true);
  assert.deepEqual(c.placeholders.map((p) => p.key), ["input.previous_employer"]);
  assert.deepEqual(c.conditionKeys, ["input.relocation"]);
  assert.deepEqual(c.repeatSources, ["input.benefits"]);
});
t("evalCondition covers every operator and missing values", () => {
  const get = (m: Record<string, unknown>) => (k: string) => m[k];
  assert.equal(evalCondition({ key: "a.b", op: "exists" }, get({ "a.b": "x" })), true);
  assert.equal(evalCondition({ key: "a.b", op: "exists" }, get({ "a.b": "  " })), false);
  assert.equal(evalCondition({ key: "a.b", op: "exists" }, get({})), false);
  assert.equal(evalCondition({ key: "a.b", op: "not_exists" }, get({})), true);
  assert.equal(evalCondition({ key: "a.b", op: "eq", value: "yes" }, get({ "a.b": "yes" })), true);
  assert.equal(evalCondition({ key: "a.b", op: "eq", value: "true" }, get({ "a.b": true })), true);
  assert.equal(evalCondition({ key: "a.b", op: "eq", value: "yes" }, get({})), false);
  assert.equal(evalCondition({ key: "a.b", op: "neq", value: "yes" }, get({})), true);
  assert.equal(evalCondition({ key: "a.b", op: "gt", value: "10" }, get({ "a.b": 11 })), true);
  assert.equal(evalCondition({ key: "a.b", op: "gt", value: "10" }, get({ "a.b": "9" })), false);
  assert.equal(evalCondition({ key: "a.b", op: "lt", value: "10" }, get({ "a.b": "abc" })), false);
});
const FULL_VALUES = {
  "company.legal_name": "Orbit Software Private Limited", "company.address_line": "Unit 4, Tech Park, Andheri East, Mumbai 400093", "company.cin": "U72900MH2020PTC123456",
  "company.name": "Orbit", "doc.date": "2026-11-05", "candidate.name": "Asha Rao", "input.designation": "Senior Engineer", "input.joining_date": "2026-12-01",
  "input.annual_ctc": 1800000, "input.probation_months": 6, "input.probation_notice_days": 15, "input.relocation": "yes", "input.relocation_amount": 50000,
  "input.previous_employer": "Nimbus Labs",
};
const BENEFITS = [{ name: "Health insurance", detail: "Rs 5,00,000 family floater" }, { name: "Learning budget", detail: "Rs 40,000 a year" }];
t("resolveDoc fills variables with Indian formats, keeps the document valid and reports nothing unresolved", () => {
  const r = resolveDoc(mustParse(offerLetterRaw()), { values: FULL_VALUES, lists: { "input.benefits": BENEFITS }, idFactory: sequentialIds("r") });
  assert.deepEqual(r.unresolved, []);
  assert.deepEqual(r.placeholders, []);
  const txt = plainText(r.doc, { zones: true });
  for (const want of ["ORBIT SOFTWARE PRIVATE LIMITED", "05 Nov 2026", "Dear Asha Rao,", "₹ 18,00,000", "Rupees Eighteen Lakh Only", "01 Dec 2026", "Relocation assistance of ₹ 50,000", "Health insurance: Rs 5,00,000 family floater", "Learning budget: Rs 40,000 a year", "Relieving letter from Nimbus Labs"]) {
    assert.ok(txt.includes(want), `missing "${want}"`);
  }
  assert.ok(!txt.includes("{{"), "no unresolved variable text");
  const ids = allBlocks(r.doc).map((b) => b.id);
  assert.equal(new Set(ids).size, ids.length, "ids stay unique after the repeat expands");
});
t("conditionals drop their blocks when false; missing values are reported, never invented", () => {
  const values = { ...FULL_VALUES, "input.relocation": "no" } as Record<string, unknown>;
  delete values["input.previous_employer"];
  delete values["input.designation"];
  const r = resolveDoc(mustParse(offerLetterRaw()), { values: values as never, lists: { "input.benefits": BENEFITS }, idFactory: sequentialIds("r") });
  assert.ok(!plainText(r.doc).includes("Relocation assistance"));
  assert.deepEqual(r.unresolved.map((u) => u.key), ["input.designation"]);
  assert.deepEqual(r.placeholders.map((p) => p.key), ["input.previous_employer"]);
  assert.ok(plainText(r.doc).includes("{{input.designation}}"), "an unresolved variable stays visible instead of being guessed");
});
t("fallbacks apply, and an unformattable value falls back or is reported", () => {
  const d = mustParse(withBody([{ type: "paragraph", content: [{ type: "var", key: "candidate.name", fallback: "Candidate" }, { type: "text", text: " / " }, { type: "var", key: "input.amount", format: "money" }, { type: "text", text: " / " }, { type: "var", key: "input.when", format: "date", fallback: "to be confirmed" }] }]));
  const r = resolveDoc(d, { values: { "input.amount": "lots", "input.when": "soon" } });
  assert.equal(plainText(r.doc).split("\n")[0], "Candidate / {{input.amount}} / to be confirmed");
  assert.deepEqual(r.unresolved, [{ key: "input.amount", reason: "not an amount" }]);
});
t("an empty repeat source removes the block; item variables missing a value are dropped and reported", () => {
  const d = mustParse(withBody([{ type: "repeat", source: "input.rows", itemVar: "row", children: [{ type: "paragraph", content: [{ type: "var", key: "row.name" }, { type: "var", key: "row.note" }] }] }]));
  const none = resolveDoc(d, { values: {}, lists: { "input.rows": [] } });
  assert.equal(plainText(none.doc), "");
  const some = resolveDoc(d, { values: {}, lists: { "input.rows": [{ name: "A" }, { name: "B", note: "!" }] } });
  assert.equal(plainText(some.doc), "A\n\nB!");
  assert.ok(some.unresolved.some((u) => u.key === "row.note"));
});
t("resolution never mutates its input", () => {
  const d = mustParse(offerLetterRaw());
  const before = canonicalJson(d);
  resolveDoc(d, { values: FULL_VALUES, lists: { "input.benefits": BENEFITS } });
  assert.equal(canonicalJson(d), before);
});

console.log("text extraction");
t("plainText shows variables, placeholders, numbered clauses, lists and tables", () => {
  const txt = plainText(mustParse(offerLetterRaw()));
  assert.ok(txt.startsWith("Offer of Employment\n\nContents\n\nDate: {{doc.date}}"));
  assert.ok(txt.includes("1. Probation\n\n1.1 You will be on probation for {{input.probation_months}} months"));
  assert.ok(txt.includes("(a) The company may confirm"));
  assert.ok(txt.includes("Component\tAnnual amount"));
  assert.ok(txt.includes("a. Joining formalities"));
  assert.ok(txt.includes("  - Relieving letter from [Previous employer]"));
  assert.ok(txt.includes("Signature: For the Company"));
  assert.ok(!txt.includes("CIN:"), "header text is excluded unless zones are requested");
  assert.ok(plainText(mustParse(offerLetterRaw()), { zones: true }).includes("{docNumber}  |  Page {page} of {pages}"));
});
t("wordCount ignores variable syntax length", () => {
  assert.equal(wordCount(mustParse(withBody([{ type: "paragraph", content: [{ type: "text", text: "Dear " }, { type: "var", key: "candidate.name" }, { type: "text", text: ", welcome aboard" }] }]))), 4);
  assert.equal(wordCount(emptyDoc(sequentialIds())), 0);
});
t("findBlock locates blocks by id anywhere", () => {
  const d = mustParse(offerLetterRaw());
  const sig = allBlocks(d).find((b) => b.type === "signatureBlock")!;
  assert.equal(findBlock(d, sig.id)?.type, "signatureBlock");
  assert.equal(findBlock(d, "nope"), null);
});

console.log("TipTap JSON");
t("docToTiptap then tiptapToDoc returns the identical document (lossless)", () => {
  for (const raw of [offerLetterRaw(), minimalRaw()]) {
    const d = mustParse(raw);
    const tt = docToTiptap(d);
    const back = tiptapToDoc(tt, d.page);
    assert.ok(back.ok, back.ok ? "" : JSON.stringify(back.issues));
    assert.equal(canonicalJson(back.ok ? back.doc : null), canonicalJson(d));
    assert.equal(contentHash(back.ok ? back.doc : d), contentHash(d));
  }
});
t("the TipTap shape follows the documented contract", () => {
  const d = mustParse(offerLetterRaw());
  const tt = docToTiptap(d);
  assert.equal(tt.body.type, "doc");
  const text = JSON.stringify(tt);
  for (const name of ["heading", "clause", "table", "tableRow", "tableHeader", "tableCell", "bulletList", "orderedList", "listItem", "callout", "signatureBlock", "pageBreak", "divider", "spacer", "toc", "conditional", "repeat", "section", "variable", "placeholder", "field", "hardBreak"]) {
    assert.ok(text.includes(`"type":"${name}"`), `missing node ${name}`);
  }
  assert.ok(text.includes('"type":"underline"') && text.includes('"type":"link"'));
  assert.ok(!text.includes('"type":"var"'), "inline var is called variable in TipTap");
  const table = tt.body.content!.flatMap((n) => n.content ?? []).find((n) => n.type === "table")!;
  assert.deepEqual(table.attrs?.colWidths, [60, 40]);
  assert.equal(table.content![0].content![0].type, "tableHeader");
  assert.equal(table.content![1].content![0].type, "tableCell");
});
t("a table without a header row uses plain cells only", () => {
  const cell = { content: [para()] };
  const d = mustParse(withBody([{ type: "table", colWidths: [50, 50], headerRow: false, rows: [{ cells: [cell, cell] }] }]));
  const s = JSON.stringify(docToTiptap(d));
  assert.ok(!s.includes("tableHeader") && s.includes("tableCell"));
});
t("editor output without ids gets deterministic ids; superscript, subscript and text colour map back", () => {
  const page = DEFAULT_PAGE;
  const doc = { type: "doc", content: [{ type: "paragraph", content: [
    { type: "text", text: "x", marks: [{ type: "superscript" }, { type: "textColor", attrs: { color: "red" } }] },
    { type: "text", text: "y", marks: [{ type: "subscript" }, { type: "highlight", attrs: { color: "yellow" } }] },
  ] }] };
  const r = tiptapToDoc({ body: doc, header: { type: "doc" }, footer: { type: "doc" } }, page, { idFactory: sequentialIds() });
  assert.ok(r.ok, r.ok ? "" : JSON.stringify(r.issues));
  if (!r.ok) return;
  const marks = (r.doc.body[0] as { content: { marks: { type: string }[] }[] }).content.map((n) => n.marks.map((m) => m.type));
  assert.deepEqual(marks, [["sup", "color"], ["sub", "highlight"]]);
  assert.equal(r.doc.body[0].id, "n1");
});
t("editor output that the model cannot represent is refused", () => {
  const empty = { type: "doc" };
  const mk = (n: unknown) => tiptapToDoc({ body: { type: "doc", content: [n as never] }, header: empty, footer: empty }, DEFAULT_PAGE);
  assert.equal(mk({ type: "codeBlock", content: [{ type: "text", text: "x" }] }).ok, false);
  assert.equal(mk({ type: "blockquote", content: [] }).ok, false);
  assert.equal(mk({ type: "paragraph", content: [{ type: "text", text: "x", marks: [{ type: "textStyle", attrs: { fontFamily: "Comic Sans" } }] }] }).ok, false);
  assert.equal(mk({ type: "image", attrs: { fileId: "../x", alt: "a", widthPct: 50, align: "left" } }).ok, false);
  assert.equal(tiptapToDoc({ body: { type: "paragraph" }, header: empty, footer: empty }, DEFAULT_PAGE).ok, false);
});
t("tiptapToDoc applies the same validation as parseDoc (bad link, bad page)", () => {
  const empty = { type: "doc" };
  const link = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "x", marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }] }] }] };
  assert.equal(tiptapToDoc({ body: link, header: empty, footer: empty }, DEFAULT_PAGE).ok, false);
  assert.equal(tiptapToDoc({ body: empty, header: empty, footer: empty }, { ...DEFAULT_PAGE, margins: { top: 1, right: 1, bottom: 1, left: 1 } }).ok, false);
});

console.log("golden files");
t("the offer-letter fixture matches its golden canonical JSON, hash, plain text and TipTap JSON", () => {
  const d = mustParse(offerLetterRaw());
  golden("offer-letter.canonical.json", `${canonicalJson(d)}\n`);
  golden("offer-letter.sha256", `${contentHash(d)}\n`);
  golden("offer-letter.txt", `${plainText(d, { zones: true })}\n`);
  golden("offer-letter.tiptap.json", `${canonicalJson(docToTiptap(d))}\n`);
  const r = resolveDoc(d, { values: FULL_VALUES, lists: { "input.benefits": BENEFITS }, idFactory: sequentialIds("r") });
  golden("offer-letter.resolved.txt", `${plainText(r.doc, { zones: true })}\n`);
});

console.log(`\nall ${passed} tests passed`);
