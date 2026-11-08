import PanelListFilters from "@/components/platform/panel/PanelListFilters";
import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import Link from "next/link";
import { Scale } from "lucide-react";
import { CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import { listBankAccounts, serializeBankAccount } from "@/lib/products/cashflow-ai/bank-accounts";
import { formatMoney } from "@/lib/products/cashflow-ai/constants";

export default async function BankReconciliationIndexPage() {
  const accounts = (await listBankAccounts()).map(serializeBankAccount);

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "CashFlow", href: "/cashflow-ai" }, { label: "Bank Reconciliation" }]}
        title={<>Bank Reconciliation</>}
        description={<>Pick a bank account to reconcile.</>}
      />

      <PanelListFilters>
{accounts.length === 0 ? (
        <GlassCard>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No bank accounts yet — create one at <Link href="/cashflow-ai/bank-accounts" className="text-primary hover:underline">/cashflow-ai/bank-accounts</Link>.
          </CardContent>
        </GlassCard>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {accounts.map((a) => (
            <Link key={a._id} href={`/cashflow-ai/bank-reconciliation/${a._id}`}>
              <GlassCard>
                <CardContent className="flex items-center justify-between gap-3 pt-6">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-foreground">{a.accountName}</p>
                    <p className="text-sm text-muted-foreground">{a.bankName}</p>
                    <p className="mt-1 text-sm font-medium">{formatMoney(a.currentBalance, a.currency)}</p>
                  </div>
                  <Scale className="size-5 shrink-0 text-muted-foreground" />
                </CardContent>
              </GlassCard>
            </Link>
          ))}
        </div>
      )}
</PanelListFilters>
    </div>
  );
}
