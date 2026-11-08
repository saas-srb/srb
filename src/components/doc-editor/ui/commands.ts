import type { Editor } from "@tiptap/core";
import { liftListItem, wrapInList } from "@tiptap/pm/schema-list";
import type { EditorState } from "@tiptap/pm/state";
import type { Node as PMNode } from "@tiptap/pm/model";
import { PBDOC_LIMITS, FILE_ID_RE } from "@/lib/products/playbook-ai/doc/limits";
import type { PartyRole, CalloutVariant, ListStyle } from "@/lib/products/playbook-ai/doc/types";
import { isValidVariableKey, placeholderKey } from "@/components/doc-editor/core/variables";

export const IMAGE_RULES = { types: ["image/png", "image/jpeg"], maxBytes: 5 * 1024 * 1024 } as const;
const CONTAINERS = new Set(["conditional", "repeat", "section"]);

export type CommandResult = { ok: true } | { ok: false; message: string };
const fail = (message: string): CommandResult => ({ ok: false, message });
const OK: CommandResult = { ok: true };

const emptyPara = () => ({ type: "paragraph" });

/** Depth of the nearest block that sits directly in the document or in a container: new container blocks are inserted after it. */
function topLevelAnchor(state: EditorState): { after: number; containers: number } {
  const { $from } = state.selection;
  let containers = 0;
  for (let d = 1; d <= $from.depth; d++) if (CONTAINERS.has($from.node(d).type.name)) containers++;
  for (let d = $from.depth; d >= 1; d--) {
    const parent = d === 1 ? state.doc : $from.node(d - 1);
    if (parent.type.name === "doc" || CONTAINERS.has(parent.type.name)) return { after: $from.after(d), containers };
  }
  return { after: state.doc.content.size, containers };
}

function insertAfterAnchor(editor: Editor, json: Record<string, unknown>): void {
  const { after } = topLevelAnchor(editor.state);
  editor.chain().focus().insertContentAt(after, json).run();
}

export const hasNode = (doc: PMNode, name: string): boolean => {
  let found = false;
  doc.descendants((n) => { if (n.type.name === name) found = true; return !found; });
  return found;
};

export function insertTable(editor: Editor, rows: number, cols: number): CommandResult {
  const r = Math.min(Math.max(Math.floor(rows), 1), 50);
  const c = Math.min(Math.max(Math.floor(cols), 1), PBDOC_LIMITS.maxTableCols);
  const base = Math.floor(1000 / c) / 10;
  const widths = Array.from({ length: c }, () => base);
  widths[0] = Math.round((widths[0] + (100 - base * c)) * 10) / 10;
  const cell = (type: string) => ({ type, content: [emptyPara()] });
  const rowsJson = Array.from({ length: r }, (_, i) => ({ type: "tableRow", content: Array.from({ length: c }, () => cell(i === 0 ? "tableHeader" : "tableCell")) }));
  const { $from } = editor.state.selection;
  for (let d = $from.depth; d > 0; d--) if (["tableCell", "tableHeader", "callout", "listItem"].includes($from.node(d).type.name)) return fail("A table cannot go inside a table, list or callout. Move the cursor out first.");
  editor.chain().focus().insertContent({ type: "table", attrs: { headerRow: true, colWidths: widths }, content: rowsJson }).run();
  return OK;
}

export function insertCallout(editor: Editor, variant: CalloutVariant): CommandResult {
  editor.chain().focus().insertContent({ type: "callout", attrs: { variant }, content: [emptyPara()] }).run();
  return OK;
}

export function insertSignature(editor: Editor, role: PartyRole, label: string): CommandResult {
  const l = label.trim();
  if (!l) return fail("Give the signature block a label such as 'For the Company'.");
  editor.chain().focus().insertContent({ type: "signatureBlock", attrs: { label: l.slice(0, PBDOC_LIMITS.maxLabel), partyRole: role, showName: true, showDesignation: true, showDate: true } }).run();
  return OK;
}

export function insertSimple(editor: Editor, type: "pageBreak" | "divider" | "spacer"): CommandResult {
  editor.chain().focus().insertContent(type === "spacer" ? { type, attrs: { heightMm: 10 } } : { type }).run();
  return OK;
}

export function insertToc(editor: Editor): CommandResult {
  if (hasNode(editor.state.doc, "toc")) return fail("The document already has a table of contents.");
  editor.chain().focus().insertContent({ type: "toc", attrs: { levels: 3 } }).run();
  return OK;
}

