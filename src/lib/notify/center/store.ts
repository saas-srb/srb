import "server-only";
import { randomUUID } from "node:crypto";
import { getDb } from "@/lib/mongodb";
import { currentCompanyIdOrNull } from "@/lib/platform/tenancy/context";
import { getCompanyBrand } from "@/lib/platform/branding";
import { isNotifyPanel } from "@/lib/notify/panels";
import { SEED_EVENTS } from "@/lib/notify/center/seed-events";
import { eventDescription, eventName } from "@/lib/notify/center/event-names";
import { eventChannelOff, getFeatureControls } from "@/lib/platform/feature-controls";
import {
  CHANNELS,
  LIMITS,
  defaultChannels,
  planFromRule,
  type ChannelKey,
  type ChannelRule,
  type EventRule,
  type LogEntry,
  type LogStatus,
  type NotificationPlan,
  type RuleKind,
} from "@/lib/notify/center/shared";

/**
 * A company's Notification center, in its own database (company-scoped like everything else):
 *   notification_rules — one document per event: which channels carry it, and the wording. Seeded from `seed-events.ts` the first time
 *                        the page opens; an event raised later that has no rule registers one (everything on) by itself.
 *   notification_log   — every email, bell notification and push that went out (or was held back by a rule), kept for LOG_DAYS.
 * Delivery code only ever calls `planNotification` (what to send, on which channels) and `logDeliveries`; both are best-effort.
 */

const RULES = "notification_rules";
const LOG = "notification_log";
const LOG_DAYS = 60;
const CACHE_MS = 15_000;

interface RuleDoc {
  _id: string;
  kind: RuleKind;
  product: string;
  name: string;
  description: string;
  locked: boolean;
  channels: Record<ChannelKey, ChannelRule>;
  original?: { title: string | null; body: string | null } | null;
  sample?: { title: string; body: string | null; link: string | null; at: Date } | null;
  createdAt: Date;
  updatedAt: Date;
  updatedBy: string | null;
}
interface LogDoc {
  _id: string;
  at: Date;
  channel: ChannelKey;
  event: string;
  product: string;
  title: string;
  status: LogStatus;
  recipient: string;
  detail: string;
  expiresAt: Date;
}

/** Account and billing emails every company receives: shown in the list, never switched off. */
const SYSTEM_EMAILS: { key: string; name: string; description: string; product: string; locked: boolean; channels?: ChannelKey[] }[] = [
  { key: "announcement", name: "Announcements", description: "Messages you send from the Announcements tab. Turn a channel off here to stop it for every announcement.", product: "workspace", locked: false, channels: ["inApp", "push", "email"] },
  { key: "automation_notification", name: "Automation notifications", description: "Notifications and emails your own automations send (Settings → Automations).", product: "workspace", locked: false, channels: ["inApp", "push", "email"] },
  { key: "auth_verify_email", name: "Verify your email", description: "Sent to a new account to confirm its email address.", product: "account", locked: true },
  { key: "auth_password_reset", name: "Password reset", description: "The link sent when someone asks to reset a forgotten password.", product: "account", locked: true },
  { key: "auth_email_otp", name: "Sign-in code by email", description: "The one-time code for two-step sign-in by email.", product: "account", locked: true },
  { key: "team_invitation", name: "Team invitation", description: "Sent when you invite someone to join the workspace.", product: "account", locked: false },
  { key: "billing_invoice", name: "Invoices & receipts", description: "Tax invoices and payment receipts for your subscription.", product: "account", locked: true },
  { key: "billing_trial", name: "Trial reminders", description: "Reminders that the free trial is about to end.", product: "account", locked: true },
  { key: "billing_subscription", name: "Subscription notices", description: "Payment failures, renewals, plan changes and suspension notices.", product: "account", locked: true },
];

