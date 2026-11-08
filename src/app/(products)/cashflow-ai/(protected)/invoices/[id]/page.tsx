import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Download, Receipt as ReceiptIcon, FileMinus } from "lucide-react";
import { CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import { InvoiceStatusBadge, NoteStatusBadge } from "@/components/products/cashflow-ai/StatusBadges";
import InvoiceStatusActions from "@/components/products/cashflow-ai/InvoiceStatusActions";
import ReceiptForm from "@/components/products/cashflow-ai/ReceiptForm";
import CreditNoteForm from "@/components/products/cashflow-ai/CreditNoteForm";
import { getCurrentFmsUser } from "@/lib/fms-auth";
import { canManageTransactions } from "@/lib/fms-roles";
import { getInvoice, serializeInvoice, invoiceBalance } from "@/lib/products/cashflow-ai/invoices";
import { listReceiptsForInvoice, serializeReceipt } from "@/lib/products/cashflow-ai/receipts";
import { listCreditNotesForInvoice, serializeCreditNote } from "@/lib/products/cashflow-ai/credit-notes";
import { listFundAccountOptions } from "@/lib/products/cashflow-ai/fund-accounts";
import { formatMoney } from "@/lib/products/cashflow-ai/constants";
import { formatDate, formatDateTime } from "@/lib/utils";

import { getAccrualSettings } from "@/lib/products/cashflow-ai/accrual/settings";

export default async function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const accrualOn = !!(await getAccrualSettings());
  const { id } = await params;
  const user = await getCurrentFmsUser();
  const raw = await getInvoice(id);
  if (!raw) notFound();

  const invoice = serializeInvoice(raw);
  const [receipts, creditNotes, fundAccounts] = await Promise.all([
    listReceiptsForInvoice(id),
    listCreditNotesForInvoice(id),
    listFundAccountOptions(),
  ]);
  const canManage = user ? canManageTransactions(user) : false;
  const balance = invoiceBalance(invoice);

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "CashFlow", href: "/cashflow-ai" }, { label: "Invoices", href: "/cashflow-ai/invoices" }, { label: invoice.invoiceNumber }]}
        title={<>{invoice.invoiceNumber}</>}
        description={<>{invoice.customerName} · {formatMoney(invoice.totalAmount, invoice.currency)} · Due {formatDate(invoice.dueDate)}</>}
        actions={<><div className="flex items-center gap-2">
          <InvoiceStatusBadge status={invoice.status} />
          <a href={`/api/cashflow-ai/invoices/${invoice.invoiceNumber}`} target="_blank" rel="noreferrer" className={buttonVariants({ variant: "outline", size: "sm" })}>
            <Download className="size-3.5" data-icon="inline-start" />
            PDF
          </a>
        </div></>}
      />

      {canManage && (
        <GlassCard>
          <CardHeader><CardTitle>Actions</CardTitle></CardHeader>
          <CardContent className="flex flex-wrap items-center gap-2">
            <InvoiceStatusActions id={invoice._id} status={invoice.status} />
            {balance > 0.01 && (
              <>
                <ReceiptForm
                  customers={[{ _id: invoice.customerId, label: invoice.customerName }]}
                  allowTds={accrualOn}
                  presetCustomerId={invoice.customerId}
                  presetInvoiceId={invoice._id}
                  fundAccounts={fundAccounts}
                  trigger={
                    <Button type="button" size="sm" variant="outline">
                      <ReceiptIcon className="size-3.5" data-icon="inline-start" />
                      Record Receipt
                    </Button>
                  }
                />
                <CreditNoteForm
                  invoice={invoice}
                  outstanding={balance}
                  trigger={
                    <Button type="button" size="sm" variant="outline">
                      <FileMinus className="size-3.5" data-icon="inline-start" />
                      Issue Credit Note
                    </Button>
                  }
                />
              </>
            )}
          </CardContent>
        </GlassCard>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <GlassCard>
          <CardHeader><CardTitle>Invoice Details</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label="Invoice Date" value={formatDate(invoice.invoiceDate)} />
            <Row label="Due Date" value={formatDate(invoice.dueDate)} />
            <Row label="Payment Terms" value={invoice.paymentTerms ?? "—"} />
            <Row label="Customer PO" value={invoice.poNumber ?? "—"} />
            <Row label="Project" value={invoice.projectId ?? "—"} />
            <Row label="Created" value={formatDateTime(invoice.createdAt)} />
          </CardContent>
        </GlassCard>

        <GlassCard>
          <CardHeader><CardTitle>Balance</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label="Subtotal" value={formatMoney(invoice.subtotal, invoice.currency)} />
            <Row label="Discount" value={formatMoney(invoice.discount, invoice.currency)} />
            <Row label="Tax" value={formatMoney(invoice.taxAmount, invoice.currency)} />
            <Row label="Total" value={formatMoney(invoice.totalAmount, invoice.currency)} />
            <Row label="Paid" value={formatMoney(invoice.amountPaid, invoice.currency)} />
            <Row label="Credited" value={formatMoney(invoice.amountCredited, invoice.currency)} />
            <Row label="Balance Due" value={formatMoney(balance, invoice.currency)} />
          </CardContent>
        </GlassCard>
      </div>

      <GlassCard>
        <CardHeader><CardTitle>Line Items</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Unit Price</TableHead>
                <TableHead className="text-right">Tax</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoice.items.map((it, i) => (
                <TableRow key={i}>
                  <TableCell>{it.description}</TableCell>
                  <TableCell className="text-right">{it.quantity}</TableCell>
                  <TableCell className="text-right">{formatMoney(it.unitPrice, invoice.currency)}</TableCell>
                  <TableCell className="text-right">{it.taxRate}%</TableCell>
                  <TableCell className="text-right">{formatMoney(it.lineTotal, invoice.currency)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </GlassCard>

      <GlassCard>
        <CardHeader><CardTitle>Receipts</CardTitle></CardHeader>
        <CardContent>
          {receipts.length === 0 ? (
            <p className="text-sm text-muted-foreground">No receipts recorded yet.</p>
          ) : (
            <ul className="divide-y divide-border/40">
              {receipts.map(serializeReceipt).map((r) => (
                <li key={r._id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <Link href={`/cashflow-ai/receipts/${r._id}`} className="font-medium text-primary hover:underline">{r.receiptNumber}</Link>
                  <span className="text-muted-foreground">{formatDate(r.receiptDate)} · {formatMoney(r.amount, r.currency)}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </GlassCard>

      <GlassCard>
        <CardHeader><CardTitle>Credit Notes</CardTitle></CardHeader>
        <CardContent>
          {creditNotes.length === 0 ? (
            <p className="text-sm text-muted-foreground">No credit notes issued.</p>
          ) : (
            <ul className="divide-y divide-border/40">
              {creditNotes.map(serializeCreditNote).map((c) => (
                <li key={c._id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span className="font-medium">{c.creditNoteNumber}</span>
                  <span className="flex items-center gap-2 text-muted-foreground">
                    {formatMoney(c.amount, invoice.currency)}
                    <NoteStatusBadge status={c.status} />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </GlassCard>

      {invoice.notes && (
        <GlassCard>
          <CardHeader><CardTitle>Notes</CardTitle></CardHeader>
          <CardContent className="text-sm whitespace-pre-wrap">{invoice.notes}</CardContent>
        </GlassCard>
      )}
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
