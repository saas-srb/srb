/**
 * PBDoc <-> TipTap/ProseMirror JSON. Pure, client-safe.
 *
 * This file is the CONTRACT for the editor schema built in A6: the node and mark names below are exactly the extensions the editor must
 * register. `docToTiptap` is lossless for any valid PBDoc; `tiptapToDoc` accepts whatever the editor produced, converts it back and then
 * runs the same `parseDoc` validation as every other entry point, so the editor cannot smuggle in structure the renderers cannot draw.
 * Page settings are not part of the ProseMirror document (they live in the document record), so they are passed alongside.
 *
 *   PBDoc            TipTap
 *   paragraph        paragraph        attrs { id, align }
 *   heading          heading          attrs { id, level, align }
 *   clause           clause           attrs { id, level, numbered }
 *   bulletList       bulletList > listItem(attrs { id }) > block+            attrs { id }
 *   orderedList      orderedList      attrs { id, style, start }
 *   table            table > tableRow > tableHeader | tableCell > block+     attrs { id, colWidths, headerRow } / { id } / { id, align }
 *   image            image            attrs { id, fileId, alt, widthPct, align, caption }
 *   callout          callout          attrs { id, variant } > block+
 *   signatureBlock   signatureBlock   attrs { id, label, partyRole, showName, showDesignation, showDate }
 *   pageBreak, divider, toc, spacer   attrs { id } (+ levels / heightMm)
 *   conditional      conditional      attrs { id, key, op, value } > block+
 *   repeat           repeat           attrs { id, source, itemVar } > block+
 *   section          section          attrs { id, key, title, aiMode, locked } > block+
 *   text             text             marks: bold italic underline strike superscript subscript link{href} highlight{color} textColor{color}
 *   var              variable         attrs { key, format, fallback } (inline atom; may carry marks)
 *   placeholder      placeholder      attrs { key, label, hint }       (inline atom)
 *   field            field            attrs { field }                  (inline atom)
 *   hardBreak        hardBreak
 */

import type { AnyBlock, InlineNode, ListItem, Mark, PBDoc } from "@/lib/products/playbook-ai/doc/types";
import type { PageSettings } from "@/lib/products/playbook-ai/doc/page";
import { parseDoc, type ParseOptions, type ParseResult } from "@/lib/products/playbook-ai/doc/validate";
import { PBDOC_SCHEMA_VERSION } from "@/lib/products/playbook-ai/doc/types";

export interface TiptapMark { type: string; attrs?: Record<string, unknown> }
export interface TiptapNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: TiptapNode[];
  text?: string;
  marks?: TiptapMark[];
}
export interface TiptapDocs { body: TiptapNode; header: TiptapNode; footer: TiptapNode }

const compact = (o: Record<string, unknown>): Record<string, unknown> => {
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(o)) if (o[k] !== undefined) out[k] = o[k];
  return out;
};

// ---- PBDoc to TipTap -------------------------------------------------------------------------------------------------

const markToTiptap = (m: Mark): TiptapMark => {
  switch (m.type) {
    case "sup": return { type: "superscript" };
    case "sub": return { type: "subscript" };
    case "link": return { type: "link", attrs: { href: m.href } };
    case "highlight": return { type: "highlight", attrs: { color: m.color } };
    case "color": return { type: "textColor", attrs: { color: m.color } };
    default: return { type: m.type };
  }
};

function inlineToTiptap(n: InlineNode): TiptapNode {
  const marks = "marks" in n && n.marks?.length ? n.marks.map(markToTiptap) : undefined;
  switch (n.type) {
    case "text": return compact({ type: "text", text: n.text, marks }) as unknown as TiptapNode;
    case "var": return compact({ type: "variable", attrs: compact({ key: n.key, format: n.format, fallback: n.fallback }), marks }) as unknown as TiptapNode;
    case "placeholder": return { type: "placeholder", attrs: compact({ key: n.key, label: n.label, hint: n.hint }) };
    case "field": return compact({ type: "field", attrs: { field: n.field }, marks }) as unknown as TiptapNode;
    case "hardBreak": return { type: "hardBreak" };
  }
}

