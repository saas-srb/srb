import UnifiedNotificationsPage from "@/components/platform/panel/UnifiedNotificationsPage";

export const dynamic = "force-dynamic";

export default function FmsNotificationsPage() {
  return <UnifiedNotificationsPage panel="fms" panelName="Financial Management System" shortCode="FMS" description="Invoices, payments, approvals, refunds, reconciliation and period-close alerts for the finance team." />;
}
