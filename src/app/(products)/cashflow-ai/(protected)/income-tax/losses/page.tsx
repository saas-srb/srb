import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import LossesManager from "@/components/products/cashflow-ai/income-tax/LossesManager";
import { getCurrentFmsUser } from "@/lib/fms-auth";
import { canManageCompliance } from "@/lib/fms-roles";
import { LOSS_KIND_LABEL, type LossKind } from "@/lib/products/cashflow-ai/income-tax/core";
import { listLossDocs } from "@/lib/products/cashflow-ai/income-tax/losses-store";

export default async function LossesPage() {
  const user = await getCurrentFmsUser();
  const canManage = !!user && canManageCompliance(user);
  const losses = await listLossDocs();
  const totals = (Object.keys(LOSS_KIND_LABEL) as LossKind[]).map((k) => ({ kind: k, label: LOSS_KIND_LABEL[k], available: losses.filter((l) => l.kind === k).reduce((s, l) => s + l.available, 0), count: losses.filter((l) => l.kind === k).length }));

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "CashFlow", href: "/cashflow-ai" }, { label: "Income tax", href: "/cashflow-ai/income-tax" }, { label: "Losses carried forward" }]}
        title={<>Losses carried forward</>}
        description={<>Enter each loss your CA says can be carried forward, with what is still available. The Tax for the year page lets you choose how much of each to set off.</>}
      />
      <div className="grid gap-3 sm:grid-cols-3">
        {totals.map((t) => (
          <GlassCard key={t.kind} interactive={false}>
            <CardContent className="py-4">
              <p className="text-xs text-muted-foreground">{t.label} still available</p>
              <p className="text-xl font-semibold tabular-nums">₹{t.available.toLocaleString("en-IN")}</p>
              <p className="text-xs text-muted-foreground">{t.count === 0 ? "None entered" : `${t.count} ${t.count === 1 ? "entry" : "entries"}`}</p>
            </CardContent>
          </GlassCard>
        ))}
      </div>
      <GlassCard interactive={false}>
        <CardHeader><CardTitle>Register of losses</CardTitle></CardHeader>
        <CardContent>
          <LossesManager
            losses={losses.map((l) => ({ id: l._id, fy: l.fy, kind: l.kind, amount: l.amount, available: l.available, validUntilFy: l.validUntilFy, note: l.note }))}
            canManage={canManage}
          />
        </CardContent>
      </GlassCard>
    </div>
  );
}
