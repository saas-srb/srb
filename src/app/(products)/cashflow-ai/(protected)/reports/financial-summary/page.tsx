import PanelListFilters from "@/components/platform/panel/PanelListFilters";
import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import Link from "next/link";
import { CheckCircle2, AlertTriangle } from "lucide-react";
import { CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import KpiCard from "@/components/products/dealflow-ai/KpiCard";
import KpiGrid from "@/components/products/dealflow-ai/KpiGrid";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import { getProfitAndLoss } from "@/lib/products/cashflow-ai/reports/profit-and-loss";
import { getBalanceSheet } from "@/lib/products/cashflow-ai/reports/balance-sheet";
import { getCashFlow } from "@/lib/products/cashflow-ai/reports/cash-flow";
import { getTaxSummary } from "@/lib/products/cashflow-ai/reports/tax";
import { formatMoney } from "@/lib/products/cashflow-ai/constants";

function monthStart(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

export default async function FinancialSummaryPage() {
  const now = new Date();
  const from = monthStart();

  const [pl, balanceSheet, cashFlow, tax] = await Promise.all([
    getProfitAndLoss({ dateFrom: from, dateTo: now }),
    getBalanceSheet(now),
    getCashFlow(from, now),
    getTaxSummary({ dateFrom: from, dateTo: now }),
  ]);

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "CashFlow", href: "/cashflow-ai" }, { label: "Reports" }, { label: "Financial Summary" }]}
        title={<>Financial Summary</>}
        description={<>An executive overview for the current month, combining P&amp;L, Balance Sheet, Cash Flow and Tax — each
          figure links to its own full report for detail.</>}
      />

      <PanelListFilters>
<GlassCard interactive={false}>
        <CardHeader>
          <CardTitle>
            <Link href="/cashflow-ai/reports/profit-and-loss" className="text-primary hover:underline">Profit &amp; Loss</Link>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <KpiGrid>
            <KpiCard label="Income" value={<span>{formatMoney(pl.totalIncome)}</span>} accent />
            <KpiCard label="Expenses" value={<span>{formatMoney(pl.totalExpenses)}</span>} />
            <KpiCard label="Net Profit" value={<span>{formatMoney(pl.netProfit)}</span>} tone={pl.netProfit >= 0 ? "up" : "down"} />
          </KpiGrid>
        </CardContent>
      </GlassCard>

      <GlassCard interactive={false}>
        <CardHeader>
          <CardTitle>
            <Link href="/cashflow-ai/reports/balance-sheet" className="text-primary hover:underline">Balance Sheet</Link>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <KpiGrid>
            <KpiCard label="Total Assets" value={<span>{formatMoney(balanceSheet.totalAssets)}</span>} accent />
            <KpiCard label="Total Liabilities" value={<span>{formatMoney(balanceSheet.totalLiabilities)}</span>} />
            <KpiCard label="Total Equity" value={<span>{formatMoney(balanceSheet.totalEquity)}</span>} />
            <KpiCard
              label="Status"
              value={
                <span className="inline-flex items-center gap-1.5">
                  {balanceSheet.balanced ? <CheckCircle2 className="size-4 text-green-600" /> : <AlertTriangle className="size-4 text-destructive" />}
                  {balanceSheet.balanced ? "Balanced" : "Out of balance"}
                </span>
              }
              tone={balanceSheet.balanced ? undefined : "down"}
            />
          </KpiGrid>
        </CardContent>
      </GlassCard>

      <GlassCard interactive={false}>
        <CardHeader>
          <CardTitle>
            <Link href="/cashflow-ai/reports/cash-flow" className="text-primary hover:underline">Cash Flow</Link>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <KpiGrid>
            <KpiCard label="Opening Balance" value={<span>{formatMoney(cashFlow.openingBalance)}</span>} />
            <KpiCard label="Cash In" value={<span>{formatMoney(cashFlow.cashIn)}</span>} tone="up" />
            <KpiCard label="Cash Out" value={<span>{formatMoney(cashFlow.cashOut)}</span>} tone="down" />
            <KpiCard label="Closing Balance" value={<span>{formatMoney(cashFlow.closingBalance)}</span>} accent />
          </KpiGrid>
        </CardContent>
      </GlassCard>

      <GlassCard interactive={false}>
        <CardHeader>
          <CardTitle>
            <Link href="/cashflow-ai/reports/tax" className="text-primary hover:underline">Tax</Link>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <KpiGrid>
            <KpiCard label="Tax Collected" value={<span>{formatMoney(tax.taxCollected)}</span>} tone="up" />
            <KpiCard label="Tax Paid" value={<span>{formatMoney(tax.taxPaid)}</span>} tone="down" />
            <KpiCard label="Net Payable" value={<span>{formatMoney(tax.netPayable)}</span>} accent />
          </KpiGrid>
        </CardContent>
      </GlassCard>
</PanelListFilters>
    </div>
  );
}
