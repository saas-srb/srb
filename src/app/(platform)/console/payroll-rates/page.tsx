import type { Metadata } from "next";
import PlatformPageHeader from "@/components/platform/panel/PlatformPageHeader";
import { can, requirePlatformPermission } from "@/lib/platform/console/access";
import { listRateEntries } from "@/lib/products/talentos/payroll/rates-store";
import RatesManager from "./RatesManager";

export const metadata: Metadata = { title: "Payroll rates" };
export const dynamic = "force-dynamic";

export default async function PayrollRatesPage() {
  const user = await requirePlatformPermission("settings.read");
  const entries = await listRateEntries();
  const pending = entries.filter((e) => !e.confirmed).length;
  return (
    <div className="space-y-6 p-1">
      <PlatformPageHeader
        title="Payroll rates"
        description="Income tax slabs, PF, ESI, gratuity, bonus, professional tax and labour welfare rates are set by law, so they live here once for every company, not in each company's settings. A table you publish applies to all payroll runs straight away."
        crumbs={[{ label: "Administration" }]}
      />
      <div className={`rounded-lg border p-4 text-sm ${pending ? "border-amber-500/40 bg-amber-500/10" : "border-emerald-500/40 bg-emerald-500/10"}`}>
        {pending ? (
          <p><span className="font-medium">{pending} table(s) have not been checked.</span> Payroll still uses them but every payslip made on one carries a warning. Compare each with the current official notification, correct it if needed, and confirm it.</p>
        ) : (
          <p className="font-medium">Every table has been confirmed.</p>
        )}
      </div>
      <RatesManager entries={entries} canEdit={can(user, "settings.manage")} />
    </div>
  );
}