/** The built-in events as the platform sees them: every seeded event plus the account and billing emails. */
export interface CatalogEvent {
  key: string;
  name: string;
  description: string;
  product: string;
  locked: boolean;
  channels: ChannelKey[];
}
export function eventCatalog(): CatalogEvent[] {
  const out = new Map<string, CatalogEvent>();
  for (const [key, product] of SEED_EVENTS) out.set(key, { key, name: eventName(key), description: eventDescription(key), product, locked: false, channels: [...CHANNELS] });
  for (const e of SYSTEM_EMAILS) out.set(e.key, { key: e.key, name: e.name, description: e.description, product: e.product, locked: e.locked, channels: e.channels ?? ["email"] });
  return [...out.values()];
}

async function rulesCol() {
  return (await getDb()).collection<RuleDoc>(RULES);
}
let logIndexed = false;
async function logCol() {
  const c = (await getDb()).collection<LogDoc>(LOG);
  if (!logIndexed) {
    logIndexed = true;
    await Promise.all([
      c.createIndex({ at: -1 }).catch(() => {}),
      c.createIndex({ channel: 1, at: -1 }).catch(() => {}),
      c.createIndex({ event: 1, at: -1 }).catch(() => {}),
      c.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }).catch(() => {}),
    ]);
  }
  return c;
}

// ── Reading rules (cached per company, a few seconds) ───────────────────────────────────────────────────────────────────────────────

const g = globalThis as unknown as { __notifyRules?: Map<string, { at: number; rules: Map<string, RuleDoc> }>; __notifyRegistered?: Set<string>; __notifySampled?: Map<string, number> };
const cache = (g.__notifyRules ??= new Map());
const registered = (g.__notifyRegistered ??= new Set<string>());

async function loadRules(companyId: string): Promise<Map<string, RuleDoc>> {
  const hit = cache.get(companyId);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.rules;
  const rules = new Map((await (await rulesCol()).find({}).limit(1000).toArray()).map((r) => [r._id, r]));
  if (cache.size > 500) cache.clear();
  cache.set(companyId, { at: Date.now(), rules });
  return rules;
}
const bust = (companyId: string) => cache.delete(companyId);

/** Inserts a rule for an event nobody has seen yet (all channels on), once per process. Never throws. */
async function register(companyId: string, key: string, product: string): Promise<void> {
  const id = `${companyId}:${key}`;
  if (registered.has(id)) return;
  registered.add(id);
  if (registered.size > 20_000) registered.clear();
  try {
    const now = new Date();
    const known = SYSTEM_EMAILS.find((e) => e.key === key);
    await (await rulesCol()).updateOne(
      { _id: key },
      { $setOnInsert: { kind: "system", product: known?.product ?? product, name: known?.name ?? eventName(key), description: known?.description ?? eventDescription(key), locked: known?.locked ?? false, channels: defaultChannels(known ? (known.channels ?? ["email"]) : undefined), createdAt: now, updatedAt: now, updatedBy: null } },
      { upsert: true },
    );
    bust(companyId);
  } catch {
    registered.delete(id);
  }
}

const sampled = (g.__notifySampled ??= new Map<string, number>());
/** Remembers the last real notification of an event (its original wording) so the editor can show what people actually receive. At most every 10 minutes per event. */
async function captureSample(companyId: string, input: { type: string; title: string; body?: string | null; link?: string | null }): Promise<void> {
  const k = `${companyId}:${input.type}`;
  if (Date.now() - (sampled.get(k) ?? 0) < 600_000) return;
  sampled.set(k, Date.now());
  if (sampled.size > 20_000) sampled.clear();
  try {
    await (await rulesCol()).updateOne({ _id: input.type }, { $set: { sample: { title: input.title.slice(0, 200), body: input.body ? input.body.slice(0, 500) : null, link: input.link ?? null, at: new Date() } } });
  } catch {
    /* the sample is a convenience */
  }
}

const maskEmail = (email: string) => {
  const [name = "", domain = ""] = email.split("@");
  return domain ? `${name.slice(0, 2)}${"•".repeat(Math.max(2, name.length - 2))}@${domain}` : "recipient";
};
export { maskEmail };

