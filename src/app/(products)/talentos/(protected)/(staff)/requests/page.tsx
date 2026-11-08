import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import { redirect } from "next/navigation";
import RequestsQueue from "@/components/products/talentos/RequestsQueue";
import { getCurrentHrmsUser } from "@/lib/hrms-auth";
import { canApproveLeave, canViewAllEmployees } from "@/lib/hrms-roles";
import { descendantEmployeeIds, listEmployeeOptions } from "@/lib/products/talentos/employees";
import { defaultPayMonth, listRequests } from "@/lib/products/talentos/work-requests";

export default async function RequestsPage() {
  const user = await getCurrentHrmsUser();
  if (!user || !canApproveLeave(user)) redirect("/talentos");
  const scope = canViewAllEmployees(user) ? undefined : await descendantEmployeeIds(user.employeeId ?? "__none__");
  const [rows, employees, payMonth] = await Promise.all([listRequests(scope ? { employeeIds: scope } : {}, 300), listEmployeeOptions(), defaultPayMonth()]);
  const byId = new Map(employees.map((e) => [e._id, e]));

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "TalentOS", href: "/talentos" }, { label: "Requests" }]}
        title={<>Requests</>}
        description={<>Overtime, partial leave and expense claims from employees. Approved overtime and claims flow into payroll.</>}
      />
      <RequestsQueue
        defaultPayMonth={payMonth}
        rows={rows.map((r) => ({
          _id: r._id, kind: r.kind, date: r.date, month: r.month, minutes: r.minutes, fromTime: r.fromTime, toTime: r.toTime, title: r.title, vendor: r.vendor, billNumber: r.billNumber, category: r.category, amount: r.amount, approvedAmount: r.approvedAmount, status: r.status, reason: r.reason, decisionNote: r.decisionNote,
          employeeName: byId.get(r.employeeId)?.name ?? "Former employee",
          employeeCode: byId.get(r.employeeId)?.employeeCode ?? "",
          canDecide: r.employeeId !== user.employeeId,
        }))}
      />
    </div>
  );
}
