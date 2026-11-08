import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Pencil, Building2, Landmark, ReceiptText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { VendorStatusBadge, VendorCategoryBadge } from "@/components/products/spendiq/StatusBadges";
import VendorForm from "@/components/products/spendiq/VendorForm";
import { getCurrentPrmsUser } from "@/lib/prms-auth";
import { canManageProcurement } from "@/lib/prms-roles";
import { getVendor, serializeVendor, vendorPurchaseHistory } from "@/lib/products/spendiq/vendors";
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

export default async function VendorProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentPrmsUser();
  const canManage = user ? canManageProcurement(user) : false;

  const vendor = await getVendor(id);
  if (!vendor) notFound();
  const v = serializeVendor(vendor);
  const history = await vendorPurchaseHistory(id);

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "SpendIQ", href: "/spendiq" }, { label: "Vendors", href: "/spendiq/vendors" }, { label: v.companyName }]}
        title={<>{v.companyName}</>}
        description={<><span className="font-mono">{v.vendorCode}</span> · <VendorCategoryBadge category={v.category} /> · <VendorStatusBadge status={v.status} /></>}
        actions={<>{canManage && (
          <VendorForm
            vendor={v}
            trigger={
              <Button type="button" size="sm" variant="outline">
                <Pencil className="size-3.5" data-icon="inline-start" />
                Edit
              </Button>
            }
          />
        )}</>}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <GlassCard interactive={false}>
          <CardHeader><CardTitle className="flex items-center gap-2"><Building2 className="size-4" /> Company & Contact</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 gap-3">
            <Field label="Contact person" value={v.contactPerson} />
            <Field label="Rating" value={v.rating != null ? `${v.rating.toFixed(1)} / 5` : null} />
            <Field label="Email" value={v.email} />
            <Field label="Phone" value={v.phone} />
            <Field label="GSTIN" value={v.gstin} />
            <Field label="PAN" value={v.pan} />
            <Field label="Address" value={[v.addressLine, v.city, v.state, v.pincode].filter(Boolean).join(", ")} />
            <Field label="Payment terms" value={v.paymentTerms} />
            <Field label="Currency" value={v.currency} />
            <Field label="Added" value={formatDate(v.createdAt)} />
          </CardContent>
        </GlassCard>

        <GlassCard interactive={false}>
          <CardHeader><CardTitle className="flex items-center gap-2"><Landmark className="size-4" /> Bank Details</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 gap-3">
            <Field label="Account name" value={v.bankDetails?.accountName} />
            <Field label="Account number" value={v.bankDetails?.accountNumber} />
            <Field label="IFSC" value={v.bankDetails?.ifsc} />
            <Field label="Bank" value={v.bankDetails?.bankName} />
            <Field label="Branch" value={v.bankDetails?.branch} />
          </CardContent>
          {v.notes && (
            <CardContent>
              <p className="text-xs text-muted-foreground">Notes</p>
              <p className="text-sm whitespace-pre-wrap text-foreground">{v.notes}</p>
            </CardContent>
          )}
        </GlassCard>
      </div>

      <GlassCard interactive={false}>
        <CardHeader><CardTitle className="flex items-center gap-2"><ReceiptText className="size-4" /> Purchase History</CardTitle></CardHeader>
        <CardContent>
          {history.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No purchase orders, invoices or expenses recorded against this vendor yet.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.map((h, i) => (
                  <TableRow key={`${h.code}-${i}`}>
                    <TableCell className="capitalize">{h.type}</TableCell>
                    <TableCell className="font-mono text-xs">{h.code}</TableCell>
                    <TableCell className="text-muted-foreground">{formatDate(h.date)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatMoney(h.amount, v.currency)}</TableCell>
                    <TableCell className="capitalize text-muted-foreground">{h.status}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </GlassCard>

      <p className="text-xs text-muted-foreground">
        <Link href="/spendiq/vendors" className="text-primary hover:underline">← Back to vendors</Link>
      </p>
    </div>
  );
}
