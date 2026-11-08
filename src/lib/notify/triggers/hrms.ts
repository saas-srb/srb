import "server-only";
import { notify, notifyEmployee } from "@/lib/products/talentos/notifications";
import { inr, short } from "@/lib/notify/triggers/format";

/** Extra HR notifications (payroll). They go through HRMS's own store, so they appear in the HRMS bell for the right people only. */
export const hrmsEvents = {
  leaveCancelled: async (l: { id: string; employeeId: string; startDate: string; endDate: string; days: number }) => {
    const { getEmployee, employeeFullName } = await import("@/lib/products/talentos/employees");
    const e = await getEmployee(l.employeeId);
    await notify({ audience: "staff", type: "leave_cancelled", title: `Approved leave cancelled: ${e ? employeeFullName(e) : "an employee"}`, body: `${l.startDate} to ${l.endDate} (${l.days} day${l.days === 1 ? "" : "s"}) is back on the calendar.`, link: "/talentos/leave", dedupeKey: `leave-cancelled:${l.id}` });
  },
  payrollReady: (run: { id: string; month: string; employees?: number }) =>
    notify({ audience: "staff", type: "payroll_ready", title: `Payroll for ${run.month} is ready for approval`, body: run.employees ? `${run.employees} payslips were generated.` : "Review and approve the run.", link: `/talentos/payroll/${run.id}`, dedupeKey: `payroll-ready:${run.id}` }),
  salaryPaid: (p: { employeeId: string; month: string; amount: number; utr?: string | null; id: string }) =>
    notifyEmployee(p.employeeId, { type: "salary_paid", title: `Salary for ${p.month} was paid`, body: `${inr(p.amount)}${p.utr ? ` · ref ${p.utr}` : ""}`, link: `/talentos/me/salary/${p.month}`, dedupeKey: `salary-paid:${p.id}` }),
  payoutFailed: (p: { id: string; employeeName: string; month: string; reason?: string | null }) =>
    notify({ audience: "staff", type: "payout_failed", title: `Salary payout failed: ${short(p.employeeName, 40)}`, body: `${p.month} · ${short(p.reason, 120) || "No reason given"}`, link: "/talentos/payroll", dedupeKey: `payout-failed:${p.id}` }),
};
