import "server-only";
import type { ContentBlock, InlineNode, PBDoc, ZoneBlock } from "@/lib/products/playbook-ai/doc/types";
import { validatePage } from "@/lib/products/playbook-ai/doc/page";
import type { VarValues } from "@/lib/products/playbook-ai/doc/variables";
import type { RenderBrand } from "@/lib/products/playbook-ai/doc/render/tokens";
import { getBrandAsset } from "@/lib/products/playbook-ai/brand/assets";
import { getBrand } from "@/lib/products/playbook-ai/brand/store";
import { wantsLayout, wrapBody, type LayoutInput } from "@/lib/products/playbook-ai/doc/layout";
import type { BrandLine, BrandSettings } from "@/lib/products/playbook-ai/brand/types";
import { identityBlockInput } from "@/lib/products/playbook-ai/brand/identity";

/**
 * Turns a saved brand into what the two renderers consume. Server-only.
 *   - `brandRenderOptions` : colours, font pair, logo bytes and letterhead scope (the `brand` render option);
 *   - `applyBrandToDoc`    : the letterhead lines and footer, built from the company values, merged into the document's own header and
 *                            footer, plus the company's margins and zone heights.
 * Lines whose value is empty are left out (a company without a CIN simply prints no CIN line), so the letterhead can never block an export.
 */

export interface LoadedBrand {
  settings: BrandSettings;
  logo: { bytes: Buffer } | null;
}

export async function loadBrand(settings?: BrandSettings): Promise<LoadedBrand> {
  const s = settings ?? (await getBrand());
  const logo = s.logo.assetId ? await getBrandAsset(s.logo.assetId, ["logo"]) : null;
  return { settings: s, logo: logo ? { bytes: logo.bytes } : null };
}

/** The `brand` option of `renderPdf` / `renderDocx`. */
export function brandRenderOptions(b: LoadedBrand, footerText?: string): RenderBrand {
  const s = b.settings;
  return {
    colors: { primary: s.colors.primary, accent: s.colors.secondary },
    fontPair: s.fontPair,
    // There is no running header any more: the company details block (with the logo) is printed once, at the top of page 1.
    letterhead: "none",
    ...(identityOn(s) ? { identity: true } : {}),
    ...(b.logo ? { logo: { bytes: b.logo.bytes, align: s.logo.position, widthMm: s.logo.widthMm } } : {}),
    ...(footerText ? { footerText } : {}),
  };
}

/** The details block for the editor's first sheet (the same input the export builds), or null when it is switched off. */
export function identityFor(brand: BrandSettings, values: VarValues, orientation: "portrait" | "landscape" = "portrait") {
  if (!identityOn(brand)) return null;
  return identityBlockInput(values, brand.identity, { align: brand.logo.position, hasLogo: !!brand.logo.assetId, logoWidthMm: brand.logo.widthMm });
}

/** The company details block is printed on page 1 (and the running header starts on page 2). */
export const identityOn = (s: BrandSettings): boolean => s.identity.show;

const text = (t: string, bold: boolean): InlineNode => (bold ? { type: "text", text: t, marks: [{ type: "bold" }] } : { type: "text", text: t });

function lineText(l: BrandLine, values: VarValues): string | null {
  if (l.key === null) return l.text;
  const raw = values[l.key];
  if (raw === undefined || raw === null || String(raw).trim() === "") return null;
  return `${l.text}${String(raw).trim()}`;
}

export interface ApplyOptions {
  /** The document number to print in the footer, when the document has one (drafts have none). */
  docNumber?: string | null;
  /** The kind layout (cover block, document control, contents, revision history, approval): see `doc/layout.ts`. */
  layout?: LayoutInput;
}

/**
 * Puts the company letterhead and footer into a copy of the document and applies the company's margins. The brand is the single owner of the
 * running header and footer: when it produces any, they REPLACE the document's own (a template's built-in company lines and page numbers),
 * so each page has one header and one footer. A document keeps its own only when the brand produces none.
 */
