import "server-only";
import type { AnyBlock, ContentBlock, InlineNode, ListItem, PBDoc, ZoneBlock } from "@/lib/products/playbook-ai/doc/types";
import { parseDoc } from "@/lib/products/playbook-ai/doc/validate";
import { resolveDoc, type VarLists, type VarValues } from "@/lib/products/playbook-ai/doc/variables";
import { allBlocks, countBlocks, walkBlocks } from "@/lib/products/playbook-ai/doc/walk";
import { clauseLabels } from "@/lib/products/playbook-ai/doc/numbering";
import { formatIsoDateIndia } from "@/lib/products/playbook-ai/doc/format";
import { buildTokens, type RenderBrand, type StyleTokens } from "@/lib/products/playbook-ai/doc/render/tokens";
import { IMAGE_LIMITS, sniffImage, type ImageAsset } from "@/lib/products/playbook-ai/doc/render/images";

/**
 * Everything both renderers share, computed once: the validated and resolved document, style tokens, images, the static table of contents,
 * clause labels and the list of anything the reader would otherwise see as a gap. Server-only.
 */

export const RENDER_LIMITS = {
  /** Blocks over header, body and footer. A 200-page contract is a few thousand; the parser's own node cap (60,000) is the first wall, this is the second. */
  maxBlocks: 15_000,
  maxTableCells: 8_000,
  /**
   * PDF layout time grows faster than the page count in react-pdf (measured on a developer machine: 27 pages 4 s, 35 pages with clauses 8 s,
   * 77 pages with tables and clauses 54 s, +390 MB), and a CPU-bound render cannot be interrupted from inside the process. So the size is
   * limited before rendering starts, using an estimate of the page count.
   */
  maxEstimatedPages: 120,
  warnEstimatedPages: 50,
} as const;

export interface RenderMeta {
  title: string;
  author?: string;
  subject?: string;
  /** Printed by the `docNumber` field. Empty until the document is issued. */
  docNumber?: string;
  /** Printed by the `version` field. */
  version?: string;
  /** Printed by the `date` field (YYYY-MM-DD). Also the document's created date, so output is reproducible. */
  dateIso: string;
}

export interface RenderOptions {
  meta: RenderMeta;
  /** Variable values (company profile, party record, the user's inputs). */
  values: VarValues;
  lists?: VarLists;
  /** Image bytes by the `fileId` used in image blocks. */
  images?: Record<string, Uint8Array>;
  brand?: RenderBrand;
  /** "DRAFT", "UNREVIEWED"... printed diagonally on every page. Null for an issued version. */
  watermark?: string | null;
  /** Export even though variables or placeholders are unfilled: they are highlighted as [Label] and the watermark becomes DRAFT. Default false. */
  allowUnresolved?: boolean;
}

export interface TocEntry { id: string; level: 1 | 2 | 3 | 4; text: string }

export interface Prepared {
  doc: PBDoc;
  tokens: StyleTokens;
  meta: RenderMeta;
  watermark: string | null;
  images: Map<string, ImageAsset>;
  logo: { asset: ImageAsset; align: "left" | "center" | "right"; widthMm: number } | null;
  toc: TocEntry[];
  /** Levels the table of contents shows (from the document's `toc` block), or 0 when there is none. */
  tocLevels: number;
  clauseLabels: Map<string, string>;
  flagged: { unresolved: { key: string; reason: string }[]; placeholders: { key: string; label: string }[] };
  warnings: string[];
  footerText: string | null;
  /** Where the header (logo and letterhead) is printed. */
  letterhead: "all" | "first" | "none";
  /** Rough page count used for the size guard. */
  estimatedPages: number;
}

export class RenderBlockedError extends Error {
  constructor(
    message: string,
    public readonly reasons: { code: "invalid_document" | "unresolved" | "image" | "too_large"; detail: string }[],
    public readonly unresolved: { key: string; reason: string }[] = [],
    public readonly placeholders: { key: string; label: string }[] = [],
  ) {
    super(message);
    this.name = "RenderBlockedError";
  }
}

const FIELD_STATIC = new Set(["docNumber", "version", "date", "title"]);

