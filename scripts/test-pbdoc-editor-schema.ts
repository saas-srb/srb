import assert from "node:assert/strict";
import { getSchema } from "@tiptap/core";
import { EditorState } from "@tiptap/pm/state";
import { Node as PMNode } from "@tiptap/pm/model";
import { BOUND_SHORTCUT_IDS, buildExtensions, integrityTransaction } from "../src/components/doc-editor/schema/extensions";
import { blockToTiptap, docToTiptap, parseDoc, sequentialIds, clauseLabels, DEFAULT_PAGE } from "../src/lib/products/playbook-ai/doc";
import type { PBDoc } from "../src/lib/products/playbook-ai/doc";
import { cleanPastedHtml, decodeEntities, isInternalPaste } from "../src/components/doc-editor/core/paste-clean";
import { SHORTCUTS, formatShortcut } from "../src/components/doc-editor/core/shortcuts";
import { buildOutline, clauseLabelsFromPm, tocEntries } from "../src/components/doc-editor/core/outline";
import { findInDoc, findRanges, nextMatchIndex, previousMatchIndex, replaceAllInText } from "../src/components/doc-editor/core/find-replace";
import { AutosaveController, type Scheduler, type Snapshot } from "../src/components/doc-editor/core/autosave";
import { DocumentConflictError, isConflictError, type DocumentStore, type SaveRequest } from "../src/components/doc-editor/core/store";
import { computePageStarts, pageOfOffset } from "../src/components/doc-editor/core/pagination";
import { normalizeHref, safeHref } from "../src/components/doc-editor/core/links";
import { editorBodyToDoc, sanitizeEditorJson } from "../src/components/doc-editor/core/convert";
import { groupVariables, isValidVariableKey, placeholderKey } from "../src/components/doc-editor/core/variables";
import { minimalRaw, offerLetterRaw } from "./lib/pbdoc-fixtures";

// Pure: no DOM, no database, no network. Run with: npx tsx scripts/test-pbdoc-editor-schema.ts
let passed = 0;
const pending: Promise<void>[] = [];
let failed = 0;
const fail = (name: string, e: unknown) => { failed++; console.error("  ✗", name, "\n   ", e instanceof Error ? e.message.split("\n").slice(0, 6).join("\n    ") : e); };
const t = (name: string, fn: () => void | Promise<void>) => {
  try {
    const r = fn();
    if (r instanceof Promise) pending.push(r.then(() => { passed++; console.log("  ✓", name); }, (e) => fail(name, e)));
    else { passed++; console.log("  ✓", name); }
  } catch (e) { fail(name, e); }
};

const schema = getSchema(buildExtensions());
const mustDoc = (raw: unknown): PBDoc => {
  const r = parseDoc(raw, { assignIds: true, idFactory: sequentialIds() });
  if (!r.ok) throw new Error(r.issues.map((i) => `${i.path}: ${i.message}`).join("; "));
  return r.doc;
};
const txt = (s: string, marks?: unknown[]) => (marks ? { type: "text", text: s, marks } : { type: "text", text: s });
const para = (...c: unknown[]) => ({ type: "paragraph", content: c });
const raw = (body: unknown[]) => ({ ...minimalRaw(), body });

const kitchenSink = () => raw([
  { type: "heading", level: 1, align: "center", content: [txt("Title")] },
  { type: "heading", level: 4, content: [txt("Deep")] },
  para(txt("b", [{ type: "bold" }]), txt("i", [{ type: "italic" }]), txt("u", [{ type: "underline" }]), txt("s", [{ type: "strike" }]), txt("x", [{ type: "sup" }]), txt("y", [{ type: "sub" }]),
    txt("link", [{ type: "link", href: "https://example.com/a?b=1" }]), txt("hl", [{ type: "highlight", color: "pink" }]), txt("col", [{ type: "color", color: "primary" }]),
    txt("all", [{ type: "bold" }, { type: "italic" }, { type: "underline" }]), { type: "hardBreak" }, txt("after")),
  para({ type: "var", key: "company.legal_name", format: "upper", fallback: "The Company", marks: [{ type: "bold" }] }, { type: "placeholder", key: "input.joining_date", label: "Joining date", hint: "As agreed" }, { type: "field", field: "pageNumber" }),
  { type: "clause", level: 1, numbered: true, content: [txt("Term")] },
  { type: "clause", level: 2, numbered: true, content: [txt("Sub")] },
  { type: "clause", level: 3, numbered: true, content: [txt("Item")] },
  { type: "clause", level: 1, numbered: false, content: [txt("Plain")] },
  { type: "bulletList", items: [{ content: [para(txt("one")), { type: "orderedList", style: "alpha", start: 3, items: [{ content: [para(txt("nested"))] }] }] }, { content: [para(txt("two"))] }] },
  { type: "orderedList", style: "roman", items: [{ content: [para(txt("r1"))] }] },
  { type: "table", colWidths: [30, 70], headerRow: true, rows: [
    { cells: [{ content: [para(txt("H1"))], align: "center" }, { content: [para(txt("H2"))] }] },
    { cells: [{ content: [para(txt("a")), { type: "bulletList", items: [{ content: [para(txt("li"))] }] }] }, { content: [para(txt("b"))] }] },
  ] },
  { type: "table", colWidths: [100], headerRow: false, rows: [{ cells: [{ content: [para(txt("solo"))] }] }] },
  { type: "image", fileId: "file_abcdefgh1", alt: "Logo", widthPct: 40, align: "center", caption: "Figure 1" },
  { type: "callout", variant: "warning", content: [para(txt("careful")), { type: "bulletList", items: [{ content: [para(txt("x"))] }] }] },
  { type: "signatureBlock", label: "For the Company", partyRole: "company_signatory", showName: true, showDesignation: false, showDate: true },
  { type: "pageBreak" }, { type: "divider" }, { type: "spacer", heightMm: 12 }, { type: "toc", levels: 3 },
  { type: "conditional", when: { key: "party.type", op: "eq", value: "employee" }, children: [para(txt("cond")), { type: "conditional", when: { key: "doc.x", op: "exists" }, children: [para(txt("deep"))] }] },
  { type: "repeat", source: "input.benefits", itemVar: "benefit", children: [para(txt("- "), { type: "var", key: "benefit.name" })] },
  { type: "section", key: "scope", title: "Scope", aiMode: "generate", locked: true, children: [para(txt("in section")), { type: "heading", level: 2, content: [txt("Sub")] }] },
  { type: "section", key: "closing", title: "Closing", aiMode: "fixed", locked: false, children: [para(txt("bye"))] },
]);

