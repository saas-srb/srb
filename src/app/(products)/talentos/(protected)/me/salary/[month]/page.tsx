import { redirect } from "next/navigation";

// A payslip now lives under Payroll. The old address still works.
export default async function MyPayslipRedirect({ params }: { params: Promise<{ month: string }> }) {
  redirect(`/talentos/payroll/payslip/${(await params).month}`);
}
