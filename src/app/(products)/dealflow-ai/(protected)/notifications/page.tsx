import { requireLmsPage } from "@/lib/lms-auth";
import UnifiedNotificationsPage from "@/components/platform/panel/UnifiedNotificationsPage";

export const dynamic = "force-dynamic";

export default async function LmsNotificationsPage() {
  await requireLmsPage("VIEW_LEADS");
  return <UnifiedNotificationsPage panel="lms" panelName="Lead Management System" shortCode="LMS" description="New leads, assignments, replies, stage changes and stale-lead alerts." />;
}
