import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import { PackageCheck, CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import KpiCard from "@/components/products/dealflow-ai/KpiCard";
import KpiGrid from "@/components/products/dealflow-ai/KpiGrid";
import PrmsDataTable from "@/components/products/spendiq/PrmsDataTable";
import GoodsReceiptForm, { type GrnPoItem } from "@/components/products/spendiq/GoodsReceiptForm";
import { GrnStatusBadge } from "@/components/products/spendiq/StatusBadges";
import { getCurrentPrmsUser } from "@/lib/prms-auth";
import { canManageProcurement } from "@/lib/prms-roles";
import { searchGoodsReceipts, countGoodsReceipts, serializeGoodsReceipt } from "@/lib/products/spendiq/goods-receipts";
import { searchPurchaseOrders } from "@/lib/products/spendiq/purchase-orders";
import { GRN_STATUSES } from "@/lib/products/spendiq/constants";
import type { GrnStatus } from "@/lib/products/spendiq/constants";
import { formatDate } from "@/lib/utils";

const isGrnStatus = (v: string | undefined): v is GrnStatus =>
  typeof v === "string" && GRN_STATUSES.some((s) => s.value === v);

export default async function GrnPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const user = await getCurrentPrmsUser();
  const canManage = user ? canManageProcurement(user) : false;

  const page = Math.max(Number(sp.page) || 1, 1);
  const status = isGrnStatus(sp.status) ? sp.status : undefined;
  const sortBy = sp.sortBy || "createdAt";
  const sortDir = sp.sortDir === "asc" ? "asc" : "desc";

  const [result, openPos, total, accepted, rejected] = await Promise.all([
    searchGoodsReceipts({ search: sp.search, status, page, pageSize: 20, sortBy, sortDir }),
    searchPurchaseOrders({ status: "issued", pageSize: 100 }),
    countGoodsReceipts(),
    countGoodsReceipts({ status: "accepted" }),
    countGoodsReceipts({ status: "rejected" }),
  ]);

  // Also include partially received POs.
  const partial = await searchPurchaseOrders({ status: "partially_received", pageSize: 100 });
  const receivablePos = [...openPos.items, ...partial.items];

  const posForForm = receivablePos.map((p) => ({ _id: p._id, poNumber: p.poNumber, vendorName: p.vendorName }));
  const itemsByPo: Record<string, GrnPoItem[]> = {};
  for (const p of receivablePos) {
    itemsByPo[p._id] = p.items
      .map((it, i) => ({ itemIndex: i, description: it.description, outstanding: Math.round((it.quantity - it.receivedQty) * 100) / 100, uom: it.uom }))
      .filter((it) => it.outstanding > 0);
  }

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "SpendIQ", href: "/spendiq" }, { label: "Goods Receipt" }]}
        title={<>Goods Receipt (GRN)</>}
        description={<>{total} receipt{total === 1 ? "" : "s"} recorded.</>}
        actions={<>{canManage && (
          <GoodsReceiptForm
            pos={posForForm}
            selectedPoId={sp.po}
            itemsByPo={itemsByPo}
            trigger={
              <Button type="button" size="sm">
                <PackageCheck className="size-3.5" data-icon="inline-start" />
                Record Receipt
              </Button>
            }
          />
        )}</>}
      />

      <KpiGrid>
        <KpiCard label="Total Receipts" value={total} accent icon={<PackageCheck className="size-4" />} />
        <KpiCard label="Fully Accepted" value={accepted} icon={<CheckCircle2 className="size-4" />} />
        <KpiCard label="Rejected" value={rejected} tone={rejected > 0 ? "down" : undefined} icon={<XCircle className="size-4" />} />
      </KpiGrid>

      <PrmsDataTable
        columns={[
          { key: "grnNumber", header: "GRN #", sortable: true },
          { key: "po", header: "PO #" },
          { key: "vendor", header: "Vendor" },
          { key: "received", header: "Received" },
          { key: "accepted", header: "Accepted", align: "right" },
          { key: "rejected", header: "Rejected", align: "right" },
          { key: "status", header: "Status" },
        ]}
        rows={result.items.map(serializeGoodsReceipt).map((g) => ({
          id: g._id,
          href: `/spendiq/grn/${g._id}`,
          cells: {
            grnNumber: g.grnNumber,
            po: g.poNumber,
            vendor: g.vendorName,
            received: formatDate(g.receivedDate),
            accepted: g.items.reduce((s, it) => s + it.acceptedQty, 0),
            rejected: g.items.reduce((s, it) => s + it.rejectedQty, 0),
            status: <GrnStatusBadge status={g.status} />,
          },
        }))}
        filters={[{ key: "status", label: "Status", value: sp.status ?? "", options: GRN_STATUSES.map((s) => ({ value: s.value, label: s.label })) }]}
        search={sp.search ?? ""}
        searchPlaceholder="GRN #, PO #, vendor"
        sortBy={sortBy}
        sortDir={sortDir}
        page={result.page}
        totalPages={result.totalPages}
        total={result.total}
        emptyLabel="No goods receipts match these filters."
      />
    </div>
  );
}
