import Link from "next/link";
import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AdjustmentsPanel, NotePanel, ProvisionPanel, RatesForm, RegimeChooser, SetOffPanel, type RegimeChoice } from "@/components/products/cashflow-ai/income-tax/YearForms";
import { getCurrentFmsUser } from "@/lib/fms-auth";
import { canManageCompliance, canManageFiscalPeriods } from "@/lib/fms-roles";
import { provisionState } from "@/lib/products/cashflow-ai/income-tax/provision";
import { loadYearComputation } from "@/lib/products/cashflow-ai/income-tax/store";
import { COMPUTATION_NOTE_TEXT } from "@/lib/products/cashflow-ai/income-tax/core";
import { surchargeRateFor, type TaxRegime } from "@/lib/products/cashflow-ai/rulebook/rules";
import { financialYearOf, isFinancialYear } from "@/lib/products/cashflow-ai/tds/core";
import { istToday } from "@/lib/products/cashflow-ai/accrual/core";
import { formatMoney } from "@/lib/products/cashflow-ai/constants";

const Row = ({ label, value, strong, hint }: { label: string; value: React.ReactNode; strong?: boolean; hint?: string }) => (
  <div className={`flex flex-wrap items-baseline justify-between gap-2 py-1.5 text-sm ${strong ? "border-t border-border/50 font-semibold" : ""}`}>
    <span>{label}{hint && <span className="ml-2 text-xs font-normal text-muted-foreground">{hint}</span>}</span>
    <span>{value}</span>
  </div>
);

const d = (s: string) => s.split("-").reverse().join("-");

/** The basis's numbers in plain words, so nobody has to read a table. */
function regimeText(r: TaxRegime): string {
  const sur = [...r.surchargeSlabs].sort((a, b) => a.above - b.above).filter((s) => s.rate > 0);
  const surText = sur.length === 0 ? "no surcharge" : sur.map((s) => (s.above <= 0 ? `a ${s.rate}% surcharge on the tax` : `a ${s.rate}% surcharge on the tax if income is above ${formatMoney(s.above)}`)).join(", ");
  return `Tax ${r.baseRate}% of income, ${surText}, then ${r.cessRate}% cess${r.matRate === null ? ", no MAT" : `. MAT of ${r.matRate}% of book profit if that comes to more`}.`;
}

