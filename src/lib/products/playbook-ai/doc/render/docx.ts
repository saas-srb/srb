import { groupSignatureRows } from "@/lib/products/playbook-ai/doc/signature-rows";
import "server-only";
import { createHash } from "node:crypto";
import JSZip from "jszip";
import {
  AlignmentType, Bookmark, BorderStyle, Document, ExternalHyperlink, Footer, Header, HeadingLevel, ImageRun, InternalHyperlink, LeaderType, LevelFormat,
  LineRuleType, PageNumber, Packer, Paragraph, ShadingType, Tab, TabStopType, Table, TableCell, TableLayoutType, TableRow, TextRun, UnderlineType, WidthType,
} from "docx";
import type { IRunOptions, ParagraphChild } from "docx";
import { TextWatermark } from "docx/watermarks";
import type { AnyBlock, CellChild, InlineNode, ListItem, Mark, PBDoc, TableBlock, ZoneBlock } from "@/lib/products/playbook-ai/doc/types";
import { mmToTwips } from "@/lib/products/playbook-ai/doc/page";
import { FAMILIES, readFont, textColorHex, zoneGeometry, type FamilyKey, type StyleTokens } from "@/lib/products/playbook-ai/doc/render/tokens";
import { imageSizeMm, prepareRender, type Prepared, type RenderOptions } from "@/lib/products/playbook-ai/doc/render/prepare";
import { sha256Hex } from "@/lib/products/playbook-ai/doc/hash";

/**
 * DOCX renderer: PBDoc to Word. Reads the SAME prepared document and style tokens as the PDF renderer. Server-only.
 *
 * Everything used here is standard WordprocessingML (styles, numbering, tables with repeated header rows, headers and footers with PAGE and
 * NUMPAGES fields, bookmarks and internal hyperlinks, DrawingML pictures, Word's own text-watermark shape). Differences from the PDF that
 * cannot be removed: Word paginates the document itself, so page breaks fall differently; the table of contents has entries and links but
 * no page numbers (Word would only fill them in after the reader updates fields); legal clause numbers are written as text so they match
 * the PDF exactly, which means Word will not renumber them if someone edits the document by hand.
 */

const HALF = (pt: number) => Math.round(pt * 2);
const TW = (pt: number) => Math.round(pt * 20);
const hex = (c: string) => c.replace("#", "").toUpperCase();

export type FontEmbedding = "none" | "regular_bold" | "all";

export interface DocxOptions extends RenderOptions {
  /**
   * Which Noto Sans faces are embedded in the file so Word shows the same typeface on a computer without it.
   * "regular_bold" (default) adds about 1.7 MB, "all" about 3.4 MB, "none" relies on the reader having Noto Sans (Word substitutes otherwise).
   */
  embedFonts?: FontEmbedding;
}

export interface DocxResult {
  buffer: Buffer;
  warnings: string[];
  flagged: Prepared["flagged"];
  watermark: string | null;
  estimatedPages: number;
  embeddedFonts: FontEmbedding;
}

interface ListPlan { reference: string; depth: number }

class Ctx {
  /** Set by a page-break block; the next paragraph-like block starts on a new page. */
  pendingBreak = false;
  lists = new Map<string, ListPlan>();
  bookmarks = new Map<string, string>();
  constructor(public p: Prepared) {}
  get t() { return this.p.tokens; }
}

// ---- runs ------------------------------------------------------------------------------------------------------------------

function runStyle(t: StyleTokens, marks: readonly Mark[] | undefined, base: IRunOptions = {}): IRunOptions {
  const o: { -readonly [K in keyof IRunOptions]: IRunOptions[K] } = { ...base };
  for (const m of marks ?? []) {
    switch (m.type) {
      case "bold": o.bold = true; break;
      case "italic": o.italics = true; break;
      case "underline": o.underline = { type: UnderlineType.SINGLE }; break;
      case "strike": o.strike = true; break;
      case "sup": o.superScript = true; break;
      case "sub": o.subScript = true; break;
      case "highlight": o.shading = { type: ShadingType.CLEAR, fill: hex(t.highlight[m.color]), color: "auto" }; break;
      case "color": o.color = hex(textColorHex(t, m.color)); break;
      case "link": o.color = hex(t.colors.blue); o.underline = { type: UnderlineType.SINGLE }; break;
    }
  }
  return o;
}

const flaggedRun = (t: StyleTokens, text: string, base: IRunOptions, marks?: readonly Mark[]) =>
  new TextRun({ ...runStyle(t, marks, base), text, shading: { type: ShadingType.CLEAR, fill: hex(t.colors.flagged), color: "auto" } });

