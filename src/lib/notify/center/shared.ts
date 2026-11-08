/**
 * The Notification center's rules (pure; shared by the server and the page). One rule per event, per company, kept in the database:
 * which of the three channels (email, in-app bell, push) carry it, and optionally the wording. The events themselves are not a fixed
 * list: the first time a company opens the center it is seeded from `seed-events.ts`, and any event raised later registers itself.
 */

export const CHANNELS = ["inApp", "push", "email"] as const;
export type ChannelKey = (typeof CHANNELS)[number];
export const CHANNEL_LABEL: Record<ChannelKey, string> = { inApp: "In-app", push: "Push", email: "Email" };

export interface ChannelRule {
  /** Whether the channel carries this event at all. */
  enabled: boolean;
  /** The channel cannot be used for this event (a sign-in email has no bell). */
  unavailable?: boolean;
  /** Email subject; empty = the original. Supports {{title}}, {{body}}, {{company}}, {{link}}. */
  subject?: string;
  /** Headline of the bell/push notification; empty = the original. */
  title?: string;
  /** Text; empty = the original. */
  body?: string;
  /** Email only: the greeting line ("Hi Asha,"); empty = the original. */
  greeting?: string;
  /** Email only: the button label ("Open it"); empty = the original. */
  button?: string;
  /** Email only: the small print under the message; empty = the original. */
  footnote?: string;
}

export type RuleKind = "system" | "custom";

export interface EventRule {
  /** The event key (also the document id). */
  key: string;
  kind: RuleKind;
  /** The product (panel key) it belongs to, or "workspace" / "account". */
  product: string;
  name: string;
  description: string;
  /** Security and account emails: shown, but they cannot be turned off. */
  locked: boolean;
  channels: Record<ChannelKey, ChannelRule>;
  /** The wording found in the code ({name} = a value filled in when it is sent); null for events without a notification text. */
  original: { title: string | null; body: string | null } | null;
  /** The last real notification of this event, as it was raised (before any wording changes). */
  sample: { title: string; body: string | null; link: string | null; at: string } | null;
  createdAt: string;
  updatedAt: string;
}

/** `Expense {expenseCode} approved` → `Expense [expenseCode] approved`, for showing the wording of an event that has not been sent yet. */
export const fillExample = (template: string | null | undefined): string => (template ?? "").replace(/\{([^{}]+)\}/g, "[$1]");

/** What previews and the editor show for an event: its last real notification, else the wording from the code with its values marked. */
export function exampleFor(rule: Pick<EventRule, "original" | "sample" | "name">): { title: string; body: string | null; real: boolean } {
  if (rule.sample) return { title: rule.sample.title, body: rule.sample.body, real: true };
  const title = fillExample(rule.original?.title) || rule.name;
  const body = fillExample(rule.original?.body) || null;
  return { title, body, real: false };
}

export const MAX_RULES_CUSTOM = 100;
export const LIMITS = { name: 80, description: 300, subject: 160, title: 160, body: 600, greeting: 160, button: 40, footnote: 400 } as const;

/** `expense_approved` → `Expense approved`. */
export function humanize(key: string): string {
  const s = key.replace(/[_.-]+/g, " ").trim();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : key;
}

export const defaultChannels = (available: ChannelKey[] = [...CHANNELS], enabled: Partial<Record<ChannelKey, boolean>> = {}): Record<ChannelKey, ChannelRule> => ({
  inApp: { enabled: available.includes("inApp") && (enabled.inApp ?? true), ...(available.includes("inApp") ? {} : { unavailable: true }) },
  push: { enabled: available.includes("push") && (enabled.push ?? true), ...(available.includes("push") ? {} : { unavailable: true }) },
  email: { enabled: available.includes("email") && (enabled.email ?? true), ...(available.includes("email") ? {} : { unavailable: true }) },
});

/** `{{title}}` (a general placeholder) or `{advanceNumber}` (a value of this event, named as in the product's own wording). */
const TOKEN = /\{\{\s*([a-zA-Z]+)\s*\}\}|\{([^{}\n]+)\}/g;
export const templateVariables = ["title", "body", "company", "link"] as const;

/** The `{name}` values a wording uses, in order, without repeats. */
export function placeholdersOf(template: string | null | undefined): string[] {
  const out: string[] = [];
  for (const m of (template ?? "").matchAll(TOKEN)) if (m[2] && !out.includes(m[2])) out.push(m[2]);
  return out;
}

/**
 * Recovers the values of an event's wording from a real notification: `Advance {advanceNumber} needs approval` against
 * `Advance ADV-5 needs approval` gives `{ advanceNumber: "ADV-5" }`. Null when the real text doesn't follow the wording (the event
 * words itself differently in other cases), in which case its `{name}` values aren't available.
 */
