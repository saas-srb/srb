import PanelListFilters from "@/components/platform/panel/PanelListFilters";
import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import { Plus, Scale } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CardContent } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import KpiCard from "@/components/products/dealflow-ai/KpiCard";
import KpiGrid from "@/components/products/dealflow-ai/KpiGrid";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import CashCountForm from "@/components/products/cashflow-ai/CashCountForm";
import { getCurrentFmsUser } from "@/lib/fms-auth";
import { canReconcile } from "@/lib/fms-roles";
import { listCashAccountOptions } from "@/lib/products/cashflow-ai/cash-accounts";
import { listCashCounts, serializeCashCount } from "@/lib/products/cashflow-ai/cash-reconciliation";
import { formatMoney } from "@/lib/products/cashflow-ai/constants";
import { formatDate } from "@/lib/utils";

export default async function CashReconciliationPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const user = await getCurrentFmsUser();
  const canManage = user ? canReconcile(user) : false;

  const accounts = await listCashAccountOptions();
  const selectedId = sp.cashAccountId && accounts.some((a) => a._id === sp.cashAccountId) ? sp.cashAccountId : accounts[0]?._id;
  const counts = selectedId ? (await listCashCounts(selectedId)).map(serializeCashCount) : [];
  const accountOpts = accounts.map((a) => ({ _id: a._id, label: a.accountName }));
  const selectedAccount = accounts.find((a) => a._id === selectedId);

  const latestVariance = counts[0]?.variance ?? 0;

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "CashFlow", href: "/cashflow-ai" }, { label: "Cash Reconciliation" }]}
        title={<>Cash Reconciliation</>}
        description={<>{selectedAccount ? selectedAccount.accountName : "No cash accounts yet."}</>}
        actions={<>{canManage && accountOpts.length > 0 && (
          <CashCountForm
            cashAccounts={accountOpts}
            presetCashAccountId={selectedId}
            trigger={
              <Button type="button" size="sm">
                <Plus className="size-3.5" data-icon="inline-start" />
                Record Cash Count
              </Button>
            }
          />
        )}</>}
      />

      <PanelListFilters>
{accountOpts.length === 0 ? (
        <GlassCard>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No cash accounts yet — create one at /cashflow-ai/cash-accounts.
          </CardContent>
        </GlassCard>
      ) : (
        <>
          <KpiGrid>
            <KpiCard label="Total Counts" value={counts.length} accent icon={<Scale className="size-4" />} />
            <KpiCard label="Latest Variance" value={<span>{formatMoney(latestVariance)}</span>} tone={latestVariance !== 0 ? "down" : undefined} icon={<Scale className="size-4" />} />
          </KpiGrid>

          <GlassCard interactive={false}>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Physical Count</TableHead>
                    <TableHead className="text-right">System Balance</TableHead>
                    <TableHead className="text-right">Variance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {counts.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground">No counts recorded yet.</TableCell>
                    </TableRow>
                  )}
                  {counts.map((c) => (
                    <TableRow key={c._id}>
                      <TableCell>{formatDate(c.countDate)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatMoney(c.physicalCount)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatMoney(c.systemBalance)}</TableCell>
                      <TableCell className={`text-right tabular-nums ${c.variance !== 0 ? "text-destructive" : ""}`}>{formatMoney(c.variance)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </GlassCard>
        </>
      )}
</PanelListFilters>
    </div>
  );
}
