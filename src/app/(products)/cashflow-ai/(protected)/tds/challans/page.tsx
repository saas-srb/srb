import Link from "next/link";
import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CancelChallanButton, RecordChallanForm } from "@/components/products/cashflow-ai/tds/ChallanForms";
import { getCurrentFmsUser } from "@/lib/fms-auth";
import { canManageCompliance } from "@/lib/fms-roles";
import { formatMoney } from "@/lib/products/cashflow-ai/constants";
import { istToday } from "@/lib/products/cashflow-ai/accrual/core";
import { getAccrualSettings } from "@/lib/products/cashflow-ai/accrual/settings";
import { listBankAccounts } from "@/lib/products/cashflow-ai/bank-accounts";
import { depositPosition, deductedByMonth, financialYearOf, fyRange, isFinancialYear } from "@/lib/products/cashflow-ai/tds/core";
import { loadDeductions } from "@/lib/products/cashflow-ai/tds/store";
import { countedChallans, isOwnBank, listChallans, salaryTdsByMonth } from "@/lib/products/cashflow-ai/tds/challans-store";

const d = (s: string) => s.split("-").reverse().join("-");
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const monthLabel = (m: string) => `${MONTHS[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;

function monthsOf(fy: string): string[] {
  const y = Number(fyRange(fy).from.slice(0, 4));
  return Array.from({ length: 12 }, (_, i) => (i < 9 ? `${y}-${String(i + 4).padStart(2, "0")}` : `${y + 1}-${String(i - 8).padStart(2, "0")}`));
}

export default async function TdsChallansPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const today = istToday();
  const fy = sp.fy && isFinancialYear(sp.fy) ? sp.fy : financialYearOf(today);
  const user = await getCurrentFmsUser();
  const canDo = user ? canManageCompliance(user) : false;

  const [{ all, sections }, challans, banks, accrual, salary] = await Promise.all([loadDeductions(fy), listChallans(fy), listBankAccounts({ status: "active" }), getAccrualSettings(), salaryTdsByMonth(fy)]);
  const position = depositPosition(deductedByMonth(all), countedChallans(challans));
  const totalDeducted = position.reduce((n, p) => n + p.deducted, 0);
  const totalDeposited = position.reduce((n, p) => n + p.deposited, 0);
  const bankOptions = banks.filter((b) => isOwnBank(b) && b.currency === "INR").map((b) => ({ id: b._id, name: `${b.accountName} — ${b.bankName}` }));
  const monthOptions = monthsOf(fy).map((m) => ({ value: m, label: monthLabel(m) }));
  const thisMonth = today.slice(0, 7);
  const defaultMonth = monthOptions.some((m) => m.value === thisMonth) ? thisMonth : monthOptions[0].value;

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "CashFlow", href: "/cashflow-ai" }, { label: "TDS", href: "/cashflow-ai/tds" }, { label: "Challans" }]}
        title={<>TDS Challans (Deposits)</>}
        description={<>The tax you deducted from vendors has to be deposited with the government. Record each challan here and see, month by month, whether what you deposited matches what you deducted.</>}
      />

      <form method="get" className="flex flex-wrap items-end gap-3">
        <label className="text-xs text-muted-foreground">Financial year<input name="fy" defaultValue={fy} pattern="\d{4}-\d{2}" placeholder="2026-27" className="mt-1 block h-9 w-28 rounded-lg border border-border bg-background px-2 text-sm text-foreground" /></label>
        <button type="submit" className="h-9 rounded-lg border border-border px-3 text-sm hover:bg-muted">Show</button>
      </form>

      <p className="text-xs text-muted-foreground">Due dates for depositing TDS are set by law and change; keep them on your Filing calendar with your CA. This page only compares what was deducted with what was deposited.</p>

      <div className="grid gap-3 sm:grid-cols-3">
        {[
          ["Deducted from vendors", totalDeducted],
          ["Deposited", totalDeposited],
          [totalDeducted - totalDeposited >= 0 ? "Still to deposit" : "Deposited more than deducted", Math.abs(totalDeducted - totalDeposited)],
        ].map(([label, v]) => (
          <GlassCard key={label as string} interactive={false}><CardContent className="py-4"><div className="text-xs text-muted-foreground">{label}</div><div className="text-xl font-semibold">{formatMoney(Math.round((v as number) * 100) / 100)}</div></CardContent></GlassCard>
        ))}
      </div>

      <GlassCard interactive={false}>
        <CardHeader><CardTitle>Deducted and deposited — FY {fy}</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto p-0">
          {position.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">No TDS was deducted on vendor bills in this year, and no challan is recorded.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted-foreground"><tr><th className="p-3">Month</th><th className="p-3 text-right">Deducted</th><th className="p-3 text-right">Deposited</th><th className="p-3 text-right">Difference</th></tr></thead>
              <tbody className="divide-y divide-border/40">
                {position.map((p) => (
                  <tr key={p.month}>
                    <td className="p-3">{monthLabel(p.month)}</td>
                    <td className="p-3 text-right">{formatMoney(p.deducted)}</td>
                    <td className="p-3 text-right">{formatMoney(p.deposited)}</td>
                    <td className={`p-3 text-right ${p.difference > 0 ? "text-amber-700 dark:text-amber-400" : p.difference < 0 ? "text-blue-600 dark:text-blue-400" : "text-green-700 dark:text-green-400"}`}>
                      {p.difference > 0 ? `${formatMoney(p.difference)} still to deposit` : p.difference < 0 ? `${formatMoney(-p.difference)} deposited more than deducted` : "Matched"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </GlassCard>
      {sections.size === 0 && <p className="text-xs text-muted-foreground">Deducted amounts are what was entered on the bills. Set up your sections in <Link href="/cashflow-ai/tds/settings" className="underline">Sections &amp; rates</Link> to have them checked as well.</p>}

      {canDo && (
        <GlassCard interactive={false}>
          <CardHeader><CardTitle>Record a challan</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {bankOptions.length === 0 ? (
              <p className="text-sm text-amber-700 dark:text-amber-400">Add an active bank account in rupees first; a deposit is paid out of one.</p>
            ) : (
              <RecordChallanForm months={monthOptions} banks={bankOptions} sections={[...sections.keys()].sort()} defaultMonth={defaultMonth} today={today} />
            )}
            <p className="text-xs text-muted-foreground">
              {accrual ? "Your accrual books are on: saving also takes the amount out of the bank account and clears it from “TDS payable” in your books." : "Your accrual books are off: the challan is recorded here only, and nothing is posted to your ledger."}
            </p>
          </CardContent>
        </GlassCard>
      )}

      <GlassCard interactive={false}>
        <CardHeader><CardTitle>Challans</CardTitle></CardHeader>
        <CardContent className="p-0">
          {challans.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">No challan recorded for this year yet.</p>
          ) : (
            <ul className="divide-y divide-border/40">
              {challans.map((c) => (
                <li key={c._id} className="space-y-1 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{formatMoney(c.amount)}</span>
                      <span className="text-sm">for {monthLabel(c.forMonth)}</span>
                      <Badge className={c.status === "deposited" ? "bg-green-500/15 text-green-700 dark:text-green-400" : "bg-muted text-muted-foreground"}>{c.status === "deposited" ? "Deposited" : "Cancelled"}</Badge>
                      {c.section && <Badge className="bg-muted text-muted-foreground">{c.section}</Badge>}
                    </div>
                    {canDo && c.status === "deposited" && <CancelChallanButton id={c._id} />}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Paid {d(c.paidOn)} from {c.bankAccountLabel} · BSR {c.bsrCode} · serial {c.serial}{c.cin ? ` · CIN ${c.cin}` : ""}{c.note ? ` · ${c.note}` : ""}
                    {c.status === "deposited" && !c.ledgerTransactionId ? " · not posted to the ledger (accrual books were off)" : ""}
                  </p>
                  {c.status === "cancelled" && <p className="text-xs text-muted-foreground">Cancelled: {c.cancelReason}</p>}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </GlassCard>

      <GlassCard interactive={false}>
        <CardHeader><CardTitle>TDS on salaries (from payroll)</CardTitle></CardHeader>
        <CardContent className="space-y-2 p-0">
          <p className="px-4 pt-3 text-xs text-muted-foreground">Tax deducted from salaries is a separate stream, recorded in payroll. It is shown here for reference and is not part of the vendor figures above.</p>
          {salary.length === 0 ? (
            <p className="px-4 pb-4 text-sm text-muted-foreground">No approved payroll with salary TDS in this year.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-muted-foreground"><tr><th className="p-3">Month</th><th className="p-3 text-right">Salary TDS due</th><th className="p-3 text-right">Paid</th><th className="p-3 text-right">Balance</th></tr></thead>
                <tbody className="divide-y divide-border/40">
                  {salary.map((s) => (
                    <tr key={s.month}><td className="p-3">{monthLabel(s.month)}</td><td className="p-3 text-right">{formatMoney(s.due)}</td><td className="p-3 text-right">{formatMoney(s.paid)}</td><td className="p-3 text-right">{formatMoney(s.balance)}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="px-4 pb-4 text-xs"><Link href="/talentos/payroll/compliance" className="text-primary underline">Record or review salary TDS payments in payroll</Link></p>
        </CardContent>
      </GlassCard>
    </div>
  );
}
