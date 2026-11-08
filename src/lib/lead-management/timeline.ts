import "server-only";
import { getDb } from "@/lib/mongodb";
import { newId } from "@/lib/products/clientos/db";
import type { LeadEventKind, LeadTimelineEvent, SerializedLeadTimelineEvent } from "@/lib/lead-management/types";

export const LEAD_TIMELINE_COLLECTION = "lead_timeline";

let idx = false;

async function collection() {
  const db = await getDb();
  const c = db.collection<LeadTimelineEvent>(LEAD_TIMELINE_COLLECTION);
  if (!idx) {
    idx = true;
    await c.createIndex({ leadId: 1, createdAt: 1 }).catch(() => {});
  }
  return c;
}

export function serializeLeadEvent(e: LeadTimelineEvent): SerializedLeadTimelineEvent {
  return { ...e, createdAt: e.createdAt.toISOString() };
}

export async function recordLeadEvent(
  leadId: string,
  input: {
    kind: LeadEventKind;
    title: string;
    detail?: string | null;
    actor?: "system" | "staff" | "applicant";
    actorId?: string | null;
    visibleToLead?: boolean;
  }
): Promise<void> {
  const c = await collection();
  await c.insertOne({
    _id: newId(),
    leadId,
    kind: input.kind,
    title: input.title,
    detail: input.detail ?? null,
    actor: input.actor ?? "system",
    actorId: input.actorId ?? null,
    visibleToLead: input.visibleToLead ?? false,
    createdAt: new Date(),
  });
}

export async function listLeadTimeline(leadId: string, opts: { visibleOnly?: boolean } = {}): Promise<SerializedLeadTimelineEvent[]> {
  const c = await collection();
  const filter: Record<string, unknown> = { leadId };
  if (opts.visibleOnly) filter.visibleToLead = true;
  const rows = await c.find(filter).sort({ createdAt: 1 }).toArray();
  return rows.map(serializeLeadEvent);
}
