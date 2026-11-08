import PanelListFilters from "@/components/platform/panel/PanelListFilters";
import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import Link from "next/link";
import {
  CalendarCheck,
  CalendarClock,
  CalendarDays,
  CalendarOff,
  Wallet,
  Clock,
  Flame,
  TimerReset,
  Percent,
  TrendingUp,
  PartyPopper,
  FileText,
  UserRound,
  AlertTriangle,
  CircleCheck,
} from "lucide-react";
import { CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import KpiCard from "@/components/products/dealflow-ai/KpiCard";
import KpiGrid from "@/components/products/dealflow-ai/KpiGrid";
import { Badge } from "@/components/ui/badge";
import TimeSeriesChart from "@/components/products/dealflow-ai/TimeSeriesChart";
import CategoryBarChart from "@/components/products/dealflow-ai/CategoryBarChart";
import StatusPieChart from "@/components/products/dealflow-ai/StatusPieChart";
import AttendanceOverviewChart from "@/components/products/talentos/AttendanceOverviewChart";
import AttendanceCalendar from "@/components/products/talentos/AttendanceCalendar";
import ClockWidget from "@/components/products/talentos/ClockWidget";
import ProgressRing from "@/components/products/talentos/ProgressRing";
import LeaveStatusBadge from "@/components/products/talentos/LeaveStatusBadge";
import { getCurrentHrmsUser } from "@/lib/hrms-auth";
import { employeeFullName } from "@/lib/products/talentos/employees";
import { masterLookups } from "@/lib/products/talentos/departments";
import { getEmployeeDashboard } from "@/lib/products/talentos/dashboard-me";
import { payrollRunStatusMeta, monthLabelLong } from "@/lib/products/talentos/payroll-status";
import { formatCurrency, formatDate } from "@/lib/utils";
import { getCompanyBrand } from "@/lib/platform/branding";

const LEAVE_COLORS: Record<string, string> = {
  casual: "var(--brand-deep)",
  sick: "#f59e0b",
  earned: "#22c55e",
  wfh: "color-mix(in srgb, var(--brand-deep) 45%, white)",
  unpaid: "#94a3b8",
};
const PUNCTUALITY_COLORS: Record<string, string> = { on_time: "#22c55e", late: "#f59e0b" };

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4 rounded-3xl border border-border/50 bg-muted/70 p-5 sm:p-6 dark:border-border/40 dark:bg-transparent">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-lg font-semibold text-foreground">{title}</h2>
        {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      </div>
      {children}
    </section>
  );
}

function toneForRate(rate: number): "green" | "amber" | "red" {
  return rate >= 95 ? "green" : rate >= 85 ? "amber" : "red";
}

