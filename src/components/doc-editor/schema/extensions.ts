/**
 * The TipTap schema for PBDoc. No React and no DOM at import time, so the same module builds the editor and the no-DOM schema tests.
 * Node and mark names are exactly the contract in `lib/products/playbook-ai/doc/tiptap.ts`.
 *
 * Structure rules enforced by the schema itself (the editor cannot produce anything else):
 *  - headings, clauses, tables, images, callouts, signature blocks, page breaks, dividers, spacers, TOC, conditionals, repeats: top level or
 *    inside conditional / repeat / section;  sections only at the top level;
 *  - table cells, callouts and list items hold paragraphs and lists only (no headings, no nested tables);
 *  - no merged cells (colspan and rowspan are pinned to 1).
 */
import { Extension, Mark, Node, mergeAttributes } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { Table, TableCell, TableHeader, TableRow } from "@tiptap/extension-table";
import { Plugin, PluginKey, type EditorState, type Transaction } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { liftListItem, sinkListItem, splitListItem, wrapInList } from "@tiptap/pm/schema-list";
import { randomId } from "@/lib/products/playbook-ai/doc/ids";
import { evalCondition } from "@/lib/products/playbook-ai/doc/variables";
import { CALLOUT_VARIANTS, FIELD_KINDS, HIGHLIGHT_COLORS, LIST_STYLES, PARTY_ROLES, TEXT_COLORS, VARIABLE_FORMATS } from "@/lib/products/playbook-ai/doc/types";
import { safeHref } from "@/components/doc-editor/core/links";
import { SHORTCUTS, shortcutKeys } from "@/components/doc-editor/core/shortcuts";
import { clauseLabelsFromPm } from "@/components/doc-editor/core/outline";

type Attrs = Record<string, unknown>;

const idAttr = {
  id: {
    default: null as string | null,
    parseHTML: (el: HTMLElement) => el.getAttribute("data-id"),
    renderHTML: (a: Attrs) => (a.id ? { "data-id": String(a.id) } : {}),
  },
};
const alignAttr = {
  align: {
    default: null as string | null,
    parseHTML: (el: HTMLElement) => {
      const v = el.style?.textAlign || el.getAttribute("data-align") || el.getAttribute("align");
      return v === "left" || v === "center" || v === "right" || v === "justify" ? v : null;
    },
    renderHTML: (a: Attrs) => (a.align ? { style: `text-align:${String(a.align)}`, "data-align": String(a.align) } : {}),
  },
};
const dataAttr = <T,>(name: string, def: T, parse: (v: string | null) => T = (v) => (v ?? def) as T) => ({
  default: def,
  parseHTML: (el: HTMLElement) => parse(el.getAttribute(`data-${name}`)),
  renderHTML: (a: Attrs) => (a[name] === null || a[name] === undefined ? {} : { [`data-${name}`]: String(a[name]) }),
});
const boolParse = (def: boolean) => (v: string | null) => (v === null ? def : v === "true");
const numParse = (def: number) => (v: string | null) => { const n = v === null ? NaN : Number(v); return Number.isFinite(n) ? n : def; };
const oneOf = <T extends string>(list: readonly T[], def: T) => (v: string | null): T => ((list as readonly string[]).includes(v ?? "") ? (v as T) : def);

// ---- block nodes ----------------------------------------------------------------------------------------------------

const Doc = Node.create({ name: "doc", topNode: true, content: "(block | section)+" });

export const PbParagraph = Node.create({
  name: "paragraph",
  group: "block cellBlock",
  content: "inline*",
  priority: 1000,
  addAttributes: () => ({ ...idAttr, ...alignAttr }),
  parseHTML: () => [{ tag: "p" }],
  renderHTML: ({ HTMLAttributes }) => ["p", HTMLAttributes, 0],
});

export const PbHeading = Node.create({
  name: "heading",
  group: "block",
  content: "inline*",
  defining: true,
  addAttributes: () => ({
    ...idAttr, ...alignAttr,
    level: { default: 1, parseHTML: (el: HTMLElement) => Math.min(Math.max(Number(/^H(\d)$/i.exec(el.tagName)?.[1] ?? 1), 1), 4), rendered: false },
  }),
  parseHTML: () => [1, 2, 3, 4].map((level) => ({ tag: `h${level}`, attrs: { level } })),
  renderHTML: ({ node, HTMLAttributes }) => [`h${Math.min(Math.max(Number(node.attrs.level), 1), 4)}`, HTMLAttributes, 0],
});

export const Clause = Node.create({
  name: "clause",
  group: "block",
  content: "inline*",
  defining: true,
  addAttributes: () => ({
    ...idAttr,
    level: dataAttr("level", 1, (v) => Math.min(Math.max(Math.round(numParse(1)(v)), 1), 3)),
    numbered: dataAttr("numbered", true, boolParse(true)),
  }),
  parseHTML: () => [{ tag: 'p[data-type="clause"]', priority: 60 }],
  renderHTML: ({ node, HTMLAttributes }) => ["p", mergeAttributes(HTMLAttributes, { "data-type": "clause", class: `pb-clause pb-clause-${node.attrs.level}${node.attrs.numbered ? "" : " pb-clause-plain"}` }), 0],
});

