import type { PBDoc } from "@/lib/products/playbook-ai/doc/types";
import { docToTiptap, tiptapToDoc, type TiptapNode, type TiptapDocs } from "@/lib/products/playbook-ai/doc/tiptap";
import type { ParseResult } from "@/lib/products/playbook-ai/doc/validate";
import { safeHref } from "@/components/doc-editor/core/links";

const INLINE_ATOMS = new Set(["variable", "placeholder", "field"]);

/** Removes what the PBDoc model refuses so it cannot block a save: links on atoms (variables, fields), marks on placeholders, unsafe links. */
export function sanitizeEditorJson(node: TiptapNode): TiptapNode {
  const out: TiptapNode = { ...node };
  if (node.marks?.length) {
    let marks = node.marks;
    if (node.type === "placeholder") marks = [];
    else if (INLINE_ATOMS.has(node.type)) marks = marks.filter((m) => m.type !== "link");
    marks = marks.filter((m) => m.type !== "link" || safeHref(String(m.attrs?.href ?? "")) !== null);
    if (marks.length) out.marks = marks; else delete out.marks;
  }
  if (node.content) out.content = node.content.map(sanitizeEditorJson);
  return out;
}

/** Editor content (body only) to a validated PBDoc. Header, footer and page settings are the document's own and pass through unchanged. */
export function editorBodyToDoc(body: TiptapNode, base: PBDoc): ParseResult {
  const zones = docToTiptap(base);
  const docs: TiptapDocs = { body: sanitizeEditorJson(body), header: zones.header, footer: zones.footer };
  return tiptapToDoc(docs, base.page);
}

/** PBDoc to the JSON the editor loads. */
export const docToEditorJson = (doc: PBDoc): TiptapNode => docToTiptap(doc).body;
