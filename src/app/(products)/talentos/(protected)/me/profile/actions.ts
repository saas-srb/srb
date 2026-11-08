"use server";

import { revalidatePath } from "next/cache";
import { requirePortalEmployee } from "@/lib/products/talentos/portal-guard";
import { updateOwnContact } from "@/lib/products/talentos/self-service";
import { validateOwnContact } from "@/lib/products/talentos/validation-payroll";
import { recordAudit } from "@/lib/products/talentos/audit";

export interface ProfileActionResult {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
}

export async function updateMyContactAction(input: Record<string, unknown>): Promise<ProfileActionResult> {
  const { employeeId, userId, email } = await requirePortalEmployee();
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
  revalidatePath("/talentos/me/profile");
  revalidatePath(`/talentos/employees/${employeeId}`);
  return { ok: true };
}
