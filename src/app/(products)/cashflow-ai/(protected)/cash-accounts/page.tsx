import PanelListFilters from "@/components/platform/panel/PanelListFilters";
import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import Link from "next/link";
import { Plus, Coins } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CardContent } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import KpiCard from "@/components/products/dealflow-ai/KpiCard";
import KpiGrid from "@/components/products/dealflow-ai/KpiGrid";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import CashAccountForm from "@/components/products/cashflow-ai/CashAccountForm";
import { FundAccountStatusBadge } from "@/components/products/cashflow-ai/StatusBadges";
import { getCurrentFmsUser } from "@/lib/fms-auth";
import { canManageBanking } from "@/lib/fms-roles";
import { listCashAccounts, serializeCashAccount, totalCashBalance } from "@/lib/products/cashflow-ai/cash-accounts";
import { formatMoney } from "@/lib/products/cashflow-ai/constants";

export default async function CashAccountsPage() {
  const user = await getCurrentFmsUser();
  const canManage = user ? canManageBanking(user) : false;
  const [accounts, total] = await Promise.all([listCashAccounts(), totalCashBalance()]);
  const serialized = accounts.map(serializeCashAccount);

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "CashFlow", href: "/cashflow-ai" }, { label: "Cash Accounts" }]}
        title={<>Cash Accounts</>}
        description={<>{accounts.length} account{accounts.length === 1 ? "" : "s"}.</>}
        actions={<>{canManage && (
          <CashAccountForm
            trigger={
              <Button type="button" size="sm">
                <Plus className="size-3.5" data-icon="inline-start" />
                New Cash Account
              </Button>
            }
          />
        )}</>}
      />

      <PanelListFilters>
<KpiGrid>
        <KpiCard label="Total Accounts" value={accounts.length} accent icon={<Coins className="size-4" />} />
        <KpiCard label="Total Cash Balance" value={<span>{formatMoney(total)}</span>} icon={<Coins className="size-4" />} />
      </KpiGrid>

      <GlassCard interactive={false}>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Account</TableHead>
                <TableHead>Location</TableHead>
                <TableHead className="text-right">Balance</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {serialized.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground">No cash accounts yet.</TableCell>
                </TableRow>
              )}
              {serialized.map((a) => (
                <TableRow key={a._id}>
                  <TableCell>
                    <Link href={`/cashflow-ai/cash-accounts/${a._id}`} className="font-medium text-primary hover:underline">{a.accountName}</Link>
                  </TableCell>
                  <TableCell>{a.location ?? "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatMoney(a.currentBalance, a.currency)}</TableCell>
                  <TableCell><FundAccountStatusBadge status={a.status} /></TableCell>
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