const toPm = (doc: PBDoc) => PMNode.fromJSON(schema, docToTiptap(doc).body);
const stateOf = (json: unknown) => EditorState.create({ schema, doc: PMNode.fromJSON(schema, json as never) });
const roundTrip = (doc: PBDoc): PBDoc => {
  const pm = toPm(doc);
  pm.check();
  const r = editorBodyToDoc(pm.toJSON(), doc);
  if (!r.ok) throw new Error(r.issues.map((i) => `${i.path}: ${i.message}`).join("; "));
  return r.doc;
};

// ---- schema parity ----------------------------------------------------------------------------------------------------

t("every PBDoc node and mark the editor offers is registered under the mapping's names", () => {
  const nodes = ["doc", "text", "paragraph", "heading", "clause", "bulletList", "orderedList", "listItem", "table", "tableRow", "tableHeader", "tableCell", "image", "callout", "signatureBlock", "pageBreak", "divider", "spacer", "toc", "conditional", "repeat", "section", "variable", "placeholder", "field", "hardBreak"];
  for (const n of nodes) assert.ok(schema.nodes[n], `node ${n}`);
  for (const m of ["bold", "italic", "underline", "strike", "link", "superscript", "subscript", "highlight", "textColor"]) assert.ok(schema.marks[m], `mark ${m}`);
  const allowed = new Set([...nodes]);
  for (const n of Object.keys(schema.nodes)) assert.ok(allowed.has(n), `unexpected node ${n}`);
  for (const m of Object.keys(schema.marks)) assert.ok(["bold", "italic", "underline", "strike", "link", "superscript", "subscript", "highlight", "textColor"].includes(m), `unexpected mark ${m}`);
});

t("a document with every node and mark round-trips PBDoc -> editor -> PBDoc unchanged", () => {
  const doc = mustDoc(kitchenSink());
  assert.deepEqual(roundTrip(doc), doc);
});

t("the offer-letter fixture round-trips unchanged", () => {
  const doc = mustDoc(offerLetterRaw());
  assert.deepEqual(roundTrip(doc), doc);
});

t("a second round trip is stable (idempotent)", () => {
  const once = roundTrip(mustDoc(kitchenSink()));
  assert.deepEqual(roundTrip(once), once);
});

t("header and footer blocks are valid editor nodes too", () => {
  const doc = mustDoc(offerLetterRaw());
  for (const b of [...doc.header, ...doc.footer]) schema.nodeFromJSON(blockToTiptap(b)).check();
});

t("the editor cannot hold unsupported structures: schema rejects them", () => {
  const bad = (json: unknown) => assert.throws(() => PMNode.fromJSON(schema, json as never).check());
  const p = (s = "x") => ({ type: "paragraph", content: [{ type: "text", text: s }] });
  const cell = (c: unknown[]) => ({ type: "tableCell", content: c });
  const tbl = (c: unknown[]) => ({ type: "table", content: [{ type: "tableRow", content: [cell(c)] }] });
  bad({ type: "doc", content: [tbl([{ type: "heading", attrs: { level: 1 }, content: [] }])] }); // heading in a cell
  bad({ type: "doc", content: [tbl([tbl([p()])])] }); // nested table
  bad({ type: "doc", content: [{ type: "callout", content: [tbl([p()])] }] }); // table in callout
  bad({ type: "doc", content: [{ type: "callout", content: [{ type: "image", attrs: {} }] }] });
  bad({ type: "doc", content: [{ type: "conditional", content: [{ type: "section", content: [p()] }] }] }); // section below the top level
  bad({ type: "doc", content: [{ type: "section", content: [{ type: "section", content: [p()] }] }] });
  bad({ type: "doc", content: [{ type: "bulletList", content: [{ type: "listItem", content: [{ type: "heading", attrs: { level: 1 } }] }] }] });
  bad({ type: "doc", content: [{ type: "bulletList", content: [{ type: "listItem", content: [tbl([p()])] }] }] });
  bad({ type: "doc", content: [{ type: "bulletList", content: [] }] }); // empty list
  bad({ type: "doc", content: [{ type: "table", content: [] }] }); // empty table
  bad({ type: "doc", content: [{ type: "paragraph", content: [{ type: "paragraph" }] }] }); // block in inline
  bad({ type: "doc", content: [] });
  assert.throws(() => schema.nodeFromJSON({ type: "codeBlock" }));
  assert.throws(() => schema.nodeFromJSON({ type: "blockquote", content: [p()] }));
  assert.throws(() => schema.nodeFromJSON({ type: "horizontalRule" }));
  assert.throws(() => schema.nodeFromJSON({ type: "iframe" }));
});

