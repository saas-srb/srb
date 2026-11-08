import { redirect } from "next/navigation";
import { getCurrentTmsUser } from "@/lib/tms-auth";

/**
 * Student portal (`/cohort-ai/me/*`). Any signed-in TMS user linked to a student
 * record can use it; staff see it alongside the full product. An account with no
 * `studentId` is sent back to the dashboard.
 */
export default async function PortalTmsLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentTmsUser();
  if (!user) redirect("/cohort-ai/login");
  if (!user.studentId) redirect("/cohort-ai");
  return <>{children}</>;
}
