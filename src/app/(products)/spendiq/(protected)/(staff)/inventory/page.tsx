import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import { Plus, Package, AlertTriangle, Coins } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import KpiCard from "@/components/products/dealflow-ai/KpiCard";
import KpiGrid from "@/components/products/dealflow-ai/KpiGrid";
import PrmsDataTable from "@/components/products/spendiq/PrmsDataTable";
import InventoryItemForm from "@/components/products/spendiq/InventoryItemForm";
import { getCurrentPrmsUser } from "@/lib/prms-auth";
import { canManageProcurement } from "@/lib/prms-roles";
import { searchInventoryItems, countInventoryItems, inventoryStockValue, serializeInventoryItem } from "@/lib/products/spendiq/inventory";
import { listVendorOptions } from "@/lib/products/spendiq/vendors";
import { formatMoney } from "@/lib/products/spendiq/constants";

export default async function InventoryPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const user = await getCurrentPrmsUser();
  const canManage = user ? canManageProcurement(user) : false;

  const page = Math.max(Number(sp.page) || 1, 1);
  const lowStock = sp.lowStock === "1";
  const sortBy = sp.sortBy || "name";
  const sortDir = sp.sortDir === "desc" ? "desc" : "asc";

  const [result, vendors, total, lowCount, stockValue] = await Promise.all([
    searchInventoryItems({ search: sp.search, category: sp.category, lowStock, page, pageSize: 20, sortBy, sortDir }),
    listVendorOptions(),
    countInventoryItems(),
    countInventoryItems({ lowStock: true }),
    inventoryStockValue(),
  ]);

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "SpendIQ", href: "/spendiq" }, { label: "Inventory & Stationery" }]}
        title={<>Inventory &amp; Stationery</>}
        description={<>{total} consumable item{total === 1 ? "" : "s"}.</>}
        actions={<>{canManage && (
          <InventoryItemForm
            vendors={vendors.map((v) => ({ _id: v._id, companyName: v.companyName }))}
            trigger={
              <Button type="button" size="sm">
                <Plus className="size-3.5" data-icon="inline-start" />
                New Item
              </Button>
            }
          />
        )}</>}
      />

      <KpiGrid>
        <KpiCard label="Total Items" value={total} accent icon={<Package className="size-4" />} />
        <KpiCard label="Low Stock" value={lowCount} tone={lowCount > 0 ? "down" : undefined} icon={<AlertTriangle className="size-4" />} />
        <KpiCard label="Stock Value" value={<span>{formatMoney(stockValue)}</span>} icon={<Coins className="size-4" />} />
      </KpiGrid>

      <PrmsDataTable
        columns={[
          { key: "code", header: "Item", sortable: true },
          { key: "category", header: "Category" },
          { key: "stock", header: "On Hand", align: "right" },
          { key: "min", header: "Min", align: "right" },
          { key: "cost", header: "Unit Cost", align: "right" },
          { key: "vendor", header: "Vendor" },
        ]}
        rows={result.items.map(serializeInventoryItem).map((i) => ({
          id: i._id,
          href: `/spendiq/inventory/${i._id}`,
          cells: {
            code: `${i.itemCode} · ${i.name}`,
            category: i.category ?? "—",
            stock: (
              <span className={i.currentStock <= i.minStock ? "font-semibold text-destructive" : ""}>
                {i.currentStock} {i.uom}
                {i.currentStock <= i.minStock && <Badge className="ml-1.5 bg-destructive/15 text-destructive">low</Badge>}
              </span>
            ),
            min: `${i.minStock}`,
            cost: formatMoney(i.unitCost),
            vendor: i.vendorName ?? "—",
          },
        }))}
        filters={[{ key: "lowStock", label: "Stock", value: sp.lowStock ?? "", options: [{ value: "1", label: "Low stock only" }] }]}
        search={sp.search ?? ""}
        searchPlaceholder="Code, name, category"
        sortBy={sortBy}
        sortDir={sortDir}
        page={result.page}
        totalPages={result.totalPages}
        total={result.total}
        exportBase="/api/spendiq/export/inventory"
        emptyLabel="No items match these filters."
      />
    </div>
  );
}
