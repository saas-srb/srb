import Link from "next/link";
import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import KpiCard from "@/components/products/dealflow-ai/KpiCard";
import KpiGrid from "@/components/products/dealflow-ai/KpiGrid";
import { CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import TdsCreditsUploadForm from "@/components/products/cashflow-ai/tds/TdsCreditsUploadForm";
import TdsCreditsTemplateButton from "@/components/products/cashflow-ai/tds/TdsCreditsTemplateButton";
import TdsCreditsFyPicker from "@/components/products/cashflow-ai/tds/TdsCreditsFyPicker";
import { getCurrentFmsUser } from "@/lib/fms-auth";
import { canManageCompliance } from "@/lib/fms-roles";
import { formatMoney } from "@/lib/products/cashflow-ai/constants";
import { istToday } from "@/lib/products/cashflow-ai/accrual/core";
import { financialYearOf, isFinancialYear } from "@/lib/products/cashflow-ai/tds/core";
import { CSV_COLUMNS, DATE_WINDOW_DAYS, MATCH_STATUSES, MAX_FILE_BYTES, NAME_OVERLAP, TAX_TOLERANCE, type CreditRow, type MatchStatus } from "@/lib/products/cashflow-ai/tds/credits-core";
import { listSupersededUploads, loadBooksTds, loadTdsCreditsView } from "@/lib/products/cashflow-ai/tds/credits-store";

const TONE: Record<MatchStatus, string> = {
  matched: "bg-green-500/15 text-green-700 dark:text-green-400",
  amount_differs: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  in_books_not_in_26as: "bg-red-500/15 text-red-700 dark:text-red-400",
  in_26as_not_in_books: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
};

const dmy = (d: string) => d.split("-").reverse().join("-");
const th = "px-3 py-2 text-left text-xs font-medium text-muted-foreground";
const td = "px-3 py-2 align-top text-sm";

function StatusTable({ rows }: { rows: CreditRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px]">
        <thead className="border-b border-border/40">
          <tr><th className={th}>Your receipt</th><th className={th}>In Form 26AS</th><th className={`${th} text-right`}>TDS in books</th><th className={`${th} text-right`}>Credit in 26AS</th><th className={`${th} text-right`}>Difference</th></tr>
        </thead>
        <tbody className="divide-y divide-border/40">
          {rows.map((r, i) => (
            <tr key={`${r.book?.receiptId ?? "x"}-${i}`}>
              <td className={td}>
                {r.book ? (
                  <>
                    <div className="font-medium">{r.book.customerName}</div>
                    <div className="text-xs text-muted-foreground">
                      <Link href={`/cashflow-ai/receipts/${r.book.receiptId}`} className="text-primary hover:underline">{r.book.receiptNumber}</Link> · {dmy(r.book.date)}{r.book.section ? ` · ${r.book.section}` : ""}
                    </div>
                  </>
                ) : "—"}
              </td>
              <td className={td}>
                {r.c26 ? (
                  <>
                    <div className="font-medium">{r.c26.deductorName}</div>
                    <div className="text-xs text-muted-foreground">{dmy(r.c26.date)}{r.c26.section ? ` · ${r.c26.section}` : ""}{r.c26.tan ? ` · ${r.c26.tan}` : ""}</div>
                  </>
                ) : "—"}
                {r.notes.map((n) => <div key={n} className="mt-1 text-xs text-amber-700 dark:text-amber-400">{n}</div>)}
              </td>
              <td className={`${td} text-right`}>{r.book ? formatMoney(r.book.tds) : "—"}</td>
              <td className={`${td} text-right`}>{r.c26 ? <><div>{formatMoney(r.c26.credit)}</div>{r.c26.taxDeposited !== null && <div className="text-xs text-muted-foreground">deducted {formatMoney(r.c26.taxDeducted)}</div>}</> : "—"}</td>
              <td className={`${td} text-right`}>{r.difference === null ? "—" : <><div>{formatMoney(r.difference)}</div>{r.daysApart !== null && <div className="text-xs text-muted-foreground">{r.daysApart} day{r.daysApart === 1 ? "" : "s"} apart</div>}</>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function TdsCreditsPage({ searchParams }: { searchParams: Promise<{ fy?: string }> }) {
  const { fy: raw } = await searchParams;
  const current = financialYearOf(istToday());
  const fy = raw && isFinancialYear(raw) ? raw : current;
  const user = await getCurrentFmsUser();
  const canUpload = user ? canManageCompliance(user) : false;
  const [view, superseded] = await Promise.all([loadTdsCreditsView(fy), listSupersededUploads(fy)]);
  const booksOnly = view ? null : await loadBooksTds(fy);
  const t = view?.recon.totals;
  const start = Number(current.slice(0, 4));
  const years = Array.from(new Set([...Array.from({ length: 6 }, (_, i) => { const y = start - i; return `${y}-${String((y + 1) % 100).padStart(2, "0")}`; }), fy])).sort().reverse();

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "CashFlow", href: "/cashflow-ai" }, { label: "TDS", href: "/cashflow-ai/tds" }, { label: "TDS deducted by customers (26AS)" }]}
        title={<>Match customer TDS with Form 26AS</>}
        description={<>When a customer pays you less because it deducted income tax, you can claim that tax as credit only if the customer deposited it and reported it to the tax department. It then shows in your Form 26AS (or AIS) on the tax portal. Load those credits for a year and see which of your receipts are covered, which are not, and which credits you have not recorded. This only compares: it does not change any receipt or ledger entry, and it does not decide what credit you may claim. Your CA decides that.</>}
      />

      <GlassCard interactive={false}>
        <CardContent className="space-y-4 pt-6">
          <div className="flex flex-wrap items-end gap-3">
            <TdsCreditsFyPicker fy={fy} options={years} />
            <TdsCreditsTemplateButton />
          </div>
          {canUpload ? <TdsCreditsUploadForm fy={fy} hasUpload={!!view} /> : <p className="text-sm text-muted-foreground">You can view this page. Uploading Form 26AS credits needs the compliance permission.</p>}
          <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
            <li>This version reads a plain <strong>CSV</strong> only (up to {MAX_FILE_BYTES / 1024 / 1024} MB). It does <strong>not</strong> read the tax portal&apos;s own 26AS text or PDF download, and the layout of that portal file has not been checked here. Copy the credits into the template (or export them from your CA&apos;s tool) and upload that.</li>
            <li>Columns: {CSV_COLUMNS.map((c) => `${c.header}${c.required ? "" : " (optional)"}`).join(", ")}. Dates as dd/mm/yyyy or yyyy-mm-dd; amounts may have commas. A row that cannot be read, or is dated outside {fy}, is counted with the reason and left out.</li>
            <li>The credit is the &ldquo;Tax deposited&rdquo; figure when you give it, otherwise &ldquo;Tax deducted&rdquo;.</li>
            <li>
              How rows are paired (a matching aid, not a tax rule): the customer name must share at least {Math.round(NAME_OVERLAP * 100)}% of its words with the deductor name (capitals, punctuation and words like Pvt Ltd are ignored), the dates must be within {DATE_WINDOW_DAYS} days, and the tax within {formatMoney(TAX_TOLERANCE)} to count as the same amount. Each receipt pairs with one 26AS row and the other way round. Check the pairs, especially for customers with several receipts.
            </li>
            <li>Only completed receipts dated within the year with TDS deducted are counted as your books.</li>
          </ul>
          {superseded.length > 0 && <p className="text-xs text-muted-foreground">Earlier files for this year, replaced: {superseded.map((u) => `${u.fileName} (${new Date(u.createdAt).toLocaleDateString("en-IN")})`).join("; ")}.</p>}
        </CardContent>
      </GlassCard>

      {!view || !t ? (
        <GlassCard interactive={false}>
          <CardContent className="p-6 text-center text-sm text-muted-foreground">
            No Form 26AS credits have been loaded for {fy} yet.
            {booksOnly && <span className="mt-1 block">Your books show {formatMoney(booksOnly.reduce((n, b) => n + Math.round(b.tds * 100), 0) / 100)} of TDS deducted by customers on {booksOnly.length} receipt{booksOnly.length === 1 ? "" : "s"} in {fy}.</span>}
          </CardContent>
        </GlassCard>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">
            From {view.upload.fileName}, loaded {new Date(view.upload.createdAt).toLocaleString("en-IN")}: {view.upload.rowCount} row{view.upload.rowCount === 1 ? "" : "s"}. Compared with your receipts as the books stand now.
          </p>
          {view.upload.rejectedCount > 0 && (
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs">
              {view.upload.rejectedCount} row{view.upload.rejectedCount === 1 ? "" : "s"} in the file could not be read and {view.upload.rejectedCount === 1 ? "is" : "are"} not in the comparison: {view.upload.rejected.map((r) => `${r.count} × ${r.reason}`).join("; ")}.
            </div>
          )}
          <KpiGrid>
            <KpiCard label="TDS credit in your books" value={<span>{formatMoney(t.booksTotal)}</span>} />
            <KpiCard label="Credit shown in Form 26AS" value={<span>{formatMoney(t.credit26asTotal)}</span>} />
            <KpiCard label="Difference (books − 26AS)" value={<span>{formatMoney(t.difference)}<span className="block text-xs font-normal text-muted-foreground">{t.difference > 0 ? "recorded but not shown in 26AS" : t.difference < 0 ? "shown in 26AS but not recorded" : "no difference"}</span></span>} />
            {MATCH_STATUSES.map((s) => (
              <KpiCard key={s.value} label={s.label} value={<span>{t.byStatus[s.value].count}<span className="block text-xs font-normal text-muted-foreground">{s.value === "in_26as_not_in_books" ? formatMoney(t.byStatus[s.value].credit26as) : s.value === "in_books_not_in_26as" ? formatMoney(t.byStatus[s.value].books) : `books ${formatMoney(t.byStatus[s.value].books)} · 26AS ${formatMoney(t.byStatus[s.value].credit26as)}`}</span></span>} />
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
        </>
      )}
    </div>
  );
}
