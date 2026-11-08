import Link from "next/link";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import SalesCsvButton from "@/components/products/cashflow-ai/gst/SalesCsvButton";
import SalesMonthPicker from "@/components/products/cashflow-ai/gst/SalesMonthPicker";
import { isMonth, supplierState, totalOf, type OutwardRow } from "@/lib/products/cashflow-ai/gst/core";
import { FLAG_TEXT, buildSalesRegister, placeLabel, type RegisterTotals } from "@/lib/products/cashflow-ai/gst/register";
import { loadOutwardRows, loadRegistration } from "@/lib/products/cashflow-ai/gst/store";
import { currentMonthIst } from "@/lib/products/cashflow-ai/month-close/core";

const inr = (n: number) => n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dmy = (iso: string) => iso.split("-").reverse().join("-");

function previousMonth(): string {
  const [y, m] = currentMonthIst().split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}

const th = "px-2 py-1.5 text-left font-medium whitespace-nowrap";
const num = "px-2 py-1.5 text-right tabular-nums whitespace-nowrap";
const td = "px-2 py-1.5";

function RegisterTable({ rows, totals, empty }: { rows: OutwardRow[]; totals: RegisterTotals; empty: string }) {
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">{empty}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="border-b border-border/60 text-xs text-muted-foreground">
          <tr>
            <th className={th}>Invoice no.</th>
            <th className={th}>Date</th>
            <th className={th}>Customer</th>
            <th className={th}>GSTIN</th>
            <th className={th}>Place of supply</th>
            <th className={`${th} text-right`}>Taxable</th>
            <th className={`${th} text-right`}>CGST</th>
            <th className={`${th} text-right`}>SGST</th>
            <th className={`${th} text-right`}>IGST</th>
            <th className={`${th} text-right`}>Invoice value</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.invoiceId} className="border-b border-border/30">
              <td className={td}>
                <Link href={`/cashflow-ai/invoices/${r.invoiceId}`} className="text-primary hover:underline">{r.invoiceNumber}</Link>
                {r.flags.length > 0 && <AlertTriangle className="ml-1 inline size-3.5 text-amber-600" aria-label="Needs attention" />}
              </td>
              <td className={`${td} whitespace-nowrap`}>{dmy(r.invoiceDate)}</td>
              <td className={td}>{r.customerName}</td>
              <td className={`${td} font-mono text-xs`}>{r.recipientGstin ?? "—"}</td>
              <td className={td}>{placeLabel(r.placeOfSupply)}</td>
              <td className={num}>{inr(r.taxable)}</td>
              <td className={num}>{inr(r.heads.cgst)}</td>
              <td className={num}>{inr(r.heads.sgst)}</td>
              <td className={num}>{inr(r.heads.igst)}</td>
              <td className={num}>{inr(r.invoiceValue)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot className="border-t border-border/60 font-semibold">
          <tr>
            <td className={td} colSpan={5}>Total ({totals.invoices} invoice{totals.invoices === 1 ? "" : "s"})</td>
            <td className={num}>{inr(totals.taxable)}</td>
            <td className={num}>{inr(totals.heads.cgst)}</td>
            <td className={num}>{inr(totals.heads.sgst)}</td>
            <td className={num}>{inr(totals.heads.igst)}</td>
            <td className={num}>{inr(totals.invoiceValue)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

export default async function GstSalesPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const sp = await searchParams;
  const month = sp.month && isMonth(sp.month) ? sp.month : previousMonth();
  const registration = await loadRegistration();
  const rows = await loadOutwardRows(month, registration);
  const reg = buildSalesRegister(rows);
  const supplier = supplierState(registration);
  const hasGstin = registration.gstin.trim() !== "";

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "CashFlow", href: "/cashflow-ai" }, { label: "GST", href: "/cashflow-ai/gst" }, { label: "Sales (GSTR-1)" }]}
        title={<>Sales register</>}
        description={<>Every invoice you issued in the month, split into sales to GST-registered customers (B2B) and the rest (B2C). This prepares the data for your CA. Nothing is filed from here, and any further split your return needs is for your CA to decide.</>}
        actions={
          <div className="flex flex-wrap items-center gap-3">
            <SalesMonthPicker month={month} basePath="/cashflow-ai/gst/sales" />
            <SalesCsvButton month={month} disabled={rows.length === 0} />
          </div>
        }
      />

      <GlassCard interactive={false}>
        <CardContent className="flex gap-2.5 py-3 text-sm">
          {supplier.code ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-green-600" /> : <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />}
          <div>
            {hasGstin ? <>Your GSTIN: <span className="font-mono">{registration.gstin}</span>. </> : <>No GSTIN is saved for your company. </>}
            {supplier.name ? <>Your state: {supplier.code}-{supplier.name}. </> : null}
            {!supplier.code && (
              <span className="text-amber-700 dark:text-amber-400">
                Your GSTIN or state is not set, so the place of supply and the CGST / SGST / IGST split cannot be worked out. Set it in Settings → Company details.
              </span>
            )}
          </div>
        </CardContent>
      </GlassCard>

      {reg.attention.length > 0 && (
        <GlassCard interactive={false}>
          <CardHeader><CardTitle className="flex items-center gap-2"><AlertTriangle className="size-4 text-amber-600" /> Needs attention — {reg.attention.length} invoice{reg.attention.length === 1 ? "" : "s"}</CardTitle></CardHeader>
          <CardContent>
            <ul className="space-y-3 text-sm">
              {reg.attention.map(({ row, flags }) => (
                <li key={row.invoiceId}>
                  <Link href={`/cashflow-ai/invoices/${row.invoiceId}`} className="font-medium text-primary hover:underline">{row.invoiceNumber}</Link>
                  <span className="text-muted-foreground"> · {row.customerName}</span>
                  <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs text-muted-foreground">
                    {flags.map((f) => (
                      <li key={f}><span className="font-medium text-foreground">{FLAG_TEXT[f].title}.</span> {FLAG_TEXT[f].explain}</li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          </CardContent>
        </GlassCard>
      )}

      <GlassCard interactive={false}>
        <CardHeader><CardTitle>B2B — customers with a GSTIN</CardTitle></CardHeader>
        <CardContent><RegisterTable rows={reg.b2b} totals={reg.b2bTotals} empty="No sales to GST-registered customers this month." /></CardContent>
      </GlassCard>

      <GlassCard interactive={false}>
        <CardHeader><CardTitle>B2C — customers without a GSTIN</CardTitle></CardHeader>
        <CardContent><RegisterTable rows={reg.b2c} totals={reg.b2cTotals} empty="No sales to customers without a GSTIN this month." /></CardContent>
      </GlassCard>

      <GlassCard interactive={false}>
        <CardHeader><CardTitle>By tax rate</CardTitle></CardHeader>
        <CardContent>
          {reg.byRate.length === 0 ? (
            <p className="text-sm text-muted-foreground">No sales this month.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-border/60 text-xs text-muted-foreground">
                  <tr>
                    <th className={th}>Rate</th>
                    <th className={`${th} text-right`}>Taxable</th>
                    <th className={`${th} text-right`}>CGST</th>
                    <th className={`${th} text-right`}>SGST</th>
                    <th className={`${th} text-right`}>IGST</th>
                    <th className={`${th} text-right`}>Total tax</th>
                  </tr>
                </thead>
                <tbody>
                  {reg.byRate.map((r) => (
                    <tr key={r.rate} className="border-b border-border/30">
                      <td className={td}>{r.rate}%</td>
                      <td className={num}>{inr(r.taxable)}</td>
                      <td className={num}>{inr(r.heads.cgst)}</td>
                      <td className={num}>{inr(r.heads.sgst)}</td>
                      <td className={num}>{inr(r.heads.igst)}</td>
                      <td className={num}>{inr(totalOf(r.heads))}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t border-border/60 font-semibold">
                  <tr>
                    <td className={td}>All sales ({reg.totals.invoices})</td>
                    <td className={num}>{inr(reg.totals.taxable)}</td>
                    <td className={num}>{inr(reg.totals.heads.cgst)}</td>
                    <td className={num}>{inr(reg.totals.heads.sgst)}</td>
                    <td className={num}>{inr(reg.totals.heads.igst)}</td>
                    <td className={num}>{inr(totalOf(reg.totals.heads))}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </CardContent>
      </GlassCard>

      <p className="text-xs text-muted-foreground">
        Drafts and cancelled invoices are left out. Invoices in a foreign currency are listed but not converted to rupees, so their amounts are added up as entered. The rates are the ones on your invoices; no limits or rules are applied here. The CSV has one row per invoice per tax rate, with the invoice value repeated on each row.
      </p>
    </div>
  );
}
