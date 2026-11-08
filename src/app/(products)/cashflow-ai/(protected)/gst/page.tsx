import Link from "next/link";
import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { loadGstr3b } from "@/lib/products/cashflow-ai/gst/store";
import { isMonth, supplierState, totalOf, type Heads } from "@/lib/products/cashflow-ai/gst/core";
import { getAccrualSettings } from "@/lib/products/cashflow-ai/accrual/settings";
import { formatMoney } from "@/lib/products/cashflow-ai/constants";
import { istToday } from "@/lib/products/cashflow-ai/accrual/core";

function previousMonth(): string {
  const [y, m] = istToday().split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}

const HeadCells = ({ h }: { h: Heads }) => (
  <>
    <td className="px-3 py-2 text-right">{formatMoney(h.igst)}</td>
    <td className="px-3 py-2 text-right">{formatMoney(h.cgst)}</td>
    <td className="px-3 py-2 text-right">{formatMoney(h.sgst)}</td>
    <td className="px-3 py-2 text-right font-medium">{formatMoney(totalOf(h))}</td>
  </>
);

export default async function GstSummaryPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const month = sp.month && isMonth(sp.month) ? sp.month : previousMonth();
  const [{ working: w, registration, creditNotes, debitNotes, skippedNotes }, accrual] = await Promise.all([loadGstr3b(month), getAccrualSettings()]);
  const state = supplierState(registration);

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "CashFlow", href: "/cashflow-ai" }, { label: "GST" }]}
        title={<>GST — Monthly Summary</>}
        description={<>The figures behind your GSTR-3B for one month, worked out from your invoices and vendor bills. This prepares the numbers for your CA; nothing is filed from here, and the order in which credit is set off against tax is the CA&apos;s call.</>}
      />

      <form method="get" className="flex flex-wrap items-end gap-3">
        <label className="text-xs text-muted-foreground">Month<input type="month" name="month" defaultValue={month} className="mt-1 block h-9 rounded-lg border border-border bg-background px-2 text-sm text-foreground" /></label>
        <button type="submit" className="h-9 rounded-lg border border-border px-3 text-sm hover:bg-muted">Show</button>
      </form>

      {!registration.gstin && (
        <GlassCard interactive={false}>
          <CardContent className="py-4 text-sm text-amber-700 dark:text-amber-400">
            Your company&apos;s GSTIN is not set, so the place of supply and the CGST / SGST / IGST split cannot be worked out reliably. Add it in Settings → Company details{registration.state ? "" : " (with the state)"}.
          </CardContent>
        </GlassCard>
      )}
      {registration.gstin && <p className="text-xs text-muted-foreground">Registered in {state.name ?? "unknown state"} · GSTIN {registration.gstin}</p>}
      {!accrual && (
        <p className="text-xs text-amber-700 dark:text-amber-400">
          Accrual books are off, so the ledger does not hold GST output / input yet. This page still reads the invoices and bills directly. <Link href="/cashflow-ai/settings/accrual" className="underline">Switch them on</Link> to get the ledger to agree.
        </p>
      )}

      <GlassCard interactive={false}>
        <CardHeader><CardTitle>Tax on sales ({w.outward.invoices} invoice{w.outward.invoices === 1 ? "" : "s"}{w.outward.creditNotes.count ? `, less ${w.outward.creditNotes.count} credit note${w.outward.creditNotes.count === 1 ? "" : "s"}` : ""}, taxable {formatMoney(w.outward.taxable)})</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-border/50 text-left text-xs text-muted-foreground"><th className="px-3 py-2">Rate</th><th className="px-3 py-2 text-right">Taxable value</th><th className="px-3 py-2 text-right">IGST</th><th className="px-3 py-2 text-right">CGST</th><th className="px-3 py-2 text-right">SGST</th><th className="px-3 py-2 text-right">Total tax</th></tr></thead>
            <tbody>
              {w.outward.byRate.length === 0 && <tr><td colSpan={6} className="px-3 py-4 text-center text-muted-foreground">No sales in this month.</td></tr>}
              {w.outward.byRate.map((r) => (
                <tr key={r.rate} className="border-b border-border/30"><td className="px-3 py-2">{r.rate}%</td><td className="px-3 py-2 text-right">{formatMoney(r.taxable)}</td><HeadCells h={r.heads} /></tr>
              ))}
              <tr className="font-semibold"><td className="px-3 py-2">Total</td><td className="px-3 py-2 text-right">{formatMoney(w.outward.taxable)}</td><HeadCells h={w.outward.heads} /></tr>
            </tbody>
          </table>
        </CardContent>
      </GlassCard>

      {(creditNotes.length > 0 || debitNotes.length > 0 || skippedNotes > 0) && (
        <GlassCard interactive={false}>
          <CardHeader><CardTitle>Credit notes and debit notes in this month</CardTitle></CardHeader>
          <CardContent className="space-y-1 text-sm">
            {creditNotes.map((c) => <p key={c.noteId}>Credit note {c.noteNumber} on {c.invoiceNumber} ({c.customerName}): sales and tax reduced by {formatMoney(c.amount)} (tax {formatMoney(totalOf(c.heads))}). It is already taken off the figures above.</p>)}
            {debitNotes.map((d) => <p key={d.billId}>Debit note {d.billNumber} ({d.vendorName}): purchases and tax increased by {formatMoney(d.invoiceValue)} (tax {formatMoney(totalOf(d.heads))}), with the same credit decision as its bill.</p>)}
            {skippedNotes > 0 && <p className="text-amber-700 dark:text-amber-400">{skippedNotes} note{skippedNotes === 1 ? "" : "s"} could not be used because the invoice or bill it refers to no longer exists.</p>}
          </CardContent>
        </GlassCard>
      )}

      <GlassCard interactive={false}>
        <CardHeader><CardTitle>Input tax credit on purchases</CardTitle></CardHeader>
        <CardContent className="space-y-3 overflow-x-auto p-0 pb-3">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-border/50 text-left text-xs text-muted-foreground"><th className="px-3 py-2">What</th><th className="px-3 py-2 text-right">IGST</th><th className="px-3 py-2 text-right">CGST</th><th className="px-3 py-2 text-right">SGST</th><th className="px-3 py-2 text-right">Total</th></tr></thead>
            <tbody>
              {([
                ["Credit counted (Eligible + Reverse charge)", w.itc.claimed],
                ["  of which reverse charge", w.itc.reverseCharge],
                ["Blocked", w.itc.blocked],
                ["Not eligible", w.itc.ineligible],
                [`Still to review (${w.itc.toReviewBills} bill${w.itc.toReviewBills === 1 ? "" : "s"}): not counted`, w.itc.toReview],
              ] as [string, Heads][]).map(([label, h]) => (
                <tr key={label} className="border-b border-border/30"><td className="whitespace-pre px-3 py-2">{label}</td><td className="px-3 py-2 text-right">{formatMoney(h.igst)}</td><td className="px-3 py-2 text-right">{formatMoney(h.cgst)}</td><td className="px-3 py-2 text-right">{formatMoney(h.sgst)}</td><td className="px-3 py-2 text-right font-medium">{formatMoney(totalOf(h))}</td></tr>
              ))}
            </tbody>
          </table>
          <p className="px-3 text-xs text-muted-foreground">Decide each bill on the <Link href={`/cashflow-ai/gst/purchases?month=${month}`} className="text-primary hover:underline">Purchases</Link> page. Only bills marked Eligible or Reverse charge are counted.</p>
        </CardContent>
      </GlassCard>

      <GlassCard interactive={false}>
        <CardHeader><CardTitle>Tax less credit, head by head</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="grid grid-cols-3 gap-3">
            {(["igst", "cgst", "sgst"] as const).map((k) => (
              <div key={k} className="rounded-xl border border-border/50 p-3">
                <div className="text-xs uppercase text-muted-foreground">{k}</div>
                <div className={`text-lg font-semibold ${w.netByHead[k] < 0 ? "text-green-700 dark:text-green-400" : ""}`}>{formatMoney(Math.abs(w.netByHead[k]))}</div>
                <div className="text-xs text-muted-foreground">{w.netByHead[k] < 0 ? "credit left over" : "tax to pay before set-off"}</div>
              </div>
            ))}
          </div>
          {totalOf(w.reverseChargeLiability) > 0 && <p className="text-xs">Reverse charge: {formatMoney(totalOf(w.reverseChargeLiability))} of tax is added to what you owe above (you pay it yourself, in cash) and the same amount is counted as credit. Your CA reports it in the return.</p>}
          <p className="text-xs text-muted-foreground">IGST credit can be used for CGST and SGST and the other way round only as the law allows. That set-off is not worked out here: give these figures to your CA.</p>
        </CardContent>
      </GlassCard>

      <p className="text-xs text-muted-foreground">Exports, supplies to special economic zones and exempt or nil-rated supplies are not separated here: they show as ordinary sales at the rate on the invoice. Ask your CA how to report them.</p>

      {(w.flaggedInvoices > 0 || w.flaggedBills > 0) && (
        <p className="text-sm text-amber-700 dark:text-amber-400">
          {w.flaggedInvoices} invoice{w.flaggedInvoices === 1 ? "" : "s"} and {w.flaggedBills} bill{w.flaggedBills === 1 ? "" : "s"} have a problem that can change these figures (missing GSTIN, unknown place of supply, missing HSN / SAC …). See <Link href={`/cashflow-ai/gst/sales?month=${month}`} className="underline">Sales</Link> and <Link href={`/cashflow-ai/gst/purchases?month=${month}`} className="underline">Purchases</Link>.
        </p>
      )}
    </div>
  );
}