export const PbBulletList = Node.create({
  name: "bulletList",
  group: "block cellBlock",
  content: "listItem+",
  addAttributes: () => ({ ...idAttr }),
  parseHTML: () => [{ tag: "ul" }],
  renderHTML: ({ HTMLAttributes }) => ["ul", HTMLAttributes, 0],
});

export const PbOrderedList = Node.create({
  name: "orderedList",
  group: "block cellBlock",
  content: "listItem+",
  addAttributes: () => ({
    ...idAttr,
    style: { default: "decimal", parseHTML: (el: HTMLElement) => oneOf(LIST_STYLES, "decimal")(el.getAttribute("data-style")), rendered: false },
    start: {
      default: null as number | null,
      parseHTML: (el: HTMLElement) => { const n = Number(el.getAttribute("start")); return Number.isInteger(n) && n > 1 && n < 10000 ? n : null; },
      rendered: false,
    },
  }),
  parseHTML: () => [{ tag: "ol" }],
  renderHTML: ({ node, HTMLAttributes }) => {
    const type = ({ decimal: "decimal", alpha: "lower-alpha", roman: "lower-roman" } as Record<string, string>)[String(node.attrs.style)] ?? "decimal";
    return ["ol", mergeAttributes(HTMLAttributes, { "data-style": String(node.attrs.style), style: `list-style-type:${type}`, ...(node.attrs.start ? { start: String(node.attrs.start) } : {}) }), 0];
  },
});

export const PbListItem = Node.create({
  name: "listItem",
  content: "cellBlock+",
  defining: true,
  addAttributes: () => ({ ...idAttr }),
  parseHTML: () => [{ tag: "li" }],
  renderHTML: ({ HTMLAttributes }) => ["li", HTMLAttributes, 0],
});

export const PbTable = Table.extend({
  group: "block",
  addAttributes() {
    return {
      ...idAttr,
      colWidths: {
        default: null as number[] | null,
        parseHTML: () => null,
        rendered: false,
      },
      headerRow: dataAttr("header-row", true, boolParse(true)),
    };
  },
  renderHTML({ node, HTMLAttributes }) {
    const widths = Array.isArray(node.attrs.colWidths) ? (node.attrs.colWidths as number[]) : [];
    const first = node.firstChild;
    const cols = first ? first.childCount : widths.length;
    const colgroup = ["colgroup", {}, ...Array.from({ length: cols }, (_, i) => ["col", { style: `width:${widths.length === cols ? widths[i] : 100 / Math.max(cols, 1)}%` }])];
    return ["table", mergeAttributes(HTMLAttributes, { class: "pb-table", "data-header-row": String(node.attrs.headerRow) }), colgroup, ["tbody", 0]];
  },
}).configure({ resizable: false, View: null, allowTableNodeSelection: true });

const cellAttrs = () => ({
  ...idAttr,
  ...alignAttr,
  // prosemirror-tables needs these; they stay 1 so a merged cell can never exist.
  colspan: { default: 1, parseHTML: () => 1, rendered: false },
  rowspan: { default: 1, parseHTML: () => 1, rendered: false },
  colwidth: { default: null, parseHTML: () => null, rendered: false },
});
export const PbTableRow = TableRow.extend({ addAttributes: () => ({ ...idAttr }) });
export const PbTableCell = TableCell.extend({ content: "cellBlock+", addAttributes: cellAttrs });
export const PbTableHeader = TableHeader.extend({ content: "cellBlock+", addAttributes: cellAttrs });

export interface ImageOptions { resolveUrl: (fileId: string) => string | null }
export const PbImage = Node.create<ImageOptions>({
  name: "image",
  group: "block",
  atom: true,
  draggable: true,
  addOptions: () => ({ resolveUrl: () => null }),
  addAttributes: () => ({
    ...idAttr,
    fileId: { default: "", parseHTML: (el: HTMLElement) => el.getAttribute("data-file-id") ?? "", renderHTML: (a: Attrs) => ({ "data-file-id": String(a.fileId) }) },
    alt: { default: "", parseHTML: (el: HTMLElement) => el.querySelector("img")?.getAttribute("alt") ?? "", rendered: false },
    widthPct: dataAttr("width-pct", 100, numParse(100)),
    align: dataAttr("align", "left", oneOf(["left", "center", "right"] as const, "left")),
    caption: { default: null as string | null, parseHTML: (el: HTMLElement) => el.querySelector("figcaption")?.textContent || null, rendered: false },
  }),
  // Pasted images are never accepted: an image must come from the uploader so it has a file id.
  parseHTML: () => [{ tag: "figure[data-file-id]" }],
  renderHTML({ node, HTMLAttributes }) {
    const url = this.options.resolveUrl(String(node.attrs.fileId));
    const a = node.attrs;
    const kids: unknown[] = [["img", { src: url ?? "", alt: String(a.alt), style: `width:${Number(a.widthPct)}%` }]];
    if (a.caption) kids.push(["figcaption", {}, String(a.caption)]);
    return ["figure", mergeAttributes(HTMLAttributes, { class: `pb-image pb-image-${String(a.align)}` }), ...(kids as never[])];
  },
});

