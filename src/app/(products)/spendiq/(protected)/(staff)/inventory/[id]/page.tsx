import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import { notFound } from "next/navigation";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import InventoryItemForm from "@/components/products/spendiq/InventoryItemForm";
import InventoryTxnForm from "@/components/products/spendiq/InventoryTxnForm";
import { getCurrentPrmsUser } from "@/lib/prms-auth";
import { canManageProcurement } from "@/lib/prms-roles";
import { getInventoryItem, serializeInventoryItem, listTransactions } from "@/lib/products/spendiq/inventory";
import { listVendorOptions } from "@/lib/products/spendiq/vendors";
import { formatMoney } from "@/lib/products/spendiq/constants";
import { formatDateTime } from "@/lib/utils";

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm text-foreground">{value || "—"}</p>
    </div>
  );
}

export default async function InventoryItemDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentPrmsUser();
  const canManage = user ? canManageProcurement(user) : false;

  const item = await getInventoryItem(id);
  if (!item) notFound();
  const i = serializeInventoryItem(item);

  const [txns, vendors] = await Promise.all([listTransactions(id), listVendorOptions()]);

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "SpendIQ", href: "/spendiq" }, { label: "Inventory & Stationery", href: "/spendiq/inventory" }, { label: i.itemCode }]}
        title={<>{i.name}</>}
        description={<><span className="font-mono">{i.itemCode}</span> · {i.currentStock} {i.uom} on hand
            {i.currentStock <= i.minStock && <span className="ml-1 text-destructive">(below minimum)</span>}</>}
        actions={<>{canManage && (
          <InventoryItemForm
            item={i}
            vendors={vendors.map((v) => ({ _id: v._id, companyName: v.companyName }))}
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
            <CardHeader><CardTitle>Details</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Field label="Category" value={i.category} />
              <Field label="Unit cost (avg)" value={formatMoney(i.unitCost)} />
              <Field label="Stock value" value={formatMoney(i.currentStock * i.unitCost)} />
              <Field label="Minimum stock" value={`${i.minStock} ${i.uom}`} />
              <Field label="Preferred vendor" value={i.vendorName} />
              <Field label="Location" value={i.location} />
            </CardContent>
            {i.notes && (
              <CardContent>
                <p className="text-xs text-muted-foreground">Notes</p>
                <p className="text-sm whitespace-pre-wrap text-foreground">{i.notes}</p>
              </CardContent>
            )}
          </GlassCard>

          <GlassCard interactive={false}>
            <CardHeader><CardTitle>Transaction History</CardTitle></CardHeader>
            <CardContent>
              {txns.length === 0 ? (
                <p className="text-sm text-muted-foreground">No transactions yet.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>When</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead className="text-right">Balance</TableHead>
                      <TableHead>Reference</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {txns.map((t) => (
                      <TableRow key={t._id}>
                        <TableCell className="text-muted-foreground">{formatDateTime(t.date)}</TableCell>
                        <TableCell className="capitalize">{t.type.replace(/_/g, " ")}</TableCell>
                        <TableCell className="text-right tabular-nums">{t.quantity}</TableCell>
                        <TableCell className="text-right tabular-nums">{t.balanceAfter}</TableCell>
                        <TableCell className="text-muted-foreground">{t.reference ?? t.note ?? "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </GlassCard>
        </div>

        {canManage ? (
          <InventoryTxnForm itemId={i._id} uom={i.uom} />
        ) : (
          <GlassCard interactive={false}>
            <CardContent className="py-6 text-sm text-muted-foreground">Read-only access.</CardContent>
          </GlassCard>
        )}
      </div>
    </div>
  );
}
