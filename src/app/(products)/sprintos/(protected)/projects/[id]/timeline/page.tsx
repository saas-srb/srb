import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarClock } from "lucide-react";
import { CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import ProjectTabs from "@/components/products/sprintos/ProjectTabs";
import GanttChart from "@/components/products/sprintos/timeline/GanttChart";
import { getCurrentPmsUser } from "@/lib/pms-auth";
import { checkProjectAccess } from "@/lib/products/sprintos/access";
import { getProject } from "@/lib/products/sprintos/projects";
import { getProjectTimeline, getUpcomingDeadlines } from "@/lib/products/sprintos/timeline";
import { cn, formatDate } from "@/lib/utils";

export default async function ProjectTimelinePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [user, project] = await Promise.all([getCurrentPmsUser(), getProject(id)]);
  if (!project) notFound();
  if (user && !(await checkProjectAccess(user, id)).allowed) notFound();

  const [timeline, deadlines] = await Promise.all([
    getProjectTimeline(id),
    getUpcomingDeadlines({ days: 60 }),
  ]);
  const projectDeadlines = deadlines.filter((d) => d.projectId === id);

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[
          { label: "SprintOS", href: "/sprintos" },
          { label: "Projects", href: "/sprintos/projects" },
          { label: project.name, href: `/sprintos/projects/${id}` },
          { label: "Timeline" },
        ]}
        title={<>{project.name} · Timeline</>}
      />
      <ProjectTabs projectId={id} />

      <GlassCard interactive={false}>
        <CardHeader><CardTitle>Gantt</CardTitle></CardHeader>
        <CardContent>
          <GanttChart timeline={timeline} />
        </CardContent>
      </GlassCard>

      <GlassCard>
        <CardHeader><CardTitle className="flex items-center gap-2"><CalendarClock className="size-4" /> Upcoming &amp; Overdue</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {projectDeadlines.length === 0 && <p className="text-sm text-muted-foreground">Nothing due in the next 60 days.</p>}
          {projectDeadlines.map((d) => (
            <Link
              key={`${d.kind}-${d.id}`}
              href={d.href}
              className="flex items-center justify-between gap-3 rounded-lg border border-border/60 p-2.5 text-sm transition-colors hover:bg-muted/50"
            >
              <span className="min-w-0 truncate">
                <span className="mr-1.5 rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase text-muted-foreground">{d.kind}</span>
                {d.title}
              </span>
              <span className={cn("shrink-0 text-xs", d.overdue ? "font-medium text-destructive" : "text-muted-foreground")}>
                {formatDate(d.date)}
              </span>
            </Link>
          ))}
        </CardContent>
      </GlassCard>
    </div>
  );
}
