import PanelListFilters from "@/components/platform/panel/PanelListFilters";
import { Wallet } from "lucide-react";
import { CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import ProgressBar from "@/components/products/sprintos/ProgressBar";
import { guardPortalPage } from "@/lib/products/clientos/guard";
import { getLearnerOverview } from "@/lib/products/clientos/student";
import { PortalPageHeader } from "@/components/products/clientos/widgets";
import EmptyPortalState from "@/components/products/clientos/EmptyPortalState";
import { cn } from "@/lib/utils";
import PayWithCreditsButton from "@/components/products/clientos/PayWithCreditsButton";
import { quoteTrainingCredits } from "@/lib/wallet/panel-redemption";
import { payFeeWithCreditsAction } from "../wallet/pay-actions";
import { brandedMetadata } from "@/lib/platform/branding/metadata";

export const dynamic = "force-dynamic";
export const generateMetadata = () => brandedMetadata("Payments · {brand} {product:portal}");

function inr(n: number) {
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
}

const STATUS_CLASS: Record<string, string> = {
  paid: "bg-green-500/10 text-green-600 dark:text-green-400",
  partial: "bg-primary/10 text-primary",
  pending: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  overdue: "bg-destructive/10 text-destructive",
};

export default async function PaymentsPage() {
  const user = await guardPortalPage("intern", "trainee");
  const data = await getLearnerOverview(user.studentId);
  if (!data) return <EmptyPortalState title="No fee record" body="Your payment plan appears here once it's set up." />;

  const plans = data.payments;
  const quotes = new Map(await Promise.all(plans.map(async (p) => [p._id, await quoteTrainingCredits(user, p._id).catch(() => null)] as const)));
  const totals = plans.reduce(
    (acc, p) => {
      acc.net += Math.max(p.totalFees - p.discount, 0);
      acc.paid += p.paidAmount;
      acc.pending += p.pendingAmount;
      return acc;
    },
    { net: 0, paid: 0, pending: 0 }
  );

  return (
    <div className="space-y-5">
      <PortalPageHeader title="Fee & Payments" subtitle={`${inr(totals.paid)} paid of ${inr(totals.net)}`} />

      <PanelListFilters>
{plans.length === 0 && (
        <GlassCard>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">No payment plan on record.</CardContent>
        </GlassCard>
      )}

      {plans.map((p) => {
        const net = Math.max(p.totalFees - p.discount, 0);
        const pct = net > 0 ? Math.round((p.paidAmount / net) * 100) : 0;
        return (
          <GlassCard key={p._id}>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle className="flex items-center gap-2 text-base">
                <Wallet className="size-4" /> {p.programName}
              </CardTitle>
              <span className={cn("rounded-full px-2.5 py-0.5 text-[11px] font-semibold capitalize", STATUS_CLASS[p.status] ?? STATUS_CLASS.pending)}>
                {p.status}
              </span>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <ProgressBar value={pct} />
              <div className="grid grid-cols-3 gap-2 text-center text-xs">
                <div className="rounded-lg border border-border/50 py-1.5">
                  <p className="text-muted-foreground">Net fees</p>
                  <p className="font-semibold text-foreground">{inr(net)}</p>
                </div>
                <div className="rounded-lg border border-border/50 py-1.5">
                  <p className="text-muted-foreground">Paid</p>
                  <p className="font-semibold text-green-600 dark:text-green-400">{inr(p.paidAmount)}</p>
                </div>
                <div className="rounded-lg border border-border/50 py-1.5">
                  <p className="text-muted-foreground">Outstanding</p>
                  <p className="font-semibold text-foreground">{inr(p.pendingAmount)}</p>
                </div>
              </div>
              {(quotes.get(p._id)?.usable ?? 0) > 0 && (
                <div className="flex items-center justify-between gap-2 rounded-lg bg-primary/5 px-3 py-2 text-xs">
                  <span className="text-muted-foreground">You can cover part of this with your YO Credits.</span>
                  <PayWithCreditsButton usable={quotes.get(p._id)!.usable} action={payFeeWithCreditsAction.bind(null, p._id)} />
                </div>
              )}
              {p.installments.length > 0 && (
                <ul className="space-y-1 border-t border-border/50 pt-2 text-xs">
                  {p.installments.map((i) => (
                    <li key={i.id} className="flex items-center justify-between text-muted-foreground">
                      <span>{i.paidOn} · {i.invoiceNumber}</span>
                      <span className="font-medium text-foreground">{inr(i.amount)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </GlassCard>
        );
      })}
</PanelListFilters>
    </div>
  );
}
