"use server";

import { revalidatePath } from "next/cache";
import { getCurrentHrmsUser } from "@/lib/hrms-auth";
import { canManagePayroll, canRunPayroll, canManageEmployees } from "@/lib/hrms-roles";
import { getEmployee, employeeFullName } from "@/lib/products/talentos/employees";
import { upsertPayrollProfile } from "@/lib/products/talentos/payroll";
import { validatePayrollProfile } from "@/lib/products/talentos/validation";
import { validateSalaryRevision, validateEmployeeLogin } from "@/lib/products/talentos/validation-payroll";
import { createRevision } from "@/lib/products/talentos/salary-revisions";
import { createEmployeeLogin, revokeEmployeeLogin, resetEmployeeLoginPassword, generateTempPassword } from "@/lib/products/talentos/employee-auth";
import { recordAudit } from "@/lib/products/talentos/audit";

export interface PayrollActionResult {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
}

export async function savePayrollProfileAction(
  employeeId: string,
  input: Record<string, unknown>
): Promise<PayrollActionResult> {
  const user = await getCurrentHrmsUser();
  if (!user) throw new Error("Unauthorized");
  if (!canManagePayroll(user)) throw new Error("Forbidden");

  const employee = await getEmployee(employeeId);
  if (!employee) return { ok: false, error: "Employee not found." };

  const validation = validatePayrollProfile(input);
  if (!validation.valid) return { ok: false, fieldErrors: validation.errors };

  await upsertPayrollProfile(employeeId, validation.data, user.id);

  await recordAudit({
    actorId: user.id,
    actorEmail: user.email,
    action: "update",
    entity: "payroll_profile",
    entityId: employeeId,
    entityLabel: `${employeeFullName(employee)} (${employee.employeeCode})`,
    summary: "Salary structure / bank details updated",
  });

  revalidatePath(`/talentos/employees/${employeeId}`);
  return { ok: true };
}

export async function createSalaryRevisionAction(
  employeeId: string,
  input: Record<string, unknown>
): Promise<PayrollActionResult> {
  const user = await getCurrentHrmsUser();
  if (!user) throw new Error("Unauthorized");
  if (!canRunPayroll(user)) throw new Error("Forbidden");

  const employee = await getEmployee(employeeId);
  if (!employee) return { ok: false, error: "Employee not found." };

  const v = validateSalaryRevision(input);
  if (!v.valid) return { ok: false, fieldErrors: v.errors };

  const rev = await createRevision({ employeeId, ...v.data }, user.id);
  await recordAudit({
    actorId: user.id,
    actorEmail: user.email,
    action: "create",
    entity: "salary_revision",
    entityId: rev._id,
    entityLabel: `${employeeFullName(employee)} (${employee.employeeCode})`,
    summary: `Effective ${v.data.effectiveFrom} — basic ${v.data.basic}`,
  });

  revalidatePath(`/talentos/employees/${employeeId}`);
  return { ok: true };
}

export interface LoginActionResult {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
  /** The temp password to show once, on success. */
  tempPassword?: string;
  email?: string;
}

export async function createEmployeeLoginAction(
  employeeId: string,
  input: Record<string, unknown>
): Promise<LoginActionResult> {
  const user = await getCurrentHrmsUser();
  if (!user) throw new Error("Unauthorized");
  if (!canManageEmployees(user)) throw new Error("Forbidden");

  const v = validateEmployeeLogin(input);
  if (!v.valid) return { ok: false, fieldErrors: v.errors };

  const result = await createEmployeeLogin(employeeId, v.data.email, v.data.tempPassword);
  if (!result.ok) return { ok: false, error: result.error };

  await recordAudit({
    actorId: user.id,
    actorEmail: user.email,
    action: "create",
    entity: "employee_login",
    entityId: employeeId,
    entityLabel: v.data.email,
    summary: "Portal login created",
  });
  revalidatePath(`/talentos/employees/${employeeId}`);
  return { ok: true, tempPassword: v.data.tempPassword, email: result.email };
}

export async function resetEmployeeLoginAction(employeeId: string): Promise<LoginActionResult> {
  const user = await getCurrentHrmsUser();
  if (!user) throw new Error("Unauthorized");
  if (!canManageEmployees(user)) throw new Error("Forbidden");

  const temp = generateTempPassword();
  const result = await resetEmployeeLoginPassword(employeeId, temp);
  if (!result.ok) return { ok: false, error: result.error };

  await recordAudit({ actorId: user.id, actorEmail: user.email, action: "update", entity: "employee_login", entityId: employeeId, summary: "Portal password reset" });
  revalidatePath(`/talentos/employees/${employeeId}`);
  return { ok: true, tempPassword: temp };
}

export async function revokeEmployeeLoginAction(employeeId: string): Promise<LoginActionResult> {
  const user = await getCurrentHrmsUser();
  if (!user) throw new Error("Unauthorized");
  if (!canManageEmployees(user)) throw new Error("Forbidden");

  const result = await revokeEmployeeLogin(employeeId);
  if (!result.ok) return { ok: false, error: result.error };

  await recordAudit({ actorId: user.id, actorEmail: user.email, action: "delete", entity: "employee_login", entityId: employeeId, summary: "Portal login revoked" });
  revalidatePath(`/talentos/employees/${employeeId}`);
  return { ok: true };
}
