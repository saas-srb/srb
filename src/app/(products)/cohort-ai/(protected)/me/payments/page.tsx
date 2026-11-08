import PanelListFilters from "@/components/platform/panel/PanelListFilters";
import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import { redirect } from "next/navigation";
import { IndianRupee, Wallet, AlarmClock, Download } from "lucide-react";
import { CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import KpiCard from "@/components/products/dealflow-ai/KpiCard";
import KpiGrid from "@/components/products/dealflow-ai/KpiGrid";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import { buttonVariants } from "@/components/ui/button";
import ProgressBar from "@/components/products/sprintos/ProgressBar";
import { PaymentStatusBadge } from "@/components/products/cohort-ai/StatusBadges";
import { getCurrentTmsUser } from "@/lib/tms-auth";
import { listPaymentsForStudent } from "@/lib/products/cohort-ai/payments";
import { formatCurrency, formatDate } from "@/lib/utils";

export default async function MyPaymentsPage() {
  const user = await getCurrentTmsUser();
  if (!user?.studentId) redirect("/cohort-ai");
  const plans = await listPaymentsForStudent(user.studentId);

  const billed = plans.reduce((s, p) => s + Math.max(p.totalFees - p.discount, 0), 0);
  const paid = plans.reduce((s, p) => s + p.paidAmount, 0);
  const pending = plans.reduce((s, p) => s + p.pendingAmount, 0);

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "Cohort AI", href: "/cohort-ai/me" }, { label: "Payments" }]}
        title={<>Payments</>}
      />

      <PanelListFilters>
<KpiGrid>
        <KpiCard label="Total Fees" value={billed} format="currency" accent icon={<IndianRupee className="size-4" />} />
        <KpiCard label="Paid" value={paid} format="currency" icon={<Wallet className="size-4" />} />
        <KpiCard label="Pending" value={pending} format="currency" tone={pending > 0 ? "down" : undefined} icon={<AlarmClock className="size-4" />} />
      </KpiGrid>

      {plans.length === 0 ? (
        <GlassCard interactive={false}>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">No fee records yet.</CardContent>
        </GlassCard>
      ) : (
        <div className="space-y-4">
          {plans.map((p) => {
            const net = Math.max(p.totalFees - p.discount, 0);
            const pct = net > 0 ? Math.round((p.paidAmount / net) * 100) : 100;
            return (
              <GlassCard key={p._id} interactive={false}>
                <CardHeader className="flex-row items-start justify-between space-y-0">
                  <div>
                    <CardTitle className="text-base">{p.programName}</CardTitle>
                    <p className="mt-0.5 text-xs text-muted-foreground">{p.batchName ?? "Fee plan"}</p>
                  </div>
                  <PaymentStatusBadge status={p.status} />
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <ProgressBar value={pct} />
                  <p className="text-xs text-muted-foreground">
                    {formatCurrency(p.paidAmount, p.currency)} paid · {formatCurrency(p.pendingAmount, p.currency)} pending
                    {" · "}of {formatCurrency(net, p.currency)}
                  </p>
                  {p.installments.length > 0 && (
                    <div className="space-y-1.5">
                      <p className="text-xs font-medium text-foreground">Receipts</p>
                      {p.installments.map((i) => (
                        <div key={i.id} className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-1.5 text-xs">
                          <span>
                            {formatCurrency(i.amount, p.currency)} · {i.method} · {formatDate(i.paidOn)}
                            <span className="ml-1.5 font-mono text-muted-foreground">{i.invoiceNumber}</span>
                          </span>
                          <a href={`/api/cohort-ai/invoices/${i.invoiceNumber}`} className={buttonVariants({ variant: "ghost", size: "sm" })}>
                            <Download className="size-3.5" data-icon="inline-start" />
                            Receipt
                          </a>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </GlassCard>
            );
          })}
        </div>
      )}
</PanelListFilters>
    </div>
  );
}
