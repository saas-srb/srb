import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import MyRequests from "@/components/products/talentos/MyRequests";
import { getCurrentHrmsUser } from "@/lib/hrms-auth";
import { getPayrollConfig } from "@/lib/products/talentos/payroll-config";
import { todayDateString } from "@/lib/products/talentos/settings";
import { listRequests, usageFor } from "@/lib/products/talentos/work-requests";

export default async function MyRequestsPage() {
  const user = await getCurrentHrmsUser();
  const employeeId = user!.employeeId!;
  const month = todayDateString().slice(0, 7);
  const [config, rows, usage] = await Promise.all([getPayrollConfig(), listRequests({ employeeId }, 100), usageFor(employeeId, month)]);

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "TalentOS", href: "/talentos" }, { label: "My requests" }]}
        title={<>My requests</>}
        description={<>Overtime, partial leave and expense claims. A manager approves each one and payroll picks them up.</>}
      />
      <MyRequests
        month={month}
        usage={usage}
        limits={{ overtimeEnabled: config.overtimeEnabled, overtimeMaxMinutesPerDay: config.overtimeMaxMinutesPerDay, overtimeMaxMinutesPerMonth: config.overtimeMaxMinutesPerMonth, shortLeavesPerMonth: config.shortLeavesPerMonth, shortLeaveMaxMinutes: config.shortLeaveMaxMinutes, expenseMaxAgeDays: config.expenseMaxAgeDays }}
        rows={rows.map((r) => ({ _id: r._id, kind: r.kind, date: r.date, month: r.month, minutes: r.minutes, fromTime: r.fromTime, toTime: r.toTime, title: r.title, vendor: r.vendor, billNumber: r.billNumber, category: r.category, amount: r.amount, approvedAmount: r.approvedAmount, status: r.status, reason: r.reason, decisionNote: r.decisionNote }))}
      />
    </div>
  );
}
