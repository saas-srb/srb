import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import { RotateCcw } from "lucide-react";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import KpiCard from "@/components/products/dealflow-ai/KpiCard";
import KpiGrid from "@/components/products/dealflow-ai/KpiGrid";
import FmsDataTable from "@/components/products/cashflow-ai/FmsDataTable";
import { RefundStatusBadge } from "@/components/products/cashflow-ai/StatusBadges";
import { searchRefunds, serializeRefund } from "@/lib/products/cashflow-ai/refunds";
import { REFUND_STATUSES, formatMoney } from "@/lib/products/cashflow-ai/constants";

export default async function RefundsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const page = Math.max(Number(sp.page) || 1, 1);
  const status = sp.status && REFUND_STATUSES.some((s) => s.value === sp.status) ? (sp.status as (typeof REFUND_STATUSES)[number]["value"]) : undefined;

  const result = await searchRefunds({ search: sp.search, status, page, pageSize: 20 });
  const pendingCount = result.items.filter((r) => r.status === "requested").length;

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "CashFlow", href: "/cashflow-ai" }, { label: "Refunds" }]}
        title={<>Refunds</>}
        description={<>{result.total} refund{result.total === 1 ? "" : "s"}. Request one from a receipt&apos;s detail page.</>}
      />

      <KpiGrid>
        <KpiCard label="Total Refunds" value={result.total} accent icon={<RotateCcw className="size-4" />} />
        <KpiCard label="Pending (this page)" value={pendingCount} tone={pendingCount > 0 ? "down" : undefined} icon={<RotateCcw className="size-4" />} />
      </KpiGrid>

      <FmsDataTable
        columns={[
          { key: "number", header: "Refund" },
          { key: "receipt", header: "Receipt" },
          { key: "customer", header: "Customer" },
          { key: "amount", header: "Amount", align: "right" },
          { key: "status", header: "Status" },
        ]}
        rows={result.items.map(serializeRefund).map((r) => ({
          id: r._id,
          href: `/cashflow-ai/refunds/${r._id}`,
          cells: {
            number: r.refundNumber,
            receipt: r.receiptNumber,
            customer: r.customerName,
            amount: formatMoney(r.amount),
            status: <RefundStatusBadge status={r.status} />,
          },
        }))}
        filters={[{ key: "status", label: "Status", value: sp.status ?? "", options: REFUND_STATUSES.map((s) => ({ value: s.value, label: s.label })) }]}
        search={sp.search ?? ""}
        searchPlaceholder="Refund, receipt, customer"
        page={result.page}
        totalPages={result.totalPages}
        total={result.total}
        emptyLabel="No refunds requested yet."
      />
    </div>
  );
}
