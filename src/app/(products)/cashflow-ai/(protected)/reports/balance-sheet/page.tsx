import PanelListFilters from "@/components/platform/panel/PanelListFilters";
import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import { CheckCircle2, AlertTriangle, CalendarClock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableRow, TableCell } from "@/components/ui/table";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import KpiCard from "@/components/products/dealflow-ai/KpiCard";
import KpiGrid from "@/components/products/dealflow-ai/KpiGrid";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import { getBalanceSheet } from "@/lib/products/cashflow-ai/reports/balance-sheet";
import { formatMoney } from "@/lib/products/cashflow-ai/constants";

function Section({ title, lines, total }: { title: string; lines: { accountId: string; accountCode: string; accountName: string; amount: number }[]; total: number }) {
  return (
    <GlassCard interactive={false}>
      <CardHeader><CardTitle>{title}</CardTitle></CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableBody>
            {lines.length === 0 && (
              <TableRow>
                <TableCell colSpan={2} className="text-center text-muted-foreground">None.</TableCell>
              </TableRow>
            )}
            {lines.map((l) => (
              <TableRow key={l.accountId}>
                <TableCell><Badge variant="secondary" className="mr-2">{l.accountCode}</Badge>{l.accountName}</TableCell>
                <TableCell className="text-right tabular-nums">{formatMoney(l.amount)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
          <tfoot>
            <TableRow>
              <TableCell className="font-bold text-foreground">Total {title}</TableCell>
              <TableCell className="text-right tabular-nums font-bold">{formatMoney(total)}</TableCell>
            </TableRow>
          </tfoot>
        </Table>
      </CardContent>
    </GlassCard>
  );
}

export default async function BalanceSheetPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const asOfStr = sp.asOf ?? new Date().toISOString().slice(0, 10);
  const asOf = new Date(`${asOfStr}T23:59:59`);
  const result = await getBalanceSheet(asOf);

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "CashFlow", href: "/cashflow-ai" }, { label: "Reports" }, { label: "Balance Sheet" }]}
        title={<>Balance Sheet</>}
        description={<>Assets, liabilities and equity as of {new Date(result.asOf).toLocaleDateString()}. Retained Earnings is computed live, not journal-posted.</>}
      />

      <PanelListFilters>
<div className="rounded-2xl border border-border/40 bg-card/90 p-5 shadow-sm backdrop-blur-md">
        <div className="flex items-center gap-3 border-b border-border/40 pb-4">
          <div className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20">
            <CalendarClock className="size-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold tracking-tight text-foreground">As-of Date</h3>
            <p className="text-xs text-muted-foreground">Set the snapshot date for assets, liabilities and equity</p>
          </div>
        </div>
        <form className="mt-4 flex flex-wrap items-end gap-3" method="get">
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">As of</label>
            <Input type="date" name="asOf" defaultValue={asOfStr} className="h-9 rounded-xl border-border/50 bg-background focus-visible:border-primary focus-visible:ring-primary/40" />
          </div>
          <Button type="submit" size="sm" variant="secondary">Apply</Button>
        </form>
      </div>

      <KpiGrid>
        <KpiCard label="Total Assets" value={<span>{formatMoney(result.totalAssets)}</span>} accent />
        <KpiCard label="Total Liabilities" value={<span>{formatMoney(result.totalLiabilities)}</span>} />
        <KpiCard label="Total Equity" value={<span>{formatMoney(result.totalEquity)}</span>} />
        <KpiCard
          label="Status"
          value={
            <span className="inline-flex items-center gap-1.5">
              {result.balanced ? <CheckCircle2 className="size-4 text-green-600" /> : <AlertTriangle className="size-4 text-destructive" />}
              {result.balanced ? "Balanced" : "Out of balance"}
            </span>
          }
          tone={result.balanced ? undefined : "down"}
        />
      </KpiGrid>

      <div className="grid gap-4 md:grid-cols-2">
        <Section title="Assets" lines={result.assets} total={result.totalAssets} />
        <div className="space-y-4">
          <Section title="Liabilities" lines={result.liabilities} total={result.totalLiabilities} />
          <Section title="Equity" lines={result.equity} total={result.totalEquity} />
        </div>
      </div>
</PanelListFilters>
    </div>
  );
}
