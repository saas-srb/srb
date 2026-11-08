import "server-only";
import { parseDoc, sequentialIds } from "@/lib/products/playbook-ai/doc";
import type { PBDoc } from "@/lib/products/playbook-ai/doc/types";
import { DEFAULT_PAGE } from "@/lib/products/playbook-ai/doc/page";
import { renderPdf } from "@/lib/products/playbook-ai/doc/render/pdf";
import { renderDocx } from "@/lib/products/playbook-ai/doc/render/docx";
import { applyBrandToDoc, brandRenderOptions, brandWatermark, loadBrand, type LoadedBrand } from "@/lib/products/playbook-ai/brand/apply";
import { loadCompanyValues } from "@/lib/products/playbook-ai/brand/company-values";
import type { BrandSettings } from "@/lib/products/playbook-ai/brand/types";
import type { VarValues } from "@/lib/products/playbook-ai/doc/variables";

/**
 * The Brand page's live preview: a short sample document rendered by the REAL PDF renderer with the brand being edited (saved or not).
 * The sample text is only there to show the look; the company name, address and registrations come from the company profile.
 */

const t = (text: string, bold = false) => (bold ? { type: "text", text, marks: [{ type: "bold" }] } : { type: "text", text });

/** The sample document. Variables carry fallbacks so a company with an incomplete profile still gets a preview. */
export function sampleDoc(): PBDoc {
  const r = parseDoc({
    schemaVersion: 1, lang: "en", page: DEFAULT_PAGE, header: [], footer: [],
    body: [
      { type: "heading", level: 1, content: [t("Sample document")] },
      { type: "paragraph", content: [t("This page shows how your documents will look with the current brand: the letterhead above, the footer below, the fonts and the colours. It is sample text only.")] },
      { type: "heading", level: 2, content: [t("Agreement between the parties")] },
      { type: "paragraph", content: [t("This agreement is made by "), { type: "var", key: "company.legal_name", fallback: "your company" }, t(" and the other party named in the schedule.")] },
      { type: "clause", level: 1, numbered: true, content: [t("Definitions", true)] },
      { type: "clause", level: 2, numbered: true, content: [t("Words in bold have the meaning given to them in this agreement.")] },
      { type: "clause", level: 3, numbered: true, content: [t("A reference to a clause is a reference to a clause of this agreement.")] },
      { type: "table", colWidths: [50, 25, 25], headerRow: true, rows: [
        { cells: [{ content: [{ type: "paragraph", content: [t("Item", true)] }] }, { align: "right", content: [{ type: "paragraph", content: [t("Quantity", true)] }] }, { align: "right", content: [{ type: "paragraph", content: [t("Amount", true)] }] }] },
        { cells: [{ content: [{ type: "paragraph", content: [t("Sample item")] }] }, { align: "right", content: [{ type: "paragraph", content: [t("2")] }] }, { align: "right", content: [{ type: "paragraph", content: [t("₹ 25,000")] }] }] },
      ] },
      { type: "callout", variant: "info", content: [{ type: "paragraph", content: [t("A note or reminder looks like this.")] }] },
      { type: "signatureBlock", label: "For the company", partyRole: "company_signatory", showName: true, showDesignation: true, showDate: true },
    ],
  }, { assignIds: true, idFactory: sequentialIds("s") });
  if (!r.ok) throw new Error("the sample document is invalid");
  return r.doc;
}

export interface PreviewResult { pdf: Buffer; pages: number; warnings: string[] }

/** Renders the sample document with a brand (saved or a draft being edited) to PDF. */
export async function renderBrandPreview(settings?: BrandSettings, state: "draft" | "unreviewed" | "final" = "final"): Promise<PreviewResult> {
  const loaded: LoadedBrand = await loadBrand(settings);
  const values: VarValues = await loadCompanyValues();
  const doc = applyBrandToDoc(sampleDoc(), loaded.settings, values, { docNumber: "SAMPLE/2026-27/0001" });
  const out = await renderPdf(doc, {
    meta: { title: "Brand preview", dateIso: new Date().toISOString().slice(0, 10), docNumber: "SAMPLE/2026-27/0001" },
    values,
    brand: brandRenderOptions(loaded),
    watermark: brandWatermark(loaded.settings, state),
  });
  return { pdf: out.buffer, pages: out.pages, warnings: out.warnings };
}

/** The same preview as a Word file (used by tests and by "download a sample"). */
export async function renderBrandPreviewDocx(settings?: BrandSettings): Promise<Buffer> {
  const loaded = await loadBrand(settings);
  const values = await loadCompanyValues();
  const doc = applyBrandToDoc(sampleDoc(), loaded.settings, values, { docNumber: "SAMPLE/2026-27/0001" });
  return (await renderDocx(doc, { meta: { title: "Brand preview", dateIso: new Date().toISOString().slice(0, 10), docNumber: "SAMPLE/2026-27/0001" }, values, brand: brandRenderOptions(loaded) })).buffer;
}
