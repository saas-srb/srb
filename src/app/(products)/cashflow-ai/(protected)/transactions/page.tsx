import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import { Plus, ArrowLeftRight, Clock, CheckSquare, Coins } from "lucide-react";
import { Button } from "@/components/ui/button";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import KpiCard from "@/components/products/dealflow-ai/KpiCard";
import KpiGrid from "@/components/products/dealflow-ai/KpiGrid";
import FmsDataTable from "@/components/products/cashflow-ai/FmsDataTable";
import TransactionForm from "@/components/products/cashflow-ai/TransactionForm";
import { TransactionStatusBadge, TransactionTypeBadge } from "@/components/products/cashflow-ai/StatusBadges";
import { getCurrentFmsUser } from "@/lib/fms-auth";
import { canManageTransactions } from "@/lib/fms-roles";
import { searchTransactions, serializeTransaction } from "@/lib/products/cashflow-ai/transactions";
import { listClientOptions } from "@/lib/products/sprintos/clients";
import { listVendorOptions } from "@/lib/products/spendiq/vendors";
import { listProjectOptions } from "@/lib/products/cashflow-ai/pickers";
import { listAccountOptions, getAccountByCode } from "@/lib/products/cashflow-ai/accounts";
import { listBankAccountOptions } from "@/lib/products/cashflow-ai/bank-accounts";
import { listCashAccountOptions } from "@/lib/products/cashflow-ai/cash-accounts";
import type { FundAccountOption } from "@/components/products/cashflow-ai/FundTransferForm";
import {
  TRANSACTION_TYPES,
  TRANSACTION_STATUSES,
  isValidTransactionType,
  isValidTransactionStatus,
  isValidFundAccountType,
  formatMoney,
} from "@/lib/products/cashflow-ai/constants";
import { formatDate } from "@/lib/utils";

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const user = await getCurrentFmsUser();
  const canManage = user ? canManageTransactions(user) : false;

  const page = Math.max(Number(sp.page) || 1, 1);
  const type = sp.type && isValidTransactionType(sp.type) ? sp.type : undefined;
  const status = sp.status && isValidTransactionStatus(sp.status) ? sp.status : undefined;
  const fundAccountType = sp.fundAccountType && isValidFundAccountType(sp.fundAccountType) ? sp.fundAccountType : undefined;
  const sortBy = (sp.sortBy as "transactionDate" | "createdAt" | "amount" | "transactionNumber" | "status") || "transactionDate";
  const sortDir = sp.sortDir === "asc" ? "asc" : "desc";

  /** `accountCode` (e.g. `5500` Travel) resolves to the real `accountId` — the sidebar can't hardcode a DB-generated UUID. */
  const accountByCode = sp.accountCode ? await getAccountByCode(sp.accountCode) : null;
  const accountId = accountByCode?._id;

  const [result, customers, vendors, projects, accounts, bankAccounts, cashAccounts] = await Promise.all([
    searchTransactions({ search: sp.search, type, status, fundAccountType, accountId, page, pageSize: 20, sortBy, sortDir }),
    listClientOptions(),
    listVendorOptions({ activeOnly: true }),
    listProjectOptions(),
    listAccountOptions({ activeOnly: true }),
    listBankAccountOptions(),
    listCashAccountOptions(),
  ]);

  const customerOpts = customers.map((c) => ({ _id: c._id, label: `${c.companyName} (${c.clientCode})` }));
  const vendorOpts = vendors.map((v) => ({ _id: v._id, label: v.companyName }));
  const projectOpts = projects.map((p) => ({ _id: p._id, label: p.name }));
  const accountOpts = accounts.map((a) => ({ _id: a._id, label: `${a.code} · ${a.name}` }));
  const fundAccountOpts: FundAccountOption[] = [
    ...bankAccounts.map((a) => ({ key: `bank:${a._id}`, type: "bank" as const, id: a._id, label: `${a.accountName} (Bank)` })),
    ...cashAccounts.map((a) => ({ key: `cash:${a._id}`, type: "cash" as const, id: a._id, label: `${a.accountName} (Cash)` })),
  ];

  const customerNameById = new Map(customers.map((c) => [c._id, c.companyName]));
  const vendorNameById = new Map(vendors.map((v) => [v._id, v.companyName]));

  const pendingCount = result.items.filter((t) => t.status === "pending_approval").length;
  const totalThisPage = result.items.reduce((sum, t) => sum + t.amount, 0);

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "CashFlow", href: "/cashflow-ai" }, { label: "Transactions" }]}
        title={<>Transactions</>}
        description={<>{result.total} transaction{result.total === 1 ? "" : "s"} logged.
            {accountByCode && ` Filtered to ${accountByCode.name}.`}</>}
        actions={<>{canManage && (
          <TransactionForm
            customers={customerOpts}
            vendors={vendorOpts}
            projects={projectOpts}
            accounts={accountOpts}
            fundAccounts={fundAccountOpts}
            trigger={
              <Button type="button" size="sm">
                <Plus className="size-3.5" data-icon="inline-start" />
                New Transaction
              </Button>
            }
          />
        )}</>}
      />

      <KpiGrid>
        <KpiCard label="Total Transactions" value={result.total} accent icon={<ArrowLeftRight className="size-4" />} />
        <KpiCard label="Pending Approval (this page)" value={pendingCount} tone={pendingCount > 0 ? "down" : undefined} icon={<Clock className="size-4" />} />
        <KpiCard label="This Page's Total" value={<span>{formatMoney(totalThisPage)}</span>} icon={<Coins className="size-4" />} />
        <KpiCard label="Page" value={`${result.page} / ${result.totalPages}`} icon={<CheckSquare className="size-4" />} />
      </KpiGrid>

      <FmsDataTable
        columns={[
          { key: "number", header: "Transaction", sortable: true },
          { key: "type", header: "Type" },
          { key: "party", header: "Customer / Vendor" },
          { key: "amount", header: "Amount", sortable: true, align: "right" },
          { key: "method", header: "Method" },
          { key: "status", header: "Status" },
          { key: "date", header: "Date", sortable: true },
        ]}
        rows={result.items.map(serializeTransaction).map((t) => ({
          id: t._id,
          href: `/cashflow-ai/transactions/${t._id}`,
          cells: {
            number: t.transactionNumber,
            type: <TransactionTypeBadge type={t.type} />,
            party: (t.customerId && customerNameById.get(t.customerId)) || (t.vendorId && vendorNameById.get(t.vendorId)) || "—",
            amount: formatMoney(t.amount, t.currency),
            method: t.paymentMethod.replace(/_/g, " "),
            status: <TransactionStatusBadge status={t.status} />,
            date: formatDate(t.transactionDate),
          },
        }))}
        filters={[
          { key: "type", label: "Type", value: sp.type ?? "", options: TRANSACTION_TYPES.map((t) => ({ value: t.value, label: t.label })) },
          { key: "status", label: "Status", value: sp.status ?? "", options: TRANSACTION_STATUSES.map((s) => ({ value: s.value, label: s.label })) },
        ]}
        search={sp.search ?? ""}
        searchPlaceholder="Transaction number, reference, description"
        sortBy={sortBy}
        sortDir={sortDir}
        page={result.page}
        totalPages={result.totalPages}
        total={result.total}
        emptyLabel="No transactions match these filters."
      />
    </div>
  );
}