export function insertSection(editor: Editor, title: string): CommandResult {
  const t = title.trim();
  if (!t) return fail("A section needs a title.");
  const slug = t.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").replace(/^[0-9]+/, "").slice(0, 36) || "section";
  const keys = new Set<string>();
  editor.state.doc.descendants((n) => { if (n.type.name === "section") keys.add(String(n.attrs.key)); return true; });
  let key = slug; let i = 2;
  while (keys.has(key)) key = `${slug}_${i++}`;
  // Sections only exist at the top level of the body.
  let pos = editor.state.doc.content.size;
  const { $from } = editor.state.selection;
  if ($from.depth >= 1) pos = $from.after(1);
  editor.chain().focus().insertContentAt(pos, { type: "section", attrs: { key, title: t.slice(0, PBDOC_LIMITS.maxTitle), aiMode: "fixed", locked: false }, content: [emptyPara()] }).run();
  return OK;
}

export function insertConditional(editor: Editor, keyName: string): CommandResult {
  if (!isValidVariableKey(keyName)) return fail("Choose a variable such as party.type.");
  if (topLevelAnchor(editor.state).containers >= PBDOC_LIMITS.maxContainerDepth) return fail(`Sections and conditions can be nested up to ${PBDOC_LIMITS.maxContainerDepth} levels.`);
  insertAfterAnchor(editor, { type: "conditional", attrs: { key: keyName, op: "exists", value: null }, content: [emptyPara()] });
  return OK;
}

export function insertRepeat(editor: Editor, source: string, itemVar: string): CommandResult {
  if (!isValidVariableKey(source)) return fail("Choose the list to repeat over, such as input.benefits.");
  if (!/^[a-z][a-z0-9_]{0,39}$/.test(itemVar)) return fail("The item name is a lower-case word such as item.");
  if (topLevelAnchor(editor.state).containers >= PBDOC_LIMITS.maxContainerDepth) return fail(`Sections and conditions can be nested up to ${PBDOC_LIMITS.maxContainerDepth} levels.`);
  insertAfterAnchor(editor, { type: "repeat", attrs: { source, itemVar }, content: [emptyPara()] });
  return OK;
}

export function insertVariable(editor: Editor, key: string, format?: string): CommandResult {
  if (!isValidVariableKey(key)) return fail("That is not a valid variable name.");
  editor.chain().focus().insertContent({ type: "variable", attrs: { key, format: format ?? null, fallback: null } }).run();
  return OK;
}

export function insertPlaceholder(editor: Editor, label: string, hint: string): CommandResult {
  const l = label.trim();
  const key = placeholderKey(l);
  if (!l || !key) return fail("Name the field the person must fill in, for example 'Joining date'.");
  editor.chain().focus().insertContent({ type: "placeholder", attrs: { key, label: l.slice(0, PBDOC_LIMITS.maxLabel), hint: hint.trim().slice(0, PBDOC_LIMITS.maxHint) || null } }).run();
  return OK;
}

export function insertField(editor: Editor, field: string): CommandResult {
  editor.chain().focus().insertContent({ type: "field", attrs: { field } }).run();
  return OK;
}

export function setBlockType(editor: Editor, value: string): void {
  const c = editor.chain().focus();
  if (value === "paragraph") c.setNode("paragraph").run();
  else if (value.startsWith("heading")) c.setNode("heading", { level: Number(value.slice(7)) }).run();
  else if (value === "clause") c.setNode("clause", { level: 1, numbered: true }).run();
}

export function currentBlockType(editor: Editor): string {
  const { $from } = editor.state.selection;
  const n = $from.parent;
  if (n.type.name === "heading") return `heading${n.attrs.level}`;
  if (n.type.name === "clause") return "clause";
  return "paragraph";
}

export function setLink(editor: Editor, href: string | null): void {
  if (!href) editor.chain().focus().extendMarkRange("link").unsetLink().run();
  else editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
}

export function setOrderedStyle(editor: Editor, style: ListStyle): void {
  editor.chain().focus().updateAttributes("orderedList", { style }).run();
}

export function setTableHeaderRow(editor: Editor, on: boolean): void {
  editor.chain().focus().updateAttributes("table", { headerRow: on }).run();
}

export function setColumnWidths(editor: Editor, widths: number[]): CommandResult {
  if (widths.some((w) => !Number.isFinite(w) || w < PBDOC_LIMITS.minColPct || w > 100)) return fail(`Each column must be between ${PBDOC_LIMITS.minColPct}% and 100%.`);
  const sum = widths.reduce((a, b) => a + b, 0);
  if (Math.abs(sum - 100) > 1) return fail(`Column widths add up to ${Math.round(sum * 10) / 10}%. They must add up to 100%.`);
  editor.chain().focus().updateAttributes("table", { colWidths: widths }).run();
  return OK;
}

