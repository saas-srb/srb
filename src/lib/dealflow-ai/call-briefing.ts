import "server-only";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { lmsCan } from "@/lib/lms-roles";
import type { AibotsViewer } from "@/lib/products/agentos/viewer";
import type { CallTarget } from "@/lib/products/agentos/calls/types";
import type { BriefingItem, BriefingSection } from "@/lib/products/agentos/calls/briefing-core";
import { labelCollected } from "@/lib/products/agentos/calls/call-ui";
import { DEALFLOW_PRODUCT, parseSubmissionEntityId } from "@/lib/dealflow-ai/call-targets";
import { CALL_RESULTS_COLLECTION, type CallResultDoc } from "@/lib/dealflow-ai/call-results";
import { CHANNEL_COLLECTION } from "@/lib/dealflow-ai/channels";
import { LEAD_MESSAGES_COLLECTION } from "@/lib/lead-management/messages";
import { LEAD_RECORDS_COLLECTION } from "@/lib/lead-management/records";
import { LEAD_TIMELINE_COLLECTION } from "@/lib/lead-management/timeline";
import { stageMeta } from "@/lib/lead-management/workflows";
import { LEAD_SOURCE_META, type LeadMessage, type LeadRecord, type LeadTimelineEvent } from "@/lib/lead-management/types";
import { getLead, isValidCategory } from "@/lib/leads";
import { getCategoryLabel } from "@/lib/categories";
import { getStatusMeta } from "@/lib/lead-status";
import { APPLICATIONS_COLLECTION } from "@/lib/career-applications";
import { INTERVIEWS_COLLECTION } from "@/lib/products/clientos/interviews";
import { orderedCalls, pastCallItem, type PastCall } from "@/lib/products/call-briefing-shared";
import type { AiCallEntry } from "@/lib/products/call-writeback";

/**
 * DealFlow's call-briefing provider: everything the team knows about a lead, a website enquiry or a job applicant, limited to what THIS caller's role
 * may read on the same pages (leads and enquiries: VIEW_LEADS; applicants: VIEW_CAREERS; a deal value: EDIT_LEADS, the permission that changes it).
 * Never included: the person's email and phone (the agent already has the number it dials), portal-account details, documents, offers and
 * compensation, internal links. Everything comes from records of THIS person only.
 */

/** The newest records of each kind that are read (the section says when more exist). */
export const READ_CAP = 1500;

const iso = (d: unknown): string | null => (d instanceof Date && !Number.isNaN(d.getTime()) ? d.toISOString() : typeof d === "string" && !Number.isNaN(new Date(d).getTime()) ? new Date(d).toISOString() : null);
const str = (v: unknown): string => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "");
const profileItem = (label: string, value: unknown): BriefingItem | null => {
  const v = str(value).trim();
  return v ? { text: `${label}: ${v}` } : null;
};
const items = (xs: (BriefingItem | null)[]): BriefingItem[] => xs.filter((x): x is BriefingItem => Boolean(x));

const PORTAL_CHANNEL: Record<string, string> = { message: "Portal chat", document_request: "Portal chat (document request)", status_update: "Portal (status update)", interview_reminder: "Portal (interview reminder)" };
/** Timeline entries the messages and the calls sections already cover are not repeated. */
const TIMELINE_SKIP = new Set(["ai_call", "message_sent", "document_requested", "note_added"]);

// ---------------------------------------------------------------------------
// Reading (newest first with a cap, then put in time order)
// ---------------------------------------------------------------------------

async function capped<T extends object>(collection: string, filter: Record<string, unknown>): Promise<{ rows: T[]; total: number }> {
  const col = (await getDb()).collection<T>(collection);
  const [rows, total] = await Promise.all([col.find(filter as never).sort({ createdAt: -1 }).limit(READ_CAP).toArray(), col.countDocuments(filter as never)]);
  return { rows: (rows as T[]).reverse(), total };
}

interface Thread {
  conversation: BriefingItem[];
  conversationTotal: number;
  notes: BriefingItem[];
  notesTotal: number;
  timeline: BriefingItem[];
  timelineTotal: number;
}

const attachmentNote = (m: LeadMessage) => (m.attachments?.length ? ` [attached: ${m.attachments.map((a) => a.filename).join(", ")}]` : "");