function runs(c: Ctx, nodes: readonly InlineNode[], base: IRunOptions = {}): ParagraphChild[] {
  const t = c.t;
  const out: ParagraphChild[] = [];
  for (const n of nodes) {
    switch (n.type) {
      case "text": {
        const href = n.marks?.find((m): m is Extract<Mark, { type: "link" }> => m.type === "link")?.href;
        const run = new TextRun({ ...runStyle(t, n.marks, base), text: n.text });
        out.push(href ? new ExternalHyperlink({ link: href, children: [run] }) : run);
        break;
      }
      case "var": out.push(flaggedRun(t, `[${n.key}]`, base, n.marks)); break;
      case "placeholder": out.push(flaggedRun(t, `[${n.label}]`, base)); break;
      case "field":
        if (n.field === "pageNumber") out.push(new TextRun({ ...runStyle(t, n.marks, base), children: [PageNumber.CURRENT] }));
        else if (n.field === "totalPages") out.push(new TextRun({ ...runStyle(t, n.marks, base), children: [PageNumber.TOTAL_PAGES] }));
        break;
      case "hardBreak": out.push(new TextRun({ ...base, break: 1 })); break;
    }
  }
  return out;
}

const alignOf = (a?: string) => (a === "center" ? AlignmentType.CENTER : a === "right" ? AlignmentType.RIGHT : a === "justify" ? AlignmentType.JUSTIFIED : AlignmentType.LEFT);

function spacing(t: StyleTokens, afterPt = t.paragraphAfterPt, beforePt = 0) {
  return { before: TW(beforePt), after: TW(afterPt), line: Math.round(t.lineHeight * 240), lineRule: LineRuleType.AUTO };
}

// ---- numbering plan --------------------------------------------------------------------------------------------------------

function planLists(c: Ctx, blocks: readonly AnyBlock[], depth: number, out: { ordered: { ref: string; style: "decimal" | "alpha" | "roman"; start: number; depth: number }[] }) {
  for (const b of blocks) {
    if (b.type === "orderedList") {
      const ref = `ol${out.ordered.length + 1}`;
      c.lists.set(b.id, { reference: ref, depth });
      out.ordered.push({ ref, style: b.style, start: b.start ?? 1, depth });
      for (const i of b.items) planLists(c, i.content, depth + 1, out);
    } else if (b.type === "bulletList") {
      c.lists.set(b.id, { reference: "bullets", depth });
      for (const i of b.items) planLists(c, i.content, depth + 1, out);
    } else if (b.type === "table") {
      for (const r of b.rows) for (const cell of r.cells) planLists(c, cell.content, 0, out);
    } else if (b.type === "callout") planLists(c, b.content, 0, out);
    else if (b.type === "section" || b.type === "conditional" || b.type === "repeat") planLists(c, b.children, depth, out);
  }
}

function numberingConfig(t: StyleTokens, ordered: { ref: string; style: "decimal" | "alpha" | "roman"; start: number; depth: number }[]) {
  const left = (d: number) => mmToTwips((d + 1) * t.listIndentMm);
  const hang = mmToTwips(t.listMarkerMm);
  const fmt = { decimal: LevelFormat.DECIMAL, alpha: LevelFormat.LOWER_LETTER, roman: LevelFormat.LOWER_ROMAN } as const;
  const bullets = {
    reference: "bullets",
    levels: [0, 1, 2, 3, 4].map((lvl) => ({
      level: lvl, format: LevelFormat.BULLET, text: lvl % 2 === 0 ? "•" : "–", alignment: AlignmentType.RIGHT,
      style: { paragraph: { indent: { left: left(lvl), hanging: hang } } },
    })),
  };
  return [bullets, ...ordered.map((o) => ({
    reference: o.ref,
    levels: [{ level: 0, format: fmt[o.style], text: "%1.", start: o.start, alignment: AlignmentType.RIGHT, style: { paragraph: { indent: { left: left(o.depth), hanging: hang } } } }],
  }))];
}

// ---- blocks ----------------------------------------------------------------------------------------------------------------

type Out = Paragraph | Table;

function takeBreak(c: Ctx): boolean {
  const v = c.pendingBreak;
  c.pendingBreak = false;
  return v;
}

function zoneBase(c: Ctx, small: boolean): IRunOptions {
  return small ? { size: HALF(c.t.basePt - 1.5), color: hex(c.t.colors.text) } : {};
}

function paragraphBlock(c: Ctx, b: Extract<AnyBlock, { type: "paragraph" }>, o: { small?: boolean; afterPt?: number; indentLeft?: number } = {}): Paragraph {
  return new Paragraph({
    children: runs(c, b.content, zoneBase(c, !!o.small)),
    alignment: alignOf(b.align),
    spacing: spacing(c.t, o.small ? 1 : o.afterPt),
    ...(o.indentLeft ? { indent: { left: o.indentLeft } } : {}),
    ...(takeBreak(c) ? { pageBreakBefore: true } : {}),
  });
}

