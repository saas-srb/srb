import PanelListFilters from "@/components/platform/panel/PanelListFilters";
import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import { Inbox, CalendarCheck, CheckCircle2, Tags } from "lucide-react";
import { CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import KpiCard from "@/components/products/dealflow-ai/KpiCard";
import KpiGrid from "@/components/products/dealflow-ai/KpiGrid";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import CategoryBarChart from "@/components/products/dealflow-ai/CategoryBarChart";
import TimeSeriesChart from "@/components/products/dealflow-ai/TimeSeriesChart";
import Tabs from "@/components/products/talentos/Tabs";
import FileLeaveSheet from "@/components/products/talentos/FileLeaveSheet";
import LeaveRequestsTable from "@/components/products/talentos/LeaveRequestsTable";
import LeaveCalendar from "@/components/products/talentos/LeaveCalendar";
import LeaveBalancesBrowser from "@/components/products/talentos/LeaveBalancesBrowser";
import MyLeavePanel from "@/components/products/talentos/MyLeavePanel";
import MyLeaveSheet from "@/components/products/talentos/MyLeaveSheet";
import { getCurrentHrmsUser } from "@/lib/hrms-auth";
import { hrCan } from "@/lib/talentos-access";
import { hrReach } from "@/lib/products/talentos/scope";
import { listEmployeeOptions } from "@/lib/products/talentos/employees";
import {
  listLeaveRequests,
  listLeaveTypes,
  getLeaveCalendar,
  getLeaveAnalytics,
  getBalances,
  currentYear,
  isValidLeaveStatus,
  type LeaveRequestStatus,
} from "@/lib/products/talentos/leave";
import { monthBounds, todayDateString } from "@/lib/products/talentos/settings";

export default async function LeavePage({
  searchParams,
}: {
  searchParams: Promise<{
    tab?: string;
    status?: string;
    leaveType?: string;
    page?: string;
    month?: string;
    employee?: string;
  }>;
}) {
  const user = (await getCurrentHrmsUser())!; // the layout has already checked the person holds leave.view
  // One page for everyone: the person's own leave, plus the reporting line's or everyone's when their scope reaches that far.
  const reach = await hrReach(user, "leave");
  const sees = reach.scope === "team" || reach.scope === "all";
  const canDecide = sees && hrCan(user, "leave.approve");
  const canAllocate = reach.scope === "all" && hrCan(user, "employees.manage");
  const restrictIds = reach.ids;
  const mine = user.employeeId && hrCan(user, "leave.view") ? user.employeeId : null;

  const sp = await searchParams;
  const tabs = [...(mine ? ["mine"] : []), ...(sees ? ["requests", "calendar", "balances", "analytics"] : [])];
  const tab = tabs.includes(sp.tab ?? "") ? sp.tab! : sees ? "requests" : "mine";
  const status = sp.status && isValidLeaveStatus(sp.status) ? (sp.status as LeaveRequestStatus) : undefined;
  const leaveTypeCode = sp.leaveType || undefined;
  const page = Math.max(Number(sp.page) || 1, 1);
  const month = /^\d{4}-\d{2}$/.test(sp.month ?? "") ? sp.month! : todayDateString().slice(0, 7);
  const year = currentYear();

  const { from, to } = monthBounds(month);
  const analyticsFrom = `${year}-01-01`;
  const analyticsTo = `${year}-12-31`;

  const empty = { items: [], total: 0, page: 1, pageSize: 30, totalPages: 1 } as Awaited<ReturnType<typeof listLeaveRequests>>;
  const emptyAnalytics = { byType: [], byDepartment: [], byMonth: [], approvalRate: 0, totalRequests: 0, totalDaysApproved: 0 } as Awaited<ReturnType<typeof getLeaveAnalytics>>;
  const [requestsResult, leaveTypes, calendar, analytics, employees] = await Promise.all([
    sees ? listLeaveRequests({ status, leaveTypeCode, restrictToEmployeeIds: restrictIds }, page, 30) : empty,
    listLeaveTypes(),
    sees ? getLeaveCalendar(from, to, restrictIds) : [],
    sees ? getLeaveAnalytics(analyticsFrom, analyticsTo, restrictIds) : emptyAnalytics,
    sees ? listEmployeeOptions() : [],
  ]);

  const scopedEmployees = restrictIds ? employees.filter((e) => restrictIds.includes(e._id)) : employees;
  const selectedEmployeeId = sp.employee || (scopedEmployees[0]?._id ?? null);
  const balances = sees && selectedEmployeeId ? await getBalances(selectedEmployeeId, year) : [];

  const typeOpts = leaveTypes.map((t) => ({ code: t.code, label: t.label }));

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "TalentOS", href: "/talentos" }, { label: "Leave" }]}
        title={<>Leave</>}
        description={<>{sees ? "Your leave, and the requests, balances and calendar of the people you manage." : "Your leave balances and request history."}</>}
        actions={<>{mine && hrCan(user, "leave.apply") && <MyLeaveSheet leaveTypes={typeOpts} />}{canDecide && <FileLeaveSheet employees={scopedEmployees} leaveTypes={typeOpts} />}</>}
      />

      <PanelListFilters>
