import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import { CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import { PAYMENT_METHODS } from "@/lib/products/cashflow-ai/constants";

export default function PaymentMethodsPage() {
  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "CashFlow", href: "/cashflow-ai" }, { label: "Settings" }, { label: "Payment Methods" }]}
        title={<>Payment Methods</>}
        description={<>A fixed set matching the payment rails CashFlow already supports across transactions, receipts and payments —
          not an editable per-org list.</>}
      />

      <GlassCard interactive={false}>
        <CardHeader><CardTitle>Available Methods</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Value</TableHead>
                <TableHead>Label</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {PAYMENT_METHODS.map((m) => (
                <TableRow key={m.value}>
                  <TableCell className="font-mono text-xs text-muted-foreground">{m.value}</TableCell>
                  <TableCell className="font-medium">{m.label}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </GlassCard>

      <p className="text-xs text-muted-foreground">
        Every transaction, receipt, payment and reimbursement across CashFlow picks from this same list
        (<code>fms/constants.ts</code>). Adding a new payment rail is a code change, not a per-org setting — the
        available rails are the same for every organization using this platform.
      </p>
    </div>
  );
}
