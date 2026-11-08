import PanelListFilters from "@/components/platform/panel/PanelListFilters";
import { CalendarClock, MapPin, Video, Phone, Users } from "lucide-react";
import { CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { guardPortalPage } from "@/lib/products/clientos/guard";
import { getApplicantOverview } from "@/lib/products/clientos/applicant";
import { PortalPageHeader } from "@/components/products/clientos/widgets";
import EmptyPortalState from "@/components/products/clientos/EmptyPortalState";
import { cn } from "@/lib/utils";
import { brandedMetadata } from "@/lib/platform/branding/metadata";

export const dynamic = "force-dynamic";
export const generateMetadata = () => brandedMetadata("Interview Schedule · {brand} {product:portal}");

function fmt(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

const MODE_ICON = { onsite: MapPin, video: Video, phone: Phone } as const;
const STATUS_CLASS: Record<string, string> = {
  scheduled: "bg-primary/10 text-primary",
  completed: "bg-green-500/10 text-green-600 dark:text-green-400",
  cancelled: "bg-muted text-muted-foreground line-through",
};

export default async function InterviewsPage() {
  const user = await guardPortalPage("job_applicant");
  const data = await getApplicantOverview(user.applicationId ?? "");
  if (!data) return <EmptyPortalState title="No application found" body="We couldn't find your application record." />;

  const upcoming = data.upcomingInterviews;
  const upcomingIds = new Set(upcoming.map((i) => i._id));
  const past = data.interviews.filter((i) => !upcomingIds.has(i._id));

  return (
    <div className="space-y-5">
      <PortalPageHeader title="Interview Schedule" subtitle={`${data.interviews.length} interview${data.interviews.length === 1 ? "" : "s"} on record`} />

      <PanelListFilters>
{data.interviews.length === 0 && (
        <GlassCard>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No interviews scheduled yet. Recruitment will add slots here once you&apos;re shortlisted.
          </CardContent>
        </GlassCard>
      )}

      {upcoming.length > 0 && (
        <GlassCard>
          <CardHeader>
            <CardTitle className="text-base">Upcoming</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {upcoming.map((iv) => {
              const Icon = MODE_ICON[iv.mode];
              return (
                <div key={iv._id} className="rounded-xl border border-border/50 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-semibold text-foreground">{iv.title}</p>
                    <span className={cn("rounded-full px-2.5 py-0.5 text-[11px] font-semibold capitalize", STATUS_CLASS[iv.status])}>{iv.status}</span>
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1"><CalendarClock className="size-3.5" /> {fmt(iv.scheduledAt)} · {iv.durationMins} min</span>
                    <span className="flex items-center gap-1"><Icon className="size-3.5" /> {iv.mode === "onsite" ? iv.location || "On-site" : iv.mode === "video" ? "Video call" : "Phone call"}</span>
                    {iv.round && <span>Round: {iv.round}</span>}
                    {iv.panel && <span className="flex items-center gap-1"><Users className="size-3.5" /> {iv.panel}</span>}
                  </div>
                  {iv.mode === "video" && iv.meetingLink && (
                    <a href={iv.meetingLink} target="_blank" rel="noreferrer" className="mt-2 inline-block text-xs font-medium text-primary hover:underline">
                      Join link →
                    </a>
                  )}
                  {iv.notes && <p className="mt-2 text-xs text-muted-foreground">{iv.notes}</p>}
                </div>
              );
            })}
          </CardContent>
        </GlassCard>
      )}

      {past.length > 0 && (
        <GlassCard>
          <CardHeader>
            <CardTitle className="text-base">Past &amp; other</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {past.map((iv) => (
              <div key={iv._id} className="flex items-center justify-between gap-3 rounded-xl border border-border/50 px-3 py-2 text-sm">
                <span className="min-w-0 flex-1 truncate text-foreground">{iv.title}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{fmt(iv.scheduledAt)}</span>
                <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize", STATUS_CLASS[iv.status])}>{iv.status}</span>
              </div>
            ))}
          </CardContent>
        </GlassCard>
      )}
</PanelListFilters>
    </div>
  );
}
