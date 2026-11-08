import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import { Plus, Pencil, PiggyBank, TrendingDown, RefreshCw, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import KpiCard from "@/components/products/dealflow-ai/KpiCard";
import KpiGrid from "@/components/products/dealflow-ai/KpiGrid";
import UnauthorizedNotice from "@/components/products/dealflow-ai/UnauthorizedNotice";
import PrmsDataTable from "@/components/products/spendiq/PrmsDataTable";
import BudgetForm from "@/components/products/spendiq/BudgetForm";
import DeleteRowButton from "@/components/products/spendiq/DeleteRowButton";
import RefreshBudgetsButton from "@/components/products/spendiq/RefreshBudgetsButton";
import { deleteBudgetAction } from "./actions";
import { getCurrentPrmsUser } from "@/lib/prms-auth";
import { canManageFinance } from "@/lib/prms-roles";
import { searchBudgets, countBudgets, budgetTotals, serializeBudget } from "@/lib/products/spendiq/budgets";
import { listDepartments, listProjectOptions } from "@/lib/products/spendiq/pickers";
import { BUDGET_LEVELS, BUDGET_PERIODS, isValidBudgetLevel, isValidBudgetPeriod, formatMoney, type BudgetLevel, type BudgetPeriod } from "@/lib/products/spendiq/constants";
import { formatDate } from "@/lib/utils";

export default async function BudgetsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const user = await getCurrentPrmsUser();
  if (!user || !canManageFinance(user)) {
    return (
      <div className="space-y-4">
        <UnauthorizedNotice backHref="/spendiq" message="Finance access required to view budgets." />
      </div>
    );
  }

  const page = Math.max(Number(sp.page) || 1, 1);
  const level = sp.level && isValidBudgetLevel(sp.level) ? (sp.level as BudgetLevel) : undefined;
  const period = sp.period && isValidBudgetPeriod(sp.period) ? (sp.period as BudgetPeriod) : undefined;

  const [result, departments, projects, total, totals] = await Promise.all([
    searchBudgets({ search: sp.search, level, period, page, pageSize: 20 }),
    listDepartments(),
    listProjectOptions(),
    countBudgets(),
    budgetTotals(),
  ]);

  const rows = result.items.map(serializeBudget);
  const overspent = rows.filter((b) => b.remaining < 0).length;
  const dOpts = departments.map((d) => ({ _id: d._id, name: d.name }));
  const pOpts = projects.map((p) => ({ _id: p._id, name: p.name }));

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "SpendIQ", href: "/spendiq" }, { label: "Budget Management" }]}
        title={<>Budget Management</>}
        description={<>{total} budget{total === 1 ? "" : "s"}.</>}
        actions={<><div className="flex gap-2">
          <RefreshBudgetsButton />
          <BudgetForm
            departments={dOpts}
            projects={pOpts}
            trigger={
              <Button type="button" size="sm">
                <Plus className="size-3.5" data-icon="inline-start" />
                New Budget
              </Button>
            }
          />
        </div></>}
      />

      <KpiGrid>
        <KpiCard label="Allocated" value={<span>{formatMoney(totals.allocated)}</span>} accent icon={<PiggyBank className="size-4" />} />
        <KpiCard label="Consumed" value={<span>{formatMoney(totals.consumed)}</span>} icon={<TrendingDown className="size-4" />} />
        <KpiCard label="Remaining" value={<span>{formatMoney(totals.allocated - totals.consumed)}</span>} icon={<RefreshCw className="size-4" />} />
        <KpiCard label="Overspent Budgets" value={overspent} tone={overspent > 0 ? "down" : undefined} icon={<AlertTriangle className="size-4" />} />
      </KpiGrid>

      <PrmsDataTable
        columns={[
          { key: "code", header: "Budget", sortable: true },
          { key: "level", header: "Level" },
          { key: "period", header: "Period" },
          { key: "allocated", header: "Allocated", align: "right" },
          { key: "consumed", header: "Consumed", align: "right" },
          { key: "remaining", header: "Remaining", align: "right" },
          { key: "util", header: "Utilisation" },
          ...(canManageFinance(user) ? [{ key: "_actions", header: "", align: "right" as const }] : []),
        ]}
        rows={rows.map((b) => ({
          id: b._id,
          cells: {
            code: `${b.budgetCode} · ${b.name}`,
            level: b.scopeName ? `${b.level} · ${b.scopeName}` : b.level,
            period: b.periodStart && b.periodEnd ? `${formatDate(b.periodStart)} – ${formatDate(b.periodEnd)}` : "—",
            allocated: formatMoney(b.allocatedAmount, b.currency),
            consumed: formatMoney(b.consumedAmount, b.currency),
            remaining: <span className={b.remaining < 0 ? "text-destructive font-semibold" : ""}>{formatMoney(b.remaining, b.currency)}</span>,
            util: (
              <span className="flex items-center gap-2">
                <span className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
                  <span className={`block h-full ${b.utilisation > 100 ? "bg-destructive" : b.utilisation > 85 ? "bg-amber-500" : "bg-primary"}`} style={{ width: `${Math.min(b.utilisation, 100)}%` }} />
                </span>
                <span className="text-xs tabular-nums">{b.utilisation}%</span>
              </span>
            ),
            _actions: (
              <span className="flex justify-end gap-1">
                <BudgetForm budget={b} departments={dOpts} projects={pOpts} trigger={<Button type="button" variant="ghost" size="icon-xs" aria-label="Edit"><Pencil className="size-3.5" /></Button>} />
                <DeleteRowButton id={b._id} label={b.budgetCode} action={deleteBudgetAction} />
              </span>
            ),
          },
        }))}
        filters={[
          { key: "level", label: "Level", value: sp.level ?? "", options: BUDGET_LEVELS.map((l) => ({ value: l.value, label: l.label })) },
          { key: "period", label: "Period", value: sp.period ?? "", options: BUDGET_PERIODS.map((p) => ({ value: p.value, label: p.label })) },
        ]}
        search={sp.search ?? ""}
        searchPlaceholder="Code, name, scope"
        page={result.page}
        totalPages={result.totalPages}
        total={result.total}
        emptyLabel="No budgets match these filters."
      />
    </div>
  );
}