export function extractValues(template: string | null | undefined, actual: string | null | undefined): Record<string, string> | null {
  if (!template || actual == null) return template ? null : {};
  const names: string[] = [];
  let source = "";
  let last = 0;
  for (const m of template.matchAll(/\{([^{}\n]+)\}/g)) {
    source += template.slice(last, m.index).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (names.includes(m[1])) source += "[\\s\\S]*?";
    else {
      names.push(m[1]);
      source += "([\\s\\S]*?)";
    }
    last = (m.index ?? 0) + m[0].length;
  }
  source += template.slice(last).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const hit = new RegExp(`^${source}$`).exec(actual);
  return hit ? Object.fromEntries(names.map((n, i) => [n, hit[i + 1]])) : null;
}

type Values = Record<string, string | null | undefined>;

/**
 * Fills a wording. `{{title}}`-style placeholders come from `general`; `{name}` ones from `values`. A `{name}` with no value makes the
 * wording unusable (`null`) unless `mark` is set, which shows it as `[name]` (previews). One pass, so a value is never read as a placeholder.
 */
export function renderTemplate(template: string, general: Values, values: Values = {}, mark = false): string | null {
  let missing = false;
  const text = template.replace(TOKEN, (_, g: string | undefined, v: string | undefined) => {
    if (g) return general[g] ?? "";
    const val = values[v!] ?? ((templateVariables as readonly string[]).includes(v!) ? general[v!] : undefined);
    if (val == null) {
      if (!mark) missing = true;
      return `[${v}]`;
    }
    return val;
  });
  return missing ? null : text.replace(/[ \t]+\n/g, "\n").trim();
}

export interface ChannelPlan {
  on: boolean;
  /** Why it is off, when it is: the platform switched it off for everyone, or the company did. */
  reason?: "platform" | "company";
  title: string;
  body: string | null;
  subject: string;
  /** Email extras exactly as the company wrote them (null = the original); they hold {firstName} / {settingsLink}, filled in per recipient. */
  greeting: string | null;
  button: string | null;
  footnote: string | null;
}
export type NotificationPlan = Record<ChannelKey, ChannelPlan>;

/**
 * What each channel should send for an event, given its rule (null = no rule yet: everything on, original wording). `template` is the
 * wording found in the code: with it, a company's edited wording may use the event's own `{name}` values, which are recovered from the
 * real title and text. A wording that can't be filled completely falls back to the original, never to a half-filled message.
 * `mark` shows missing values as `[name]` (previews).
 */
export function planFromRule(
  rule: Pick<EventRule, "channels" | "locked"> | null,
  original: { title: string; body?: string | null; subject?: string; link?: string | null; company?: string },
  options: { template?: { title: string | null; body: string | null } | null; mark?: boolean } = {},
): NotificationPlan {
  const general = { title: original.title, body: original.body ?? "", link: original.link ?? "", company: original.company ?? "" };
  const values = { ...(extractValues(options.template?.title, original.title) ?? {}), ...(extractValues(options.template?.body, original.body ?? "") ?? {}) };
  const fill = (text: string | undefined, max: number, fallback: string | null): string | null => {
    if (!text?.trim()) return fallback;
    const out = renderTemplate(text, general, values, options.mark);
    return out ? out.slice(0, max) : fallback;
  };
  const one = (c: ChannelRule | undefined): ChannelPlan => ({
    on: rule?.locked ? true : c ? c.enabled && !c.unavailable : true,
    ...(rule?.locked ? {} : c && (!c.enabled || c.unavailable) ? { reason: "company" as const } : {}),
    title: fill(c?.title, LIMITS.title, original.title) ?? original.title,
    body: fill(c?.body, LIMITS.body, original.body ?? null),
    subject: fill(c?.subject, LIMITS.subject, original.subject ?? original.title) ?? original.title,
    greeting: c?.greeting?.trim() || null,
    button: c?.button?.trim() || null,
    footnote: c?.footnote?.trim() || null,
  });
  return { inApp: one(rule?.channels.inApp), push: one(rule?.channels.push), email: one(rule?.channels.email) };
}

/** Placeholders in `text` that this event can't fill: not a general one, and not one of the event's own values. */
export function unknownVariables(text: string, known: readonly string[] = []): string[] {
  const bad = new Set<string>();
  for (const m of text.matchAll(TOKEN)) {
    if (m[1] && !(templateVariables as readonly string[]).includes(m[1])) bad.add(`{{${m[1]}}}`);
    if (m[2] && !known.includes(m[2]) && !(templateVariables as readonly string[]).includes(m[2])) bad.add(`{${m[2]}}`);
  }
  return [...bad];
}

export type LogStatus = "sent" | "failed" | "off";
export interface LogEntry {
  id: string;
  at: string;
  channel: ChannelKey;
  event: string;
  product: string;
  title: string;
  status: LogStatus;
  /** Who it went to: a masked email address, or a count ("12 people"). */
  recipient: string;
  detail: string;
}

