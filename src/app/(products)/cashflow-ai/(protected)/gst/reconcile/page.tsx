import Link from "next/link";
import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import KpiCard from "@/components/products/dealflow-ai/KpiCard";
import KpiGrid from "@/components/products/dealflow-ai/KpiGrid";
import { CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Gstr2bUploadForm from "@/components/products/cashflow-ai/gst/Gstr2bUploadForm";
import { getCurrentFmsUser } from "@/lib/fms-auth";
import { canManageCompliance } from "@/lib/fms-roles";
import { formatMoney } from "@/lib/products/cashflow-ai/constants";
import { isMonth } from "@/lib/products/cashflow-ai/gst/core";
import { AMOUNT_TOLERANCE, CANNOT_MATCH_TEXT, EXTRA_MONTHS_BACK, MATCH_STATUSES, MAX_FILE_BYTES, suggestionFor, taxOfRow, type MatchStatus, type ReconRow } from "@/lib/products/cashflow-ai/gst/gstr2b-core";
import { listSupersededUploads, loadGstr2bView } from "@/lib/products/cashflow-ai/gst/gstr2b-store";
import { istToday as todayDateString } from "@/lib/products/cashflow-ai/accrual/core";

const TONE: Record<MatchStatus, string> = {
  matched: "bg-green-500/15 text-green-700 dark:text-green-400",
  amount_differs: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  in_2b_not_in_books: "bg-red-500/15 text-red-700 dark:text-red-400",
  in_books_not_in_2b: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  duplicate_in_2b: "bg-muted text-muted-foreground",
  duplicate_in_books: "bg-muted text-muted-foreground",
};

const dmy = (d: string) => d.split("-").reverse().join("-");
const th = "px-3 py-2 text-left text-xs font-medium text-muted-foreground";
const td = "px-3 py-2 align-top text-sm";

function StatusTable({ rows }: { rows: ReconRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px]">
        <thead className="border-b border-border/40">
          <tr><th className={th}>Supplier</th><th className={th}>Invoice no. / date</th><th className={`${th} text-right`}>GSTR-2B tax</th><th className={`${th} text-right`}>Books tax</th><th className={`${th} text-right`}>Difference (books − 2B)</th><th className={th}>What you can do</th></tr>
        </thead>
        <tbody className="divide-y divide-border/40">
          {rows.map((r, i) => {
            const t = r.twoB, b = r.book;
            return (
              <tr key={`${r.key}-${i}`}>
                <td className={td}>
                  <div className="font-medium">{t?.supplierName || b?.vendorName}</div>
                  <div className="text-xs text-muted-foreground">{t?.supplierGstin ?? b?.vendorGstin}</div>
                </td>
                <td className={td}>
                  {t && <div>2B: {t.invoiceNumber} · {dmy(t.invoiceDate)}</div>}
                  {b && <div>Books: {b.vendorInvoiceNumber} · {dmy(b.invoiceDate)} <span className="text-xs text-muted-foreground">({b.billNumber})</span></div>}
                </td>
                <td className={`${td} text-right`}>{t ? <><div>{formatMoney(taxOfRow(t))}</div><div className="text-xs text-muted-foreground">on {formatMoney(t.taxable)}</div></> : "—"}</td>
                <td className={`${td} text-right`}>{b ? <><div>{formatMoney(b.heads.cgst + b.heads.sgst + b.heads.igst)}</div><div className="text-xs text-muted-foreground">on {formatMoney(b.taxable)}</div></> : "—"}</td>
                <td className={`${td} text-right`}>{r.taxDiff === null ? "—" : <><div>{formatMoney(r.taxDiff)}</div><div className="text-xs text-muted-foreground">taxable {formatMoney(r.taxableDiff)}</div></>}</td>
                <td className={`${td} text-xs text-muted-foreground`}>{suggestionFor(r) ?? ""}{b && <div className="mt-1"><Link href="/cashflow-ai/gst/purchases" className="text-primary hover:underline">Purchases page</Link></div>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default async function ReconcilePage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const { month: raw } = await searchParams;
  const month = raw && isMonth(raw) ? raw : todayDateString().slice(0, 7);
  const user = await getCurrentFmsUser();
  const canUpload = user ? canManageCompliance(user) : false;
  const [view, superseded] = await Promise.all([loadGstr2bView(month), listSupersededUploads(month)]);
  const t = view?.recon.totals;

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "CashFlow", href: "/cashflow-ai" }, { label: "GST", href: "/cashflow-ai/gst" }, { label: "Match with GSTR-2B" }]}
        title={<>Match purchases with GSTR-2B</>}
        description={<>GSTR-2B is the list of purchases your vendors have reported to the GST portal for you, with the tax you may be able to claim. Upload it for a month and see which vendor bills in your books are in it, which are not, and where the amounts differ. This only compares: it does not file anything, does not change any bill, and does not decide whether credit is allowed. Your CA decides that.</>}
      />

      <GlassCard interactive={false}>
        <CardContent className="space-y-4 pt-6">
          <form method="get" className="flex flex-wrap items-end gap-3">
            <label className="text-xs text-muted-foreground">Month of the GSTR-2B<input type="month" name="month" defaultValue={month} required className="mt-1 block h-9 rounded-lg border border-border bg-background px-2 text-sm" /></label>
            <button type="submit" className="h-9 rounded-lg border border-border px-3 text-sm hover:bg-primary/5">Show</button>
          </form>
          {canUpload ? <Gstr2bUploadForm month={month} hasUpload={!!view} /> : <p className="text-sm text-muted-foreground">You can view this page. Uploading a GSTR-2B needs the compliance permission.</p>}
          <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
            <li>Download the GSTR-2B JSON for the month from the GST portal and upload it as it is (up to {MAX_FILE_BYTES / 1024 / 1024} MB). A CSV with the columns supplier GSTIN, invoice number, invoice date, taxable value, IGST, CGST, SGST also works.</li>
            <li>The JSON layout is read from the portal&apos;s published description and has not been tried against every real download. Rows that cannot be read are counted and listed, never guessed. Check the counts against the portal.</li>
            <li>A vendor&apos;s bill can appear in a later month&apos;s GSTR-2B than its bill date, so bills of this month and the previous {EXTRA_MONTHS_BACK} months are compared. Bills the vendor reported in an earlier month&apos;s GSTR-2B will show as &ldquo;not in GSTR-2B&rdquo; here.</li>
            <li>Invoice numbers are compared ignoring capitals, spaces, dashes and slashes (INV-001 = inv/001). Leading zeros count (A01 is not A1). Amounts within {formatMoney(AMOUNT_TOLERANCE)} are treated as equal.</li>
          </ul>
          {superseded.length > 0 && <p className="text-xs text-muted-foreground">Earlier files for this month, replaced: {superseded.map((u) => `${u.fileName} (${new Date(u.createdAt).toLocaleDateString("en-IN")})`).join("; ")}.</p>}
        </CardContent>
      </GlassCard>

      {!view || !t ? (
        <GlassCard interactive={false}><CardContent className="p-6 text-center text-sm text-muted-foreground">No GSTR-2B has been uploaded for {month} yet.</CardContent></GlassCard>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">
            From {view.upload.fileName}, loaded {new Date(view.upload.createdAt).toLocaleString("en-IN")}: {view.upload.rowCount} invoices{view.upload.noteCount ? `, ${view.upload.noteCount} credit/debit notes` : ""}. Compared with bills of {view.comparedMonths.join(", ")} as the books stand now.
          </p>
          {view.upload.rejectedCount > 0 && (
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs">
              {view.upload.rejectedCount} row{view.upload.rejectedCount === 1 ? "" : "s"} in the file could not be read and {view.upload.rejectedCount === 1 ? "is" : "are"} not in the comparison: {view.upload.rejected.map((r) => `${r.count} × ${r.reason}`).join("; ")}.
            </div>
          )}
          <KpiGrid>
            {MATCH_STATUSES.map((s) => (
              <KpiCard key={s.value} label={s.label} value={<span>{t[s.value].count}<span className="block text-xs font-normal text-muted-foreground">{s.value === "matched" || s.value === "amount_differs" ? `2B ${formatMoney(t[s.value].tax2B)} · books ${formatMoney(t[s.value].taxBooks)}` : `tax ${formatMoney(t[s.value].tax2B || t[s.value].taxBooks)}`}</span></span>} />
            ))}
          </KpiGrid>

          {MATCH_STATUSES.map((s) => {
            const rows = view.recon.rows.filter((r) => r.status === s.value);
            if (rows.length === 0) return null;
            return (
              <GlassCard key={s.value} interactive={false}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">{s.label} <Badge className={TONE[s.value]}>{rows.length}</Badge></CardTitle>
                  <p className="text-xs text-muted-foreground">{s.help}</p>
                </CardHeader>
                <CardContent className="p-0"><StatusTable rows={rows} /></CardContent>
              </GlassCard>
            );
          })}

          {view.recon.cannotMatch.length > 0 && (
            <GlassCard interactive={false}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">Bills that cannot appear in GSTR-2B <Badge className="bg-muted text-muted-foreground">{view.recon.cannotMatch.length}</Badge></CardTitle>
                <p className="text-xs text-muted-foreground">These bills carry GST but cannot be matched. Fix the vendor or the bill, then this page will pick it up.</p>
              </CardHeader>
              <CardContent className="p-0">
                <ul className="divide-y divide-border/40">
                  {view.recon.cannotMatch.map((c) => (
                    <li key={c.book.billId} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 text-sm">
                      <span><span className="font-medium">{c.book.vendorName}</span> · {c.book.billNumber} · {dmy(c.book.invoiceDate)}<span className="block text-xs text-muted-foreground">{CANNOT_MATCH_TEXT[c.reason]}</span></span>
                      <span>{formatMoney(c.book.heads.cgst + c.book.heads.sgst + c.book.heads.igst)}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </GlassCard>
          )}

          {view.notes.length > 0 && (
            <GlassCard interactive={false}>
              <CardHeader>
                <CardTitle>Credit and debit notes in GSTR-2B <Badge className="bg-muted text-muted-foreground">{view.notes.length}</Badge></CardTitle>
                <p className="text-xs text-muted-foreground">Shown as reported. They are not netted against anything above and not matched with your books.</p>
              </CardHeader>
              <CardContent className="p-0">
                <ul className="divide-y divide-border/40">
                  {view.notes.map((n, i) => (
                    <li key={`${n.supplierGstin}-${n.noteNumber}-${i}`} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 text-sm">
                      <span><span className="font-medium">{n.supplierName || n.supplierGstin}</span> · {n.noteType === "credit" ? "Credit note" : n.noteType === "debit" ? "Debit note" : "Note"} {n.noteNumber} · {dmy(n.invoiceDate)}<span className="block text-xs text-muted-foreground">{n.supplierGstin} · taxable {formatMoney(n.taxable)}</span></span>
                      <span>{formatMoney(taxOfRow(n))} tax</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </GlassCard>
          )}
          {view.recon.noTaxBills > 0 && <p className="text-xs text-muted-foreground">{view.recon.noTaxBills} bill{view.recon.noTaxBills === 1 ? "" : "s"} in these months carry no GST and are not expected in GSTR-2B.</p>}
        </>
      )}
    </div>
  );
}
