import PanelListFilters from "@/components/platform/panel/PanelListFilters";
import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import Link from "next/link";
import { CheckCircle2, AlertTriangle, CalendarClock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import KpiCard from "@/components/products/dealflow-ai/KpiCard";
import KpiGrid from "@/components/products/dealflow-ai/KpiGrid";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import { getTrialBalance } from "@/lib/products/cashflow-ai/reports/trial-balance";
import { formatMoney } from "@/lib/products/cashflow-ai/constants";

export default async function TrialBalancePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const asOf = sp.asOf ? new Date(`${sp.asOf}T23:59:59`) : undefined;
  const result = await getTrialBalance({ asOf });

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "CashFlow", href: "/cashflow-ai" }, { label: "Reports" }, { label: "Trial Balance" }]}
        title={<>Trial Balance</>}
        description={<>Every account&apos;s total debits and credits{result.asOf ? ` as of ${new Date(result.asOf).toLocaleDateString()}` : ""}.</>}
      />

      <PanelListFilters>
<div className="rounded-2xl border border-border/40 bg-card/90 p-5 shadow-sm backdrop-blur-md">
        <div className="flex items-center gap-3 border-b border-border/40 pb-4">
          <div className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20">
            <CalendarClock className="size-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold tracking-tight text-foreground">As-of Date</h3>
            <p className="text-xs text-muted-foreground">Snapshot every account&apos;s debit and credit totals as of a chosen date</p>
          </div>
        </div>
        <form className="mt-4 flex flex-wrap items-end gap-3" method="get">
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">As of</label>
            <Input type="date" name="asOf" defaultValue={sp.asOf ?? ""} className="h-9 rounded-xl border-border/50 bg-background focus-visible:border-primary focus-visible:ring-primary/40" />
          </div>
          <Button type="submit" size="sm" variant="secondary">Apply</Button>
        </form>
      </div>

      <KpiGrid>
        <KpiCard label="Total Debits" value={<span>{formatMoney(result.totalDebits)}</span>} accent />
        <KpiCard label="Total Credits" value={<span>{formatMoney(result.totalCredits)}</span>} />
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

      <GlassCard interactive={false}>
        <CardHeader><CardTitle>Accounts</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Account</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Debit</TableHead>
                <TableHead className="text-right">Credit</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground">No posted journal activity yet.</TableCell>
                </TableRow>
              )}
              {result.rows.map((r) => (
                <TableRow key={r.accountId}>
                  <TableCell>
                    <Link href={`/cashflow-ai/general-ledger?account=${r.accountId}`} className="font-medium text-primary hover:underline">
                      <Badge variant="secondary" className="mr-2">{r.accountCode}</Badge>
                      {r.accountName}
                    </Link>
                  </TableCell>
                  <TableCell className="capitalize text-muted-foreground">{r.accountType}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.totalDebit > 0 ? formatMoney(r.totalDebit) : ""}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.totalCredit > 0 ? formatMoney(r.totalCredit) : ""}</TableCell>
                </TableRow>
              ))}
            </TableBody>
            {result.rows.length > 0 && (
              <tfoot>
                <TableRow>
                  <TableCell colSpan={2} className="font-bold text-foreground">Total</TableCell>
                  <TableCell className="text-right tabular-nums font-bold">{formatMoney(result.totalDebits)}</TableCell>
                  <TableCell className="text-right tabular-nums font-bold">{formatMoney(result.totalCredits)}</TableCell>
                </TableRow>
              </tfoot>
            )}
          </Table>
        </CardContent>
      </GlassCard>
</PanelListFilters>
    </div>
  );
}