export function tableShape(editor: Editor): { rows: number; cols: number } | null {
  const { $from } = editor.state.selection;
  for (let d = $from.depth; d > 0; d--) {
    const n = $from.node(d);
    if (n.type.name === "table") return { rows: n.childCount, cols: n.firstChild?.childCount ?? 0 };
  }
  return null;
}

export function addRow(editor: Editor, where: "before" | "after"): CommandResult {
  const s = tableShape(editor);
  if (!s) return fail("Place the cursor in a table first.");
  if (s.rows >= PBDOC_LIMITS.maxTableRows) return fail(`A table can have up to ${PBDOC_LIMITS.maxTableRows} rows.`);
  const cursorInHeader = editor.state.selection.$from.parent.type.name && (() => { const { $from } = editor.state.selection; for (let d = $from.depth; d > 0; d--) if ($from.node(d).type.name === "tableHeader") return true; return false; })();
  if (cursorInHeader && where === "before") return fail("Add the row below the header row instead.");
  (where === "before" ? editor.chain().focus().addRowBefore() : editor.chain().focus().addRowAfter()).run();
  return OK;
}
export function removeRow(editor: Editor): CommandResult {
  const s = tableShape(editor);
  if (!s) return fail("Place the cursor in a table first.");
  if (s.rows <= 1) return fail("A table needs at least one row. Delete the table instead.");
  editor.chain().focus().deleteRow().run();
  return OK;
}
export function addColumn(editor: Editor, where: "before" | "after"): CommandResult {
  const s = tableShape(editor);
  if (!s) return fail("Place the cursor in a table first.");
  if (s.cols >= PBDOC_LIMITS.maxTableCols) return fail(`A table can have up to ${PBDOC_LIMITS.maxTableCols} columns.`);
  (where === "before" ? editor.chain().focus().addColumnBefore() : editor.chain().focus().addColumnAfter()).run();
  return OK;
}
export function removeColumn(editor: Editor): CommandResult {
  const s = tableShape(editor);
  if (!s) return fail("Place the cursor in a table first.");
  if (s.cols <= 1) return fail("A table needs at least one column. Delete the table instead.");
  editor.chain().focus().deleteColumn().run();
  return OK;
}

export interface ImageUploader { (file: File): Promise<{ fileId: string; alt?: string }> }

export function validateImageFile(file: { type: string; size: number; name?: string }, maxBytes: number = IMAGE_RULES.maxBytes): string | null {
  if (!(IMAGE_RULES.types as readonly string[]).includes(file.type)) return "Only PNG and JPEG images can be used. Convert other formats first.";
  if (file.size <= 0) return "That file is empty.";
  if (file.size > maxBytes) return `The image is larger than ${Math.round(maxBytes / 1024 / 1024)} MB. Use a smaller file.`;
  return null;
}

export async function insertImageFile(editor: Editor, file: File, upload: ImageUploader | undefined, maxBytes?: number, at?: number): Promise<CommandResult> {
  if (!upload) return fail("Image upload is not available for this document.");
  const problem = validateImageFile(file, maxBytes);
  if (problem) return fail(problem);
  let res: { fileId: string; alt?: string };
  try { res = await upload(file); } catch (e) { return fail(e instanceof Error && e.message ? e.message : "The image could not be uploaded."); }
  if (!FILE_ID_RE.test(res.fileId)) return fail("The image was uploaded but the server returned an invalid file id.");
  const alt = (res.alt ?? file.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ")).trim().slice(0, PBDOC_LIMITS.maxAlt) || "Image";
  const node = { type: "image", attrs: { fileId: res.fileId, alt, widthPct: 100, align: "left", caption: null } };
  if (at !== undefined) editor.chain().focus().insertContentAt(at, node).run();
  else editor.chain().focus().insertContent(node).run();
  return OK;
}

export function toggleList(editor: Editor, type: "bulletList" | "orderedList"): void {
  const { state, view } = editor;
  const t = state.schema.nodes[type];
  const item = state.schema.nodes.listItem;
  const { $from } = state.selection;
  for (let d = $from.depth; d > 0; d--) {
    if ($from.node(d).type === t) { liftListItem(item)(state, view.dispatch); view.focus(); return; }
  }
  wrapInList(t)(state, view.dispatch);
  view.focus();
}
