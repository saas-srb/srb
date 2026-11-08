import PanelListFilters from "@/components/platform/panel/PanelListFilters";
import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import { redirect } from "next/navigation";
import { FolderGit2, Rocket, CheckCircle2, Flag } from "lucide-react";
import { CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import KpiCard from "@/components/products/dealflow-ai/KpiCard";
import KpiGrid from "@/components/products/dealflow-ai/KpiGrid";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import ProgressBar from "@/components/products/sprintos/ProgressBar";
import { LiveProjectStatusBadge } from "@/components/products/cohort-ai/StatusBadges";
import ProjectMilestones from "@/components/products/cohort-ai/ProjectMilestones";
import { getCurrentTmsUser } from "@/lib/tms-auth";
import { listLiveProjectsForStudent } from "@/lib/products/cohort-ai/projects";
import { GitBranch, ExternalLink } from "lucide-react";

export default async function MyProjectsPage() {
  const user = await getCurrentTmsUser();
  if (!user?.studentId) redirect("/cohort-ai");

  const projects = await listLiveProjectsForStudent(user.studentId);
  const active = projects.filter((p) => p.status === "in_progress").length;
  const completed = projects.filter((p) => p.status === "completed").length;
  const totalMilestones = projects.reduce((s, p) => s + p.milestones.length, 0);
  const doneMilestones = projects.reduce((s, p) => s + p.milestones.filter((m) => m.done).length, 0);

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "Cohort AI", href: "/cohort-ai/me" }, { label: "Live Projects" }]}
        title={<>Live Projects</>}
      />

      <PanelListFilters>
<KpiGrid>
        <KpiCard label="My Projects" value={projects.length} accent icon={<FolderGit2 className="size-4" />} />
        <KpiCard label="In Progress" value={active} icon={<Rocket className="size-4" />} />
        <KpiCard label="Completed" value={completed} icon={<CheckCircle2 className="size-4" />} />
        <KpiCard label="Milestones" value={`${doneMilestones}/${totalMilestones}`} icon={<Flag className="size-4" />} />
      </KpiGrid>

      {projects.length === 0 ? (
        <GlassCard interactive={false}>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            No projects assigned to you yet.
          </CardContent>
        </GlassCard>
      ) : (
        <div className="space-y-4">
          {projects.map((p) => (
            <GlassCard key={p._id}>
              <CardHeader className="flex-row items-start justify-between space-y-0">
                <div>
                  <CardTitle className="text-base">{p.title}</CardTitle>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    <span className="font-mono">{p.projectCode}</span> · {p.programName}
                    {p.mentorName ? ` · Mentor: ${p.mentorName}` : ""}
                  </p>
                </div>
                <LiveProjectStatusBadge status={p.status} />
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                {p.description && <p className="whitespace-pre-wrap text-muted-foreground">{p.description}</p>}
                <div>
                  <p className="mb-1 text-xs text-muted-foreground">Progress</p>
                  <ProgressBar value={p.progress} />
                </div>
                <div className="flex flex-wrap gap-2">
                  {p.repoUrl && (
                    <a href={p.repoUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                      <GitBranch className="size-3.5" /> Repository
                    </a>
                  )}
                  {p.demoUrl && (
                    <a href={p.demoUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                      <ExternalLink className="size-3.5" /> Demo
                    </a>
                  )}
                </div>
                <div>
                  <p className="mb-1 text-xs font-medium text-foreground">Milestones</p>
                  <ProjectMilestones projectId={p._id} milestones={p.milestones} canToggle />
                </div>
              </CardContent>
            </GlassCard>
          ))}
        </div>
      )}
</PanelListFilters>
    </div>
  );
}
