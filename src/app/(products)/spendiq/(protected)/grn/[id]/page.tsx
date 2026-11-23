import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import { notFound } from "next/navigation";
import Link from "next/link";
import { CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { GrnStatusBadge } from "@/components/products/spendiq/StatusBadges";
import { getGoodsReceipt, serializeGoodsReceipt } from "@/lib/products/spendiq/goods-receipts";
import { formatDate } from "@/lib/utils";

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm text-foreground">{value || "—"}</p>
    </div>
  );
}

export default async function GrnDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const grn = await getGoodsReceipt(id);
  if (!grn) notFound();
  const g = serializeGoodsReceipt(grn);

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "SpendIQ", href: "/spendiq" }, { label: "Goods Receipt", href: "/spendiq/grn" }, { label: g.grnNumber }]}
        title={<>{g.grnNumber}</>}
        description={<><Link className="text-primary hover:underline" href={`/spendiq/purchase-orders/${g.poId}`}>{g.poNumber}</Link> · {g.vendorName} · <GrnStatusBadge status={g.status} /></>}
      />

      <div className="grid gap-4 lg:grid-cols-4">
        <Field label="Received date" value={formatDate(g.receivedDate)} />
        <Field label="Warehouse / location" value={g.warehouseLocation} />
        <Field label="Quality checked" value={g.qualityChecked ? "Yes" : "No"} />
        <Field label="Recorded" value={formatDate(g.createdAt)} />
      </div>

      <GlassCard interactive={false}>
        <CardHeader><CardTitle>Received Items</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Ordered</TableHead>
                <TableHead className="text-right">Received</TableHead>
                <TableHead className="text-right">Accepted</TableHead>
                <TableHead className="text-right">Rejected</TableHead>
                <TableHead>Remarks</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {g.items.map((it, i) => (
                <TableRow key={i}>
                  <TableCell>{it.description}</TableCell>
                  <TableCell className="text-right tabular-nums">{it.orderedQty}</TableCell>
                  <TableCell className="text-right tabular-nums">{it.receivedQty}</TableCell>
                  <TableCell className="text-right tabular-nums">{it.acceptedQty}</TableCell>
                  <TableCell className="text-right tabular-nums">{it.rejectedQty}</TableCell>
                  <TableCell className="text-muted-foreground">{it.remarks ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </GlassCard>

      {g.remarks && <p className="text-sm text-muted-foreground">Remarks: {g.remarks}</p>}
    </div>
  );
}
