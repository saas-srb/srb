import { redirect } from "next/navigation";
import { getCurrentTmsUser } from "@/lib/tms-auth";
import { hasTmsStaffRole } from "@/lib/tms-roles";

/**
 * Staff-only management pages (dashboard, programs, batches, students…). The
 * shared shell + session check live in the parent `(protected)` layout; this
 * group only adds the role gate. Students who reach one of these URLs are
 * bounced to their portal home.
 *
 * Deliberately NOT Super-Admin-permission-override-aware: `hasTmsStaffRole` is
 * a coarse tier gate, not a fine-grained capability predicate (see
 * `tms-roles.ts`). A permission override can only add/remove capability for a
 * user who already clears this gate via a real role — it can never promote a
 * `training_student`-only account past this redirect.
 */
export default async function StaffTmsLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentTmsUser();
  if (!user) redirect("/cohort-ai/login");
  if (!hasTmsStaffRole(user.roles)) redirect(user.studentId ? "/cohort-ai/me" : "/cohort-ai/login");
  return <>{children}</>;
}
