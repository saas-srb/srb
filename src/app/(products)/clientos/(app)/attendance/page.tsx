import PanelListFilters from "@/components/platform/panel/PanelListFilters";
import { CalendarCheck } from "lucide-react";
import { CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { guardPortalPage } from "@/lib/products/clientos/guard";
import { getLearnerOverview, getLearnerSchedule } from "@/lib/products/clientos/student";
import { ProgressRing, PortalPageHeader } from "@/components/products/clientos/widgets";
import EmptyPortalState from "@/components/products/clientos/EmptyPortalState";
import { brandedMetadata } from "@/lib/platform/branding/metadata";

export const dynamic = "force-dynamic";
export const generateMetadata = () => brandedMetadata("Attendance · {brand} {product:portal}");

export default async function AttendancePage() {
  const user = await guardPortalPage("intern", "trainee");
  const data = await getLearnerOverview(user.studentId);
  if (!data) return <EmptyPortalState title="No attendance yet" body="Your attendance record appears here once classes begin." />;

  const { attendance } = data;
  const { past } = await getLearnerSchedule(data.batchIds);

  return (
    <div className="space-y-5">
      <PortalPageHeader title="Attendance" subtitle={`${attendance.attended} of ${attendance.total} sessions attended`} />

      <PanelListFilters>
<div className="grid gap-5 sm:grid-cols-[auto_1fr]">
        <GlassCard>
          <CardContent className="flex items-center justify-center py-6">
            <ProgressRing value={attendance.ratePercent} label="Attendance" />
          </CardContent>
        </GlassCard>
        <GlassCard>
          <CardHeader>
            <CardTitle className="text-base">Breakdown</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {Object.entries(attendance.byStatus).length === 0 && <p className="text-muted-foreground">No sessions recorded yet.</p>}
            {Object.entries(attendance.byStatus).map(([status, count]) => (
              <div key={status} className="flex items-center justify-between rounded-lg border border-border/50 px-3 py-1.5">
                <span className="capitalize text-muted-foreground">{status}</span>
                <span className="font-semibold text-foreground">{count}</span>
              </div>
            ))}
          </CardContent>
        </GlassCard>
      </div>

      <GlassCard>
        <CardHeader>
          <CardTitle className="text-base">Recent sessions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {past.length === 0 && <p className="text-sm text-muted-foreground">No completed classes yet.</p>}
          {past.slice(0, 15).map((c) => (
            <div key={c._id} className="flex items-center gap-3 rounded-xl border border-border/50 px-3 py-2 text-sm">
              <CalendarCheck className="size-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate text-foreground">{c.topic}</span>
              <span className="shrink-0 text-xs text-muted-foreground">{c.date}</span>
            </div>
          ))}
        </CardContent>
      </GlassCard>
</PanelListFilters>
    </div>
  );
}
