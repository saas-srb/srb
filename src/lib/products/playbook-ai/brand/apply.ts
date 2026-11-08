import "server-only";
import type { ContentBlock, InlineNode, PBDoc, ZoneBlock } from "@/lib/products/playbook-ai/doc/types";
import { validatePage } from "@/lib/products/playbook-ai/doc/page";
import type { VarValues } from "@/lib/products/playbook-ai/doc/variables";
import type { RenderBrand } from "@/lib/products/playbook-ai/doc/render/tokens";
import { getBrandAsset } from "@/lib/products/playbook-ai/brand/assets";
import { getBrand } from "@/lib/products/playbook-ai/brand/store";
import type { BrandLine, BrandSettings } from "@/lib/products/playbook-ai/brand/types";

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
    letterhead: s.letterhead,
    ...(b.logo ? { logo: { bytes: b.logo.bytes, align: s.logo.position, widthMm: s.logo.widthMm } } : {}),
    ...(footerText ? { footerText } : {}),
  };
}

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
}

/** Merges the letterhead and footer lines into a copy of the document and applies the company's margins. */
export function applyBrandToDoc(doc: PBDoc, brand: BrandSettings, values: VarValues, opts: ApplyOptions = {}): PBDoc {
  const header: ZoneBlock[] = [];
  if (brand.letterhead !== "none") {
    brand.headerLines.forEach((l, i) => {
      const t = lineText(l, values);
      if (t) header.push({ id: `brand-h${i + 1}`, type: "paragraph", content: [text(t, l.bold)] });
    });
    if (header.length) header.push({ id: "brand-hrule", type: "divider" });
  }

  const footer: ZoneBlock[] = [];
  const lines = brand.footerLines.map((l) => lineText(l, values)).filter((x): x is string => !!x);
  const numberContent: InlineNode[] = [];
  if (brand.footer.showDocNumber && opts.docNumber) numberContent.push({ type: "field", field: "docNumber" });
  if (brand.footer.showPageNumbers) {
    if (numberContent.length) numberContent.push({ type: "text", text: "  |  " });
    numberContent.push({ type: "text", text: "Page " }, { type: "field", field: "pageNumber" }, { type: "text", text: " of " }, { type: "field", field: "totalPages" });
  }
  if (lines.length || numberContent.length) footer.push({ id: "brand-frule", type: "divider" });
  lines.forEach((t, i) => footer.push({ id: `brand-f${i + 1}`, type: "paragraph", align: brand.footer.align, content: [text(t, false)] }));
  if (numberContent.length) footer.push({ id: "brand-fnum", type: "paragraph", align: brand.footer.align, content: numberContent });

  // The company's margins and zone heights apply to every export; size and orientation stay the document's own.
  const page = validatePage({ ...doc.page, margins: brand.page.margins, headerHeightMm: brand.page.headerHeightMm, footerHeightMm: brand.page.footerHeightMm });
  const taken = new Set<string>();
  const unique = <T extends { id: string }>(blocks: T[]): T[] => blocks.map((b) => { let id = b.id; while (taken.has(id)) id = `${id}x`; taken.add(id); return id === b.id ? b : { ...b, id }; });
  const own = new Set<string>();
  const collect = (bs: readonly { id: string }[]) => bs.forEach((b) => own.add(b.id));
  collect(doc.body); collect(doc.header); collect(doc.footer);
  own.forEach((id) => taken.add(id));
  return { ...doc, page: page.ok ? page.value : doc.page, header: [...unique(header), ...doc.header], footer: [...doc.footer, ...unique(footer)], body: doc.body as ContentBlock[] };
}

/** The watermark words for a document's state: draft, unreviewed, or none (an issued, reviewed document). */
export function brandWatermark(brand: BrandSettings, state: "draft" | "unreviewed" | "final"): string | null {
  return state === "draft" ? brand.watermarks.draft : state === "unreviewed" ? brand.watermarks.unreviewed : null;
}
