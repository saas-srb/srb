import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CancelTaxPaymentButton, RecordTaxPaymentForm, ScheduleEditor } from "@/components/products/cashflow-ai/income-tax/AdvanceTaxForms";
import { getCurrentFmsUser } from "@/lib/fms-auth";
import { canManageCompliance } from "@/lib/fms-roles";
import { formatMoney } from "@/lib/products/cashflow-ai/constants";
import { istToday } from "@/lib/products/cashflow-ai/accrual/core";
import { getAccrualSettings } from "@/lib/products/cashflow-ai/accrual/settings";
import { listBankAccounts } from "@/lib/products/cashflow-ai/bank-accounts";
import { financialYearOf, isFinancialYear } from "@/lib/products/cashflow-ai/tds/core";
import { isOwnBank } from "@/lib/products/cashflow-ai/tds/challans-store";
import { instalmentStatus, TAX_PAYMENT_LABEL, type InstalmentStatus, type TaxPaymentKind } from "@/lib/products/cashflow-ai/income-tax/core";
import { loadYearComputation } from "@/lib/products/cashflow-ai/income-tax/store";
import { effectiveSchedule, getSchedule, listPayments } from "@/lib/products/cashflow-ai/income-tax/payments-store";

const d = (s: string) => s.split("-").reverse().join("-");
const STATE: Record<InstalmentStatus["state"], { text: string; cls: string }> = {
  paid_up: { text: "Paid up", cls: "bg-green-500/15 text-green-700 dark:text-green-400" },
  short: { text: "Short", cls: "bg-red-500/15 text-red-700 dark:text-red-400" },
  due_soon: { text: "Due soon", cls: "bg-amber-500/15 text-amber-700 dark:text-amber-400" },
  upcoming: { text: "Upcoming", cls: "bg-muted text-muted-foreground" },
};

/** The year's tax less the credits already expected, from the computation page's working. null while that cannot be worked out. */
async function computedEstimate(fy: string): Promise<number | null> {
  try {
    const c = await loadYearComputation(fy);
    const tax = c.result.taxForYear?.total;
    return tax === undefined ? null : Math.max(0, Math.round((tax - c.credits.tdsCredit) * 100) / 100);
  } catch {
    return null;
  }
}