function headingBlock(c: Ctx, b: Extract<AnyBlock, { type: "heading" }>): Paragraph {
  const level = ({ 1: HeadingLevel.HEADING_1, 2: HeadingLevel.HEADING_2, 3: HeadingLevel.HEADING_3, 4: HeadingLevel.HEADING_4 } as const)[b.level];
  const anchor = c.bookmarks.get(b.id);
  const kids = runs(c, b.content);
  return new Paragraph({
    heading: level,
    alignment: alignOf(b.align),
    children: anchor ? [new Bookmark({ id: anchor, children: kids as never })] : kids,
    ...(takeBreak(c) ? { pageBreakBefore: true } : {}),
  });
}

function clauseBlock(c: Ctx, b: Extract<AnyBlock, { type: "clause" }>): Paragraph {
  const g = c.t.clause[b.level];
  const label = c.p.clauseLabels.get(b.id);
  const left = mmToTwips(g.textMm);
  return new Paragraph({
    children: label ? [new TextRun({ text: label }), new TextRun({ children: [new Tab()] }), ...runs(c, b.content)] : runs(c, b.content),
    alignment: AlignmentType.JUSTIFIED,
    spacing: spacing(c.t),
    indent: label ? { left, hanging: mmToTwips(g.textMm - g.labelMm) } : { left },
    tabStops: [{ type: TabStopType.LEFT, position: left }],
    ...(takeBreak(c) ? { pageBreakBefore: true } : {}),
  });
}

function listBlock(c: Ctx, b: Extract<AnyBlock, { type: "bulletList" | "orderedList" }>): Out[] {
  const plan = c.lists.get(b.id)!;
  const out: Out[] = [];
  const textLeft = mmToTwips((plan.depth + 1) * c.t.listIndentMm);
  const lvl = plan.reference === "bullets" ? Math.min(plan.depth, 4) : 0;
  b.items.forEach((item: ListItem, idx) => {
    let first = true;
    const startBreak = idx === 0 ? takeBreak(c) : false;
    item.content.forEach((child, ci) => {
      if (child.type === "paragraph") {
        out.push(new Paragraph({
          children: runs(c, child.content),
          alignment: alignOf(child.align),
          spacing: spacing(c.t, 2),
          ...(first ? { numbering: { reference: plan.reference, level: lvl } } : { indent: { left: textLeft } }),
          ...(first && startBreak ? { pageBreakBefore: true } : {}),
        }));
        first = false;
      } else {
        if (first) {
          out.push(new Paragraph({ children: [], spacing: spacing(c.t, 2), numbering: { reference: plan.reference, level: lvl }, ...(startBreak ? { pageBreakBefore: true } : {}) }));
          first = false;
        }
        out.push(...listBlock(c, child));
      }
      void ci;
    });
    if (first) out.push(new Paragraph({ children: [], numbering: { reference: plan.reference, level: lvl } }));
  });
  return out;
}

const thin = (color: string) => ({ style: BorderStyle.SINGLE, size: 4, color: hex(color) });

function cellContent(c: Ctx, blocks: readonly CellChild[], head: boolean, align?: string): (Paragraph | Table)[] {
  const out: (Paragraph | Table)[] = [];
  for (const b of blocks) {
    if (b.type === "paragraph") {
      out.push(new Paragraph({ children: runs(c, b.content, head ? { bold: true } : {}), alignment: alignOf(align ?? b.align), spacing: spacing(c.t, 2) }));
    } else out.push(...listBlock(c, b));
  }
  return out.length ? out : [new Paragraph({ children: [] })];
}

function tableBlock(c: Ctx, b: TableBlock): Table {
  const t = c.t;
  const total = t.page.textWidthTwips;
  const widths = b.colWidths.map((w) => Math.round((total * w) / 100));
  // The widths must add up exactly or Word shrinks the table.
  widths[widths.length - 1] += total - widths.reduce((a, x) => a + x, 0);
  const pad = TW(t.cellPaddingPt);
  const border = thin(t.colors.tableBorder);
  return new Table({
    width: { size: total, type: WidthType.DXA },
    columnWidths: widths,
    layout: TableLayoutType.FIXED,
    borders: { top: border, bottom: border, left: border, right: border, insideHorizontal: border, insideVertical: border },
    rows: b.rows.map((r, ri) => {
      const head = b.headerRow && ri === 0;
      return new TableRow({
        ...(head ? { tableHeader: true } : {}),
        cantSplit: true,
        children: r.cells.map((cell, ci) => new TableCell({
          width: { size: widths[ci], type: WidthType.DXA },
          margins: { top: pad, bottom: pad, left: pad, right: pad },
          shading: head ? { type: ShadingType.CLEAR, fill: hex(t.colors.tableHeaderBg), color: "auto" } : undefined,
          children: cellContent(c, cell.content, head, cell.align) as Paragraph[],
        })),
      });
    }),
  });
}

