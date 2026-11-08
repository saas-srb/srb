import PanelListFilters from "@/components/platform/panel/PanelListFilters";
import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import Link from "next/link";
import { Clock, AlertTriangle } from "lucide-react";
import { CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import KpiCard from "@/components/products/dealflow-ai/KpiCard";
import KpiGrid from "@/components/products/dealflow-ai/KpiGrid";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import CategoryBarChart from "@/components/products/dealflow-ai/CategoryBarChart";
import { payablesAging, vendorWisePayables, totalOutstandingPayable, overdueBills } from "@/lib/products/cashflow-ai/payables";
import { AGING_BUCKET_LABELS, formatMoney } from "@/lib/products/cashflow-ai/constants";

export default async function PayablesPage() {
  const [aging, byVendor, outstanding, overdue] = await Promise.all([
    payablesAging(),
    vendorWisePayables(),
    totalOutstandingPayable(),
    overdueBills(),
  ]);

  const agingByLabel = new Map(aging.map((a) => [a.label, a.amount]));
  const chartData = AGING_BUCKET_LABELS.map((label) => ({ label, value: agingByLabel.get(label) ?? 0 }));

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "CashFlow", href: "/cashflow-ai" }, { label: "Payables" }]}
        title={<>Accounts Payable</>}
        description={<>Real aging computed from SpendIQ&apos;s open vendor bills plus CashFlow debit notes.</>}
      />

      <PanelListFilters>
<KpiGrid>
        <KpiCard label="Total Outstanding" value={<span>{formatMoney(outstanding)}</span>} accent icon={<Clock className="size-4" />} />
        <KpiCard label="Overdue Bills" value={overdue.count} tone={overdue.count > 0 ? "down" : undefined} icon={<AlertTriangle className="size-4" />} />
        <KpiCard label="Overdue Amount" value={<span>{formatMoney(overdue.amount)}</span>} icon={<AlertTriangle className="size-4" />} />
      </KpiGrid>

      <GlassCard>
        <CardHeader><CardTitle>Aging</CardTitle></CardHeader>
        <CardContent><CategoryBarChart data={chartData} /></CardContent>
      </GlassCard>

      <GlassCard interactive={false}>
        <CardHeader><CardTitle>Vendor-wise Payables</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Vendor</TableHead>
                <TableHead className="text-right">Open Bills</TableHead>
                <TableHead className="text-right">Debit Notes</TableHead>
                <TableHead className="text-right">Outstanding</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {byVendor.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground">No outstanding payables.</TableCell>
                </TableRow>
              )}
              {byVendor.map((v) => (
                <TableRow key={v.vendorId}>
                  <TableCell>
                    <Link href={`/cashflow-ai/vendors/${v.vendorId}`} className="font-medium text-primary hover:underline">
                      {v.vendorName}
                    </Link>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{v.billCount}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatMoney(v.debitNoteTotal)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatMoney(v.outstanding + v.debitNoteTotal)}</TableCell>
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
