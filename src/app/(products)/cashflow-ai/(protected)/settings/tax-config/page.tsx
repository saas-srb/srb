import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import { Trash2, PowerOff, Power } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import SimpleActionButton from "@/components/products/cashflow-ai/SimpleActionButton";
import { getCurrentFmsUser } from "@/lib/fms-auth";
import { canManageTaxConfig } from "@/lib/fms-roles";
import { getTaxConfig } from "@/lib/products/cashflow-ai/tax-config";
import { addTaxRateAction, deleteTaxRateAction, toggleTaxRateAction } from "./actions";

export default async function TaxConfigPage() {
  const user = await getCurrentFmsUser();
  const canManage = user ? canManageTaxConfig(user) : false;
  const config = await getTaxConfig();

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "CashFlow", href: "/cashflow-ai" }, { label: "Settings" }, { label: "Tax Configuration" }]}
        title={<>Tax Configuration</>}
        description={<>A named list of tax rates for entering taxable transactions and invoices — not a GST/TDS compliance
          engine; that stays SpendIQ&apos;s own procurement-specific territory.</>}
      />

      {canManage && (
        <GlassCard interactive={false}>
          <CardHeader><CardTitle>Add Rate</CardTitle></CardHeader>
          <CardContent>
            <form action={addTaxRateAction} className="flex flex-wrap items-end gap-3">
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">Name</label>
                <Input name="name" placeholder="GST 18%" required className="h-9" />
              </div>
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">Rate %</label>
                <Input type="number" step="0.01" min="0" name="ratePercent" required className="h-9 w-28" />
              </div>
              <Button type="submit" size="sm">Add</Button>
            </form>
          </CardContent>
        </GlassCard>
      )}

      <GlassCard interactive={false}>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead className="text-right">Rate</TableHead>
                <TableHead>Status</TableHead>
                {canManage && <TableHead className="text-right">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {config.rates.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground">No tax rates configured yet.</TableCell>
                </TableRow>
              )}
              {config.rates.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.ratePercent}%</TableCell>
                  <TableCell>
                    <Badge className={r.isActive ? "bg-green-500/15 text-green-600 dark:text-green-400" : "bg-muted text-muted-foreground"}>
                      {r.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  {canManage && (
                    <TableCell className="text-right space-x-1">
                      <SimpleActionButton
                        id={r.id}
                        action={toggleTaxRateAction}
                        label={r.isActive ? "Deactivate" : "Activate"}
                        icon={r.isActive ? <PowerOff className="size-3.5" data-icon="inline-start" /> : <Power className="size-3.5" data-icon="inline-start" />}
                        successMessage="Updated"
                      />
                      <SimpleActionButton
                        id={r.id}
                        action={deleteTaxRateAction}
                        label="Delete"
                        icon={<Trash2 className="size-3.5" data-icon="inline-start" />}
                        successMessage="Rate deleted"
                      />
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </GlassCard>
    </div>
  );
}