/** The conversation with one lead across the portal chat, email and WhatsApp, plus the team's notes and the journey, from the lead's own records. */
async function threadOf(leadIds: string[], canNotes: boolean): Promise<Thread> {
  const out: Thread = { conversation: [], conversationTotal: 0, notes: [], notesTotal: 0, timeline: [], timelineTotal: 0 };
  for (const leadId of leadIds) {
    const portal = await capped<LeadMessage>(LEAD_MESSAGES_COLLECTION, { leadId, visibility: "portal" });
    out.conversationTotal += portal.total;
    for (const m of portal.rows)
      out.conversation.push({ at: iso(m.createdAt), who: (m.authorType ?? "staff") === "portal" ? "Lead" : "Team", channel: PORTAL_CHANNEL[m.channel] ?? "Portal chat", text: `${m.body ?? ""}${attachmentNote(m)}` });

    // Only messages that were really delivered: a failed send never reached the person.
    const sent = await capped<{ channel: string; subject: string; body: string; sentByName: string; createdAt: Date }>(CHANNEL_COLLECTION, { leadId, status: "sent" });
    out.conversationTotal += sent.total;
    for (const m of sent.rows)
      out.conversation.push({ at: iso(m.createdAt), who: m.sentByName ? `Team (${m.sentByName})` : "Team", channel: m.channel === "whatsapp" ? "WhatsApp" : "Email", text: m.channel === "email" && m.subject ? `Subject "${m.subject}". ${m.body}` : m.body });

    if (canNotes) {
      const internal = await capped<LeadMessage>(LEAD_MESSAGES_COLLECTION, { leadId, visibility: "internal" });
      out.notesTotal += internal.total;
      for (const m of internal.rows) out.notes.push({ at: iso(m.createdAt), who: "Team", text: `${m.body ?? ""}${attachmentNote(m)}` });
    }
    const tl = await capped<LeadTimelineEvent>(LEAD_TIMELINE_COLLECTION, { leadId, kind: { $nin: [...TIMELINE_SKIP] } });
    out.timelineTotal += tl.total;
    for (const e of tl.rows) out.timeline.push({ at: iso(e.createdAt), who: e.actor === "applicant" ? "Lead" : e.actor === "staff" ? "Team" : "System", text: [e.title, e.detail].filter(Boolean).join(": ") });
  }
  const byTime = (a: BriefingItem, b: BriefingItem) => (a.at ?? "").localeCompare(b.at ?? "");
  out.conversation.sort(byTime);
  out.notes.sort(byTime);
  out.timeline.sort(byTime);
  return out;
}

async function callsOf(refs: { entityType: string; entityId: string }[], extra: AiCallEntry[] = []): Promise<PastCall[]> {
  const col = (await getDb()).collection<CallResultDoc>(CALL_RESULTS_COLLECTION);
  const rows = refs.length ? await col.find({ $or: refs.map((r) => ({ entityType: r.entityType, entityId: r.entityId })) }).sort({ createdAt: -1 }).limit(50).toArray() : [];
  const fromResults: PastCall[] = rows
    .filter((r) => r.status !== "cancelled")
    .map((r) => ({ callId: r._id, at: iso(r.endedAt ?? r.createdAt), purpose: r.purpose, status: r.status, outcome: r.outcome, summary: r.summary, fields: labelCollected(r.collected ?? [], null).map((c) => ({ label: c.label, value: c.value })) }));
  const fromEntries: PastCall[] = extra.map((e) => ({ callId: e.callId, at: e.at, purpose: e.purpose, status: e.status, outcome: e.outcome, summary: e.summary, fields: e.fields.map((f) => ({ label: f.label, value: f.value })) }));
  return orderedCalls([...fromResults, ...fromEntries]);
}

const conversationSection = (t: Thread): BriefingSection => ({
  key: "conversation", title: "Conversation history (portal chat, email, WhatsApp)", kind: "messages", items: t.conversation, sourceCount: t.conversationTotal, truncated: t.conversationTotal > t.conversation.length,
});
const notesSection = (items: BriefingItem[], total: number): BriefingSection => ({ key: "team_notes", title: "Team notes", kind: "notes", items, sourceCount: total, truncated: total > items.length, internal: true });
const timelineSection = (t: Thread): BriefingSection => ({ key: "journey", title: "Journey so far (stage changes, interviews, documents)", kind: "other", items: t.timeline, sourceCount: t.timelineTotal, truncated: t.timelineTotal > t.timeline.length });
const callsSection = (calls: PastCall[]): BriefingSection => ({ key: "previous_calls", title: "Previous AI calls", kind: "calls", items: calls.map(pastCallItem), sourceCount: calls.length });

// ---------------------------------------------------------------------------
// Targets
// ---------------------------------------------------------------------------

