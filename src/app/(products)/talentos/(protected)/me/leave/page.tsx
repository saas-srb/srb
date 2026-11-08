import PanelListFilters from "@/components/platform/panel/PanelListFilters";
import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import { CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { Badge } from "@/components/ui/badge";
import MyLeaveSheet from "@/components/products/talentos/MyLeaveSheet";
import MyLeaveHistory from "@/components/products/talentos/MyLeaveHistory";
import { getCurrentHrmsUser } from "@/lib/hrms-auth";
import { getBalances, getEmployeeLeaveHistory, listLeaveTypes, currentYear } from "@/lib/products/talentos/leave";

export default async function MyLeavePage() {
  const user = await getCurrentHrmsUser();
  const employeeId = user!.employeeId!;
  const year = currentYear();

  const [balances, history, leaveTypes] = await Promise.all([
    getBalances(employeeId, year),
    getEmployeeLeaveHistory(employeeId, 50),
    listLeaveTypes(),
  ]);

  return (
    <div className="space-y-5">
      <PanelPageHeader
        title={<>My Leave</>}
        description={<>{year} balances and request history.</>}
        actions={<><MyLeaveSheet leaveTypes={leaveTypes.map((t) => ({ code: t.code, label: t.label }))} /></>}
      />

      <PanelListFilters>
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
        <h2 className="mb-2 text-sm font-semibold text-foreground">Request History</h2>
        <MyLeaveHistory
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
</PanelListFilters>
    </div>
  );
}