/**
 * What to send for an event, per channel: on/off by the company's rule, and the wording (templates). With no company in scope (a script,
 * a platform job) or no rule yet, everything is on and the wording is the original.
 */
export async function planNotification(input: { type: string; title: string; body?: string | null; link?: string | null; subject?: string; product?: string; only?: Partial<Record<ChannelKey, boolean>> }): Promise<NotificationPlan> {
  const plan = await basePlan(input);
  // What SelfRun switched off for every company (Platform Console → Notification center). Security and billing emails can't be.
  if (!SYSTEM_EMAILS.some((e) => e.key === input.type && e.locked)) {
    const controls = await getFeatureControls().catch(() => null);
    if (controls) for (const c of CHANNELS) if (eventChannelOff(controls, input.type, c)) plan[c] = { ...plan[c], on: false, reason: "platform" };
  }
  // One send can narrow the channels further (an announcement sent by email only); it can never widen what the rule allows.
  if (input.only) for (const c of CHANNELS) if (input.only[c] === false) plan[c] = { ...plan[c], on: false };
  return plan;
}

async function basePlan(input: { type: string; title: string; body?: string | null; link?: string | null; subject?: string; product?: string }): Promise<NotificationPlan> {
  try {
    const companyId = await currentCompanyIdOrNull();
    if (!companyId) return planFromRule(null, input);
    const rule = (await loadRules(companyId)).get(input.type) ?? null;
    if (!rule) void register(companyId, input.type, input.product && (isNotifyPanel(input.product) || ["account", "workspace"].includes(input.product)) ? input.product : "workspace");
    void captureSample(companyId, input);
    const wantsCompany = rule && Object.values(rule.channels).some((c) => /\{\{\s*company\s*\}\}/.test(`${c.title ?? ""}${c.body ?? ""}${c.subject ?? ""}`));
    return planFromRule(rule && { channels: rule.channels, locked: rule.locked }, { ...input, company: wantsCompany ? (await getCompanyBrand().catch(() => null))?.name : undefined }, { template: rule?.original });
  } catch {
    return planFromRule(null, input);
  }
}

/** Is `channel` on for this event? For deliveries that have no wording to template (a security email). */
export async function channelOn(event: string, channel: ChannelKey): Promise<boolean> {
  return (await channelState(event, channel)).on;
}

export async function channelState(event: string, channel: ChannelKey): Promise<{ on: boolean; reason?: "platform" | "company" }> {
  const c = (await planNotification({ type: event, title: event }))[channel];
  return { on: c.on, reason: c.reason };
}

// ── The delivery log ────────────────────────────────────────────────────────────────────────────────────────────────────────────────

/** Why a delivery was held back, as the log words it. */
export const offDetail = (reason?: "platform" | "company") => (reason === "platform" ? "Turned off by the platform" : "Turned off in Notification center");

/** The in-app bell's log row for one person: sent, or held back by the company's rule. */
export async function logBell(on: boolean, input: { type: string; title: string; product: string; recipients?: number; reason?: "platform" | "company" }): Promise<void> {
  const n = input.recipients ?? 1;
  await logDeliveries([{ channel: "inApp", event: input.type, product: input.product, title: input.title, status: on ? "sent" : "off", recipient: `${n} ${n === 1 ? "person" : "people"}`, detail: on ? "" : offDetail(input.reason) }]);
}

export interface LogInput {
  channel: ChannelKey;
  event: string;
  product?: string;
  title: string;
  status: LogStatus;
  recipient: string;
  detail?: string;
}

/** Records deliveries (or what a rule held back). Best-effort: a logging problem never affects the notification. */
export async function logDeliveries(rows: LogInput[]): Promise<void> {
  if (rows.length === 0) return;
  try {
    if (!(await currentCompanyIdOrNull())) return;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + LOG_DAYS * 86_400_000);
    await (await logCol()).insertMany(
      rows.slice(0, 500).map((r) => ({ _id: randomUUID(), at: now, channel: r.channel, event: r.event, product: r.product ?? "workspace", title: r.title.slice(0, 160), status: r.status, recipient: r.recipient.slice(0, 120), detail: (r.detail ?? "").slice(0, 300), expiresAt })),
      { ordered: false },
    );
  } catch {
    /* never breaks the delivery */
  }
}