const withContent = (type: string, attrs: Record<string, unknown>, content: TiptapNode[]): TiptapNode => {
  const n: TiptapNode = { type, attrs: compact(attrs) };
  if (content.length) n.content = content;
  return n;
};

function itemToTiptap(i: ListItem): TiptapNode {
  return withContent("listItem", { id: i.id }, i.content.map(blockToTiptap));
}

export function blockToTiptap(b: AnyBlock): TiptapNode {
  switch (b.type) {
    case "paragraph": return withContent("paragraph", { id: b.id, align: b.align }, b.content.map(inlineToTiptap));
    case "heading": return withContent("heading", { id: b.id, level: b.level, align: b.align }, b.content.map(inlineToTiptap));
    case "clause": return withContent("clause", { id: b.id, level: b.level, numbered: b.numbered }, b.content.map(inlineToTiptap));
    case "bulletList": return withContent("bulletList", { id: b.id }, b.items.map(itemToTiptap));
    case "orderedList": return withContent("orderedList", { id: b.id, style: b.style, start: b.start }, b.items.map(itemToTiptap));
    case "table":
      return withContent("table", { id: b.id, colWidths: b.colWidths, headerRow: b.headerRow }, b.rows.map((r, ri) =>
        withContent("tableRow", { id: r.id }, r.cells.map((c) => withContent(b.headerRow && ri === 0 ? "tableHeader" : "tableCell", { id: c.id, align: c.align }, c.content.map(blockToTiptap))))));
    case "image": return { type: "image", attrs: compact({ id: b.id, fileId: b.fileId, alt: b.alt, widthPct: b.widthPct, align: b.align, caption: b.caption }) };
    case "callout": return withContent("callout", { id: b.id, variant: b.variant }, b.content.map(blockToTiptap));
    case "signatureBlock": return { type: "signatureBlock", attrs: { id: b.id, label: b.label, partyRole: b.partyRole, showName: b.showName, showDesignation: b.showDesignation, showDate: b.showDate } };
    case "pageBreak": return { type: "pageBreak", attrs: { id: b.id } };
    case "divider": return { type: "divider", attrs: { id: b.id } };
    case "spacer": return { type: "spacer", attrs: { id: b.id, heightMm: b.heightMm } };
    case "toc": return { type: "toc", attrs: { id: b.id, levels: b.levels } };
    case "conditional": return withContent("conditional", { id: b.id, key: b.when.key, op: b.when.op, value: b.when.value }, b.children.map(blockToTiptap));
    case "repeat": return withContent("repeat", { id: b.id, source: b.source, itemVar: b.itemVar }, b.children.map(blockToTiptap));
    case "section": return withContent("section", { id: b.id, key: b.key, title: b.title, aiMode: b.aiMode, locked: b.locked }, b.children.map(blockToTiptap));
  }
}

export function docToTiptap(doc: PBDoc): TiptapDocs {
  const wrap = (blocks: readonly AnyBlock[]): TiptapNode => ({ type: "doc", content: blocks.map(blockToTiptap) });
  return { body: wrap(doc.body), header: wrap(doc.header), footer: wrap(doc.footer) };
}

// ---- TipTap to PBDoc (untrusted input; parseDoc validates) -----------------------------------------------------------

type Raw = Record<string, unknown>;
const attrs = (n: TiptapNode): Raw => (n.attrs ?? {}) as Raw;

function markFromTiptap(m: TiptapMark): Raw {
  const a = (m.attrs ?? {}) as Raw;
  switch (m.type) {
    case "superscript": return { type: "sup" };
    case "subscript": return { type: "sub" };
    case "link": return { type: "link", href: a.href };
    case "highlight": return { type: "highlight", color: a.color };
    case "textColor": return { type: "color", color: a.color };
    default: return { type: m.type };
  }
}

