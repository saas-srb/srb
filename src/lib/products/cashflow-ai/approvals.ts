import "server-only";
import { searchTransactions } from "@/lib/products/cashflow-ai/transactions";
import { searchRefunds } from "@/lib/products/cashflow-ai/refunds";
import { searchExpenses } from "@/lib/products/spendiq/expenses";
import { formatMoney } from "@/lib/products/cashflow-ai/constants";

/**
 * A single aggregated "Pending Approvals" inbox (§23, intentionally scoped
 * down). Composes three real, already-existing pending states — FMS
 * Transactions, FMS Refunds, and PRMS's personal-claim expenses — into one
 * list, each linking to its own real detail page for the actual
 * approve/reject action. Deliberately NOT a configurable approval-rules
 * engine (amount/department/vendor thresholds): neither PRMS nor FMS has
 * one anywhere in the codebase today, and building one is a substantial
 * standalone feature nobody has asked for by name — see the Phase 3 plan.
 */

export interface PendingApprovalItem {
  kind: "transaction" | "refund" | "expense";
  id: string;
  number: string;
  label: string;
  amount: string;
  raisedBy: string;
  href: string;
  createdAt: Date;
}

export async function listPendingApprovals(): Promise<PendingApprovalItem[]> {
  const [transactions, refunds, expenses] = await Promise.all([
    searchTransactions({ status: "pending_approval", pageSize: 50, sortBy: "createdAt", sortDir: "desc" }),
    searchRefunds({ status: "requested", pageSize: 50 }),
    searchExpenses({ approvalStatus: "pending", personalClaimOnly: true, pageSize: 50, sortBy: "expenseDate", sortDir: "desc" }),
  ]);

  const items: PendingApprovalItem[] = [
    ...transactions.items.map((t) => ({
      kind: "transaction" as const,
      id: t._id,
      number: t.transactionNumber,
      label: t.description ?? `${t.type} transaction`,
      amount: formatMoney(t.amount, t.currency),
      raisedBy: t.createdBy ?? "—",
      href: `/cashflow-ai/transactions/${t._id}`,
      createdAt: t.createdAt,
    })),
    ...refunds.items.map((r) => ({
      kind: "refund" as const,
      id: r._id,
      number: r.refundNumber,
      label: `Refund for ${r.customerName}`,
      amount: formatMoney(r.amount),
      raisedBy: r.createdBy ?? "—",
      href: `/cashflow-ai/refunds/${r._id}`,
      createdAt: r.createdAt,
    })),
    ...expenses.items.map((e) => ({
      kind: "expense" as const,
      id: e._id,
      number: e.expenseCode,
      label: e.description ?? `${e.category} expense`,
      amount: formatMoney(e.totalAmount, e.currency),
      raisedBy: e.raisedByName,
      href: `/spendiq/expenses/${e._id}`,
      createdAt: e.createdAt,
    })),
  ];

  return items.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}
