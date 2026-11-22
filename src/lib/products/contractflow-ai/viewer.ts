import "server-only";
import { getCurrentLpmsUser } from "@/lib/lpms-auth";
import { currentCompanyId } from "@/lib/platform/tenancy/context";
import { can as accessCan } from "@/lib/access/can";
import { loadAccessSubject } from "@/lib/access/server";
import { microByKey } from "@/lib/access/micro";
import type { Level } from "@/lib/access/types";
import type { LpmsViewer } from "@/lib/products/contractflow-ai/types";

const PRODUCT = "contractflow-ai";
export type LpmsViewerLike = Pick<LpmsViewer, "subject">;

/** The one check. `key` is `<module>.<feature>` without the product, e.g. "documents.approve". An unknown key is never allowed (the coverage test also fails on it). */
export function can(viewer: Pick<LpmsViewer, "subject">, key: string, level?: Level): boolean {
  const full = `${PRODUCT}.${key}`;
  const m = microByKey(full);
  if (!m) return false;
  return accessCan(viewer.subject, PRODUCT, full, level ?? m.level);
}

/** For server actions that only have the signed-in user's id: loads the person's access and checks one feature. */
export async function lpmsAllow(userId: string, key: string): Promise<boolean> {
  const subject = await loadAccessSubject(userId);
  return Boolean(subject) && can({ subject: subject! }, key);
}

export async function getViewer(): Promise<LpmsViewer | null> {
  const user = await getCurrentLpmsUser();
  if (!user) return null;

  const companyId = await currentCompanyId();
  const subject = (await loadAccessSubject(user.id)) ?? { isDirector: false, access: {} };

  return {
    userId: user.id,
    email: user.email,
    roles: user.roles,
    overrides: user.permissionOverrides,
    lpmsRoles: user.lpmsRoles.map(String),
    employeeId: user.employeeId,
    companyId: companyId ?? "",
    subject,
  };
}
