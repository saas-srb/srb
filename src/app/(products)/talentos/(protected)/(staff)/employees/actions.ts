"use server";

import { employeeBlockReason } from "@/lib/platform/billing/enforce";
import { revalidatePath } from "next/cache";
import { getCurrentHrmsUser } from "@/lib/hrms-auth";
import { canManageEmployees, type HrmsRole } from "@/lib/hrms-roles";
import {
  createEmployee,
  updateEmployee,
  deleteEmployee,
  changeEmployeeStatus,
  getEmployee,
  employeeFullName,
  wouldCreateCycle,
  type RecruitmentLink,
} from "@/lib/products/talentos/employees";
import { rebuildHierarchyFor, removeFromHierarchy } from "@/lib/products/talentos/hierarchy";
import { validateEmployeeCreate } from "@/lib/products/talentos/validation";
import { isValidEmployeeStatus } from "@/lib/products/talentos/employee-status";
import { recordAudit, diffSummary } from "@/lib/products/talentos/audit";
import { getApplicationForConversion } from "@/lib/products/talentos/recruitment";
import { markOfferJoined } from "@/lib/products/talentos/offers";
import { notify } from "@/lib/products/talentos/notifications";
import { writeBlockReason } from "@/lib/platform/billing/enforce";

async function requireManage(): Promise<{ id: string; email: string; roles: HrmsRole[] }> {
  const user = await getCurrentHrmsUser();
  if (!user) throw new Error("Unauthorized");
  if (!canManageEmployees(user)) throw new Error("Forbidden");
  return user;
}

function revalidateEmployee(id?: string) {
  revalidatePath("/talentos");
  revalidatePath("/talentos/employees");
  if (id) revalidatePath(`/talentos/employees/${id}`);
  revalidatePath("/talentos/departments");
  revalidatePath("/talentos/recruitment");
}

export interface EmployeeActionResult {
  ok: boolean;
  id?: string;
  error?: string;
  fieldErrors?: Record<string, string>;
}

export async function createEmployeeAction(
  input: Record<string, unknown>,
  applicationId?: string
): Promise<EmployeeActionResult> {
  const user = await requireManage();
  const readOnly = await writeBlockReason();
  if (readOnly) return { ok: false, error: readOnly };
  const validation = validateEmployeeCreate(input);
  if (!validation.valid) return { ok: false, fieldErrors: validation.errors };

  let recruitment: RecruitmentLink | null = null;
  if (applicationId) {
    const prefill = await getApplicationForConversion(applicationId);
    if (!prefill) return { ok: false, error: "That applicant is no longer available for conversion." };
    recruitment = {
      applicationId,
      positionSlug: prefill.positionSlug,
      positionTitle: prefill.positionTitle,
      convertedAt: new Date(),
      convertedBy: user.id,
    };
  }

  const planBlock = await employeeBlockReason();
  if (planBlock) return { ok: false, error: planBlock };
  const employee = await createEmployee(validation.data, user.id, { recruitment });
  await rebuildHierarchyFor(employee._id);

  await recordAudit({
    actorId: user.id,
    actorEmail: user.email,
    action: recruitment ? "convert_from_applicant" : "create",
    entity: "employee",
    entityId: employee._id,
    entityLabel: `${employeeFullName(employee)} (${employee.employeeCode})`,
    summary: recruitment ? `Converted from application ${applicationId}` : "Employee created",
  });

  if (applicationId) {
    await markOfferJoined(applicationId, employee._id, user.id);
    revalidatePath("/talentos/recruitment");
  }

  await notify({
    audience: "staff",
    type: "employee_added",
    title: `${employeeFullName(employee)} added`,
    body: `${employee.employeeCode}${recruitment ? " · converted from a job application" : ""}`,
    link: `/talentos/employees/${employee._id}`,
    entityType: "employee",
    entityId: employee._id,
  });

  revalidateEmployee(employee._id);
  return { ok: true, id: employee._id };
}

export async function updateEmployeeAction(id: string, input: Record<string, unknown>): Promise<EmployeeActionResult> {
  const user = await requireManage();
  const before = await getEmployee(id);
  if (!before) return { ok: false, error: "Employee not found." };

  const validation = validateEmployeeCreate(input);
  if (!validation.valid) return { ok: false, fieldErrors: validation.errors };

  const newManager = validation.data.professional.reportingManagerId;
  if (newManager && newManager !== before.professional.reportingManagerId) {
    if (await wouldCreateCycle(id, newManager)) {
      return { ok: false, fieldErrors: { reportingManagerId: "That would create a reporting cycle." } };
    }
  }

  const after = await updateEmployee(id, validation.data, user.id);
  if (!after) return { ok: false, error: "Employee not found." };

  await rebuildHierarchyFor(id);

  await recordAudit({
    actorId: user.id,
    actorEmail: user.email,
    action: "update",
    entity: "employee",
    entityId: id,
    entityLabel: `${employeeFullName(after)} (${after.employeeCode})`,
    summary:
      diffSummary(
        before as unknown as Record<string, unknown>,
        after as unknown as Record<string, unknown>,
        ["firstName", "lastName", "workEmail", "status"]
      ) ?? "Profile details updated",
  });

  revalidateEmployee(id);
  return { ok: true, id };
}

export async function changeEmployeeStatusAction(
  id: string,
  status: string,
  relievingDate?: string
): Promise<EmployeeActionResult> {
  const user = await requireManage();
  if (!isValidEmployeeStatus(status)) return { ok: false, error: "Invalid status." };

  const before = await getEmployee(id);
  if (!before) return { ok: false, error: "Employee not found." };

  const after = await changeEmployeeStatus(id, status, user.id, relievingDate ?? undefined);
  if (!after) return { ok: false, error: "Employee not found." };

  await recordAudit({
    actorId: user.id,
    actorEmail: user.email,
    action: "status_change",
    entity: "employee",
    entityId: id,
    entityLabel: `${employeeFullName(after)} (${after.employeeCode})`,
    summary: `status: ${before.status} → ${after.status}`,
  });

  revalidateEmployee(id);
  return { ok: true, id };
}

export async function deleteEmployeeAction(id: string): Promise<EmployeeActionResult> {
  const user = await requireManage();
  const before = await getEmployee(id);
  if (!before) return { ok: false, error: "Employee not found." };

  const result = await deleteEmployee(id, user.id);
  if (!result.ok) return { ok: false, error: result.reason ?? "Could not delete employee." };

  await removeFromHierarchy(id);
  await recordAudit({
    actorId: user.id,
    actorEmail: user.email,
    action: "delete",
    entity: "employee",
    entityId: id,
    entityLabel: `${employeeFullName(before)} (${before.employeeCode})`,
    summary: "Employee archived (soft delete)",
  });

  revalidateEmployee(id);
  return { ok: true };
}