export default async function IncomeTaxPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const fy = sp.fy && isFinancialYear(sp.fy) ? sp.fy : financialYearOf(istToday());
  const user = await getCurrentFmsUser();
  const canManage = user ? canManageCompliance(user) : false;
  const canPost = user ? canManageFiscalPeriods(user) : false;
  const [c, prov] = await Promise.all([loadYearComputation(fy), provisionState(fy)]);
  const r = c.result;
  const rates = c.rates;
  const choices: RegimeChoice[] = c.regimes.map((x) => ({ id: x.id, label: x.label, who: x.who, rateText: regimeText(x) }));
  // with slabs the surcharge depends on the income, so the working shows the one that applies to this year's income
  const surPct = c.regime ? surchargeRateFor(c.regime, r.taxableIncome) : rates.surchargeRate;

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "CashFlow", href: "/cashflow-ai" }, { label: "Income tax" }]}
        title={<>Income Tax — Tax for the Year</>}
        description={<>Starts from the profit in your books, applies the additions, deductions and losses you enter, and works out the tax at the rates the law sets for the basis you choose. Nothing here is filed: the return is submitted on the income-tax portal.</>}
      />

      <form method="get" className="flex flex-wrap items-end gap-3">
        <label className="text-xs text-muted-foreground">Financial year<input name="fy" defaultValue={fy} pattern="\d{4}-\d{2}" placeholder="2026-27" className="mt-1 block h-9 w-28 rounded-lg border border-border bg-background px-2 text-sm text-foreground" /></label>
        <button type="submit" className="h-9 rounded-lg border border-border px-3 text-sm hover:bg-muted">Show</button>
      </form>

      {c.book.partlyCashBasis && (
        <p className="text-sm text-amber-700 dark:text-amber-400">
          {c.book.accrualSince ? `Accrual books started on ${c.book.accrualSince.split("-").reverse().join("-")}, after this year began` : "Accrual books are not switched on"}: part or all of this year&apos;s profit is on a cash basis (income when received, cost when paid). Your CA must adjust it before it is used for tax. <Link href="/cashflow-ai/settings/accrual" className="underline">Accrual books</Link>
        </p>
      )}
      {c.book.hasUnratedForeignCurrency && <p className="text-sm text-amber-700 dark:text-amber-400">Some entries are in a foreign currency with no exchange rate set, so the profit may be off.</p>}

      {c.rulebook.confirmed ? (
        <p className="text-sm text-green-700 dark:text-green-400">The platform has checked this year&apos;s tax figures{c.rulebook.confirmedAt ? ` on ${d(c.rulebook.confirmedAt.slice(0, 10))}` : ""}. Source: {c.rulebook.source}</p>
      ) : (
        <p className="text-sm text-amber-700 dark:text-amber-400">The platform has not yet checked this year&apos;s figures; the tax below is indicative.</p>
      )}

      <GlassCard interactive={false}>
        <CardHeader><CardTitle>1. Which basis does your company pay tax under?</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">Pick the one that fits your company. The rates are set by the law and kept up to date for you; you do not enter any. If you are not sure, the “who it suits” line under each choice helps, or ask whoever files your return.</p>
          <RegimeChooser key={`${fy}-${c.regime?.id ?? "none"}`} fy={fy} choices={choices} chosen={c.regime?.id ?? null} canManage={canManage} />
          {c.ratesFrom === "none" && <p className="text-sm text-amber-700 dark:text-amber-400">No basis is chosen for this year yet, so no tax is worked out below.</p>}
          {c.regime && c.ratesFrom === "rulebook" && <p className="text-sm">Your tax this year: {regimeText(c.regime)}</p>}
          {c.ratesFrom === "override" && <p className="text-sm text-amber-700 dark:text-amber-400">You are using your own rates (set under “Advanced” below), not the law&apos;s. Choosing a basis above switches back to the law&apos;s rates.</p>}
          {c.ratesFrom === "company" && <p className="text-sm text-amber-700 dark:text-amber-400">This year was worked with rates you entered earlier ({rates.baseRate}% tax{rates.surchargeRate !== null ? `, ${rates.surchargeRate}% surcharge` : ""}{rates.cessRate !== null ? `, ${rates.cessRate}% cess` : ""}). Choose a basis above to use the law&apos;s rates instead.</p>}
          <details className="rounded-lg border border-border/60 p-3">
            <summary className="cursor-pointer text-sm font-medium">Advanced: my CA gave me different rates</summary>
            <div className="mt-3 space-y-2">
              <p className="text-xs text-muted-foreground">Only use this if your CA has told you rates that differ from the law&apos;s figures above. They replace the law&apos;s rates for this year until you choose a basis again.</p>
              <RatesForm key={`${fy}-${c.year?.rates.baseRate}-${c.year?.rates.confirmed}-${c.year?.ratesOverride}`} fy={fy} rates={c.year?.rates ?? rates} canManage={canManage} />
            </div>
          </details>
        </CardContent>
      </GlassCard>

      <GlassCard interactive={false}>
        <CardHeader><CardTitle>2. Additions and deductions</CardTitle></CardHeader>
        <CardContent><AdjustmentsPanel key={`${fy}-${c.year?.adjustments.length ?? 0}`} fy={fy} adjustments={c.year?.adjustments ?? []} canManage={canManage} /></CardContent>
      </GlassCard>

      <GlassCard interactive={false}>
        <CardHeader><CardTitle>3. Losses set off against this year&apos;s income</CardTitle></CardHeader>
        <CardContent><SetOffPanel key={`${fy}-${(c.year?.setOffs ?? []).map((s) => s.amount).join("|")}`} fy={fy} losses={c.losses} setOffs={c.year?.setOffs ?? []} canManage={canManage} /></CardContent>
      </GlassCard>

      <GlassCard interactive={false}>
        <CardHeader><CardTitle>The working</CardTitle></CardHeader>
        <CardContent>
          <Row label="Profit before tax in the books" value={formatMoney(r.bookProfit)} />
          <Row label="Add: additions" value={formatMoney(r.additions)} />
          <Row label="Less: deductions" value={formatMoney(r.deductions)} />
          <Row label="Income before losses" value={formatMoney(r.incomeBeforeLosses)} strong />
          <Row label="Less: losses set off" value={formatMoney(r.lossesSetOff)} />
          <Row label="Income the tax is worked on" value={formatMoney(r.taxableIncome)} strong />
          {r.normal ? (
            <>
              <Row label={`Tax at ${rates.baseRate}%`} value={formatMoney(r.normal.tax)} />
              <Row label={`Surcharge${surPct !== null ? ` at ${surPct}%` : ""}`} value={formatMoney(r.normal.surcharge)} />
              <Row label={`Cess${rates.cessRate !== null ? ` at ${rates.cessRate}%` : ""}`} value={formatMoney(r.normal.cess)} />
              <Row label="Tax on income (normal)" value={formatMoney(r.normal.total)} strong />
            </>
          ) : <Row label="Tax on income (normal)" value="Choose your tax basis" />}
          {r.mat && (
            <>
              <Row label={`MAT on book profit ${formatMoney(r.mat.bookProfit)}`} value={formatMoney(r.mat.total)} />
              {r.matExcess > 0 && <Row label="MAT is higher than normal tax by" value={formatMoney(r.matExcess)} hint="the difference may be a credit to carry forward: ask your CA" />}
            </>
          )}
          <Row label="Tax for the year" value={r.taxForYear ? formatMoney(r.taxForYear.total) : "—"} strong />
          <Row label="Less: advance tax paid" value={formatMoney(r.paid.advanceTax)} hint="from payments recorded on the Advance tax page" />
          <Row label="Less: TDS deducted by customers" value={formatMoney(r.paid.tdsCredit)} hint="from receipts; match with Form 26AS on the TDS page" />
          <Row label="Less: self-assessment / assessment tax paid" value={formatMoney(r.paid.selfAssessment)} />
          <Row label={r.balance === null ? "Balance" : r.balance >= 0 ? "Tax still to pay" : "Refund due"} value={r.balance === null ? "—" : formatMoney(Math.abs(r.balance))} strong />
          {r.lossOfTheYear > 0 && <Row label="Loss of the year after adjustments" value={formatMoney(r.lossOfTheYear)} />}
          {r.notes.length > 0 && (
            <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-amber-700 dark:text-amber-400">
              {r.notes.map((n) => <li key={n}>{COMPUTATION_NOTE_TEXT[n]}</li>)}
            </ul>
          )}
          <p className="mt-3 text-xs text-muted-foreground">Interest for paying late or short, rounding of the final figures, and the set-off of one kind of credit against another are done by your CA when the return is prepared.</p>
        </CardContent>
      </GlassCard>

      <GlassCard interactive={false}>
        <CardHeader><CardTitle>Tax in the books (provision)</CardTitle></CardHeader>
        <CardContent><ProvisionPanel key={`${fy}-${prov.posted}-${prov.computed}`} fy={fy} computed={prov.computed} posted={prov.posted} ratesConfirmed={prov.ratesConfirmed} canPost={canPost} /></CardContent>
      </GlassCard>

      <GlassCard interactive={false}>
        <CardHeader><CardTitle>Note for the file</CardTitle></CardHeader>
        <CardContent><NotePanel key={fy} fy={fy} note={c.year?.note ?? ""} agreed={c.year?.agreedWithCa ?? ""} canManage={canManage} /></CardContent>
      </GlassCard>
    </div>
  );
}