async function leadSections(viewer: AibotsViewer, leadId: string): Promise<BriefingSection[]> {
  const db = await getDb();
  const lead = await db.collection<LeadRecord>(LEAD_RECORDS_COLLECTION).findOne({ _id: leadId as never, deletedAt: null });
  if (!lead) return [];
  const sources = await linkedSource(lead, viewer);
  const stage = stageMeta(lead.type, lead.stage)?.label ?? lead.stage;
  const canMoney = lmsCan(viewer.ctx, "EDIT_LEADS");
  const profile: BriefingSection = {
    key: "profile", title: "Lead profile", kind: "profile", sourceCount: 1,
    items: items([
      profileItem("Name", lead.name),
      profileItem("Type", lead.type.replace(/_/g, " ")),
      profileItem("Service interest or position", lead.subService),
      profileItem("Came in through", LEAD_SOURCE_META[lead.source]?.label ?? lead.source),
      profileItem("Pipeline stage", stage),
      profileItem("Status", lead.status),
      profileItem("Campaign", sources.campaign),
      profileItem("Deal value (INR)", canMoney ? sources.dealValue : ""),
      profileItem("Enquired on", iso(lead.createdAt)?.slice(0, 10)),
    ]),
  };
  const submissionText = [lead.message, sources.message && sources.message !== lead.message ? sources.message : ""].filter(Boolean) as string[];
  const submission: BriefingSection = { key: "submission", title: "What they wrote when they enquired", kind: "submission", sourceCount: submissionText.length, items: submissionText.map((text) => ({ at: iso(lead.createdAt), who: "Lead", channel: "Enquiry form", text })) };
  const thread = await threadOf([lead._id], true);
  const noteItems = [...(sources.notes ? [{ at: null, who: "Team", text: sources.notes } as BriefingItem] : []), ...thread.notes];
  const calls = await callsOf(
    [{ entityType: "lead", entityId: lead._id }, ...(lead.applicationId ? [{ entityType: "applicant", entityId: lead.applicationId }] : []), ...(lead.sourceRef?.kind === "category_lead" && lead.sourceRef.category ? [{ entityType: "submission", entityId: `${lead.sourceRef.category}:${lead.sourceRef.id}` }] : [])],
    sources.aiCalls
  );
  return [profile, submission, conversationSection(thread), callsSection(calls), notesSection(noteItems, thread.notesTotal + (sources.notes ? 1 : 0)), timelineSection(thread)];
}

/** The website form or career application a lead record came from (its campaign, the original text, the team's notes on it). */
async function linkedSource(lead: LeadRecord, viewer: AibotsViewer): Promise<{ campaign: string; dealValue: string; message: string; notes: string; aiCalls: AiCallEntry[] }> {
  const none = { campaign: "", dealValue: "", message: "", notes: "", aiCalls: [] as AiCallEntry[] };
  const ref = lead.sourceRef;
  try {
    if (ref?.kind === "category_lead" && ref.category && isValidCategory(ref.category)) {
      const l = await getLead(ref.category, ref.id);
      return l ? { ...none, campaign: str(l.campaign), dealValue: typeof l.dealValue === "number" ? String(l.dealValue) : "", message: str(l.message), notes: str(l.notes) } : none;
    }
    const appId = lead.applicationId ?? (ref?.kind === "career_application" ? ref.id : null);
    // The application's own text and notes belong to the careers pages: they need the careers permission.
    if (appId && /^[a-f\d]{24}$/i.test(appId) && lmsCan(viewer.ctx, "VIEW_CAREERS")) {
      const a = await (await getDb()).collection(APPLICATIONS_COLLECTION).findOne({ _id: new ObjectId(appId) } as never);
      return a ? { ...none, message: str(a.coverNote), notes: str(a.notes), aiCalls: Array.isArray(a.aiCalls) ? (a.aiCalls as AiCallEntry[]) : [] } : none;
    }
  } catch {
    /* the source record is optional detail */
  }
  return none;
}