export const Callout = Node.create({
  name: "callout",
  group: "block",
  content: "cellBlock+",
  defining: true,
  addAttributes: () => ({ ...idAttr, variant: dataAttr("variant", "info", oneOf(CALLOUT_VARIANTS, "info")) }),
  parseHTML: () => [{ tag: 'div[data-type="callout"]' }],
  renderHTML: ({ node, HTMLAttributes }) => ["div", mergeAttributes(HTMLAttributes, { "data-type": "callout", class: `pb-callout pb-callout-${String(node.attrs.variant)}` }), 0],
});

const PARTY_LABEL: Record<string, string> = { company_signatory: "Company signatory", counterparty: "Counterparty", witness: "Witness", approver: "Approver" };
export const SignatureBlock = Node.create({
  name: "signatureBlock",
  group: "block",
  atom: true,
  draggable: true,
  addAttributes: () => ({
    ...idAttr,
    label: dataAttr("label", "Signature"),
    partyRole: dataAttr("party-role", "counterparty", oneOf(PARTY_ROLES, "counterparty")),
    showName: dataAttr("show-name", true, boolParse(true)),
    showDesignation: dataAttr("show-designation", true, boolParse(true)),
    showDate: dataAttr("show-date", true, boolParse(true)),
  }),
  parseHTML: () => [{ tag: 'div[data-type="signature"]' }],
  renderHTML({ node, HTMLAttributes }) {
    const a = node.attrs;
    // The same arrangement as the PDF: the heading, then one row per field (Signature, Name, Designation, Date): the label on the left and its line to
    // the right on the same baseline. The signature row is taller, with room to sign above the line.
    const row = (t: string, cls = "") => ["div", { class: `pb-sig-row${cls}` }, ["span", { class: "pb-sig-rl" }, t], ["span", { class: "pb-sig-rline" }]];
    const lines: unknown[] = [["div", { class: "pb-sig-label" }, String(a.label)], row("Signature", " pb-sig-tall")];
    if (a.showName) lines.push(row("Name"));
    if (a.showDesignation) lines.push(row("Designation"));
    if (a.showDate) lines.push(row("Date"));
    return ["div", mergeAttributes(HTMLAttributes, { "data-type": "signature", class: "pb-signature" }), ...(lines as never[])];
  },
});

const leaf = (name: string, extra: Record<string, unknown>, render: (node: { attrs: Attrs }) => [string, Attrs, ...unknown[]]) =>
  Node.create({
    name,
    group: "block",
    atom: true,
    selectable: true,
    addAttributes: () => ({ ...idAttr, ...extra }) as never,
    parseHTML: () => [{ tag: `div[data-type="${name}"]` }],
    renderHTML: ({ node, HTMLAttributes }) => {
      const [tag, attrs, ...kids] = render(node as { attrs: Attrs });
      return [tag, mergeAttributes(HTMLAttributes, attrs, { "data-type": name }), ...kids] as never;
    },
  });

export const PageBreak = leaf("pageBreak", {}, () => ["div", { class: "pb-pagebreak" }, ["span", {}, "Page break"]]);
export const Divider = leaf("divider", {}, () => ["div", { class: "pb-divider" }, ["hr", {}]]);
export const Spacer = leaf("spacer", { heightMm: dataAttr("height-mm", 5, numParse(5)) }, (n) => ["div", { class: "pb-spacer", style: `height:${Number(n.attrs.heightMm)}mm` }, ["span", {}, `${Number(n.attrs.heightMm)} mm space`]]);
export const Toc = leaf("toc", { levels: dataAttr("levels", 3, (v) => Math.min(Math.max(Math.round(numParse(3)(v)), 1), 4)) }, (n) => [
  "div", { class: "pb-toc" }, ["strong", {}, "Table of contents"], ["span", {}, `Headings 1 to ${Number(n.attrs.levels)}. Page numbers are filled in when the PDF is made.`],
]);

const CONDITION_TEXT: Record<string, string> = { eq: "is", neq: "is not", exists: "has a value", not_exists: "has no value", gt: "is more than", lt: "is less than" };
export const Conditional = Node.create({
  name: "conditional",
  group: "block",
  content: "block+",
  defining: true,
  isolating: true,
  addAttributes: () => ({
    ...idAttr,
    key: dataAttr("key", "party.name"),
    op: dataAttr("op", "exists"),
    value: { default: null as string | null, parseHTML: (el: HTMLElement) => el.getAttribute("data-value"), renderHTML: (a: Attrs) => (a.value === null || a.value === undefined ? {} : { "data-value": String(a.value) }) },
  }),
  parseHTML: () => [{ tag: 'div[data-type="conditional"]' }],
  renderHTML: ({ node, HTMLAttributes }) => {
    const a = node.attrs;
    const label = `Only if ${String(a.key)} ${CONDITION_TEXT[String(a.op)] ?? ""}${a.value !== null && a.value !== undefined && ["eq", "neq", "gt", "lt"].includes(String(a.op)) ? ` "${String(a.value)}"` : ""}`;
    return ["div", mergeAttributes(HTMLAttributes, { "data-type": "conditional", "data-label": label, class: "pb-container pb-conditional" }), 0];
  },
});

