"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import {
  PORTAL_SESSION_COOKIE,
  destroyPortalSessionByToken,
  clearPortalSessionCookie,
  getCurrentPortalUser,
} from "@/lib/portal-auth";
import { markPortalRead, markAllPortalRead } from "@/lib/products/clientos/notifications";
import { recordPortalAudit } from "@/lib/products/clientos/audit";
import { setActivePortalLead } from "@/lib/products/clientos/lead";

export async function portalLogoutAction(): Promise<void> {
  const store = await cookies();
  const token = store.get(PORTAL_SESSION_COOKIE)?.value;
  const user = await getCurrentPortalUser();
  if (user) await recordPortalAudit({ actorId: user.id, action: "logout", entity: "account", entityId: user.id });
  if (token) await destroyPortalSessionByToken(token);
  await clearPortalSessionCookie();
  redirect("/login");
}

export async function markPortalNotificationsReadAction(ids: string[]): Promise<{ ok: boolean }> {
  const user = await getCurrentPortalUser();
  if (!user) return { ok: false };
  await markPortalRead(ids, user.id);
  revalidatePath("/clientos/notifications");
  return { ok: true };
}

export async function markAllPortalNotificationsReadAction(): Promise<{ ok: boolean }> {
  const user = await getCurrentPortalUser();
  if (!user) return { ok: false };
  await markAllPortalRead(user.id);
  revalidatePath("/clientos/notifications");
  return { ok: true };
}

export async function switchPortalLeadAction(leadId: string): Promise<{ ok: boolean }> {
  const user = await getCurrentPortalUser();
  if (!user) return { ok: false };
  const ok = await setActivePortalLead(user.id, leadId);
  if (ok) {
    revalidatePath("/clientos", "layout");
  }
  return { ok };
}