function calloutBlock(c: Ctx, b: Extract<AnyBlock, { type: "callout" }>): Table {
  const t = c.t;
  const v = t.callout[b.variant];
  const none = { style: BorderStyle.NONE, size: 0, color: "auto" };
  return new Table({
    width: { size: t.page.textWidthTwips, type: WidthType.DXA },
    columnWidths: [t.page.textWidthTwips],
    layout: TableLayoutType.FIXED,
    borders: { top: none, bottom: none, right: none, left: none, insideHorizontal: none, insideVertical: none },
    rows: [new TableRow({
      cantSplit: true,
      children: [new TableCell({
        width: { size: t.page.textWidthTwips, type: WidthType.DXA },
        margins: { top: 100, bottom: 100, left: 160, right: 160 },
        shading: { type: ShadingType.CLEAR, fill: hex(v.bg), color: "auto" },
        borders: { top: none, bottom: none, right: none, left: { style: BorderStyle.SINGLE, size: 24, color: hex(v.border) } },
        children: cellContent(c, b.content, false) as Paragraph[],
      })],
    })],
  });
}

function signatureBlock(c: Ctx, b: Extract<AnyBlock, { type: "signatureBlock" }>, width?: number): Paragraph[] {
  const t = c.t;
  const w = width ?? t.page.textWidthTwips;
  const rightIndent = width ? Math.round(w * 0.1) : Math.round(w * 0.38);
  const lineEnd = w - rightIndent;
  const out: Paragraph[] = [];
  out.push(new Paragraph({ children: [new TextRun({ text: b.label, bold: true })], keepNext: true, keepLines: true, spacing: { before: TW(8), after: 0 }, ...(takeBreak(c) ? { pageBreakBefore: true } : {}) }));
  // Every field is one row: the label, then a line to the right edge on the same baseline. The signature row has room above its line to sign.
  const rows: [string, boolean][] = [["Signature", true], ["Name", b.showName], ["Designation", b.showDesignation], ["Date", b.showDate]];
  const active = rows.filter(([, on]) => on);
  active.forEach(([label], i) => {
    out.push(new Paragraph({
      keepNext: i < active.length - 1,
      keepLines: true,
      spacing: { before: label === "Signature" ? mmToTwips(t.signatureGapMm) - TW(12) : TW(6), after: 0 },
      tabStops: [{ type: TabStopType.LEFT, position: mmToTwips(24) }, { type: TabStopType.RIGHT, position: lineEnd, leader: LeaderType.UNDERSCORE }],
      children: [new TextRun({ text: label, size: HALF(t.basePt - 1), color: hex(t.colors.muted) }), new TextRun({ children: [new Tab(), new Tab()] })],
    }));
  });
  out.push(new Paragraph({ children: [], spacing: { before: 0, after: TW(10) } }));
  return out;
}

/** Two signature blocks side by side (borderless columns); the row stays on one page. */
function signatureRowTable(c: Ctx, blocksIn: Extract<AnyBlock, { type: "signatureBlock" }>[]): Table {
  const none = { style: BorderStyle.NONE, size: 0, color: "auto" };
  const total = c.t.page.textWidthTwips;
  const half = Math.floor(total / 2);
  const cell = (b: Extract<AnyBlock, { type: "signatureBlock" }> | undefined) => new TableCell({
    width: { size: half, type: WidthType.DXA }, margins: { top: 0, bottom: 0, left: 0, right: 120 }, borders: { top: none, bottom: none, left: none, right: none },
    children: b ? signatureBlock(c, b, half - 120) : [new Paragraph({ children: [] })],
  });
  return new Table({
    width: { size: half * 2, type: WidthType.DXA }, columnWidths: [half, half], layout: TableLayoutType.FIXED,
    borders: { top: none, bottom: none, left: none, right: none, insideHorizontal: none, insideVertical: none },
    rows: [new TableRow({ cantSplit: true, children: [cell(blocksIn[0]), cell(blocksIn[1])] })],
  });
}