export const Repeat = Node.create({
  name: "repeat",
  group: "block",
  content: "block+",
  defining: true,
  isolating: true,
  addAttributes: () => ({ ...idAttr, source: dataAttr("source", "input.items"), itemVar: dataAttr("item-var", "item") }),
  parseHTML: () => [{ tag: 'div[data-type="repeat"]' }],
  renderHTML: ({ node, HTMLAttributes }) =>
    ["div", mergeAttributes(HTMLAttributes, { "data-type": "repeat", "data-label": `For each ${String(node.attrs.itemVar)} in ${String(node.attrs.source)}`, class: "pb-container pb-repeat" }), 0],
});

export const Section = Node.create({
  name: "section",
  group: "section",
  content: "block+",
  defining: true,
  isolating: true,
  addAttributes: () => ({
    ...idAttr,
    key: dataAttr("key", "section"),
    title: dataAttr("title", "Section"),
    aiMode: dataAttr("ai-mode", "fixed"),
    locked: dataAttr("locked", false, boolParse(false)),
  }),
  parseHTML: () => [{ tag: 'section[data-type="section"]' }],
  renderHTML: ({ node, HTMLAttributes }) =>
    ["section", mergeAttributes(HTMLAttributes, { "data-type": "section", "data-label": `${String(node.attrs.title)}${node.attrs.locked ? " (locked)" : ""}`, class: `pb-container pb-section${node.attrs.locked ? " pb-locked" : ""}` }), 0],
});

// ---- inline nodes ---------------------------------------------------------------------------------------------------

export const Variable = Node.create({
  name: "variable",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  addAttributes: () => ({
    key: dataAttr("key", ""),
    format: { default: null as string | null, parseHTML: (el: HTMLElement) => oneOf(VARIABLE_FORMATS, "text")(el.getAttribute("data-format")) , renderHTML: (a: Attrs) => (a.format ? { "data-format": String(a.format) } : {}) },
    fallback: { default: null as string | null, parseHTML: (el: HTMLElement) => el.getAttribute("data-fallback"), renderHTML: (a: Attrs) => (a.fallback ? { "data-fallback": String(a.fallback) } : {}) },
  }),
  parseHTML: () => [{ tag: "span[data-type=variable]" }],
  renderHTML: ({ node, HTMLAttributes }) => ["span", mergeAttributes(HTMLAttributes, { "data-type": "variable", class: "pb-var", "data-display": `{{${String(node.attrs.key)}}}` })],
});

export const Placeholder = Node.create({
  name: "placeholder",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  addAttributes: () => ({
    key: dataAttr("key", ""),
    label: dataAttr("label", ""),
    hint: { default: null as string | null, parseHTML: (el: HTMLElement) => el.getAttribute("data-hint"), renderHTML: (a: Attrs) => (a.hint ? { "data-hint": String(a.hint), title: String(a.hint) } : {}) },
  }),
  parseHTML: () => [{ tag: "span[data-type=placeholder]" }],
  renderHTML: ({ node, HTMLAttributes }) => ["span", mergeAttributes(HTMLAttributes, { "data-type": "placeholder", class: "pb-placeholder", "data-display": `[${String(node.attrs.label)}]` })],
});

const FIELD_DISPLAY: Record<string, string> = { pageNumber: "Page number", totalPages: "Total pages", docNumber: "Document number", version: "Version", date: "Date", title: "Title" };
export const Field = Node.create({
  name: "field",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  addAttributes: () => ({ field: dataAttr("field", "pageNumber", oneOf(FIELD_KINDS, "pageNumber")) }),
  parseHTML: () => [{ tag: "span[data-type=field]" }],
  renderHTML: ({ node, HTMLAttributes }) => ["span", mergeAttributes(HTMLAttributes, { "data-type": "field", class: "pb-field", "data-display": `‹${FIELD_DISPLAY[String(node.attrs.field)] ?? ""}›` })],
});

// ---- marks ----------------------------------------------------------------------------------------------------------

export const Superscript = Mark.create({
  name: "superscript", excludes: "subscript",
  parseHTML: () => [{ tag: "sup" }], renderHTML: () => ["sup", 0],
  addKeyboardShortcuts() { return { [shortcutKeys("superscript")]: () => this.editor.commands.toggleMark(this.name) }; },
});
export const Subscript = Mark.create({
  name: "subscript", excludes: "superscript",
  parseHTML: () => [{ tag: "sub" }], renderHTML: () => ["sub", 0],
  addKeyboardShortcuts() { return { [shortcutKeys("subscript")]: () => this.editor.commands.toggleMark(this.name) }; },
});
export const Highlight = Mark.create({
  name: "highlight",
  addAttributes: () => ({ color: dataAttr("color", "yellow", oneOf(HIGHLIGHT_COLORS, "yellow")) }),
  parseHTML: () => [{ tag: "mark" }],
  renderHTML: ({ HTMLAttributes, mark }) => ["mark", mergeAttributes(HTMLAttributes, { class: `pb-hl pb-hl-${String(mark.attrs.color)}` }), 0],
});
export const TextColor = Mark.create({
  name: "textColor",
  addAttributes: () => ({ color: dataAttr("color", "default", oneOf(TEXT_COLORS, "default")) }),
  parseHTML: () => [{ tag: "span[data-text-color]", getAttrs: (el) => ({ color: oneOf(TEXT_COLORS, "default")((el as HTMLElement).getAttribute("data-text-color")) }) }],
  renderHTML: ({ mark }) => ["span", { "data-text-color": String(mark.attrs.color), class: `pb-tc pb-tc-${String(mark.attrs.color)}` }, 0],
});

