import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import RequestsQueue from "@/components/products/talentos/RequestsQueue";
import MyRequests from "@/components/products/talentos/MyRequests";
import Tabs from "@/components/products/talentos/Tabs";
import { getCurrentHrmsUser } from "@/lib/hrms-auth";
import { hrCan } from "@/lib/talentos-access";
import { hrReach } from "@/lib/products/talentos/scope";
import { listEmployeeOptions } from "@/lib/products/talentos/employees";
import { getPayrollConfig } from "@/lib/products/talentos/payroll-config";
import { todayDateString } from "@/lib/products/talentos/settings";
import { defaultPayMonth, listRequests, usageFor } from "@/lib/products/talentos/work-requests";

export default async function RequestsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const user = (await getCurrentHrmsUser())!; // the layout has already checked requests.view
  // One page for everyone: the person's own requests, plus the reporting line's or everyone's when their scope reaches that far.
  const reach = await hrReach(user, "requests");
  const sees = reach.scope === "team" || reach.scope === "all";
  const mine = user.employeeId && hrCan(user, "requests.view") ? user.employeeId : null;
  const month = todayDateString().slice(0, 7);
  const sp = await searchParams;
  const tabs = [...(mine ? ["mine"] : []), ...(sees ? ["queue"] : [])];
  const tab = tabs.includes(sp.tab ?? "") ? sp.tab! : sees ? "queue" : "mine";

  const [config, myRows, usage, queueRows, employees, payMonth] = await Promise.all([
    mine ? getPayrollConfig() : null,
    mine ? listRequests({ employeeId: mine }, 100) : [],
    mine ? usageFor(mine, month) : null,
    sees ? listRequests(reach.ids ? { employeeIds: reach.ids } : {}, 300) : [],
    sees ? listEmployeeOptions() : [],
    sees ? defaultPayMonth() : "",
  ]);
  const byId = new Map(employees.map((e) => [e._id, e]));
  const canDecide = hrCan(user, "requests.decide");

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "TalentOS", href: "/talentos" }, { label: "Requests" }]}
        title={<>Requests</>}
        description={<>{sees ? "Your overtime, partial leave and expense claims, and those of the people you manage. Approved overtime and claims flow into payroll." : "Overtime, partial leave and expense claims. A manager approves each one and payroll picks them up."}</>}
      />
      <Tabs
        initial={tab}
        syncParam="tab"
        tabs={[
          ...(mine && config && usage ? [{
            key: "mine",
            label: "My requests",
            content: (
              <MyRequests
                month={month}
                usage={usage}
                canSubmit={hrCan(user, "requests.submit")}
                limits={{ overtimeEnabled: config.overtimeEnabled, overtimeMaxMinutesPerDay: config.overtimeMaxMinutesPerDay, overtimeMaxMinutesPerMonth: config.overtimeMaxMinutesPerMonth, shortLeavesPerMonth: config.shortLeavesPerMonth, shortLeaveMaxMinutes: config.shortLeaveMaxMinutes, expenseMaxAgeDays: config.expenseMaxAgeDays }}
                rows={myRows.map((r) => ({ _id: r._id, kind: r.kind, date: r.date, month: r.month, minutes: r.minutes, fromTime: r.fromTime, toTime: r.toTime, title: r.title, vendor: r.vendor, billNumber: r.billNumber, category: r.category, amount: r.amount, approvedAmount: r.approvedAmount, status: r.status, reason: r.reason, decisionNote: r.decisionNote }))}
              />
            ),
          }] : []),
          ...(sees ? [{
            key: "queue",
            label: "Team requests",
            content: (
              <RequestsQueue
                defaultPayMonth={payMonth}
                rows={queueRows.map((r) => ({
                  _id: r._id, kind: r.kind, date: r.date, month: r.month, minutes: r.minutes, fromTime: r.fromTime, toTime: r.toTime, title: r.title, vendor: r.vendor, billNumber: r.billNumber, category: r.category, amount: r.amount, approvedAmount: r.approvedAmount, status: r.status, reason: r.reason, decisionNote: r.decisionNote,
                  employeeName: byId.get(r.employeeId)?.name ?? "Former employee",
                  employeeCode: byId.get(r.employeeId)?.employeeCode ?? "",
                  canDecide: canDecide && r.employeeId !== user.employeeId,
                }))}
              />
            ),
          }] : []),
        ]}
      />
    </div>
  );
}
