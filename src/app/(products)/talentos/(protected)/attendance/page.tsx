import PanelListFilters from "@/components/platform/panel/PanelListFilters";
import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import Tabs from "@/components/products/talentos/Tabs";
import AttendanceRegister from "@/components/products/talentos/AttendanceRegister";
import MonthlyAttendanceReport from "@/components/products/talentos/MonthlyAttendanceReport";
import { CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import ClockWidget from "@/components/products/talentos/ClockWidget";
import AttendanceCalendar from "@/components/products/talentos/AttendanceCalendar";
import { getCurrentHrmsUser } from "@/lib/hrms-auth";
import { hrCan } from "@/lib/talentos-access";
import { hrReach } from "@/lib/products/talentos/scope";
import { getClockState, todayIsWorkingDay } from "@/lib/products/talentos/self-service";
import { getEmployeeMonth } from "@/lib/products/talentos/attendance";
import { getDailyRegister, getMonthlyReport } from "@/lib/products/talentos/attendance";
import { listDepartments } from "@/lib/products/talentos/departments";
import { isDateString, todayDateString } from "@/lib/products/talentos/settings";

export default async function AttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; date?: string; month?: string; department?: string }>;
}) {
  const user = (await getCurrentHrmsUser())!; // the layout has already checked attendance.view
  // One page for everyone: the person's own attendance, plus the reporting line's or everyone's when their scope reaches that far.
  const reach = await hrReach(user, "attendance");
  const sees = reach.scope === "team" || reach.scope === "all";
  const canEdit = sees && hrCan(user, "attendance.manage");
  const restrictToManagerId = reach.scope === "team" ? user.employeeId ?? "__none__" : undefined;
  const mine = user.employeeId && hrCan(user, "attendance.view") ? user.employeeId : null;

  const sp = await searchParams;
  const date = sp.date && isDateString(sp.date) ? sp.date : todayDateString();
  const month = /^\d{4}-\d{2}$/.test(sp.month ?? "") ? sp.month! : todayDateString().slice(0, 7);
  const departmentId = sp.department || undefined;
  const tab = sp.tab === "report" && sees ? "report" : sp.tab === "register" && sees ? "register" : sees && sp.tab !== "mine" ? "register" : "mine";

  const [register, report, departments, clock, today, monthData] = await Promise.all([
    sees ? getDailyRegister(date, { departmentId, restrictToManagerId }) : null,
    sees ? getMonthlyReport(month, { departmentId, restrictToManagerId }) : [],
    sees ? listDepartments() : [],
    mine ? getClockState(mine) : null,
    mine ? todayIsWorkingDay() : null,
    mine ? getEmployeeMonth(mine, month) : null,
  ]);
  const rows = register?.rows ?? [];
  const dayClass = register?.dayClass ?? ("working" as never);

  const deptOpts = departments.map((d) => ({ _id: d._id, name: d.name }));

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "TalentOS", href: "/talentos" }, { label: "Attendance" }]}
        title={<>Attendance</>}
        description={<>{sees ? (canEdit ? "Your attendance, and record and correct the attendance of the people you manage." : "Your attendance, and the daily overview of the people you manage.") : "Clock in and out, and review your month."}</>}
      />

      <PanelListFilters>
<Tabs
        initial={tab}
        syncParam="tab"
        tabs={[
          ...(mine && clock && today && monthData ? [{
            key: "mine",
            label: "My attendance",
            content: (
              <div className="space-y-4">
                {hrCan(user, "attendance.punch") && (
                  <ClockWidget dayLabel={today.label} working={today.working} checkIn={clock.checkIn} checkOut={clock.checkOut} workedMinutes={clock.workedMinutes} locked={clock.locked} />
                )}
                <GlassCard interactive={false}>
                  <CardHeader><CardTitle>Monthly View</CardTitle></CardHeader>
                  <CardContent><AttendanceCalendar month={month} cells={monthData.cells} summary={monthData.summary} /></CardContent>
                </GlassCard>
              </div>
            ),
          }] : []),
          ...(sees ? [
          {
            key: "register",
            label: "Daily Register",
            content: (
              <AttendanceRegister
                date={date}
                dayClass={dayClass}
                rows={rows.map((r) => ({
                  employeeId: r.employeeId,
                  employeeName: r.employeeName,
                  employeeCode: r.employeeCode,
                  departmentId: r.departmentId,
                  effectiveStatus: r.effectiveStatus,
                  record: r.record
                    ? {
                        status: r.record.status,
                        checkIn: r.record.checkIn,
                        checkOut: r.record.checkOut,
                        breakMinutes: r.record.breakMinutes,
                        workedMinutes: r.record.workedMinutes,
                        isLate: r.record.isLate,
                        lateByMinutes: r.record.lateByMinutes,
                        isEarlyDeparture: r.record.isEarlyDeparture,
                        earlyByMinutes: r.record.earlyByMinutes,
                        source: r.record.source,
                        note: r.record.note,
                      }
                    : null,
                }))}
                departments={deptOpts}
                canEdit={canEdit}
              />
            ),
          },
          {
            key: "report",
            label: "Monthly Report",
            content: <MonthlyAttendanceReport month={month} rows={report} departments={deptOpts} />,
          },
          ] : []),
        ]}
      />
</PanelListFilters>
    </div>
  );
}
