import "server-only";
import { cache } from "react";
import { getCurrentSopUser, type CurrentSopUser } from "@/lib/sop-auth";
import { isSopAdmin, isSopManagerTier } from "@/lib/sop-roles";
import { getEmployeeContextForUser, headedHrmsDepartmentIds } from "@/lib/products/playbook-ai/people";
import { getTaxonomy } from "@/lib/products/playbook-ai/taxonomy";
import type { SopViewer } from "@/lib/products/playbook-ai/types";

function nameFromEmail(email: string): string {
  const local = email.split("@")[0] ?? email;
  const words = local.replace(/[._-]+/g, " ").replace(/\d+/g, " ").trim().split(/\s+/).filter(Boolean);
  return words.length ? words.map((w) => w[0].toUpperCase() + w.slice(1)).join(" ") : email;
}

/**
 * Resolves who is asking: their HRMS employee record → department / team /
 * designation → SOP-department ids. This is the ONLY place HRMS membership is
 * translated into SOP access scope.
 */
export async function buildViewer(user: CurrentSopUser): Promise<SopViewer> {
  const [emp, taxonomy] = await Promise.all([
    getEmployeeContextForUser({ id: user.id, email: user.email, employeeId: user.employeeId }),
    getTaxonomy(),
  ]);
  const byHrms = new Map(taxonomy.departments.filter((d) => d.hrmsDepartmentId).map((d) => [d.hrmsDepartmentId as string, d._id]));

  const memberDepartmentIds: string[] = [];
  if (emp?.hrmsDepartmentId && byHrms.has(emp.hrmsDepartmentId)) memberDepartmentIds.push(byHrms.get(emp.hrmsDepartmentId) as string);

  const headedHrms = emp ? await headedHrmsDepartmentIds(emp.employeeId) : [];
  const headedDepartmentIds = headedHrms.map((h) => byHrms.get(h)).filter((x): x is string => !!x);

  const ctx = { roles: user.roles, permissionOverrides: user.permissionOverrides };
  const isAdmin = isSopAdmin(ctx);
  const isManagerTier = isSopManagerTier(ctx);
  // A manager manages their own department; a department head manages theirs even without a manager role.
  const manageDepartmentIds = Array.from(new Set([...(isManagerTier ? memberDepartmentIds : []), ...headedDepartmentIds]));

  return {
    userId: user.id,
    email: user.email,
    name: emp?.name ?? nameFromEmail(user.email),
    roles: user.roles,
    overrides: user.permissionOverrides,
    employeeId: emp?.employeeId ?? null,
    hrmsDepartmentId: emp?.hrmsDepartmentId ?? null,
    teamId: emp?.teamId ?? null,
    designationId: emp?.designationId ?? null,
    memberDepartmentIds,
    headedDepartmentIds,
    manageDepartmentIds,
    isAdmin,
    isManagerTier,
  };
}

/** Request-scoped current viewer (null when signed out). Pages, layouts and components share one resolution. */
export const getViewer = cache(async (): Promise<SopViewer | null> => {
  const user = await getCurrentSopUser();
  return user ? buildViewer(user) : null;
});

/** For server actions / route handlers: throws `Unauthorized` when signed out. */
export async function requireViewer(): Promise<SopViewer> {
  const v = await getViewer();
  if (!v) throw new Error("Unauthorized");
  return v;
}
