import PanelListFilters from "@/components/platform/panel/PanelListFilters";
import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import { Plus, ArrowLeftRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CardContent } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import KpiCard from "@/components/products/dealflow-ai/KpiCard";
import KpiGrid from "@/components/products/dealflow-ai/KpiGrid";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import FundTransferForm, { type FundAccountOption } from "@/components/products/cashflow-ai/FundTransferForm";
import { getCurrentFmsUser } from "@/lib/fms-auth";
import { canManageTransactions } from "@/lib/fms-roles";
import { listTransfers, serializeFundTransfer } from "@/lib/products/cashflow-ai/fund-transfers";
import { listBankAccountOptions } from "@/lib/products/cashflow-ai/bank-accounts";
import { listCashAccountOptions } from "@/lib/products/cashflow-ai/cash-accounts";
import { formatMoney } from "@/lib/products/cashflow-ai/constants";
import { formatDate } from "@/lib/utils";

export default async function TransfersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const user = await getCurrentFmsUser();
  const canManage = user ? canManageTransactions(user) : false;

  const page = Math.max(Number(sp.page) || 1, 1);
  const [result, bankAccounts, cashAccounts] = await Promise.all([
    listTransfers({ page, pageSize: 20 }),
    listBankAccountOptions(),
    listCashAccountOptions(),
  ]);

  const accountOptions: FundAccountOption[] = [
    ...bankAccounts.map((a) => ({ key: `bank:${a._id}`, type: "bank" as const, id: a._id, label: `${a.accountName} (Bank)` })),
    ...cashAccounts.map((a) => ({ key: `cash:${a._id}`, type: "cash" as const, id: a._id, label: `${a.accountName} (Cash)` })),
  ];

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "CashFlow", href: "/cashflow-ai" }, { label: "Transfers" }]}
        title={<>Transfers</>}
        description={<>{result.total} transfer{result.total === 1 ? "" : "s"} between accounts.</>}
        actions={<>{canManage && accountOptions.length >= 2 && (
          <FundTransferForm
            accounts={accountOptions}
            trigger={
              <Button type="button" size="sm">
                <Plus className="size-3.5" data-icon="inline-start" />
                Record Transfer
              </Button>
            }
          />
        )}</>}
      />

      <PanelListFilters>
<KpiGrid>
        <KpiCard label="Total Transfers" value={result.total} accent icon={<ArrowLeftRight className="size-4" />} />
      </KpiGrid>

      <GlassCard interactive={false}>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Transfer</TableHead>
                <TableHead>From</TableHead>
                <TableHead>To</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.items.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">No transfers recorded yet.</TableCell>
                </TableRow>
              )}
              {result.items.map(serializeFundTransfer).map((t) => (
                <TableRow key={t._id}>
                  <TableCell className="font-medium">{t.transferNumber}</TableCell>
                  <TableCell>{t.fromAccountName}</TableCell>
                  <TableCell>{t.toAccountName}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatMoney(t.amount, t.currency)}</TableCell>
                  <TableCell>{formatDate(t.transferDate)}</TableCell>
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
