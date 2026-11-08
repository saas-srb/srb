import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import { CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import { TRANSACTION_TRANSITIONS, TRANSACTION_STATUSES } from "@/lib/products/cashflow-ai/constants";

/**
 * Reference-only. A configurable amount/department/vendor approval-rules
 * *engine* was explicitly evaluated and deferred back in Phase 3
 * ("neither PRMS nor FMS has one anywhere") — that finding still holds.
 * This page documents the real, current approval model
 * (`canApproveTransactions` in `fms-roles.ts`) rather than reopening that
 * decision or leaving the nav item dead.
 */
export default function ApprovalsSettingsPage() {
  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "CashFlow", href: "/cashflow-ai" }, { label: "Settings" }, { label: "Approvals" }]}
        title={<>Approval Configuration</>}
        description={<>The current, real approval model — who can approve, and the controlled state transitions every
          transaction follows. Not a configurable rules engine.</>}
      />

      <GlassCard interactive={false}>
        <CardHeader><CardTitle>Who Can Approve</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex items-center justify-between border-b border-border/40 py-2">
            <span className="text-muted-foreground">Approve / reject a pending transaction</span>
            <span className="flex gap-1.5">
              <Badge variant="secondary">Finance Admin</Badge>
              <Badge variant="secondary">Finance Manager</Badge>
            </span>
          </div>
          <p className="pt-2 text-xs text-muted-foreground">
            There is no amount threshold, department rule, or vendor-specific rule today — every pending transaction
            follows the same single approval gate, defined in <code>fms-roles.ts::canApproveTransactions()</code>.
          </p>
        </CardContent>
      </GlassCard>

      <GlassCard interactive={false}>
        <CardHeader><CardTitle>Controlled Status Transitions</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>From</TableHead>
                <TableHead>Can move to</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {TRANSACTION_STATUSES.map((s) => {
                const next = TRANSACTION_TRANSITIONS[s.value];
                if (!next || next.length === 0) return null;
                return (
                  <TableRow key={s.value}>
                    <TableCell className="font-medium">{s.label}</TableCell>
                    <TableCell className="flex flex-wrap gap-1.5">
                      {next.map((n) => (
                        <Badge key={n} variant="secondary">{TRANSACTION_STATUSES.find((x) => x.value === n)?.label ?? n}</Badge>
                      ))}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </GlassCard>
    </div>
  );
}
