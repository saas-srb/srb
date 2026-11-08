"use server";

import { requireViewer } from "@/lib/products/playbook-ai/viewer";
import type { PbActor } from "@/lib/products/playbook-ai/documents-types";
import { getDocument, saveDraft } from "@/lib/products/playbook-ai/documents";
import { loadVariableValues } from "@/lib/products/playbook-ai/variables-adapters";
import { loadBrand, applyBrandToDoc, brandRenderOptions, brandWatermark } from "@/lib/products/playbook-ai/brand/apply";
import { renderPdf } from "@/lib/products/playbook-ai/doc/render/pdf";
import { todayIso } from "@/lib/products/playbook-ai/db";
import type { PBDoc } from "@/lib/products/playbook-ai/doc/types";
import { parseDoc } from "@/lib/products/playbook-ai/doc/validate";

/**
 * Server actions behind the Playbook document editor. Each resolves the signed-in person from the session cookie (never from arguments)
 * and the data layer re-checks every permission. Failures come back as values the editor can show; a stale save comes back as
 * `code: "CONFLICT"` which the editor turns into its "someone else changed this document" dialog. Nothing is ever overwritten.
 */

export type EditorLoad =
  | { ok: true; id: string; doc: PBDoc; version: string }
  | { ok: false; code: string; message: string };

export type EditorSave =
  | { ok: true; version: string; savedAt: string }
  | { ok: false; code: "CONFLICT" | "INVALID" | "FORBIDDEN" | "LOCKED" | "OTHER"; message: string };

export type EditorPreview = { ok: true; pdfBase64: string; pages: number; warnings: string[] } | { ok: false; message: string };

async function actor(): Promise<PbActor> {
  const v = await requireViewer();
  return { id: v.userId, email: v.email, name: v.name, roles: v.roles, permissionOverrides: v.overrides };
}

export async function loadEditorDocument(id: string): Promise<EditorLoad> {
  const a = await actor();
  const r = await getDocument(a, String(id));
  if (!r.ok) return { ok: false, code: r.error.code, message: r.error.message };
  return { ok: true, id: r.document._id, doc: r.document.pbdoc, version: String(r.document.rev) };
}

export async function saveEditorDocument(input: { id: string; doc: unknown; baseVersion: string }): Promise<EditorSave> {
  const a = await actor();
  const rev = Number(input.baseVersion);
  if (!Number.isInteger(rev) || rev < 1) return { ok: false, code: "INVALID", message: "The document version is not valid. Reload the page." };
  const r = await saveDraft(a, { id: String(input.id), rev, pbdoc: input.doc });
  if (r.ok) return { ok: true, version: String(r.rev), savedAt: r.savedAt };
  const e = r.error;
  switch (e.code) {
    case "conflict": return { ok: false, code: "CONFLICT", message: e.message };
    case "invalid": return { ok: false, code: "INVALID", message: e.issues[0] ? `${e.message} ${e.issues[0].message}` : e.message };
    case "forbidden": return { ok: false, code: "FORBIDDEN", message: e.message };
    case "locked": return { ok: false, code: "LOCKED", message: e.message };
    default: return { ok: false, code: "OTHER", message: e.message };
  }
}

/** The real PDF of the document as it is in the editor right now (unsaved edits included), with the company letterhead, as a draft. */
export async function renderEditorPreview(input: { id: string; doc: unknown }): Promise<EditorPreview> {
  const a = await actor();
  const rec = await getDocument(a, String(input.id));
  if (!rec.ok) return { ok: false, message: rec.error.message };
  const parsed = parseDoc(input.doc, { assignIds: true });
  if (!parsed.ok) return { ok: false, message: `The document is not valid yet: ${parsed.issues[0]?.message ?? "fix the problem shown in the editor"}.` };
  const d = rec.document;
  try {
    const loaded = await loadVariableValues(a, { doc: { title: d.title, docNumber: d.docNumber, version: d.versionSeq + 1, status: d.status, issuedAt: d.issuedAt, authorId: d.createdBy }, links: d.links, inputs: d.inputs });
    const brand = await loadBrand();
    const doc = applyBrandToDoc(parsed.doc, brand.settings, loaded.values, { docNumber: d.docNumber ?? undefined });
    const out = await renderPdf(doc, {
      meta: { title: d.title, dateIso: todayIso(), docNumber: d.docNumber ?? undefined },
      values: loaded.values,
      lists: d.lists,
      brand: brandRenderOptions(brand),
      watermark: brandWatermark(brand.settings, "draft"),
      allowUnresolved: true,
    });
    return { ok: true, pdfBase64: out.buffer.toString("base64"), pages: out.pages, warnings: out.warnings };
  } catch (e) {
    return { ok: false, message: e instanceof Error && e.message ? `The PDF could not be made: ${e.message}` : "The PDF could not be made." };
  }
}
