import "server-only";
import { getDb } from "@/lib/mongodb";
import { canManageProjects, hasPmsAccess } from "@/lib/pms-roles";
import type { AibotsViewer } from "@/lib/products/agentos/viewer";
import type { CallTarget } from "@/lib/products/agentos/calls/types";
import type { BriefingItem, BriefingSection } from "@/lib/products/agentos/calls/briefing-core";
import { orderedCalls, pastCallItem } from "@/lib/products/call-briefing-shared";
import type { AiCallEntry } from "@/lib/products/call-writeback";
import { ACTIVITY_LOGS_COLLECTION, type ActivityLog } from "@/lib/products/sprintos/activity";
import { CLIENTS_COLLECTION, type Client } from "@/lib/products/sprintos/clients";
import { listMilestones } from "@/lib/products/sprintos/milestones";
import { PROJECTS_COLLECTION, type Project } from "@/lib/products/sprintos/projects";
import { notDeleted } from "@/lib/products/sprintos/db";

/**
 * SprintOS' call-briefing provider for a project or a client: where the project stands (status, dates, progress, milestones), the client's contact
 * and the team's notes on the client, and every earlier AI call about the project or client. Same rule as placing the call: people who manage
 * projects. Never included: budget, hours, costs, billing details and the client's email / phone (SprintOS tells the agent no money figures).
 */
const SPRINTOS_PRODUCT = "sprintos";
const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const row = (label: string, v: unknown): BriefingItem[] => (str(v) ? [{ text: `${label}: ${str(v)}` }] : []);

async function callsFor(filter: Record<string, unknown>) {
  const logs = await (await getDb()).collection<ActivityLog>(ACTIVITY_LOGS_COLLECTION).find({ ...filter, "metadata.aiCall": { $exists: true } } as never).sort({ createdAt: -1 }).limit(50).toArray();
  return orderedCalls(logs.map((l) => (l.metadata as { aiCall: AiCallEntry }).aiCall).map((e) => ({ callId: e.callId, at: e.at, purpose: e.purpose, status: e.status, outcome: e.outcome, summary: e.summary, fields: (e.fields ?? []).map((f) => ({ label: f.label, value: f.value })) })));
}

function clientSections(c: Client): BriefingSection[] {
  const contact = c.primaryContact;
  return [
    { key: "client", title: "Client", kind: "profile", sourceCount: 1, items: [...row("Company", c.companyName), ...row("Industry", c.industry), ...row("Status", c.status), ...row("Primary contact", [contact?.name, contact?.designation].filter(Boolean).join(", "))] },
    { key: "client_notes", title: "Team notes on the client", kind: "notes", items: str(c.notes) ? [{ who: "Team", text: str(c.notes) }] : [], sourceCount: str(c.notes) ? 1 : 0, internal: true },
  ];
}

export async function sprintosBriefing(viewer: AibotsViewer, target: CallTarget): Promise<BriefingSection[]> {
  if (target.product !== SPRINTOS_PRODUCT || (target.entityType !== "project" && target.entityType !== "client")) return [];
  if (!hasPmsAccess(viewer.roles) || !canManageProjects(viewer.ctx)) return [];
  const db = await getDb();
  if (target.entityType === "project") {
    const p = await db.collection<Project>(PROJECTS_COLLECTION).findOne({ _id: target.entityId, ...notDeleted });
    if (!p) return [];
    const client = await db.collection<Client>(CLIENTS_COLLECTION).findOne({ _id: p.clientId as never, ...notDeleted } as never);
    const milestones = await listMilestones(p._id);
    const calls = await callsFor({ projectId: p._id });
    return [
      {
        key: "project", title: "Project", kind: "profile", sourceCount: 1,
        items: [...row("Name", p.name), ...row("Code", p.projectCode), ...row("Status", p.status.replace(/_/g, " ")), ...row("Priority", p.priority), ...row("Category", p.category), ...row("Starts", p.startDate), ...row("Planned end", p.endDate), ...row("Progress", `${p.progressPercent}%`), ...row("Description", p.description), ...row("Technologies", p.technologies?.join(", "))],
      },
      {
        key: "milestones", title: "Milestones", kind: "other", sourceCount: milestones.length,
        items: milestones.map((m) => ({ at: null, text: `${m.name} - ${m.status.replace(/_/g, " ")}, ${m.progressPercent}% done${m.dueDate ? `, due ${m.dueDate}` : ""}${m.overdue ? " (overdue)" : ""}${m.description ? `. ${m.description}` : ""}` })),
      },
      ...(client ? clientSections(client) : []),
      { key: "previous_calls", title: "Previous project-update calls", kind: "calls", items: calls.map(pastCallItem), sourceCount: calls.length },
    ];
  }
  const c = await db.collection<Client>(CLIENTS_COLLECTION).findOne({ _id: target.entityId as never, ...notDeleted } as never);
  if (!c) return [];
  const projects = await db.collection<Project>(PROJECTS_COLLECTION).find({ clientId: c._id, ...notDeleted }).sort({ createdAt: 1 }).limit(50).toArray();
  const projectIds = projects.map((x) => x._id);
  const calls = await callsFor({ $or: [{ entity: "client", entityId: c._id }, ...(projectIds.length ? [{ projectId: { $in: projectIds } }] : [])] });
  return [
    ...clientSections(c),
    { key: "projects", title: "Projects for this client", kind: "other", sourceCount: projects.length, items: projects.map((x) => ({ at: null, text: `${x.name} - ${x.status.replace(/_/g, " ")}, ${x.progressPercent}% done${x.endDate ? `, planned end ${x.endDate}` : ""}` })) },
    { key: "previous_calls", title: "Previous calls", kind: "calls", items: calls.map(pastCallItem), sourceCount: calls.length },
  ];
}