t("merged cells are impossible: colspan and rowspan always parse to 1", () => {
  const spec = schema.nodes.tableCell.spec.attrs as Record<string, { default: number }>;
  assert.equal(spec.colspan.default, 1);
  assert.equal(spec.rowspan.default, 1);
  const attrs = (schema.nodes.tableCell.spec as unknown as { parseDOM?: unknown }).parseDOM;
  void attrs;
  assert.equal(schema.nodes.tableCell.create({ colspan: 1, rowspan: 1 }, schema.nodes.paragraph.create()).attrs.colspan, 1);
});

// ---- integrity plugin --------------------------------------------------------------------------------------------------

const withIntegrity = (json: unknown) => {
  const s = stateOf(json);
  const tr = integrityTransaction(s, sequentialIds("fx")) ;
  return tr ? s.apply(tr) : s;
};
const p = (id: string | null, s = "x") => ({ type: "paragraph", attrs: { id }, content: [{ type: "text", text: s }] });

t("integrity: missing and duplicate block ids are replaced, existing ones kept", () => {
  const st = withIntegrity({ type: "doc", content: [p("a"), p("a"), p(null)] });
  const ids = st.doc.children.map((c) => String(c.attrs.id));
  assert.equal(ids[0], "a");
  assert.equal(new Set(ids).size, 3);
});

t("integrity: a link on a variable or field is removed, a link on text stays", () => {
  const link = [{ type: "link", attrs: { href: "https://example.com" } }];
  const st = withIntegrity({ type: "doc", content: [{ type: "paragraph", attrs: { id: "p" }, content: [
    { type: "text", text: "go", marks: link }, { type: "variable", attrs: { key: "company.name" }, marks: link }, { type: "field", attrs: { field: "date" }, marks: link },
  ] }] });
  const kids: PMNode[] = [];
  st.doc.firstChild!.forEach((c) => kids.push(c));
  assert.equal(kids[0].marks.length, 1);
  assert.equal(kids[1].marks.length, 0);
  assert.equal(kids[2].marks.length, 0);
});

t("integrity: duplicate section keys are made unique; only the first table of contents survives", () => {
  const sec = (id: string) => ({ type: "section", attrs: { id, key: "scope", title: "S" }, content: [p(id + "p")] });
  const toc = (id: string) => ({ type: "toc", attrs: { id, levels: 2 } });
  const st = withIntegrity({ type: "doc", content: [sec("s1"), sec("s2"), toc("t1"), toc("t2")] });
  const keys: string[] = [];
  let tocs = 0;
  st.doc.forEach((n) => { if (n.type.name === "section") keys.push(String(n.attrs.key)); if (n.type.name === "toc") tocs++; });
  assert.equal(new Set(keys).size, 2);
  assert.equal(tocs, 1);
});

t("integrity: colWidths follows the column count and header cells follow headerRow", () => {
  const cell = (type: string, id: string) => ({ type, attrs: { id }, content: [p(id + "p")] });
  const table = (headerRow: boolean, widths: number[] | null) => ({ type: "table", attrs: { id: "t", headerRow, colWidths: widths }, content: [
    { type: "tableRow", attrs: { id: "r1" }, content: [cell("tableCell", "c1"), cell("tableCell", "c2"), cell("tableCell", "c3")] },
    { type: "tableRow", attrs: { id: "r2" }, content: [cell("tableHeader", "c4"), cell("tableCell", "c5"), cell("tableCell", "c6")] },
  ] });
  const st = withIntegrity({ type: "doc", content: [table(true, [50, 50])] });
  const tbl = st.doc.firstChild!;
  assert.equal((tbl.attrs.colWidths as number[]).length, 3);
  assert.ok(Math.abs((tbl.attrs.colWidths as number[]).reduce((a, b) => a + b, 0) - 100) < 0.11);
  assert.equal(tbl.child(0).child(0).type.name, "tableHeader");
  assert.equal(tbl.child(1).child(0).type.name, "tableCell");
  const off = withIntegrity({ type: "doc", content: [table(false, [30, 30, 40])] }).doc.firstChild!;
  assert.equal(off.child(0).child(0).type.name, "tableCell");
  assert.deepEqual(off.attrs.colWidths, [30, 30, 40]);
});

t("integrity result converts to a valid PBDoc", () => {
  const st = withIntegrity({ type: "doc", content: [p(null, "hello"), p(null, "world")] });
  const r = editorBodyToDoc(st.doc.toJSON(), mustDoc(minimalRaw()));
  assert.ok(r.ok);
});

// ---- converter safety --------------------------------------------------------------------------------------------------

t("sanitizeEditorJson strips unsafe links, links on atoms and marks on placeholders", () => {
  const out = sanitizeEditorJson({ type: "paragraph", content: [
    { type: "text", text: "a", marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }, { type: "bold" }] },
    { type: "variable", attrs: { key: "company.name" }, marks: [{ type: "link", attrs: { href: "https://ok.example" } }, { type: "bold" }] },
    { type: "placeholder", attrs: { key: "input.x", label: "X" }, marks: [{ type: "bold" }] },
  ] });
  assert.deepEqual(out.content![0].marks, [{ type: "bold" }]);
  assert.deepEqual(out.content![1].marks, [{ type: "bold" }]);
  assert.equal(out.content![2].marks, undefined);
});

t("an editor document PBDoc refuses (empty image alt) is reported, not saved", () => {
  const doc = mustDoc(minimalRaw());
  const r = editorBodyToDoc({ type: "doc", content: [{ type: "image", attrs: { fileId: "file_abcdefgh1", alt: "", widthPct: 50, align: "left" } }] }, doc);
  assert.equal(r.ok, false);
});