/** The company details block: two borderless columns (brand side: logo, name, address; details side: "Label: value" lines). */
function letterheadTable(c: Ctx, b: Extract<AnyBlock, { type: "letterhead" }>): Table {
  const t = c.t;
  const none = { style: BorderStyle.NONE, size: 0, color: "auto" };
  const right = b.align === "right";
  const total = t.page.textWidthTwips;
  const detailW = b.details.length ? Math.min(mmToTwips(62), Math.round(total * 0.45)) : 0;
  const brandW = total - detailW;
  const asset = b.logoFileId ? c.p.images.get(b.logoFileId) : undefined;
  const al = right ? AlignmentType.RIGHT : AlignmentType.LEFT;
  const brandKids: Paragraph[] = [];
  if (asset && b.logoWidthMm) brandKids.push(imageParagraph(c, asset, b.logoWidthMm, (b.logoWidthMm * asset.heightPx) / asset.widthPx, right ? "right" : "left", "Company logo", "logo"));
  if (b.name) brandKids.push(new Paragraph({ alignment: al, spacing: { before: 0, after: 20 }, children: [new TextRun({ text: b.name, bold: true, size: HALF(14), color: hex(t.colors.primary) })] }));
  for (const l of b.address) brandKids.push(new Paragraph({ alignment: al, spacing: { before: 0, after: 0 }, children: [new TextRun({ text: l, size: HALF(t.basePt - 1.5), color: hex(t.colors.muted) })] }));
  if (!brandKids.length) brandKids.push(new Paragraph({ children: [] }));
  const detailKids: Paragraph[] = b.details.map((d) => new Paragraph({
    alignment: right ? AlignmentType.LEFT : AlignmentType.RIGHT, spacing: { before: 0, after: 10 },
    children: [new TextRun({ text: `${d.label}: `, size: HALF(t.basePt - 2.5), color: hex(t.colors.muted) }), new TextRun({ text: d.value, size: HALF(t.basePt - 1.5) })],
  }));
  const cell = (w: number, kids: Paragraph[]) => new TableCell({ width: { size: w, type: WidthType.DXA }, margins: { top: 0, bottom: 0, left: 0, right: 0 }, borders: { top: none, bottom: none, left: none, right: none }, children: kids });
  const cells = b.details.length ? (right ? [cell(detailW, detailKids), cell(brandW, brandKids)] : [cell(brandW, brandKids), cell(detailW, detailKids)]) : [cell(total, brandKids)];
  const widths = b.details.length ? (right ? [detailW, brandW] : [brandW, detailW]) : [total];
  return new Table({
    width: { size: total, type: WidthType.DXA },
    columnWidths: widths,
    layout: TableLayoutType.FIXED,
    borders: { top: none, bottom: none, left: none, right: none, insideHorizontal: none, insideVertical: none },
    rows: [new TableRow({ cantSplit: true, children: cells })],
  });
}

function imageParagraph(c: Ctx, asset: { bytes: Buffer; mime: string; widthPx: number; heightPx: number }, wMm: number, hMm: number, align: "left" | "center" | "right", alt: string, name: string): Paragraph {
  const px = (mm: number) => Math.max(1, Math.round((mm / 25.4) * 96));
  return new Paragraph({
    alignment: alignOf(align),
    spacing: spacing(c.t, 2),
    children: [new ImageRun({ type: asset.mime === "image/png" ? "png" : "jpg", data: asset.bytes, transformation: { width: px(wMm), height: px(hMm) }, altText: { name, description: alt, title: alt } })],
    ...(takeBreak(c) ? { pageBreakBefore: true } : {}),
  });
}

function blocks(c: Ctx, list: readonly AnyBlock[], opts: { small?: boolean } = {}): Out[] {
  const out: Out[] = [];
  const t = c.t;
  for (const b of groupSignatureRows(list)) {
    // A page break is carried by the next paragraph-like block; anything else gets a zero-height paragraph that carries it.
    if (c.pendingBreak && !["paragraph", "heading", "clause", "pageBreak", "section", "conditional", "repeat"].includes(b.type)) {
      out.push(new Paragraph({ children: [], pageBreakBefore: true, spacing: { before: 0, after: 0, line: 20, lineRule: LineRuleType.EXACT } }));
      c.pendingBreak = false;
    }
    switch (b.type) {
      case "paragraph": out.push(paragraphBlock(c, b, { small: opts.small })); break;
      case "heading": out.push(headingBlock(c, b)); break;
      case "clause": out.push(clauseBlock(c, b)); break;
      case "bulletList": case "orderedList": out.push(...listBlock(c, b)); break;
      case "table": out.push(tableBlock(c, b), new Paragraph({ children: [], spacing: { before: 0, after: TW(6) } })); break;
      case "image": {
        const a = c.p.images.get(b.fileId);
        if (!a) break;
        const s = imageSizeMm(a, b.widthPct, t);
        out.push(imageParagraph(c, a, s.widthMm, s.heightMm, b.align, b.alt, `image-${b.id}`));
        if (b.caption) out.push(new Paragraph({ alignment: alignOf(b.align), spacing: spacing(t, 6), children: [new TextRun({ text: b.caption, size: HALF(t.basePt - 1.5), color: hex(t.colors.muted) })] }));
        break;
      }
      case "callout": out.push(calloutBlock(c, b), new Paragraph({ children: [], spacing: { before: 0, after: TW(6) } })); break;
      case "signatureBlock": break; // always inside a row (see groupSignatureRows)
      case "signatureRow": out.push(signatureRowTable(c, b.blocks as Extract<AnyBlock, { type: "signatureBlock" }>[]), new Paragraph({ children: [], spacing: { before: 0, after: TW(4) } })); break;
      case "letterhead": out.push(letterheadTable(c, b), new Paragraph({ children: [], spacing: { before: 0, after: TW(2) } })); break;
      case "pageBreak": c.pendingBreak = true; break;
      case "divider": out.push(new Paragraph({ children: [], spacing: { before: 60, after: 60 }, border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: hex(t.colors.rule), space: 1 } } })); break;
      case "spacer": out.push(new Paragraph({ children: [], spacing: { before: 0, after: 0, line: Math.max(20, mmToTwips(b.heightMm)), lineRule: LineRuleType.EXACT } })); break;
      case "toc": out.push(...tocBlock(c)); break;
      case "section": case "conditional": case "repeat": out.push(...blocks(c, b.children, opts)); break;
    }
  }
  return out;
}

