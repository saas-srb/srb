import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { InvoiceStatusBadge, PaymentStatusBadge } from "@/components/products/spendiq/StatusBadges";
import { billFormSections, vendorsWithPan } from "@/lib/products/cashflow-ai/tds/bill-sections";
import InvoiceForm from "@/components/products/spendiq/InvoiceForm";
import InvoiceWorkflow from "@/components/products/spendiq/InvoiceWorkflow";
import { getCurrentPrmsUser } from "@/lib/prms-auth";
import { canManageFinance } from "@/lib/prms-roles";
import { getInvoice, serializeInvoice } from "@/lib/products/spendiq/invoices";
import { listPaymentsForInvoice } from "@/lib/products/spendiq/payments";
import { listVendorOptions } from "@/lib/products/spendiq/vendors";
import { formatMoney } from "@/lib/products/spendiq/constants";
import { formatDate } from "@/lib/utils";

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm text-foreground">{value || "—"}</p>
    </div>
  );
}

export default async function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentPrmsUser();
  const canManage = user ? canManageFinance(user) : false;

  const invoice = await getInvoice(id);
  if (!invoice) notFound();
  const i = serializeInvoice(invoice);

  const [payments, vendors, sections] = await Promise.all([listPaymentsForInvoice(id), listVendorOptions({ activeOnly: true }), billFormSections()]);
  const withPan = await vendorsWithPan(vendors.map((v) => v._id));

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "SpendIQ", href: "/spendiq" }, { label: "Invoices & Payments", href: "/spendiq/invoices" }, { label: i.invoiceNumber }]}
        title={<>{i.invoiceNumber}</>}
        description={<>{i.vendorName} · <InvoiceStatusBadge status={i.status} /> · {formatMoney(i.netPayable, i.currency)} net</>}
        actions={<>{canManage && !["paid", "partially_paid"].includes(i.status) && (
          <InvoiceForm
            invoice={i}
            vendors={vendors.map((v) => ({ _id: v._id, companyName: v.companyName, hasPan: withPan.has(v._id) }))}
            tdsSections={sections}
            trigger={
              <Button type="button" size="sm" variant="outline">
                <Pencil className="size-3.5" data-icon="inline-start" />
                Edit
              </Button>
            }
          />
        )}</>}
      />

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-4">
          <GlassCard interactive={false}>
            <CardHeader><CardTitle>Invoice</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Field label="Vendor invoice #" value={i.vendorInvoiceNumber} />
              <Field label="PO" value={i.poId ? <Link className="text-primary hover:underline" href={`/spendiq/purchase-orders/${i.poId}`}>{i.poNumber}</Link> : null} />
              <Field label="Invoice date" value={formatDate(i.invoiceDate)} />
              <Field label="Due date" value={formatDate(i.dueDate)} />
              <Field label="Taxable" value={formatMoney(i.subtotal, i.currency)} />
              <Field label="GST" value={formatMoney(i.gstAmount, i.currency)} />
              <Field label="Invoice total" value={formatMoney(i.totalAmount, i.currency)} />
              <Field label={`TDS (${i.tdsRate}%)`} value={formatMoney(i.tdsAmount, i.currency)} />
              <Field label="TDS section" value={i.tdsSection ?? null} />
              <Field label="Net payable" value={formatMoney(i.netPayable, i.currency)} />
              <Field label="Paid to date" value={formatMoney(i.amountPaid, i.currency)} />
              <Field label="Outstanding" value={formatMoney(i.netPayable - i.amountPaid, i.currency)} />
            </CardContent>
            {i.notes && (
              <CardContent>
                <p className="text-xs text-muted-foreground">Notes</p>
                <p className="text-sm whitespace-pre-wrap text-foreground">{i.notes}</p>
              </CardContent>
            )}
          </GlassCard>

          <GlassCard interactive={false}>
            <CardHeader><CardTitle>Payments</CardTitle></CardHeader>
            <CardContent>
              {payments.length === 0 ? (
                <p className="text-sm text-muted-foreground">No payments recorded.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Payment</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead>Method</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {payments.map((p) => (
                      <TableRow key={p._id}>
                        <TableCell className="font-mono text-xs">{p.paymentCode}</TableCell>
                        <TableCell className="text-muted-foreground">{formatDate(p.paymentDate.toISOString().slice(0, 10))}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatMoney(p.amount, i.currency)}</TableCell>
                        <TableCell className="capitalize">{p.method.replace(/_/g, " ")}</TableCell>
                        <TableCell><PaymentStatusBadge status={p.status} /></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </GlassCard>
        </div>

        {canManage ? (
          <InvoiceWorkflow invoice={i} />
        ) : (
          <GlassCard interactive={false}>
            <CardContent className="py-6 text-sm text-muted-foreground">Read-only access.</CardContent>
          </GlassCard>
        )}
      </div>
    </div>
  );
}