// ---- integrity plugin -----------------------------------------------------------------------------------------------

const ID_TYPES = (state: EditorState) => new Set(Object.values(state.schema.nodes).filter((t) => t.spec.attrs && "id" in t.spec.attrs).map((t) => t.name));

/**
 * Keeps the document inside what PBDoc can store, after every edit and paste:
 *  - every block has a unique id (splits and pastes copy ids);
 *  - table header cells follow the table's `headerRow`, `colWidths` always matches the column count;
 *  - section keys are unique and there is at most one table of contents;
 *  - links never sit on variables or fields.
 * Pure over an EditorState so tests can run it without a view.
 */
export function integrityTransaction(state: EditorState, newId: () => string = randomId): Transaction | null {
  const tr = state.tr;
  const withId = ID_TYPES(state);
  const seen = new Set<string>();
  const keys = new Set<string>();
  const removals: [number, number][] = [];
  let sawToc = false;
  const linkType = state.schema.marks.link;
  state.doc.descendants((node, pos) => {
    const name = node.type.name;
    if (name === "toc") {
      if (sawToc) { removals.push([pos, pos + node.nodeSize]); return false; }
      sawToc = true;
    }
    let attrs: Attrs | null = null;
    const set = (patch: Attrs) => { attrs = { ...(attrs ?? node.attrs), ...patch }; };
    if (withId.has(name)) {
      const id = node.attrs.id as string | null;
      if (!id || seen.has(id)) set({ id: newId() });
      seen.add((attrs ? (attrs as Attrs).id : id) as string);
    }
    if (name === "section") {
      let key = String(node.attrs.key || "section");
      if (keys.has(key)) { let n = 2; while (keys.has(`${key}_${n}`)) n++; key = `${key}_${n}`.slice(0, 40); set({ key }); }
      keys.add(key);
    }
    if (name === "table") {
      const cols = node.firstChild?.childCount ?? 0;
      const w = node.attrs.colWidths as number[] | null;
      if (cols && (!Array.isArray(w) || w.length !== cols || Math.abs(w.reduce((a, b) => a + b, 0) - 100) > 1)) {
        const base = Math.floor((1000 / cols)) / 10;
        const eq = Array.from({ length: cols }, () => base);
        eq[0] = Math.round((eq[0] + (100 - base * cols)) * 10) / 10;
        set({ colWidths: eq });
      }
    }
    if (attrs) tr.setNodeMarkup(pos, undefined, attrs, node.marks);
    if (name === "tableRow") {
      // handled below with the table (row index needed)
    }
    if (linkType && node.isInline && node.isAtom && !node.isText && linkType.isInSet(node.marks)) tr.removeMark(pos, pos + node.nodeSize, linkType);
    return true;
  });
  // Header cells follow the table's headerRow flag.
  state.doc.descendants((node, pos) => {
    if (node.type.name !== "table") return true;
    const header = !!node.attrs.headerRow;
    node.forEach((row, rowOffset, ri) => {
      row.forEach((cell, cellOffset) => {
        const want = header && ri === 0 ? "tableHeader" : "tableCell";
        if (cell.type.name !== want) {
          const at = tr.mapping.map(pos + 1 + rowOffset + 1 + cellOffset);
          tr.setNodeMarkup(at, state.schema.nodes[want], cell.attrs, cell.marks);
        }
      });
    });
    return false;
  });
  for (const [from, to] of removals.reverse()) tr.delete(tr.mapping.map(from), tr.mapping.map(to));
  return tr.docChanged || tr.steps.length ? tr.setMeta("addToHistory", false) : null;
}

export const integrityKey = new PluginKey("pbIntegrity");

export const Integrity = Extension.create({
  name: "pbIntegrity",
  addProseMirrorPlugins() {
    return [new Plugin({ key: integrityKey, appendTransaction: (trs, _old, state) => (trs.some((t) => t.docChanged) ? integrityTransaction(state) : null) })];
  },
});

// ---- view state plugin (labels, previews, find, comments) -----------------------------------------------------------

export interface ViewBreak {
  pos: number;
  height: number;
  /** Position inside a paragraph (a split between lines): the spacer is inline. */
  inline?: boolean;
  /** A table row after which a sheet starts: the header row at this position is repeated after the spacer. */
  repeatPos?: number;
  side?: number;
}
export interface PbViewState {
  /** "template" shows {{key}}; "preview" shows the resolved value or the fallback. */
  mode: "template" | "preview";
  values: Record<string, string>;
  find: { from: number; to: number }[];
  findActive: number;
  /** Block ids that have comments (host-provided): only marked, never edited here. */
  commented: ReadonlySet<string>;
  /** Display names of variables, for the highlighted blank shown when a value is not known ("[ Effective date ]"). */
  labels: Record<string, string>;
  /** Page spacers computed by the sheet view (never saved). */
  breaks: ViewBreak[];
  /** Read-only front and back matter the export adds (title block, control table, contents, approval), rendered to markup. */
  front: { key: string; html: string }[];
  back: { key: string; html: string }[];
  /** Hide the editor's own contents block (the export's standard one replaces it). */
  hideToc: boolean;
  /** Ids of conditional blocks the author chose to show although the export hides them. */
  reveal: string[];
  /** Show conditional text even when its condition does not apply. */
  showAll: boolean;
}
export const viewKey = new PluginKey<PbViewState>("pbView");
const EMPTY_VIEW: PbViewState = { mode: "template", values: {}, find: [], findActive: -1, commented: new Set(), labels: {}, breaks: [], front: [], back: [], hideToc: false, reveal: [], showAll: false };

