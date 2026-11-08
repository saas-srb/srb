import { lmsEvents } from "@/lib/notify/triggers/lms";
import "server-only";
import { getDb } from "@/lib/mongodb";
import { newId } from "@/lib/products/clientos/db";
import { notifyPortalUser } from "@/lib/products/clientos/notifications";
import { recordLeadEvent } from "@/lib/lead-management/timeline";
import { getLeadRecord, markLeadPortalReplyReceived, LEAD_RECORDS_COLLECTION } from "@/lib/lead-management/records";
import { emit } from "@/lib/products/huddle-ai/events";
import type { LeadMessage, LeadMessageAttachment, LeadMessageChannel, SerializedLeadMessage, LeadRecord, LeadType } from "@/lib/lead-management/types";
import type { CurrentPortalUser } from "@/lib/portal-auth";
import { getCompanyBrand } from "@/lib/platform/branding";

export const LEAD_MESSAGES_COLLECTION = "lead_messages";

let idx = false;

async function collection() {
  const db = await getDb();
  const c = db.collection<LeadMessage>(LEAD_MESSAGES_COLLECTION);
  if (!idx) {
    idx = true;
    await c.createIndex({ leadId: 1, createdAt: 1 }).catch(() => {});
  }
  return c;
}

export function serializeLeadMessage(m: LeadMessage): SerializedLeadMessage {
  // Messages written before this thread supported attachments/portal-authored replies
  // don't have these fields in the database — default them so old threads render safely
  // instead of crashing on `.map` over `undefined`, and so legacy staff messages still
  // attribute correctly (they were all staff-authored; portal replies didn't exist yet).
  return {
    ...m,
    authorType: m.authorType ?? "staff",
    authorPortalUserId: m.authorPortalUserId ?? null,
    attachments: m.attachments ?? [],
    createdAt: m.createdAt.toISOString(),
  };
}

/**
 * Post to a lead's Communication Center. `internal` visibility is a staff-only
 * note; `portal` visibility is a real two-way thread — staff-authored messages
 * notify the portal user, portal-authored replies flag the lead for staff via
 * `hasUnreadPortalReply`. Every write also emits a `chat_events` "message"
 * event (scope `lead:<leadId>`) so both sides' open threads update live.
 */
export async function postLeadMessage(input: {
  leadId: string;
  body: string;
  visibility: "internal" | "portal";
  channel?: LeadMessageChannel;
  authorType: "staff" | "portal";
  authorStaffId?: string | null;
  authorPortalUserId?: string | null;
  attachments?: LeadMessageAttachment[];
}): Promise<SerializedLeadMessage> {
  const body = input.body.trim();
  const channel: LeadMessageChannel = input.channel ?? (input.visibility === "internal" ? "note" : "message");
  const doc: LeadMessage = {
    _id: newId(),
    leadId: input.leadId,
    body,
    visibility: input.visibility,
    channel,
    authorType: input.authorType,
    authorStaffId: input.authorStaffId ?? null,
    authorPortalUserId: input.authorPortalUserId ?? null,
    attachments: input.attachments ?? [],
    createdAt: new Date(),
  };
  await (await collection()).insertOne(doc);

  const timelineActor = input.authorType === "portal" ? "applicant" : "staff";
  const timelineActorId = input.authorType === "portal" ? input.authorPortalUserId ?? null : input.authorStaffId ?? null;

  if (input.visibility === "portal") {
    const lead = await getLeadRecord(input.leadId);
    await recordLeadEvent(input.leadId, {
      kind: channel === "document_request" ? "document_requested" : "message_sent",
      title: channel === "document_request" ? "Document requested" : input.authorType === "portal" ? "Message from you" : `Message from ${(await getCompanyBrand()).name}`,
      detail: body.length > 140 ? `${body.slice(0, 140)}…` : body,
      actor: timelineActor,
      actorId: timelineActorId,
      visibleToLead: true,
    });
    // A portal-authored reply must never notify its own sender — only staff-authored messages page the portal user.
    if (lead && input.authorType === "staff") {
      await notifyPortalUser({
        recipientUserId: lead.externalUserId,
        type: channel === "document_request" ? "document_request" : "message",
        title: channel === "document_request" ? "A document was requested" : `New message from ${(await getCompanyBrand()).name}`,
        body: body.length > 160 ? `${body.slice(0, 160)}…` : body,
        link: "/clientos/messages",
      });
    }
    if (lead && input.authorType === "portal") {
      await markLeadPortalReplyReceived(input.leadId);
      await lmsEvents.portalReply({ id: lead._id, name: lead.name, type: lead.type, ownerStaffId: lead.ownerStaffId }, body);
    }
  } else {
    await recordLeadEvent(input.leadId, {
      kind: "note_added",
      title: "Internal note added",
      actor: "staff",
      actorId: input.authorStaffId ?? null,
      visibleToLead: false,
    });
  }

  const serialized = serializeLeadMessage(doc);
  await emit({ scope: { type: "lead", id: input.leadId }, kind: "message", payload: { message: serialized }, actorId: timelineActorId });
  return serialized;
}

