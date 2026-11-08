import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Wallet, Receipt, TrendingUp, TrendingDown, Clock, Coins, PieChart, Percent } from "lucide-react";
import { CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import KpiCard from "@/components/products/dealflow-ai/KpiCard";
import KpiGrid from "@/components/products/dealflow-ai/KpiGrid";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import { buttonVariants } from "@/components/ui/button";
import { Download } from "lucide-react";
import PmsDashboardFilters from "@/components/products/sprintos/PmsDashboardFilters";
import GroupedBarChart from "@/components/products/sprintos/GroupedBarChart";
import CategoryBarChart from "@/components/products/dealflow-ai/CategoryBarChart";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { getCurrentPmsUser } from "@/lib/pms-auth";
import { canViewCosting } from "@/lib/pms-roles";
import { getPortfolioCosting } from "@/lib/products/sprintos/costing";
import { isValidDateRangePreset, resolveDateRangePreset, type DateRangePreset } from "@/lib/date-ranges";
import { cn, formatCurrency } from "@/lib/utils";

function parseDateParam(v: string | undefined, end = false): string | undefined {
  if (!v) return undefined;
  const d = new Date(`${v}${end ? "T23:59:59.999" : "T00:00:00"}`);
  return Number.isNaN(d.getTime()) ? undefined : v;
}

export default async function CostingPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; dateFrom?: string; dateTo?: string }>;
}) {
  const sp = await searchParams;
  const user = await getCurrentPmsUser();
  if (!user || !canViewCosting(user)) redirect("/sprintos");

  const rangeParam: DateRangePreset =
    sp.range && isValidDateRangePreset(sp.range) ? sp.range : sp.dateFrom || sp.dateTo ? "custom" : "thisYear";

  let dateFrom: string | undefined;
  let dateTo: string | undefined;
  if (rangeParam === "custom") {
    dateFrom = parseDateParam(sp.dateFrom);
    dateTo = parseDateParam(sp.dateTo, true);
  } else {
    const r = resolveDateRangePreset(rangeParam)!;
    dateFrom = r.from.toISOString().slice(0, 10);
    dateTo = r.to.toISOString().slice(0, 10);
  }

  const p = await getPortfolioCosting({ dateFrom, dateTo });
  const c = (n: number) => formatCurrency(n, "INR");

  const costChart = p.projects.slice(0, 12).map((f) => ({ label: f.projectCode, a: f.estimatedCost, b: f.actualCost }));
  const hoursChart = p.projects.slice(0, 12).map((f) => ({ label: f.projectCode, a: f.estimatedHours, b: f.actualHours }));
  const profitChart = p.projects
    .slice(0, 12)
    .map((f) => ({ label: f.projectCode, value: f.profit > 0 ? f.profit : -f.loss }));
  const billableChart = [
    { label: "Billable", value: p.totalBillableHours },
    { label: "Non-billable", value: p.totalNonBillableHours },
  ];

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "SprintOS", href: "/sprintos" }, { label: "Costing" }]}
        title={<>Project Costing</>}
        description={<>Financials computed live from timesheets and team rates.</>}
        actions={<><a href={`/api/sprintos/reports/portfolio?format=xlsx${dateFrom ? `&dateFrom=${dateFrom}&dateTo=${dateTo}` : ""}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
          <Download className="size-3.5" data-icon="inline-start" />
          Export XLSX
        </a></>}
      />

      <PmsDashboardFilters
        range={rangeParam}
        dateFrom={dateFrom ?? new Date().toISOString().slice(0, 10)}
        dateTo={dateTo ?? new Date().toISOString().slice(0, 10)}
        hasActiveFilters={Boolean(sp.range || sp.dateFrom || sp.dateTo)}
      />

      <KpiGrid>
        <KpiCard label="Total Project Value" value={<span>{c(p.totalContractValue)}</span>} accent icon={<Wallet className="size-4" />} />
        <KpiCard label="Estimated Cost" value={<span>{c(p.totalEstimatedCost)}</span>} icon={<Receipt className="size-4" />} />
        <KpiCard label="Actual Cost" value={<span>{c(p.totalActualCost)}</span>} icon={<Receipt className="size-4" />} />
        <KpiCard label="Profit Margin" value={p.profitMargin} suffix="%" tone={p.profitMargin >= 0 ? "up" : "down"} icon={<Percent className="size-4" />} />
      </KpiGrid>
      <KpiGrid cols={6}>
        <KpiCard label="Est. Hours" value={p.totalEstimatedHours} icon={<Clock className="size-4" />} />
        <KpiCard label="Logged Hours" value={p.totalActualHours} icon={<Clock className="size-4" />} />
        <KpiCard label="Billable Hours" value={p.totalBillableHours} icon={<Coins className="size-4" />} />
        <KpiCard label="Non-Billable" value={p.totalNonBillableHours} icon={<Coins className="size-4" />} />
        <KpiCard label="Profit" value={<span>{c(p.totalProfit)}</span>} tone="up" icon={<TrendingUp className="size-4" />} />
        <KpiCard label="Loss" value={<span>{c(p.totalLoss)}</span>} tone="down" icon={<TrendingDown className="size-4" />} />
      </KpiGrid>

      <div className="grid gap-4 lg:grid-cols-2">
        <GlassCard>
          <CardHeader><CardTitle>Estimated vs Actual Cost</CardTitle></CardHeader>
          <CardContent><GroupedBarChart data={costChart} aName="Estimated" bName="Actual" /></CardContent>
        </GlassCard>
        <GlassCard>
          <CardHeader><CardTitle>Estimated vs Actual Hours</CardTitle></CardHeader>
          <CardContent><GroupedBarChart data={hoursChart} aName="Estimated" bName="Actual" /></CardContent>
        </GlassCard>
        <GlassCard>
          <CardHeader><CardTitle className="flex items-center gap-2"><PieChart className="size-4" /> Project Profit / Loss</CardTitle></CardHeader>
          <CardContent><CategoryBarChart data={profitChart} /></CardContent>
        </GlassCard>
        <GlassCard>
          <CardHeader><CardTitle>Billable vs Non-Billable Hours</CardTitle></CardHeader>
          <CardContent><CategoryBarChart data={billableChart} /></CardContent>
        </GlassCard>
      </div>

      <GlassCard interactive={false}>
        <CardHeader><CardTitle>Project-wise Profit Analysis</CardTitle></CardHeader>
        <CardContent className="max-h-[60vh] overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Project</TableHead>
                <TableHead>Value</TableHead>
                <TableHead>Est. Cost</TableHead>
                <TableHead>Actual Cost</TableHead>
                <TableHead>Logged / Est. Hrs</TableHead>
                <TableHead>Profit / Loss</TableHead>
                <TableHead>Margin</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {p.projects.length === 0 && (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">No projects.</TableCell></TableRow>
              )}
              {p.projects.map((f) => (
                <TableRow key={f.projectId}>
                  <TableCell>
                    <Link href={`/sprintos/costing/${f.projectId}`} className="font-medium hover:underline">{f.projectName}</Link>
                    <div className="font-mono text-xs text-muted-foreground">{f.projectCode}</div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{c(f.contractValue)}</TableCell>
                  <TableCell className="text-muted-foreground">{c(f.estimatedCost)}</TableCell>
                  <TableCell className="text-muted-foreground">{c(f.actualCost)}</TableCell>
                  <TableCell className="tabular-nums text-muted-foreground">{f.actualHours} / {f.estimatedHours}</TableCell>
                  <TableCell className={cn("font-medium tabular-nums", f.profit > 0 ? "text-green-600 dark:text-green-400" : f.loss > 0 ? "text-destructive" : "text-muted-foreground")}>
                    {f.profit > 0 ? `+${c(f.profit)}` : f.loss > 0 ? `-${c(f.loss)}` : c(0)}
                  </TableCell>
                  <TableCell className={cn("tabular-nums", f.profitMargin >= 0 ? "text-muted-foreground" : "text-destructive")}>{f.profitMargin}%</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </GlassCard>
    </div>
  );
}
