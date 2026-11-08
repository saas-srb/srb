import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import { notFound } from "next/navigation";
import { Plus, Download } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import { InvoiceStatusBadge, PaymentStatusBadge } from "@/components/products/spendiq/StatusBadges";
import { NoteStatusBadge } from "@/components/products/cashflow-ai/StatusBadges";
import RecordVendorPaymentForm from "@/components/products/cashflow-ai/RecordVendorPaymentForm";
import DebitNoteForm from "@/components/products/cashflow-ai/DebitNoteForm";
import { getCurrentFmsUser } from "@/lib/fms-auth";
import { canManageTransactions } from "@/lib/fms-roles";
import { getBillDetail } from "@/lib/products/cashflow-ai/bills";
import { listFundAccountOptions } from "@/lib/products/cashflow-ai/fund-accounts";
import { formatMoney } from "@/lib/products/cashflow-ai/constants";
import { formatDate, formatDateTime } from "@/lib/utils";

export default async function BillDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentFmsUser();
  const [detail, fundAccounts] = await Promise.all([getBillDetail(id), listFundAccountOptions()]);
  if (!detail) notFound();
  const { bill, payments, debitNotes, outstanding } = detail;
  const canManage = user ? canManageTransactions(user) : false;
  const debitTotal = debitNotes.filter((d) => d.status === "issued").reduce((s, d) => s + d.amount, 0);
  const totalOutstanding = outstanding + debitTotal;

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "CashFlow", href: "/cashflow-ai" }, { label: "Bills", href: "/cashflow-ai/bills" }, { label: bill.invoiceNumber }]}
        title={<>{bill.invoiceNumber}</>}
        description={<>{bill.vendorName} · {formatMoney(bill.totalAmount, bill.currency)}</>}
        actions={<><div className="flex items-center gap-2">
          <InvoiceStatusBadge status={bill.status} />
          {bill.poNumber && (
            <a href={`/api/spendiq/purchase-orders/${bill.poNumber}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
              <Download className="size-3.5" data-icon="inline-start" />
              PO
            </a>
          )}
        </div></>}
      />

      {canManage && totalOutstanding > 0.01 && (
        <GlassCard>
          <CardHeader><CardTitle>Actions</CardTitle></CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <RecordVendorPaymentForm
              billId={bill._id}
              billNumber={bill.invoiceNumber}
              outstanding={outstanding}
              currency={bill.currency}
              fundAccounts={fundAccounts}
              trigger={
                <Button type="button" size="sm">
                  <Plus className="size-3.5" data-icon="inline-start" />
                  Record Payment
                </Button>
              }
            />
            <DebitNoteForm
              billId={bill._id}
              billNumber={bill.invoiceNumber}
              currency={bill.currency}
              trigger={
                <Button type="button" size="sm" variant="outline">
                  <Plus className="size-3.5" data-icon="inline-start" />
                  Issue Debit Note
                </Button>
              }
            />
          </CardContent>
        </GlassCard>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <GlassCard>
          <CardHeader><CardTitle>Bill Details</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label="Vendor Invoice #" value={bill.vendorInvoiceNumber ?? "—"} />
            <Row label="PO Number" value={bill.poNumber ?? "—"} />
            <Row label="Invoice Date" value={formatDate(bill.invoiceDate)} />
            <Row label="Due Date" value={formatDate(bill.dueDate)} />
            <Row label="PO Matched" value={bill.poMatched ? "Yes" : "No"} />
            <Row label="GRN Matched" value={bill.grnMatched ? "Yes" : "No"} />
          </CardContent>
        </GlassCard>

        <GlassCard>
          <CardHeader><CardTitle>Balance</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label="Subtotal" value={formatMoney(bill.subtotal, bill.currency)} />
            <Row label="GST" value={formatMoney(bill.gstAmount, bill.currency)} />
            <Row label="TDS" value={formatMoney(bill.tdsAmount, bill.currency)} />
            <Row label="Net Payable" value={formatMoney(bill.netPayable, bill.currency)} />
            <Row label="Paid" value={formatMoney(bill.amountPaid, bill.currency)} />
            <Row label="Debit Notes" value={formatMoney(debitTotal, bill.currency)} />
            <Row label="Outstanding" value={formatMoney(totalOutstanding, bill.currency)} />
          </CardContent>
        </GlassCard>
      </div>

      <GlassCard>
        <CardHeader><CardTitle>Payments</CardTitle></CardHeader>
        <CardContent>
          {payments.length === 0 ? (
            <p className="text-sm text-muted-foreground">No payments recorded yet.</p>
          ) : (
            <ul className="divide-y divide-border/40">
              {payments.map((p) => (
                <li key={p._id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span className="font-medium">{p.paymentCode}</span>
                  <span className="flex items-center gap-2 text-muted-foreground">
                    {formatDate(p.paymentDate.toISOString().slice(0, 10))} · {formatMoney(p.amount, bill.currency)}
                    <PaymentStatusBadge status={p.status} />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </GlassCard>

      {debitNotes.length > 0 && (
        <GlassCard>
          <CardHeader><CardTitle>Debit Notes</CardTitle></CardHeader>
          <CardContent>
            <ul className="divide-y divide-border/40">
              {debitNotes.map((d) => (
                <li key={d._id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span className="font-medium">{d.debitNoteNumber}</span>
                  <span className="flex items-center gap-2 text-muted-foreground">
                    {formatMoney(d.amount, bill.currency)}
                    <NoteStatusBadge status={d.status} />
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </GlassCard>
      )}

      {bill.notes && (
        <GlassCard>
          <CardHeader><CardTitle>Notes</CardTitle></CardHeader>
          <CardContent className="text-sm whitespace-pre-wrap">{bill.notes}</CardContent>
        </GlassCard>
      )}

      <p className="text-xs text-muted-foreground">Created {formatDateTime(bill.createdAt)}. Bill data is owned by SpendIQ.</p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium text-foreground">{value}</span>
    </div>
  );
}
