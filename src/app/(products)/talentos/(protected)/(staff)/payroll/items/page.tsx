import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import { redirect } from "next/navigation";
import PayrollItemsManager from "@/components/products/talentos/PayrollItemsManager";
import { getCurrentHrmsUser } from "@/lib/hrms-auth";
import { canRunPayroll } from "@/lib/hrms-roles";
import { listEmployeeOptions } from "@/lib/products/talentos/employees";
import { listAdjustments } from "@/lib/products/talentos/payroll-adjustments";
import { listLoans } from "@/lib/products/talentos/payroll-loans";
import { listSettlements } from "@/lib/products/talentos/payroll-settlements";

export default async function PayrollItemsPage() {
  const user = await getCurrentHrmsUser();
  if (!user || !canRunPayroll(user)) redirect("/talentos");

  const [employees, adjustments, loans, settlements] = await Promise.all([listEmployeeOptions(), listAdjustments(), listLoans(), listSettlements()]);

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "TalentOS", href: "/talentos" }, { label: "Payroll", href: "/talentos/payroll" }, { label: "Payroll items" }]}
        title={<>Payroll items</>}
        description={<>One-off earnings and recoveries, loans and advances, and full and final settlements. Payroll runs pick these up automatically.</>}
      />
      <PayrollItemsManager
        employees={employees}
        defaultMonth={new Date().toISOString().slice(0, 7)}
        adjustments={adjustments.map((a) => ({ _id: a._id, employeeId: a.employeeId, month: a.month, kind: a.kind, category: a.category, name: a.name, amount: a.amount, status: a.status }))}
        loans={loans.map((l) => ({ _id: l._id, employeeId: l.employeeId, name: l.name, principal: l.principal, emi: l.emi, startMonth: String(l.startMonth), balance: l.balance, status: l.status }))}
        settlements={settlements.map((s) => ({ _id: s._id, employeeId: s.employeeId, reason: s.reason, exitDate: s.exitDate, month: s.month, leaveDaysToEncash: s.leaveDaysToEncash, noticeShortfallDays: s.noticeShortfallDays, payGratuity: s.payGratuity, fixedTerm: s.fixedTerm, otherEarnings: s.otherEarnings, otherRecoveries: s.otherRecoveries, note: s.note, status: s.status }))}
      />
    </div>
  );
}
