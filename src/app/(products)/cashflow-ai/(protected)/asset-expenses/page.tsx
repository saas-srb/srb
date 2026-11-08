import PanelListFilters from "@/components/platform/panel/PanelListFilters";
import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import Link from "next/link";
import { Wrench, Coins } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { CardContent } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import KpiCard from "@/components/products/dealflow-ai/KpiCard";
import KpiGrid from "@/components/products/dealflow-ai/KpiGrid";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import { searchAssetExpenses, serializeAssetExpense, ASSET_EXPENSE_CATEGORIES } from "@/lib/products/cashflow-ai/asset-expenses";
import { formatMoney } from "@/lib/products/cashflow-ai/constants";
import { formatDate } from "@/lib/utils";

const CATEGORY_BADGE: Record<string, string> = {
  maintenance: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  insurance: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  amc: "bg-purple-500/15 text-purple-600 dark:text-purple-400",
  other: "bg-muted text-muted-foreground",
};

export default async function AssetExpensesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const page = Math.max(Number(sp.page) || 1, 1);
  const result = await searchAssetExpenses({ page, pageSize: 20 });
  const items = result.items.map(serializeAssetExpense);
  const pageTotal = items.reduce((s, e) => s + e.amount, 0);

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "CashFlow", href: "/cashflow-ai" }, { label: "Asset Expenses" }]}
        title={<>Asset Expenses</>}
        description={<>{result.total} recorded expense{result.total === 1 ? "" : "s"} — maintenance, insurance, AMC and other ongoing asset costs.</>}
      />

      <PanelListFilters>
<KpiGrid>
        <KpiCard label="Total Recorded" value={result.total} accent icon={<Wrench className="size-4" />} />
        <KpiCard label="This Page's Total" value={<span>{formatMoney(pageTotal)}</span>} icon={<Coins className="size-4" />} />
      </KpiGrid>

      <GlassCard interactive={false}>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Expense</TableHead>
                <TableHead>Asset</TableHead>
                <TableHead>Category</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Vendor</TableHead>
                <TableHead>Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">No asset expenses recorded yet.</TableCell>
                </TableRow>
              )}
              {items.map((e) => (
                <TableRow key={e._id}>
                  <TableCell className="font-mono text-xs">{e.expenseNumber}</TableCell>
                  <TableCell>
                    <Link href={`/cashflow-ai/assets/${e.assetId}`} className="font-medium text-primary hover:underline">
                      {e.assetName}
                    </Link>
                    <span className="ml-1 text-xs text-muted-foreground">({e.assetCode})</span>
                  </TableCell>
                  <TableCell>
                    <Badge className={CATEGORY_BADGE[e.category]}>
                      {ASSET_EXPENSE_CATEGORIES.find((c) => c.value === e.category)?.label ?? e.category}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatMoney(e.amount, e.currency)}</TableCell>
                  <TableCell className="text-muted-foreground">{e.vendorName ?? "—"}</TableCell>
                  <TableCell>{formatDate(e.expenseDate)}</TableCell>
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
