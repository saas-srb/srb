import PanelTabs from "@/components/platform/panel/PanelTabs";
import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import Link from "next/link";
import { ShoppingCart, FileText, Building2, Plus, ArrowRight, Clock, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import KpiCard from "@/components/products/dealflow-ai/KpiCard";
import KpiGrid from "@/components/products/dealflow-ai/KpiGrid";
import { getCurrentPrmsUser } from "@/lib/prms-auth";
import { searchRequisitions, serializeRequisition, pendingRequisitionValue, SerializedRequisition } from "@/lib/products/spendiq/requisitions";
import { searchPurchaseOrders, serializePurchaseOrder, SerializedPurchaseOrder } from "@/lib/products/spendiq/purchase-orders";
import { searchVendors, serializeVendor, SerializedVendor } from "@/lib/products/spendiq/vendors";
import { formatMoney } from "@/lib/products/spendiq/constants";
import { formatDate } from "@/lib/utils";
import PrmsDataTable from "@/components/products/spendiq/PrmsDataTable";
import ItemPdfDownloadButtons from "@/components/products/spendiq/ItemPdfDownloadButtons";

export default async function ProcurementHubPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  await getCurrentPrmsUser();

  const activeTab = sp.tab || "requisitions";

  const [reqs, pos, vendorsResult, pendingVal] = await Promise.all([
    searchRequisitions({ search: sp.search, page: Math.max(Number(sp.page) || 1, 1), pageSize: 15 }),
    searchPurchaseOrders({ search: sp.search, page: Math.max(Number(sp.page) || 1, 1), pageSize: 15 }),
    searchVendors({ search: sp.search, page: Math.max(Number(sp.page) || 1, 1), pageSize: 15 }),
    pendingRequisitionValue(),
  ]);

  const vendorsList = vendorsResult.items;

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "SpendIQ", href: "/spendiq" }, { label: "Procurement Hub" }]}
        title={<>Procurement Hub</>}
        description={<>Startup purchasing workflow — Requisitions, Purchase Orders, and Vendor Directory.</>}
        actions={<><div className="flex items-center gap-2">
          <Link href="/spendiq/requisitions">
            <Button size="sm">
              <Plus className="size-3.5 mr-1" />
              New Purchase Request
            </Button>
          </Link>
          <Link href="/spendiq/vendors">
            <Button size="sm" variant="outline">
              <Building2 className="size-3.5 mr-1" />
              Add Vendor
            </Button>
          </Link>
        </div></>}
      />

      <KpiGrid>
        <KpiCard
          label="Pending Requisitions"
          value={reqs.total}
          accent
          icon={<FileText className="size-4" />}
        />
        <KpiCard
          label="Pending Request Value"
          value={<span>{formatMoney(pendingVal)}</span>}
          icon={<Clock className="size-4" />}
        />
        <KpiCard
          label="Purchase Orders"
          value={pos.total}
          tone="up"
          icon={<ShoppingCart className="size-4" />}
        />
        <KpiCard
          label="Active Vendors"
          value={vendorsResult.total}
          icon={<Building2 className="size-4" />}
        />
      </KpiGrid>

      <PanelTabs
        active={activeTab}
        tabs={[
          { key: "requisitions", label: "Purchase Requests", count: reqs.total, icon: <FileText className="size-3.5" />, href: "/spendiq/procurement?tab=requisitions" },
          { key: "orders", label: "Purchase Orders", count: pos.total, icon: <ShoppingCart className="size-3.5" />, href: "/spendiq/procurement?tab=orders" },
          { key: "vendors", label: "Vendors", count: vendorsResult.total, icon: <Building2 className="size-3.5" />, href: "/spendiq/procurement?tab=vendors" },
        ]}
      />

      {activeTab === "orders" ? (
        <PrmsDataTable
          columns={[
            { key: "poNumber", header: "PO Code" },
            { key: "vendor", header: "Vendor" },
            { key: "total", header: "Total Amount", align: "right" },
            { key: "status", header: "Status" },
            { key: "date", header: "Order Date" },
            { key: "pdfDownloads", header: "PDF Downloads", align: "right" },
          ]}
          rows={pos.items.map(serializePurchaseOrder).map((po: SerializedPurchaseOrder) => ({
            id: po._id,
            href: `/spendiq/purchase-orders`,
            cells: {
              poNumber: <span className="font-mono font-bold text-primary">{po.poNumber}</span>,
              vendor: po.vendorName,
              total: formatMoney(po.totalAmount, po.currency),
              status: (
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-muted uppercase tracking-wider">
                  {po.status}
                </span>
              ),
              date: formatDate(po.createdAt),
              pdfDownloads: <ItemPdfDownloadButtons itemId={po._id} code={po.poNumber} variant="compact" />,
            },
          }))}
          search={sp.search ?? ""}
          searchPlaceholder="Search PO code, vendor..."
          page={pos.page}
          totalPages={pos.totalPages}
          total={pos.total}
          emptyLabel="No purchase orders found."
        />
      ) : activeTab === "vendors" ? (
        <PrmsDataTable
          columns={[
            { key: "code", header: "Code" },
            { key: "name", header: "Vendor Name" },
            { key: "category", header: "Category" },
            { key: "contact", header: "Contact Person" },
            { key: "phone", header: "Phone / Email" },
            { key: "pdfDownloads", header: "Vendor Document", align: "right" },
          ]}
          rows={vendorsList.map(serializeVendor).map((v: SerializedVendor) => ({
            id: v._id,
            href: `/spendiq/vendors`,
            cells: {
              code: <span className="font-mono text-xs">{v.vendorCode}</span>,
              name: <span className="font-bold">{v.companyName}</span>,
              category: v.category || "General",
              contact: v.contactPerson || "—",
              phone: (
                <div className="text-xs">
                  <p>{v.email}</p>
                  <p className="text-muted-foreground">{v.phone}</p>
                </div>
              ),
              pdfDownloads: <ItemPdfDownloadButtons itemId={v._id} code={v.vendorCode} variant="compact" />,
            },
          }))}
          search={sp.search ?? ""}
          searchPlaceholder="Search vendor name, email..."
          page={vendorsResult.page}
          totalPages={vendorsResult.totalPages}
          total={vendorsResult.total}
          emptyLabel="No vendors found."
        />
      ) : (
        <PrmsDataTable
          columns={[
            { key: "prCode", header: "Request Code" },
            { key: "item", header: "Item / Service" },
            { key: "requester", header: "Requested By" },
            { key: "cost", header: "Est. Cost", align: "right" },
            { key: "status", header: "Status" },
            { key: "date", header: "Created" },
            { key: "pdfDownloads", header: "PDF Downloads", align: "right" },
          ]}
          rows={reqs.items.map(serializeRequisition).map((req: SerializedRequisition) => ({
            id: req._id,
            href: `/spendiq/requisitions`,
            cells: {
              prCode: <span className="font-mono font-bold text-primary">{req.prCode}</span>,
              item: (
                <div>
                  <p className="font-semibold text-xs">{req.itemName}</p>
                  <p className="text-[10px] text-muted-foreground">Qty: {req.quantity} {req.uom}</p>
                </div>
              ),
              requester: req.requestedBy.name,
              cost: formatMoney(req.estimatedCost, req.currency),
              status: (
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-muted uppercase tracking-wider">
                  {req.status}
                </span>
              ),
              date: formatDate(req.createdAt),
              pdfDownloads: <ItemPdfDownloadButtons itemId={req._id} code={req.prCode} variant="compact" />,
            },
          }))}
          search={sp.search ?? ""}
          searchPlaceholder="Search request code, item name..."
          page={reqs.page}
          totalPages={reqs.totalPages}
          total={reqs.total}
          emptyLabel="No purchase requests found."
        />
      )}
    </div>
  );
}