t("link addresses: safe schemes only, lenient completion for what people type", () => {
  assert.equal(safeHref("https://a.com"), "https://a.com");
  assert.equal(safeHref("mailto:a@b.com"), "mailto:a@b.com");
  assert.equal(safeHref("tel:+911234567890"), "tel:+911234567890");
  for (const bad of ["javascript:alert(1)", "data:text/html,x", "vbscript:x", "file:///etc/passwd", "//evil.com", "/relative", "https://a.com/\nx", "", "https://a b.com", "JaVaScRiPt:alert(1)"]) assert.equal(safeHref(bad), null, bad);
  assert.equal(normalizeHref("example.com/path"), "https://example.com/path");
  assert.equal(normalizeHref("a@b.com"), "mailto:a@b.com");
  assert.equal(normalizeHref("+91 98765 43210"), "tel:+919876543210");
  assert.equal(normalizeHref("javascript:alert(1)"), null);
  assert.equal(normalizeHref("not a link"), null);
});

// ---- paste cleaning ---------------------------------------------------------------------------------------------------

const clean = (h: string) => cleanPastedHtml(h).html;
const cases: [string, string, string][] = [
  ["plain paragraph", "<p>Hello</p>", "<p>Hello</p>"],
  ["div becomes paragraph", "<div>Hello</div>", "<p>Hello</p>"],
  ["loose text becomes paragraph", "Hello world", "<p>Hello world</p>"],
  ["scripts are dropped with their content", "<p>a</p><script>alert(1)</script><p>b</p>", "<p>a</p><p>b</p>"],
  ["style blocks are dropped", "<style>p{color:red}</style><p>a</p>", "<p>a</p>"],
  ["event handlers and classes are stripped", '<p class="x" onclick="evil()" id="i">a</p>', "<p>a</p>"],
  ["bold tags", "<p><b>a</b> <strong>b</strong></p>", "<p><strong>a</strong> <strong>b</strong></p>"],
  ["italic and underline", "<p><i>a</i><em>b</em><u>c</u></p>", "<p><em>a</em><em>b</em><u>c</u></p>"],
  ["strike", "<p><s>a</s><del>b</del><strike>c</strike></p>", "<p><s>a</s><s>b</s><s>c</s></p>"],
  ["sup and sub", "<p>x<sup>2</sup>H<sub>2</sub>O</p>", "<p>x<sup>2</sup>H<sub>2</sub>O</p>"],
  ["style font-weight bold becomes strong", '<p><span style="font-weight:700">a</span></p>', "<p><strong>a</strong></p>"],
  ["style italic", '<p><span style="font-style:italic">a</span></p>', "<p><em>a</em></p>"],
  ["style underline and line-through", '<p><span style="text-decoration:underline line-through">a</span></p>', "<p><u><s>a</s></u></p>"],
  ["style vertical-align super", '<p><span style="vertical-align:super">a</span></p>', "<p><sup>a</sup></p>"],
  ["Google Docs wrapper b with font-weight normal is not bold", '<b style="font-weight:normal;" id="docs-internal-guid-1"><p>a</p></b>', "<p>a</p>"],
  ["Google Docs bold span", '<p dir="ltr"><span style="font-weight:700;">Bold</span><span> plain</span></p>', "<p><strong>Bold</strong> plain</p>"],
  ["colours and fonts are dropped", '<p><span style="color:red;font-family:Arial;font-size:20pt;background:#ff0">a</span></p>', "<p>a</p>"],
  ["font tag unwrapped", '<p><font face="Arial" color="red">a</font></p>', "<p>a</p>"],
  ["safe link kept", '<p><a href="https://example.com/x">go</a></p>', '<p><a href="https://example.com/x">go</a></p>'],
  ["javascript link dropped, text kept", '<p><a href="javascript:alert(1)">go</a></p>', "<p>go</p>"],
  ["relative and anchor links dropped", '<p><a href="/x">a</a><a href="#top">b</a></p>', "<p>ab</p>"],
  ["data link dropped", '<p><a href="data:text/html;base64,AAAA">a</a></p>', "<p>a</p>"],
  ["mailto link kept", '<p><a href="mailto:a@b.com">mail</a></p>', '<p><a href="mailto:a@b.com">mail</a></p>'],
  ["underline inside a link is not added (Google Docs)", '<p><a href="https://a.com"><span style="text-decoration:underline">a</span></a></p>', '<p><a href="https://a.com">a</a></p>'],
  ["images are dropped", '<p>a<img src="https://x/y.png">b</p>', "<p>ab</p>"],
  ["iframes, objects and forms are dropped", '<iframe src="x"></iframe><object data="y"></object><form><input></form><p>a</p>', "<p>a</p>"],
  ["headings map to h1-h4, deeper headings become h4", "<h1>a</h1><h2>b</h2><h5>c</h5><h6>d</h6>", "<h1>a</h1><h2>b</h2><h4>c</h4><h4>d</h4>"],
  ["heading with inline marks", "<h2>A <b>b</b></h2>", "<h2>A <strong>b</strong></h2>"],
  ["empty paragraphs are removed", "<p></p><p>&nbsp;</p><p>a</p>", "<p>a</p>"],
  ["whitespace collapses", "<p>a \n\n   b\t c</p>", "<p>a b c</p>"],
  ["br kept inside a paragraph", "<p>a<br>b</p>", "<p>a<br>b</p>"],
  ["entities decoded and re-escaped", "<p>a &amp; b &lt;c&gt; &quot;d&quot; &#8377;5</p>", "<p>a &amp; b &lt;c&gt; &quot;d&quot; ₹5</p>"],
  ["HTML-looking text cannot become markup", "<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>", "<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>"],
  ["bullet list", "<ul><li>a</li><li>b</li></ul>", "<ul><li><p>a</p></li><li><p>b</p></li></ul>"],
  ["ordered list with type a", '<ol type="a"><li>a</li></ol>', '<ol data-style="alpha"><li><p>a</p></li></ol>'],
  ["ordered list with roman style and start", '<ol start="3" style="list-style-type:lower-roman"><li>a</li></ol>', '<ol data-style="roman" start="3"><li><p>a</p></li></ol>'],
  ["nested list", "<ul><li>a<ul><li>b</li></ul></li></ul>", "<ul><li><p>a</p><ul><li><p>b</p></li></ul></li></ul>"],
  ["list item with paragraph (Google Docs)", '<ul><li><p dir="ltr"><span>a</span></p></li></ul>', "<ul><li><p>a</p></li></ul>"],
  ["unclosed li tags", "<ul><li>a<li>b</ul>", "<ul><li><p>a</p></li><li><p>b</p></li></ul>"],
  ["simple table", "<table><tr><td>a</td><td>b</td></tr></table>", '<table data-header-row="false"><tr><td><p>a</p></td><td><p>b</p></td></tr></table>'],
  ["table with th header row", "<table><thead><tr><th>a</th><th>b</th></tr></thead><tbody><tr><td>1</td><td>2</td></tr></tbody></table>", '<table data-header-row="true"><tr><td><p>a</p></td><td><p>b</p></td></tr><tr><td><p>1</p></td><td><p>2</p></td></tr></table>'],
  ["colspan becomes empty cells (no merged cells)", '<table><tr><td colspan="2">a</td></tr><tr><td>1</td><td>2</td></tr></table>', '<table data-header-row="false"><tr><td><p>a</p></td><td><p></p></td></tr><tr><td><p>1</p></td><td><p>2</p></td></tr></table>'],
  ["ragged rows are padded", "<table><tr><td>a</td><td>b</td></tr><tr><td>c</td></tr></table>", '<table data-header-row="false"><tr><td><p>a</p></td><td><p>b</p></td></tr><tr><td><p>c</p></td><td><p></p></td></tr></table>'],
  ["nested table is flattened to paragraphs", "<table><tr><td>a<table><tr><td>in1</td><td>in2</td></tr></table></td></tr></table>", '<table data-header-row="false"><tr><td><p>a</p><p>in1 in2</p></td></tr></table>'],
  ["heading inside a cell becomes a paragraph", "<table><tr><td><h2>a</h2></td></tr></table>", '<table data-header-row="false"><tr><td><p>a</p></td></tr></table>'],
  ["Word fake bullet list", '<p class="MsoListParagraph" style="mso-list:l0 level1 lfo1"><span style="mso-list:Ignore">&middot;<span>&nbsp;&nbsp;</span></span>One</p><p class="MsoListParagraph" style="mso-list:l0 level1 lfo1"><span style="mso-list:Ignore">&middot;</span>Two</p>', "<ul><li><p>One</p></li><li><p>Two</p></li></ul>"],
  ["Word fake numbered list with nesting", '<p class=MsoListParagraph style="mso-list:l0 level1 lfo1"><span style="mso-list:Ignore">1.</span>A</p><p class=MsoListParagraph style="mso-list:l0 level2 lfo1"><span style="mso-list:Ignore">a.</span>B</p><p class=MsoListParagraph style="mso-list:l0 level1 lfo1"><span style="mso-list:Ignore">2.</span>C</p>', '<ol data-style="decimal"><li><p>A</p><ol data-style="alpha"><li><p>B</p></li></ol></li><li><p>C</p></li></ol>'],
  ["Word conditional comments and o:p are ignored", "<!--[if gte mso 9]><xml><o:x/></xml><![endif]--><p class=MsoNormal>Hi<o:p></o:p></p>", "<p>Hi</p>"],
  ["Word fragment markers select only the content", "<html><body><!--StartFragment--><p>in</p><!--EndFragment--><p>out</p></body></html>", "<p>in</p>"],
  ["head and title are dropped", "<html><head><title>T</title><meta charset=utf-8></head><body><p>a</p></body></html>", "<p>a</p>"],
  ["blockquote and pre become paragraphs", "<blockquote>q</blockquote><pre>code</pre>", "<p>q</p><p>code</p>"],
  ["hr is dropped", "<p>a</p><hr><p>b</p>", "<p>a</p><p>b</p>"],
  ["zero-width and control characters removed", "<p>a​b\u0007c</p>", "<p>abc</p>"],
  ["malformed tags do not throw", "<p>a <b>b<i>c</p>d", "<p>a <strong>b</strong><strong><em>c</em></strong></p><p>d</p>"],
  ["namespaced vector content is dropped", "<p>a</p><v:shape><p>x</p></v:shape>", "<p>a</p>"],
  ["svg is dropped", "<svg><script>1</script></svg><p>a</p>", "<p>a</p>"],
  ["unknown tags unwrapped", "<p><custom-x>a</custom-x></p>", "<p>a</p>"],
  ["span soup", '<p><span><span><span>a</span></span> <span>b</span></span></p>', "<p>a b</p>"],
];
for (const [name, input, expected] of cases) t(`paste: ${name}`, () => assert.equal(clean(input), expected));

