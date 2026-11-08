import "server-only";
import { getClient, type Client } from "@/lib/products/sprintos/clients";
import { listProjectsForClient, serializeProject, type SerializedProject } from "@/lib/products/sprintos/projects";
import { listMilestones, type MilestoneWithProgress } from "@/lib/products/sprintos/milestones";
import { listCurrentDocuments, serializeDocument, type SerializedDocument } from "@/lib/products/sprintos/documents";

/**
 * Client portal data — read live from `pms_clients` + `pms_projects` +
 * milestones + project documents. Invoices and meetings are *derived* (the ERP
 * has no client-facing invoicing): "invoiced" tracks milestone completion
 * against an even split of the project budget.
 *
 * Internal figures (costs, margins, task detail, PM identity, hourly rates) are
 * never included.
 */

export interface ClientProjectView {
  project: SerializedProject;
  milestones: MilestoneWithProgress[];
  documents: SerializedDocument[];
  pendingDeliverables: MilestoneWithProgress[];
}

export interface InvoiceSummary {
  currency: string;
  contractValue: number;
  billed: number;
  inProgress: number;
  notStarted: number;
  outstanding: number;
  lines: { projectName: string; projectCode: string; milestone: string; status: string; amount: number; billed: boolean }[];
}

export interface UpcomingMeeting {
  projectName: string;
  title: string;
  date: string; // yyyy-mm-dd
  kind: "milestone" | "review" | "delivery";
}

export interface ClientOverview {
  client: Pick<Client, "_id" | "companyName" | "clientCode" | "industry"> & { contactName: string | null };
  projects: ClientProjectView[];
  overallProgress: number;
  invoiceSummary: InvoiceSummary;
  upcomingMeetings: UpcomingMeeting[];
  sharedDocuments: (SerializedDocument & { projectName: string })[];
}

export async function getClientOverview(clientId: string | null): Promise<ClientOverview | null> {
  if (!clientId) return null;
  const client = await getClient(clientId);
  if (!client) return null;

  const projects = await listProjectsForClient(clientId);
  const perProject = await Promise.all(
    projects.map(async (p) => {
      const [milestones, documents] = await Promise.all([
        listMilestones(p._id).catch(() => [] as MilestoneWithProgress[]),
        listCurrentDocuments(p._id).catch(() => []),
      ]);
      const serialized = serializeProject(p);
      const docs = documents.map(serializeDocument);
      return {
        project: serialized,
        milestones,
        documents: docs,
        pendingDeliverables: milestones.filter((m) => m.status !== "completed"),
      } satisfies ClientProjectView;
    })
  );

  const overallProgress =
    perProject.length > 0
      ? Math.round(perProject.reduce((s, x) => s + (x.project.progressPercent ?? 0), 0) / perProject.length)
      : 0;

  // --- derived invoice summary -----------------------------------------
  const currency = projects[0]?.currency ?? "INR";
  const lines: InvoiceSummary["lines"] = [];
  let contractValue = 0;
  let billed = 0;
  let inProgress = 0;
  let notStarted = 0;
  for (const { project, milestones } of perProject) {
    const budget = project.estimatedBudget ?? 0;
    contractValue += budget;
    const share = milestones.length > 0 ? budget / milestones.length : 0;
    for (const m of milestones) {
      const isBilled = m.status === "completed";
      const isProg = m.status === "in_progress";
      if (isBilled) billed += share;
      else if (isProg) inProgress += share;
      else notStarted += share;
      lines.push({
        projectName: project.name,
        projectCode: project.projectCode,
        milestone: m.name,
        status: m.status,
        amount: Math.round(share),
        billed: isBilled,
      });
    }
  }

  // --- derived upcoming meetings / reviews ----------------------------
  const today = new Date().toISOString().slice(0, 10);
  const horizon = new Date(Date.now() + 60 * 86400000).toISOString().slice(0, 10);
  const upcomingMeetings: UpcomingMeeting[] = [];
  for (const { project, milestones } of perProject) {
    for (const m of milestones) {
      if (m.dueDate && m.dueDate >= today && m.dueDate <= horizon && m.status !== "completed") {
        upcomingMeetings.push({
          projectName: project.name,
          title: `${m.name} review`,
          date: m.dueDate,
          kind: "milestone",
        });
      }
    }
    if (project.endDate && project.endDate >= today && project.endDate <= horizon) {
      upcomingMeetings.push({ projectName: project.name, title: "Project delivery", date: project.endDate, kind: "delivery" });
    }
  }
  upcomingMeetings.sort((a, b) => a.date.localeCompare(b.date));

  const sharedDocuments = perProject.flatMap(({ project, documents }) =>
    documents.map((d) => ({ ...d, projectName: project.name }))
  );

  return {
    client: {
      _id: client._id,
      companyName: client.companyName,
      clientCode: client.clientCode,
      industry: client.industry,
      contactName: client.primaryContact?.name ?? null,
    },
    projects: perProject,
    overallProgress,
    invoiceSummary: {
      currency,
      contractValue: Math.round(contractValue),
      billed: Math.round(billed),
      inProgress: Math.round(inProgress),
      notStarted: Math.round(notStarted),
      outstanding: Math.round(inProgress + notStarted),
      lines,
    },
    upcomingMeetings,
    sharedDocuments,
  };
}
