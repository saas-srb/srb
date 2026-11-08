import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import { Boxes, Coins } from "lucide-react";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import KpiCard from "@/components/products/dealflow-ai/KpiCard";
import KpiGrid from "@/components/products/dealflow-ai/KpiGrid";
import FmsDataTable from "@/components/products/cashflow-ai/FmsDataTable";
import { AssetStatusBadge } from "@/components/products/spendiq/StatusBadges";
import { listAssetsFinance } from "@/lib/products/cashflow-ai/asset-finance";
import { sumAssetValue } from "@/lib/products/spendiq/assets";
import { isValidAssetStatus, ASSET_STATUSES, formatMoney } from "@/lib/products/spendiq/constants";
import { formatDate } from "@/lib/utils";

export default async function AssetsFinancePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const page = Math.max(Number(sp.page) || 1, 1);
  const status = sp.status && isValidAssetStatus(sp.status) ? sp.status : undefined;

  const [result, totalValue] = await Promise.all([
    listAssetsFinance({ search: sp.search, status, page, pageSize: 20 }),
    sumAssetValue(),
  ]);

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "CashFlow", href: "/cashflow-ai" }, { label: "Asset Register" }]}
        title={<>Asset Register</>}
        description={<>Financial view over SpendIQ&apos;s real asset register — {result.total} asset{result.total === 1 ? "" : "s"}.</>}
      />

      <KpiGrid>
        <KpiCard label="Total Assets" value={result.total} accent icon={<Boxes className="size-4" />} />
        <KpiCard label="Total Book Value" value={<span>{formatMoney(totalValue)}</span>} icon={<Coins className="size-4" />} />
      </KpiGrid>

      <FmsDataTable
        columns={[
          { key: "code", header: "Asset" },
          { key: "category", header: "Category" },
          { key: "cost", header: "Purchase Cost", align: "right" },
          { key: "value", header: "Book Value", align: "right" },
          { key: "status", header: "Status" },
          { key: "purchased", header: "Purchased" },
        ]}
        rows={result.items.map((a) => ({
          id: a._id,
          href: `/cashflow-ai/assets/${a._id}`,
          cells: {
            code: `${a.assetCode} · ${a.name}`,
            category: a.category,
            cost: formatMoney(a.purchaseCost, a.currency),
            value: formatMoney(a.currentValue, a.currency),
            status: <AssetStatusBadge status={a.status} />,
            purchased: formatDate(a.purchaseDate),
          },
        }))}
        filters={[{ key: "status", label: "Status", value: sp.status ?? "", options: ASSET_STATUSES.map((s) => ({ value: s.value, label: s.label })) }]}
        search={sp.search ?? ""}
        searchPlaceholder="Asset code, name, serial number"
        page={result.page}
        totalPages={result.totalPages}
        total={result.total}
        emptyLabel="No assets found — assets are registered in SpendIQ."
      />
    </div>
  );
}
