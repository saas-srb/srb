import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DecisionCell, DownloadCsvButton, MonthPicker } from "@/components/products/cashflow-ai/gst/PurchasesControls";
import { getCurrentFmsUser } from "@/lib/fms-auth";
import { canManageCompliance } from "@/lib/fms-roles";
import { gstinError, isMonth, supplierState, type Heads } from "@/lib/products/cashflow-ai/gst/core";
import { carriesGst, FLAG_TEXT, previousMonthOf, summarisePurchases, type Bucket } from "@/lib/products/cashflow-ai/gst/purchases-core";
import { loadPurchasesView } from "@/lib/products/cashflow-ai/gst/purchases-data";
import { istToday as todayDateString } from "@/lib/products/cashflow-ai/accrual/core";
import { formatCurrency, formatDate } from "@/lib/utils";

const money = (n: number) => formatCurrency(n);

function Card({ title, bucket, tone, hint }: { title: string; bucket: Bucket; tone?: string; hint: string }) {
  const h: Heads = bucket.heads;
  return (
    <GlassCard interactive={false}>
      <CardContent className="space-y-1 py-4">
        <div className="text-xs text-muted-foreground">{title}</div>
        <div className={`text-xl font-semibold ${tone ?? ""}`}>{money(bucket.total)}</div>
        <div className="text-xs text-muted-foreground">{bucket.count} bill{bucket.count === 1 ? "" : "s"}</div>
        <div className="text-xs text-muted-foreground">IGST {money(h.igst)} · CGST {money(h.cgst)} · SGST {money(h.sgst)}</div>
        <div className="pt-1 text-xs">{hint}</div>
      </CardContent>
    </GlassCard>
  );
}

