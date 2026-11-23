"use server";

import { revalidatePath } from "next/cache";
import { getCurrentHrmsUser } from "@/lib/hrms-auth";
import { hrCan } from "@/lib/talentos-access";
import { getDocument, deleteDocument } from "@/lib/products/talentos/documents";
import { updateOwnContact } from "@/lib/products/talentos/self-service";
import { validateOwnContact } from "@/lib/products/talentos/validation-payroll";
import { recordAudit } from "@/lib/products/talentos/audit";

export interface ProfileActionResult {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
}

export async function updateMyContactAction(input: Record<string, unknown>): Promise<ProfileActionResult> {
  const user = await getCurrentHrmsUser();
  if (!user || user.mustChangePassword || !user.employeeId || !hrCan(user, "profile.edit")) throw new Error("Forbidden");
  const { employeeId, id: userId, email } = { employeeId: user.employeeId, id: user.id, email: user.email };
  const v = validateOwnContact(input);
  if (!v.valid) return { ok: false, fieldErrors: v.errors };

  const ok = await updateOwnContact(employeeId, v.data);
  if (!ok) return { ok: false, error: "Could not save your details." };

  await recordAudit({
    actorId: userId,
    actorEmail: email,
    action: "update",
    entity: "employee",
    entityId: employeeId,
    summary: "Employee updated own contact details",
  });
  revalidatePath("/talentos/profile");
  revalidatePath(`/talentos/employees/${employeeId}`);
  return { ok: true };
}

export interface MyDocumentResult {
  ok: boolean;
  error?: string;
}

/** An employee may delete only a document they uploaded themselves. */
export async function deleteMyDocumentAction(id: string): Promise<MyDocumentResult> {
  const user = await getCurrentHrmsUser();
  if (!user || user.mustChangePassword || !user.employeeId || !hrCan(user, "documents.upload")) throw new Error("Forbidden");
  const doc = await getDocument(id);
  if (!doc || doc.employeeId !== user.employeeId) return { ok: false, error: "Document not found." };
  if (doc.uploadedByRole !== "employee") return { ok: false, error: "This document was added by HR and can only be removed by HR." };

  await deleteDocument(id, user.id);
  await recordAudit({ actorId: user.id, actorEmail: user.email, action: "delete", entity: "employee_document", entityId: id, entityLabel: doc.title });
  revalidatePath("/talentos/profile");
  return { ok: true };
}