const humanize = (key: string): string => { const t = (key.split(".").pop() ?? key).replace(/_/g, " "); return t.charAt(0).toUpperCase() + t.slice(1); };
const known = (v: unknown): boolean => v !== undefined && v !== null && String(v).trim() !== "";


/** A view-only spacer between sheets. Inside a paragraph it is an inline block, so the text continues on the next sheet; in a table it is a row. */
function spacerDom(br: ViewBreak, view: { nodeDOM(pos: number): unknown }, cols: number): HTMLElement {
  const wrap = (tag: string): HTMLElement => {
    const d = document.createElement(tag);
    d.className = "pb-pagespacer";
    d.setAttribute("contenteditable", "false");
    d.setAttribute("aria-hidden", "true");
    return d;
  };
  if (br.inline) { const d = wrap("span"); d.style.height = `${br.height}px`; return d; }
  if (cols > 0) {
    const tr = wrap("tr"); tr.className = "pb-pagespacer pb-pagespacer-row";
    const td = document.createElement("td"); td.colSpan = cols; td.style.cssText = `height:${br.height}px;padding:0;border:0;background:transparent`;
    tr.appendChild(td);
    return tr;
  }
  const d = wrap("div"); d.style.height = `${br.height}px`; return d;
}

function repeatedHeader(pos: number, view: { nodeDOM(pos: number): unknown }): HTMLElement {
  const src = view.nodeDOM(pos) as HTMLElement | null;
  const row = (src && src.nodeType === 1 ? src.cloneNode(true) : document.createElement("tr")) as HTMLElement;
  row.className = "pb-pagespacer pb-pagerepeat";
  row.setAttribute("contenteditable", "false");
  row.setAttribute("aria-hidden", "true");
  row.removeAttribute("data-id");
  return row;
}

/** A small non-printing dot in the margin outside the sheet, beside a conditional block the export would not print for the current values. */
function conditionMarker(key: string): HTMLElement {
  const d = document.createElement("div");
  d.className = "pb-cond-handle";
  d.setAttribute("contenteditable", "false");
  const dot = document.createElement("span");
  dot.className = "pb-cond-dot";
  dot.textContent = "alt";
  dot.title = `Conditional text: the export leaves it out for the current value of ${key}`;
  d.appendChild(dot);
  return d;
}

const hashOf = (t: string): string => { let h = 0; for (let i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) | 0; return String(h); };

function matterDom(html: string, key: string): HTMLElement {
  const d = document.createElement("div");
  d.className = "pb-matter";
  d.setAttribute("contenteditable", "false");
  d.setAttribute("data-matter", key);
  d.innerHTML = html;
  return d;
}

/** A conditional block the export would not print for the known values and that the author has not chosen to show. */
export function isHiddenConditional(n: { attrs: Record<string, unknown> }, view: PbViewState): boolean {
  if (view.mode !== "preview" || view.showAll || Object.keys(view.values).length === 0) return false;
  const holds = evalCondition({ key: String(n.attrs.key), op: n.attrs.op as never, value: n.attrs.value === null || n.attrs.value === undefined ? undefined : String(n.attrs.value) }, (k) => view.values[k]);
  return !holds && !view.reveal.includes(String(n.attrs.id ?? ""));
}

