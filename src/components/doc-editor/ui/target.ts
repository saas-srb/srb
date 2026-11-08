import type { EditorState } from "@tiptap/pm/state";
import { NodeSelection } from "@tiptap/pm/state";
import type { Node as PMNode } from "@tiptap/pm/model";

export const INSPECTABLE = new Set(["callout", "conditional", "repeat", "section", "signatureBlock", "image", "toc", "spacer", "clause", "orderedList", "table", "variable", "placeholder", "field", "heading"]);

export interface Target { node: PMNode; pos: number }

/** The node the side panel edits: a selected node, else the closest enclosing node that has settings. */
export function inspectorTarget(state: EditorState): Target | null {
  const sel = state.selection;
  if (sel instanceof NodeSelection && INSPECTABLE.has(sel.node.type.name)) return { node: sel.node, pos: sel.from };
  const { $from } = sel;
  // An inline atom right after the cursor/selection start.
  for (let d = $from.depth; d >= 0; d--) {
    const n = $from.node(d);
    if (INSPECTABLE.has(n.type.name)) return { node: n, pos: d === 0 ? 0 : $from.before(d) };
  }
  return null;
}
