import type { Node as PMNode } from "@tiptap/pm/model";

export interface OutlineItem {
  /** Block id (stable across edits). */
  id: string;
  /** Document position of the block, for scrolling to it. */
  pos: number;
  kind: "heading" | "section" | "clause";
  /** 1-4 for headings; sections are level 1 in the outline; clauses use their clause level. */
  level: number;
  text: string;
  /** The number printed before a numbered clause, when kind is "clause". */
  label?: string;
}

/** Plain text of a PM node: variables show as {{key}}, placeholders as [label]. */
export function nodeText(node: PMNode): string {
  let out = "";
  node.descendants((n) => {
    if (n.isText) out += n.text ?? "";
    else if (n.type.name === "variable") out += `{{${String(n.attrs.key)}}}`;
    else if (n.type.name === "placeholder") out += `[${String(n.attrs.label)}]`;
    else if (n.type.name === "hardBreak") out += " ";
    return true;
  });
  return out.replace(/\s+/g, " ").trim();
}

/** Clause labels (1. / 1.1 / (a)) in document order, mirroring `clauseLabels` of the PBDoc model. */
export function clauseLabelsFromPm(doc: PMNode, skip?: (n: PMNode) => boolean): Map<string, string> {
  const out = new Map<string, string>();
  let a = 0, b = 0, c = 0;
  const alpha = (n: number) => { let s = ""; let r = n; while (r > 0) { r -= 1; s = String.fromCharCode(97 + (r % 26)) + s; r = Math.floor(r / 26); } return s; };
  doc.descendants((n, pos) => {
    if (skip?.(n)) return false;
    if (n.type.name !== "clause" || !n.attrs.numbered) return true;
    const key = String(n.attrs.id ?? `@${pos}`);
    const level = Number(n.attrs.level);
    if (level === 1) { a += 1; b = 0; c = 0; out.set(key, `${a}.`); }
    else if (level === 2) { if (a === 0) a = 1; b += 1; c = 0; out.set(key, `${a}.${b}`); }
    else { if (a === 0) a = 1; if (b === 0) b = 1; c += 1; out.set(key, `(${alpha(c)})`); }
    return false;
  });
  return out;
}

/** The navigator list: headings, sections and level-1 clauses with their text, in document order. */
export function buildOutline(doc: PMNode, opts: { clauses?: boolean; skip?: (n: PMNode) => boolean } = {}): OutlineItem[] {
  const items: OutlineItem[] = [];
  const labels = opts.clauses === false ? new Map<string, string>() : clauseLabelsFromPm(doc, opts.skip);
  doc.descendants((n, pos) => {
    if (opts.skip?.(n)) return false;
    const id = String(n.attrs.id ?? "");
    switch (n.type.name) {
      case "heading": {
        const text = nodeText(n);
        if (text) items.push({ id, pos, kind: "heading", level: Number(n.attrs.level), text });
        return false;
      }
      case "section":
        // A section whose first block is a heading is listed by that heading, so the same title does not appear twice.
        if (n.firstChild?.type.name !== "heading") items.push({ id, pos, kind: "section", level: 1, text: String(n.attrs.title || n.attrs.key) });
        return true;
      case "clause": {
        const label = labels.get(id);
        if (opts.clauses !== false && n.attrs.numbered && Number(n.attrs.level) === 1) {
          const text = nodeText(n);
          if (text) items.push({ id, pos, kind: "clause", level: 1, text, label });
        }
        return false;
      }
      default:
        return true;
    }
  });
  return items;
}

/** Headings only, limited to `levels`, as the table of contents block will list them in the PDF. */
export const tocEntries = (items: readonly OutlineItem[], levels: number) => items.filter((i) => i.kind === "heading" && i.level <= levels);
