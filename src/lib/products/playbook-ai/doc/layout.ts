/**
 * Industry-standard layout wrapper (P5). Pure and client-safe: it only builds PBDoc blocks, so the PDF and the DOCX renderers draw exactly
 * the same cover block, document-control table, contents, revision history and approval block without knowing about it.
 *
 *  - SOP:      title block, DOCUMENT CONTROL table, table of contents, the content, revision history, approval block.
 *  - KPI:      title block, DOCUMENT CONTROL table, the content, revision history, approval block.
 *  - Document: a title block when the document is free-form (no catalogue type); catalogue documents carry their own layout and are
 *              left as written.
 * Nothing is stored: the wrapper runs when a copy is rendered, so the editor keeps showing only the content the author owns.
 */

import type { Align, ContentBlock, InlineNode, TableBlock } from "@/lib/products/playbook-ai/doc/types";
import { ITEM_KIND_INFO, type ItemKind } from "@/lib/products/playbook-ai/items-types";
import type { IdentityBlockInput } from "@/lib/products/playbook-ai/brand/identity";

/** The file id under which the brand logo is handed to the renderers (the identity block's image block refers to it). */
export const BRAND_LOGO_ID = "brand-logo";

export interface LayoutInput {
  kind: ItemKind;
  title: string;
  /** Catalogue type id for documents made from a template; such documents are not wrapped. */
  docTypeId?: string | null;
  docNumber?: string | null;
  version?: string | null;
  /** Display date of the copy (already formatted, e.g. "09 Nov 2026"). */
  dateText: string;
  owner?: string | null;
  department?: string | null;
  designation?: string | null;
  reviewPeriod?: string | null;
  preparedBy?: string | null;
  approvedBy?: string | null;
  classification?: string | null;
  changeSummary?: string | null;
  /** The company details block printed once above the title on page 1 (built by `identityBlockInput`). */
  identity?: IdentityBlockInput | null;
}

const t = (text: string, bold = false): InlineNode => (bold ? { type: "text", text, marks: [{ type: "bold" }] } : { type: "text", text });
let seq = 0;
const id = (p: string) => `lay-${p}-${++seq}`;
const para = (content: InlineNode[], align?: Align): ContentBlock => ({ id: id("p"), type: "paragraph", content, ...(align ? { align } : {}) });

function cell(text: string, bold: boolean, align?: Align) {
  return { id: id("c"), content: [{ id: id("cp"), type: "paragraph" as const, content: [t(text, bold)] }], ...(align ? { align } : {}) };
}

function table(widths: number[], header: string[] | null, rows: string[][]): TableBlock {
  const mk = (r: string[], bold: boolean) => ({ id: id("r"), cells: r.map((x, i) => cell(x, bold || (!header && i % 2 === 0 && widths.length === 4))) });
  return { id: id("t"), type: "table", colWidths: widths, headerRow: !!header, rows: [...(header ? [mk(header, true)] : []), ...rows.map((r) => mk(r, false))] };
}

const spacer = (): ContentBlock => ({ id: id("sp"), type: "spacer", heightMm: 4 });
const orDash = (v: string | null | undefined, fallback: string): string => (v && v.trim() ? v.trim() : fallback);

/** The blocks printed before the content. */
function front(i: LayoutInput): ContentBlock[] {
  const info = ITEM_KIND_INFO[i.kind];
  const banner: TableBlock = {
    id: id("t"), type: "table", colWidths: [100], headerRow: false,
    rows: [{ id: id("r"), cells: [{ id: id("c"), align: "center", content: [
      { id: id("cp"), type: "paragraph", align: "center", content: [t(info.docLabel.toUpperCase(), true)] },
      { id: id("cp"), type: "paragraph", align: "center", content: [t(i.title, true)] },
    ] }] }],
  };
  if (i.kind === "document") return [banner];
  const control = table([22, 28, 22, 28], null, [
    ["Document number", orDash(i.docNumber, "Assigned on issue"), "Version", orDash(i.version, "1")],
    ["Effective date", i.dateText, "Classification", orDash(i.classification, "Internal")],
    ["Owner", orDash(i.owner, "Department head"), "Department", orDash(i.department, "All departments")],
    ["Prepared by", orDash(i.preparedBy, "Author"), "Approved by", orDash(i.approvedBy, "Pending approval")],
    ...(i.kind === "kpi" ? [["Designation", orDash(i.designation, "As per role"), "Review period", orDash(i.reviewPeriod, "Annual")]] : []),
  ]);
  const out: ContentBlock[] = [banner, spacer(), para([t("DOCUMENT CONTROL", true)]), control];
  if (i.kind === "sop") out.push(spacer(), { id: id("toc"), type: "toc", levels: 2 }, { id: id("pb"), type: "pageBreak" });
  else out.push(spacer());
  return out;
}

/** The blocks printed after the content. */
function back(i: LayoutInput): ContentBlock[] {
  if (i.kind === "document") return [];
  return [
    { id: id("h"), type: "heading", level: 2, content: [t("Revision history")] },
    table([14, 20, 26, 40], ["Version", "Date", "Author", "Summary of change"], [[orDash(i.version, "1"), i.dateText, orDash(i.preparedBy, "Author"), orDash(i.changeSummary, "Current issue")]]),
    { id: id("h"), type: "heading", level: 2, content: [t("Approval")] },
    { id: id("s"), type: "signatureBlock", label: "Prepared by", partyRole: "approver", showName: true, showDesignation: true, showDate: true },
    { id: id("s"), type: "signatureBlock", label: "Approved by", partyRole: "approver", showName: true, showDesignation: true, showDate: true },
  ];
}

/** The company details block: a two-column letterhead (brand side and details side), a thin rule and a gap. Nothing is printed for a field the company has not filled in. */
export function identityBlocks(x: IdentityBlockInput | null | undefined): ContentBlock[] {
  if (!x) return [];
  return [
    { id: id("letterhead"), type: "letterhead", ...(x.logo ? { logoFileId: BRAND_LOGO_ID, logoWidthMm: x.logo.widthMm } : {}), name: x.name, address: x.address, details: x.details, align: x.align },
    { id: id("idr"), type: "divider" },
    { id: id("ids"), type: "spacer", heightMm: 3 },
  ];
}

/** Whether a document of this kind and type gets the wrapper. */
export const wantsLayout = (i: Pick<LayoutInput, "kind" | "docTypeId">): boolean => i.kind !== "document" || !i.docTypeId;

/** Returns the body wrapped in the layout. The content's own table-of-contents block (if any) is dropped for SOPs, which get the standard one. */
export function wrapBody(body: ContentBlock[], i: LayoutInput): ContentBlock[] {
  const identity = identityBlocks(i.identity);
  if (!wantsLayout(i)) return [...identity, ...body];
  const content = i.kind === "sop" ? body.filter((b) => b.type !== "toc") : body;
  return [...identity, ...front(i), ...content, ...back(i)];
}
