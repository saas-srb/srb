import UnifiedNotificationsPage from "@/components/platform/panel/UnifiedNotificationsPage";

export const dynamic = "force-dynamic";

export default function LpmsNotificationsPage() {
  return <UnifiedNotificationsPage panel="lpms" panelName="Legal & Process Management" shortCode="LPMS" description="Document reviews and approvals, signatures, publishing and expiry reminders." />;
}
