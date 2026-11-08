import { getCurrentPortalUser } from "@/lib/portal-auth";
import { getActivePortalLead } from "@/lib/products/clientos/lead";
import { getApplicantOverview } from "@/lib/products/clientos/applicant";
import { getLearnerOverview } from "@/lib/products/clientos/student";
import { getClientOverview } from "@/lib/products/clientos/client";
import { buildStudentDashboard } from "@/lib/products/clientos/dashboard/student";
import { buildClientDashboard } from "@/lib/products/clientos/dashboard/client";
import { buildHiringDashboard } from "@/lib/products/clientos/dashboard/hiring";
import DashboardView from "@/components/products/clientos/dashboard/DashboardView";

export const dynamic = "force-dynamic";

/**
 * One entry point, four dashboards. The user's type (from the active lead /
 * account role) picks the experience; each builder only reads records keyed
 * to this user and only offers links to pages that role's portal nav grants.
 * Because it renders per request, a role, lead, wallet or data change is
 * reflected immediately.
 */
export default async function PortalDashboardPage() {
  const user = await getCurrentPortalUser();
  if (!user) return null;

  const leadView = await getActivePortalLead(user);
  const type = leadView?.lead.type ?? user.role;

  // The active lead can be of a different type than the account's role (a person may hold several requests) — keep nav/permissions in step with that type.
  const effective = { ...user, role: type };

  if (type === "job_applicant") {
    const appId = user.applicationId ?? leadView?.lead.applicationId ?? null;
    const data = appId ? await getApplicantOverview(appId).catch(() => null) : null;
    return <DashboardView model={await buildHiringDashboard(effective, data, leadView)} />;
  }

  if (type === "intern" || type === "trainee") {
    const data = await getLearnerOverview(user.studentId ?? leadView?.lead.studentId ?? null).catch(() => null);
    return <DashboardView model={await buildStudentDashboard(effective, data, leadView)} />;
  }

  const data = await getClientOverview(user.clientId ?? leadView?.lead.clientId ?? null).catch(() => null);
  return <DashboardView model={await buildClientDashboard(effective, data, leadView)} />;
}
