import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import { notFound } from "next/navigation";
import Link from "next/link";
import { GitBranch, ExternalLink, UserRound, Users, Flag, Gauge } from "lucide-react";
import { CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import KpiCard from "@/components/products/dealflow-ai/KpiCard";
import KpiGrid from "@/components/products/dealflow-ai/KpiGrid";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import ProgressBar from "@/components/products/sprintos/ProgressBar";
import { LiveProjectStatusBadge } from "@/components/products/cohort-ai/StatusBadges";
import LiveProjectActions from "@/components/products/cohort-ai/LiveProjectActions";
import ProjectMilestones from "@/components/products/cohort-ai/ProjectMilestones";
import { getCurrentTmsUser } from "@/lib/tms-auth";
import { canManageTraining } from "@/lib/tms-roles";
import { getLiveProject, serializeLiveProject, effectiveProgress } from "@/lib/products/cohort-ai/projects";
import { listProgramOptions } from "@/lib/products/cohort-ai/programs";
import { listBatchPickerOptions } from "@/lib/products/cohort-ai/batches";
import { listMentorOptions, getMentorName } from "@/lib/products/cohort-ai/mentors";
import { listStudentBatchMemberships } from "@/lib/products/cohort-ai/enrollments";
import { getDb } from "@/lib/mongodb";
import { formatDate } from "@/lib/utils";

export default async function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await getLiveProject(id);
  if (!project) notFound();

  const [user, programs, batches, mentors, memberships, mentorName] = await Promise.all([
    getCurrentTmsUser(),
    listProgramOptions(),
    listBatchPickerOptions(),
    listMentorOptions(),
    listStudentBatchMemberships(),
    getMentorName(project.mentorId),
  ]);

  const db = await getDb();
  const students = await db
    .collection<{ _id: string; fullName: string; studentCode: string }>("training_students")
    .find({ _id: { $in: project.studentIds } }, { projection: { fullName: 1, studentCode: 1 } })
    .toArray();
  const program = programs.find((p) => p._id === project.programId);

  const canManage = user ? canManageTraining(user) : false;
  const isAssignedStudent = Boolean(user?.studentId && project.studentIds.includes(user.studentId));
  const p = serializeLiveProject(project);
  const progress = effectiveProgress(project);
  const doneMs = project.milestones.filter((m) => m.done).length;

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "Cohort AI", href: "/cohort-ai" }, { label: "Projects", href: "/cohort-ai/projects" }, { label: p.title }]}
        title={<><span className="inline-flex flex-wrap items-center gap-2">{p.title}<LiveProjectStatusBadge status={p.status} /></span></>}
        description={<><span className="font-mono">{p.projectCode}</span>
            {program ? ` · ${program.name}` : ""}</>}
        actions={<>{canManage && (
          <LiveProjectActions
            project={p}
            programs={programs.map((x) => ({ _id: x._id, name: x.name }))}
            batches={batches.map((b) => ({ _id: b._id, name: b.name, programId: b.programId }))}
            mentors={mentors.map((m) => ({ _id: m._id, name: m.name }))}
            memberships={memberships.map((m) => ({ studentId: m.studentId, fullName: m.fullName, batchId: m.batchId }))}
          />
        )}</>}
      />

      <KpiGrid>
        <KpiCard label="Progress" value={progress} suffix="%" accent icon={<Gauge className="size-4" />} />
        <KpiCard label="Milestones" value={`${doneMs}/${project.milestones.length}`} icon={<Flag className="size-4" />} />
        <KpiCard label="Students" value={project.studentIds.length} icon={<Users className="size-4" />} />
        <KpiCard label="Mentor" value={mentorName ?? "—"} icon={<UserRound className="size-4" />} />
      </KpiGrid>

      <div className="grid gap-4 lg:grid-cols-2">
        <GlassCard>
          <CardHeader><CardTitle>Overview</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="whitespace-pre-wrap text-muted-foreground">{p.description || "No description."}</p>
            <ProgressBar value={progress} />
            <dl className="space-y-1.5 text-xs">
              <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Timeline</dt><dd>{p.startDate ? formatDate(p.startDate) : "TBD"} – {p.dueDate ? formatDate(p.dueDate) : "TBD"}</dd></div>
            </dl>
            <div className="flex flex-wrap gap-2">
              {p.repoUrl && (
                <a href={p.repoUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                  <GitBranch className="size-3.5" /> Repository
                </a>
              )}
              {p.demoUrl && (
                <a href={p.demoUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                  <ExternalLink className="size-3.5" /> Live demo
                </a>
              )}
            </div>
          </CardContent>
        </GlassCard>

        <GlassCard>
          <CardHeader><CardTitle>Team</CardTitle></CardHeader>
          <CardContent className="space-y-1.5 text-sm">
            {students.length === 0 ? (
              <p className="text-muted-foreground">No students assigned.</p>
            ) : (
              students.map((s) => (
                <Link key={s._id} href={`/cohort-ai/students/${s._id}`} className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2 hover:bg-muted/50">
                  <span className="font-medium">{s.fullName}</span>
                  <span className="font-mono text-xs text-muted-foreground">{s.studentCode}</span>
                </Link>
              ))
            )}
          </CardContent>
        </GlassCard>
      </div>

      <GlassCard interactive={false}>
        <CardHeader><CardTitle>Milestones</CardTitle></CardHeader>
        <CardContent>
          <ProjectMilestones projectId={p._id} milestones={project.milestones} canToggle={canManage || isAssignedStudent} />
        </CardContent>
      </GlassCard>
    </div>
  );
}
