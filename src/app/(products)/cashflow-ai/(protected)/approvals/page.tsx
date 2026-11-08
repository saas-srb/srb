import PanelListFilters from "@/components/platform/panel/PanelListFilters";
import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import Link from "next/link";
import { CheckSquare, ArrowLeftRight, RotateCcw, Receipt } from "lucide-react";
import { CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import KpiCard from "@/components/products/dealflow-ai/KpiCard";
import KpiGrid from "@/components/products/dealflow-ai/KpiGrid";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import { listPendingApprovals } from "@/lib/products/cashflow-ai/approvals";
import { formatDateTime } from "@/lib/utils";

const KIND_META: Record<string, { label: string; icon: typeof ArrowLeftRight; badgeClass: string }> = {
  transaction: { label: "Transaction", icon: ArrowLeftRight, badgeClass: "bg-blue-500/15 text-blue-600 dark:text-blue-400" },
  refund: { label: "Refund", icon: RotateCcw, badgeClass: "bg-amber-500/15 text-amber-600 dark:text-amber-400" },
  expense: { label: "Expense Claim", icon: Receipt, badgeClass: "bg-secondary/60 text-secondary-foreground" },
};

export default async function ApprovalsPage() {
  const items = await listPendingApprovals();
  const byKind = items.reduce<Record<string, number>>((acc, i) => ({ ...acc, [i.kind]: (acc[i.kind] ?? 0) + 1 }), {});

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "CashFlow", href: "/cashflow-ai" }, { label: "Approvals" }]}
        title={<>Pending Approvals</>}
        description={<>An aggregated inbox across CashFlow transactions, refunds, and SpendIQ personal expense claims. Each item links to its
          own real detail page for the actual approve/reject action.</>}
      />

      <PanelListFilters>
<KpiGrid>
        <KpiCard label="Total Pending" value={items.length} accent icon={<CheckSquare className="size-4" />} />
        <KpiCard label="Transactions" value={byKind.transaction ?? 0} icon={<ArrowLeftRight className="size-4" />} />
        <KpiCard label="Refunds" value={byKind.refund ?? 0} icon={<RotateCcw className="size-4" />} />
        <KpiCard label="Expense Claims" value={byKind.expense ?? 0} icon={<Receipt className="size-4" />} />
      </KpiGrid>

      <GlassCard interactive={false}>
        <CardContent className="max-h-[70vh] overflow-auto p-0">
          {items.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">Nothing pending approval right now.</p>
          ) : (
            <ul className="divide-y divide-border/40">
              {items.map((item) => {
                const meta = KIND_META[item.kind];
                const Icon = meta.icon;
                return (
                  <li key={`${item.kind}-${item.id}`} className="flex items-center justify-between gap-3 p-4 text-sm">
                    <div className="flex min-w-0 items-center gap-3">
                      <Icon className="size-4 shrink-0 text-muted-foreground" />
                      <div className="min-w-0">
                        <Link href={item.href} className="font-medium text-primary hover:underline">
                          {item.number}
                        </Link>
                        <p className="truncate text-muted-foreground">{item.label} · {item.raisedBy}</p>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <Badge className={meta.badgeClass}>{meta.label}</Badge>
                      <span className="font-medium text-foreground">{item.amount}</span>
                      <span className="hidden text-xs text-muted-foreground sm:inline">{formatDateTime(item.createdAt)}</span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </GlassCard>
</PanelListFilters>
    </div>
  );
}
