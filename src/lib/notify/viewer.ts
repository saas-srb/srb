import "server-only";
import { getCurrentHubUser } from "@/lib/hub-auth";
import { getCurrentPortalUser } from "@/lib/portal-auth";
import type { StaffViewer } from "@/lib/notify/counts";

export type NotifyViewer = { actor: "staff"; user: StaffViewer } | { actor: "portal"; user: { id: string } };

/** Who is asking: a company account (any product) or an external portal account. `as=portal` is sent by the Portal's own pages. */
export async function currentNotifyViewer(as: string | null): Promise<NotifyViewer | null> {
  if (as === "portal") {
    const p = await getCurrentPortalUser();
    return p ? { actor: "portal", user: { id: p.id } } : null;
  }
  const u = await getCurrentHubUser();
  return u ? { actor: "staff", user: { id: u.id, roles: u.roles, permissionOverrides: u.permissionOverrides ?? null } } : null;
}
