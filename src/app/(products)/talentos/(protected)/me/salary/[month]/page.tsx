import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import PayslipView from "@/components/products/talentos/PayslipView";
import { getCurrentHrmsUser } from "@/lib/hrms-auth";
import { payslipsForEmployee } from "@/lib/products/talentos/payroll-run";
import { getPayslipPdfData } from "@/lib/products/talentos/payslip-pdf";

export default async function MyPayslipPage({ params }: { params: Promise<{ month: string }> }) {
  const user = await getCurrentHrmsUser();
  const employeeId = user!.employeeId!;
  const { month } = await params;

  const entry = (await payslipsForEmployee(employeeId)).find((e) => e.payslip.month === month);
  if (!entry) notFound();

  const d = await getPayslipPdfData(entry.payslip._id);
  if (!d || d.employeeId !== employeeId) notFound();

  return (
    <div className="space-y-4">
      <div className="print:hidden">
        <PanelPageHeader
          breadcrumbs={[{ label: "TalentOS", href: "/talentos/me" }, { label: "Salary", href: "/talentos/me/salary" }, { label: month }]}
          title={<>Payslip · {month}</>}
          description={<>Your earnings and deductions for this month. Print or download it from below.</>}
          actions={
            <Link href="/talentos/me/salary" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
              <ChevronLeft className="size-4" /> Back to payslips
            </Link>
          }
        />
      </div>
      <PayslipView
        data={{
          payslipId: d.payslipId,
          month: d.month,
          employeeName: d.employee.name,
          employeeCode: d.employee.code,
          workingDays: d.period.workingDays,
          lopDays: d.period.lopDays,
          earnings: d.earnings,
          grossPay: d.grossPay,
          deductions: d.deductions,
          totalDeductions: d.totalDeductions,
          employerContributions: d.employerContributions,
          employerCost: d.employerCost,
          netPay: d.netPay,
          bankAccountLast4: d.payment?.accountMasked ? d.payment.accountMasked.slice(-4) : null,
          bankName: d.payment?.bankName ?? null,
          ifsc: d.payment?.ifsc ?? null,
          runStatus: d.runStatus,
          monthDays: d.period.monthDays,
          daysPaid: d.period.daysPaid,
          notes: d.period.notes,
          tax: d.tax,
          netInWords: d.netInWords,
          company: {
            name: d.company.name,
            legalName: d.company.legalName,
            address: d.company.address,
            email: d.company.email,
            phone: d.company.phone,
            registrations: d.company.registrations,
          },
          employee: {
            designation: d.employee.designation,
            department: d.employee.department,
            location: d.employee.location,
            joiningDate: d.employee.joiningDate,
            pan: d.employee.pan,
            uan: d.employee.uan,
            pfNumber: d.employee.pfNumber,
            esiNumber: d.employee.esiNumber,
          },
          payment: d.payment
            ? { mode: d.payment.mode, status: d.payment.status, utr: d.payment.utr, paidOn: d.payment.paidOn }
            : null,
        }}
      />
    </div>
  );
}