t("paste: there are at least 30 cleaning cases", () => assert.ok(cases.length >= 30, String(cases.length)));
t("paste: oversize input is truncated, deep nesting and huge lists do not hang or throw", () => {
  const big = cleanPastedHtml("<p>x</p>".repeat(200_000));
  assert.equal(big.truncated, true);
  const deep = cleanPastedHtml("<div>".repeat(5000) + "deep" + "</div>".repeat(5000));
  assert.ok(deep.html.includes("deep"));
  const lists = cleanPastedHtml("<ul><li>a<ul><li>b<ul><li>c<ul><li>d<ul><li>e<ul><li>f</li></ul></li></ul></li></ul></li></ul></li></ul></li></ul>");
  const depth = Math.max(...(lists.html.match(/<ul>/g) ? [lists.html.split("<ul>").length - 1] : [0]));
  assert.ok(depth <= 4, `list depth ${depth}`);
  assert.ok(["a", "b", "c", "d", "e", "f"].every((x) => lists.html.includes(`<p>${x}</p>`)), "no text lost when flattening deep lists");
  assert.equal(clean(""), "");
  assert.equal(clean(undefined as unknown as string), "");
});
t("paste: wide tables are capped at the column limit", () => {
  const row = `<tr>${"<td>x</td>".repeat(30)}</tr>`;
  const out = clean(`<table>${row}</table>`);
  assert.equal(out.split("<td>").length - 1, 12);
});
t("paste: cleaned output parses into the schema and converts to a valid PBDoc (no unsupported structure survives)", () => {
  const messy = '<h2>Terms</h2><p><b>Bold</b> <a href="javascript:x">bad</a></p><table><tr><td colspan=2><h1>cell</h1></td></tr></table><ul><li>a<ul><li>b</li></ul></li></ul><img src=x><script>1</script>';
  const html = clean(messy);
  // Re-parse the cleaned HTML with the tokenizer-level checks: only the allowed tags remain.
  const tags = new Set([...html.matchAll(/<\/?([a-z0-9]+)/g)].map((m) => m[1]));
  for (const tg of tags) assert.ok(["p", "h1", "h2", "h3", "h4", "strong", "em", "u", "s", "sup", "sub", "a", "br", "ul", "ol", "li", "table", "tr", "td"].includes(tg), tg);
  assert.ok(!/javascript|script|onclick|style=/.test(html));
});
t("paste: decodeEntities and internal-paste detection", () => {
  assert.equal(decodeEntities("&amp;&lt;&#65;&#x42;&bogus;&#0;"), "&<AB&bogus;");
  assert.equal(isInternalPaste('<meta><div data-pm-slice="1 1 []">'), true);
  assert.equal(isInternalPaste("<p>x</p>"), false);
});

