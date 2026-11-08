import "server-only";
import { getCurrentHrmsUser } from "@/lib/hrms-auth";

/**
 * Server-action guard for the employee portal. Returns the caller's own
 * `employeeId` — portal actions must only ever touch this id.
 */
export async function requirePortalEmployee(): Promise<{ userId: string; employeeId: string; email: string }> {
  const user = await getCurrentHrmsUser();
  if (!user) throw new Error("Unauthorized");
  if (user.mustChangePassword) throw new Error("Unauthorized");
  if (!user.employeeId) throw new Error("Forbidden");
  return { userId: user.id, employeeId: user.employeeId, email: user.email };
}
