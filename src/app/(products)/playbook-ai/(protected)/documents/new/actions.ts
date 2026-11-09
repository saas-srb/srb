"use server";

import { revalidatePath } from "next/cache";
import { requireActor } from "@/lib/products/playbook-ai/tpl/actor";
import { createDocumentFromTemplate } from "@/lib/products/playbook-ai/tpl/create";
import { searchRecords, type PickerItem, type PickerKind } from "@/lib/products/playbook-ai/tpl/pickers";
import type { RawInputs } from "@/lib/products/playbook-ai/tpl/inputs";

export type CreateDocumentActionResult =
  | { ok: true; documentId: string; autoFilled: Record<string, string>; pendingAi: string[]; needsAdvocateReview: boolean }
  | { ok: false; message: string; errors?: Record<string, string> };

/** Creates a document from a template with what the person typed. The data layer re-validates every input; nothing here is trusted. */
export async function createFromTemplateAction(input: { typeId?: string; templateId?: string; title?: string; inputs: RawInputs }): Promise<CreateDocumentActionResult> {
  const r = await createDocumentFromTemplate(await requireActor(), { typeId: input.typeId, templateId: input.templateId, title: input.title, inputs: input.inputs });
  if (r.ok) {
    revalidatePath("/playbook-ai/documents");
    return { ok: true, documentId: r.document._id, autoFilled: r.autoFilled, pendingAi: r.pendingAi, needsAdvocateReview: r.needsAdvocateReview };
  }
  const e = r.error;
  return { ok: false, message: e.message, ...(e.code === "inputs" ? { errors: e.errors } : {}) };
}

export async function searchRecordsAction(kind: PickerKind, q: string): Promise<{ ok: true; items: PickerItem[] } | { ok: false; error: string }> {
  return searchRecords(await requireActor(), kind, q);
}
