import PanelListFilters from "@/components/platform/panel/PanelListFilters";
import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import { redirect } from "next/navigation";
import { FileText, FileSpreadsheet, FileDown } from "lucide-react";
import { CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import { buttonVariants } from "@/components/ui/button";
import { getCurrentPrmsUser } from "@/lib/prms-auth";
import { canViewReports } from "@/lib/prms-roles";
import { REPORT_TYPES } from "@/lib/products/spendiq/reports";

const DESCRIPTIONS: Record<string, string> = {
  expense: "Every operational expense with category, vendor, amount, GST and approval status.",
  procurement: "All purchase orders with vendor, line count, value and lifecycle status.",
  vendor: "Vendor directory with category, GSTIN, rating and total PO spend.",
  budget: "Budgets by level with allocation, computed consumption and utilisation.",
  asset: "Fixed-asset register with purchase cost, current book value and assignee.",
  saas: "SaaS subscriptions with license counts, monthly / annual cost and renewal dates.",
  infrastructure: "Servers, hosting and storage with monthly cost and renewal dates.",
  inventory: "Consumable stock with on-hand quantity, minimum levels and stock value.",
  invoice: "Accounts-payable ledger with net payable, TDS, amount paid and status.",
  "profit-center": "Department-wise spend combining approved expenses and purchase orders.",
};

export default async function ReportsPage() {
  const user = await getCurrentPrmsUser();
  if (!user || !canViewReports(user)) redirect("/spendiq");

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "SpendIQ", href: "/spendiq" }, { label: "Reports & Analytics" }]}
        title={<>Reports &amp; Analytics</>}
        description={<>Download enterprise reports as CSV, Excel or PDF.</>}
      />

      <PanelListFilters>
<div className="grid gap-4 md:grid-cols-2">
        {REPORT_TYPES.map((r) => (
          <GlassCard key={r.value} interactive={false}>
            <CardContent className="space-y-3 py-4">
              <div>
                <p className="text-sm font-semibold text-foreground">{r.label}</p>
                <p className="text-xs text-muted-foreground">{DESCRIPTIONS[r.value]}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <a href={`/api/spendiq/reports/${r.value}?format=csv`} className={buttonVariants({ variant: "outline", size: "sm" })}>
                  <FileText className="size-3.5" data-icon="inline-start" />
                  CSV
                </a>
                <a href={`/api/spendiq/reports/${r.value}?format=xlsx`} className={buttonVariants({ variant: "outline", size: "sm" })}>
                  <FileSpreadsheet className="size-3.5" data-icon="inline-start" />
                  Excel
                </a>
                <a href={`/api/spendiq/reports/${r.value}?format=pdf`} className={buttonVariants({ variant: "outline", size: "sm" })}>
                  <FileDown className="size-3.5" data-icon="inline-start" />
                  PDF
                </a>
              </div>
            </CardContent>
          </GlassCard>
        ))}
      </div>
</PanelListFilters>
    </div>
  );
}
