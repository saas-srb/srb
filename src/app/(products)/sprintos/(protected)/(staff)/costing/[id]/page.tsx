import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Settings2, Download, Wallet, Receipt, TrendingUp, TrendingDown, Clock, Percent } from "lucide-react";
import { CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import KpiCard from "@/components/products/dealflow-ai/KpiCard";
import KpiGrid from "@/components/products/dealflow-ai/KpiGrid";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import { Button, buttonVariants } from "@/components/ui/button";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import GroupedBarChart from "@/components/products/sprintos/GroupedBarChart";
import CostingConfigForm from "@/components/products/sprintos/CostingConfigForm";
import { getCurrentPmsUser } from "@/lib/pms-auth";
import { canViewCosting } from "@/lib/pms-roles";
import { getProject } from "@/lib/products/sprintos/projects";
import { getCostingConfig, computeProjectFinancials } from "@/lib/products/sprintos/costing";
import { buildProjectReport } from "@/lib/products/sprintos/reports";
import { projectFinancialSummary } from "@/lib/products/cashflow-ai/reports/project-financials";
import { formatCurrency, cn } from "@/lib/utils";

export default async function ProjectCostingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentPmsUser();
  if (!user || !canViewCosting(user)) redirect("/sprintos");

  const project = await getProject(id);
  if (!project) notFound();

  const [config, financials, report, actual] = await Promise.all([
    getCostingConfig(id),
    computeProjectFinancials(id),
    buildProjectReport(id),
    projectFinancialSummary(id),
  ]);
  if (!financials || !report) notFound();

  const f = financials;
  const c = (n: number) => formatCurrency(n, f.currency);

  const costChart = [{ label: "Cost", a: f.estimatedCost, b: f.actualCost }];
  const hoursChart = [{ label: "Hours", a: f.estimatedHours, b: f.actualHours }];

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[
          { label: "SprintOS", href: "/sprintos" },
          { label: "Costing", href: "/sprintos/costing" },
          { label: project.name },
        ]}
        title={<>{project.name}</>}
        description={<><span className="font-mono">{project.projectCode}</span> · {report.summary.client}</>}
        actions={<><div className="flex flex-wrap items-center gap-2">
          <a href={`/api/sprintos/reports/${id}?format=pdf`} className={buttonVariants({ variant: "outline", size: "sm" })}>
            <Download className="size-3.5" data-icon="inline-start" /> PDF
          </a>
          <a href={`/api/sprintos/reports/${id}?format=xlsx`} className={buttonVariants({ variant: "outline", size: "sm" })}>
            <Download className="size-3.5" data-icon="inline-start" /> XLSX
          </a>
          <a href={`/api/sprintos/reports/${id}?format=csv`} className={buttonVariants({ variant: "outline", size: "sm" })}>
            <Download className="size-3.5" data-icon="inline-start" /> CSV
          </a>
          <CostingConfigForm
            projectId={id}
            currency={f.currency}
            config={config}
            trigger={
              <Button type="button" size="sm">
                <Settings2 className="size-3.5" data-icon="inline-start" /> Costing Inputs
              </Button>
            }
          />
        </div></>}
      />

      <KpiGrid>
        <KpiCard label="Project Value" value={<span>{c(f.contractValue)}</span>} accent icon={<Wallet className="size-4" />} />
        <KpiCard label="Actual Cost" value={<span>{c(f.actualCost)}</span>} icon={<Receipt className="size-4" />} />
        <KpiCard label="Revenue" value={<span>{c(f.revenue)}</span>} icon={<TrendingUp className="size-4" />} />
        <KpiCard
          label={f.profit > 0 ? "Profit" : "Loss"}
          value={<span>{c(f.profit > 0 ? f.profit : f.loss)}</span>}
          tone={f.profit > 0 ? "up" : f.loss > 0 ? "down" : undefined}
          icon={f.profit > 0 ? <TrendingUp className="size-4" /> : <TrendingDown className="size-4" />}
        />
      </KpiGrid>
      <KpiGrid cols={6}>
        <KpiCard label="Estimated Cost" value={<span>{c(f.estimatedCost)}</span>} icon={<Receipt className="size-4" />} />
        <KpiCard label="Resource Cost" value={<span>{c(f.resourceCost)}</span>} icon={<Receipt className="size-4" />} />
        <KpiCard label="Est. Hours" value={f.estimatedHours} icon={<Clock className="size-4" />} />
        <KpiCard label="Logged Hours" value={f.actualHours} icon={<Clock className="size-4" />} />
        <KpiCard label="Billable Hours" value={f.billableHours} icon={<Clock className="size-4" />} />
        <KpiCard label="Margin" value={f.profitMargin} suffix="%" tone={f.profitMargin >= 0 ? "up" : "down"} icon={<Percent className="size-4" />} />
      </KpiGrid>

      {actual && (
        <GlassCard interactive={false}>
          <CardHeader>
            <CardTitle>Actual Financials (CashFlow Ledger)</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-3 text-xs text-muted-foreground">
              Real booked revenue and expenses from Finance transactions linked to this project — distinct from the
              estimated figures above, which are simulated from timesheets and configured rates.
            </p>
            <div className="grid gap-x-8 gap-y-1.5 text-sm sm:grid-cols-3">
              <div className="flex items-center justify-between border-b border-border/40 py-1 sm:block sm:border-0 sm:py-0">
                <span className="text-muted-foreground">Real Revenue</span>
                <span className="font-medium tabular-nums text-foreground sm:mt-1 sm:block sm:text-lg">{c(actual.revenue)}</span>
              </div>
              <div className="flex items-center justify-between border-b border-border/40 py-1 sm:block sm:border-0 sm:py-0">
                <span className="text-muted-foreground">Real Expenses</span>
                <span className="font-medium tabular-nums text-foreground sm:mt-1 sm:block sm:text-lg">{c(actual.expenses)}</span>
              </div>
              <div className="flex items-center justify-between py-1 sm:block sm:py-0">
                <span className="text-muted-foreground">Real Net Profit</span>
                <span
                  className={cn(
                    "font-medium tabular-nums sm:mt-1 sm:block sm:text-lg",
                    actual.netProfit >= 0 ? "text-green-600 dark:text-green-400" : "text-destructive"
                  )}
                >
                  {c(actual.netProfit)}
                </span>
              </div>
            </div>
            {actual.transactionCount === 0 && (
              <p className="mt-3 text-xs text-muted-foreground">No Finance transactions reference this project yet.</p>
            )}
          </CardContent>
        </GlassCard>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <GlassCard>
          <CardHeader><CardTitle>Estimated vs Actual Cost</CardTitle></CardHeader>
          <CardContent><GroupedBarChart data={costChart} aName="Estimated" bName="Actual" height={220} /></CardContent>
        </GlassCard>
        <GlassCard>
          <CardHeader><CardTitle>Estimated vs Actual Hours</CardTitle></CardHeader>
          <CardContent><GroupedBarChart data={hoursChart} aName="Estimated" bName="Actual" height={220} /></CardContent>
        </GlassCard>
      </div>

      <GlassCard>
        <CardHeader><CardTitle>Cost Breakdown</CardTitle></CardHeader>
        <CardContent className="grid gap-x-8 gap-y-1.5 text-sm sm:grid-cols-2">
          {[
            ["Contract value", c(f.contractValue)],
            ["Estimated budget", c(f.estimatedBudget)],
            ["Avg cost rate / hr", c(f.avgCostRate)],
            ["Avg bill rate / hr", c(f.avgBillRate)],
            ["Resource cost (actual)", c(f.resourceCost)],
            ["Other costs", c(f.otherCosts)],
            ["Actual cost", c(f.actualCost)],
            ["Revenue", c(f.revenue)],
            ["Remaining budget", c(f.remainingBudget)],
            ["Remaining hours", `${f.remainingHours}h`],
            ["Cost variance (est − actual)", c(f.costVariance)],
          ].map(([k, v]) => (
            <div key={k} className="flex items-center justify-between border-b border-border/40 py-1">
              <span className="text-muted-foreground">{k}</span>
              <span className="font-medium tabular-nums text-foreground">{v}</span>
            </div>
          ))}
        </CardContent>
      </GlassCard>

      <GlassCard interactive={false}>
        <CardHeader><CardTitle>Employee Contributions</CardTitle></CardHeader>
        <CardContent className="overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Hours</TableHead>
                <TableHead>Billable</TableHead>
                <TableHead>Cost Rate</TableHead>
                <TableHead>Cost</TableHead>
                <TableHead>Revenue</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {report.contributions.length === 0 && (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">No logged hours yet.</TableCell></TableRow>
              )}
              {report.contributions.map((row) => (
                <TableRow key={row.employeeId}>
                  <TableCell className="font-medium">{row.name}</TableCell>
                  <TableCell className="capitalize text-muted-foreground">{row.role}</TableCell>
                  <TableCell className="tabular-nums">{row.hours}</TableCell>
                  <TableCell className="tabular-nums text-muted-foreground">{row.billableHours}</TableCell>
                  <TableCell className="tabular-nums text-muted-foreground">{c(row.costRate)}</TableCell>
                  <TableCell className="tabular-nums">{c(row.cost)}</TableCell>
                  <TableCell className="tabular-nums text-green-600 dark:text-green-400">{c(row.revenue)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </GlassCard>

      <p className="text-xs text-muted-foreground">
        Task-derived progress & hours come from <Link href={`/sprintos/projects/${id}`} className="text-primary hover:underline">the project</Link>.
        Timesheet review is under <Link href="/sprintos/timesheets" className="text-primary hover:underline">Timesheet Review</Link>.
      </p>
    </div>
  );
}
