import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Download, FileText, Receipt } from "lucide-react";
import { CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import SyncTransactionsButton from "./SyncTransactionsButton";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { getCurrentHubUser } from "@/lib/hub-auth";
import { formatInvoiceDate } from "@/lib/platform/billing/invoices";
import { getCompanyBillingHistory } from "@/lib/products/commandos/company";
import { listCompanyTransactions } from "@/lib/platform/billing/transactions";
import { currentCompanyId } from "@/lib/platform/tenancy/context";
import { formatMoney } from "@/lib/platform/billing/types";

export const metadata: Metadata = { title: "Invoices", robots: { index: false, follow: false } };

const STATUS: Record<string, string> = { paid: "Paid", unpaid: "Unpaid", void: "Void" };

export default async function BillingInvoicesPage() {
  const user = await getCurrentHubUser();
  if (!user) redirect("/commandos/login");
  if (!user.roles.includes("super_admin")) redirect("/commandos");
  const { invoices, payments } = await getCompanyBillingHistory();
  const ledger = await listCompanyTransactions(await currentCompanyId()).catch(() => []);
  // Payments made before the ledger existed (or whose entry is missing) still show, from their invoices: the invoice is their receipt.
  const seen = new Set(ledger.flatMap((t) => [t.reference, t.refundReference, t.invoiceNumber].filter(Boolean) as string[]));
  const older = payments.filter((p) => !(p.reference && seen.has(p.reference)) && !seen.has(p.documentNumber));
  const rows = [
    ...ledger.map((t) => ({ key: t.id, type: t.type, at: t.at, description: t.description, method: t.method, reference: t.reference, invoiceNumber: t.invoiceNumber, reason: t.reason, amount: t.amount, currency: t.currency, receiptHref: t.type === "failed" || t.type === "setup" ? null : `/api/platform/billing/transactions/${t.id}/receipt?download=1` })),
    ...older.map((p) => ({ key: p.documentId, type: p.kind === "refund" ? ("refund" as const) : ("payment" as const), at: p.at.toISOString(), description: p.kind === "refund" ? "Credit note" : "Subscription payment", method: null, reference: p.reference, invoiceNumber: p.documentNumber, reason: null, amount: p.amount, currency: p.currency, receiptHref: `/api/platform/billing/invoices/${p.documentId}/pdf?download=1` })),
  ].sort((a, b) => b.at.localeCompare(a.at));
  const lastPayment = payments.find((p) => p.kind === "payment") ?? (ledger.find((t) => t.type === "payment") ? { amount: ledger.find((t) => t.type === "payment")!.amount, currency: ledger.find((t) => t.type === "payment")!.currency, at: new Date(ledger.find((t) => t.type === "payment")!.at) } : null);

  return (
    <div className="min-h-screen bg-muted/70 px-4 py-10 dark:bg-background">
      <div className="space-y-4">
<PanelPageHeader
          breadcrumbs={[{ label: "Company settings", href: "/commandos/settings" }, { label: "Plan & billing", href: "/commandos/settings/billing" }, { label: "Invoices" }]}
          title={<>Invoices</>}
          description={<>GST tax invoices for your subscription (a paid invoice is also your receipt), and any credit notes against them.</>}
        />
<div className="space-y-4">
        <GlassCard>
          <CardContent>
            {invoices.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-10 text-center text-sm text-muted-foreground">
                <FileText className="size-8 opacity-40" />
                No invoices yet — one is issued automatically after every subscription payment.
              </div>
            ) : (
              <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Invoice</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Period</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoices.map((inv) => (
                    <TableRow key={inv._id} data-invoice-id={inv._id} data-invoice-number={inv.number}>
                      <TableCell>
                        <span className="font-medium">{inv.number}</span>
                        <span className="block text-xs text-muted-foreground">
                          {inv.kind === "credit_note"
                            ? `Credit note against ${inv.original?.number ?? ""}`
                            : [inv.planName, inv.interval === "yearly" ? "Yearly" : inv.interval === "monthly" ? "Monthly" : null, STATUS[inv.status]].filter(Boolean).join(" · ")}
                        </span>
                      </TableCell>
                      <TableCell>{formatInvoiceDate(inv.issuedAt)}</TableCell>
                      <TableCell className="text-xs">{inv.periodStart && inv.periodEnd ? `${formatInvoiceDate(inv.periodStart)} – ${formatInvoiceDate(inv.periodEnd)}` : "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {inv.kind === "credit_note" ? "− " : ""}
                        {formatMoney(inv.total, inv.currency)}
                        <span className="block text-xs text-muted-foreground">incl. GST {formatMoney(inv.taxTotal, inv.currency)}</span>
                      </TableCell>
                      <TableCell>
                        <a
                          href={`/api/platform/billing/invoices/${inv._id}/pdf?download=1`}
                          aria-label={`Download ${inv.number}`}
                          className="text-muted-foreground hover:text-foreground"
                        >
                          <Download className="size-4" />
                        </a>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              </div>
            )}
          </CardContent>
        </GlassCard>

        {/* The ledger: written when a payment, a failed payment or a refund happens (not only when a webhook arrives); the tax invoices above are the GST documents. */}
        <GlassCard id="saas-payments">
          <CardHeader>
            <CardTitle className="text-xl">Transaction history</CardTitle>
            <CardDescription>
              {lastPayment
                ? `Last payment: ${formatMoney(lastPayment.amount, lastPayment.currency)} on ${formatInvoiceDate(lastPayment.at)}. `
                : "Every payment, failed attempt and refund on your subscription appears here. "}
              Download a receipt for any successful payment or refund.
            </CardDescription>
            <div className="pt-2"><SyncTransactionsButton /></div>
          </CardHeader>
          <CardContent>
            {rows.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-10 text-center text-sm text-muted-foreground">
                <Receipt className="size-8 opacity-40" />
                No transactions yet. Your first payment will show up here as soon as it goes through.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Method</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead className="w-24 text-right">Receipt</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((r) => (
                      <TableRow key={r.key} data-transaction-type={r.type} data-transaction-reference={r.reference ?? ""}>
                        <TableCell className="whitespace-nowrap">{formatInvoiceDate(new Date(r.at))}</TableCell>
                        <TableCell>
                          <span className="font-medium">{r.description}</span>
                          <span className="block text-xs text-muted-foreground">
                            {[r.reference, r.invoiceNumber ? `Invoice ${r.invoiceNumber}` : null].filter(Boolean).join(" · ") || "—"}
                          </span>
                          {r.reason ? <span className="block text-xs text-destructive">{r.reason}</span> : null}
                        </TableCell>
                        <TableCell>{r.method ?? "—"}</TableCell>
                        <TableCell>
                          <span className={r.type === "failed" ? "rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-semibold text-destructive" : r.type === "setup" ? "rounded-full bg-primary/15 px-2 py-0.5 text-xs font-semibold text-primary" : r.type === "refund" ? "rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-semibold text-amber-700 dark:text-amber-300" : "rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300"}>
                            {r.type === "failed" ? "Failed" : r.type === "refund" ? "Refunded" : r.type === "setup" ? "Autopay set" : "Paid"}
                          </span>
                        </TableCell>
                        <TableCell className={`text-right tabular-nums ${r.type === "failed" ? "text-muted-foreground line-through" : ""}`}>
                          {r.type === "setup" ? "—" : <>{r.type === "refund" ? "− " : ""}{formatMoney(r.amount, r.currency)}</>}
                        </TableCell>
                        <TableCell className="text-right">
                          {r.receiptHref ? (
                            <a href={r.receiptHref} aria-label={`Download receipt for ${r.reference ?? r.description}`} className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
                              <Download className="size-3.5" /> PDF
                            </a>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </GlassCard>
      </div>
</div>
    </div>
  );
}
