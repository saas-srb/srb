"use server";

import { revalidatePath } from "next/cache";
import { getCurrentHrmsUser } from "@/lib/hrms-auth";
import { hrCan } from "@/lib/talentos-access";
import { hrReach, reaches } from "@/lib/products/talentos/scope";
import { getDocument, updateDocumentMeta, deleteDocument } from "@/lib/products/talentos/documents";
import { validateDocumentMeta } from "@/lib/products/talentos/validation-payroll";
import { recordAudit } from "@/lib/products/talentos/audit";

export interface DocumentActionResult {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
}

async function requireDocs() {
  const user = await getCurrentHrmsUser();
  if (!user) throw new Error("Unauthorized");
  if (!hrCan(user, "documents.manage")) throw new Error("Forbidden");
  return user;
}

export async function updateDocumentAction(id: string, input: Record<string, unknown>): Promise<DocumentActionResult> {
  const user = await requireDocs();
  const doc = await getDocument(id);
  if (!doc || !reaches(await hrReach(user, "employees"), doc.employeeId)) return { ok: false, error: "Document not found." };

  const v = validateDocumentMeta(input, "staff");
  if (!v.valid) return { ok: false, fieldErrors: v.errors };

  await updateDocumentMeta(id, v.data, user.id);
  await recordAudit({ actorId: user.id, actorEmail: user.email, action: "update", entity: "employee_document", entityId: id, entityLabel: v.data.title });
  revalidatePath(`/talentos/employees/${doc.employeeId}`);
  return { ok: true };
}

export async function deleteDocumentAction(id: string): Promise<DocumentActionResult> {
  const user = await requireDocs();
  const doc = await getDocument(id);
  if (!doc || !reaches(await hrReach(user, "employees"), doc.employeeId)) return { ok: false, error: "Document not found." };

  await deleteDocument(id, user.id);
  await recordAudit({ actorId: user.id, actorEmail: user.email, action: "delete", entity: "employee_document", entityId: id, entityLabel: doc.title });
  revalidatePath(`/talentos/employees/${doc.employeeId}`);
  return { ok: true };
}
