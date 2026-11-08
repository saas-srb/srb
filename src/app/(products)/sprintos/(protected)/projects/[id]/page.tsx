import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarDays, CircleDollarSign, Layers, Building2, ListChecks } from "lucide-react";
import { CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import { ProjectStatusBadge, PriorityBadge, ProjectHealthBadge } from "@/components/products/sprintos/StatusBadges";
import ProjectStatusControl from "@/components/products/sprintos/ProjectStatusControl";
import ProjectProgressControl from "@/components/products/sprintos/ProjectProgressControl";
import ProjectActions from "@/components/products/sprintos/ProjectActions";
import ProjectTeamManager from "@/components/products/sprintos/ProjectTeamManager";
import ProjectTabs from "@/components/products/sprintos/ProjectTabs";
import MilestonesManager from "@/components/products/sprintos/MilestonesManager";
import { getCurrentPmsUser } from "@/lib/pms-auth";
import { canManageProjects } from "@/lib/pms-roles";
import { checkProjectAccess } from "@/lib/products/sprintos/access";
import { getProject, serializeProject } from "@/lib/products/sprintos/projects";
import { getClient } from "@/lib/products/sprintos/clients";
import { listProjectMembers, availableEmployees } from "@/lib/products/sprintos/project-members";
import { recentActivityForProject, serializeActivityLog } from "@/lib/products/sprintos/activity";
import { taskCountsByStatus, projectHasTasks, listTasks } from "@/lib/products/sprintos/tasks";
import { listMilestones } from "@/lib/products/sprintos/milestones";
import { TASK_STATUSES } from "@/lib/products/sprintos/constants";
import ProjectClosePrompt from "@/components/products/sprintos/ProjectClosePrompt";
import { AiCallSummaries, CallsList } from "@/components/products/agentos/calls/AiCallSection";
import { getProjectAiCalls, isClientDoNotContact, SPRINTOS_PRODUCT } from "@/lib/products/sprintos/calls";
import { projectCloseContext } from "@/lib/products/sprintos/call-context";
import { listCallsForTarget } from "@/lib/products/call-target-calls";
import { employeeFullName, getEmployee } from "@/lib/products/talentos/employees";
import { getProjectChannelSlug } from "@/lib/products/huddle-ai/projects";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/utils";

export default async function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [user, project] = await Promise.all([getCurrentPmsUser(), getProject(id)]);
  if (!project) notFound();
  if (user && !(await checkProjectAccess(user, id)).allowed) notFound();

  const canManage = user ? canManageProjects(user) : false;
  const serialized = serializeProject(project);

  const [client, members, employees, activity, manager, taskCounts, hasTasks, milestones, topTasks] = await Promise.all([
    getClient(project.clientId),
    listProjectMembers(id),
    availableEmployees(),
    recentActivityForProject(id, 20),
    project.projectManagerId ? getEmployee(project.projectManagerId) : Promise.resolve(null),
    taskCountsByStatus(id),
    projectHasTasks(id),
    listMilestones(id),
    listTasks(id, {}),
  ]);
  const totalTasks = Object.values(taskCounts).reduce((s, n) => s + n, 0);
  const messengerSlug = await getProjectChannelSlug(id).catch(() => null);
  const closed = project.status === "completed";
  const [aiCalls, projectCalls, clientBlocked] = canManage
    ? await Promise.all([getProjectAiCalls(id), listCallsForTarget(SPRINTOS_PRODUCT, "project", id), isClientDoNotContact(project.clientId)])
    : [[], [], false];

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[
          { label: "SprintOS", href: "/sprintos" },
          { label: "Projects", href: "/sprintos/projects" },
          { label: project.name },
        ]}
        title={<><span className="inline-flex flex-wrap items-center gap-2">{project.name}<PriorityBadge priority={project.priority} />
            <ProjectHealthBadge health={serialized.health} /></span></>}
        description={<><span className="font-mono">{project.projectCode}</span>
            {client ? (
              <>
                {" · "}
                <Link href={`/sprintos/clients/${client._id}`} className="hover:text-primary hover:underline">
                  {client.companyName}
                </Link>
              </>
            ) : null}
            {project.category ? ` · ${project.category}` : ""}</>}
        actions={<><div className="flex flex-wrap items-center gap-2">
          {canManage ? (
            <ProjectStatusControl projectId={id} status={project.status} />
          ) : (
            <ProjectStatusBadge status={project.status} />
          )}
          {canManage && (
            <Link href={`/sprintos/costing/${id}`} className="text-sm font-medium text-primary hover:underline">
              Costing &amp; Reports →
            </Link>
          )}
          {messengerSlug && (
            <Link href={`/huddle-ai/projects/${messengerSlug}`} className="text-sm font-medium text-primary hover:underline">
              Team channel →
            </Link>
          )}
          {canManage && <ProjectActions projectId={id} projectName={project.name} />}
        </div></>}
      />

      <ProjectTabs projectId={id} />

      {canManage && closed && (
        <ProjectClosePrompt
          projectId={id}
          projectName={project.name}
          contactName={client?.primaryContact.name ?? null}
          contactPhone={client?.primaryContact.phone ?? null}
          context={projectCloseContext(project, client?.primaryContact ?? null)}
          doNotContact={clientBlocked}
        />
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <GlassCard>
          <CardHeader><CardTitle>Timeline</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p className="flex items-center gap-2">
              <CalendarDays className="size-3.5" />
              {project.startDate ? formatDate(project.startDate) : "No start"} → {project.endDate ? formatDate(project.endDate) : "No end"}
            </p>
            <p className="flex items-center gap-2">
              <CircleDollarSign className="size-3.5" />
              {project.estimatedBudget != null ? formatCurrency(project.estimatedBudget, project.currency) : "No budget set"}
            </p>
            <p className="flex items-center gap-2">
              <Building2 className="size-3.5" />
              PM: {manager ? employeeFullName(manager) : "Unassigned"}
            </p>
          </CardContent>
        </GlassCard>

        <GlassCard className="lg:col-span-2">
          <CardHeader><CardTitle>Progress</CardTitle></CardHeader>
          <CardContent>
            <ProjectProgressControl
              projectId={id}
              progressPercent={project.progressPercent}
              editable={canManage}
              taskDriven={hasTasks}
            />
          </CardContent>
        </GlassCard>
      </div>

      <GlassCard>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="flex items-center gap-2"><ListChecks className="size-4" /> Tasks ({totalTasks})</CardTitle>
          <Link href={`/sprintos/projects/${id}/board`} className="text-sm font-medium text-primary hover:underline">
            Open board →
          </Link>
        </CardHeader>
        <CardContent>
          {totalTasks === 0 ? (
            <p className="text-sm text-muted-foreground">
              No tasks yet. <Link href={`/sprintos/projects/${id}/board`} className="text-primary hover:underline">Add the first one</Link>.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              {TASK_STATUSES.map((s) => (
                <Link
                  key={s.value}
                  href={`/sprintos/projects/${id}/tasks`}
                  className="rounded-lg border border-border/60 p-3 text-center transition-colors hover:bg-muted/50"
                >
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                  <p className="text-lg font-bold tabular-nums text-foreground">{taskCounts[s.value] ?? 0}</p>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </GlassCard>

      {project.technologies.length > 0 && (
        <GlassCard>
          <CardHeader><CardTitle className="flex items-center gap-2"><Layers className="size-4" /> Technology Stack</CardTitle></CardHeader>
          <CardContent className="flex flex-wrap gap-1.5">
            {project.technologies.map((t) => (
              <span key={t} className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">{t}</span>
            ))}
          </CardContent>
        </GlassCard>
      )}

      {project.description && (
        <GlassCard>
          <CardHeader><CardTitle>Description</CardTitle></CardHeader>
          <CardContent className="text-sm whitespace-pre-wrap text-muted-foreground">{project.description}</CardContent>
        </GlassCard>
      )}

      <MilestonesManager
        projectId={id}
        milestones={milestones}
        tasks={topTasks.map((t) => ({ _id: t._id, title: t.title, taskCode: t.taskCode }))}
        canManage={canManage}
      />

      <ProjectTeamManager
        projectId={id}
        currency={project.currency}
        members={members.map((m) => ({
          _id: m._id,
          employeeId: m.employeeId,
          employeeName: m.employeeName,
          employeeCode: m.employeeCode,
          role: m.role,
          allocationPercent: m.allocationPercent,
          billableRate: m.billableRate,
          costRate: m.costRate,
          active: m.active,
        }))}
        employees={employees.map((e) => ({ _id: e._id, name: e.name, employeeCode: e.employeeCode }))}
        canManage={canManage}
        managerEmployeeId={project.projectManagerId}
      />

      {canManage && (aiCalls.length > 0 || projectCalls.length > 0) && (
        <>
          <AiCallSummaries entries={aiCalls} />
          <CallsList rows={projectCalls} />
        </>
      )}

      <GlassCard>
        <CardHeader><CardTitle>Activity</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {activity.length === 0 && <p className="text-sm text-muted-foreground">No activity recorded yet.</p>}
          {activity.map((a) => {
            const s = serializeActivityLog(a);
            return (
              <div key={s._id} className="flex items-start gap-3 rounded-lg border border-border/60 p-2.5 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="capitalize text-foreground">
                    {s.action.replace(/_/g, " ")}
                    {s.summary ? <span className="text-muted-foreground"> — {s.summary}</span> : null}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {s.actorEmail ?? "system"} · {formatDateTime(s.createdAt)}
                  </p>
                </div>
              </div>
            );
          })}
        </CardContent>
      </GlassCard>
    </div>
  );
}