export function applyBrandToDoc(doc: PBDoc, brand: BrandSettings, values: VarValues, opts: ApplyOptions = {}): PBDoc {
  // No running header on any page: the company details block on page 1 replaces the letterhead.
  const header: ZoneBlock[] = [];
  const idOn = identityOn(brand);

  const footer: ZoneBlock[] = [];
  const lines = brand.footerLines.filter((l) => l.key !== "company.email").map((l) => lineText(l, values)).filter((x): x is string => !!x);
  const numberContent: InlineNode[] = [];
  if (opts.layout && wantsLayout(opts.layout)) numberContent.push({ type: "field", field: "title" });
  if (brand.footer.showDocNumber && opts.docNumber) numberContent.push(...(numberContent.length ? [{ type: "text" as const, text: "  |  " }] : []), { type: "field", field: "docNumber" });
  if (opts.layout && wantsLayout(opts.layout) && opts.layout.kind !== "document") numberContent.push(...(numberContent.length ? [{ type: "text" as const, text: "  |  Version " }] : []), { type: "field", field: "version" });
  if (brand.footer.confidential) { if (numberContent.length) numberContent.push({ type: "text", text: "  |  " }); numberContent.push({ type: "text", text: "Confidential" }); }
  if (brand.footer.showPageNumbers) {
    if (numberContent.length) numberContent.push({ type: "text", text: "  |  " });
    const fmt = brand.footer.pageFormat ?? "x_of_y";
    if (fmt === "x_of_y") numberContent.push({ type: "text", text: "Page " }, { type: "field", field: "pageNumber" }, { type: "text", text: " of " }, { type: "field", field: "totalPages" });
    else if (fmt === "x_slash_y") numberContent.push({ type: "field", field: "pageNumber" }, { type: "text", text: " / " }, { type: "field", field: "totalPages" });
    else numberContent.push({ type: "field", field: "pageNumber" });
  }
  if (lines.length || numberContent.length) footer.push({ id: "brand-frule", type: "divider" });
  lines.forEach((t, i) => footer.push({ id: `brand-f${i + 1}`, type: "paragraph", align: brand.footer.align, content: [text(t, false)] }));
  if (numberContent.length) footer.push({ id: "brand-fnum", type: "paragraph", align: brand.footer.align, content: numberContent });

  // The company's margins and zone heights apply to every export; size and orientation stay the document's own.
  // With the details block the zones are sized so the header sits 12.5 mm from the top edge and the footer 12.5 mm from the bottom edge (like Word and Docs).
  // Without a header zone the body starts at the top margin (at most 25 mm) on every page, with no blank band above it.
  const margins = { ...brand.page.margins, top: Math.min(brand.page.margins.top, 15), bottom: Math.min(brand.page.margins.bottom, 20) };
  // The footer is one small line ("Page x of y") that ends about 9 mm above the bottom edge; the body ends 3 mm above it.
  const footerH = Math.max(Math.min(margins.bottom - 12, 8), 5);
  const page = validatePage({ ...doc.page, margins, headerHeightMm: 0, footerHeightMm: footerH });
  const taken = new Set<string>();
  const unique = <T extends { id: string }>(blocks: T[]): T[] => blocks.map((b) => { let id = b.id; while (taken.has(id)) id = `${id}x`; taken.add(id); return id === b.id ? b : { ...b, id }; });
  const own = new Set<string>();
  const collect = (bs: readonly { id: string }[]) => bs.forEach((b) => own.add(b.id));
  collect(doc.body);
  own.forEach((id) => taken.add(id));
  const identity = idOn ? identityBlockInput(values, brand.identity, { align: brand.logo.position, hasLogo: !!brand.logo.assetId, logoWidthMm: brand.logo.widthMm }) : null;
  // Callers without a kind layout still get the details block (a free-standing "layout" that wraps nothing else).
  const layoutIn: LayoutInput | undefined = opts.layout ? { ...opts.layout, identity } : identity ? { kind: "document", title: "", docTypeId: "identity-only", dateText: "", identity } : undefined;
  return { ...doc, page: page.ok ? page.value : doc.page, header: [], footer: footer.length ? unique(footer) : doc.footer, body: layoutIn ? wrapBody(doc.body as ContentBlock[], layoutIn) : (doc.body as ContentBlock[]) };
}

/** The watermark words for a document's state: draft, unreviewed, or none (an issued, reviewed document). */
export function brandWatermark(brand: BrandSettings, state: "draft" | "unreviewed" | "final"): string | null {
  return state === "draft" ? brand.watermarks.draft : state === "unreviewed" ? brand.watermarks.unreviewed : null;
}