function tocBlock(c: Ctx): Paragraph[] {
  const t = c.t;
  if (!c.p.toc.length) return [];
  const out: Paragraph[] = [new Paragraph({ children: [new TextRun({ text: "Contents", bold: true, size: HALF(t.heading[2].pt), color: hex(t.colors.primary) })], keepNext: true, spacing: { before: 0, after: TW(6) }, ...(takeBreak(c) ? { pageBreakBefore: true } : {}) })];
  for (const e of c.p.toc) {
    const anchor = c.bookmarks.get(e.id);
    const run = new TextRun({ text: e.text, color: hex(t.colors.text) });
    out.push(new Paragraph({ spacing: { before: 0, after: 60 }, indent: { left: mmToTwips((e.level - 1) * 5) }, children: anchor ? [new InternalHyperlink({ anchor, children: [run] })] : [run] }));
  }
  out.push(new Paragraph({ children: [], spacing: { before: 0, after: TW(8) } }));
  return out;
}

function zoneChildren(c: Ctx, list: readonly ZoneBlock[]): Out[] {
  return blocks(c, list, { small: true });
}

// ---- document --------------------------------------------------------------------------------------------------------------

function styles(t: StyleTokens) {
  const head = (id: 1 | 2 | 3 | 4) => ({
    id: `Heading${id}`,
    name: `Heading ${id}`,
    basedOn: "Normal",
    next: "Normal",
    quickFormat: true,
    run: { bold: true, size: HALF(t.heading[id].pt), color: hex(t.heading[id].color === "primary" ? t.colors.primary : t.colors.text), font: FAMILIES[t.fonts.heading].name },
    // Keep-with-next: a heading never ends a page.
    paragraph: { keepNext: true, keepLines: true, outlineLevel: id - 1, spacing: { before: TW(t.heading[id].beforePt), after: TW(t.heading[id].afterPt), line: 300, lineRule: LineRuleType.AUTO } },
  });
  return {
    default: {
      document: {
        run: { font: t.fontFamily, size: HALF(t.basePt), color: hex(t.colors.text), language: { value: "en-IN" } },
        paragraph: { spacing: { after: TW(t.paragraphAfterPt), line: Math.round(t.lineHeight * 240), lineRule: LineRuleType.AUTO } },
      },
    },
    paragraphStyles: [head(1), head(2), head(3), head(4)],
  };
}

function embeddedFonts(mode: FontEmbedding, t: StyleTokens) {
  if (mode === "none") return undefined;
  const keys = [...new Set<FamilyKey>([t.fonts.body, t.fonts.heading])];
  return keys.map((key) => ({
    name: FAMILIES[key].name,
    data: readFont("regular", key),
    bold: readFont("bold", key),
    ...(mode === "all" ? { italic: readFont("italic", key), boldItalic: readFont("boldItalic", key) } : {}),
  }));
}

/**
 * Makes the file reproducible: fixed ZIP timestamps, fixed core-property dates, and embedded fonts re-obfuscated with a key derived from
 * the font itself (docx picks a random key per build). The obfuscation is a symmetric XOR of the first 32 bytes, so re-keying is exact.
 */