/**
 * Portal-side reply. Unlike `postLeadMessage`, this never takes a `leadId` the
 * caller supplies data for — it's always the session's own active lead,
 * ownership-verified server-side, since the portal is the less-trusted caller.
 */
export async function postPortalLeadMessage(input: {
  leadId: string;
  body: string;
  attachments?: LeadMessageAttachment[];
  portalUser: CurrentPortalUser;
}): Promise<SerializedLeadMessage> {
  const lead = await getLeadRecord(input.leadId);
  if (!lead || lead.externalUserId !== input.portalUser.id) throw new Error("You don't have access to this lead.");
  return postLeadMessage({
    leadId: input.leadId,
    body: input.body,
    visibility: "portal",
    channel: "message",
    authorType: "portal",
    authorPortalUserId: input.portalUser.id,
    attachments: input.attachments,
  });
}

export async function listLeadMessages(
  leadId: string,
  opts: { visibility?: "internal" | "portal" | "all" } = {}
): Promise<SerializedLeadMessage[]> {
  const c = await collection();
  const filter: Record<string, unknown> = { leadId };
  if (opts.visibility && opts.visibility !== "all") filter.visibility = opts.visibility;
  const rows = await c.find(filter).sort({ createdAt: 1 }).toArray();
  return rows.map(serializeLeadMessage);
}

export interface LeadConversationSummary {
  leadId: string;
  code: string;
  name: string;
  email: string;
  type: LeadType;
  hasUnreadPortalReply: boolean;
  lastMessage: SerializedLeadMessage;
  messageCount: number;
}

/**
 * One row per lead with at least one portal-visible message, newest activity
 * first — the LMS-wide inbox at `/dealflow-ai/messages`. Deliberately scoped to
 * `visibility: "portal"` only: internal-only notes never start a conversation
 * a portal user can see, so a lead with only internal notes doesn't belong
 * in an inbox of things staff needs to reply to.
 */
export async function listLeadConversations(limit = 200): Promise<LeadConversationSummary[]> {
  const c = await collection();
  const grouped = await c
    .aggregate<{ _id: string; lastMessage: LeadMessage; count: number }>([
      { $match: { visibility: "portal" } },
      { $sort: { createdAt: -1 } },
      { $group: { _id: "$leadId", lastMessage: { $first: "$$ROOT" }, count: { $sum: 1 } } },
      { $sort: { "lastMessage.createdAt": -1 } },
      { $limit: Math.min(Math.max(limit, 1), 500) },
    ])
    .toArray();
  if (grouped.length === 0) return [];

  const db = await getDb();
  const leads = await db
    .collection<LeadRecord>(LEAD_RECORDS_COLLECTION)
    .find({ _id: { $in: grouped.map((g) => g._id) }, deletedAt: null })
    .toArray();
  const leadById = new Map(leads.map((l) => [l._id, l]));

  const summaries: LeadConversationSummary[] = [];
  for (const g of grouped) {
    const lead = leadById.get(g._id);
    if (!lead) continue; // lead deleted/missing — its messages stay in the DB but drop out of the inbox
    summaries.push({
      leadId: g._id,
      code: lead.code,
      name: lead.name,
      email: lead.email,
      type: lead.type,
      hasUnreadPortalReply: lead.hasUnreadPortalReply ?? false,
      lastMessage: serializeLeadMessage(g.lastMessage),
      messageCount: g.count,
    });
  }
  return summaries;
}