function viewDecorations(state: EditorState, view: PbViewState): DecorationSet {
  const decos: Decoration[] = [];
  const labels = clauseLabelsFromPm(state.doc, (n) => n.type.name === "conditional" && isHiddenConditional(n, view));
  state.doc.descendants((node, pos) => {
    const name = node.type.name;
    if (name === "clause" && node.attrs.numbered) {
      const l = labels.get(String(node.attrs.id));
      if (l) decos.push(Decoration.node(pos, pos + node.nodeSize, { "data-label": l }));
    } else if (name === "variable") {
      // The value as the export will print it; a blank that is highlighted like the export's when it is not known yet.
      const key = String(node.attrs.key);
      const v = view.values[key];
      const shown = known(v) ? String(v) : node.attrs.fallback ? String(node.attrs.fallback) : "";
      decos.push(Decoration.node(pos, pos + 1, shown ? { "data-display": shown, class: "pb-var--resolved", title: key } : { "data-display": `[ ${view.labels[key] ?? humanize(key)} ]`, class: "pb-var--missing", title: key }));
    } else if (name === "placeholder") {
      const v = view.values[String(node.attrs.key)];
      decos.push(Decoration.node(pos, pos + 1, known(v) ? { "data-display": String(v), class: "pb-var--resolved" } : { "data-display": `[ ${String(node.attrs.label)} ]`, class: "pb-var--missing" }));
    } else if (name === "toc" && view.hideToc) {
      decos.push(Decoration.node(pos, pos + node.nodeSize, { class: "pb-cond-off" }));
    } else if (name === "conditional" && Object.keys(view.values).length > 0) {
      // The export's own evaluator. Print/Export view hides a branch that does not apply, exactly as the export does; the editing view shows ALL text
      // and marks such a branch with a small dot in the margin outside the sheet.
      const holds = evalCondition({ key: String(node.attrs.key), op: node.attrs.op as never, value: node.attrs.value === null || node.attrs.value === undefined ? undefined : String(node.attrs.value) }, (k) => view.values[k]);
      if (!holds && view.mode === "preview") decos.push(Decoration.node(pos, pos + node.nodeSize, { class: "pb-cond-off" }));
      else if (!holds) decos.push(Decoration.widget(pos, () => conditionMarker(String(node.attrs.key)), { side: -50, key: `cm-${String(node.attrs.id ?? pos)}`, ignoreSelection: true }));
    }
    if (view.commented.size && node.attrs.id && view.commented.has(String(node.attrs.id))) decos.push(Decoration.node(pos, pos + node.nodeSize, { class: "pb-commented" }));
    return true;
  });
  const size = state.doc.content.size;
  view.front.forEach((m, j) => decos.push(Decoration.widget(0, () => matterDom(m.html, m.key), { side: -100 + 2 * j, key: `front-${m.key}-${hashOf(m.html)}`, ignoreSelection: true })));
  view.back.forEach((m, j) => decos.push(Decoration.widget(size, () => matterDom(m.html, m.key), { side: 50 + 2 * j, key: `back-${m.key}-${hashOf(m.html)}`, ignoreSelection: true })));
  for (const br of view.breaks) {
    if (br.pos < 0 || br.pos > size) continue;
    const $p = state.doc.resolve(br.pos);
    const inTable = !br.inline && $p.parent.type.name === "table";
    const cols = inTable ? ($p.parent.firstChild?.childCount ?? 1) : 0;
    const side = br.side ?? -1;
    decos.push(Decoration.widget(br.pos, (v) => spacerDom(br, v, cols), { side, key: `pg-${br.pos}-${br.height}-${br.inline ? "i" : "b"}-${cols}`, ignoreSelection: true }));
    if (inTable && br.repeatPos !== undefined) decos.push(Decoration.widget(br.pos, (v) => repeatedHeader(br.repeatPos as number, v), { side: side + 0.5, key: `pgr-${br.pos}-${br.repeatPos}`, ignoreSelection: true }));
  }
  view.find.forEach((m, i) => decos.push(Decoration.inline(m.from, m.to, { class: i === view.findActive ? "pb-find pb-find-active" : "pb-find" })));
  return DecorationSet.create(state.doc, decos);
}

export const ViewState = Extension.create({
  name: "pbViewState",
  addProseMirrorPlugins() {
    return [
      new Plugin<PbViewState>({
        key: viewKey,
        state: {
          init: () => EMPTY_VIEW,
          apply: (tr, prev) => {
            const meta = tr.getMeta(viewKey) as Partial<PbViewState> | undefined;
            let next = meta ? { ...prev, ...meta } : prev;
            if (tr.docChanged && next.breaks.length && !meta?.breaks) next = { ...next, breaks: next.breaks.map((b) => ({ ...b, pos: tr.mapping.map(b.pos), repeatPos: b.repeatPos === undefined ? undefined : tr.mapping.map(b.repeatPos) })) };
            if (tr.docChanged && next.find.length && !meta?.find) next = { ...next, find: next.find.map((m) => ({ from: tr.mapping.map(m.from), to: tr.mapping.map(m.to) })).filter((m) => m.to > m.from) };
            return next;
          },
        },
        props: { decorations(state) { return viewDecorations(state, viewKey.getState(state) ?? EMPTY_VIEW); } },
      }),
    ];
  },
});

// ---- keyboard ------------------------------------------------------------------------------------------------------

/** The editor-scoped shortcut ids this extension binds. The test asserts it equals the table in shortcuts.ts. */
export const BOUND_SHORTCUT_IDS: readonly string[] = [
  "bold", "italic", "underline", "strike", "superscript", "subscript", "alignLeft", "alignCenter", "alignRight", "alignJustify", "paragraph",
  "heading1", "heading2", "heading3", "heading4", "clause", "bulletList", "orderedList", "indent", "outdent", "exitBlock", "pageBreak", "undo", "redo", "redoAlt",
];