function inlineFromTiptap(n: TiptapNode): Raw {
  const marks = n.marks?.length ? n.marks.map(markFromTiptap) : undefined;
  const a = attrs(n);
  switch (n.type) {
    case "text": return compact({ type: "text", text: n.text ?? "", marks });
    case "variable": return compact({ type: "var", key: a.key, format: a.format ?? undefined, fallback: a.fallback ?? undefined, marks });
    case "placeholder": return compact({ type: "placeholder", key: a.key, label: a.label, hint: a.hint ?? undefined });
    case "field": return compact({ type: "field", field: a.field, marks });
    case "hardBreak": return { type: "hardBreak" };
    default: return { type: n.type };
  }
}

const kids = (n: TiptapNode) => n.content ?? [];
const inlines = (n: TiptapNode) => kids(n).map(inlineFromTiptap);

function itemFromTiptap(n: TiptapNode): Raw {
  return { id: attrs(n).id, content: kids(n).map(blockFromTiptap) };
}

export function blockFromTiptap(n: TiptapNode): Raw {
  const a = attrs(n);
  switch (n.type) {
    case "paragraph": return compact({ id: a.id, type: "paragraph", align: a.align ?? undefined, content: inlines(n) });
    case "heading": return compact({ id: a.id, type: "heading", level: a.level, align: a.align ?? undefined, content: inlines(n) });
    case "clause": return { id: a.id, type: "clause", level: a.level, numbered: a.numbered, content: inlines(n) };
    case "bulletList": return { id: a.id, type: "bulletList", items: kids(n).map(itemFromTiptap) };
    case "orderedList": return compact({ id: a.id, type: "orderedList", style: a.style, start: a.start ?? undefined, items: kids(n).map(itemFromTiptap) });
    case "table":
      return {
        id: a.id, type: "table", colWidths: a.colWidths, headerRow: a.headerRow,
        rows: kids(n).map((r) => ({
          id: attrs(r).id,
          cells: kids(r).map((c) => compact({ id: attrs(c).id, align: attrs(c).align ?? undefined, content: kids(c).map(blockFromTiptap) })),
        })),
      };
    case "image": return compact({ id: a.id, type: "image", fileId: a.fileId, alt: a.alt, widthPct: a.widthPct, align: a.align, caption: a.caption ?? undefined });
    case "callout": return { id: a.id, type: "callout", variant: a.variant, content: kids(n).map(blockFromTiptap) };
    case "signatureBlock": return { id: a.id, type: "signatureBlock", label: a.label, partyRole: a.partyRole, showName: a.showName, showDesignation: a.showDesignation, showDate: a.showDate };
    case "pageBreak": return { id: a.id, type: "pageBreak" };
    case "divider": return { id: a.id, type: "divider" };
    case "spacer": return { id: a.id, type: "spacer", heightMm: a.heightMm };
    case "toc": return { id: a.id, type: "toc", levels: a.levels };
    case "conditional": return { id: a.id, type: "conditional", when: compact({ key: a.key, op: a.op, value: a.value ?? undefined }), children: kids(n).map(blockFromTiptap) };
    case "repeat": return { id: a.id, type: "repeat", source: a.source, itemVar: a.itemVar, children: kids(n).map(blockFromTiptap) };
    case "section": return { id: a.id, type: "section", key: a.key, title: a.title, aiMode: a.aiMode, locked: a.locked, children: kids(n).map(blockFromTiptap) };
    default: return { id: a.id, type: n.type };
  }
}

/**
 * Converts editor output back to a validated PBDoc. Ids missing from editor-created nodes are assigned by default (the editor creates new
 * blocks without ids until its id extension runs); pass `assignIds: false` to require them.
 */
export function tiptapToDoc(t: TiptapDocs, page: PageSettings, options: ParseOptions = {}): ParseResult {
  const top = (d: TiptapNode, name: string): Raw[] | null => {
    if (!d || d.type !== "doc") return null;
    void name;
    return kids(d).map(blockFromTiptap);
  };
  const body = top(t.body, "body");
  const header = top(t.header, "header");
  const footer = top(t.footer, "footer");
  if (!body || !header || !footer) return { ok: false, issues: [{ path: "", message: 'each of body, header and footer must be a TipTap "doc" node' }] };
  return parseDoc({ schemaVersion: PBDOC_SCHEMA_VERSION, lang: "en", page, header, footer, body }, { assignIds: true, ...options });
}
