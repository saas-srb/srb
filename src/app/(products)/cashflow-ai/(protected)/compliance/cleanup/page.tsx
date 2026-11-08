import Link from "next/link";
import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cleanupReport } from "@/lib/products/cashflow-ai/hygiene";
import { formatMoney } from "@/lib/products/cashflow-ai/constants";

const d = (s: string) => s.split("-").reverse().join("-");

export default async function CleanupPage() {
  const r = await cleanupReport();
  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "CashFlow", href: "/cashflow-ai" }, { label: "CA & Compliance", href: "/cashflow-ai/compliance" }, { label: "Books clean-up" }]}
        title={<>Books Clean-up</>}
        description={<>Things your CA will ask about: the same vendor bill entered twice, bills, receipts and expenses with no document, and income or expense entries that were never given an account. Fix them here before the month is locked.</>}
      />

      <GlassCard interactive={false}>
        <CardHeader><CardTitle>Possible duplicate vendor bills ({r.duplicates.length})</CardTitle></CardHeader>
        <CardContent>
          {r.duplicates.length === 0 ? (
            <p className="text-sm text-muted-foreground">No bill appears twice. New bills with an already-used vendor invoice number are refused.</p>
          ) : (
            <ul className="space-y-4">
              {r.duplicates.map((g, i) => (
                <li key={i} className="space-y-1 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{g.vendorName}</span>
                    <Badge className={g.kind === "exact" ? "bg-destructive/15 text-destructive" : "bg-amber-500/15 text-amber-700 dark:text-amber-400"}>{g.kind === "exact" ? "Same invoice number" : "Same date and amount"}</Badge>
                  </div>
                  <ul className="pl-4 text-xs text-muted-foreground">
                    {g.bills.map((b) => (
                      <li key={b.id}><Link href={`/spendiq/invoices/${b.id}`} className="text-primary hover:underline">{b.vendorInvoiceNumber ?? "no number"}</Link> · {d(b.invoiceDate)} · {formatMoney(b.totalAmount)} · {b.status.replace(/_/g, " ")}</li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </GlassCard>

      <GlassCard interactive={false}>
        <CardHeader><CardTitle>Bills without the document ({r.billsWithoutDocument.length})</CardTitle></CardHeader>
        <CardContent>
          {r.billsWithoutDocument.length === 0 ? (
            <p className="text-sm text-muted-foreground">Every bill has its document attached.</p>
          ) : (
            <ul className="divide-y divide-border/40 text-sm">
              {r.billsWithoutDocument.slice(0, 100).map((b) => (
                <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span><Link href={`/spendiq/invoices/${b.id}`} className="text-primary hover:underline">{b.invoiceNumber}</Link> · {b.vendorName}</span>
                  <span className="text-xs text-muted-foreground">{d(b.invoiceDate)} · {formatMoney(b.totalAmount)}</span>
                </li>
              ))}
            </ul>
          )}
          {r.billsWithoutDocument.length > 100 && <p className="pt-2 text-xs text-muted-foreground">Showing the first 100 of {r.billsWithoutDocument.length}.</p>}
        </CardContent>
      </GlassCard>

      <GlassCard interactive={false}>
        <CardHeader><CardTitle>Customer receipts without proof ({r.receiptsWithoutProof.length})</CardTitle></CardHeader>
        <CardContent>
          <p className="mb-2 text-xs text-muted-foreground">Cash, cheque and bank-transfer receipts recorded by hand. Open the receipt and add the bank advice, deposit slip or cheque photo. Razorpay payments need no proof.</p>
          {r.receiptsWithoutProof.length === 0 ? (
            <p className="text-sm text-muted-foreground">Every hand-recorded receipt has proof.</p>
          ) : (
            <ul className="divide-y divide-border/40 text-sm">
              {r.receiptsWithoutProof.slice(0, 100).map((x) => (
                <li key={x.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span><Link href={`/cashflow-ai/receipts/${x.id}`} className="text-primary hover:underline">{x.receiptNumber}</Link> · {x.customerName} · {x.method.replace(/_/g, " ")}</span>
                  <span className="text-xs text-muted-foreground">{d(x.date)} · {formatMoney(x.amount)}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </GlassCard>

      <GlassCard interactive={false}>
        <CardHeader><CardTitle>Expenses without a bill ({r.expensesWithoutBill.length})</CardTitle></CardHeader>
        <CardContent>
          {r.expensesWithoutBill.length === 0 ? (
            <p className="text-sm text-muted-foreground">Every expense has its bill or voucher attached.</p>
          ) : (
            <ul className="divide-y divide-border/40 text-sm">
              {r.expensesWithoutBill.slice(0, 100).map((x) => (
                <li key={x.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span><Link href={`/spendiq/expenses/${x.id}`} className="text-primary hover:underline">{x.expenseCode}</Link> · {x.category}</span>
                  <span className="text-xs text-muted-foreground">{d(x.date)} · {formatMoney(x.totalAmount)}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </GlassCard>

      <GlassCard interactive={false}>
        <CardHeader><CardTitle>Entries without an account ({r.unclassified.length})</CardTitle></CardHeader>
        <CardContent>
          <p className="mb-2 text-xs text-muted-foreground">These sit in &quot;Other income&quot; or &quot;Other expenses&quot; until someone chooses the right account.</p>
          {r.unclassified.length === 0 ? (
            <p className="text-sm text-muted-foreground">Every income and expense entry has an account.</p>
          ) : (
            <ul className="divide-y divide-border/40 text-sm">
              {r.unclassified.slice(0, 100).map((t) => (
                <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span><Link href={`/cashflow-ai/transactions/${t.id}`} className="text-primary hover:underline">{t.transactionNumber}</Link> · {t.type}{t.description ? ` · ${t.description}` : ""}</span>
                  <span className="text-xs text-muted-foreground">{d(t.date)} · {formatMoney(t.amount)}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </GlassCard>
    </div>
  );
}
