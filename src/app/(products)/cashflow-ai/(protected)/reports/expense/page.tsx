import PanelListFilters from "@/components/platform/panel/PanelListFilters";
import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import { CalendarRange } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import KpiCard from "@/components/products/dealflow-ai/KpiCard";
import KpiGrid from "@/components/products/dealflow-ai/KpiGrid";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import { getProfitAndLoss } from "@/lib/products/cashflow-ai/reports/profit-and-loss";
import { groupSum } from "@/lib/products/cashflow-ai/dashboard";
import { getVendor } from "@/lib/products/spendiq/vendors";
import { formatMoney } from "@/lib/products/cashflow-ai/constants";

const SETTLED_STATUSES = ["completed", "reconciled"];

function monthStart(): string {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
}

export default async function ExpenseReportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const dateFromStr = sp.dateFrom ?? monthStart();
  const dateToStr = sp.dateTo ?? new Date().toISOString().slice(0, 10);
  const dateFrom = new Date(`${dateFromStr}T00:00:00`);
  const dateTo = new Date(`${dateToStr}T23:59:59`);

  const [pl, byVendorRaw] = await Promise.all([
    getProfitAndLoss({ dateFrom, dateTo }),
    groupSum("vendorId", { type: "expense", status: { $in: SETTLED_STATUSES }, transactionDate: { $gte: dateFrom, $lte: dateTo } }),
  ]);
  const byVendor = await Promise.all(
    byVendorRaw
      .filter((r) => r.label && r.label !== "—")
      .map(async (r) => ({ label: (await getVendor(r.label).catch(() => null))?.companyName ?? r.label, value: r.value }))
  );

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "CashFlow", href: "/cashflow-ai" }, { label: "Reports" }, { label: "Expense" }]}
        title={<>Expense Report</>}
        description={<>Expenses by account and by vendor for the selected range, from posted journal entries and settled transactions.</>}
      />

      <PanelListFilters>
<div className="rounded-2xl border border-border/40 bg-card/90 p-5 shadow-sm backdrop-blur-md">
        <div className="flex items-center gap-3 border-b border-border/40 pb-4">
          <div className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20">
            <CalendarRange className="size-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold tracking-tight text-foreground">Expense Period</h3>
            <p className="text-xs text-muted-foreground">Filter expenses by date range and export the report</p>
          </div>
        </div>
        <form className="mt-4 flex flex-wrap items-end gap-3" method="get">
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">From</label>
            <Input type="date" name="dateFrom" defaultValue={dateFromStr} className="h-9 rounded-xl border-border/50 bg-background focus-visible:border-primary focus-visible:ring-primary/40" />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">To</label>
            <Input type="date" name="dateTo" defaultValue={dateToStr} className="h-9 rounded-xl border-border/50 bg-background focus-visible:border-primary focus-visible:ring-primary/40" />
          </div>
          <Button type="submit" size="sm" variant="secondary">Apply</Button>
          <div className="ml-auto flex items-center gap-3 text-sm">
            {(["csv", "xlsx", "pdf"] as const).map((fmt) => (
              <a
                key={fmt}
                href={`/api/cashflow-ai/reports/expense?format=${fmt}&dateFrom=${dateFromStr}&dateTo=${dateToStr}`}
                className="text-primary hover:underline"
              >
                Export {fmt.toUpperCase()}
              </a>
            ))}
          </div>
        </form>
      </div>

      <KpiGrid>
        <KpiCard label="Total Expenses" value={<span>{formatMoney(pl.totalExpenses)}</span>} />
      </KpiGrid>

      <div className="grid gap-4 md:grid-cols-2">
        <GlassCard interactive={false}>
          <CardHeader><CardTitle>By Account</CardTitle></CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Account</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pl.expenses.length === 0 && (
                  <TableRow><TableCell colSpan={2} className="text-center text-muted-foreground">No expenses in this range.</TableCell></TableRow>
                )}
                {pl.expenses.map((l) => (
                  <TableRow key={l.accountId}>
                    <TableCell><Badge variant="secondary" className="mr-2">{l.accountCode}</Badge>{l.accountName}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatMoney(l.amount)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </GlassCard>

        <GlassCard interactive={false}>
          <CardHeader><CardTitle>By Vendor</CardTitle></CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Vendor</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {byVendor.length === 0 && (
                  <TableRow><TableCell colSpan={2} className="text-center text-muted-foreground">No vendor-linked expenses in this range.</TableCell></TableRow>
                )}
                {byVendor.map((v, i) => (
                  <TableRow key={`${v.label}-${i}`}>
                    <TableCell>{v.label}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatMoney(v.value)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </GlassCard>
      </div>
</PanelListFilters>
    </div>
  );
}
