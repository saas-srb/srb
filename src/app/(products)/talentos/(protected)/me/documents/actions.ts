"use server";

import { revalidatePath } from "next/cache";
import { requirePortalEmployee } from "@/lib/products/talentos/portal-guard";
import { getDocument, deleteDocument } from "@/lib/products/talentos/documents";
import { recordAudit } from "@/lib/products/talentos/audit";

export interface MyDocumentResult {
  ok: boolean;
  error?: string;
}

/** An employee may delete only a document they uploaded themselves. */
export async function deleteMyDocumentAction(id: string): Promise<MyDocumentResult> {
  const { employeeId, userId, email } = await requirePortalEmployee();
  const doc = await getDocument(id);
  if (!doc || doc.employeeId !== employeeId) return { ok: false, error: "Document not found." };
  if (doc.uploadedByRole !== "employee") return { ok: false, error: "This document was added by HR and can only be removed by HR." };

  await deleteDocument(id, userId);
  await recordAudit({ actorId: userId, actorEmail: email, action: "delete", entity: "employee_document", entityId: id, entityLabel: doc.title });
  revalidatePath("/talentos/me/documents");
  return { ok: true };
}
