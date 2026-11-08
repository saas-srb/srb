import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { getDb } from "@/lib/mongodb";
import { connectionValues } from "@/lib/platform/connections/resolve";
import { getSavedConnection } from "@/lib/platform/connections/store";
import { activeEmailProvider, sendEmail } from "@/lib/platform/email";
import { isPhoneNumber, sendWhatsApp } from "@/lib/platform/messaging";
import { getLeadRecord, listLeadRecords } from "@/lib/lead-management/records";
import { LEAD_SOURCE_META } from "@/lib/lead-management/types";
import { leadCallSpec, type DealflowCallSpec } from "@/lib/dealflow-ai/call-targets";

/**
 * DealFlow's one-to-one email and WhatsApp to a lead, sent through the company's OWN accounts (Settings -> Integrations);
 * SelfRun's sender is the fallback for email only. Every attempt, sent or failed, is stored so the thread shows what really happened.
 * Replies are not captured here: they arrive in the company's own mailbox / WhatsApp Business inbox.
 */
export type ChannelKind = "email" | "whatsapp";

export const CHANNEL_SETTINGS_HREF = "/commandos/settings/integrations";
export const CHANNEL_COLLECTION = "dealflow_channel_messages";

export interface ChannelStatus {
  connected: boolean;
  /** Human-readable account in use, shown in the header; empty when not connected. */
  via: string;
}

export async function channelStatus(channel: ChannelKind): Promise<ChannelStatus> {
  if (channel === "whatsapp") {
    const twilio = await connectionValues("twilio");
    if (twilio?.accountSid && twilio.authToken && twilio.whatsappFrom) return { connected: true, via: "Twilio WhatsApp" };
    const cloud = await connectionValues("whatsapp-cloud");
    if (cloud?.phoneNumberId && cloud.accessToken) return { connected: true, via: "WhatsApp Business (Meta Cloud API)" };
    return { connected: false, via: "" };
  }
  for (const [key, label] of [["smtp", "your SMTP account"], ["resend", "your Resend account"], ["sendgrid", "your SendGrid account"]] as const) {
    const saved = await getSavedConnection(key).catch(() => null);
    if (saved && Object.keys(saved).length) return { connected: true, via: label };
  }
  const platform = await activeEmailProvider().catch(() => null);
  return platform && platform.id !== "console" ? { connected: true, via: "SelfRun's email service" } : { connected: false, via: "" };
}

export interface ChannelMessage {
  id: string;
  channel: ChannelKind;
  leadId: string;
  to: string;
  subject: string;
  body: string;
  status: "sent" | "failed";
  error: string;
  sentByName: string;
  createdAt: string;
}

interface Row extends Omit<ChannelMessage, "createdAt" | "id"> {
  _id: string;
  createdAt: Date;
}

const col = async () => (await getDb()).collection<Row>(CHANNEL_COLLECTION);

const toView = (r: Row): ChannelMessage => ({
  id: r._id, channel: r.channel, leadId: r.leadId, to: r.to, subject: r.subject, body: r.body, status: r.status, error: r.error, sentByName: r.sentByName, createdAt: r.createdAt.toISOString(),
});

export async function listChannelMessages(channel: ChannelKind, leadId: string): Promise<ChannelMessage[]> {
  const c = await col();
  await c.createIndex({ channel: 1, leadId: 1, createdAt: 1 }).catch(() => {});
  return (await c.find({ channel, leadId }).sort({ createdAt: 1 }).limit(500).toArray()).map(toView);
}

/** The same message (lead + channel + text) is refused for this long after it was sent, so a double-click or a retry never reaches the lead twice. */
export const DUPLICATE_WINDOW_MS = 30_000;
/** Per company: attempts (sent or failed) allowed in any rolling hour. Keeps a stuck loop or a bulk-click from spamming leads or burning the provider quota. */
export const HOURLY_SEND_CAP = 200;
const LOCK_COLLECTION = "dealflow_channel_locks";

/** Claims the right to send this exact message now. False when an identical one is in flight or went out within the window. */
async function claimSend(key: string, now: number): Promise<boolean> {
  const locks = (await getDb()).collection<{ _id: string; expireAt: Date }>(LOCK_COLLECTION);
  await locks.createIndex({ expireAt: 1 }, { expireAfterSeconds: 60 }).catch(() => {});
  try {
    const r = await locks.updateOne({ _id: key, expireAt: { $lte: new Date(now) } }, { $set: { expireAt: new Date(now + DUPLICATE_WINDOW_MS) } }, { upsert: true });
    return r.matchedCount + r.upsertedCount > 0;
  } catch (e) {
    if ((e as { code?: number }).code === 11000) return false; // a live lock exists
    throw e;
  }
}

