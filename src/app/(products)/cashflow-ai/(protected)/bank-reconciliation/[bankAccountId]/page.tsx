import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import { notFound } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CardContent } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import KpiCard from "@/components/products/dealflow-ai/KpiCard";
import KpiGrid from "@/components/products/dealflow-ai/KpiGrid";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import StatementLineForm from "@/components/products/cashflow-ai/StatementLineForm";
import MatchTransactionDialog from "@/components/products/cashflow-ai/MatchTransactionDialog";
import { StatementLineStatusBadge } from "@/components/products/cashflow-ai/StatusBadges";
import { getCurrentFmsUser } from "@/lib/fms-auth";
import { canReconcile } from "@/lib/fms-roles";
import { getBankAccount, serializeBankAccount } from "@/lib/products/cashflow-ai/bank-accounts";
import { listStatementLines, candidateTransactionsForLine, serializeStatementLine } from "@/lib/products/cashflow-ai/bank-reconciliation";
import { formatMoney } from "@/lib/products/cashflow-ai/constants";
import { formatDate } from "@/lib/utils";

export default async function BankReconciliationPage({ params }: { params: Promise<{ bankAccountId: string }> }) {
  const { bankAccountId } = await params;
  const user = await getCurrentFmsUser();
  const raw = await getBankAccount(bankAccountId);
  if (!raw) notFound();
  const account = serializeBankAccount(raw);
  const canManage = user ? canReconcile(user) : false;

  const lines = await listStatementLines(bankAccountId);
  const linesWithCandidates = await Promise.all(
    lines.map(async (line) => ({
      line: serializeStatementLine(line),
      candidates:
        line.status === "unmatched" || line.status === "needs_review"
          ? (await candidateTransactionsForLine(line)).map((t) => ({
              _id: t._id,
              transactionNumber: t.transactionNumber,
              amount: t.amount,
              currency: t.currency,
              transactionDate: t.transactionDate.toISOString().slice(0, 10),
              description: t.description,
            }))
          : [],
    }))
  );

  const unmatchedCount = lines.filter((l) => l.status === "unmatched").length;
  const matchedCount = lines.filter((l) => l.status === "matched").length;

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "CashFlow", href: "/cashflow-ai" }, { label: "Bank Reconciliation", href: "/cashflow-ai/bank-reconciliation" }, { label: account.accountName }]}
        title={<>{account.accountName}</>}
        description={<>{formatMoney(account.currentBalance, account.currency)} system balance.</>}
        actions={<>{canManage && (
          <StatementLineForm
            bankAccountId={bankAccountId}
            trigger={
              <Button type="button" size="sm">
                <Plus className="size-3.5" data-icon="inline-start" />
                Add Statement Line
              </Button>
            }
          />
        )}</>}
      />

      <KpiGrid>
        <KpiCard label="Total Lines" value={lines.length} accent />
        <KpiCard label="Matched" value={matchedCount} />
        <KpiCard label="Unmatched" value={unmatchedCount} tone={unmatchedCount > 0 ? "down" : undefined} />
      </KpiGrid>

      <GlassCard interactive={false}>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {linesWithCandidates.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">No statement lines entered yet.</TableCell>
                </TableRow>
              )}
              {linesWithCandidates.map(({ line, candidates }) => (
                <TableRow key={line._id}>
                  <TableCell>{formatDate(line.statementDate)}</TableCell>
                  <TableCell>{line.description}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatMoney(line.amount, account.currency)}</TableCell>
                  <TableCell><StatementLineStatusBadge status={line.status} /></TableCell>
                  <TableCell>
                    {canManage && (line.status === "unmatched" || line.status === "needs_review") && (
                      <MatchTransactionDialog
                        lineId={line._id}
                        bankAccountId={bankAccountId}
                        lineDescription={line.description}
                        lineAmount={line.amount}
                        candidates={candidates}
                        trigger={<Button type="button" size="sm" variant="outline">Match</Button>}
                      />
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </GlassCard>
    </div>
  );
}
