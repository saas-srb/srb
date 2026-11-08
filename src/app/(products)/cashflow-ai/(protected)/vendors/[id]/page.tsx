import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import { VendorCategoryBadge, InvoiceStatusBadge } from "@/components/products/spendiq/StatusBadges";
import { TransactionStatusBadge, TransactionTypeBadge } from "@/components/products/cashflow-ai/StatusBadges";
import { getVendorDetail } from "@/lib/products/cashflow-ai/vendors";
import { listBills } from "@/lib/products/cashflow-ai/bills";
import { getVendorStatusMeta } from "@/lib/products/spendiq/constants";
import { formatMoney } from "@/lib/products/cashflow-ai/constants";
import { formatDate } from "@/lib/utils";

export default async function VendorDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [detail, bills] = await Promise.all([getVendorDetail(id), listBills({ vendorId: id, pageSize: 100 })]);
  if (!detail) notFound();
  const { vendor, financials, transactions } = detail;

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "CashFlow", href: "/cashflow-ai" }, { label: "Vendors", href: "/cashflow-ai/vendors" }, { label: vendor.companyName }]}
        title={<>{vendor.companyName}</>}
        description={<>{vendor.vendorCode}</>}
        actions={<><div className="flex items-center gap-2">
          <VendorCategoryBadge category={vendor.category} />
          <Badge className={getVendorStatusMeta(vendor.status).badgeClass}>{getVendorStatusMeta(vendor.status).label}</Badge>
        </div></>}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <GlassCard>
          <CardHeader><CardTitle>Contact &amp; Compliance</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label="Contact Person" value={vendor.contactPerson ?? "—"} />
            <Row label="Email" value={vendor.email ?? "—"} />
            <Row label="Phone" value={vendor.phone ?? "—"} />
            <Row label="GSTIN" value={vendor.gstin ?? "—"} />
            <Row label="PAN" value={vendor.pan ?? "—"} />
            <Row label="Payment Terms" value={vendor.paymentTerms.replace(/_/g, " ")} />
            <Row label="Currency" value={vendor.currency} />
          </CardContent>
        </GlassCard>

        <GlassCard>
          <CardHeader><CardTitle>Financial Summary</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label="Total Paid" value={formatMoney(financials.totalPaid, vendor.currency)} />
            <Row label="Outstanding Payable" value={formatMoney(financials.totalOutstanding, vendor.currency)} />
            <Row label="Bills" value={String(financials.transactionCount)} />
          </CardContent>
        </GlassCard>
      </div>

      <GlassCard>
        <CardHeader><CardTitle>Bills</CardTitle></CardHeader>
        <CardContent>
          {bills.items.length === 0 ? (
            <p className="text-sm text-muted-foreground">No bills recorded for this vendor yet.</p>
          ) : (
            <ul className="divide-y divide-border/40">
              {bills.items.map((bill) => (
                <li key={bill._id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <Link href={`/cashflow-ai/bills/${bill._id}`} className="font-medium text-primary hover:underline">{bill.invoiceNumber}</Link>
                  <div className="flex items-center gap-3 text-muted-foreground">
                    <span>{formatDate(bill.dueDate)}</span>
                    <span className="font-medium text-foreground">{formatMoney(bill.outstanding, bill.currency)}</span>
                    <InvoiceStatusBadge status={bill.status} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </GlassCard>

      <GlassCard>
        <CardHeader><CardTitle>Transactions</CardTitle></CardHeader>
        <CardContent>
          {transactions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No transactions recorded for this vendor yet.</p>
          ) : (
            <ul className="divide-y divide-border/40">
              {transactions.map((t) => (
                <li key={t._id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <div className="flex min-w-0 items-center gap-2">
                    <Link href={`/cashflow-ai/transactions/${t._id}`} className="font-medium text-primary hover:underline">
                      {t.transactionNumber}
                    </Link>
                    <TransactionTypeBadge type={t.type} />
                  </div>
                  <div className="flex items-center gap-3 text-muted-foreground">
                    <span>{formatDate(t.transactionDate)}</span>
                    <span className="font-medium text-foreground">{formatMoney(t.amount, t.currency)}</span>
                    <TransactionStatusBadge status={t.status} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </GlassCard>
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