export default async function GstPurchasesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const today = todayDateString();
  const month = sp.month && isMonth(sp.month) ? sp.month : previousMonthOf(today);
  const [user, { registration, rows, notes, vendorIds }] = await Promise.all([getCurrentFmsUser(), loadPurchasesView(month)]);
  const canManage = user ? canManageCompliance(user) : false;
  const s = summarisePurchases(rows);
  const state = supplierState(registration);
  const gstinProblem = registration.gstin ? gstinError(registration.gstin) : null;
  const flagged = rows.filter((r) => r.flags.length > 0);

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "CashFlow", href: "/cashflow-ai" }, { label: "GST" }, { label: "Purchases" }]}
        title={<>GST — Purchases &amp; input credit</>}
        description={<>Your vendor bills for the month, and for each bill that carries GST, whether you will claim the tax as credit. This prepares data for your CA; nothing is filed from here.</>}
        actions={<DownloadCsvButton month={month} />}
      />

      <MonthPicker month={month} max={today.slice(0, 7)} />

      {!registration.gstin ? (
        <GlassCard interactive={false}>
          <CardContent className="py-4 text-sm text-amber-700 dark:text-amber-400">
            Your company&apos;s GSTIN is not set, so we cannot tell whether a purchase is from your own state or another (CGST + SGST or IGST). Add it in Settings → Company details{registration.state ? "" : " (with the state)"}.
          </CardContent>
        </GlassCard>
      ) : gstinProblem ? (
        <p className="text-xs text-amber-700 dark:text-amber-400">Your company GSTIN ({registration.gstin}) does not look valid: {gstinProblem} Correct it in Settings → Company details.</p>
      ) : (
        <p className="text-xs text-muted-foreground">Registered in {state.name ?? "unknown state"} · GSTIN {registration.gstin}</p>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card title="Credit claimed (Eligible + Reverse charge)" bucket={s.claimed} tone="text-green-700 dark:text-green-400" hint="Counted in the month's credit." />
        <Card title="Blocked" bucket={s.blocked} hint="Not claimed." />
        <Card title="Not eligible" bucket={s.ineligible} hint="Not claimed." />
        <Card title="Still to review" bucket={s.toReview} tone={s.toReview.count ? "text-amber-700 dark:text-amber-400" : ""} hint="Not counted until you decide." />
      </div>
      <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
        <li>Credit is only counted for bills you mark Eligible or Reverse charge. Bills still To review are not counted.</li>
        <li>Which purchases are blocked, and which are reverse charge, are for your CA to confirm. This page does not decide them.</li>
        <li>Reverse charge: you pay the tax yourself and then claim it. We count it as credit, but the tax you owe on your side is for your CA to add to the return.</li>
        <li>Total GST on these bills is {money(s.all.total)}; {s.billsWithoutGst} bill{s.billsWithoutGst === 1 ? " carries" : "s carry"} no GST and need{s.billsWithoutGst === 1 ? "s" : ""} no decision.</li>
      </ul>

      {flagged.length > 0 && (
        <GlassCard interactive={false}>
          <CardHeader><CardTitle className="flex items-center gap-2"><AlertTriangle className="size-4 text-amber-600" /> Needs attention ({flagged.length})</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            {flagged.map((r) => {
              const vendorId = vendorIds.get(r.billId);
              return (
                <div key={r.billId} className="border-b border-border/40 pb-3 last:border-0 last:pb-0">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="font-medium">{r.vendorName} · {r.billNumber}</span>
                    <Link href={`/spendiq/invoices/${r.billId}`} className="text-xs text-primary hover:underline">Open bill</Link>
                    {vendorId && <Link href={`/spendiq/vendors/${vendorId}`} className="text-xs text-primary hover:underline">Open vendor</Link>}
                  </div>
                  <ul className="mt-1 space-y-1">
                    {r.flags.map((f) => (
                      <li key={f} className="text-xs text-muted-foreground"><span className="font-medium text-foreground">{FLAG_TEXT[f].title}.</span> {FLAG_TEXT[f].detail}</li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </CardContent>
        </GlassCard>
      )}

      <GlassCard interactive={false}>
        <CardHeader><CardTitle>Vendor bills ({rows.length})</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto p-0">
          {rows.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted-foreground">No vendor bills are dated in this month.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr className="border-b border-border/50">
                  <th className="px-3 py-2">Bill</th>
                  <th className="px-3 py-2">Vendor</th>
                  <th className="px-3 py-2">Vendor GSTIN</th>
                  <th className="px-3 py-2">Vendor invoice</th>
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2 text-right">Taxable</th>
                  <th className="px-3 py-2 text-right">CGST</th>
                  <th className="px-3 py-2 text-right">SGST</th>
                  <th className="px-3 py-2 text-right">IGST</th>
                  <th className="px-3 py-2 text-right">Invoice value</th>
                  <th className="px-3 py-2">Input credit</th>
                  <th className="px-3 py-2">Flags</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.billId} className="border-b border-border/30 align-top last:border-0">
                    <td className="px-3 py-2 whitespace-nowrap"><Link href={`/spendiq/invoices/${r.billId}`} className="text-primary hover:underline">{r.billNumber}</Link></td>
                    <td className="px-3 py-2">{r.vendorName}</td>
                    <td className="px-3 py-2 whitespace-nowrap font-mono text-xs">{r.vendorGstin ?? "—"}</td>
                    <td className="px-3 py-2">{r.vendorInvoiceNumber ?? "—"}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{formatDate(r.invoiceDate)}</td>
                    <td className="px-3 py-2 text-right">{money(r.taxable)}</td>
                    <td className="px-3 py-2 text-right">{money(r.heads.cgst)}</td>
                    <td className="px-3 py-2 text-right">{money(r.heads.sgst)}</td>
                    <td className="px-3 py-2 text-right">{money(r.heads.igst)}</td>
                    <td className="px-3 py-2 text-right font-medium">{money(r.invoiceValue)}</td>
                    <td className="px-3 py-2">
                      {carriesGst(r) ? (
                        <DecisionCell billId={r.billId} billLabel={r.billNumber} decision={r.decision} note={notes.get(r.billId) ?? ""} canManage={canManage} />
                      ) : (
                        <span className="text-muted-foreground" title="No GST on this bill, so there is nothing to decide.">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs text-amber-700 dark:text-amber-400">{r.flags.length ? r.flags.map((f) => FLAG_TEXT[f].title).join("; ") : ""}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="font-medium">
                  <td className="px-3 py-2" colSpan={5}>Total</td>
                  <td className="px-3 py-2 text-right">{money(rows.reduce((n, r) => n + r.taxable, 0))}</td>
                  <td className="px-3 py-2 text-right">{money(s.all.heads.cgst)}</td>
                  <td className="px-3 py-2 text-right">{money(s.all.heads.sgst)}</td>
                  <td className="px-3 py-2 text-right">{money(s.all.heads.igst)}</td>
                  <td className="px-3 py-2 text-right">{money(rows.reduce((n, r) => n + r.invoiceValue, 0))}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          )}
          {!canManage && rows.length > 0 && <p className="px-4 py-3 text-xs text-muted-foreground">You can view these decisions but not change them.</p>}
        </CardContent>
      </GlassCard>
    </div>
  );
}
