import type { Metadata } from "next";
import { AlertOctagon, AlertTriangle, Building2, Gauge } from "lucide-react";
import KpiCard from "@/components/products/dealflow-ai/KpiCard";
import KpiGrid from "@/components/products/dealflow-ai/KpiGrid";
import PlatformPageHeader from "@/components/platform/panel/PlatformPageHeader";
import { requirePlatformPermission } from "@/lib/platform/console/access";
import { listCompanyUsage, NEAR_LIMIT_RATIO } from "@/lib/platform/billing/usage-report";
import { usagePeriod } from "@/lib/platform/billing/usage";
import UsageTable from "./UsageTable";

export const metadata: Metadata = { title: "Usage & limits" };

export default async function PlatformUsagePage() {
  await requirePlatformPermission("usage.read");
  const period = usagePeriod();
  const rows = await listCompanyUsage(period);
  const over = rows.filter((r) => r.level === "over").length;
  const near = rows.filter((r) => r.level === "near").length;
  const aiTotal = rows.reduce((s, r) => s + r.aiTokens.used, 0);

  return (
    <div className="space-y-6 p-1">
      <PlatformPageHeader
        title="Usage & limits"
        description={`Seats, AI tokens (${period}) and storage per company against its plan and add-ons. "Near" = ${Math.round(NEAR_LIMIT_RATIO * 100)}% or more of a limit.`}
      />
      <KpiGrid cols={4}>
        <KpiCard label="Companies" value={rows.length} icon={<Building2 className="size-4" />} />
        <KpiCard label="Over a limit" value={over} icon={<AlertOctagon className="size-4" />} />
        <KpiCard label="Near a limit" value={near} icon={<AlertTriangle className="size-4" />} />
        <KpiCard label="AI tokens this month" value={aiTotal} icon={<Gauge className="size-4" />} />
      </KpiGrid>
      <UsageTable rows={rows} period={period} />
    </div>
  );
}
