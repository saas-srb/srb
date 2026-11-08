"use server";

import { revalidatePath } from "next/cache";
import { requireWorkspaceAction } from "@/lib/products/commandos/access";
import { setPortalUserStatus, forceLogoutPortalUser } from "@/lib/products/commandos/portal-users";

function revalidate() {
  revalidatePath("/commandos/portal/users");
}

export async function updatePortalUserStatusAction(id: string, status: "active" | "suspended"): Promise<{ ok: boolean }> {
  await requireWorkspaceAction("manage.portal.users");
  const ok = await setPortalUserStatus(id, status);
  revalidate();
  return { ok };
}

export async function bulkUpdatePortalUserStatusAction(ids: string[], status: "active" | "suspended"): Promise<{ updated: number }> {
  await requireWorkspaceAction("manage.portal.users");
  let updated = 0;
  for (const id of ids) {
    const ok = await setPortalUserStatus(id, status);
    if (ok) updated += 1;
  }
  revalidate();
  return { updated };
}

export async function forceLogoutPortalUserAction(id: string): Promise<{ sessionsCleared: number }> {
  await requireWorkspaceAction("manage.portal.users");
  const sessionsCleared = await forceLogoutPortalUser(id);
  revalidate();
  return { sessionsCleared };
}
