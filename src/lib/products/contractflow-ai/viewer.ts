import "server-only";
import { getCurrentLpmsUser } from "@/lib/lpms-auth";
import { currentCompanyId } from "@/lib/platform/tenancy/context";
import type { LpmsViewer } from "@/lib/products/contractflow-ai/types";

export async function getViewer(): Promise<LpmsViewer | null> {
  const user = await getCurrentLpmsUser();
  if (!user) return null;

  const companyId = await currentCompanyId();

  return {
    userId: user.id,
    email: user.email,
    roles: user.roles,
    overrides: user.permissionOverrides,
    lpmsRoles: user.lpmsRoles.map(String),
    employeeId: user.employeeId,
    companyId: companyId ?? "",
  };
}
