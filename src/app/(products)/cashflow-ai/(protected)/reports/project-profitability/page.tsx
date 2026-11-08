import PanelListFilters from "@/components/platform/panel/PanelListFilters";
import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import Link from "next/link";
import { CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import KpiCard from "@/components/products/dealflow-ai/KpiCard";
import KpiGrid from "@/components/products/dealflow-ai/KpiGrid";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import { projectProfitabilityReport } from "@/lib/products/cashflow-ai/reports/project-financials";
import { formatMoney, round2 } from "@/lib/products/cashflow-ai/constants";

export default async function ProjectProfitabilityPage() {
  const rows = await projectProfitabilityReport();
  const totalRevenue = round2(rows.reduce((s, r) => s + r.revenue, 0));
  const totalExpenses = round2(rows.reduce((s, r) => s + r.expenses, 0));
  const totalNetProfit = round2(totalRevenue - totalExpenses);

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "CashFlow", href: "/cashflow-ai" }, { label: "Reports" }, { label: "Project Profitability" }]}
        title={<>Project Profitability</>}
        description={<>Real revenue and expenses per project from booked Finance transactions — distinct from SprintOS&apos;s own
          simulated costing (timesheets × rates), shown on each project&apos;s costing page.</>}
      />

      <PanelListFilters>
<KpiGrid>
        <KpiCard label="Projects with Activity" value={rows.length} accent />
        <KpiCard label="Total Revenue" value={<span>{formatMoney(totalRevenue)}</span>} />
        <KpiCard label="Total Expenses" value={<span>{formatMoney(totalExpenses)}</span>} />
        <KpiCard label="Total Net Profit" value={<span>{formatMoney(totalNetProfit)}</span>} tone={totalNetProfit >= 0 ? "up" : "down"} />
      </KpiGrid>

      <GlassCard interactive={false}>
        <CardHeader><CardTitle>By Project</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Project</TableHead>
                <TableHead className="text-right">Revenue</TableHead>
                <TableHead className="text-right">Expenses</TableHead>
                <TableHead className="text-right">Net Profit</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground">No project-linked transactions yet.</TableCell>
                </TableRow>
              )}
              {rows.map((r) => (
                <TableRow key={r.projectId}>
                  <TableCell>
                    <Link href={`/sprintos/costing/${r.projectId}`} className="font-medium text-primary hover:underline">
                      {r.projectName}
                    </Link>
                    <span className="ml-1 text-xs text-muted-foreground">({r.projectCode})</span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatMoney(r.revenue)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatMoney(r.expenses)}</TableCell>
                  <TableCell className={`text-right tabular-nums font-medium ${r.netProfit >= 0 ? "text-green-600 dark:text-green-400" : "text-destructive"}`}>
                    {formatMoney(r.netProfit)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </GlassCard>
</PanelListFilters>
    </div>
  );
}
