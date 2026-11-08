import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import { Plus, Receipt as ReceiptIcon, Coins } from "lucide-react";
import { Button } from "@/components/ui/button";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import KpiCard from "@/components/products/dealflow-ai/KpiCard";
import KpiGrid from "@/components/products/dealflow-ai/KpiGrid";
import FmsDataTable from "@/components/products/cashflow-ai/FmsDataTable";
import ReceiptForm from "@/components/products/cashflow-ai/ReceiptForm";
import { getCurrentFmsUser } from "@/lib/fms-auth";
import { canManageTransactions } from "@/lib/fms-roles";
import { searchReceipts, serializeReceipt } from "@/lib/products/cashflow-ai/receipts";
import { listFundAccountOptions } from "@/lib/products/cashflow-ai/fund-accounts";
import { listClientOptions } from "@/lib/products/sprintos/clients";
import { formatMoney } from "@/lib/products/cashflow-ai/constants";
import { formatDate } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

import { getAccrualSettings } from "@/lib/products/cashflow-ai/accrual/settings";

export default async function ReceiptsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const accrualOn = !!(await getAccrualSettings());
  const sp = await searchParams;
  const user = await getCurrentFmsUser();
  const canManage = user ? canManageTransactions(user) : false;

  const page = Math.max(Number(sp.page) || 1, 1);

  const [result, customers, fundAccounts] = await Promise.all([
    searchReceipts({ search: sp.search, page, pageSize: 20 }),
    listClientOptions(),
    listFundAccountOptions(),
  ]);
  const customerOpts = customers.map((c) => ({ _id: c._id, label: `${c.companyName} (${c.clientCode})` }));
  const pageTotal = result.items.reduce((s, r) => s + r.amount, 0);

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "CashFlow", href: "/cashflow-ai" }, { label: "Payment Receipts" }]}
        title={<>Payment Receipts</>}
        description={<>{result.total} receipt{result.total === 1 ? "" : "s"} recorded.</>}
        actions={<>{canManage && (
          <ReceiptForm
            customers={customerOpts}
            allowTds={accrualOn}
            fundAccounts={fundAccounts}
            trigger={
              <Button type="button" size="sm">
                <Plus className="size-3.5" data-icon="inline-start" />
                Record Receipt
              </Button>
            }
          />
        )}</>}
      />

      <KpiGrid>
        <KpiCard label="Total Receipts" value={result.total} accent icon={<ReceiptIcon className="size-4" />} />
        <KpiCard label="This Page's Total" value={<span>{formatMoney(pageTotal)}</span>} icon={<Coins className="size-4" />} />
      </KpiGrid>

      <FmsDataTable
        columns={[
          { key: "number", header: "Receipt" },
          { key: "customer", header: "Customer" },
          { key: "amount", header: "Amount", align: "right" },
          { key: "method", header: "Method" },
          { key: "status", header: "Status" },
          { key: "date", header: "Date" },
        ]}
        rows={result.items.map(serializeReceipt).map((r) => ({
          id: r._id,
          href: `/cashflow-ai/receipts/${r._id}`,
          cells: {
            number: r.receiptNumber,
            customer: r.customerName,
            amount: formatMoney(r.amount, r.currency),
            method: r.method?.replace(/_/g, " ") ?? "—",
            status: (
              <Badge className={r.status === "pending_clearance" ? "bg-amber-500/15 text-amber-700 dark:text-amber-400" : r.status === "bounced" ? "bg-destructive/15 text-destructive" : r.status === "voided" ? "bg-muted text-muted-foreground" : "bg-green-500/15 text-green-600 dark:text-green-400"}>
                {({ completed: "Completed", voided: "Voided", pending_clearance: "Awaiting clearance", bounced: "Bounced" } as Record<string, string>)[r.status]}
              </Badge>
            ),
            date: formatDate(r.receiptDate),
          },
        }))}
        search={sp.search ?? ""}
        searchPlaceholder="Receipt number, customer, reference"
        page={result.page}
        totalPages={result.totalPages}
        total={result.total}
        emptyLabel="No receipts recorded yet."
      />
    </div>
  );
}