export default async function AdvanceTaxPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const today = istToday();
  const fy = sp.fy && isFinancialYear(sp.fy) ? sp.fy : financialYearOf(today);
  const user = await getCurrentFmsUser();
  const canDo = user ? canManageCompliance(user) : false;

  const [schedule, eff, payments, banks, accrual, computed] = await Promise.all([getSchedule(fy), effectiveSchedule(fy), listPayments(fy), listBankAccounts({ status: "active" }), getAccrualSettings(), computedEstimate(fy)]);
  const typed = schedule?.estimate ?? null;
  const estimate = typed ?? computed;
  const advancePaid = payments.filter((p) => p.status === "paid" && p.kind === "advance");
  const rows = eff.instalments.length > 0 && estimate !== null ? instalmentStatus(eff.instalments, estimate, advancePaid, today) : [];
  const bankOptions = banks.filter((b) => isOwnBank(b) && b.currency === "INR").map((b) => ({ id: b._id, name: `${b.accountName} — ${b.bankName}` }));
  const kinds = (Object.keys(TAX_PAYMENT_LABEL) as TaxPaymentKind[]).map((k) => ({ value: k, label: TAX_PAYMENT_LABEL[k] }));

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "CashFlow", href: "/cashflow-ai" }, { label: "Income tax", href: "/cashflow-ai/income-tax" }, { label: "Advance tax & payments" }]}
        title={<>Advance Tax &amp; Payments</>}
        description={<>See the dates by which advance tax falls due, record each income-tax payment you make, and see whether you are keeping up.</>}
      />

      <form method="get" className="flex flex-wrap items-end gap-3">
        <label className="text-xs text-muted-foreground">Financial year<input name="fy" defaultValue={fy} pattern="\d{4}-\d{2}" placeholder="2026-27" className="mt-1 block h-9 w-28 rounded-lg border border-border bg-background px-2 text-sm text-foreground" /></label>
        <button type="submit" className="h-9 rounded-lg border border-border px-3 text-sm hover:bg-muted">Show</button>
      </form>

      <p className="text-xs text-muted-foreground">Interest for paying late or short is worked out by your CA; this page only compares what you paid with the schedule below.</p>

      <GlassCard interactive={false}>
        <CardHeader><CardTitle>When advance tax is due — FY {fy}</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {eff.source === "rulebook" ? (
            <>
              <p className="text-sm text-muted-foreground">These are the dates the law sets, so there is nothing for you to enter. Each percentage is the total share of the year&apos;s tax due by that date, so it keeps growing from one line to the next.</p>
              <ul className="divide-y divide-border/40 text-sm">
                {eff.instalments.map((i) => (
                  <li key={i.dueDate} className="flex justify-between gap-2 py-1.5"><span>By {d(i.dueDate)}</span><span>{i.cumulativePercent}% of the year&apos;s tax</span></li>
                ))}
              </ul>
              {eff.rulebook.confirmed ? (
                <p className="text-xs text-muted-foreground">As per the law, checked{eff.rulebook.confirmedAt ? ` on ${d(eff.rulebook.confirmedAt.slice(0, 10))}` : ""}.</p>
              ) : (
                <p className="text-xs text-amber-700 dark:text-amber-400">The platform has not yet checked this year&apos;s dates; they are indicative. Dates are sometimes extended, so confirm on the income-tax portal before relying on them.</p>
              )}
            </>
          ) : (
            <p className="text-sm text-amber-700 dark:text-amber-400">You are using your own dates, not the law&apos;s. Remove all the lines below and save to go back to the law&apos;s schedule.</p>
          )}
          <details className="rounded-lg border border-border/60 p-3" open={eff.source === "company"}>
            <summary className="cursor-pointer text-sm font-medium">Advanced: use my own dates</summary>
            <div className="mt-3 space-y-3">
              <p className="text-sm text-muted-foreground">Only needed if your CA has given you different dates or shares. Each percentage is the total share due by that date.</p>
              <ScheduleEditor
                key={schedule?.updatedAt ? new Date(schedule.updatedAt).getTime() : "new"}
                fy={fy}
                initial={(schedule?.instalments ?? []).map((i) => ({ dueDate: i.dueDate, percent: String(i.cumulativePercent) }))}
                note={schedule?.note ?? ""}
                estimate={typed === null ? "" : String(typed)}
                confirmed={schedule?.confirmed ?? false}
                canEdit={canDo}
              />
              {schedule?.confirmed && schedule.confirmedAt && <p className="text-xs text-muted-foreground">Marked as confirmed with your CA on {d(new Date(schedule.confirmedAt).toISOString().slice(0, 10))}.</p>}
            </div>
          </details>
        </CardContent>
      </GlassCard>

      <GlassCard interactive={false}>
        <CardHeader><CardTitle>Are you keeping up?</CardTitle></CardHeader>
        <CardContent className="space-y-2 p-0">
          <p className="px-4 pt-3 text-sm text-muted-foreground">
            {estimate === null
              ? "The tax for this year cannot be worked out yet: choose your tax basis on the Tax for the year page, or type the tax you want to plan for in the box under “Advanced” above."
              : `Planning against ${formatMoney(estimate)} of tax to pay${typed !== null ? " (the figure you typed)" : " (the year's tax less tax deducted by customers, from the Tax for the year page)"}. Only advance tax payments are counted here.`}
          </p>
          {rows.length === 0 ? (
            <p className="px-4 pb-4 text-sm text-muted-foreground">Nothing to compare until the tax for the year is known.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-muted-foreground"><tr><th className="p-3">Due date</th><th className="p-3 text-right">Share due</th><th className="p-3 text-right">Should be paid by then</th><th className="p-3 text-right">Paid by then</th><th className="p-3 text-right">Shortfall</th><th className="p-3">Where you stand</th></tr></thead>
                <tbody className="divide-y divide-border/40">
                  {rows.map((r) => (
                    <tr key={r.dueDate}>
                      <td className="p-3">{d(r.dueDate)}</td>
                      <td className="p-3 text-right">{r.cumulativePercent}%</td>
                      <td className="p-3 text-right">{formatMoney(r.shouldHavePaid)}</td>
                      <td className="p-3 text-right">{formatMoney(r.paidByThen)}</td>
                      <td className="p-3 text-right">{r.shortfall > 0 ? formatMoney(r.shortfall) : "—"}</td>
                      <td className="p-3"><Badge className={STATE[r.state].cls}>{STATE[r.state].text}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </GlassCard>

      {canDo && (
        <GlassCard interactive={false}>
          <CardHeader><CardTitle>Record a tax payment</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {bankOptions.length === 0 ? (
              <p className="text-sm text-amber-700 dark:text-amber-400">Add an active bank account in rupees first; a payment is made out of one.</p>
            ) : (
              <RecordTaxPaymentForm fy={fy} banks={bankOptions} kinds={kinds} today={today} />
            )}
            <p className="text-xs text-muted-foreground">
              {accrual ? "Your accrual books are on: saving also takes the amount out of the bank account and records it as “Advance tax paid” in your books." : "Your accrual books are off: the payment is recorded here only, and nothing is posted to your ledger."}
            </p>
          </CardContent>
        </GlassCard>
      )}

      <GlassCard interactive={false}>
        <CardHeader><CardTitle>Payments</CardTitle></CardHeader>
        <CardContent className="p-0">
          {payments.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">No income-tax payment recorded for this year yet.</p>
          ) : (
            <ul className="divide-y divide-border/40">
              {payments.map((p) => (
                <li key={p._id} className="space-y-1 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{formatMoney(p.amount)}</span>
                      <span className="text-sm">{TAX_PAYMENT_LABEL[p.kind]}</span>
                      <Badge className={p.status === "paid" ? "bg-green-500/15 text-green-700 dark:text-green-400" : "bg-muted text-muted-foreground"}>{p.status === "paid" ? "Paid" : "Cancelled"}</Badge>
                    </div>
                    {canDo && p.status === "paid" && <CancelTaxPaymentButton id={p._id} />}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Paid {d(p.paidOn)} from {p.bankAccountLabel} · BSR {p.bsrCode} · serial {p.serial}{p.note ? ` · ${p.note}` : ""}
                    {p.status === "paid" && !p.ledgerTransactionId ? " · not posted to the ledger (accrual books were off)" : ""}
                  </p>
                  {p.status === "cancelled" && <p className="text-xs text-muted-foreground">Cancelled: {p.cancelReason}</p>}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </GlassCard>
    </div>
  );
}
