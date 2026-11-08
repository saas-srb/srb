import { AlertTriangle } from "lucide-react";
import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import StatementCsvButton from "@/components/products/cashflow-ai/tds/StatementCsvButton";
import TdsPeriodPicker from "@/components/products/cashflow-ai/tds/TdsPeriodPicker";
import { DEDUCTION_FLAG_TEXT, financialYearOf, isFinancialYear, isQuarter, quarterOf, type Quarter } from "@/lib/products/cashflow-ai/tds/core";
import { LOWER_CERT_NOTE, lowerCertDetail } from "@/lib/products/cashflow-ai/tds/certificates-core";
import { listLowerCerts } from "@/lib/products/cashflow-ai/tds/certificates-store";
import { QUARTER_LABEL, attentionItems, grandTotal, sectionSubtotals, statementLines } from "@/lib/products/cashflow-ai/tds/statement";
import { loadDeductions } from "@/lib/products/cashflow-ai/tds/store";
import { todayIst } from "@/lib/products/cashflow-ai/month-close/core";

const inr = (n: number) => n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dmy = (iso: string) => iso.split("-").reverse().join("-");
const th = "px-2 py-1.5 text-left font-medium whitespace-nowrap";
const num = "px-2 py-1.5 text-right tabular-nums whitespace-nowrap";
const td = "px-2 py-1.5";

/** This year and the four before it, plus the chosen one if it is older. */
function fyOptions(current: string, chosen: string): string[] {
  const start = Number(current.slice(0, 4));
  const list = Array.from({ length: 5 }, (_, i) => `${start - i}-${String((start - i + 1) % 100).padStart(2, "0")}`);
  return list.includes(chosen) ? list : [...list, chosen].sort().reverse();
}

export default async function TdsStatementPage({ searchParams }: { searchParams: Promise<{ fy?: string; q?: string }> }) {
  const sp = await searchParams;
  const today = todayIst();
  const fy = sp.fy && isFinancialYear(sp.fy) ? sp.fy : financialYearOf(today);
  const qn = Number(sp.q);
  const quarter: Quarter = sp.q && isQuarter(qn) ? qn : quarterOf(today);

  const [{ rows }, certs] = await Promise.all([loadDeductions(fy, quarter), listLowerCerts()]);
  const lines = statementLines(rows);
  const subtotals = sectionSubtotals(lines);
  const total = grandTotal(lines);
  const attention = attentionItems(rows, certs);

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "CashFlow", href: "/cashflow-ai" }, { label: "TDS", href: "/cashflow-ai/tds" }, { label: "Quarterly statement" }]}
        title={<>Quarterly TDS statement</>}
        description={<>The tax you deducted from vendors in {QUARTER_LABEL[quarter]} of {fy}, vendor by vendor. This is a working file for your CA: the return itself is prepared and filed by your CA or their return-preparation software, and the CSV from here is not in the government&apos;s upload format.</>}
        actions={
          <div className="flex flex-wrap items-end gap-3">
            <TdsPeriodPicker fy={fy} quarter={quarter} basePath="/cashflow-ai/tds/statement" fyOptions={fyOptions(financialYearOf(today), fy)} />
            <StatementCsvButton fy={fy} quarter={quarter} disabled={lines.length === 0} />
          </div>
        }
      />

      {attention.length > 0 && (
        <GlassCard interactive={false}>
          <CardHeader><CardTitle className="flex items-center gap-2"><AlertTriangle className="size-4 text-amber-600" /> Needs attention — {attention.length} bill{attention.length === 1 ? "" : "s"}</CardTitle></CardHeader>
          <CardContent>
            <ul className="space-y-3 text-sm">
              {attention.map(({ row, flags, lowerCert }) => (
                <li key={row.bill.billId}>
                  <span className="font-medium">{row.bill.billNumber}</span>
                  <span className="text-muted-foreground"> · {row.bill.vendorName} · {dmy(row.bill.date)}{row.section ? ` · ${row.section}` : ""}</span>
                  <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs text-muted-foreground">
                    {flags.map((f) => (
                      <li key={f}><span className="font-medium text-foreground">{DEDUCTION_FLAG_TEXT[f].title}.</span> {DEDUCTION_FLAG_TEXT[f].detail}</li>
                    ))}
                    {lowerCert && (
                      <li><span className="font-medium text-foreground">{LOWER_CERT_NOTE}</span> {lowerCertDetail(lowerCert)}</li>
                    )}
                  </ul>
                </li>
              ))}
            </ul>
          </CardContent>
        </GlassCard>
      )}

      <GlassCard interactive={false}>
        <CardHeader><CardTitle>Deductee-wise detail</CardTitle></CardHeader>
        <CardContent>
          {lines.length === 0 ? (
            <p className="text-sm text-muted-foreground">No tax was deducted from any vendor bill in this quarter.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-border/60 text-xs text-muted-foreground">
                  <tr>
                    <th className={th}>Vendor</th>
                    <th className={th}>PAN</th>
                    <th className={th}>Section</th>
                    <th className={th}>Bill no.</th>
                    <th className={th}>Date</th>
                    <th className={`${th} text-right`}>Amount paid or credited</th>
                    <th className={`${th} text-right`}>Rate</th>
                    <th className={`${th} text-right`}>Tax deducted</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l) => (
                    <tr key={l.billId} className="border-b border-border/30">
                      <td className={td}>{l.vendorName}{l.flags.length > 0 && <AlertTriangle className="ml-1 inline size-3.5 text-amber-600" aria-label="Needs attention" />}</td>
                      <td className={`${td} font-mono text-xs`}>{l.pan ?? <span className="font-sans text-amber-700 dark:text-amber-400">{l.panAsSaved ? "Wrong format" : "Missing"}</span>}</td>
                      <td className={td}>{l.section ?? "—"}</td>
                      <td className={td}>{l.billNumber}</td>
                      <td className={`${td} whitespace-nowrap`}>{dmy(l.date)}</td>
                      <td className={num}>{inr(l.paid)}</td>
                      <td className={num}>{l.rate}%</td>
                      <td className={num}>{inr(l.deducted)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t border-border/60">
                  {subtotals.map((s) => (
                    <tr key={s.section ?? "none"} className="text-muted-foreground">
                      <td className={td} colSpan={5}>Section {s.section ?? "not chosen"} ({s.count} bill{s.count === 1 ? "" : "s"})</td>
                      <td className={num}>{inr(s.paid)}</td>
                      <td className={td} />
                      <td className={num}>{inr(s.deducted)}</td>
                    </tr>
                  ))}
                  <tr className="font-semibold">
                    <td className={td} colSpan={5}>Total ({total.count} bill{total.count === 1 ? "" : "s"})</td>
                    <td className={num}>{inr(total.paid)}</td>
                    <td className={td} />
                    <td className={num}>{inr(total.deducted)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </CardContent>
      </GlassCard>

      <p className="text-xs text-muted-foreground">
        Cancelled bills are left out. The amount is the bill value before GST, and the rate is the one entered on the bill. The CSV has one row per bill with a column listing what to check; it has no total row so it can be pasted straight into a tool. A lower-deduction certificate only adds a note here: it does not change what is expected. Rates, limits and due dates are for your CA to confirm.
      </p>
    </div>
  );
}
