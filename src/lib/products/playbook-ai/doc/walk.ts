/** Tree walking helpers for PBDoc. Pure, client-safe. */
import type { AnyBlock, ContentBlock, InlineNode, PBDoc } from "@/lib/products/playbook-ai/doc/types";

/** Direct child blocks of a block (list items' paragraphs and lists, cell content, container children). */
export function childBlocks(b: AnyBlock): AnyBlock[] {
  switch (b.type) {
    case "bulletList":
    case "orderedList":
      return b.items.flatMap((i) => i.content);
    case "table":
      return b.rows.flatMap((r) => r.cells.flatMap((c) => c.content));
    case "callout":
      return b.content;
    case "conditional":
    case "repeat":
    case "section":
      return b.children;
    default:
      return [];
  }
}

/** Inline content of a block that has any directly. */
export function inlineOf(b: AnyBlock): InlineNode[] {
  return b.type === "paragraph" || b.type === "heading" || b.type === "clause" ? b.content : [];
}

/** Depth-first, document order. */
export function walkBlocks(blocks: readonly AnyBlock[], visit: (b: AnyBlock, depth: number) => void, depth = 0): void {
  for (const b of blocks) {
    visit(b, depth);
    walkBlocks(childBlocks(b), visit, depth + 1);
  }
}

/** Every block in the document: header, body, footer. */
export function allBlocks(doc: PBDoc): AnyBlock[] {
  const out: AnyBlock[] = [];
  const add = (b: AnyBlock) => out.push(b);
  walkBlocks(doc.header, add);
  walkBlocks(doc.body, add);
  walkBlocks(doc.footer, add);
  return out;
}

export function walkInline(doc: PBDoc, visit: (n: InlineNode, block: AnyBlock) => void): void {
  for (const b of allBlocks(doc)) for (const n of inlineOf(b)) visit(n, b);
}

export function countBlocks(doc: PBDoc): number {
  return allBlocks(doc).length;
}

/** Finds a block by id anywhere in the document (header, body, footer). */
export function findBlock(doc: PBDoc, id: string): AnyBlock | null {
  return allBlocks(doc).find((b) => b.id === id) ?? null;
}

export type { ContentBlock };
