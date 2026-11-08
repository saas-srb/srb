import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { AssetStatusBadge } from "@/components/products/spendiq/StatusBadges";
import AssetForm from "@/components/products/spendiq/AssetForm";
import AssetWorkflow from "@/components/products/spendiq/AssetWorkflow";
import { getCurrentPrmsUser } from "@/lib/prms-auth";
import { canManageProcurement } from "@/lib/prms-roles";
import { getAsset, serializeAsset, listAssignments, computeCurrentValue } from "@/lib/products/spendiq/assets";
import { listVendorOptions } from "@/lib/products/spendiq/vendors";
import { listEmployeeOptions } from "@/lib/products/spendiq/pickers";
import { formatMoney } from "@/lib/products/spendiq/constants";
import { formatDate, formatDateTime } from "@/lib/utils";

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm text-foreground">{value || "—"}</p>
    </div>
  );
}

export default async function AssetDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentPrmsUser();
  const canManage = user ? canManageProcurement(user) : false;

  const asset = await getAsset(id);
  if (!asset) notFound();
  const a = serializeAsset(asset);
  const bookValue = computeCurrentValue(asset);

  const [assignments, vendors, employees] = await Promise.all([
    listAssignments(id),
    listVendorOptions(),
    listEmployeeOptions(),
  ]);

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "SpendIQ", href: "/spendiq" }, { label: "Asset Management", href: "/spendiq/assets" }, { label: a.assetCode }]}
        title={<>{a.name}</>}
        description={<><span className="font-mono">{a.assetCode}</span> · {a.category} · <AssetStatusBadge status={a.status} /></>}
        actions={<>{canManage && (
          <AssetForm
            asset={a}
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
              <Field label="Brand / Model" value={[a.brand, a.model].filter(Boolean).join(" ")} />
              <Field label="Serial number" value={a.serialNumber} />
              <Field label="Office location" value={a.officeLocation} />
              <Field label="Vendor" value={a.vendorName} />
              <Field label="Purchase date" value={formatDate(a.purchaseDate)} />
              <Field label="Purchase cost" value={formatMoney(a.purchaseCost, a.currency)} />
              <Field label="Depreciation" value={a.depreciationMethod.toUpperCase()} />
              <Field label="Useful life" value={`${a.usefulLifeYears} yr`} />
              <Field label="Salvage value" value={formatMoney(a.salvageValue, a.currency)} />
              <Field label="Current book value" value={formatMoney(bookValue, a.currency)} />
              <Field label="Warranty expiry" value={a.warrantyExpiry ? formatDate(a.warrantyExpiry) : null} />
              <Field label="Assigned to" value={a.assignedEmployeeName} />
            </CardContent>
            {a.notes && (
              <CardContent>
                <p className="text-xs text-muted-foreground">Notes</p>
                <p className="text-sm whitespace-pre-wrap text-foreground">{a.notes}</p>
              </CardContent>
            )}
          </GlassCard>

          <GlassCard interactive={false}>
            <CardHeader><CardTitle>Assignment History</CardTitle></CardHeader>
            <CardContent>
              {assignments.length === 0 ? (
                <p className="text-sm text-muted-foreground">No lifecycle events yet.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>When</TableHead>
                      <TableHead>Event</TableHead>
                      <TableHead>Employee</TableHead>
                      <TableHead>Note</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {assignments.map((ev) => (
                      <TableRow key={ev._id}>
                        <TableCell className="text-muted-foreground">{formatDateTime(ev.date)}</TableCell>
                        <TableCell className="capitalize">{ev.action}</TableCell>
                        <TableCell>{ev.employeeName ?? "—"}</TableCell>
                        <TableCell className="text-muted-foreground">{ev.note ?? "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </GlassCard>
        </div>

        {canManage ? (
          <AssetWorkflow asset={a} employees={employees.map((e) => ({ _id: e._id, name: e.name }))} />
        ) : (
          <GlassCard interactive={false}>
            <CardContent className="py-6 text-sm text-muted-foreground">Read-only access.</CardContent>
          </GlassCard>
        )}
      </div>

      {a.poId && (
        <p className="text-xs text-muted-foreground">
          Source: <Link className="text-primary hover:underline" href={`/spendiq/purchase-orders/${a.poId}`}>purchase order</Link>
        </p>
      )}
    </div>
  );
}
