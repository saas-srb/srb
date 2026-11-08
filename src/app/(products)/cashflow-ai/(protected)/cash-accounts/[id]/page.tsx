import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Edit, Scale } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import CashAccountForm from "@/components/products/cashflow-ai/CashAccountForm";
import { TransactionStatusBadge, TransactionTypeBadge, FundAccountStatusBadge } from "@/components/products/cashflow-ai/StatusBadges";
import { getCurrentFmsUser } from "@/lib/fms-auth";
import { canManageBanking } from "@/lib/fms-roles";
import { getCashAccount, serializeCashAccount } from "@/lib/products/cashflow-ai/cash-accounts";
import { transactionsForFundAccount, serializeTransaction } from "@/lib/products/cashflow-ai/transactions";
import { formatMoney } from "@/lib/products/cashflow-ai/constants";
import { formatDate, formatDateTime } from "@/lib/utils";

export default async function CashAccountDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentFmsUser();
  const raw = await getCashAccount(id);
  if (!raw) notFound();
  const account = serializeCashAccount(raw);
  const canManage = user ? canManageBanking(user) : false;
  const txnDocs = await transactionsForFundAccount("cash", id, 50);

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "CashFlow", href: "/cashflow-ai" }, { label: "Cash Accounts", href: "/cashflow-ai/cash-accounts" }, { label: account.accountName }]}
        title={<>{account.accountName}</>}
        description={<>{formatMoney(account.currentBalance, account.currency)}</>}
        actions={<><div className="flex items-center gap-2">
          <FundAccountStatusBadge status={account.status} />
          <Link href={`/cashflow-ai/cash-reconciliation?cashAccountId=${account._id}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
            <Scale className="size-3.5" data-icon="inline-start" />
            Reconcile
          </Link>
          {canManage && (
            <CashAccountForm
              account={account}
              trigger={
                <Button type="button" size="sm" variant="outline">
                  <Edit className="size-3.5" data-icon="inline-start" />
                  Edit
                </Button>
              }
            />
          )}
        </div></>}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <GlassCard>
          <CardHeader><CardTitle>Details</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label="Location" value={account.location ?? "—"} />
            <Row label="Department" value={account.department ?? "—"} />
            <Row label="Currency" value={account.currency} />
          </CardContent>
        </GlassCard>

        <GlassCard>
          <CardHeader><CardTitle>Balance</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label="Opening Balance" value={formatMoney(account.openingBalance, account.currency)} />
            <Row label="Current Balance" value={formatMoney(account.currentBalance, account.currency)} />
            <Row label="Created" value={formatDateTime(account.createdAt)} />
          </CardContent>
        </GlassCard>
      </div>

      <GlassCard interactive={false}>
        <CardHeader><CardTitle>Recent Transactions</CardTitle></CardHeader>
        <CardContent className="max-h-[60vh] overflow-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Transaction</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {txnDocs.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">No transactions through this account yet.</TableCell>
                </TableRow>
              )}
              {txnDocs.map(serializeTransaction).map((t) => (
                <TableRow key={t._id}>
                  <TableCell>
                    <Link href={`/cashflow-ai/transactions/${t._id}`} className="font-medium text-primary hover:underline">{t.transactionNumber}</Link>
                  </TableCell>
                  <TableCell><TransactionTypeBadge type={t.type} /></TableCell>
                  <TableCell className="text-right tabular-nums">{formatMoney(t.amount, t.currency)}</TableCell>
                  <TableCell><TransactionStatusBadge status={t.status} /></TableCell>
                  <TableCell>{formatDate(t.transactionDate)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </GlassCard>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium text-foreground">{value}</span>
    </div>
  );
}
