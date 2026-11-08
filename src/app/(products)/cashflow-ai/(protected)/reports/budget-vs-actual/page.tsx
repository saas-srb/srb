import PanelListFilters from "@/components/platform/panel/PanelListFilters";
import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import { getBudgetVsActual } from "@/lib/products/cashflow-ai/reports/budget-vs-actual";
import { formatMoney } from "@/lib/products/cashflow-ai/constants";

export default async function BudgetVsActualPage() {
  const result = await getBudgetVsActual();

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "CashFlow", href: "/cashflow-ai" }, { label: "Reports" }, { label: "Budget vs Actual" }]}
        title={<>Budget vs Actual</>}
        description={<>SpendIQ&apos;s real budget allocations against CashFlow&apos;s own settled ledger spend — the actual figure here is
            Finance&apos;s own money, not SpendIQ&apos;s expense+PO consumption estimate.</>}
        actions={<><div className="flex items-center gap-3 text-sm">
          {(["csv", "xlsx", "pdf"] as const).map((fmt) => (
            <Link key={fmt} href={`/api/cashflow-ai/reports/budget-vs-actual?format=${fmt}`} className="text-primary hover:underline">
              Export {fmt.toUpperCase()}
            </Link>
          ))}
        </div></>}
      />

      <PanelListFilters>
<GlassCard interactive={false}>
        <CardHeader><CardTitle>Company &amp; Project Budgets</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Budget</TableHead>
                <TableHead>Level</TableHead>
                <TableHead>Period</TableHead>
                <TableHead className="text-right">Allocated</TableHead>
                <TableHead className="text-right">Actual</TableHead>
                <TableHead className="text-right">Variance</TableHead>
                <TableHead className="text-right">Utilisation</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground">No company or project budgets configured in SpendIQ yet.</TableCell>
                </TableRow>
              )}
              {result.rows.map((r) => (
                <TableRow key={r.budgetId}>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell><Badge variant="secondary" className="capitalize">{r.level}</Badge></TableCell>
                  <TableCell className="text-muted-foreground">
                    {new Date(r.periodStart).toLocaleDateString()} – {new Date(r.periodEnd).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatMoney(r.allocated)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatMoney(r.actual)}</TableCell>
                  <TableCell className={`text-right tabular-nums ${r.variance < 0 ? "text-destructive" : "text-green-600 dark:text-green-400"}`}>
                    {formatMoney(r.variance)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{r.utilisationPercent}%</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </GlassCard>

      {result.uncomparable.length > 0 && (
        <GlassCard interactive={false}>
          <CardHeader><CardTitle>Department &amp; Category Budgets</CardTitle></CardHeader>
          <CardContent className="p-0">
            <p className="px-4 pt-2 text-xs text-muted-foreground">
              Not yet comparable to Finance spend — SpendIQ budgets at this level use a real department/category id
              that Finance transactions don&apos;t carry yet. Shown here with SpendIQ&apos;s own consumption figure only.
            </p>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Budget</TableHead>
                  <TableHead>Level</TableHead>
                  <TableHead>Scope</TableHead>
                  <TableHead className="text-right">Allocated</TableHead>
                  <TableHead className="text-right">Consumed (SpendIQ)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.uncomparable.map((u) => (
                  <TableRow key={u.budgetId}>
                    <TableCell className="font-medium">{u.name}</TableCell>
                    <TableCell><Badge variant="secondary" className="capitalize">{u.level}</Badge></TableCell>
                    <TableCell className="text-muted-foreground">{u.scopeName ?? "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatMoney(u.allocated)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatMoney(u.consumedInPrms)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </GlassCard>
      )}

      <p className="text-xs text-muted-foreground">
        Budget allocations are owned by SpendIQ. Create or edit a budget at{" "}
        <Link href="/spendiq/budgets" className="text-primary hover:underline">/spendiq/budgets</Link>.
      </p>
</PanelListFilters>
    </div>
  );
}