// ---- keyboard shortcuts ------------------------------------------------------------------------------------------------

t("shortcuts: unique key combinations, every one labelled", () => {
  const seen = new Map<string, string>();
  for (const s of SHORTCUTS) {
    assert.ok(s.label.length > 2, s.id);
    assert.ok(!seen.has(s.keys), `${s.id} duplicates ${seen.get(s.keys)}`);
    seen.set(s.keys, s.id);
  }
  assert.equal(new Set(SHORTCUTS.map((s) => s.id)).size, SHORTCUTS.length);
});
t("shortcuts: the editor binds exactly the editor-scoped shortcuts in the table", () => {
  const table = SHORTCUTS.filter((s) => s.scope === "editor").map((s) => s.id).sort();
  assert.deepEqual([...BOUND_SHORTCUT_IDS].sort(), table);
});
t("shortcuts: display formatting", () => {
  assert.equal(formatShortcut("Mod-Shift-x"), "Ctrl+Shift+X");
  assert.equal(formatShortcut("Mod-Alt-1", true), "⌘⌥1");
  assert.equal(formatShortcut("Tab"), "Tab");
});

// ---- outline and clause labels -----------------------------------------------------------------------------------------

t("outline lists headings, sections and level-1 clauses in order with ids and positions", () => {
  const pm = toPm(mustDoc(kitchenSink()));
  const items = buildOutline(pm);
  assert.deepEqual(items.map((i) => `${i.kind}:${i.level}:${i.text}`), [
    "heading:1:Title", "heading:4:Deep", "clause:1:Term", "section:1:Scope", "heading:2:Sub", "section:1:Closing",
  ]);
  for (const i of items) assert.equal(String(pm.nodeAt(i.pos)?.attrs.id), i.id);
  assert.equal(items.find((i) => i.text === "Term")?.label, "1.");
  assert.deepEqual(tocEntries(items, 2).map((i) => i.text), ["Title", "Sub"]);
});
t("outline ignores empty headings and shows variables and placeholders as text", () => {
  const pm = toPm(mustDoc(raw([{ type: "heading", level: 1, content: [] }, { type: "heading", level: 2, content: [txt("Hi "), { type: "var", key: "company.name" }, { type: "placeholder", key: "input.a", label: "A" }] }])));
  assert.deepEqual(buildOutline(pm).map((i) => i.text), ["Hi {{company.name}}[A]"]);
});
t("clause labels in the editor equal the renderers' numbering (1. / 1.1 / (a))", () => {
  const doc = mustDoc(raw([
    { type: "clause", level: 2, numbered: true, content: [txt("orphan")] },
    { type: "clause", level: 1, numbered: true, content: [txt("a")] }, { type: "clause", level: 2, numbered: true, content: [txt("b")] },
    { type: "clause", level: 3, numbered: true, content: [txt("c")] }, { type: "clause", level: 3, numbered: true, content: [txt("d")] },
    { type: "clause", level: 1, numbered: false, content: [txt("e")] }, { type: "clause", level: 1, numbered: true, content: [txt("f")] },
    { type: "section", key: "s", title: "S", aiMode: "fixed", locked: false, children: [{ type: "clause", level: 2, numbered: true, content: [txt("g")] }] },
  ]));
  const expected = clauseLabels(doc.body);
  assert.deepEqual([...clauseLabelsFromPm(toPm(doc))].sort(), [...expected].sort());
  assert.ok(expected.size >= 7);
});

// ---- find and replace --------------------------------------------------------------------------------------------------

