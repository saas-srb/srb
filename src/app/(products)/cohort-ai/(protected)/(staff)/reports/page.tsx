import PanelListFilters from "@/components/platform/panel/PanelListFilters";
import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import { redirect } from "next/navigation";
import { FileText, FileSpreadsheet, FileType } from "lucide-react";
import { CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import { buttonVariants } from "@/components/ui/button";
import { getCurrentTmsUser } from "@/lib/tms-auth";
import { canManageTraining } from "@/lib/tms-roles";
import { REPORT_TYPES } from "@/lib/products/cohort-ai/reports";

export default async function ReportsPage() {
  const user = await getCurrentTmsUser();
  if (!user || !canManageTraining(user)) redirect("/cohort-ai");

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "Cohort AI", href: "/cohort-ai" }, { label: "Reports" }]}
        title={<>Reports</>}
        description={<>Export training data to CSV, Excel or PDF.</>}
      />

      <PanelListFilters>
<div className="grid gap-4 sm:grid-cols-2">
        {REPORT_TYPES.map((r) => (
          <GlassCard key={r.value} interactive={false}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <FileText className="size-4 text-primary" />
                {r.label}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">{r.description}</p>
              <div className="flex flex-wrap gap-2">
                <a href={`/api/cohort-ai/reports/${r.value}?format=csv`} className={buttonVariants({ variant: "outline", size: "sm" })}>
                  <FileText className="size-3.5" data-icon="inline-start" />
                  CSV
                </a>
                <a href={`/api/cohort-ai/reports/${r.value}?format=xlsx`} className={buttonVariants({ variant: "outline", size: "sm" })}>
                  <FileSpreadsheet className="size-3.5" data-icon="inline-start" />
                  Excel
                </a>
                <a href={`/api/cohort-ai/reports/${r.value}?format=pdf`} className={buttonVariants({ variant: "outline", size: "sm" })}>
                  <FileType className="size-3.5" data-icon="inline-start" />
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
