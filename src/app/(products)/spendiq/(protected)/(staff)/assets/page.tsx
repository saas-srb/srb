import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import { Plus, Boxes, UserCheck, Wrench, Coins } from "lucide-react";
import { Button } from "@/components/ui/button";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import KpiCard from "@/components/products/dealflow-ai/KpiCard";
import KpiGrid from "@/components/products/dealflow-ai/KpiGrid";
import PrmsDataTable from "@/components/products/spendiq/PrmsDataTable";
import AssetForm from "@/components/products/spendiq/AssetForm";
import { AssetStatusBadge } from "@/components/products/spendiq/StatusBadges";
import { getCurrentPrmsUser } from "@/lib/prms-auth";
import { canManageProcurement } from "@/lib/prms-roles";
import { searchAssets, countAssets, sumAssetValue, serializeAsset } from "@/lib/products/spendiq/assets";
import { listVendorOptions } from "@/lib/products/spendiq/vendors";
import { ASSET_CATEGORIES, ASSET_STATUSES, isValidAssetStatus, formatMoney, type AssetStatus } from "@/lib/products/spendiq/constants";
import { formatDate } from "@/lib/utils";

export default async function AssetsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const user = await getCurrentPrmsUser();
  const canManage = user ? canManageProcurement(user) : false;

  const page = Math.max(Number(sp.page) || 1, 1);
  const status = sp.status && isValidAssetStatus(sp.status) ? (sp.status as AssetStatus) : undefined;
  const sortBy = sp.sortBy || "createdAt";
  const sortDir = sp.sortDir === "asc" ? "asc" : "desc";

  const [result, vendors, total, assigned, repair, value] = await Promise.all([
    searchAssets({ search: sp.search, category: sp.category, status, page, pageSize: 20, sortBy, sortDir }),
    listVendorOptions(),
    countAssets(),
    countAssets({ status: "assigned" }),
    countAssets({ status: "under_repair" }),
    sumAssetValue(),
  ]);

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "SpendIQ", href: "/spendiq" }, { label: "Asset Management" }]}
        title={<>Asset Management</>}
        description={<>{total} asset{total === 1 ? "" : "s"} tracked.</>}
        actions={<>{canManage && (
          <AssetForm
            vendors={vendors.map((v) => ({ _id: v._id, companyName: v.companyName }))}
            trigger={
              <Button type="button" size="sm">
                <Plus className="size-3.5" data-icon="inline-start" />
                New Asset
              </Button>
            }
          />
        )}</>}
      />

      <KpiGrid>
        <KpiCard label="Total Assets" value={total} accent icon={<Boxes className="size-4" />} />
        <KpiCard label="Assigned" value={assigned} icon={<UserCheck className="size-4" />} />
        <KpiCard label="Under Repair" value={repair} tone={repair > 0 ? "down" : undefined} icon={<Wrench className="size-4" />} />
        <KpiCard label="Book Value" value={<span>{formatMoney(value)}</span>} icon={<Coins className="size-4" />} />
      </KpiGrid>

      <PrmsDataTable
        columns={[
          { key: "code", header: "Asset", sortable: true },
          { key: "category", header: "Category" },
          { key: "serial", header: "Serial" },
          { key: "assignee", header: "Assigned To" },
          { key: "value", header: "Current Value", align: "right" },
          { key: "status", header: "Status" },
          { key: "purchased", header: "Purchased", sortable: true },
        ]}
        rows={result.items.map(serializeAsset).map((a) => ({
          id: a._id,
          href: `/spendiq/assets/${a._id}`,
          cells: {
            code: `${a.assetCode} · ${a.name}`,
            category: a.category,
            serial: a.serialNumber ?? "—",
            assignee: a.assignedEmployeeName ?? "—",
            value: formatMoney(a.currentValue, a.currency),
            status: <AssetStatusBadge status={a.status} />,
            purchased: formatDate(a.purchaseDate),
          },
        }))}
        filters={[
          { key: "status", label: "Status", value: sp.status ?? "", options: ASSET_STATUSES.map((s) => ({ value: s.value, label: s.label })) },
          { key: "category", label: "Category", value: sp.category ?? "", options: ASSET_CATEGORIES.map((c) => ({ value: c, label: c })) },
        ]}
        search={sp.search ?? ""}
        searchPlaceholder="Code, name, serial, brand"
        sortBy={sortBy}
        sortDir={sortDir}
        page={result.page}
        totalPages={result.totalPages}
        total={result.total}
        exportBase="/api/spendiq/export/assets"
        emptyLabel="No assets match these filters."
      />
    </div>
  );
}