<Tabs
        initial={tab}
        syncParam="tab"
        tabs={[
          ...(mine ? [{ key: "mine", label: "My leave", content: <MyLeavePanel employeeId={mine} canWithdraw={hrCan(user, "leave.apply")} /> }] : []),
          ...(sees ? [
          {
            key: "requests",
            label: "Requests",
            content: (
              <LeaveRequestsTable
                items={requestsResult.items.map((r) => ({
                  _id: r._id,
                  employeeId: r.employeeId,
                  employeeName: r.employeeName,
                  employeeCode: r.employeeCode,
                  leaveTypeCode: r.leaveTypeCode,
                  leaveTypeLabel: r.leaveTypeLabel,
                  startDate: r.startDate,
                  endDate: r.endDate,
                  days: r.days,
                  reason: r.reason,
                  status: r.status,
                  decisionNote: r.decisionNote,
                  decidedAt: r.decidedAt,
                  createdAt: r.createdAt,
                }))}
                total={requestsResult.total}
                page={requestsResult.page}
                totalPages={requestsResult.totalPages}
                leaveTypes={typeOpts}
                initial={{ status: status ?? "", leaveType: leaveTypeCode ?? "", search: "" }}
                canDecide={canDecide}
              />
            ),
          },
          {
            key: "calendar",
            label: "Calendar",
            content: <LeaveCalendar month={month} entries={calendar} />,
          },
          {
            key: "balances",
            label: "Balances",
            content: (
              <LeaveBalancesBrowser
                employees={scopedEmployees}
                selectedEmployeeId={selectedEmployeeId}
                year={year}
                balances={balances.map((b) => ({ ...b }))}
                canEditAllocation={canAllocate}
              />
            ),
          },
          {
            key: "analytics",
            label: "Analytics",
            content: (
              <div className="space-y-4">
                <KpiGrid>
                  <KpiCard label="Requests (YTD)" value={analytics.totalRequests} accent icon={<Inbox className="size-4" />} />
                  <KpiCard label="Days Approved" value={analytics.totalDaysApproved} icon={<CalendarCheck className="size-4" />} />
                  <KpiCard label="Approval Rate" value={analytics.approvalRate} suffix="%" icon={<CheckCircle2 className="size-4" />} />
                  <KpiCard label="Leave Types" value={leaveTypes.length} icon={<Tags className="size-4" />} />
                </KpiGrid>
                <div className="grid gap-4 lg:grid-cols-2">
                  <GlassCard>
                    <CardHeader><CardTitle>Requests by Type</CardTitle></CardHeader>
                    <CardContent><CategoryBarChart data={analytics.byType} /></CardContent>
                  </GlassCard>
                  <GlassCard>
                    <CardHeader><CardTitle>Requests by Department</CardTitle></CardHeader>
                    <CardContent><CategoryBarChart data={analytics.byDepartment} /></CardContent>
                  </GlassCard>
                </div>
                <GlassCard>
                  <CardHeader><CardTitle>Requests by Month</CardTitle></CardHeader>
                  <CardContent><TimeSeriesChart data={analytics.byMonth} /></CardContent>
                </GlassCard>
              </div>
            ),
          },
          ] : []),
        ]}
      />
</PanelListFilters>
    </div>
  );
}
