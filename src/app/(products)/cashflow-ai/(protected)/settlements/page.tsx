import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import KpiCard from "@/components/products/dealflow-ai/KpiCard";
import KpiGrid from "@/components/products/dealflow-ai/KpiGrid";
import { CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BookSettlementForm, SyncSettlementsForm } from "@/components/products/cashflow-ai/SettlementActions";
import { getCurrentFmsUser } from "@/lib/fms-auth";
import { canReconcile } from "@/lib/fms-roles";
import { formatMoney } from "@/lib/products/cashflow-ai/constants";
import { listBankAccounts } from "@/lib/products/cashflow-ai/bank-accounts";
import { listSettlements, unsettledPayments } from "@/lib/products/cashflow-ai/payments/settlements";
import { RAZORPAY_COLLECTIONS_ACCOUNT_NAME } from "@/lib/products/cashflow-ai/payments/payouts";
import { todayDateString } from "@/lib/products/talentos/time";

const BADGE: Record<string, { label: string; cls: string }> = {
  ready: { label: "Ready to book", cls: "bg-blue-500/15 text-blue-600 dark:text-blue-400" },
  review: { label: "Needs review", cls: "bg-amber-500/15 text-amber-700 dark:text-amber-400" },
  booking: { label: "Booking…", cls: "bg-muted text-muted-foreground" },
  booked: { label: "Booked", cls: "bg-green-500/15 text-green-700 dark:text-green-400" },
};

export default async function SettlementsPage() {
  const user = await getCurrentFmsUser();
  const canDo = user ? canReconcile(user) : false;
  const today = todayDateString();
  const [settlements, waiting, banks] = await Promise.all([listSettlements(), unsettledPayments(), listBankAccounts({ status: "active" })]);
  const own = banks.filter((b) => b.accountName !== RAZORPAY_COLLECTIONS_ACCOUNT_NAME && b.accountName !== "RazorpayX balance");
  const bankOptions = own.map((b) => ({ id: b._id, name: `${b.accountName} — ${b.bankName}` }));
  const collections = banks.find((b) => b.accountName === RAZORPAY_COLLECTIONS_ACCOUNT_NAME);
  const toBook = settlements.filter((s) => s.status === "ready").length;
  const toReview = settlements.filter((s) => s.status === "review").length;
  const from = new Date(new Date(`${today}T00:00:00Z`).getTime() - 6 * 86400000).toISOString().slice(0, 10);

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "CashFlow", href: "/cashflow-ai" }, { label: "Razorpay settlements" }]}
        title={<>Razorpay Settlements</>}
        description={<>Razorpay pays your customers&apos; money to your bank a day or two later, after taking its fee and the GST on that fee. Read the settlements here, check them against your payments, and book them so the bank, the fee and the GST all agree with the statement.</>}
      />

      <KpiGrid>
        <KpiCard label="Ready to book" value={<span>{toBook}</span>} accent />
        <KpiCard label="Need review" value={<span>{toReview}</span>} tone={toReview ? "down" : undefined} />
        <KpiCard label="Paid by customers, not yet settled" value={<span>{formatMoney(waiting.total)}</span>} />
        <KpiCard label="Held at Razorpay in your books" value={<span>{collections ? formatMoney(collections.currentBalance) : "—"}</span>} />
      </KpiGrid>

      {canDo && (
        <GlassCard interactive={false}>
          <CardHeader><CardTitle>Get settlements</CardTitle></CardHeader>
          <CardContent><SyncSettlementsForm defaultFrom={from} defaultTo={today} /></CardContent>
        </GlassCard>
      )}

      <GlassCard interactive={false}>
        <CardHeader><CardTitle>Settlements</CardTitle></CardHeader>
        <CardContent className="p-0">
          {settlements.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">No settlements read yet.{canDo ? " Choose dates above." : ""}</p>
          ) : (
            <ul className="divide-y divide-border/40">
              {settlements.map((s) => (
                <li key={s._id} className="space-y-2 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{s.settlementId}</span>
                      <Badge className={BADGE[s.status].cls}>{BADGE[s.status].label}</Badge>
                      <span className="text-xs text-muted-foreground">{s.settledOn ? s.settledOn.split("-").reverse().join("-") : "no date"}{s.utr ? ` · UTR ${s.utr}` : ""}</span>
                    </div>
                    <span className="text-lg font-semibold">{formatMoney(s.net)}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {s.paymentCount} payment{s.paymentCount === 1 ? "" : "s"} {formatMoney(s.gross)} · refunds {formatMoney(s.refunds)} · Razorpay fee {formatMoney(s.fee)} · GST on fee {formatMoney(s.tax)}
                    {s.adjustmentCount ? ` · ${s.adjustmentCount} adjustment${s.adjustmentCount === 1 ? "" : "s"} ${formatMoney(s.adjustments)}` : ""}
                  </p>
                  {s.reviewReasons.length > 0 && s.status !== "booked" && (
                    <ul className="list-disc pl-5 text-xs text-amber-700 dark:text-amber-400">
                      {s.reviewReasons.map((r) => <li key={r}>{r}</li>)}
                    </ul>
                  )}
                  {s.status === "ready" && canDo && <BookSettlementForm id={s._id} banks={bankOptions} defaultBankId={bankOptions.length === 1 ? bankOptions[0].id : ""} />}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </GlassCard>

      <GlassCard interactive={false}>
        <CardHeader><CardTitle>Paid by customers, waiting for a settlement ({waiting.list.length})</CardTitle></CardHeader>
        <CardContent className="p-0">
          {waiting.list.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">Every successful payment is in a settlement.</p>
          ) : (
            <ul className="divide-y divide-border/40 text-sm">
              {waiting.list.slice(0, 100).map((p) => (
                <li key={p.intentId} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2">
                  <span>{p.paymentNumber} · {p.customerName} <span className="text-xs text-muted-foreground">({p.gatewayPaymentId})</span></span>
                  <span>{formatMoney(p.amount)} <span className="text-xs text-muted-foreground">· paid {p.paidOn.split("-").reverse().join("-")}, {p.ageDays} day{p.ageDays === 1 ? "" : "s"} ago</span></span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </GlassCard>
    </div>
  );
}
