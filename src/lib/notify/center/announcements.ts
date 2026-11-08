import "server-only";
import { randomUUID } from "node:crypto";
import { getDb } from "@/lib/mongodb";
import { notifyUsers } from "@/lib/notify";
import { resolveAudience } from "@/lib/notify/center/send";
import { currentCompanyIdOrNull, forEachCompany } from "@/lib/platform/tenancy/context";
import {
  CHANNELS,
  LIMITS,
  MAX_ANNOUNCEMENTS,
  MAX_SCHEDULE_DAYS,
  type AnnouncementAudience,
  type AnnouncementStatus,
  type AnnouncementView,
  type ChannelKey,
} from "@/lib/notify/center/shared";

/**
 * Announcements: messages a Director writes and sends to everyone, to a role or to chosen people — now, or at a time they pick. They go
 * through the normal pipeline (`notifyUsers`), so the "Announcements" rule, each person's own settings, limits and the delivery log all apply.
 * Scheduled ones are sent by `dispatchDue` (the cron route, and whenever the workspace is opened), claiming each one atomically so two
 * servers never send it twice.
 */

const COLLECTION = "notification_announcements";

interface Doc {
  _id: string;
  title: string;
  body: string;
  link: string;
  channels: Record<ChannelKey, boolean>;
  audience: AnnouncementAudience;
  scheduledAt: Date | null;
  status: AnnouncementStatus;
  recipients: number;
  error: string;
  createdAt: Date;
  updatedAt: Date;
  sentAt: Date | null;
  createdBy: string;
}

let indexed = false;
async function col() {
  const c = (await getDb()).collection<Doc>(COLLECTION);
  if (!indexed) {
    indexed = true;
    await Promise.all([c.createIndex({ status: 1, scheduledAt: 1 }).catch(() => {}), c.createIndex({ createdAt: -1 }).catch(() => {})]);
  }
  return c;
}

const view = (d: Doc): AnnouncementView => ({
  id: d._id, title: d.title, body: d.body, link: d.link, channels: d.channels, audience: d.audience,
  scheduledAt: d.scheduledAt?.toISOString() ?? null, status: d.status, recipients: d.recipients, error: d.error,
  createdAt: d.createdAt.toISOString(), sentAt: d.sentAt?.toISOString() ?? null, createdBy: d.createdBy,
});

const clean = (v: unknown, max: number) => String(v ?? "").replace(/\r\n/g, "\n").trim().slice(0, max);
const safeLink = (l: unknown) => {
  const v = clean(l, 300);
  return v.startsWith("/") && !v.startsWith("//") && !v.includes("\\") ? v : "";
};

export interface AnnouncementInput {
  title: string;
  body?: string;
  link?: string;
  channels: Partial<Record<ChannelKey, boolean>>;
  audience: AnnouncementAudience;
  /** draft = keep for later; now = send straight away; schedule = send at `scheduledAt`. */
  when: "draft" | "now" | "schedule";
  scheduledAt?: string | null;
}

export type AnnouncementResult = { ok: true; announcement: AnnouncementView } | { ok: false; error: string };

function normalize(input: AnnouncementInput): { ok: true; doc: Pick<Doc, "title" | "body" | "link" | "channels" | "audience" | "scheduledAt"> } | { ok: false; error: string } {
  const title = clean(input.title, LIMITS.title);
  if (!title) return { ok: false, error: "Write a title for the announcement." };
  const channels = Object.fromEntries(CHANNELS.map((c) => [c, input.channels?.[c] === true])) as Record<ChannelKey, boolean>;
  if (input.when !== "draft" && !Object.values(channels).some(Boolean)) return { ok: false, error: "Choose at least one channel: in-app, push or email." };
  const a = input.audience;
  let audience: AnnouncementAudience;
  if (a?.type === "roles") audience = { type: "roles", roles: [...new Set(a.roles.map((r) => clean(r, 60)).filter(Boolean))].slice(0, 40) };
  else if (a?.type === "people") audience = { type: "people", ids: [...new Set(a.ids.map((i) => clean(i, 40)).filter(Boolean))].slice(0, 1000) };
  else audience = { type: "everyone" };
  if (input.when !== "draft" && audience.type === "roles" && audience.roles.length === 0) return { ok: false, error: "Choose at least one role." };
  if (input.when !== "draft" && audience.type === "people" && audience.ids.length === 0) return { ok: false, error: "Choose at least one person." };
  let scheduledAt: Date | null = null;
  if (input.when === "schedule") {
    scheduledAt = input.scheduledAt ? new Date(input.scheduledAt) : null;
    if (!scheduledAt || Number.isNaN(scheduledAt.getTime())) return { ok: false, error: "Pick a date and time to send it." };
    if (scheduledAt.getTime() < Date.now() + 30_000) return { ok: false, error: "That time has already passed. Pick a time in the future, or send it now." };
    if (scheduledAt.getTime() > Date.now() + MAX_SCHEDULE_DAYS * 86_400_000) return { ok: false, error: `You can schedule up to ${MAX_SCHEDULE_DAYS} days ahead.` };
  }
  return { ok: true, doc: { title, body: clean(input.body, LIMITS.body), link: safeLink(input.link), channels, audience, scheduledAt } };
}