async function normalise(buf: Buffer, dateIso: string): Promise<Buffer> {
  const zip = await JSZip.loadAsync(buf);
  const date = new Date(`${dateIso}T00:00:00Z`);
  const stamp = `${dateIso}T00:00:00Z`;
  const xorKey = (guid: string) => Buffer.from(guid.replace(/[{}-]/g, ""), "hex").reverse();
  const keys = new Map<number, { oldKey: string; newKey: string }>();

  const tableFile = zip.file("word/fontTable.xml");
  let tableXml = tableFile ? await tableFile.async("string") : "";
  const re = /r:id="rId(\d+)"\s+w:fontKey="\{([0-9A-Fa-f-]+)\}"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(tableXml))) {
    const n = Number(m[1]);
    const font = zip.file(`word/fonts/font${n}.odttf`);
    if (!font) continue;
    const old = xorKey(m[2]);
    const data = Buffer.from(await font.async("nodebuffer"));
    const plain = Buffer.from(data);
    for (let i = 0; i < 32; i++) plain[i] ^= old[i % 16];
    const h = createHash("sha256").update(plain).digest();
    const g = Buffer.from(h.subarray(0, 16));
    g[6] = (g[6] & 0x0f) | 0x40;
    g[8] = (g[8] & 0x3f) | 0x80;
    const s = g.toString("hex");
    const newGuid = `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`.toUpperCase();
    keys.set(n, { oldKey: m[2], newKey: newGuid });
    const nk = xorKey(newGuid);
    const out = Buffer.from(plain);
    for (let i = 0; i < 32; i++) out[i] ^= nk[i % 16];
    zip.file(`word/fonts/font${n}.odttf`, out);
  }
  for (const k of keys.values()) tableXml = tableXml.replace(`{${k.oldKey}}`, `{${k.newKey}}`);
  if (tableFile) zip.file("word/fontTable.xml", tableXml);

  // docx numbers bookmarks from a counter shared by every document built in the process and names hyperlink/picture relationships at random.
  // Both are renumbered in order of appearance so the same inputs always give the same bytes.
  const renameIds = async (partName: string, relName: string) => {
    const part = zip.file(partName);
    const rel = zip.file(relName);
    if (!part || !rel) return;
    let relXml = await rel.async("string");
    let partXml = await part.async("string");
    const odd = [...relXml.matchAll(/Id="([^"]+)"/g)].map((x) => x[1]).filter((id) => !/^rId\d+$/.test(id));
    odd.forEach((old, i) => {
      const fresh = `rIdx${i + 1}`;
      relXml = relXml.split(`Id="${old}"`).join(`Id="${fresh}"`);
      for (const attr of ["r:id", "r:embed", "r:link"]) partXml = partXml.split(`${attr}="${old}"`).join(`${attr}="${fresh}"`);
    });
    zip.file(relName, relXml);
    zip.file(partName, partXml);
  };
  for (const name of Object.keys(zip.files)) {
    const m2 = /^(.*)\/_rels\/([^/]+)\.rels$/.exec(name);
    if (m2 && m2[1] === "word") await renameIds(`word/${m2[2]}`, name);
  }
  for (const name of Object.keys(zip.files).filter((n) => /^word\/(document|header\d*|footer\d*)\.xml$/.test(n))) {
    let xml = await zip.files[name].async("string");
    const map = new Map<string, number>();
    xml = xml.replace(/<w:bookmarkStart([^>]*?) w:id="(\d+)"/g, (_all, rest: string, id: string) => { const n = map.size + 1; map.set(id, n); return `<w:bookmarkStart${rest} w:id="${n}"`; });
    xml = xml.replace(/<w:bookmarkEnd w:id="(\d+)"/g, (all, id: string) => (map.has(id) ? `<w:bookmarkEnd w:id="${map.get(id)}"` : all));
    zip.file(name, xml);
  }

  const core = zip.file("docProps/core.xml");
  if (core) {
    const xml = (await core.async("string")).replace(/(<dcterms:created[^>]*>)[^<]*(<\/dcterms:created>)/, `$1${stamp}$2`).replace(/(<dcterms:modified[^>]*>)[^<]*(<\/dcterms:modified>)/, `$1${stamp}$2`);
    zip.file("docProps/core.xml", xml);
  }
  const out = new JSZip();
  const names = Object.keys(zip.files).filter((n) => !zip.files[n].dir).sort((a, b) => (a === "[Content_Types].xml" ? -1 : b === "[Content_Types].xml" ? 1 : a.localeCompare(b)));
  for (const name of names) out.file(name, await zip.files[name].async("nodebuffer"), { date, compression: "DEFLATE", createFolders: false });
  return out.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 6 } });
}

/**
 * Renders a document to DOCX. Same blocking rules as the PDF: throws `RenderBlockedError` when the document is invalid, has unfilled values
 * (unless `allowUnresolved`), or uses an unusable image.
 */