function staticField(field: string, meta: RenderMeta): string {
  switch (field) {
    case "docNumber": return meta.docNumber ?? "";
    case "version": return meta.version ? `v${meta.version}` : "";
    case "date": return formatIsoDateIndia(meta.dateIso) ?? meta.dateIso;
    case "title": return meta.title;
    default: return "";
  }
}

/** `docNumber`, `version`, `date` and `title` fields become text now; page fields stay (the engines number pages). */
function bakeFields(nodes: InlineNode[], meta: RenderMeta): InlineNode[] {
  return nodes.map((n): InlineNode => (n.type === "field" && FIELD_STATIC.has(n.field) ? (n.marks ? { type: "text", text: staticField(n.field, meta), marks: n.marks } : { type: "text", text: staticField(n.field, meta) }) : n));
}

function mapBlocks<T extends AnyBlock>(blocks: T[], fn: (n: InlineNode[]) => InlineNode[]): T[] {
  const item = (i: ListItem): ListItem => ({ ...i, content: mapBlocks(i.content, fn) });
  return blocks.map((b): T => {
    switch (b.type) {
      case "paragraph": case "heading": case "clause": return { ...b, content: fn(b.content) } as T;
      case "bulletList": case "orderedList": return { ...b, items: b.items.map(item) } as T;
      case "table": return { ...b, rows: b.rows.map((r) => ({ ...r, cells: r.cells.map((c) => ({ ...c, content: mapBlocks(c.content, fn) })) })) } as T;
      case "callout": return { ...b, content: mapBlocks(b.content, fn) } as T;
      case "section": case "conditional": case "repeat": return { ...b, children: mapBlocks(b.children, fn) } as T;
      default: return b;
    }
  });
}

/** What a reader sees for inline content when the engines are not involved (TOC entries, size estimates). */
export function displayText(nodes: readonly InlineNode[], meta?: RenderMeta): string {
  return nodes.map((n) => {
    switch (n.type) {
      case "text": return n.text;
      case "var": return `[${n.key}]`;
      case "placeholder": return `[${n.label}]`;
      case "field": return n.field === "pageNumber" || n.field === "totalPages" ? "" : meta ? staticField(n.field, meta) : "";
      case "hardBreak": return " ";
    }
  }).join("");
}

/** Width and height in mm of an image block: a share of the text width, never taller than 90% of the text area, proportions kept. */
export function imageSizeMm(a: ImageAsset, widthPct: number, tokens: StyleTokens): { widthMm: number; heightMm: number } {
  let widthMm = (tokens.page.textWidthMm * widthPct) / 100;
  let heightMm = (widthMm * a.heightPx) / a.widthPx;
  const maxH = (tokens.page.heightMm - tokens.page.margins.top - tokens.page.margins.bottom) * 0.9;
  if (heightMm > maxH) { widthMm = (widthMm * maxH) / heightMm; heightMm = maxH; }
  return { widthMm, heightMm };
}

/**
 * Rough page count from the amount of text, list items, table rows, images and clauses. It is only used to refuse documents far beyond
 * what can be rendered in one request; the real count comes from the engine.
 */
export function estimatePages(doc: PBDoc, tokens: StyleTokens, images: Map<string, ImageAsset>): number {
  const lineMm = (tokens.basePt * tokens.lineHeight * 25.4) / 72;
  const charsPerLine = Math.max(30, Math.floor(tokens.page.textWidthMm / (tokens.basePt * 0.17)));
  const lines = (chars: number, indentChars = 0) => Math.max(1, Math.ceil(chars / Math.max(10, charsPerLine - indentChars)));
  let mm = 0;
  const walk = (blocks: readonly AnyBlock[]): void => {
    for (const b of blocks) {
      switch (b.type) {
        case "paragraph": mm += lines(displayText(b.content).length) * lineMm + 2; break;
        case "heading": mm += lines(displayText(b.content).length) * lineMm * 1.4 + tokens.heading[b.level].beforePt * 0.35 + 3; break;
        case "clause": mm += lines(displayText(b.content).length, 12) * lineMm + 2; break;
        case "bulletList": case "orderedList": for (const i of b.items) { mm += 0.7; walk(i.content); } break;
        case "table": for (const r of b.rows) { mm += (2 * tokens.cellPaddingPt * 25.4) / 72; mm += Math.max(...r.cells.map((c) => { const before = mm; walk(c.content); const used = mm - before; mm = before; return used; })); } break;
        case "image": { const a = images.get(b.fileId); mm += a ? imageSizeMm(a, b.widthPct, tokens).heightMm + 3 : 0; break; }
        case "callout": mm += 4; walk(b.content); break;
        case "signatureBlock": mm += 38; break;
        case "spacer": mm += b.heightMm; break;
        case "divider": mm += 3; break;
        case "toc": mm += 40; break;
        case "pageBreak": mm += tokens.page.heightMm / 2; break;
        case "section": case "conditional": case "repeat": walk(b.children); break;
      }
    }
  };
  walk(doc.body);
  const pageMm = tokens.page.heightMm - tokens.page.margins.top - tokens.page.margins.bottom;
  return Math.max(1, Math.ceil(mm / pageMm));
}

