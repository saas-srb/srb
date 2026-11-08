import { redirect } from "next/navigation";
import { getCurrentPrmsUser } from "@/lib/prms-auth";
import { hasPrmsStaffRole } from "@/lib/prms-roles";

/**
 * Staff-only management pages (dashboard, vendors, requisitions, settings…).
 * The shared shell + session check live in the parent `(protected)` layout;
 * this group only adds the role gate. Employees who reach one of these URLs are
 * bounced to their portal home.
 *
 * Deliberately NOT Super-Admin-permission-override-aware: `hasPrmsStaffRole`
 * is a coarse tier gate, not a fine-grained capability predicate (see
 * `prms-roles.ts`). A permission override can only add/remove capability for
 * a user who already clears this gate via a real role — it can never promote
 * a `prms_employee`-only account past this redirect.
 */
export default async function StaffPrmsLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentPrmsUser();
  if (!user) redirect("/spendiq/login");
  if (!hasPrmsStaffRole(user.roles)) redirect("/spendiq/me");
  return <>{children}</>;
}
