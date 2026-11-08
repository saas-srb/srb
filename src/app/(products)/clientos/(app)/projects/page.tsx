import PanelListFilters from "@/components/platform/panel/PanelListFilters";
import { FolderKanban, ExternalLink, GitBranch } from "lucide-react";
import { CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import ProgressBar from "@/components/products/sprintos/ProgressBar";
import { guardPortalPage } from "@/lib/products/clientos/guard";
import { getLearnerOverview } from "@/lib/products/clientos/student";
import { getClientOverview } from "@/lib/products/clientos/client";
import { PortalPageHeader } from "@/components/products/clientos/widgets";
import EmptyPortalState from "@/components/products/clientos/EmptyPortalState";
import { brandedMetadata } from "@/lib/platform/branding/metadata";

export const dynamic = "force-dynamic";
export const generateMetadata = () => brandedMetadata("Projects · {brand} {product:portal}");

export default async function ProjectsPage() {
  const user = await guardPortalPage("intern", "trainee", "client");

  if (user.role === "client") {
    const data = await getClientOverview(user.clientId);
    if (!data) return <EmptyPortalState title="No projects yet" body="Your projects appear here once they're set up." />;
    return (
      <div className="mx-auto max-w-5xl space-y-5 p-4 sm:p-6">
        <PortalPageHeader title="My Projects" subtitle={`${data.projects.length} project${data.projects.length === 1 ? "" : "s"} · ${data.overallProgress}% overall`} />
        <PanelListFilters>
<div className="grid gap-4 sm:grid-cols-2">
          {data.projects.map(({ project, milestones }) => {
            const done = milestones.filter((m) => m.status === "completed").length;
            return (
              <GlassCard key={project._id}>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between gap-2 text-base">
                    <span className="truncate">{project.name}</span>
                    <span className="shrink-0 text-[11px] font-medium capitalize text-muted-foreground">{project.status.replace(/_/g, " ")}</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <p className="text-xs text-muted-foreground">
                    {project.projectCode}
                    {project.startDate ? ` · ${project.startDate}` : ""}
                    {project.endDate ? ` → ${project.endDate}` : ""}
                  </p>
                  {project.description && <p className="text-muted-foreground">{project.description}</p>}
                  <ProgressBar value={project.progressPercent ?? 0} />
                  <p className="text-xs text-muted-foreground">{done} / {milestones.length} milestones complete</p>
                </CardContent>
              </GlassCard>
            );
          })}
        </div>
</PanelListFilters>
      </div>
    );
  }

  const data = await getLearnerOverview(user.studentId);
  if (!data) return <EmptyPortalState title="No projects assigned" body="Live projects assigned to you appear here." />;

  return (
    <div className="space-y-5">
      <PortalPageHeader title="Live Projects" subtitle={`${data.projects.length} assigned`} />
      {data.projects.length === 0 && (
        <GlassCard>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">No projects assigned yet.</CardContent>
        </GlassCard>
      )}
      <div className="space-y-4">
        {data.projects.map((p) => (
          <GlassCard key={p._id}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <FolderKanban className="size-4" /> {p.title}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {p.description && <p className="text-muted-foreground">{p.description}</p>}
              <ProgressBar value={p.progress ?? 0} />
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span>{p.programName}{p.batchName ? ` · ${p.batchName}` : ""}</span>
                {p.mentorName && <span>Mentor: {p.mentorName}</span>}
                <span className="capitalize">{p.status.replace(/_/g, " ")}</span>
              </div>
              <div className="flex gap-3">
                {p.repoUrl && (
                  <a href={p.repoUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                    <GitBranch className="size-3.5" /> Repo
                  </a>
                )}
                {p.demoUrl && (
                  <a href={p.demoUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                    <ExternalLink className="size-3.5" /> Demo
                  </a>
                )}
              </div>
              {p.milestones.length > 0 && (
                <ul className="space-y-1 border-t border-border/50 pt-2 text-xs text-muted-foreground">
                  {p.milestones.map((m) => (
                    <li key={m.id} className="flex items-center justify-between gap-2">
                      <span className="truncate">{m.title}</span>
                      <span className="shrink-0">{m.done ? "Done" : "Pending"}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </GlassCard>
        ))}
      </div>
    </div>
  );
}
