import "server-only";
import { lpmsCan } from "@/lib/lpms-roles";
import { applyBrandToDoc, brandRenderOptions, brandWatermark, loadBrand } from "@/lib/products/playbook-ai/brand/apply";
import { layoutInputFor } from "@/lib/products/playbook-ai/items-layout";
import { todayIso } from "@/lib/products/playbook-ai/db";
import { renderDocx } from "@/lib/products/playbook-ai/doc/render/docx";
import { renderPdf } from "@/lib/products/playbook-ai/doc/render/pdf";
import type { PBDoc } from "@/lib/products/playbook-ai/doc/types";
import { parseDoc } from "@/lib/products/playbook-ai/doc/validate";
import { getClone } from "./clones";
import type { CloneDoc, CloneResult } from "./clone-types";
import type { LpmsViewer } from "./types";

/**
 * Renders a clone with the Playbook renderers and the company's brand. The values come from the clone's FROZEN snapshot, never from live
 * records, so the same content always renders the same words. A draft clone is rendered leniently (unfilled fields are highlighted and the
 * page carries a DRAFT mark); every later state is rendered strictly, so something that still has blanks cannot be sent or sealed.
 * Rendered bytes are not stored here: sealing (B6) stores the final signed file.
 */
export type CloneFormat = "pdf" | "docx";

export interface RenderedClone {
  buffer: Buffer;
  format: CloneFormat;
  mimeType: string;
  fileName: string;
  warnings: string[];
  pages: number | null;
}

const MIME: Record<CloneFormat, string> = { pdf: "application/pdf", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" };
const safeName = (s: string) => s.replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 80) || "document";

export async function renderCloneDoc(clone: CloneDoc, format: CloneFormat, opts: { doc?: PBDoc; strict?: boolean; images?: Record<string, Uint8Array>; appendix?: PBDoc["body"] } = {}): Promise<RenderedClone> {
  const brand = await loadBrand();
  const values = clone.variableSnapshot.values;
  const strict = opts.strict ?? clone.status !== "clone_draft";
  const doc = applyBrandToDoc(opts.doc ?? clone.pbdoc, brand.settings, values, { docNumber: clone.source.docNumber, layout: layoutInputFor({ kind: clone.kind, title: clone.title, docTypeId: clone.source.docTypeId, docNumber: clone.source.docNumber, meta: clone.meta, version: clone.rev, dateIso: todayIso(clone.createdAt) }) });
  const finalDoc: PBDoc = opts.appendix ? { ...doc, body: [...doc.body, ...opts.appendix] } : doc;
  const common = {
    meta: { title: clone.title, dateIso: todayIso(clone.createdAt), docNumber: clone.source.docNumber ?? undefined, version: String(clone.rev) },
    values,
    lists: clone.variableSnapshot.lists,
    ...(opts.images ? { images: opts.images } : {}),
    brand: brandRenderOptions(brand),
    watermark: brandWatermark(brand.settings, strict ? "final" : "draft"),
    allowUnresolved: !strict,
  };
  if (format === "pdf") {
    const out = await renderPdf(finalDoc, common);
    return { buffer: out.buffer, format, mimeType: MIME.pdf, fileName: `${safeName(clone.title)}.pdf`, warnings: out.warnings, pages: out.pages };
  }
  const out = await renderDocx(finalDoc, common);
  return { buffer: out.buffer, format, mimeType: MIME.docx, fileName: `${safeName(clone.title)}.docx`, warnings: out.warnings, pages: out.estimatedPages };
}

/** Download or preview: needs the DOWNLOAD permission and access to the clone. `unsavedDoc` previews the editor's current content (draft only). */
export async function renderClone(v: LpmsViewer, id: string, format: CloneFormat, opts: { unsavedDoc?: unknown } = {}): Promise<CloneResult<{ file: RenderedClone }>> {
  if (!lpmsCan({ roles: v.roles, permissionOverrides: v.overrides }, "DOWNLOAD")) return { ok: false, error: { code: "forbidden", message: "You may not download documents." } };
  const g = await getClone(v, id);
  if (!g.ok) return g;
  let doc: PBDoc | undefined;
  if (opts.unsavedDoc !== undefined) {
    if (g.clone.status !== "clone_draft") return { ok: false, error: { code: "bad_status", message: "Only a draft can be previewed with unsaved changes." } };
    const parsed = parseDoc(opts.unsavedDoc, { assignIds: true });
    if (!parsed.ok) return { ok: false, error: { code: "invalid", message: `The document is not valid yet: ${parsed.issues[0]?.message ?? "fix the problem shown in the editor"}.` } };
    doc = parsed.doc;
  }
  try {
    return { ok: true, file: await renderCloneDoc(g.clone, format, { doc }) };
  } catch (e) {
    return { ok: false, error: { code: "unavailable", message: e instanceof Error && e.message ? `The ${format.toUpperCase()} could not be made: ${e.message}` : `The ${format.toUpperCase()} could not be made.` } };
  }
}

/** The strict render that must succeed before a clone is marked ready: it fails when fields or placeholders are unfilled. */
export async function checkRenderable(clone: CloneDoc): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    await renderCloneDoc(clone, "pdf", { strict: true });
    return { ok: true };
  } catch (e) {
    return { ok: false, message: e instanceof Error && e.message ? e.message : "The document could not be rendered." };
  }
}