export async function listAnnouncements(): Promise<AnnouncementView[]> {
  return (await (await col()).find({}).sort({ createdAt: -1 }).limit(MAX_ANNOUNCEMENTS).toArray()).map(view);
}

/** Sends one announcement now (claims it first, so it goes out once). */
async function dispatch(id: string): Promise<AnnouncementResult> {
  const c = await col();
  const claimed = await c.findOneAndUpdate({ _id: id, status: { $in: ["draft", "scheduled"] } }, { $set: { status: "sending", updatedAt: new Date() } }, { returnDocument: "after" });
  if (!claimed) return { ok: false, error: "This announcement was already sent or is being sent." };
  try {
    const ids = await resolveAudience(claimed.audience);
    if (ids.length === 0) throw new Error("No one matches that audience any more.");
    const n = await notifyUsers("workspace", ids, { type: "announcement", title: claimed.title, body: claimed.body, link: claimed.link || "/commandos/notifications", category: "business", channels: claimed.channels });
    if (n === 0) throw new Error("No one could be notified.");
    const done = await c.findOneAndUpdate({ _id: id }, { $set: { status: "sent", recipients: n, sentAt: new Date(), error: "", updatedAt: new Date() } }, { returnDocument: "after" });
    return { ok: true, announcement: view(done!) };
  } catch (err) {
    const failed = await c.findOneAndUpdate({ _id: id }, { $set: { status: "failed", error: (err instanceof Error ? err.message : "Could not send").slice(0, 300), updatedAt: new Date() } }, { returnDocument: "after" });
    return { ok: false, error: failed?.error || "Could not send." };
  }
}

export async function createAnnouncement(input: AnnouncementInput, actorId: string): Promise<AnnouncementResult> {
  const n = normalize(input);
  if (!n.ok) return n;
  const c = await col();
  if ((await c.countDocuments({})) >= MAX_ANNOUNCEMENTS) return { ok: false, error: `You can keep up to ${MAX_ANNOUNCEMENTS} announcements. Delete old ones first.` };
  const now = new Date();
  const doc: Doc = { _id: randomUUID(), ...n.doc, status: input.when === "schedule" ? "scheduled" : "draft", recipients: 0, error: "", createdAt: now, updatedAt: now, sentAt: null, createdBy: actorId };
  await c.insertOne(doc);
  return input.when === "now" ? dispatch(doc._id) : { ok: true, announcement: view(doc) };
}

/** Edits a draft or scheduled announcement (and can send or reschedule it). */
export async function updateAnnouncement(id: string, input: AnnouncementInput): Promise<AnnouncementResult> {
  const n = normalize(input);
  if (!n.ok) return n;
  const c = await col();
  const res = await c.findOneAndUpdate({ _id: id, status: { $in: ["draft", "scheduled", "failed"] } }, { $set: { ...n.doc, status: input.when === "schedule" ? "scheduled" : "draft", error: "", updatedAt: new Date() } }, { returnDocument: "after" });
  if (!res) return { ok: false, error: "Only drafts, scheduled and failed announcements can be edited." };
  return input.when === "now" ? dispatch(id) : { ok: true, announcement: view(res) };
}

export async function sendAnnouncementNow(id: string): Promise<AnnouncementResult> {
  return dispatch(id);
}

export async function cancelAnnouncement(id: string): Promise<AnnouncementResult> {
  const res = await (await col()).findOneAndUpdate({ _id: id, status: "scheduled" }, { $set: { status: "cancelled", updatedAt: new Date() } }, { returnDocument: "after" });
  return res ? { ok: true, announcement: view(res) } : { ok: false, error: "Only a scheduled announcement can be cancelled." };
}

export async function deleteAnnouncement(id: string): Promise<{ ok: boolean; error?: string }> {
  const res = await (await col()).deleteOne({ _id: id, status: { $ne: "sending" } });
  return res.deletedCount ? { ok: true } : { ok: false, error: "That announcement doesn't exist or is being sent." };
}

/** Sends this company's scheduled announcements that are due. Safe to call often. */
export async function dispatchDue(): Promise<number> {
  const due = await (await col()).find({ status: "scheduled", scheduledAt: { $lte: new Date() } }, { projection: { _id: 1 } }).limit(20).toArray();
  let sent = 0;
  for (const d of due) if ((await dispatch(d._id)).ok) sent++;
  return sent;
}

const last = new Map<string, number>();
/** `dispatchDue` at most once a minute per company, for callers that run on every page view. Never throws. */
export async function dispatchDueThrottled(): Promise<void> {
  try {
    const company = await currentCompanyIdOrNull();
    if (!company) return;
    if (Date.now() - (last.get(company) ?? 0) < 60_000) return;
    last.set(company, Date.now());
    await dispatchDue();
  } catch {
    /* never breaks the page */
  }
}

/** Every company, for the cron: how many announcements went out. */
export async function dispatchDueEverywhere(): Promise<number> {
  const runs = await forEachCompany(() => dispatchDue());
  return runs.reduce((n, r) => n + (r.ok ? (r.result ?? 0) : 0), 0);
}
