import PanelListFilters from "@/components/platform/panel/PanelListFilters";
import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Banknote } from "lucide-react";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import PayrollRunManager from "@/components/products/talentos/PayrollRunManager";
import { buttonVariants } from "@/components/ui/button";
import { getCurrentHrmsUser } from "@/lib/hrms-auth";
import { canRunPayroll } from "@/lib/hrms-roles";
import { listRuns, serializeRun } from "@/lib/products/talentos/payroll-run";
import { payingAccounts } from "@/lib/products/talentos/payroll-bank";

export default async function PayrollPage() {
  const user = await getCurrentHrmsUser();
  if (!user || !canRunPayroll(user)) redirect("/talentos");

  const runs = (await listRuns()).map(serializeRun);
  const hasAccount = (await payingAccounts()).length > 0;

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "TalentOS", href: "/talentos" }, { label: "Payroll" }]}
        title={<>Payroll</>}
        description={<>Generate monthly runs, review payslips, and approve. Disbursement happens under Salary Payouts.</>}
        actions={<><Link href="/commandos/settings/payments#payroll-bank" className={buttonVariants({ variant: "outline", size: "sm" })}>Razorpay and bank</Link><Link href="/talentos/payroll/items" className={buttonVariants({ variant: "outline", size: "sm" })}>Payroll items</Link><Link href="/talentos/payroll/compliance" className={buttonVariants({ variant: "outline", size: "sm" })}>Government payments</Link><Link href="/talentos/payroll/declarations" className={buttonVariants({ variant: "outline", size: "sm" })}>Tax declarations</Link><Link href="/talentos/payroll/payouts" className={buttonVariants({ variant: "outline", size: "sm" })}>
          <Banknote className="size-3.5" data-icon="inline-start" />
          Salary Payouts
        </Link></>}
      />

      {!hasAccount && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
          <span className="font-medium">Add your company&apos;s current account.</span> It tops up RazorpayX and pays government dues, and each payment is recorded against it.{" "}
          <Link href="/commandos/settings/payments#payroll-bank" className="font-medium underline">Add the account</Link>
        </div>
      )}

      <PanelListFilters>
<PayrollRunManager
        runs={runs.map((r) => ({
          _id: r._id,
          month: r.month,
          status: r.status,
          payslipCount: r.payslipCount,
          totalGross: r.totalGross,
          totalNet: r.totalNet,
          totalEmployerCost: r.totalEmployerCost,
          generatedAt: r.generatedAt,
        }))}
      />
</PanelListFilters>
    </div>
  );
}