const releaseSend = async (key: string) => { await (await getDb()).collection<{ _id: string }>(LOCK_COLLECTION).deleteOne({ _id: key }).catch(() => {}); };

export type SendResult = { ok: true; message: ChannelMessage } | { ok: false; status: number; error: string; message?: ChannelMessage };

export async function sendToLead(input: { channel: ChannelKind; leadId: string; subject?: string; body: string; sentByName: string }, deps: { send?: (to: string, subject: string, body: string) => Promise<{ ok: true } | { ok: false; error: string }> } = {}): Promise<SendResult> {
  const body = input.body.trim().slice(0, input.channel === "whatsapp" ? 1500 : 20000);
  const subject = (input.subject ?? "").trim().slice(0, 300);
  if (!body) return { ok: false, status: 400, error: "Write a message first." };
  if (input.channel === "email" && !subject) return { ok: false, status: 400, error: "Add a subject." };
  const lead = await getLeadRecord(input.leadId);
  if (!lead || lead.deletedAt) return { ok: false, status: 404, error: "Lead not found." };
  const to = input.channel === "email" ? lead.email : lead.phone;
  if (!to || (input.channel === "whatsapp" && !isPhoneNumber(to))) {
    return { ok: false, status: 422, error: input.channel === "email" ? "This lead has no email address." : "This lead has no valid phone number." };
  }
  if ((lead as { doNotContact?: boolean }).doNotContact) return { ok: false, status: 403, error: "This lead has asked not to be contacted." };
  const status = await channelStatus(input.channel);
  if (!status.connected && !deps.send) return { ok: false, status: 503, error: input.channel === "email" ? "Email isn't connected for this workspace." : "WhatsApp isn't connected for this workspace." };

  const sender = deps.send ?? (async (t: string, s: string, b: string) => {
    if (input.channel === "whatsapp") return sendWhatsApp(t, b);
    const text = b.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>");
    return sendEmail({ to: t, subject: s, html: `<div style="font-family:sans-serif;font-size:14px;line-height:1.5">${text}</div>`, text: b });
  });
  const now = Date.now();
  const c = await col();
  if ((await c.countDocuments({ createdAt: { $gte: new Date(now - 3_600_000) } })) >= HOURLY_SEND_CAP) {
    return { ok: false, status: 429, error: "Your workspace has reached its hourly sending limit. Try again later." };
  }
  const lockKey = createHash("sha256").update(`${lead._id}\n${input.channel}\n${subject}\n${body}`).digest("hex");
  if (!(await claimSend(lockKey, now))) return { ok: false, status: 409, error: "This exact message was just sent to this lead." };
  let result: { ok: true } | { ok: false; error: string };
  try {
    result = await sender(to, subject, body);
  } catch (err) {
    console.error("[dealflow channels] sender threw:", err instanceof Error ? err.message : err);
    result = { ok: false, error: "The message couldn't be sent. Check the connected account and try again." };
  }
  if (!result.ok) await releaseSend(lockKey); // a failed send may be retried straight away
  const row: Row = { _id: randomUUID(), channel: input.channel, leadId: lead._id, to, subject, body, status: result.ok ? "sent" : "failed", error: result.ok ? "" : result.error, sentByName: input.sentByName, createdAt: new Date() };
  await c.insertOne(row);
  return result.ok ? { ok: true, message: toView(row) } : { ok: false, status: 502, error: result.error, message: toView(row) };
}

/** One selectable lead in the Live Chat / Email / WhatsApp inboxes (client-safe shape). */
export interface ChannelLead {
  id: string;
  code: string;
  name: string;
  email: string;
  phone: string;
  /** Portal role of the lead: job_applicant | intern | trainee | client. */
  type: string;
  sourceLabel: string;
  stage: string;
  hasUnreadPortalReply: boolean;
  /** What the "Call with AI" button needs for this lead: target, number, whitelisted context, or why calling is unavailable. */
  callSpec: DealflowCallSpec;
}

export async function listChannelLeads(): Promise<ChannelLead[]> {
  const rows = await listLeadRecords({ limit: 500 });
  return rows.map((l) => ({
    id: l._id,
    code: l.code,
    name: l.name,
    email: l.email,
    phone: l.phone,
    type: l.type,
    sourceLabel: LEAD_SOURCE_META[l.source]?.label ?? l.source,
    stage: l.stage,
    hasUnreadPortalReply: l.hasUnreadPortalReply ?? false,
    callSpec: leadCallSpec(l),
  }));
}
