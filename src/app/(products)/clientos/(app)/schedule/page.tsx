import PanelListFilters from "@/components/platform/panel/PanelListFilters";
import { CalendarClock, Video } from "lucide-react";
import { CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { guardPortalPage } from "@/lib/products/clientos/guard";
import { getLearnerOverview, getLearnerSchedule } from "@/lib/products/clientos/student";
import { PortalPageHeader } from "@/components/products/clientos/widgets";
import EmptyPortalState from "@/components/products/clientos/EmptyPortalState";
import type { ClassView } from "@/lib/products/cohort-ai/classes";
import { brandedMetadata } from "@/lib/platform/branding/metadata";

export const dynamic = "force-dynamic";
export const generateMetadata = () => brandedMetadata("Class Schedule · {brand} {product:portal}");

function ClassRow({ c }: { c: ClassView }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border/50 px-3 py-2">
      <span className="flex size-9 shrink-0 flex-col items-center justify-center rounded-xl bg-primary/10 text-primary">
        <CalendarClock className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{c.topic}</p>
        <p className="truncate text-xs text-muted-foreground">
          {c.programName} · {c.batchName}
          {c.startTime ? ` · ${c.startTime}` : ""} · {c.durationMinutes} min
        </p>
      </div>
      <span className="shrink-0 text-xs text-muted-foreground">{c.date}</span>
      {c.meetingLink && (
        <a href={c.meetingLink} target="_blank" rel="noreferrer" className="shrink-0 text-primary" title="Join">
          <Video className="size-4" />
        </a>
      )}
    </div>
  );
}

export default async function SchedulePage() {
  const user = await guardPortalPage("intern", "trainee");
  const data = await getLearnerOverview(user.studentId);
  if (!data) return <EmptyPortalState title="No batch yet" body="Your class schedule appears here once you're placed in a batch." />;

  const { upcoming, past } = await getLearnerSchedule(data.batchIds);

  return (
    <div className="space-y-5">
      <PortalPageHeader title={user.role === "intern" ? "Batch Schedule" : "Class Schedule"} subtitle={`${upcoming.length} upcoming · ${past.length} completed`} />

      <PanelListFilters>
<GlassCard>
        <CardHeader>
          <CardTitle className="text-base">Upcoming classes</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {upcoming.length === 0 && <p className="text-sm text-muted-foreground">No upcoming classes scheduled.</p>}
          {upcoming.map((c) => (
            <ClassRow key={c._id} c={c} />
          ))}
        </CardContent>
      </GlassCard>

      {past.length > 0 && (
        <GlassCard>
          <CardHeader>
            <CardTitle className="text-base">Past classes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {past.map((c) => (
              <ClassRow key={c._id} c={c} />
            ))}
          </CardContent>
        </GlassCard>
      )}
</PanelListFilters>
    </div>
  );
}