export interface LogQuery {
  channel?: ChannelKey;
  status?: LogStatus;
  event?: string;
  q?: string;
  before?: string;
  limit?: number;
}
export async function listLog(q: LogQuery = {}): Promise<{ entries: LogEntry[]; next: string | null }> {
  const filter: Record<string, unknown> = {};
  if (q.channel && (CHANNELS as readonly string[]).includes(q.channel)) filter.channel = q.channel;
  if (q.status && ["sent", "failed", "off"].includes(q.status)) filter.status = q.status;
  if (q.event) filter.event = q.event;
  if (q.q?.trim()) filter.title = { $regex: q.q.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&").slice(0, 80), $options: "i" };
  if (q.before) {
    const d = new Date(q.before);
    if (!Number.isNaN(d.getTime())) filter.at = { $lt: d };
  }
  const limit = Math.min(Math.max(q.limit ?? 50, 1), 100);
  const rows = await (await logCol()).find(filter).sort({ at: -1, _id: -1 }).limit(limit + 1).toArray();
  const page = rows.slice(0, limit);
  return {
    entries: page.map((r) => ({ id: r._id, at: r.at.toISOString(), channel: r.channel, event: r.event, product: r.product, title: r.title, status: r.status, recipient: r.recipient, detail: r.detail })),
    next: rows.length > limit ? page[page.length - 1].at.toISOString() : null,
  };
}

export async function logSummary(): Promise<{ last24h: Record<ChannelKey, { sent: number; failed: number; off: number }> }> {
  const since = new Date(Date.now() - 86_400_000);
  const rows = await (await logCol()).aggregate<{ _id: { c: ChannelKey; s: LogStatus }; n: number }>([{ $match: { at: { $gte: since } } }, { $group: { _id: { c: "$channel", s: "$status" }, n: { $sum: 1 } } }]).toArray();
  const out = Object.fromEntries(CHANNELS.map((c) => [c, { sent: 0, failed: 0, off: 0 }])) as Record<ChannelKey, { sent: number; failed: number; off: number }>;
  for (const r of rows) if (out[r._id.c]) out[r._id.c][r._id.s] += r.n;
  return { last24h: out };
}

// ── The list the page shows, and its changes ────────────────────────────────────────────────────────────────────────────────────────

// A built-in event is always named from the code's current wording, so a name stored before a rename never shows.
const fixed = new Set(SYSTEM_EMAILS.map((e) => e.key));
const view = (r: RuleDoc): EventRule => ({
  key: r._id, kind: r.kind, product: r.product, name: r.kind === "system" && !fixed.has(r._id) ? eventName(r._id) : r.name, description: r.kind === "system" && !fixed.has(r._id) ? eventDescription(r._id) : r.description, locked: r.locked, channels: r.channels,
  original: r.original ?? null, sample: r.sample ? { ...r.sample, at: r.sample.at.toISOString() } : null,
  createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString(),
});
export type RuleView = ReturnType<typeof view>;

/** Seeds the list (idempotent: only events that have no rule yet are added) and returns every rule. */
export async function listRules(): Promise<RuleView[]> {
  const companyId = await currentCompanyIdOrNull();
  const col = await rulesCol();
  const now = new Date();
  const ops = [
    // The code owns an event's product and original wording, so they are refreshed every time; everything a company edits is left alone.
    ...SEED_EVENTS.map(([key, product, title, body]) => ({ updateOne: { filter: { _id: key }, update: { $setOnInsert: { kind: "system" as const, name: eventName(key), description: eventDescription(key), locked: false, channels: defaultChannels(), createdAt: now, updatedAt: now, updatedBy: null }, $set: { product, original: title || body ? { title, body } : null } }, upsert: true } })),
    ...SYSTEM_EMAILS.map((e) => ({ updateOne: { filter: { _id: e.key }, update: { $setOnInsert: { kind: "system" as const, product: e.product, name: e.name, description: e.description, locked: e.locked, channels: defaultChannels(e.channels ?? ["email"]), createdAt: now, updatedAt: now, updatedBy: null } }, upsert: true } })),
  ];
  await col.bulkWrite(ops as never, { ordered: false }).catch(() => {});
  if (companyId) bust(companyId);
  return (await col.find({ kind: { $ne: "custom" } }).limit(1000).toArray()).map(view).sort((a, b) => a.product.localeCompare(b.product) || a.name.localeCompare(b.name));
}

export async function getRuleView(key: string): Promise<RuleView | null> {
  const doc = await (await rulesCol()).findOne({ _id: key });
  return doc ? view(doc) : null;
}

export type RuleResult<T = RuleView> = { ok: true; rule: T } | { ok: false; error: string };

const clean = (v: unknown, max: number) => String(v ?? "").replace(/\r\n/g, "\n").trim().slice(0, max);
const safeLink = (l: unknown) => {
  const v = clean(l, 300);
  return v.startsWith("/") && !v.startsWith("//") && !v.includes("\\") ? v : "";
};

export interface RulePatch {
  channels?: Partial<Record<ChannelKey, Partial<ChannelRule>>>;
}

/** Changes one rule. Locked rules cannot be switched off. */
export async function updateRule(key: string, patch: RulePatch, actorId: string): Promise<RuleResult> {
  const col = await rulesCol();
  const current = await col.findOne({ _id: key });
  if (!current) return { ok: false, error: "That notification doesn't exist." };
  const channels = structuredClone(current.channels);
  for (const ch of CHANNELS) {
    const p = patch.channels?.[ch];
    if (!p) continue;
    if (channels[ch].unavailable) continue;
    if (typeof p.enabled === "boolean") {
      if (!p.enabled && current.locked) return { ok: false, error: "This is a security or billing email and can't be turned off." };
      channels[ch].enabled = p.enabled;
    }
    if (current.locked) continue;
    if (p.subject !== undefined) channels[ch].subject = clean(p.subject, LIMITS.subject);
    if (p.title !== undefined) channels[ch].title = clean(p.title, LIMITS.title);
    if (p.body !== undefined) channels[ch].body = clean(p.body, LIMITS.body);
    if (ch === "email") {
      if (p.greeting !== undefined) channels[ch].greeting = clean(p.greeting, LIMITS.greeting);
      if (p.button !== undefined) channels[ch].button = clean(p.button, LIMITS.button);
      if (p.footnote !== undefined) channels[ch].footnote = clean(p.footnote, LIMITS.footnote);
    }
  }
  const set: Partial<RuleDoc> = { channels, updatedAt: new Date(), updatedBy: actorId };
  await col.updateOne({ _id: key }, { $set: set });
  const companyId = await currentCompanyIdOrNull();
  if (companyId) bust(companyId);
  return { ok: true, rule: view({ ...current, ...set, channels } as RuleDoc) };
}

/** Back to the original wording with every channel on (system notifications only). */
export async function resetRule(key: string, actorId: string): Promise<RuleResult> {
  const col = await rulesCol();
  const current = await col.findOne({ _id: key });
  if (!current || current.kind !== "system") return { ok: false, error: "Only built-in notifications can be reset." };
  const available = CHANNELS.filter((c) => !current.channels[c].unavailable);
  const channels = defaultChannels([...available]);
  await col.updateOne({ _id: key }, { $set: { channels, updatedAt: new Date(), updatedBy: actorId } });
  const companyId = await currentCompanyIdOrNull();
  if (companyId) bust(companyId);
  return { ok: true, rule: view({ ...current, channels } as RuleDoc) };
}
