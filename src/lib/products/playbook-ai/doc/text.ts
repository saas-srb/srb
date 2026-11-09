/** Plain-text extraction from a PBDoc: search indexing, AI context, golden tests, diff summaries. Pure, client-safe. */
import type { AnyBlock, InlineNode, ListItem, PBDoc } from "@/lib/products/playbook-ai/doc/types";
import { clauseLabels, listMarker } from "@/lib/products/playbook-ai/doc/numbering";

export interface TextOptions {
  /** Include the header and footer zones (default false). */
  zones?: boolean;
}

const FIELD_TEXT: Record<string, string> = { pageNumber: "{page}", totalPages: "{pages}", docNumber: "{docNumber}", version: "{version}", date: "{date}", title: "{title}" };

export function inlineText(nodes: readonly InlineNode[]): string {
  return nodes
    .map((n) => {
      switch (n.type) {
        case "text": return n.text;
        case "var": return `{{${n.key}}}`;
        case "placeholder": return `[${n.label}]`;
        case "field": return FIELD_TEXT[n.field] ?? "";
        case "hardBreak": return "\n";
      }
    })
    .join("");
}

function listText(items: ListItem[], ordered: { style: "decimal" | "alpha" | "roman"; start: number } | null, depth: number, labels: Map<string, string>): string[] {
  const out: string[] = [];
  const pad = "  ".repeat(depth);
  items.forEach((item, i) => {
    const marker = ordered ? listMarker(ordered.style, ordered.start + i) : "-";
    let first = true;
    for (const child of item.content) {
      if (child.type === "paragraph") {
        const lines = inlineText(child.content).split("\n");
        lines.forEach((ln, li) => out.push(first && li === 0 ? `${pad}${marker} ${ln}` : `${pad}  ${ln}`));
        first = false;
      } else {
        if (first) { out.push(`${pad}${marker}`); first = false; }
        out.push(...blockLines(child, depth + 1, labels));
      }
    }
    if (first) out.push(`${pad}${marker}`);
  });
  return out;
}

/** Child blocks of a container, one paragraph-spaced block each, so a section reads like the body. */
function joinBlocks(blocks: readonly AnyBlock[], depth: number, labels: Map<string, string>): string {
  return blocks.map((x) => blockLines(x, depth, labels).join("\n")).filter((s) => s !== "").join("\n\n");
}

function blockLines(b: AnyBlock, depth: number, labels: Map<string, string>): string[] {
  switch (b.type) {
    case "paragraph":
      return [inlineText(b.content)];
    case "heading":
      return [inlineText(b.content)];
    case "clause": {
      const label = labels.get(b.id);
      return [label ? `${label} ${inlineText(b.content)}` : inlineText(b.content)];
    }
    case "bulletList":
      return listText(b.items, null, depth, labels);
    case "orderedList":
      return listText(b.items, { style: b.style, start: b.start ?? 1 }, depth, labels);
    case "table":
      return b.rows.map((r) => r.cells.map((c) => c.content.flatMap((x) => blockLines(x, depth + 1, labels)).join(" ").replace(/\s+/g, " ").trim()).join("\t"));
    case "image":
      return [b.caption ? `[Image: ${b.alt}] ${b.caption}` : `[Image: ${b.alt}]`];
    case "callout":
      return [joinBlocks(b.content, depth, labels)];
    case "signatureBlock":
      return [`Signature: ${b.label}`];
    case "letterhead":
      return [b.name, ...b.address, ...b.details.map((d) => `${d.label}: ${d.value}`)].filter(Boolean);
    case "pageBreak":
      return ["\f"];
    case "divider":
    case "spacer":
      return [];
    case "toc":
      return ["Contents"];
    case "conditional":
    case "repeat":
    case "section": {
      const s = joinBlocks(b.children, depth, labels);
      return s ? [s] : [];
    }
  }
}

/** The text a reader would see, block per line (blank line between blocks). Variables show as `{{key}}`, placeholders as `[Label]`. */
export function plainText(doc: PBDoc, opts: TextOptions = {}): string {
  const labels = clauseLabels(doc.body);
  const parts: string[] = [];
  const add = (blocks: readonly AnyBlock[]) => {
    for (const b of blocks) {
      const lines = blockLines(b, 0, labels);
      if (lines.length) parts.push(lines.join("\n"));
    }
  };
  if (opts.zones) add(doc.header);
  add(doc.body);
  if (opts.zones) add(doc.footer);
  return parts.join("\n\n");
}

export function wordCount(doc: PBDoc): number {
  const t = plainText(doc).replace(/\{\{[^}]+\}\}/g, "x").trim();
  return t ? t.split(/\s+/).length : 0;
}
