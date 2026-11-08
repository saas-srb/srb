import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import ProjectClientAnalytics, { type AnalyticsProjectRow } from "@/components/products/sprintos/ProjectClientAnalytics";
import { getCurrentPmsUser } from "@/lib/pms-auth";
import { getDb } from "@/lib/mongodb";
import { listClientOptions } from "@/lib/products/sprintos/clients";

export default async function PmsAnalyticsPage() {
  await getCurrentPmsUser();

  const db = await getDb();
  const [projectsDocs, clients, timesheets, milestones, members] = await Promise.all([
    db.collection("pms_projects").find({ deletedAt: null }).sort({ createdAt: -1 }).toArray(),
    listClientOptions(),
    db.collection("pms_timesheets").find({ deletedAt: null }).toArray(),
    db.collection("pms_milestones").find({ deletedAt: null }).toArray(),
    db.collection("pms_project_members").find({ deletedAt: null, active: true }).toArray(),
  ]);

  const clientMap = new Map(clients.map((c: { _id: string; companyName: string }) => [c._id, c.companyName]));

  // Aggregate timesheet hours per project
  const projectHoursMap = new Map<string, { total: number; billable: number; nonBillable: number }>();
  timesheets.forEach((ts: any) => {
    const pid = String(ts.projectId);
    const hrs = Number(ts.hours) || 0;
    const isBillable = ts.isBillable !== false;
    const curr = projectHoursMap.get(pid) || { total: 0, billable: 0, nonBillable: 0 };
    curr.total += hrs;
    if (isBillable) curr.billable += hrs;
    else curr.nonBillable += hrs;
    projectHoursMap.set(pid, curr);
  });

  // Aggregate milestone counts per project
  const milestoneTotalMap = new Map<string, number>();
  const milestoneDoneMap = new Map<string, number>();
  milestones.forEach((m: any) => {
    const pid = String(m.projectId);
    milestoneTotalMap.set(pid, (milestoneTotalMap.get(pid) || 0) + 1);
    if (m.status === "completed" || m.completed) {
      milestoneDoneMap.set(pid, (milestoneDoneMap.get(pid) || 0) + 1);
    }
  });

  // Aggregate unique team sizes per project
  const teamSizeMap = new Map<string, Set<string>>();
  members.forEach((mem: any) => {
    const pid = String(mem.projectId);
    if (!teamSizeMap.has(pid)) teamSizeMap.set(pid, new Set());
    teamSizeMap.get(pid)!.add(String(mem.employeeId));
  });

  const projects: AnalyticsProjectRow[] = projectsDocs.map((p: any) => {
    const pid = String(p._id);
    const h = projectHoursMap.get(pid) || { total: 0, billable: 0, nonBillable: 0 };
    return {
      _id: pid,
      projectCode: p.projectCode || pid,
      name: p.name || "Untitled Project",
      clientName: clientMap.get(p.clientId) || "Internal Client",
      clientId: p.clientId || "",
      estimatedHours: Number(p.estimatedHours) || 0,
      actualHours: h.total,
      billableHours: h.billable,
      nonBillableHours: h.nonBillable,
      estimatedBudget: Number(p.estimatedBudget) || 0,
      currency: p.currency || "INR",
      status: p.status || "active",
      category: p.category || p.billingModel || null,
      milestoneCount: milestoneTotalMap.get(pid) || 0,
      completedMilestones: milestoneDoneMap.get(pid) || 0,
      teamSize: teamSizeMap.get(pid)?.size || 0,
      priority: p.priority || "medium",
      progressPercent: Number(p.progressPercent) || 0,
    };
  });

  return (
    <div className="space-y-4">
      <PanelPageHeader breadcrumbs={[{ label: "SprintOS", href: "/sprintos" }, { label: "Project & Client Analytics" }]} title={<>Project &amp; Client Analytics</>} description={<>Hours, budget, milestones and team size across your projects and clients.</>} />
      <ProjectClientAnalytics
        projects={projects}
        clients={clients.map((c: { _id: string; companyName: string }) => ({ _id: c._id, companyName: c.companyName }))}
      />
    </div>
  );
}