/** Rough height of a zone's content in mm, to warn when a header or footer is taller than the zone the page reserved for it. */
function estimateZoneMm(blocks: ZoneBlock[], images: Map<string, ImageAsset>, tokens: StyleTokens): number {
  const lineMm = (tokens.basePt * tokens.lineHeight * 25.4) / 72;
  let mm = 0;
  for (const b of blocks) {
    if (b.type === "paragraph") {
      const chars = displayText(b.content).length;
      const perLine = Math.max(20, Math.floor(tokens.page.textWidthMm / (tokens.basePt * 0.19)));
      mm += Math.max(1, Math.ceil(chars / perLine)) * lineMm + 1.5;
    } else if (b.type === "image") {
      const a = images.get(b.fileId);
      mm += a ? imageSizeMm(a, b.widthPct, tokens).heightMm : 0;
    } else if (b.type === "divider") mm += 2;
    else if (b.type === "table") mm += b.rows.length * (lineMm + 2 * (tokens.cellPaddingPt * 25.4) / 72);
  }
  return mm;
}

export function prepareRender(input: PBDoc, opts: RenderOptions): Prepared {
  const reasons: RenderBlockedError["reasons"] = [];

  // 1. The document must be valid (the same strict check as every save).
  const parsed = parseDoc(input);
  if (!parsed.ok) throw new RenderBlockedError("The document is not valid and cannot be exported.", parsed.issues.slice(0, 20).map((i) => ({ code: "invalid_document" as const, detail: `${i.path}: ${i.message}` })));
  if (countBlocks(parsed.doc) > RENDER_LIMITS.maxBlocks) throw new RenderBlockedError("The document is too large to export.", [{ code: "too_large", detail: `more than ${RENDER_LIMITS.maxBlocks} blocks` }]);
  let cells = 0;
  for (const b of allBlocks(parsed.doc)) if (b.type === "table") cells += b.rows.reduce((n, r) => n + r.cells.length, 0);
  if (cells > RENDER_LIMITS.maxTableCells) throw new RenderBlockedError("The document is too large to export.", [{ code: "too_large", detail: `more than ${RENDER_LIMITS.maxTableCells} table cells` }]);

  // 2. Resolve variables, conditions and repeats.
  const resolved = resolveDoc(parsed.doc, { values: opts.values, lists: opts.lists });
  const flagged = { unresolved: resolved.unresolved, placeholders: resolved.placeholders };
  const hasGaps = flagged.unresolved.length > 0 || flagged.placeholders.length > 0;
  if (hasGaps && !opts.allowUnresolved) {
    throw new RenderBlockedError(
      `${flagged.unresolved.length + flagged.placeholders.length} value(s) are still missing, so the document cannot be exported as final.`,
      [{ code: "unresolved", detail: [...flagged.unresolved.map((u) => `${u.key} (${u.reason})`), ...flagged.placeholders.map((p) => p.label)].join(", ") }],
      flagged.unresolved, flagged.placeholders,
    );
  }

  // 3. Bake static fields; page fields stay for the engines.
  const doc: PBDoc = {
    ...resolved.doc,
    header: mapBlocks(resolved.doc.header, (n) => bakeFields(n, opts.meta)),
    footer: mapBlocks(resolved.doc.footer, (n) => bakeFields(n, opts.meta)),
    body: mapBlocks(resolved.doc.body, (n) => bakeFields(n, opts.meta)),
  };

  // 4. Images: every referenced file present, valid, within limits.
  const images = new Map<string, ImageAsset>();
  let total = 0;
  const wanted = new Set<string>();
  for (const b of allBlocks(doc)) if (b.type === "image") wanted.add(b.fileId);
  if (wanted.size > IMAGE_LIMITS.maxImages) reasons.push({ code: "image", detail: `more than ${IMAGE_LIMITS.maxImages} images` });
  for (const id of wanted) {
    const raw = opts.images?.[id];
    if (!raw) { reasons.push({ code: "image", detail: `image ${id} was not provided` }); continue; }
    const s = sniffImage(raw);
    if (!s.ok) { reasons.push({ code: "image", detail: `image ${id}: ${s.reason}` }); continue; }
    total += s.asset.bytes.length;
    images.set(id, s.asset);
  }
  if (total > IMAGE_LIMITS.maxTotalBytes) reasons.push({ code: "image", detail: `images total more than ${IMAGE_LIMITS.maxTotalBytes / 1024 / 1024} MB` });
  let logo: Prepared["logo"] = null;
  if (opts.brand?.logo) {
    const s = sniffImage(opts.brand.logo.bytes);
    if (s.ok) logo = { asset: s.asset, align: opts.brand.logo.align, widthMm: Math.min(Math.max(opts.brand.logo.widthMm, 10), 80) };
    else reasons.push({ code: "image", detail: `logo: ${s.reason}` });
  }
  if (reasons.length) throw new RenderBlockedError("An image in the document cannot be used.", reasons);

  const tokens = buildTokens(doc.page, opts.brand);

  // 5. Static table of contents from the headings (page numbers are added by the PDF engine when it can measure them).
  const tocBlock = doc.body.find((b) => b.type === "toc") ?? allBlocks(doc).find((b) => b.type === "toc");
  const tocLevels = tocBlock && tocBlock.type === "toc" ? tocBlock.levels : 0;
  const toc: TocEntry[] = [];
  if (tocLevels) {
    walkBlocks(doc.body, (b) => {
      if (b.type === "heading" && b.level <= tocLevels) {
        const text = displayText(b.content, opts.meta).trim();
        if (text) toc.push({ id: b.id, level: b.level, text });
      }
    });
  }

  // 6. Size guard, then warnings that do not block.
  const estimatedPages = estimatePages(doc, tokens, images);
  if (estimatedPages > RENDER_LIMITS.maxEstimatedPages) {
    throw new RenderBlockedError("The document is too long to export in one go.", [{ code: "too_large", detail: `about ${estimatedPages} pages; the limit is ${RENDER_LIMITS.maxEstimatedPages}. Split it into parts.` }]);
  }
  const warnings: string[] = [];
  if (estimatedPages > RENDER_LIMITS.warnEstimatedPages) warnings.push(`This is a long document (about ${estimatedPages} pages); exporting it may take a minute.`);
  const g = tokens.page;
  if ((opts.brand?.letterhead ?? "all") !== "none" && estimateZoneMm(doc.header, images, tokens) + (logo ? (logo.widthMm * logo.asset.heightPx) / logo.asset.widthPx : 0) > g.headerHeightMm + 0.5) {
    warnings.push("The header is taller than its reserved zone; body text will start lower on every page.");
  }
  if (estimateZoneMm(doc.footer, images, tokens) > g.footerHeightMm + 0.5) warnings.push("The footer is taller than its reserved zone and may crowd the body text.");
  if (hasGaps) warnings.push(`${flagged.unresolved.length + flagged.placeholders.length} value(s) are missing and are shown highlighted in the document.`);

  // A document with gaps is never exported as if it were final: it always carries a watermark.
  const watermark = opts.watermark && opts.watermark.trim() ? opts.watermark : hasGaps ? "DRAFT" : null;
  return {
    doc, tokens, meta: opts.meta, watermark: watermark && watermark.trim() ? watermark.trim().slice(0, 24).toUpperCase() : null, images, logo, toc, tocLevels,
    clauseLabels: clauseLabels(doc.body), flagged, warnings, footerText: opts.brand?.footerText?.trim() || null, letterhead: opts.brand?.letterhead ?? "all", estimatedPages,
  };
}

export type { ContentBlock };