export async function renderDocx(doc: PBDoc, opts: DocxOptions): Promise<DocxResult> {
  const p = prepareRender(doc, opts);
  const c = new Ctx(p);
  const t = p.tokens;
  const embed = opts.embedFonts ?? "regular_bold";

  // Bookmarks for headings the contents list links to.
  p.toc.forEach((e, i) => c.bookmarks.set(e.id, `_toc${i + 1}`));
  const plan = { ordered: [] as { ref: string; style: "decimal" | "alpha" | "roman"; start: number; depth: number }[] };
  planLists(c, p.doc.body, 0, plan);
  planLists(c, p.doc.header, 0, plan);
  planLists(c, p.doc.footer, 0, plan);

  const g = zoneGeometry(t);
  const flagged = p.flagged.unresolved.length + p.flagged.placeholders.length > 0;

  const body = blocks(c, p.doc.body);

  // Header content is built per use (a component instance belongs to one part). `scope`: every page, first page only, or no letterhead.
  const scope = p.letterhead;
  const watermarkKids = (): Out[] => p.watermark
    ? [new Paragraph({
        spacing: { before: 0, after: 0, line: 20, lineRule: LineRuleType.EXACT },
        children: [new TextWatermark({ text: p.watermark, font: t.fontFamily, color: flagged ? "B91C1C" : "94A3B8", opacity: 0.25, bold: true })],
      })]
    : [];
  const letterheadKids = (): Out[] => {
    if (scope === "none") return [];
    const out: Out[] = [];
    if (p.logo) {
      const hMm = (p.logo.widthMm * p.logo.asset.heightPx) / p.logo.asset.widthPx;
      out.push(imageParagraph(c, p.logo.asset, p.logo.widthMm, hMm, p.logo.align, "Company logo", "logo"));
    }
    out.push(...zoneChildren(c, p.doc.header));
    return out;
  };
  const footerKids = (): Out[] => {
    const out: Out[] = [...zoneChildren(c, p.doc.footer)];
    if (p.footerText) out.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 20, after: 0 }, children: [new TextRun({ text: p.footerText, size: HALF(t.basePt - 2.5), color: hex(t.colors.muted) })] }));
    return out;
  };
  const emptyHeader = () => new Header({ children: [new Paragraph({ children: [], spacing: { before: 0, after: 0 } })] });
  const hdr = (kids: Out[]) => (kids.length ? new Header({ children: kids as Paragraph[] }) : emptyHeader());
  const hasFooter = p.doc.footer.length > 0 || !!p.footerText;
  const wmOnly = watermarkKids();
  const compactKids = (): Out[] => zoneChildren(c, p.doc.header);
  const headers = p.identity
    ? (scope === "all" && p.doc.header.length
        ? { first: hdr(wmOnly), default: hdr([...watermarkKids(), ...compactKids()]) }
        : wmOnly.length ? { default: hdr(wmOnly) } : undefined)
    : scope === "first"
    ? { first: hdr([...watermarkKids(), ...letterheadKids()]), default: hdr(wmOnly) }
    : (wmOnly.length || p.doc.header.length || p.logo) && scope === "all"
      ? { default: hdr([...watermarkKids(), ...letterheadKids()]) }
      : wmOnly.length ? { default: hdr(wmOnly) } : undefined;
  const footers = !hasFooter ? undefined : scope === "first" || (p.identity && scope === "all")
    ? { first: new Footer({ children: footerKids() as Paragraph[] }), default: new Footer({ children: footerKids() as Paragraph[] }) }
    : { default: new Footer({ children: footerKids() as Paragraph[] }) };

  const m = t.page.margins;
  const document = new Document({
    creator: p.meta.author ?? "SelfRun Playbook",
    lastModifiedBy: p.meta.author ?? "SelfRun Playbook",
    title: p.meta.title,
    subject: p.meta.subject,
    description: p.meta.docNumber ? `${p.meta.title} (${p.meta.docNumber})` : p.meta.title,
    styles: styles(t),
    numbering: { config: numberingConfig(t, plan.ordered) },
    fonts: embeddedFonts(embed, t),
    sections: [{
      properties: {
        ...(scope === "first" || (p.identity && scope === "all" && p.doc.header.length) ? { titlePage: true } : {}),
        page: {
          size: { width: t.page.widthTwips, height: t.page.heightTwips, orientation: p.doc.page.orientation === "landscape" ? "landscape" : "portrait" } as never,
          margin: { top: mmToTwips(m.top), right: mmToTwips(m.right), bottom: mmToTwips(m.bottom), left: mmToTwips(m.left), header: mmToTwips(g.headerTopMm), footer: mmToTwips(g.footerBottomMm) },
        },
      },
      headers,
      footers,
      children: body as Paragraph[],
    }],
  });

  const raw = await Packer.toBuffer(document);
  const buffer = await normalise(Buffer.from(raw), p.meta.dateIso);
  return { buffer, warnings: p.warnings, flagged: p.flagged, watermark: p.watermark, estimatedPages: p.estimatedPages, embeddedFonts: embed };
}

/** Content hash of an exported file (stored with the version so a re-download can be proven identical). */
export const docxHash = (buf: Buffer) => sha256Hex(buf);