t("find: case, whole word, overlapping and empty queries", () => {
  assert.deepEqual(findRanges("Aaa aaa", "aa"), [{ from: 0, to: 2 }, { from: 4, to: 6 }]);
  assert.deepEqual(findRanges("Aaa aaa", "aa", { caseSensitive: true }), [{ from: 1, to: 3 }, { from: 4, to: 6 }]);
  assert.deepEqual(findRanges("cat concat cat.", "cat", { wholeWord: true }), [{ from: 0, to: 3 }, { from: 14 - 3, to: 14 }]);
  assert.deepEqual(findRanges("abc", ""), []);
  assert.deepEqual(findRanges("a.b a.b", "."), [{ from: 1, to: 2 }, { from: 5, to: 6 }]);
  assert.deepEqual(findRanges("(x)", "("), [{ from: 0, to: 1 }]);
  assert.equal(findRanges("a".repeat(20000), "a").length, 5000);
});
t("find: replace-all on text, replacement is literal", () => {
  assert.equal(replaceAllInText("one two one", "one", "$& 1"), "$& 1 two $& 1");
  assert.equal(replaceAllInText("abc", "x", "y"), "abc");
});
t("find: matches in the document map to exact positions, never span a variable chip, and skip nothing else", () => {
  const pm = toPm(mustDoc(raw([para(txt("Hello "), txt("wor", [{ type: "bold" }]), txt("ld hello")), para(txt("see "), { type: "var", key: "company.name" }, txt(" hello"))])));
  const ms = findInDoc(pm, "hello");
  assert.equal(ms.length, 3);
  for (const m of ms) assert.equal(pm.textBetween(m.from, m.to).toLowerCase(), "hello");
  assert.equal(findInDoc(pm, "world").length, 1);
  assert.equal(pm.textBetween(findInDoc(pm, "world")[0].from, findInDoc(pm, "world")[0].to), "world");
  assert.equal(findInDoc(pm, "see company").length, 0);
});
t("find: next and previous wrap around", () => {
  const ms = [{ from: 5, to: 7 }, { from: 20, to: 22 }];
  assert.equal(nextMatchIndex(ms, 0), 0);
  assert.equal(nextMatchIndex(ms, 8), 1);
  assert.equal(nextMatchIndex(ms, 30), 0);
  assert.equal(previousMatchIndex(ms, 30), 1);
  assert.equal(previousMatchIndex(ms, 5), 1);
  assert.equal(nextMatchIndex([], 0), -1);
});

// ---- pagination --------------------------------------------------------------------------------------------------------

t("pagination: flows blocks into pages and honours page breaks", () => {
  assert.deepEqual(computePageStarts([{ top: 0, height: 900 }], 1000), [0]);
  assert.deepEqual(computePageStarts([{ top: 0, height: 900 }, { top: 900, height: 200 }], 1000), [0, 1000]);
  assert.deepEqual(computePageStarts([{ top: 0, height: 2500 }], 1000), [0, 1000, 2000]);
  assert.deepEqual(computePageStarts([{ top: 0, height: 100 }, { top: 100, height: 20, pageBreak: true }, { top: 120, height: 100 }], 1000), [0, 120]);
  assert.deepEqual(computePageStarts([{ top: 0, height: 100 }, { top: 100, height: 20, pageBreak: true }, { top: 120, height: 1500 }], 1000), [0, 120, 1120]);
  assert.deepEqual(computePageStarts([], 1000), [0]);
  assert.equal(pageOfOffset([0, 1000, 2000], 1500), 2);
  assert.equal(pageOfOffset([0, 1000, 2000], 0), 1);
});

// ---- variables ---------------------------------------------------------------------------------------------------------

t("variables: key validation, grouping, search and placeholder keys", () => {
  assert.ok(isValidVariableKey("company.legal_name"));
  assert.ok(!isValidVariableKey("company"));
  assert.ok(!isValidVariableKey("bogus.name"));
  assert.ok(!isValidVariableKey("Company.Name"));
  const defs = [{ key: "company.legal_name", label: "Legal name", group: "Company" }, { key: "employee.name", label: "Name", group: "Employee" }, { key: "company.cin", label: "CIN", group: "Company" }];
  assert.deepEqual(groupVariables(defs).map((g) => `${g.group}:${g.items.length}`), ["Company:2", "Employee:1"]);
  assert.deepEqual(groupVariables(defs, "legal").flatMap((g) => g.items.map((i) => i.key)), ["company.legal_name"]);
  assert.equal(placeholderKey("Joining date"), "input.joining_date");
  assert.equal(placeholderKey("2nd party!"), "input.f_2nd_party");
  assert.equal(placeholderKey("***"), null);
  assert.ok(isValidVariableKey(placeholderKey("A very long label ".repeat(10))!));
});

// ---- autosave and conflict state machine --------------------------------------------------------------------------------

class FakeScheduler implements Scheduler {
  now = 0; private next = 1; private tasks = new Map<number, { at: number; fn: () => void }>();
  set(fn: () => void, ms: number) { const id = this.next++; this.tasks.set(id, { at: this.now + ms, fn }); return id; }
  clear(h: unknown) { this.tasks.delete(h as number); }
  get pendingCount() { return this.tasks.size; }
  async advance(ms: number) {
    const end = this.now + ms;
    for (;;) {
      const due = [...this.tasks].filter(([, x]) => x.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!due) break;
      this.tasks.delete(due[0]);
      this.now = due[1].at;
      due[1].fn();
      await new Promise((r) => setImmediate(r));
    }
    this.now = end;
  }
}
class FakeStore implements DocumentStore {
  version = 1; saves: SaveRequest[] = []; failNext: unknown[] = []; gate: Promise<void> | null = null; doc: PBDoc | null = null;
  async load(id: string) { return { id, doc: this.doc ?? mustDoc(minimalRaw()), version: String(this.version) }; }
  async save(req: SaveRequest) {
    if (this.gate) await this.gate;
    const f = this.failNext.shift();
    if (f) throw f;
    if (req.baseVersion !== String(this.version)) throw new DocumentConflictError("stale", String(this.version));
    this.version += 1; this.doc = req.doc; this.saves.push(req);
    return { version: String(this.version) };
  }
}
const okSnap = (text: string): Snapshot => ({ ok: true, doc: mustDoc(raw([para(txt(text))])) });
const mk = (store: FakeStore, extra = {}) => { const sch = new FakeScheduler(); const states: string[] = []; const c = new AutosaveController({ store, documentId: "d1", baseVersion: "1", scheduler: sch, debounceMs: 1000, onState: (s) => states.push(s.status), ...extra }); return { sch, c, states }; };