export default async function MeDashboard() {
  const brand = await getCompanyBrand();
  const user = await getCurrentHrmsUser();
  const employeeId = user!.employeeId!;

  const [data, lookups] = await Promise.all([getEmployeeDashboard(employeeId), masterLookups()]);
  if (!data) {
    return <p className="text-sm text-muted-foreground">Your employee record could not be loaded.</p>;
  }

  const {
    employee,
    monthStr,
    clock,
    todayWorking,
    thisMonth,
    attendanceRate,
    attendanceRatePrev,
    punctuality,
    currentStreak,
    monthlyAttendance,
    monthlyHours,
    calendar,
    year,
    leaveBalances,
    leaveUsageByType,
    leaveTotals,
    leaveHistory,
    upcomingLeave,
    netPayTrend,
    latestPayslip,
    payBreakdown,
    ytd,
    recentPayouts,
    upcomingHolidays,
    nextHoliday,
    tenure,
    nextMilestone,
    profileCompleteness,
    docsExpiringSoon,
    documentCount,
  } = data;

  const name = employeeFullName(employee);
  const designation = lookups.designationTitle(employee.professional?.designationId);
  const department = lookups.departmentName(employee.professional?.departmentId);
  const onTimePct = punctuality.onTime + punctuality.late > 0
    ? Math.round((punctuality.onTime / (punctuality.onTime + punctuality.late)) * 100)
    : 100;

  return (
    <div className="space-y-8">
      {/* Header */}
      <PanelPageHeader
        title={<>Hi, {name.split(" ")[0]}</>}
        description={<>{employee.employeeCode} · {designation} · {department} · {tenure.label} at {brand.name}</>}
        actions={<><div className="flex flex-wrap gap-2">
          <Link href="/talentos/me/salary" className="text-xs font-medium text-primary hover:underline">Payslips →</Link>
          <Link href="/talentos/me/leave" className="text-xs font-medium text-primary hover:underline">Apply leave →</Link>
        </div></>}
      />

      <PanelListFilters>
<ClockWidget
        dayLabel={todayWorking.label}
        working={todayWorking.working}
        checkIn={clock.checkIn}
        checkOut={clock.checkOut}
        workedMinutes={clock.workedMinutes}
        locked={clock.locked}
      />

      {/* KPIs */}
      <Section title="At a glance" hint={thisMonth.label}>
        <KpiGrid>
          <KpiCard
            label="Attendance rate"
            value={attendanceRate}
            suffix="%"
            accent
            trend={attendanceRate - attendanceRatePrev}
            icon={<Percent className="size-4" />}
          />
          <KpiCard label="Days present" value={`${thisMonth.present}${thisMonth.halfDay ? ` + ${thisMonth.halfDay}½` : ""} / ${thisMonth.workingDays}`} icon={<CalendarCheck className="size-4" />} />
          <KpiCard label="Late check-ins" value={thisMonth.lateCount} tone={thisMonth.lateCount > 0 ? "down" : undefined} icon={<CalendarClock className="size-4" />} />
          <KpiCard label="Avg hours / day" value={thisMonth.avgWorkedMinutes} format="duration" icon={<Clock className="size-4" />} />
          <KpiCard label="Attendance streak" value={currentStreak} suffix={currentStreak === 1 ? " day" : " days"} icon={<Flame className="size-4" />} />
          <KpiCard label="Leave available" value={leaveTotals.available} icon={<CalendarDays className="size-4" />} />
          <KpiCard label={`Leave used (${year})`} value={leaveTotals.usedYtd} icon={<CalendarOff className="size-4" />} />
          <KpiCard
            label="Latest net pay"
            value={latestPayslip ? latestPayslip.payslip.netPay : ("—" as const)}
            format="currency"
            icon={<Wallet className="size-4" />}
          />
        </KpiGrid>
      </Section>

      {/* Attendance */}
      <Section title="Attendance" hint="Last 6 months">
        <div className="grid gap-4 lg:grid-cols-3">
          <GlassCard interactive={false}>
            <CardHeader><CardTitle>This month</CardTitle></CardHeader>
            <CardContent className="flex justify-center py-2">
              <ProgressRing value={attendanceRate} tone={toneForRate(attendanceRate)} label="attendance rate" sublabel={`${thisMonth.present}/${thisMonth.workingDays} days`} />
            </CardContent>
          </GlassCard>
          <GlassCard interactive={false}>
            <CardHeader><CardTitle>Punctuality</CardTitle></CardHeader>
            <CardContent>
              <StatusPieChart
                data={[
                  { status: "on_time", label: "On time", count: punctuality.onTime },
                  { status: "late", label: "Late", count: punctuality.late },
                ]}
                colors={PUNCTUALITY_COLORS}
              />
            </CardContent>
          </GlassCard>
          <GlassCard interactive={false}>
            <CardHeader><CardTitle>Signals</CardTitle></CardHeader>
            <CardContent className="space-y-2.5 pt-1 text-sm">
              <Row icon={<TrendingUp className="size-4 text-green-600 dark:text-green-400" />} label="On-time rate" value={`${onTimePct}%`} />
              <Row icon={<TimerReset className="size-4 text-amber-600 dark:text-amber-400" />} label="Avg late (when late)" value={punctuality.avgLateMinutes > 0 ? `${punctuality.avgLateMinutes} min` : "—"} />
              <Row icon={<Flame className="size-4 text-primary" />} label="Current streak" value={`${currentStreak} day${currentStreak === 1 ? "" : "s"}`} />
              <Row icon={<CalendarOff className="size-4 text-destructive" />} label="Absent this month" value={String(thisMonth.absent)} />
              <Row icon={<CalendarDays className="size-4 text-primary" />} label="On leave this month" value={String(thisMonth.onLeave)} />
            </CardContent>
          </GlassCard>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <GlassCard interactive={false}>
            <CardHeader><CardTitle>Attendance trend</CardTitle></CardHeader>
            <CardContent><AttendanceOverviewChart data={monthlyAttendance} /></CardContent>
          </GlassCard>
          <GlassCard interactive={false}>
            <CardHeader><CardTitle>Average hours worked</CardTitle></CardHeader>
            <CardContent><TimeSeriesChart data={monthlyHours} /></CardContent>
          </GlassCard>
        </div>

        <GlassCard interactive={false}>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle>{calendar.summary.workingDays}-day month</CardTitle>
            <Link href="/talentos/me/attendance" className="text-xs text-primary hover:underline">Full history</Link>
          </CardHeader>
          <CardContent>
            <AttendanceCalendar month={monthStr} cells={calendar.cells} summary={calendar.summary} readOnly />
          </CardContent>
        </GlassCard>
      </Section>

      {/* Leave */}
      <Section title="Leave" hint={`${year} · ${leaveTotals.pending} pending`}>
        <div className="grid gap-4 lg:grid-cols-2">
          <GlassCard interactive={false}>
            <CardHeader><CardTitle>Balance by type</CardTitle></CardHeader>
            <CardContent>
              <CategoryBarChart data={leaveBalances.filter((b) => b.allocated > 0).map((b) => ({ label: b.label.replace(/ Leave$/, ""), value: Math.max(0, b.available) }))} />
            </CardContent>
          </GlassCard>
          <GlassCard interactive={false}>
            <CardHeader><CardTitle>Days taken by type</CardTitle></CardHeader>
            <CardContent>
              {leaveUsageByType.length > 0 ? (
                <StatusPieChart data={leaveUsageByType} colors={LEAVE_COLORS} />
              ) : (
                <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">No leave taken this year.</div>
              )}
            </CardContent>
          </GlassCard>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <GlassCard interactive={false}>
            <CardHeader><CardTitle>Upcoming time off</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {upcomingLeave.length === 0 && <p className="text-sm text-muted-foreground">Nothing scheduled.</p>}
              {upcomingLeave.map((r) => (
                <div key={r._id} className="flex items-center justify-between gap-3 rounded-lg border border-border/60 p-3 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{r.leaveTypeLabel}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(r.startDate)}{r.startDate !== r.endDate ? ` – ${formatDate(r.endDate)}` : ""} · {r.days}d
                    </p>
                  </div>
                  <LeaveStatusBadge status={r.status} />
                </div>
              ))}
            </CardContent>
          </GlassCard>
          <GlassCard interactive={false}>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle>Recent requests</CardTitle>
              <Link href="/talentos/me/leave" className="text-xs text-primary hover:underline">Manage</Link>
            </CardHeader>
            <CardContent className="space-y-2">
              {leaveHistory.length === 0 && <p className="text-sm text-muted-foreground">No requests yet.</p>}
              {leaveHistory.map((r) => (
                <div key={r._id} className="flex items-center justify-between gap-3 rounded-lg border border-border/60 p-3 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{r.leaveTypeLabel} · {r.days}d</p>
                    <p className="truncate text-xs text-muted-foreground">{formatDate(r.startDate)}</p>
                  </div>
                  <LeaveStatusBadge status={r.status} />
                </div>
              ))}
            </CardContent>
          </GlassCard>
        </div>
      </Section>

      {/* Salary */}
      <Section title="Salary & payments" hint={ytd.months > 0 ? `${ytd.months} payslip${ytd.months === 1 ? "" : "s"} in ${year}` : undefined}>
        <KpiGrid>
          <KpiCard label={`Gross (${year})`} value={ytd.gross} format="currency" icon={<Wallet className="size-4" />} />
          <KpiCard label={`Deductions (${year})`} value={ytd.deductions} format="currency" icon={<TimerReset className="size-4" />} />
          <KpiCard label={`Net (${year})`} value={ytd.net} format="currency" accent icon={<CircleCheck className="size-4" />} />
          <KpiCard
            label="Avg net / month"
            value={ytd.months > 0 ? Math.round(ytd.net / ytd.months) : ("—" as const)}
            format="currency"
            icon={<Percent className="size-4" />}
          />
        </KpiGrid>

        <div className="grid gap-4 lg:grid-cols-2">
          <GlassCard interactive={false}>
            <CardHeader><CardTitle>Net pay trend</CardTitle></CardHeader>
            <CardContent><TimeSeriesChart data={netPayTrend} /></CardContent>
          </GlassCard>
          <GlassCard interactive={false}>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle>Latest payslip{latestPayslip ? ` · ${monthLabelLong(latestPayslip.payslip.month)}` : ""}</CardTitle>
              {latestPayslip && (
                <Link href={`/talentos/me/salary/${latestPayslip.payslip.month}`} className="text-xs text-primary hover:underline">Open</Link>
              )}
            </CardHeader>
            <CardContent>
              {latestPayslip ? (
                <>
                  <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
                    <span className="text-muted-foreground">Gross {formatCurrency(latestPayslip.payslip.grossPay)}</span>
                    <span className="text-muted-foreground">·</span>
                    <span className="text-muted-foreground">Deductions {formatCurrency(latestPayslip.payslip.totalDeductions)}</span>
                    <Badge className={payrollRunStatusMeta(latestPayslip.run.status).badgeClass}>{payrollRunStatusMeta(latestPayslip.run.status).label}</Badge>
                  </div>
                  <CategoryBarChart data={payBreakdown.map((p) => ({ label: p.label.replace(/^Provident Fund$/, "PF").replace(/^Professional Tax$/, "PT"), value: p.value }))} />
                </>
              ) : (
                <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">No payslips published yet.</div>
              )}
            </CardContent>
          </GlassCard>
        </div>

        <GlassCard interactive={false}>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle>Recent payments</CardTitle>
            <Link href="/talentos/me/salary" className="text-xs text-primary hover:underline">All payments</Link>
          </CardHeader>
          <CardContent className="space-y-2">
            {recentPayouts.length === 0 && <p className="text-sm text-muted-foreground">No salary payments recorded yet.</p>}
            {recentPayouts.map((p) => (
              <div key={p._id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/60 p-3 text-sm">
                <div>
                  <p className="font-medium">{monthLabelLong(p.month)}</p>
                  <p className="text-xs text-muted-foreground">
                    {p.bankAccountLast4 ? `A/C ••${p.bankAccountLast4}` : "—"}
                    {p.utr ? ` · UTR ${p.utr}` : ""}
                    {p.paidAt ? ` · ${formatDate(p.paidAt)}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-semibold tabular-nums text-foreground">{formatCurrency(p.paymentAmount)}</span>
                  <Badge className={p.status === "paid" ? "bg-green-500/15 text-green-600 dark:text-green-400" : p.status === "failed" ? "bg-destructive/15 text-destructive" : "bg-secondary/60 text-secondary-foreground"}>
                    {p.status}
                  </Badge>
                </div>
              </div>
            ))}
          </CardContent>
        </GlassCard>
      </Section>

      {/* Holidays, milestones, profile */}
      <Section title="Holidays, milestones & profile">
        <div className="grid gap-4 lg:grid-cols-3">
          <GlassCard interactive={false}>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle>Upcoming holidays</CardTitle>
              <Link href="/talentos/holidays" className="text-xs text-primary hover:underline">Calendar</Link>
            </CardHeader>
            <CardContent className="space-y-2">
              {upcomingHolidays.length === 0 && <p className="text-sm text-muted-foreground">No holidays left this year.</p>}
              {upcomingHolidays.map((h) => (
                <div key={h._id} className="flex items-center justify-between gap-3 text-sm">
                  <span className="min-w-0 truncate text-muted-foreground">{h.name}</span>
                  <span className="shrink-0 font-medium text-foreground">{formatDate(h.date)}</span>
                </div>
              ))}
              {nextHoliday && (
                <p className="pt-1 text-xs text-muted-foreground">
                  <CalendarCheck className="mr-1 inline size-3" />
                  {nextHoliday.name} is {nextHoliday.daysAway === 0 ? "today" : `in ${nextHoliday.daysAway} day${nextHoliday.daysAway === 1 ? "" : "s"}`}.
                </p>
              )}
            </CardContent>
          </GlassCard>

          <GlassCard interactive={false}>
            <CardHeader><CardTitle>You at {brand.name}</CardTitle></CardHeader>
            <CardContent className="space-y-2.5 pt-1 text-sm">
              <Row icon={<CalendarCheck className="size-4 text-primary" />} label="Joined" value={employee.professional?.joiningDate ? formatDate(employee.professional.joiningDate) : "—"} />
              <Row icon={<TrendingUp className="size-4 text-green-600 dark:text-green-400" />} label="Tenure" value={`${tenure.label} · ${tenure.totalDays} days`} />
              {nextMilestone ? (
                <Row
                  icon={<PartyPopper className="size-4 text-amber-600 dark:text-amber-400" />}
                  label={nextMilestone.label}
                  value={nextMilestone.daysAway === 0 ? "today" : `${formatDate(nextMilestone.date)} · ${nextMilestone.daysAway}d`}
                />
              ) : null}
              <Row icon={<FileText className="size-4 text-muted-foreground" />} label="Documents on file" value={String(documentCount)} />
            </CardContent>
          </GlassCard>

          <GlassCard interactive={false}>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle>Profile</CardTitle>
              <Link href="/talentos/me/profile" className="text-xs text-primary hover:underline">Update</Link>
            </CardHeader>
            <CardContent className="flex flex-col items-center gap-3 py-2">
              <ProgressRing value={profileCompleteness} tone={profileCompleteness >= 100 ? "green" : profileCompleteness >= 60 ? "amber" : "red"} label="profile complete" size={116} stroke={10} />
              {docsExpiringSoon.length > 0 ? (
                <p className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
                  <AlertTriangle className="size-3.5" />
                  {docsExpiringSoon.length} document{docsExpiringSoon.length === 1 ? "" : "s"} expiring within 45 days
                </p>
              ) : (
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <CircleCheck className="size-3.5" /> No documents expiring soon
                </p>
              )}
            </CardContent>
          </GlassCard>
        </div>
      </Section>

      {/* Quick links */}
      <Section title="Quick links">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {[
            { href: "/talentos/me/attendance", label: "Attendance", icon: CalendarClock },
            { href: "/talentos/me/leave", label: "Apply leave", icon: CalendarDays },
            { href: "/talentos/me/salary", label: "Payslips", icon: Wallet },
            { href: "/talentos/me/documents", label: "Documents", icon: FileText },
            { href: "/talentos/me/profile", label: "My profile", icon: UserRound },
            { href: "/talentos/me/directory", label: "Directory", icon: PartyPopper },
          ].map((q) => (
            <Link key={q.href} href={q.href} className="flex flex-col items-center gap-1.5 rounded-xl border border-border/60 p-4 text-center text-sm transition-colors hover:bg-muted/50 hover:text-primary">
              <q.icon className="size-5 text-muted-foreground" />
              {q.label}
            </Link>
          ))}
        </div>
      </Section>
</PanelListFilters>
    </div>
  );
}

function Row({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="flex items-center gap-2 text-muted-foreground">{icon}{label}</span>
      <span className="shrink-0 font-medium text-foreground tabular-nums">{value}</span>
    </div>
  );
}
