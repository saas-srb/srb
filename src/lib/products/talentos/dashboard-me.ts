import "server-only";
import { getEmployee, type Employee } from "@/lib/products/talentos/employees";
import { getEmployeeMonth } from "@/lib/products/talentos/attendance";
import { getClockState, todayIsWorkingDay } from "@/lib/products/talentos/self-service";
import { getBalances, getEmployeeLeaveHistory, currentYear, type BalanceView } from "@/lib/products/talentos/leave";
import { payslipsForEmployee, type Payslip, type PayrollRun } from "@/lib/products/talentos/payroll-run";
import { payoutsForEmployee, type SalaryPayout } from "@/lib/products/talentos/salary-payouts";
import { listHolidays, type Holiday } from "@/lib/products/talentos/holidays";
import { listDocuments, type EmployeeDocument } from "@/lib/products/talentos/documents";
import { todayDateString, shiftMonth, monthLabel } from "@/lib/products/talentos/time";

/**
 * Everything the employee self-service dashboard (`/talentos/me`) needs, aggregated
 * server-side into one payload. Read-only — never touches another employee's id.
 */

const TREND_MONTHS = 6;

export interface AttendanceMonthPoint {
  date: string; // "Jul"
  present: number;
  half_day: number;
  absent: number;
  on_leave: number;
}
export interface HoursPoint {
  date: string; // "Jul"
  count: number; // avg worked hours that month, 1dp
}
export interface NetPayPoint {
  date: string; // "Jul"
  count: number; // net pay
}

export interface EmployeeDashboard {
  employee: Employee;
  monthStr: string; // "yyyy-mm" (current month)
  clock: Awaited<ReturnType<typeof getClockState>>;
  todayWorking: Awaited<ReturnType<typeof todayIsWorkingDay>>;

  // Attendance
  thisMonth: { label: string; present: number; halfDay: number; absent: number; onLeave: number; lateCount: number; workingDays: number; avgWorkedMinutes: number };
  attendanceRate: number; // %, this month
  attendanceRatePrev: number; // %, last month (for the trend badge)
  punctuality: { onTime: number; late: number; avgLateMinutes: number };
  currentStreak: number; // consecutive present/half working days ending today
  monthlyAttendance: AttendanceMonthPoint[];
  monthlyHours: HoursPoint[];
  calendar: Awaited<ReturnType<typeof getEmployeeMonth>>;

  // Leave
  year: number;
  leaveBalances: BalanceView[];
  leaveUsageByType: { status: string; label: string; count: number }[];
  leaveTotals: { available: number; usedYtd: number; pending: number; allocated: number };
  leaveHistory: Awaited<ReturnType<typeof getEmployeeLeaveHistory>>;
  upcomingLeave: Awaited<ReturnType<typeof getEmployeeLeaveHistory>>;

  // Pay
  netPayTrend: NetPayPoint[];
  latestPayslip: { payslip: Payslip; run: PayrollRun } | null;
  payBreakdown: { label: string; value: number }[]; // latest payslip: net + each deduction
  ytd: { gross: number; deductions: number; net: number; months: number };
  recentPayouts: SalaryPayout[];

  // Holidays + profile
  upcomingHolidays: Holiday[];
  nextHoliday: { name: string; date: string; daysAway: number } | null;
  tenure: { years: number; months: number; totalDays: number; label: string };
  nextMilestone: { kind: "birthday" | "anniversary" | "probation"; label: string; date: string; daysAway: number } | null;
  profileCompleteness: number; // %
  docsExpiringSoon: EmployeeDocument[];
  documentCount: number;
}

function daysBetween(fromISO: string, toISO: string): number {
  return Math.round((Date.parse(`${toISO}T00:00:00Z`) - Date.parse(`${fromISO}T00:00:00Z`)) / 86400000);
}

function nextAnnualDate(mmdd: string, today: string): { date: string; daysAway: number } {
  const year = Number(today.slice(0, 4));
  let candidate = `${year}-${mmdd}`;
  if (candidate < today) candidate = `${year + 1}-${mmdd}`;
  return { date: candidate, daysAway: daysBetween(today, candidate) };
}