export const Keys = Extension.create({
  name: "pbKeys",
  priority: 200,
  addKeyboardShortcuts() {
    const ed = this.editor;
    const align = (a: string) => () => ed.chain().focus().command(({ tr, state, dispatch }) => {
      const { from, to } = state.selection;
      let changed = false;
      state.doc.nodesBetween(from, to, (n, pos) => {
        if ((n.type.name === "paragraph" || n.type.name === "heading") ) { tr.setNodeMarkup(pos, undefined, { ...n.attrs, align: a === "left" ? null : a }); changed = true; }
        return true;
      });
      if (changed && dispatch) dispatch(tr);
      return changed;
    }).run();
    const setBlock = (type: string, attrs?: Attrs) => () => ed.chain().focus().setNode(type, attrs).run();
    const toggleList = (type: "bulletList" | "orderedList") => () => {
      const t = ed.state.schema.nodes[type];
      const { $from } = ed.state.selection;
      for (let d = $from.depth; d > 0; d--) if ($from.node(d).type === t) return liftListItem(ed.state.schema.nodes.listItem)(ed.state, ed.view.dispatch);
      return wrapInList(t)(ed.state, ed.view.dispatch);
    };
    const handlers: Record<string, () => boolean> = {
      bold: () => ed.commands.toggleMark("bold"), italic: () => ed.commands.toggleMark("italic"), underline: () => ed.commands.toggleMark("underline"),
      strike: () => ed.commands.toggleMark("strike"),
      superscript: () => ed.commands.toggleMark("superscript"), subscript: () => ed.commands.toggleMark("subscript"),
      alignLeft: align("left"), alignCenter: align("center"), alignRight: align("right"), alignJustify: align("justify"),
      paragraph: setBlock("paragraph"),
      heading1: setBlock("heading", { level: 1 }), heading2: setBlock("heading", { level: 2 }), heading3: setBlock("heading", { level: 3 }), heading4: setBlock("heading", { level: 4 }),
      clause: () => ed.chain().focus().setNode("clause", { level: 1, numbered: true }).run(),
      bulletList: toggleList("bulletList"), orderedList: toggleList("orderedList"),
      indent: () => sinkListItem(ed.state.schema.nodes.listItem)(ed.state, ed.view.dispatch) || sinkClause(ed, +1),
      outdent: () => liftListItem(ed.state.schema.nodes.listItem)(ed.state, ed.view.dispatch) || sinkClause(ed, -1),
      exitBlock: () => exitBlock(ed),
      pageBreak: () => ed.chain().focus().insertContent({ type: "pageBreak" }).run(),
      undo: () => ed.commands.undo(), redo: () => ed.commands.redo(), redoAlt: () => ed.commands.redo(),
    };
    const out: Record<string, () => boolean> = {};
    for (const s of SHORTCUTS) {
      if (s.scope !== "editor") continue;
      const h = handlers[s.id];
      if (h && s.id !== "bold" && s.id !== "italic" && s.id !== "underline" && s.id !== "superscript" && s.id !== "subscript") out[s.keys] = h;
    }
    // Enter splits list items; Backspace at the start of a list item lifts it.
    out.Enter = () => splitListItem(ed.state.schema.nodes.listItem)(ed.state, ed.view.dispatch);
    out.Backspace = () => {
      const { $from, empty } = ed.state.selection;
      if (!empty || $from.parentOffset !== 0) return false;
      for (let d = $from.depth; d > 0; d--) if ($from.node(d).type.name === "listItem") return liftListItem(ed.state.schema.nodes.listItem)(ed.state, ed.view.dispatch);
      return false;
    };
    return out;
  },
});

type Ed = { state: EditorState; view: { dispatch: (tr: Transaction) => void } };

function sinkClause(ed: Ed, delta: 1 | -1): boolean {
  const { $from } = ed.state.selection;
  const node = $from.parent;
  if (node.type.name !== "clause") return false;
  const level = Math.min(Math.max(Number(node.attrs.level) + delta, 1), 3);
  if (level === node.attrs.level) return true;
  ed.view.dispatch(ed.state.tr.setNodeMarkup($from.before(), undefined, { ...node.attrs, level }));
  return true;
}

/** Ctrl+Enter: adds an empty paragraph after the outermost block that holds the cursor (the way out of a callout, condition or table). */
function exitBlock(ed: Ed): boolean {
  const { $from } = ed.state.selection;
  if ($from.depth < 1) return false;
  const after = $from.after(Math.max(1, $from.depth > 1 ? $from.depth - 1 : 1));
  const para = ed.state.schema.nodes.paragraph.create();
  const tr = ed.state.tr.insert(after, para);
  ed.view.dispatch(tr.scrollIntoView());
  return true;
}

// ---- assembly -------------------------------------------------------------------------------------------------------

export interface SchemaOptions { resolveImageUrl?: (fileId: string) => string | null }

export function buildExtensions(opts: SchemaOptions = {}) {
  return [
    Doc,
    StarterKit.configure({
      document: false, paragraph: false, heading: false, bulletList: false, orderedList: false, listItem: false, listKeymap: false,
      blockquote: false, code: false, codeBlock: false, horizontalRule: false, trailingNode: false,
      link: {
        openOnClick: false, autolink: true, linkOnPaste: true, defaultProtocol: "https", protocols: ["mailto", "tel"],
        isAllowedUri: (url: string) => safeHref(url) !== null,
        HTMLAttributes: { rel: "noopener noreferrer nofollow", target: "_blank", class: "pb-link" },
      },
    }),
    PbParagraph, PbHeading, Clause, PbBulletList, PbOrderedList, PbListItem,
    PbTable, PbTableRow, PbTableHeader, PbTableCell,
    PbImage.configure({ resolveUrl: opts.resolveImageUrl ?? (() => null) }),
    Callout, SignatureBlock, PageBreak, Divider, Spacer, Toc, Conditional, Repeat, Section,
    Variable, Placeholder, Field,
    Superscript, Subscript, Highlight, TextColor,
    Integrity, ViewState, Keys,
  ];
}