async function applicantSections(appId: string): Promise<BriefingSection[]> {
  if (!/^[a-f\d]{24}$/i.test(appId)) return [];
  const db = await getDb();
  const app = await db.collection(APPLICATIONS_COLLECTION).findOne({ _id: new ObjectId(appId) } as never);
  if (!app) return [];
  const leads = await db.collection<LeadRecord>(LEAD_RECORDS_COLLECTION).find({ applicationId: appId, deletedAt: null }, { projection: { _id: 1, stage: 1, type: 1 } }).limit(5).toArray();
  const stage = leads[0] ? stageMeta(leads[0].type, leads[0].stage)?.label ?? leads[0].stage : "";
  const interviews = await db.collection(INTERVIEWS_COLLECTION).find({ applicationId: appId }).sort({ scheduledAt: 1 }).limit(20).toArray();
  const profile: BriefingSection = {
    key: "profile", title: "Applicant profile", kind: "profile", sourceCount: 1,
    items: items([
      profileItem("Name", app.name),
      profileItem("Position applied for", app.positionTitle),
      profileItem("Application status", str(app.status).replace(/_/g, " ")),
      profileItem("Hiring stage", stage),
      profileItem("Came in through", app.source),
      profileItem("Applied on", iso(app.createdAt)?.slice(0, 10)),
      ...interviews.map((i) => profileItem("Interview", [str(i.title), str(i.round), str(i.mode), iso(i.scheduledAt)?.slice(0, 16).replace("T", " ")].filter(Boolean).join(", "))),
    ]),
  };
  const cover = str(app.coverNote);
  const submission: BriefingSection = { key: "submission", title: "What they wrote in their application", kind: "submission", sourceCount: cover ? 1 : 0, items: cover ? [{ at: iso(app.createdAt), who: "Applicant", channel: "Application form", text: cover }] : [] };
  const thread = await threadOf(leads.map((l) => l._id), true);
  const noteItems = [...(str(app.notes) ? [{ at: null, who: "Team", text: str(app.notes) } as BriefingItem] : []), ...thread.notes];
  const calls = await callsOf([{ entityType: "applicant", entityId: appId }, ...leads.map((l) => ({ entityType: "lead", entityId: l._id }))], Array.isArray(app.aiCalls) ? (app.aiCalls as AiCallEntry[]) : []);
  return [profile, submission, conversationSection(thread), callsSection(calls), notesSection(noteItems, thread.notesTotal + (str(app.notes) ? 1 : 0)), timelineSection(thread)];
}

async function submissionSections(viewer: AibotsViewer, entityId: string): Promise<BriefingSection[]> {
  const p = parseSubmissionEntityId(entityId);
  if (!p || !isValidCategory(p.category)) return [];
  const l = await getLead(p.category, p.id);
  if (!l) return [];
  const canMoney = lmsCan(viewer.ctx, "EDIT_LEADS");
  const linked = await (await getDb()).collection<LeadRecord>(LEAD_RECORDS_COLLECTION).find({ "sourceRef.kind": "category_lead", "sourceRef.id": p.id, deletedAt: null }, { projection: { _id: 1 } }).limit(5).toArray();
  const profile: BriefingSection = {
    key: "profile", title: "Enquiry profile", kind: "profile", sourceCount: 1,
    items: items([
      profileItem("Name", l.name),
      profileItem("Enquiry type", getCategoryLabel(p.category)),
      profileItem("Service interest", l.subService),
      profileItem("Came in through", l.source),
      profileItem("Status", getStatusMeta(l.status ?? "new")?.label ?? l.status),
      profileItem("Campaign", l.campaign),
      profileItem("Deal value (INR)", canMoney && typeof l.dealValue === "number" ? String(l.dealValue) : ""),
      profileItem("Enquired on", iso(l.createdAt)?.slice(0, 10)),
    ]),
  };
  const msg = str(l.message);
  const submission: BriefingSection = { key: "submission", title: "What they wrote when they enquired", kind: "submission", sourceCount: msg ? 1 : 0, items: msg ? [{ at: iso(l.createdAt), who: "Lead", channel: "Enquiry form", text: msg }] : [] };
  const thread = await threadOf(linked.map((x) => x._id), true);
  const noteItems = [...(str(l.notes) ? [{ at: null, who: "Team", text: str(l.notes) } as BriefingItem] : []), ...thread.notes];
  const calls = await callsOf([{ entityType: "submission", entityId }, ...linked.map((x) => ({ entityType: "lead", entityId: x._id }))]);
  return [profile, submission, conversationSection(thread), callsSection(calls), notesSection(noteItems, thread.notesTotal + (str(l.notes) ? 1 : 0)), timelineSection(thread)];
}

export async function dealflowBriefing(viewer: AibotsViewer, target: CallTarget): Promise<BriefingSection[]> {
  if (target.product !== DEALFLOW_PRODUCT) return [];
  if (target.entityType === "lead") return lmsCan(viewer.ctx, "VIEW_LEADS") ? leadSections(viewer, target.entityId) : [];
  if (target.entityType === "submission") return lmsCan(viewer.ctx, "VIEW_LEADS") ? submissionSections(viewer, target.entityId) : [];
  if (target.entityType === "applicant") return lmsCan(viewer.ctx, "VIEW_CAREERS") ? applicantSections(target.entityId) : [];
  return [];
}
