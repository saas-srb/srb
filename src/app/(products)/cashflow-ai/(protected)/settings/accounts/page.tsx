import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import { Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import AccountForm from "@/components/products/cashflow-ai/AccountForm";
import SeedDefaultsButton from "@/components/products/cashflow-ai/SeedDefaultsButton";
import { getCurrentFmsUser } from "@/lib/fms-auth";
import { canManageAccounts } from "@/lib/fms-roles";
import { listAccounts, serializeAccount } from "@/lib/products/cashflow-ai/accounts";
import { ACCOUNT_TYPES } from "@/lib/products/cashflow-ai/constants";

const TYPE_BADGE: Record<string, string> = {
  asset: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  liability: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  equity: "bg-purple-500/15 text-purple-600 dark:text-purple-400",
  income: "bg-green-500/15 text-green-600 dark:text-green-400",
  expense: "bg-destructive/15 text-destructive",
};

export default async function ChartOfAccountsPage() {
  const user = await getCurrentFmsUser();
  const canManage = user ? canManageAccounts(user) : false;

  const accounts = await listAccounts();
  const byType = ACCOUNT_TYPES.map((t) => ({
    type: t,
    accounts: accounts.filter((a) => a.type === t.value).map(serializeAccount),
  }));

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "CashFlow", href: "/cashflow-ai" }, { label: "Settings" }, { label: "Chart of Accounts" }]}
        title={<>Chart of Accounts</>}
        description={<>{accounts.length} account{accounts.length === 1 ? "" : "s"} configured.</>}
        actions={<>{canManage && (
          <div className="flex gap-2">
            <SeedDefaultsButton />
            <AccountForm
              trigger={
                <Button type="button" size="sm">
                  <Plus className="size-3.5" data-icon="inline-start" />
                  New Account
                </Button>
              }
            />
          </div>
        )}</>}
      />

      {accounts.length === 0 && (
        <GlassCard>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No accounts configured yet. {canManage ? "Click “Seed Defaults” to add the standard Chart of Accounts." : "Ask a Finance Admin to configure the chart of accounts."}
          </CardContent>
        </GlassCard>
      )}

      {byType.map(
        (group) =>
          group.accounts.length > 0 && (
            <GlassCard key={group.type.value}>
              <CardHeader><CardTitle>{group.type.label}</CardTitle></CardHeader>
              <CardContent>
                <ul className="divide-y divide-border/40">
                  {group.accounts.map((a) => (
                    <li key={a._id} className="flex items-center justify-between gap-3 py-2 text-sm">
                      <div className="flex items-center gap-2">
                        <Badge className={TYPE_BADGE[a.type]}>{a.code}</Badge>
                        <span className="font-medium text-foreground">{a.name}</span>
                        {!a.isActive && <span className="text-xs text-muted-foreground">(inactive)</span>}
                      </div>
                      {canManage && (
                        <AccountForm
                          account={a}
                          trigger={
                            <Button type="button" size="sm" variant="ghost">
                              Edit
                            </Button>
                          }
                        />
                      )}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </GlassCard>
          )
      )}
    </div>
  );
}