// ── Announcements ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────

export type AnnouncementStatus = "draft" | "scheduled" | "sending" | "sent" | "failed" | "cancelled";
export type AnnouncementAudience = { type: "everyone" } | { type: "roles"; roles: string[] } | { type: "people"; ids: string[] };

export interface AnnouncementView {
  id: string;
  title: string;
  body: string;
  link: string;
  channels: Record<ChannelKey, boolean>;
  audience: AnnouncementAudience;
  /** When it goes out (scheduled), ISO. */
  scheduledAt: string | null;
  status: AnnouncementStatus;
  recipients: number;
  error: string;
  createdAt: string;
  sentAt: string | null;
  createdBy: string;
}

export const ANNOUNCEMENT_STATUS_LABEL: Record<AnnouncementStatus, string> = { draft: "Draft", scheduled: "Scheduled", sending: "Sending", sent: "Sent", failed: "Failed", cancelled: "Cancelled" };
/** The furthest ahead an announcement can be scheduled. */
export const MAX_SCHEDULE_DAYS = 365;
export const MAX_ANNOUNCEMENTS = 500;

// ── Examples for the preview ───────────────────────────────────────────────────────────────────────────────────────
//
// The product words a notification as `Advance {advanceNumber} needs approval`; the editor shows it like that, with everything that
// changes each time in { }. The preview fills those in with believable examples ("Advance ADV-0001 needs approval").

/** Email values that exist for every email notification. */
export const EMAIL_VALUES = ["firstName", "settingsLink"] as const;
export const DEFAULT_GREETING = "Hi {firstName},";
export const DEFAULT_BUTTON = "Open it";
export const DEFAULT_FOOTNOTE = "You get this because of your notification settings for {company}. Change which emails you get: {settingsLink}";

const DATE_RE = /date|\bdue\b|deadline|expir|until|from|to$|when|day$/i;
function exampleFor_(name: string): string {
  const n = name.split("/")[0];
  if (name.includes("/")) return n.trim();
  if (n === "firstName") return "Asha";
  if (n === "settingsLink") return "https://app.example.com/commandos/notifications/settings";
  if (/(number|code|ref|reference|no|id)$/i.test(n)) return `${(n.replace(/(number|code|ref|reference|no|id)$/i, "").replace(/[^a-zA-Z]/g, "") || "REF").slice(0, 3).toUpperCase()}-0001`;
  if (/(amount|total|price|fee|cost|budget|balance|salary|value|inr)/i.test(n)) return "₹5,000.00";
  if (/(days|count|number|qty|quantity|hours|minutes|total)/i.test(n)) return "3";
  if (/(email)/i.test(n)) return "asha@example.com";
  if (/(name|employee|customer|client|user|student|candidate|person|owner|manager|requester|emp|assignee|by)$/i.test(n)) return "Asha Verma";
  if (/(decision|status|state|result|outcome)/i.test(n)) return "approved";
  if (/(label|title|subject|task|project|class|course|test|sop|document|item|asset|campaign|product|plan|reason|note|message|comment)/i.test(n)) return /(note|reason|comment|message)/i.test(n) ? "Please review this" : `Sample ${n.replace(/([A-Z])/g, " $1").toLowerCase().trim()}`;
  if (DATE_RE.test(n)) return "12 Nov 2026";
  return `Sample ${n.replace(/([A-Z])/g, " $1").toLowerCase().trim() || "value"}`;
}

/** A believable value for each `{name}`, all different from each other (so they can be told apart again). */
export function exampleValues(names: readonly string[]): Record<string, string> {
  const out: Record<string, string> = {};
  const used = new Set<string>();
  for (const name of names) {
    let v = exampleFor_(name);
    for (let i = 2; used.has(v); i++) v = `${exampleFor_(name)} (${i})`;
    used.add(v);
    out[name] = v;
  }
  return out;
}

export interface ExpandContext {
  /** `{name}` → example value. */
  values: Record<string, string>;
  /** The company name, for `{{company}}`. */
  company: string;
  /** What `{{title}}` / `{{body}}` stand for (only when the product has no wording of its own to show). */
  title?: string | null;
  body?: string | null;
}

const esc = (v: string) => v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Template → readable text for the preview: every `{name}` and `{{company}}` is replaced by its example. */
export function expandText(text: string, ctx: ExpandContext): string {
  return text
    .replace(/\{\{\s*company\s*\}\}/g, ctx.company)
    .replace(/\{\{\s*title\s*\}\}/g, ctx.title ?? "{{title}}")
    .replace(/\{\{\s*body\s*\}\}/g, ctx.body ?? "{{body}}")
    .replace(/\{([^{}\n]+)\}/g, (m, name: string) => ctx.values[name] ?? m);
}
