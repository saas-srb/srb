import { CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { Badge } from "@/components/ui/badge";
import MyLeaveHistory from "@/components/products/talentos/MyLeaveHistory";
import { getBalances, getEmployeeLeaveHistory, currentYear } from "@/lib/products/talentos/leave";

/** The person's own leave: this year's balances and their request history. Shown on the Leave page to everyone who holds `leave.view`. */
export default async function MyLeavePanel({ employeeId, canWithdraw }: { employeeId: string; canWithdraw: boolean }) {
  const year = currentYear();
  const [balances, history] = await Promise.all([getBalances(employeeId, year), getEmployeeLeaveHistory(employeeId, 50)]);
  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {balances.map((b) => (
          <GlassCard key={b.leaveTypeCode} interactive={false}>
            <CardContent className="py-4">
              <div className="flex items-center justify-between">
                <Badge className={b.colorClass}>{b.label}</Badge>
                {!b.paid && <span className="text-[11px] text-muted-foreground">Unpaid</span>}
              </div>
              <p className="mt-2 text-2xl font-bold tabular-nums text-foreground">{b.available}</p>
              <p className="text-xs text-muted-foreground">
                available · {b.used} used · {b.pending} pending · {b.allocated} allocated
              </p>
            </CardContent>
          </GlassCard>
        ))}
      </div>
      <div>
        <h2 className="mb-2 text-sm font-semibold text-foreground">Request History ({year})</h2>
        <MyLeaveHistory
          canWithdraw={canWithdraw}
          rows={history.map((r) => ({
            _id: r._id,
            leaveTypeLabel: r.leaveTypeLabel,
            startDate: r.startDate,
            endDate: r.endDate,
            days: r.days,
            reason: r.reason,
            status: r.status,
            decisionNote: r.decisionNote,
          }))}
        />
      </div>
    </div>
  );
}
