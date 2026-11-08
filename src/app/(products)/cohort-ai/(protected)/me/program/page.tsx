import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import { redirect } from "next/navigation";
import { CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import ProgressBar from "@/components/products/sprintos/ProgressBar";
import { ProgramCategoryBadge, TrainingModeBadge, ProgramStatusBadge } from "@/components/products/cohort-ai/StatusBadges";
import { getCurrentTmsUser } from "@/lib/tms-auth";
import { getStudentOverview } from "@/lib/products/cohort-ai/student-dashboard";
import { getProgram } from "@/lib/products/cohort-ai/programs";
import { formatCurrency } from "@/lib/utils";

export default async function MyProgramPage() {
  const user = await getCurrentTmsUser();
  if (!user?.studentId) redirect("/cohort-ai");
  const overview = await getStudentOverview(user.studentId);
  if (!overview) redirect("/cohort-ai");

  const { enrollments } = overview;
  const programs = await Promise.all(
    Array.from(new Set(enrollments.map((e) => e.programId))).map((id) => getProgram(id))
  );
  const byId = new Map(programs.filter(Boolean).map((p) => [p!._id, p!]));

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "Cohort AI", href: "/cohort-ai/me" }, { label: "My Program" }]}
        title={<>My Program</>}
      />

      {enrollments.length === 0 && (
        <GlassCard interactive={false}>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            You are not enrolled in a program yet.
          </CardContent>
        </GlassCard>
      )}

      {enrollments.map((e) => {
        const p = byId.get(e.programId);
        return (
          <GlassCard key={e.enrollmentId}>
            <CardHeader className="flex-row items-start justify-between space-y-0">
              <div>
                <CardTitle>{e.programName}</CardTitle>
                <p className="mt-1 flex flex-wrap items-center gap-1.5">
                  <ProgramCategoryBadge category={e.programCategory} />
                  {p ? <TrainingModeBadge mode={p.mode} /> : null}
                  {p ? <ProgramStatusBadge status={p.status} /> : null}
                </p>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div>
                <p className="mb-1 text-xs text-muted-foreground">Your progress</p>
                <ProgressBar value={e.progressPercent} />
              </div>
              {p && (
                <>
                  <p className="whitespace-pre-wrap text-muted-foreground">{p.description || "No description."}</p>
                  <dl className="grid grid-cols-2 gap-2 text-xs">
                    <div><dt className="text-muted-foreground">Duration</dt><dd>{p.durationWeeks ?? "—"} weeks</dd></div>
                    <div><dt className="text-muted-foreground">Fees</dt><dd>{p.fees != null ? formatCurrency(p.fees, p.currency) : "—"}</dd></div>
                    <div><dt className="text-muted-foreground">Live projects</dt><dd>{p.liveProjectCount}</dd></div>
                    <div><dt className="text-muted-foreground">Certificate</dt><dd>{p.certificateIncluded ? "Included" : "Not included"}</dd></div>
                  </dl>
                  {p.learningOutcomes.length > 0 && (
                    <div>
                      <p className="mb-1 text-xs font-medium text-foreground">Learning outcomes</p>
                      <ul className="list-disc space-y-0.5 pl-5 text-xs text-muted-foreground">
                        {p.learningOutcomes.map((o, i) => <li key={i}>{o}</li>)}
                      </ul>
                    </div>
                  )}
                  {p.tools.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {p.tools.map((t) => (
                        <span key={t} className="rounded-md bg-primary/8 px-2 py-0.5 text-xs font-medium text-primary">{t}</span>
                      ))}
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </GlassCard>
        );
      })}
    </div>
  );
}
