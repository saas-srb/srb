import { redirect } from "next/navigation";
import { getCurrentHrmsUser } from "@/lib/hrms-auth";
import { hasStaffRole } from "@/lib/hrms-roles";

/**
 * Staff-only management pages (dashboard, employees, payroll, settings, audit …).
 * The shared shell + session check live in the parent `(protected)` layout;
 * this group only adds the role gate. Employees who reach one of these URLs are
 * bounced to their self-service home.
 *
 * Deliberately NOT Super-Admin-permission-override-aware: `hasStaffRole` is a
 * coarse tier gate, not a fine-grained capability predicate (see
 * `hrms-roles.ts`). A permission override can only add/remove capability for a
 * user who already clears this gate via a real role — it can never promote an
 * `employee`-only account past this redirect.
 */
export default async function StaffHrmsLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentHrmsUser();
  if (!user) redirect("/talentos/login");
  if (!hasStaffRole(user.roles)) redirect(user.employeeId ? "/talentos/me" : "/talentos/login");
  return <>{children}</>;
}
