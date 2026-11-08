"use server";

import { revalidatePath } from "next/cache";
import { getCurrentHrmsUser } from "@/lib/hrms-auth";
import { canManagePayrollConfig, canManageSettings } from "@/lib/hrms-roles";
import { updateOrgSettings } from "@/lib/products/talentos/settings";
import { upsertLeaveType, deleteLeaveType } from "@/lib/products/talentos/leave";
import { updatePayrollConfig } from "@/lib/products/talentos/payroll-config";
import { updateCompanyDetails } from "@/lib/products/talentos/company";
import { validateOrgSettings, validateLeaveType, validateCompanyDetails } from "@/lib/products/talentos/validation-ops";
import { validatePayrollConfig } from "@/lib/products/talentos/validation-payroll";
import { recordAudit } from "@/lib/products/talentos/audit";

export interface SettingsActionResult {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
}

async function requireSettings() {
  const user = await getCurrentHrmsUser();
  if (!user) throw new Error("Unauthorized");
  if (!canManageSettings(user)) throw new Error("Forbidden");
  return user;
}

/** The statutory payroll rates (PF, ESI, professional tax, TDS) are their own permission, not part of "settings". */
async function requirePayrollConfig() {
  const user = await getCurrentHrmsUser();
  if (!user) throw new Error("Unauthorized");
  if (!canManagePayrollConfig(user)) throw new Error("Forbidden");
  return user;
}

export async function saveOrgSettingsAction(input: Record<string, unknown>): Promise<SettingsActionResult> {
  const user = await requireSettings();
  const v = validateOrgSettings(input);
  if (!v.valid) return { ok: false, fieldErrors: v.errors };

  await updateOrgSettings(v.data, user.id);
  await recordAudit({
    actorId: user.id,
    actorEmail: user.email,
    action: "update",
    entity: "org_settings",
    entityId: "org",
    entityLabel: "Work schedule",
    summary: `shift ${v.data.shiftStart}–${v.data.shiftEnd}, grace ${v.data.graceMinutes}m`,
  });

  revalidatePath("/talentos/settings");
  revalidatePath("/talentos/attendance");
  return { ok: true };
}

export async function saveLeaveTypeAction(input: Record<string, unknown>, id?: string): Promise<SettingsActionResult> {
  const user = await requireSettings();
  const v = validateLeaveType(input);
  if (!v.valid) return { ok: false, fieldErrors: v.errors };

  const result = await upsertLeaveType(v.data, user.id, id);
  if (!result.ok) return { ok: false, error: result.reason };

  await recordAudit({
    actorId: user.id,
    actorEmail: user.email,
    action: id ? "update" : "create",
    entity: "leave_type",
    entityId: id ?? v.data.code,
    entityLabel: v.data.label,
  });

  revalidatePath("/talentos/settings");
  revalidatePath("/talentos/leave");
  return { ok: true };
}

export async function deleteLeaveTypeAction(id: string): Promise<SettingsActionResult> {
  const user = await requireSettings();
  const result = await deleteLeaveType(id, user.id);
  if (!result.ok) return { ok: false, error: result.reason };

  await recordAudit({ actorId: user.id, actorEmail: user.email, action: "delete", entity: "leave_type", entityId: id });
  revalidatePath("/talentos/settings");
  revalidatePath("/talentos/leave");
  return { ok: true };
}

export async function saveCompanyDetailsAction(input: Record<string, unknown>): Promise<SettingsActionResult> {
  const user = await requireSettings();
  const v = validateCompanyDetails(input);
  if (!v.valid) return { ok: false, fieldErrors: v.errors };

  await updateCompanyDetails(v.data, user.id);
  await recordAudit({
    actorId: user.id,
    actorEmail: user.email,
    action: "update",
    entity: "company",
    entityId: "org",
    entityLabel: "Company details",
    summary: `${v.data.name}${v.data.pan ? ` · PAN ${v.data.pan}` : ""}`,
  });
  revalidatePath("/talentos/settings");
  return { ok: true };
}

export async function savePayrollConfigAction(input: Record<string, unknown>): Promise<SettingsActionResult> {
  const user = await requirePayrollConfig();
  const v = validatePayrollConfig(input);
  if (!v.valid) return { ok: false, fieldErrors: v.errors };

  await updatePayrollConfig(v.data, user.id);
  await recordAudit({
    actorId: user.id,
    actorEmail: user.email,
    action: "update",
    entity: "payroll_config",
    entityId: "org",
    entityLabel: "Payroll policy",
    summary: `days: ${v.data.paidDaysBasis}${v.data.paidDaysBasis === "fixed" ? ` ${v.data.fixedDays}` : ""}, sandwich ${v.data.sandwichRule}, tax ${v.data.tdsEnabled ? v.data.defaultTaxRegime : "off"}, cap ${v.data.deductionCapPercent}%`,
  });
  revalidatePath("/talentos/settings");
  revalidatePath("/talentos/payroll");
  return { ok: true };
}
