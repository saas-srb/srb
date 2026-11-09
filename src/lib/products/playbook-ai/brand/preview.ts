import "server-only";
import { brandWatermark } from "@/lib/products/playbook-ai/brand/apply";
import type { BrandSettings } from "@/lib/products/playbook-ai/brand/types";
import { DEFAULT_BRAND } from "@/lib/products/playbook-ai/brand/types";
import { BRAND_PREVIEW_ITEMS, DEFAULT_PREVIEW_ITEM } from "@/lib/products/playbook-ai/brand/preview-items";
import { renderLibraryDocument } from "@/lib/products/playbook-ai/library-render";
import { DEFAULT_NUMBER_PATTERN, DEFAULT_NUMBER_PREFIX, formatDocNumber } from "@/lib/products/playbook-ai/numbering-pattern";
import { getPbSettings, numberingFor } from "@/lib/products/playbook-ai/pb-settings";

/**
 * The Brand page's live preview: a REAL library document (a complete agreement, letter, policy, SOP or KPI sheet) rendered by the same engine
 * as every export, with the brand being edited (saved or not), the company's own data, today's date and a reference number built from the
 * company's numbering settings. Inputs the company has not filled are shown as highlighted blanks, never as made-up values. No text in this
 * file or in the preview is invented: all content comes from the library templates.
 */
export interface PreviewResult { pdf: Buffer; pages: number; warnings: string[] }

/** Renders a library document with a brand (saved or a draft being edited) to PDF. `state` chooses the watermark words, or none. */
export async function renderBrandPreview(settings?: BrandSettings, state: "draft" | "unreviewed" | "final" = "final", itemId: string = DEFAULT_PREVIEW_ITEM): Promise<PreviewResult> {
  const item = BRAND_PREVIEW_ITEMS.find((x) => x.id === itemId) ?? BRAND_PREVIEW_ITEMS[0];
  const brand = settings ?? DEFAULT_BRAND;
  let docNumber: string | undefined;
  try {
    const rule = numberingFor(await getPbSettings(), item.kind === "document" ? item.id : null);
    docNumber = formatDocNumber(rule.pattern ?? DEFAULT_NUMBER_PATTERN, rule.prefix ?? DEFAULT_NUMBER_PREFIX, 1, new Date());
  } catch { docNumber = undefined; }
  const r = await renderLibraryDocument(item.kind, item.id, "pdf", { brandSettings: brand, docNumber, watermark: brandWatermark(brand, state) });
  if (!r.ok) throw new Error(r.message);
  return { pdf: r.bytes, pages: r.pages ?? 1, warnings: [] };
}

/** The same preview as a Word file. */
export async function renderBrandPreviewDocx(settings?: BrandSettings, itemId: string = DEFAULT_PREVIEW_ITEM): Promise<Buffer> {
  const item = BRAND_PREVIEW_ITEMS.find((x) => x.id === itemId) ?? BRAND_PREVIEW_ITEMS[0];
  const r = await renderLibraryDocument(item.kind, item.id, "docx", { brandSettings: settings ?? DEFAULT_BRAND });
  if (!r.ok) throw new Error(r.message);
  return r.bytes;
}
