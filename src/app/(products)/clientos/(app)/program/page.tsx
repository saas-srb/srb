import PanelListFilters from "@/components/platform/panel/PanelListFilters";
import { GraduationCap, UserRound, Layers, CalendarRange } from "lucide-react";
import { CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import ProgressBar from "@/components/products/sprintos/ProgressBar";
import { guardPortalPage } from "@/lib/products/clientos/guard";
import { getLearnerOverview } from "@/lib/products/clientos/student";
import { PortalPageHeader, InfoCard } from "@/components/products/clientos/widgets";
import EmptyPortalState from "@/components/products/clientos/EmptyPortalState";
import { brandedMetadata } from "@/lib/platform/branding/metadata";

export const dynamic = "force-dynamic";
export const generateMetadata = () => brandedMetadata("My Programme · {brand} {product:portal}");

export default async function ProgramPage() {
  const user = await guardPortalPage("intern", "trainee");
  const data = await getLearnerOverview(user.studentId);
  if (!data) return <EmptyPortalState title="No enrolment found" body="Your training record appears here once our team enrols you." />;

  const isIntern = user.role === "intern";
  const { overview } = data;

  return (
    <div className="space-y-5">
      <PortalPageHeader
        title={isIntern ? "My Internship" : "My Programme"}
        subtitle={`Overall progress ${overview.averageProgress}%`}
      />

      <PanelListFilters>
{overview.enrollments.length === 0 && (
        <GlassCard>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">Not enrolled in a programme yet.</CardContent>
        </GlassCard>
      )}

      {overview.enrollments.map((e) => (
        <GlassCard key={e.enrollmentId}>
          <CardHeader>
            <CardTitle className="text-base">{e.programName}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <div className="mb-1 flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Progress</span>
                <span className="font-semibold text-foreground">{e.progressPercent}%</span>
              </div>
              <ProgressBar value={e.progressPercent} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field icon={Layers} label="Batch" value={`${e.batchName} (${e.batchCode})`} />
              <Field icon={UserRound} label="Mentor" value={e.mentorName ?? "To be assigned"} />
              <Field icon={CalendarRange} label="Duration" value={`${e.startDate ?? "TBD"} → ${e.endDate ?? "TBD"}`} />
              <Field icon={GraduationCap} label="Status" value={e.status} />
            </div>
            {e.timing && <p className="text-xs text-muted-foreground">Timing: {e.timing}</p>}
          </CardContent>
        </GlassCard>
      ))}

      <InfoCard title="Mentor">
        <p className="text-sm text-foreground">
          {overview.enrollments.find((e) => e.mentorName)?.mentorName ?? "A mentor will be assigned to your batch shortly."}
        </p>
      </InfoCard>
</PanelListFilters>
    </div>
  );
}

function Field({ icon: Icon, label, value }: { icon: typeof Layers; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <Icon className="size-4" />
      </span>
      <div className="min-w-0">
        <p className="text-[11px] text-muted-foreground">{label}</p>
        <p className="truncate text-sm font-semibold capitalize text-foreground">{value}</p>
      </div>
    </div>
  );
}
