import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import { Lock, LockOpen } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import SimpleActionButton from "@/components/products/cashflow-ai/SimpleActionButton";
import { getCurrentFmsUser } from "@/lib/fms-auth";
import { canManageFiscalPeriods } from "@/lib/fms-roles";
import { listFiscalPeriods } from "@/lib/products/cashflow-ai/fiscal-periods";
import { createFiscalPeriodAction, closeFiscalPeriodAction, reopenFiscalPeriodAction } from "./actions";
import { formatDate } from "@/lib/utils";

export default async function FiscalPeriodsPage() {
  const user = await getCurrentFmsUser();
  const canManage = user ? canManageFiscalPeriods(user) : false;
  const periods = await listFiscalPeriods();

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "CashFlow", href: "/cashflow-ai" }, { label: "Settings" }, { label: "Fiscal Periods" }]}
        title={<>Fiscal Periods</>}
        description={<>Closing a period posts a real journal entry that zeroes its income/expense activity into Retained Earnings
          and locks it against further postings. Reopening reverses that entry.</>}
      />

      {canManage && (
        <GlassCard interactive={false}>
          <CardHeader><CardTitle>New Period</CardTitle></CardHeader>
          <CardContent>
            <form action={createFiscalPeriodAction} className="flex flex-wrap items-end gap-3">
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">Name</label>
                <Input name="name" placeholder="FY 2025-26" required className="h-9" />
              </div>
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">Start</label>
                <Input type="date" name="startDate" required className="h-9" />
              </div>
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">End</label>
                <Input type="date" name="endDate" required className="h-9" />
              </div>
              <Button type="submit" size="sm">Create</Button>
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
                <TableHead>Start</TableHead>
                <TableHead>End</TableHead>
                <TableHead>Status</TableHead>
                {canManage && <TableHead className="text-right">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {periods.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">No fiscal periods defined yet.</TableCell>
                </TableRow>
              )}
              {periods.map((p) => (
                <TableRow key={p._id}>
                  <TableCell className="font-medium">{p.name}</TableCell>
                  <TableCell>{formatFiscalDate(p.startDate)}</TableCell>
                  <TableCell>{formatFiscalDate(p.endDate)}</TableCell>
                  <TableCell>
                    <Badge
                      className={
                        p.status === "closed" ? "bg-muted text-muted-foreground" : "bg-green-500/15 text-green-600 dark:text-green-400"
                      }
                    >
                      {p.status === "closed" ? "Closed" : "Open"}
                    </Badge>
                  </TableCell>
                  {canManage && (
                    <TableCell className="text-right">
                      {p.status === "open" ? (
                        <SimpleActionButton
                          id={p._id}
                          action={closeFiscalPeriodAction}
                          label="Close"
                          icon={<Lock className="size-3.5" data-icon="inline-start" />}
                          successMessage="Period closed"
                          confirmMessage={`Close "${p.name}"? This posts a real closing journal entry and locks it against further postings.`}
                        />
                      ) : (
                        <SimpleActionButton
                          id={p._id}
                          action={reopenFiscalPeriodAction}
                          label="Reopen"
                          icon={<LockOpen className="size-3.5" data-icon="inline-start" />}
                          successMessage="Period reopened"
                        />
                      )}
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

function formatFiscalDate(value: Date | string | null | undefined): string {
  if (value == null) return "—";
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : formatDate(date);
}
