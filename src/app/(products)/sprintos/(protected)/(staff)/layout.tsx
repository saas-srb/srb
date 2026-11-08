import { redirect } from "next/navigation";
import { getCurrentPmsUser } from "@/lib/pms-auth";
import { hasPmsStaffRole } from "@/lib/pms-roles";

/**
 * Staff-only management pages (dashboard, clients, projects analytics, costing,
 * settings, activity, calendar). The shared shell + session check live in the
 * parent `(protected)` layout; this group only adds the role gate. Employees who
 * reach one of these URLs are bounced to their portal home.
 *
 * Deliberately NOT Super-Admin-permission-override-aware: `hasPmsStaffRole` is
 * a coarse tier gate, not a fine-grained capability predicate (see
 * `pms-roles.ts`). A permission override can only add/remove capability for a
 * user who already clears this gate via a real role — it can never promote a
 * `pms_employee`-only account past this redirect.
 */
export default async function StaffPmsLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentPmsUser();
  if (!user) redirect("/sprintos/login");
  if (!hasPmsStaffRole(user.roles)) redirect(user.employeeId ? "/sprintos/me" : "/sprintos/login");
  return <>{children}</>;
}
