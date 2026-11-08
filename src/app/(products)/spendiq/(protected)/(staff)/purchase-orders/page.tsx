import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import { Plus, ShoppingCart, Send, PackageCheck, Coins } from "lucide-react";
import { Button } from "@/components/ui/button";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import KpiCard from "@/components/products/dealflow-ai/KpiCard";
import KpiGrid from "@/components/products/dealflow-ai/KpiGrid";
import PrmsDataTable from "@/components/products/spendiq/PrmsDataTable";
import PurchaseOrderForm from "@/components/products/spendiq/PurchaseOrderForm";
import { PoStatusBadge } from "@/components/products/spendiq/StatusBadges";
import { getCurrentPrmsUser } from "@/lib/prms-auth";
import { canManageProcurement } from "@/lib/prms-roles";
import { searchPurchaseOrders, countPurchaseOrders, serializePurchaseOrder } from "@/lib/products/spendiq/purchase-orders";
import { listVendorOptions } from "@/lib/products/spendiq/vendors";
import { listDepartments, listProjectOptions } from "@/lib/products/spendiq/pickers";
import { PO_STATUSES, isValidPoStatus, formatMoney, type PoStatus } from "@/lib/products/spendiq/constants";
import { formatDate } from "@/lib/utils";

export default async function PurchaseOrdersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const user = await getCurrentPrmsUser();
  const canManage = user ? canManageProcurement(user) : false;

  const page = Math.max(Number(sp.page) || 1, 1);
  const status = sp.status && isValidPoStatus(sp.status) ? (sp.status as PoStatus) : undefined;
  const sortBy = (sp.sortBy as "createdAt" | "poNumber" | "totalAmount" | "status") || "createdAt";
  const sortDir = sp.sortDir === "asc" ? "asc" : "desc";

  const [result, vendors, departments, projects, total, issued, received, openValue] = await Promise.all([
    searchPurchaseOrders({ search: sp.search, status, vendorId: sp.vendorId, page, pageSize: 20, sortBy, sortDir }),
    listVendorOptions({ activeOnly: true }),
    listDepartments(),
    listProjectOptions(),
    countPurchaseOrders(),
    countPurchaseOrders({ status: "issued" }),
    countPurchaseOrders({ status: "received" }),
    (async () => {
      const all = await searchPurchaseOrders({ status: "issued", pageSize: 100 });
      return all.items.reduce((s, p) => s + p.totalAmount, 0);
    })(),
  ]);

  const vOpts = vendors.map((v) => ({ _id: v._id, companyName: v.companyName }));
  const dOpts = departments.map((d) => ({ _id: d._id, name: d.name }));
  const pOpts = projects.map((p) => ({ _id: p._id, name: p.name }));

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "SpendIQ", href: "/spendiq" }, { label: "Purchase Orders" }]}
        title={<>Purchase Orders</>}
        description={<>{total} PO{total === 1 ? "" : "s"} raised.</>}
        actions={<>{canManage && (
          <PurchaseOrderForm
            vendors={vOpts}
            departments={dOpts}
            projects={pOpts}
            trigger={
              <Button type="button" size="sm">
                <Plus className="size-3.5" data-icon="inline-start" />
                New Purchase Order
              </Button>
            }
          />
        )}</>}
      />

      <KpiGrid>
        <KpiCard label="Total POs" value={total} accent icon={<ShoppingCart className="size-4" />} />
        <KpiCard label="Issued (open)" value={issued} icon={<Send className="size-4" />} />
        <KpiCard label="Fully Received" value={received} icon={<PackageCheck className="size-4" />} />
        <KpiCard label="Open PO Value" value={<span>{formatMoney(openValue)}</span>} icon={<Coins className="size-4" />} />
      </KpiGrid>

      <PrmsDataTable
        columns={[
          { key: "poNumber", header: "PO #", sortable: true },
          { key: "vendor", header: "Vendor" },
          { key: "items", header: "Items" },
          { key: "total", header: "Total", sortable: true, align: "right" },
          { key: "status", header: "Status" },
          { key: "created", header: "Created", sortable: true },
        ]}
        rows={result.items.map(serializePurchaseOrder).map((p) => ({
          id: p._id,
          href: `/spendiq/purchase-orders/${p._id}`,
          cells: {
            poNumber: p.poNumber,
            vendor: p.vendorName,
            items: `${p.items.length} line${p.items.length === 1 ? "" : "s"}`,
            total: formatMoney(p.totalAmount, p.currency),
            status: <PoStatusBadge status={p.status} />,
            created: formatDate(p.createdAt),
          },
        }))}
        filters={[
          { key: "status", label: "Status", value: sp.status ?? "", options: PO_STATUSES.map((s) => ({ value: s.value, label: s.label })) },
          { key: "vendorId", label: "Vendor", value: sp.vendorId ?? "", options: vOpts.map((v) => ({ value: v._id, label: v.companyName })) },
        ]}
        search={sp.search ?? ""}
        searchPlaceholder="PO #, vendor, item"
        sortBy={sortBy}
        sortDir={sortDir}
        page={result.page}
        totalPages={result.totalPages}
        total={result.total}
        exportBase="/api/spendiq/export/purchase-orders"
        emptyLabel="No purchase orders match these filters."
      />
    </div>
  );
}
