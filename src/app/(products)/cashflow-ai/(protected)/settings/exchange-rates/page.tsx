import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import SimpleActionButton from "@/components/products/cashflow-ai/SimpleActionButton";
import { Trash2 } from "lucide-react";
import { getCurrentFmsUser } from "@/lib/fms-auth";
import { canManageAccounts } from "@/lib/fms-roles";
import { listExchangeRates } from "@/lib/products/cashflow-ai/exchange-rates";
import { SUPPORTED_CURRENCIES, DEFAULT_CURRENCY } from "@/lib/products/cashflow-ai/constants";
import { addExchangeRateAction, deleteExchangeRateAction } from "./actions";

export default async function ExchangeRatesPage() {
  const user = await getCurrentFmsUser();
  const canManage = user ? canManageAccounts(user) : false;
  const rates = await listExchangeRates();
  const foreignCurrencies = SUPPORTED_CURRENCIES.filter((c) => c !== DEFAULT_CURRENCY);

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "CashFlow", href: "/cashflow-ai" }, { label: "Settings" }, { label: "Exchange Rates" }]}
        title={<>Exchange Rates</>}
        description={<>Rates to {DEFAULT_CURRENCY}, the base currency. A currency with no rate here converts at 1.0 in every
          report and is flagged — reports never crash on an unrated currency, they just warn.</>}
      />

      {canManage && (
        <GlassCard interactive={false}>
          <CardHeader><CardTitle>Add Rate</CardTitle></CardHeader>
          <CardContent>
            <form action={addExchangeRateAction} className="flex flex-wrap items-end gap-3">
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">Currency</label>
                <select name="currency" required className="h-9 rounded-md border border-input bg-background px-3 text-sm">
                  {foreignCurrencies.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">1 unit = ? {DEFAULT_CURRENCY}</label>
                <Input type="number" step="0.0001" min="0" name="rateToBase" required className="h-9 w-36" />
              </div>
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">Effective From</label>
                <Input type="date" name="effectiveDate" required className="h-9" />
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
                <TableHead>Currency</TableHead>
                <TableHead className="text-right">Rate to {DEFAULT_CURRENCY}</TableHead>
                <TableHead>Effective From</TableHead>
                {canManage && <TableHead className="text-right">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rates.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground">
                    No rates configured — every foreign-currency transaction converts at 1.0 for now.
                  </TableCell>
                </TableRow>
              )}
              {rates.map((r) => (
                <TableRow key={r._id}>
                  <TableCell><Badge variant="secondary">{r.currency}</Badge></TableCell>
                  <TableCell className="text-right tabular-nums">{r.rateToBase}</TableCell>
                  <TableCell>{r.effectiveDate.toLocaleDateString()}</TableCell>
                  {canManage && (
                    <TableCell className="text-right">
                      <SimpleActionButton
                        id={r._id}
                        action={deleteExchangeRateAction}
                        label="Delete"
                        icon={<Trash2 className="size-3.5" data-icon="inline-start" />}
                        successMessage="Rate deleted"
                        variant="ghost"
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
