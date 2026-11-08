import "server-only";
import { redirect } from "next/navigation";
import { getCurrentPortalUser, type CurrentPortalUser } from "@/lib/portal-auth";
import type { PortalRole } from "@/lib/portal-roles";

/**
 * Page-level RBAC for the portal. Unlike `requirePortalUser` (which throws, for
 * server actions / API routes), this *redirects* — an external user who types
 * another role's URL is quietly bounced to their own dashboard, never shown a
 * stack trace and never told the other module exists.
 */
export async function guardPortalPage(...allowed: PortalRole[]): Promise<CurrentPortalUser> {
  const user = await getCurrentPortalUser();
  if (!user) redirect("/login");
  if (user.mustChangePassword) redirect("/clientos/change-password");
  if (allowed.length > 0 && !allowed.includes(user.role)) redirect("/clientos");
  return user;
}
