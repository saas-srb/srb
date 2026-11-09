import { groupSignatureRows } from "@/lib/products/playbook-ai/doc/signature-rows";
import "server-only";
import React from "react";
import { Document, Font, Image, Link, Page, Text, View, renderToBuffer } from "@react-pdf/renderer";
import type { Style } from "@react-pdf/types";
import type { AnyBlock, CellChild, ContentBlock, InlineNode, ListItem, Mark, TableBlock, ZoneBlock } from "@/lib/products/playbook-ai/doc/types";
import { listMarker } from "@/lib/products/playbook-ai/doc/numbering";
import { mmToPt } from "@/lib/products/playbook-ai/doc/page";
import { FAMILIES, fontPath, textColorHex, zoneGeometry, type FamilyKey, type StyleTokens } from "@/lib/products/playbook-ai/doc/render/tokens";
import { imageSizeMm, prepareRender, type Prepared, type RenderOptions, type TocEntry } from "@/lib/products/playbook-ai/doc/render/prepare";
import type { PBDoc } from "@/lib/products/playbook-ai/doc/types";

/**
 * PDF renderer: PBDoc to react-pdf. Reads the SAME prepared document and style tokens as the DOCX renderer. Server-only.
 *
 * Known limits of this engine (documented, tested, not hidden): table header rows are not repeated on a following page; superscript and
 * subscript are drawn as smaller raised/lowered text only where the engine allows; a footer or header paragraph that shows a page number is
 * drawn as one run of plain text (the engine can only number pages inside a whole Text); text is not hyphenated.
 */

const registered = new Set<FamilyKey>();
function registerFonts(keys: readonly FamilyKey[]) {
  for (const key of keys) {
    if (registered.has(key)) continue;
    Font.register({
      family: FAMILIES[key].pdf,
      fonts: [
        { src: fontPath("regular", key), fontWeight: 400, fontStyle: "normal" },
        { src: fontPath("bold", key), fontWeight: 700, fontStyle: "normal" },
        { src: fontPath("italic", key), fontWeight: 400, fontStyle: "italic" },
        { src: fontPath("boldItalic", key), fontWeight: 700, fontStyle: "italic" },
      ],
    });
    registered.add(key);
  }
}
const bodyFont = (t: StyleTokens) => FAMILIES[t.fonts.body].pdf;
const headFont = (t: StyleTokens) => FAMILIES[t.fonts.heading].pdf;

const noHyphen = (w: string) => [w];
const mm = mmToPt;

export interface PdfResult {
  buffer: Buffer;
  pages: number;
  warnings: string[];
  flagged: Prepared["flagged"];
  watermark: string | null;
  /** True when page numbers in the table of contents were measured; false when there is no TOC or measuring failed. */
  tocPageNumbers: boolean;
}

type PageMap = Map<string, number>;

class Ctx {
  constructor(public p: Prepared, public pageOf: PageMap | null, public recorder: PageMap | null) {}
  get t() { return this.p.tokens; }
}

// ---- inline ----------------------------------------------------------------------------------------------------------------

function markStyle(t: StyleTokens, marks: readonly Mark[] | undefined, base: Style = {}): Style {
  const s: Style = { ...base };
  let link: string | null = null;
  const deco: string[] = [];
  for (const m of marks ?? []) {
    switch (m.type) {
      case "bold": s.fontWeight = 700; break;
      case "italic": s.fontStyle = "italic"; break;
      case "underline": deco.push("underline"); break;
      case "strike": deco.push("line-through"); break;
      case "sup": s.fontSize = t.basePt * 0.7; break;
      case "sub": s.fontSize = t.basePt * 0.7; break;
      case "highlight": s.backgroundColor = t.highlight[m.color]; break;
      case "color": s.color = textColorHex(t, m.color); break;
      case "link": link = m.href; s.color = t.colors.blue; deco.push("underline"); break;
    }
  }
  if (deco.length) s.textDecoration = deco.join(" ") as Style["textDecoration"];
  void link;
  return s;
}

const linkOf = (marks?: readonly Mark[]) => marks?.find((m): m is Extract<Mark, { type: "link" }> => m.type === "link")?.href ?? null;

/** Splits inline content at hard breaks. */
function splitLines(nodes: readonly InlineNode[]): InlineNode[][] {
  const lines: InlineNode[][] = [[]];
  for (const n of nodes) {
    if (n.type === "hardBreak") lines.push([]);
    else lines[lines.length - 1].push(n);
  }
  return lines;
}

