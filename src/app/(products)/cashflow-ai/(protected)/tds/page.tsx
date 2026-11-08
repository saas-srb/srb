import Link from "next/link";
import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { loadDeductions } from "@/lib/products/cashflow-ai/tds/store";
import { DEDUCTION_FLAG_TEXT, financialYearOf, isFinancialYear, totalsOf } from "@/lib/products/cashflow-ai/tds/core";
import { formatMoney } from "@/lib/products/cashflow-ai/constants";
import { istToday } from "@/lib/products/cashflow-ai/accrual/core";

const d = (s: string) => s.split("-").reverse().join("-");

export default async function TdsOverviewPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const fy = sp.fy && isFinancialYear(sp.fy) ? sp.fy : financialYearOf(istToday());
  const { all, sections: sectionsByCode } = await loadDeductions(fy);
  const sections = [...sectionsByCode.values()];
  const totals = totalsOf(all);
  const flagged = all.filter((r) => r.flags.some((f) => f !== "numbers_unconfirmed"));
  const unconfirmed = sections.filter((s) => s.active && !s.confirmed);
  const bySection = new Map<string, { base: number; deducted: number; count: number }>();
  for (const r of all.filter((x) => x.deducted > 0)) {
    const k = r.section ?? "—";
    const cur = bySection.get(k) ?? { base: 0, deducted: 0, count: 0 };
    bySection.set(k, { base: Math.round((cur.base + r.bill.base) * 100) / 100, deducted: Math.round((cur.deducted + r.deducted) * 100) / 100, count: cur.count + 1 });
  }

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "CashFlow", href: "/cashflow-ai" }, { label: "TDS" }]}
        title={<>TDS — Deductions &amp; Deposits</>}
        description={<>Tax you deduct from vendor payments, checked against the rates and limits the platform publishes for the year; you do not enter them. This prepares working for your CA; nothing is filed from here. Until the platform has checked the year&apos;s figures, checks are marked indicative.</>}
      />

      <form method="get" className="flex flex-wrap items-end gap-3">
        <label className="text-xs text-muted-foreground">Financial year<input name="fy" defaultValue={fy} pattern="\d{4}-\d{2}" placeholder="2026-27" className="mt-1 block h-9 w-28 rounded-lg border border-border bg-background px-2 text-sm text-foreground" /></label>
        <button type="submit" className="h-9 rounded-lg border border-border px-3 text-sm hover:bg-muted">Show</button>
      </form>

      {sections.length === 0 && (
        <GlassCard interactive={false}>
          <CardContent className="py-4 text-sm text-amber-700 dark:text-amber-400">
            The platform has no TDS sections for this year, so nothing can be checked. See <Link href="/cashflow-ai/tds/settings" className="underline">Sections &amp; rates</Link>.
          </CardContent>
        </GlassCard>
      )}
      {unconfirmed.length > 0 && <p className="text-xs text-amber-700 dark:text-amber-400">Not yet checked: {unconfirmed.map((s) => s.code).join(", ")}. Checks on these are indicative. For the platform&apos;s figures this means the platform has not confirmed them for the year; for figures you set yourself, your CA has not.</p>}

      <div className="grid gap-3 sm:grid-cols-3">
        {[
          ["Paid or credited (before GST)", totals.paidOrCredited],
          ["Tax deducted on bills", totals.deducted],
          ["Tax the settings expect", totals.expected],
        ].map(([label, v]) => (
          <GlassCard key={label as string} interactive={false}><CardContent className="py-4"><div className="text-xs text-muted-foreground">{label}</div><div className="text-xl font-semibold">{formatMoney(v as number)}</div></CardContent></GlassCard>
        ))}
      </div>

      <GlassCard interactive={false}>
        <CardHeader><CardTitle>By section — FY {fy}</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-border/50 text-left text-xs text-muted-foreground"><th className="px-3 py-2">Section</th><th className="px-3 py-2 text-right">Bills</th><th className="px-3 py-2 text-right">Paid or credited</th><th className="px-3 py-2 text-right">Tax deducted</th></tr></thead>
            <tbody>
              {bySection.size === 0 && <tr><td colSpan={4} className="px-3 py-4 text-center text-muted-foreground">No tax deducted in this year.</td></tr>}
              {[...bySection.entries()].sort().map(([code, v]) => <tr key={code} className="border-b border-border/30"><td className="px-3 py-2">{code}</td><td className="px-3 py-2 text-right">{v.count}</td><td className="px-3 py-2 text-right">{formatMoney(v.base)}</td><td className="px-3 py-2 text-right font-medium">{formatMoney(v.deducted)}</td></tr>)}
            </tbody>
          </table>
        </CardContent>
      </GlassCard>

      <GlassCard interactive={false}>
        <CardHeader><CardTitle>Needs attention ({flagged.length})</CardTitle></CardHeader>
        <CardContent>
          {flagged.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing found that needs a second look.</p>
          ) : (
            <ul className="space-y-3 text-sm">
              {flagged.slice(0, 100).map((r) => (
                <li key={r.bill.billId}>
                  <div><Link href={`/spendiq/invoices/${r.bill.billId}`} className="font-medium text-primary hover:underline">{r.bill.billNumber}</Link> · {r.bill.vendorName} · {d(r.bill.date)} · paid {formatMoney(r.bill.base)} · deducted {formatMoney(r.deducted)}{r.expected !== null ? ` · expected ${formatMoney(r.expected)}` : ""}</div>
                  <ul className="list-disc pl-5 text-xs text-muted-foreground">
                    {r.flags.filter((f) => f !== "numbers_unconfirmed").map((f) => <li key={f}><span className="font-medium text-foreground">{DEDUCTION_FLAG_TEXT[f].title}.</span> {DEDUCTION_FLAG_TEXT[f].detail}</li>)}
                  </ul>
                </li>
              ))}
              {flagged.length > 100 && <li className="text-xs text-muted-foreground">Showing the first 100 of {flagged.length}.</li>}
            </ul>
          )}
        </CardContent>
      </GlassCard>

      <p className="text-xs text-muted-foreground">Deposits (challans) are on the <Link href={`/cashflow-ai/tds/challans?fy=${fy}`} className="text-primary hover:underline">Challans</Link> tab, and the statement for each quarter on <Link href={`/cashflow-ai/tds/statement?fy=${fy}`} className="text-primary hover:underline">Quarterly statement</Link>.</p>
    </div>
  );
}
