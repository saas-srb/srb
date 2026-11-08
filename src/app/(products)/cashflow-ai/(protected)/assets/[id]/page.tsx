import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import { notFound } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import { AssetStatusBadge } from "@/components/products/spendiq/StatusBadges";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import AssetDisposalForm from "@/components/products/cashflow-ai/AssetDisposalForm";
import AssetExpenseForm from "@/components/products/cashflow-ai/AssetExpenseForm";
import { getCurrentFmsUser } from "@/lib/fms-auth";
import { canManageTransactions } from "@/lib/fms-roles";
import { getAssetFinanceDetail } from "@/lib/products/cashflow-ai/asset-finance";
import { serializeAssetDisposal } from "@/lib/products/cashflow-ai/asset-disposals";
import { listAssetExpensesForAsset, serializeAssetExpense, ASSET_EXPENSE_CATEGORIES } from "@/lib/products/cashflow-ai/asset-expenses";
import { listFundAccountOptions } from "@/lib/products/cashflow-ai/fund-accounts";
import { listVendorOptions } from "@/lib/products/spendiq/vendors";
import { formatMoney } from "@/lib/products/spendiq/constants";
import { formatDate, formatDateTime } from "@/lib/utils";

export default async function AssetFinanceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentFmsUser();
  const [detail, fundAccounts, vendors, assetExpensesRaw] = await Promise.all([
    getAssetFinanceDetail(id),
    listFundAccountOptions(),
    listVendorOptions({ activeOnly: true }),
    listAssetExpensesForAsset(id),
  ]);
  if (!detail) notFound();
  const { asset, disposal } = detail;
  const canManage = user ? canManageTransactions(user) : false;
  const serializedDisposal = disposal ? serializeAssetDisposal(disposal) : null;
  const assetExpenses = assetExpensesRaw.map(serializeAssetExpense);
  const vendorOpts = vendors.map((v) => ({ _id: v._id, label: v.companyName }));

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "CashFlow", href: "/cashflow-ai" }, { label: "Asset Register", href: "/cashflow-ai/assets" }, { label: asset.assetCode }]}
        title={<>{asset.name}</>}
        description={<>{asset.assetCode} · {asset.category}</>}
        actions={<><AssetStatusBadge status={asset.status} /></>}
      />

      {canManage && asset.status !== "retired" && (
        <GlassCard>
          <CardHeader><CardTitle>Actions</CardTitle></CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <AssetExpenseForm
              assetId={asset._id}
              assetName={asset.name}
              currency={asset.currency}
              vendors={vendorOpts}
              fundAccounts={fundAccounts}
              trigger={
                <Button type="button" size="sm">
                  <Plus className="size-3.5" data-icon="inline-start" />
                  Record Expense
                </Button>
              }
            />
            {!disposal && (
              <AssetDisposalForm
                assetId={asset._id}
                assetName={asset.name}
                bookValue={asset.currentValue}
                currency={asset.currency}
                fundAccounts={fundAccounts}
                trigger={
                  <Button type="button" size="sm" variant="outline">
                    <Plus className="size-3.5" data-icon="inline-start" />
                    Dispose Asset
                  </Button>
                }
              />
            )}
          </CardContent>
        </GlassCard>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <GlassCard>
          <CardHeader><CardTitle>Purchase Details</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label="Purchase Date" value={formatDate(asset.purchaseDate)} />
            <Row label="Purchase Cost" value={formatMoney(asset.purchaseCost, asset.currency)} />
            <Row label="Vendor" value={asset.vendorName ?? "—"} />
            <Row label="Location" value={asset.officeLocation ?? "—"} />
            <Row label="Assigned To" value={asset.assignedEmployeeName ?? "—"} />
          </CardContent>
        </GlassCard>

        <GlassCard>
          <CardHeader><CardTitle>Depreciation</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label="Method" value={asset.depreciationMethod.toUpperCase()} />
            <Row label="Useful Life" value={`${asset.usefulLifeYears} years`} />
            <Row label="Salvage Value" value={formatMoney(asset.salvageValue, asset.currency)} />
            <Row label="Current Book Value" value={formatMoney(asset.currentValue, asset.currency)} />
          </CardContent>
        </GlassCard>
      </div>

      <GlassCard interactive={false}>
        <CardHeader><CardTitle>Asset Expenses</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Category</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Vendor</TableHead>
                <TableHead>Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {assetExpenses.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground">No maintenance, insurance or other ongoing costs recorded yet.</TableCell>
                </TableRow>
              )}
              {assetExpenses.map((e) => (
                <TableRow key={e._id}>
                  <TableCell>{ASSET_EXPENSE_CATEGORIES.find((c) => c.value === e.category)?.label ?? e.category}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatMoney(e.amount, e.currency)}</TableCell>
                  <TableCell className="text-muted-foreground">{e.vendorName ?? "—"}</TableCell>
                  <TableCell>{formatDate(e.expenseDate)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </GlassCard>

      {serializedDisposal && (
        <GlassCard>
          <CardHeader><CardTitle>Disposal</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label="Disposal Number" value={serializedDisposal.disposalNumber} />
            <Row label="Disposal Date" value={formatDate(serializedDisposal.disposalDate)} />
            <Row label="Disposal Value" value={formatMoney(serializedDisposal.disposalValue, asset.currency)} />
            <Row label="Book Value at Disposal" value={formatMoney(serializedDisposal.bookValueAtDisposal, asset.currency)} />
            <Row
              label="Gain / Loss"
              value={
                <span className={serializedDisposal.gainLoss >= 0 ? "text-green-600 dark:text-green-400" : "text-destructive"}>
                  {formatMoney(serializedDisposal.gainLoss, asset.currency)}
                </span>
              }
            />
            <Row label="Reason" value={serializedDisposal.reason} />
          </CardContent>
        </GlassCard>
      )}

      {asset.notes && (
        <GlassCard>
          <CardHeader><CardTitle>Notes</CardTitle></CardHeader>
          <CardContent className="text-sm whitespace-pre-wrap">{asset.notes}</CardContent>
        </GlassCard>
      )}

      <p className="text-xs text-muted-foreground">Created {formatDateTime(asset.createdAt)}. Asset data is owned by SpendIQ.</p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium text-foreground">{value}</span>
    </div>
  );
}