function runs(c: Ctx, source: readonly InlineNode[], keyPrefix: string): React.ReactNode[] {
  const t = c.t;
  const nodes = source;
  return nodes.map((n, i) => {
    const key = `${keyPrefix}-${i}`;
    switch (n.type) {
      case "text": {
        const el = <Text key={key} style={markStyle(t, n.marks)}>{n.text}</Text>;
        const href = linkOf(n.marks);
        return href ? <Link key={key} src={href} style={markStyle(t, n.marks)}>{n.text}</Link> : el;
      }
      case "var": return <Text key={key} style={markStyle(t, n.marks, { backgroundColor: t.colors.flagged })}>{`[${n.key}]`}</Text>;
      case "placeholder": return <Text key={key} style={{ backgroundColor: t.colors.flagged }}>{`[${n.label}]`}</Text>;
      case "field": return <Text key={key} style={markStyle(t, n.marks, { fontFamily: bodyFont(t) })}>{""}</Text>; // page fields are handled in `pageText`
      // A "\n" in a run makes react-pdf reference unembedded Helvetica (verified with pdffonts), so a hard break starts a new Text line instead.
      case "hardBreak": return null; // callers split lines first (see `textBlock`)
    }
  });
}

const hasPageField = (nodes: readonly InlineNode[]) => nodes.some((n) => n.type === "field" && (n.field === "pageNumber" || n.field === "totalPages"));

/** A paragraph that shows page numbers: the engine numbers pages only inside a whole Text, so the line is built there as plain text. */
function pageText(c: Ctx, nodes: readonly InlineNode[], style: Style, key: string) {
  const first = nodes.find((n): n is Extract<InlineNode, { type: "text" }> => n.type === "text");
  // react-pdf draws nothing for a `render` Text that sets lineHeight (verified), so it is dropped for these lines.
  const { lineHeight: _lineHeight, ...rest } = style;
  void _lineHeight;
  const s = markStyle(c.t, first?.marks, { fontFamily: bodyFont(c.t), ...rest });
  return (
    <Text key={key} style={s} render={({ pageNumber, totalPages }) =>
      nodes.map((n) => {
        if (n.type === "text") return n.text;
        if (n.type === "field") return n.field === "pageNumber" ? String(pageNumber) : n.field === "totalPages" ? String(totalPages) : "";
        if (n.type === "var") return `[${n.key}]`;
        if (n.type === "placeholder") return `[${n.label}]`;
        return "";
      }).join("")
    } />
  );
}

// ---- blocks ----------------------------------------------------------------------------------------------------------------

const alignOf = (a?: string): Style["textAlign"] => (a === "center" || a === "right" || a === "justify" ? a : "left");

/** One Text, or one Text per line when the content has hard breaks (no "\n" is ever sent to the engine). */
function textBlock(c: Ctx, nodes: readonly InlineNode[], style: Style, key: string, props: { minFlex?: boolean } = {}) {
  const lines = splitLines(nodes);
  const lineEl = (ln: InlineNode[], i: number, st: Style) => (
    <Text key={`${key}-l${i}`} style={st} hyphenationCallback={noHyphen}>{ln.length ? runs(c, ln, `${key}-${i}`) : " "}</Text>
  );
  if (lines.length === 1) return lineEl(lines[0], 0, { ...style, ...(props.minFlex ? { flex: 1 } : {}) });
  const { marginBottom, ...inner } = style;
  return (
    <View key={key} style={{ marginBottom, ...(props.minFlex ? { flex: 1 } : {}) }}>
      {lines.map((ln, i) => lineEl(ln, i, inner))}
    </View>
  );
}

function paragraph(c: Ctx, b: Extract<AnyBlock, { type: "paragraph" }>, extra: Style = {}) {
  const t = c.t;
  const style: Style = { fontSize: t.basePt, lineHeight: t.lineHeight, color: t.colors.text, textAlign: alignOf(b.align), marginBottom: t.paragraphAfterPt, ...extra };
  if (hasPageField(b.content)) return pageText(c, b.content, style, b.id);
  return textBlock(c, b.content, style, b.id);
}