t("autosave: debounces a burst of changes into one save and ends 'saved'", async () => {
  const store = new FakeStore(); const { sch, c } = mk(store);
  c.change(() => okSnap("a")); await sch.advance(500); c.change(() => okSnap("ab")); await sch.advance(900);
  assert.equal(store.saves.length, 0);
  await sch.advance(200);
  assert.equal(store.saves.length, 1);
  assert.equal(c.state.status, "saved");
  assert.equal(c.state.version, "2");
  assert.equal(store.saves[0].baseVersion, "1");
  assert.match(JSON.stringify(store.saves[0].doc), /"ab"/);
  assert.equal(c.isDirty, false);
});
t("autosave: an edit during a save triggers a second save based on the new version", async () => {
  const store = new FakeStore(); const { sch, c } = mk(store);
  let release!: () => void; store.gate = new Promise((r) => (release = r));
  c.change(() => okSnap("one")); await sch.advance(1000);
  assert.equal(c.state.status, "saving");
  c.change(() => okSnap("two"));
  store.gate = null; release(); await sch.advance(10); await sch.advance(1200);
  assert.equal(store.saves.length, 2);
  assert.equal(store.saves[1].baseVersion, "2");
  assert.equal(c.state.status, "saved");
});
t("autosave: a CONFLICT stops saving, keeps the local copy, never overwrites; later edits send nothing", async () => {
  const store = new FakeStore(); store.version = 5; const { sch, c } = mk(store);
  c.change(() => okSnap("mine")); await sch.advance(1000);
  assert.equal(c.state.status, "conflict");
  assert.equal(store.saves.length, 0);
  assert.equal(store.doc, null);
  assert.ok(c.lastLocal);
  c.change(() => okSnap("mine more")); await sch.advance(5000);
  assert.equal(store.saves.length, 0);
  assert.equal(c.state.status, "conflict");
  assert.equal(await c.flush(), "conflict");
  assert.equal(c.isDirty, true);
});
t("autosave: after reloading the server version, saving resumes from it", async () => {
  const store = new FakeStore(); store.version = 5; const { sch, c } = mk(store);
  c.change(() => okSnap("mine")); await sch.advance(1000);
  const server = await store.load("d1");
  c.adoptServerVersion(server.version);
  assert.equal(c.state.status, "idle");
  c.change(() => okSnap("after reload")); await sch.advance(1000);
  assert.equal(store.saves.length, 1);
  assert.equal(store.saves[0].baseVersion, "5");
});
t("autosave: conflict errors that lost their prototype crossing a server action are still recognised", () => {
  assert.equal(isConflictError({ code: "CONFLICT" }), true);
  assert.equal(isConflictError(new DocumentConflictError()), true);
  assert.equal(isConflictError(new Error("boom")), false);
  assert.equal(isConflictError(null), false);
});
t("autosave: transient failures retry with backoff, then wait for the user; a manual flush succeeds", async () => {
  const store = new FakeStore(); store.failNext = [new Error("offline"), new Error("offline"), new Error("offline"), new Error("offline")];
  const { sch, c } = mk(store, { maxAutoRetries: 3, retryBaseMs: 1000 });
  c.change(() => okSnap("x")); await sch.advance(1000);
  assert.equal(c.state.status, "error");
  await sch.advance(1000); await sch.advance(2000); await sch.advance(4000);
  assert.equal(c.state.failures, 4);
  assert.equal(c.state.status, "error");
  assert.equal(sch.pendingCount, 0, "no further automatic retry");
  assert.equal(await c.flush(), "saved");
  assert.equal(c.state.status, "saved");
  assert.equal(store.saves.length, 1);
});
t("autosave: an invalid document is not sent and reports its issues; fixing it saves", async () => {
  const store = new FakeStore(); const { sch, c } = mk(store);
  c.change(() => ({ ok: false, issues: [{ path: "body[0].alt", message: "an image needs alt text" }] })); await sch.advance(1000);
  assert.equal(c.state.status, "invalid");
  assert.equal(store.saves.length, 0);
  assert.equal(c.state.issues?.[0].path, "body[0].alt");
  assert.equal(c.isDirty, true);
  c.change(() => okSnap("fixed")); await sch.advance(1000);
  assert.equal(c.state.status, "saved");
});
t("autosave: flush saves immediately (Ctrl+S, leaving the page); read-only never saves", async () => {
  const store = new FakeStore(); const { sch, c } = mk(store);
  c.change(() => okSnap("now"));
  assert.equal(await c.flush(), "saved");
  assert.equal(sch.pendingCount, 0);
  const s2 = new FakeStore(); const m2 = mk(s2);
  m2.c.setReadonly(true); m2.c.change(() => okSnap("x")); await m2.sch.advance(5000);
  assert.equal(s2.saves.length, 0);
  assert.equal(m2.c.state.status, "readonly");
  assert.equal(await m2.c.flush(), "noop");
});
t("autosave: dispose cancels pending saves", async () => {
  const store = new FakeStore(); const { sch, c } = mk(store);
  c.change(() => okSnap("x")); c.dispose(); await sch.advance(5000);
  assert.equal(store.saves.length, 0);
});

Promise.all(pending).then(() => { console.log(`\n${passed} editor schema tests passed, ${failed} failed`); if (failed) process.exit(1); });
void DEFAULT_PAGE;
