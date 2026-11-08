import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import { redirect } from "next/navigation";
import StatutoryDues from "@/components/products/talentos/StatutoryDues";
import { getCurrentHrmsUser } from "@/lib/hrms-auth";
import { canRunPayroll } from "@/lib/hrms-roles";
import { todayDateString } from "@/lib/products/talentos/settings";
import { upcomingReturns } from "@/lib/products/talentos/payroll/dues";
import { dueOverview, duesForMonth } from "@/lib/products/talentos/statutory-dues";
import { payingAccounts, suggestedAccountId } from "@/lib/products/talentos/payroll-bank";

export default async function CompliancePage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const user = await getCurrentHrmsUser();
  if (!user || !canRunPayroll(user)) redirect("/talentos");
  const sp = await searchParams;
  const overview = await dueOverview();
  const month = /^\d{4}-\d{2}$/.test(sp.month ?? "") ? sp.month! : (overview[0]?.month ?? todayDateString().slice(0, 7));
  const data = await duesForMonth(month);
  const accounts = await payingAccounts();
  const defaultAccountId = await suggestedAccountId(accounts);

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "TalentOS", href: "/talentos" }, { label: "Payroll", href: "/talentos/payroll" }, { label: "Government payments" }]}
        title={<>Government payments</>}
        description={<>What the company owes EPFO, ESIC, the income-tax department and the state out of each payroll month, when it is due, and what has been paid.</>}
      />
      <StatutoryDues month={month} runId={data?.runId ?? null} dues={data?.dues ?? []} overview={overview} deadlines={upcomingReturns(todayDateString())} accounts={accounts.map((a) => ({ _id: a._id, label: a.label, balance: a.balance }))} defaultAccountId={defaultAccountId} />
    </div>
  );
}