function listItems(c: Ctx, items: ListItem[], ordered: { style: "decimal" | "alpha" | "roman"; start: number } | null, depth: number, keyPrefix: string): React.ReactNode[] {
  const t = c.t;
  return items.map((item, i) => (
    <View key={item.id} style={{ flexDirection: "row", marginBottom: 2 }} wrap={false}>
      <Text style={{ width: mm(t.listMarkerMm), fontSize: t.basePt, lineHeight: t.lineHeight, textAlign: "right", paddingRight: 4, color: t.colors.text }}>
        {ordered ? listMarker(ordered.style, ordered.start + i) : depth % 2 === 0 ? "•" : "–"}
      </Text>
      <View style={{ flex: 1 }}>
        {item.content.map((ch) => blockNode(c, ch as AnyBlock, depth + 1, `${keyPrefix}-${i}`, { marginBottom: 2 }))}
      </View>
    </View>
  ));
}

function table(c: Ctx, b: TableBlock) {
  const t = c.t;
  return (
    <View key={b.id} style={{ marginBottom: t.paragraphAfterPt + 2, borderTopWidth: 0.75, borderLeftWidth: 0.75, borderColor: t.colors.tableBorder }}>
      {b.rows.map((r, ri) => (
        <View key={r.id} style={{ flexDirection: "row" }} wrap={false}>
          {r.cells.map((cell, ci) => {
            const head = b.headerRow && ri === 0;
            return (
              <View key={cell.id} style={{ width: `${b.colWidths[ci]}%`, padding: t.cellPaddingPt, borderRightWidth: 0.75, borderBottomWidth: 0.75, borderColor: t.colors.tableBorder, backgroundColor: head ? t.colors.tableHeaderBg : undefined }}>
                {cell.content.map((ch) => blockNode(c, ch, 1, cell.id, { marginBottom: 2, textAlign: alignOf(cell.align), ...(head ? { fontWeight: 700 } : {}) }))}
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}

function clause(c: Ctx, b: Extract<ContentBlock, { type: "clause" }>) {
  const t = c.t;
  const g = t.clause[b.level];
  const label = c.p.clauseLabels.get(b.id);
  return (
    <View key={b.id} style={{ flexDirection: "row", marginBottom: t.paragraphAfterPt }} wrap={false}>
      <Text style={{ width: mm(g.textMm), paddingLeft: mm(g.labelMm), fontSize: t.basePt, lineHeight: t.lineHeight, color: t.colors.text }}>{label ?? ""}</Text>
      {textBlock(c, b.content, { fontSize: t.basePt, lineHeight: t.lineHeight, color: t.colors.text, textAlign: "justify" }, `${b.id}-t`, { minFlex: true })}
    </View>
  );
}

function heading(c: Ctx, b: Extract<ContentBlock, { type: "heading" }>) {
  const t = c.t;
  const h = t.heading[b.level];
  return (
    // Keep-with-next: the heading moves to the next page unless some of what follows fits with it.
    <View key={b.id} id={b.id} minPresenceAhead={Math.max(60, h.pt * 3)} wrap={false} style={{ marginTop: h.beforePt, marginBottom: h.afterPt }}>
      {textBlock(c, b.content, { fontFamily: headFont(t), fontSize: h.pt, fontWeight: 700, color: h.color === "primary" ? t.colors.primary : t.colors.text, lineHeight: 1.25, textAlign: alignOf(b.align) }, `${b.id}-t`)}
      {c.recorder ? <Text style={{ fontSize: 0.1, height: 0.1 }} render={({ pageNumber }) => { c.recorder!.set(b.id, pageNumber); return ""; }} /> : null}
    </View>
  );
}

function toc(c: Ctx) {
  const t = c.t;
  if (!c.p.toc.length) return null;
  return (
    <View key="toc" style={{ marginBottom: t.paragraphAfterPt + 6 }}>
      <Text style={{ fontFamily: headFont(t), fontSize: t.heading[2].pt, fontWeight: 700, color: t.colors.primary, marginBottom: 6 }}>Contents</Text>
      {c.p.toc.map((e: TocEntry) => (
        <View key={e.id} style={{ flexDirection: "row", alignItems: "flex-end", marginBottom: 3, paddingLeft: (e.level - 1) * mm(5) }} wrap={false}>
          <Link src={`#${e.id}`} style={{ fontFamily: bodyFont(t), fontSize: t.basePt, color: t.colors.text, textDecoration: "none" }}>{e.text}</Link>
          <View style={{ flexGrow: 1, borderBottomWidth: 0.75, borderBottomStyle: "dotted", borderColor: t.colors.muted, marginHorizontal: 4, marginBottom: 3 }} />
          <Text style={{ fontSize: t.basePt, color: t.colors.text }}>{c.pageOf?.get(e.id) ?? ""}</Text>
        </View>
      ))}
    </View>
  );
}

/** The company details block: the brand side (logo, name, address) and the details side ("Label: value" lines) in two borderless columns. */
function letterheadBlock(c: Ctx, b: Extract<ContentBlock, { type: "letterhead" }>) {
  const t = c.t;
  const asset = b.logoFileId ? c.p.images.get(b.logoFileId) : undefined;
  const right = b.align === "right";
  const ta = right ? "right" : "left";
  const logo = asset && b.logoWidthMm ? (
    // eslint-disable-next-line jsx-a11y/alt-text -- @react-pdf/renderer Image, not an HTML img
    <Image src={{ data: asset.bytes, format: asset.mime === "image/png" ? "png" : "jpg" } as unknown as string} style={{ width: mm(b.logoWidthMm), height: mm((b.logoWidthMm * asset.heightPx) / asset.widthPx), marginBottom: 4 }} />
  ) : null;
  const brandSide = (
    <View key="brand" style={{ flex: 1, alignItems: right ? "flex-end" : "flex-start" }}>
      {logo}
      {b.name ? <Text style={{ fontFamily: headFont(t), fontSize: 14, fontWeight: 700, color: t.colors.primary, textAlign: ta, marginBottom: 2 }}>{b.name}</Text> : null}
      {b.address.map((l, i) => <Text key={i} style={{ fontSize: t.basePt - 1.5, color: t.colors.muted, textAlign: ta, lineHeight: 1.35 }}>{l}</Text>)}
    </View>
  );
  const detailSide = b.details.length ? (
    <View key="details" style={{ width: mm(62), alignItems: right ? "flex-start" : "flex-end", paddingLeft: right ? 0 : 8, paddingRight: right ? 8 : 0 }}>
      {b.details.map((d, i) => (
        <Text key={i} style={{ fontSize: t.basePt - 1.5, textAlign: right ? "left" : "right", lineHeight: 1.45 }}>
          <Text style={{ color: t.colors.muted, fontSize: t.basePt - 2.5 }}>{d.label}: </Text>{d.value}
        </Text>
      ))}
    </View>
  ) : null;
  return (
    <View key={b.id} wrap={false} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
      {right ? [detailSide, brandSide] : [brandSide, detailSide]}
    </View>
  );
}

/** Blocks in order, with consecutive signature blocks printed two to a row. A row never splits across pages. */
function blockList(c: Ctx, list: readonly ContentBlock[], depth: number, key: string): React.ReactNode[] {
  return groupSignatureRows(list).map((b) => (b.type === "signatureRow" ? (
    <View key={b.id} wrap={false} style={{ flexDirection: "row" }}>
      {b.blocks.map((s) => <View key={s.id} style={{ width: "50%", paddingRight: 12 }}>{signature(c, s as Extract<ContentBlock, { type: "signatureBlock" }>)}</View>)}
    </View>
  ) : blockNode(c, b, depth, key)));
}

function signature(c: Ctx, b: Extract<ContentBlock, { type: "signatureBlock" }>) {
  const t = c.t;
  // Every field is the same row: the label at the left, its line to the right on the same baseline. The signature row is taller (room to sign above the line).
  const line = (label: string, key: string, h = 12) => (
    <View key={key} style={{ flexDirection: "row", alignItems: "flex-end", marginTop: 6 }}>
      <Text style={{ width: mm(24), fontSize: t.basePt - 1, color: t.colors.muted }}>{label}</Text>
      <View style={{ flex: 1, borderBottomWidth: 0.75, borderColor: t.colors.text, height: h }} />
    </View>
  );
  return (
    <View key={b.id} wrap={false} style={{ width: "100%", marginBottom: 14, marginTop: 4 }}>
      <Text style={{ fontSize: t.basePt, fontWeight: 700, color: t.colors.text }}>{b.label}</Text>
      {line("Signature", `${b.id}-s`, mm(t.signatureGapMm))}
      {b.showName ? line("Name", `${b.id}-n`) : null}
      {b.showDesignation ? line("Designation", `${b.id}-d`) : null}
      {b.showDate ? line("Date", `${b.id}-t`) : null}
    </View>
  );
}

function imageBlock(c: Ctx, b: Extract<AnyBlock, { type: "image" }>) {
  const a = c.p.images.get(b.fileId);
  if (!a) return null;
  const size = imageSizeMm(a, b.widthPct, c.t);
  const data = { data: a.bytes, format: a.mime === "image/png" ? "png" : "jpg" } as unknown as string;
  return (
    <View key={b.id} wrap={false} style={{ marginBottom: c.t.paragraphAfterPt, alignItems: b.align === "center" ? "center" : b.align === "right" ? "flex-end" : "flex-start" }}>
      {/* eslint-disable-next-line jsx-a11y/alt-text -- @react-pdf/renderer Image, not an HTML img */}
      <Image src={data} style={{ width: mm(size.widthMm), height: mm(size.heightMm) }} />
      {b.caption ? <Text style={{ fontSize: c.t.basePt - 1.5, color: c.t.colors.muted, marginTop: 3 }}>{b.caption}</Text> : null}
    </View>
  );
}

function blockNode(c: Ctx, b: AnyBlock | CellChild, depth: number, keyPrefix: string, extra: Style = {}): React.ReactNode {
  const t = c.t;
  switch (b.type) {
    case "paragraph": return paragraph(c, b, extra);
    case "heading": return heading(c, b);
    case "clause": return clause(c, b);
    case "bulletList": return <View key={b.id}>{listItems(c, b.items, null, depth, b.id)}</View>;
    case "orderedList": return <View key={b.id}>{listItems(c, b.items, { style: b.style, start: b.start ?? 1 }, depth, b.id)}</View>;
    case "table": return table(c, b);
    case "image": return imageBlock(c, b);
    case "callout": {
      const v = t.callout[b.variant];
      return (
        <View key={b.id} wrap={false} style={{ backgroundColor: v.bg, borderLeftWidth: 3, borderLeftColor: v.border, padding: 8, marginBottom: t.paragraphAfterPt + 2 }}>
          {b.content.map((ch) => blockNode(c, ch, depth + 1, b.id, { marginBottom: 2 }))}
        </View>
      );
    }
    case "signatureBlock": return signature(c, b);
    case "letterhead": return letterheadBlock(c, b);
    case "pageBreak": return <View key={b.id} break />;
    case "divider": return <View key={b.id} style={{ borderBottomWidth: 0.75, borderColor: t.colors.rule, marginVertical: 6 }} />;
    case "spacer": return <View key={b.id} style={{ height: mm(b.heightMm) }} />;
    case "toc": return toc(c);
    // Resolved away before rendering; a section is only a wrapper.
    case "section": return <React.Fragment key={b.id}>{blockList(c, b.children, depth, b.id)}</React.Fragment>;
    case "conditional":
    case "repeat": return <React.Fragment key={b.id}>{blockList(c, b.children, depth, b.id)}</React.Fragment>;
  }
  void keyPrefix;
}

function zone(c: Ctx, blocks: ZoneBlock[]) {
  return blocks.map((b) => blockNode(c, b, 0, "z", { marginBottom: 1, fontSize: c.t.basePt - 1.5 }));
}

function logoNode(c: Ctx) {
  const l = c.p.logo;
  if (!l) return null;
  const hMm = (l.widthMm * l.asset.heightPx) / l.asset.widthPx;
  const data = { data: l.asset.bytes, format: l.asset.mime === "image/png" ? "png" : "jpg" } as unknown as string;
  return (
    <View key="logo" style={{ alignItems: l.align === "center" ? "center" : l.align === "right" ? "flex-end" : "flex-start", marginBottom: 2 }}>
      {/* eslint-disable-next-line jsx-a11y/alt-text -- @react-pdf/renderer Image, not an HTML img */}
      <Image src={data} style={{ width: mm(l.widthMm), height: mm(hMm) }} />
    </View>
  );
}

function pdfDocument(c: Ctx) {
  const { p, t } = c;
  const g = zoneGeometry(t);
  const m = t.page.margins;
  const hasHeader = !p.identity && p.letterhead !== "none" && (p.doc.header.length > 0 || !!p.logo);
  // With the company details block on page 1, the running header is a small line in the top margin from page 2 on (never over the block).
  const runningHeader = p.identity && p.letterhead === "all" && p.doc.header.length > 0;
  const hasFooter = p.doc.footer.length > 0 || !!p.footerText;
  const flagged = p.flagged.unresolved.length + p.flagged.placeholders.length > 0;
  return (
    <Document
      title={p.meta.title}
      author={p.meta.author}
      subject={p.meta.subject}
      creator="SelfRun Playbook"
      producer="SelfRun Playbook"
      language="en-IN"
      creationDate={new Date(`${p.meta.dateIso}T00:00:00Z`)}
      modificationDate={new Date(`${p.meta.dateIso}T00:00:00Z`)}
    >
      <Page
        size={p.doc.page.size === "A4" ? "A4" : "A4"}
        orientation={p.doc.page.orientation}
        style={{
          fontFamily: bodyFont(t), fontSize: t.basePt, color: t.colors.text,
          // Letterhead on every page: the fixed header sits above the body area. First page only: the header flows once at the top of page 1.
          paddingTop: hasHeader && !p.identity && p.letterhead === "all" ? mm(g.headerTopMm) : mm(m.top), paddingBottom: mm(m.bottom), paddingLeft: mm(m.left), paddingRight: mm(m.right),
        }}
      >
        {runningHeader ? (
          <View fixed style={{ position: "absolute", top: mm(g.headerTopMm), left: mm(m.left), right: mm(m.right), minHeight: mm(t.page.headerHeightMm) }} render={({ pageNumber }) => (pageNumber > 1 ? <>{zone(c, p.doc.header)}</> : null)} />
        ) : null}
        {hasHeader ? (
          <View fixed={p.letterhead === "all"} style={{ minHeight: mm(t.page.headerHeightMm), marginBottom: mm(t.gapMm) }}>
            {logoNode(c)}
            {zone(c, p.doc.header)}
          </View>
        ) : null}

        {p.watermark ? (
          <View fixed style={{ position: "absolute", top: 0, left: 0, width: t.page.widthPt, height: t.page.heightPt, justifyContent: "center", alignItems: "center" }}>
            <Text style={{ fontSize: Math.max(28, Math.min(96, 520 / (p.watermark.length * 0.68))), fontWeight: 700, color: flagged ? "#B91C1C" : "#94A3B8", opacity: 0.16, transform: "rotate(-40deg)", letterSpacing: 4 }}>{p.watermark}</Text>
          </View>
        ) : null}

        {blockList(c, p.doc.body, 0, "b")}

        {hasFooter ? (
          <View fixed style={{ position: "absolute", left: mm(m.left), right: mm(m.right), bottom: mm(g.footerBottomMm), minHeight: mm(t.page.footerHeightMm), justifyContent: "flex-end" }}>
            {zone(c, p.doc.footer)}
            {p.footerText ? <Text style={{ fontSize: t.basePt - 2.5, color: t.colors.muted, textAlign: "center", marginTop: 1 }}>{p.footerText}</Text> : null}
          </View>
        ) : null}
      </Page>
    </Document>
  );
}

/** Counts the page objects of a PDF written by react-pdf (page dictionaries are stored uncompressed). */
export function countPdfPages(buf: Buffer): number {
  const m = buf.toString("latin1").match(/\/Type\s*\/Page[^s]/g);
  return m ? m.length : 0;
}

/**
 * Renders a document to PDF. Throws `RenderBlockedError` when the document is invalid, has unfilled values (unless `allowUnresolved`),
 * or uses an unusable image. When the document has a table of contents the layout runs twice so the entries carry real page numbers.
 */
export async function renderPdf(doc: PBDoc, opts: RenderOptions): Promise<PdfResult> {
  return renderPdfNow(doc, opts);
}

async function renderPdfNow(doc: PBDoc, opts: RenderOptions): Promise<PdfResult> {
  const prepared = prepareRender(doc, opts);
  registerFonts([...new Set<FamilyKey>([prepared.tokens.fonts.body, prepared.tokens.fonts.heading])]);
  let pageOf: PageMap | null = null;
  let tocPageNumbers = false;
  if (prepared.toc.length) {
    const rec: PageMap = new Map();
    await renderToBuffer(pdfDocument(new Ctx(prepared, null, rec)));
    if (prepared.toc.every((e) => rec.has(e.id))) { pageOf = rec; tocPageNumbers = true; }
  }
  const buffer = await renderToBuffer(pdfDocument(new Ctx(prepared, pageOf, null)));
  return { buffer, pages: countPdfPages(buffer), warnings: prepared.warnings, flagged: prepared.flagged, watermark: prepared.watermark, tocPageNumbers };
}
