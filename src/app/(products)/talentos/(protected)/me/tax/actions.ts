"use server";

import { revalidatePath } from "next/cache";
import { getCurrentHrmsUser } from "@/lib/hrms-auth";
import { recordAudit } from "@/lib/products/talentos/audit";
import { saveDeclaration, validateDeclaration } from "@/lib/products/talentos/tax-declarations";
import { previewTax, type TaxPreview } from "@/lib/products/talentos/tax-preview";

export async function saveMyDeclarationAction(fy: string, input: Record<string, unknown>): Promise<{ ok: boolean; error?: string; fieldErrors?: Record<string, string> }> {
  const user = await getCurrentHrmsUser();
  if (!user?.employeeId) return { ok: false, error: "Your login is not linked to an employee record." };
  if (!/^\d{4}-\d{2}$/.test(fy)) return { ok: false, error: "Invalid financial year." };
  const v = validateDeclaration(input);
  if (!v.valid) return { ok: false, fieldErrors: v.errors };
  const r = await saveDeclaration(user.employeeId, fy, v.data, user.id);
  if (!r.ok) return { ok: false, error: r.error };
  await recordAudit({ actorId: user.id, actorEmail: user.email, action: "update", entity: "tax_declaration", entityId: r.declaration._id, entityLabel: fy, summary: v.data.submit ? "submitted" : "draft saved" });
  revalidatePath("/talentos/me/tax");
  revalidatePath("/talentos/payroll/declarations");
  return { ok: true };
}

/** Estimated tax under both regimes for what the employee has typed so far. Saves nothing. */
export async function previewMyTaxAction(input: Record<string, unknown>): Promise<{ ok: true; preview: TaxPreview } | { ok: false; error: string }> {
  const user = await getCurrentHrmsUser();
  if (!user?.employeeId) return { ok: false, error: "Your login is not linked to an employee record." };
  const v = validateDeclaration({ ...input, regime: "new", landlordPan: input.landlordPan || "AAAAA0000A" });
  if (!v.valid) return { ok: false, error: Object.values(v.errors)[0] ?? "Check the figures." };
  return previewTax(user.employeeId, v.data.declared, v.data.previousEmployer);
}