export async function getEmployeeDashboard(employeeId: string): Promise<EmployeeDashboard | null> {
  const employee = await getEmployee(employeeId);
  if (!employee) return null;

  const today = todayDateString();
  const thisMonthStr = today.slice(0, 7);
  const year = currentYear();
  const trendMonths = Array.from({ length: TREND_MONTHS }, (_, i) => shiftMonth(thisMonthStr, -(TREND_MONTHS - 1 - i)));

  const [clock, todayWorking, months, prevMonthData, balances, leaveHistoryAll, payslips, payouts, holidays, documents] = await Promise.all([
    getClockState(employeeId),
    todayIsWorkingDay(),
    Promise.all(trendMonths.map((m) => getEmployeeMonth(employeeId, m))),
    getEmployeeMonth(employeeId, shiftMonth(thisMonthStr, -1)),
    getBalances(employeeId, year),
    getEmployeeLeaveHistory(employeeId, 60),
    payslipsForEmployee(employeeId),
    payoutsForEmployee(employeeId),
    listHolidays(year),
    listDocuments(employeeId),
  ]);

  const calendar = months[months.length - 1];
  const s = calendar.summary;
  const shortLabel = (m: string) => monthLabel(m).split(" ")[0].slice(0, 3);

  // --- Attendance ---
  const rateOf = (sum: { present: number; halfDay: number; workingDays: number }) =>
    sum.workingDays > 0 ? Math.round(((sum.present + sum.halfDay * 0.5) / sum.workingDays) * 100) : 0;
  const attendanceRate = rateOf(s);
  const attendanceRatePrev = rateOf(prevMonthData.summary);

  const workedCells = calendar.cells.filter((c) => c.status === "present" || c.status === "half_day");
  const lateCells = workedCells.filter((c) => c.isLate);
  const punctuality = {
    onTime: workedCells.length - lateCells.length,
    late: lateCells.length,
    avgLateMinutes: lateCells.length > 0 ? Math.round(lateCells.reduce((a, c) => a + c.lateByMinutes, 0) / lateCells.length) : 0,
  };

  // streak: walk this month's cells backwards from today
  let currentStreak = 0;
  for (const c of [...calendar.cells].reverse()) {
    if (c.date > today) continue;
    if (c.dayClass !== "working") continue;
    if (c.status === "present" || c.status === "half_day") currentStreak += 1;
    else break;
  }

  const monthlyAttendance: AttendanceMonthPoint[] = trendMonths.map((m, i) => {
    const sm = months[i].summary;
    return { date: shortLabel(m), present: sm.present, half_day: sm.halfDay, absent: sm.absent, on_leave: sm.onLeave };
  });
  const monthlyHours: HoursPoint[] = trendMonths.map((m, i) => ({
    date: shortLabel(m),
    count: Math.round((months[i].summary.avgWorkedMinutes / 60) * 10) / 10,
  }));

  // --- Leave ---
  const leaveUsageByType = balances
    .filter((b) => b.used > 0)
    .map((b) => ({ status: b.leaveTypeCode, label: b.label, count: b.used }));
  const leaveTotals = balances.reduce(
    (acc, b) => ({
      available: acc.available + (b.paid ? Math.max(0, b.available) : 0),
      usedYtd: acc.usedYtd + b.used,
      pending: acc.pending + b.pending,
      allocated: acc.allocated + b.allocated,
    }),
    { available: 0, usedYtd: 0, pending: 0, allocated: 0 }
  );
  const leaveHistory = leaveHistoryAll.slice(0, 6);
  const upcomingLeave = leaveHistoryAll
    .filter((r) => (r.status === "approved" || r.status === "pending") && r.endDate >= today)
    .sort((a, b) => a.startDate.localeCompare(b.startDate))
    .slice(0, 5);

  // --- Pay ---
  const byMonth = new Map(payslips.map((p) => [p.payslip.month, p]));
  const netPayTrend: NetPayPoint[] = trendMonths
    .map((m) => ({ date: shortLabel(m), count: byMonth.get(m)?.payslip.netPay ?? 0 }))
    .filter((p) => p.count > 0);
  const latestPayslip = payslips[0] ?? null;
  const payBreakdown = latestPayslip
    ? [
        { label: "Net pay", value: latestPayslip.payslip.netPay },
        ...latestPayslip.payslip.deductions.map((d) => ({ label: d.name, value: d.amount })),
      ]
    : [];
  const ytdSlips = payslips.filter((p) => p.payslip.month.startsWith(String(year)));
  const ytd = {
    gross: ytdSlips.reduce((a, p) => a + p.payslip.grossPay, 0),
    deductions: ytdSlips.reduce((a, p) => a + p.payslip.totalDeductions, 0),
    net: ytdSlips.reduce((a, p) => a + p.payslip.netPay, 0),
    months: ytdSlips.length,
  };
  const recentPayouts = payouts.slice(0, 4);

  // --- Holidays ---
  const upcomingHolidays = holidays.filter((h) => h.date >= today).slice(0, 6);
  const nextHoliday = upcomingHolidays[0]
    ? { name: upcomingHolidays[0].name, date: upcomingHolidays[0].date, daysAway: daysBetween(today, upcomingHolidays[0].date) }
    : null;

  // --- Tenure / milestones ---
  const joining = employee.professional?.joiningDate ?? today;
  const totalDays = Math.max(0, daysBetween(joining, today));
  const tYears = Math.floor(totalDays / 365);
  const tMonths = Math.floor((totalDays % 365) / 30);
  const tenure = {
    years: tYears,
    months: tMonths,
    totalDays,
    label: tYears > 0 ? `${tYears}y ${tMonths}m` : `${tMonths}m`,
  };

  const milestones: { kind: "birthday" | "anniversary" | "probation"; label: string; date: string; daysAway: number }[] = [];
  if (employee.personal?.dateOfBirth) {
    const b = nextAnnualDate(employee.personal.dateOfBirth.slice(5), today);
    milestones.push({ kind: "birthday", label: "Your birthday", ...b });
  }
  if (employee.professional?.joiningDate) {
    const a = nextAnnualDate(employee.professional.joiningDate.slice(5), today);
    milestones.push({ kind: "anniversary", label: `Work anniversary (${tYears + 1} yr)`, ...a });
  }
  if (employee.status === "probation" && employee.professional?.probationEndDate && employee.professional.probationEndDate >= today) {
    milestones.push({
      kind: "probation",
      label: "Probation ends",
      date: employee.professional.probationEndDate,
      daysAway: daysBetween(today, employee.professional.probationEndDate),
    });
  }
  milestones.sort((a, b) => a.daysAway - b.daysAway);
  const nextMilestone = milestones[0] ?? null;

  // --- Profile completeness ---
  const p = employee.personal;
  const checks = [
    !!p?.phone,
    !!p?.personalEmail,
    !!p?.addressLine,
    !!p?.city,
    !!p?.dateOfBirth,
    (employee.emergencyContacts?.length ?? 0) > 0,
  ];
  const profileCompleteness = Math.round((checks.filter(Boolean).length / checks.length) * 100);

  const in45 = new Date(Date.parse(`${today}T00:00:00Z`) + 45 * 86400000).toISOString().slice(0, 10);
  const docsExpiringSoon = documents.filter((d) => d.expiryDate && d.expiryDate >= today && d.expiryDate <= in45);

  return {
    employee,
    monthStr: thisMonthStr,
    clock,
    todayWorking,
    thisMonth: {
      label: monthLabel(thisMonthStr),
      present: s.present,
      halfDay: s.halfDay,
      absent: s.absent,
      onLeave: s.onLeave,
      lateCount: s.lateCount,
      workingDays: s.workingDays,
      avgWorkedMinutes: s.avgWorkedMinutes,
    },
    attendanceRate,
    attendanceRatePrev,
    punctuality,
    currentStreak,
    monthlyAttendance,
    monthlyHours,
    calendar,
    year,
    leaveBalances: balances,
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
    documentCount: documents.length,
  };
}
