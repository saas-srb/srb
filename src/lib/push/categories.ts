/** Notification categories a person can switch on or off. Client-safe (no data access). */

export const PUSH_CATEGORIES = ["business", "reminders", "alerts", "workflow", "ai", "messages", "system"] as const;
export type PushCategory = (typeof PUSH_CATEGORIES)[number];

export const PUSH_CATEGORY_META: Record<PushCategory, { label: string; description: string; urgent?: boolean }> = {
  business: { label: "Business events", description: "Leads, invoices and payments, leave requests, projects and tasks, training and procurement." },
  reminders: { label: "Reminders", description: "Due dates, expiries, renewals, acknowledgements and other things waiting on you." },
  alerts: { label: "Alerts", description: "Overdue items, failures, rejections and security notices. These ignore quiet hours.", urgent: true },
  workflow: { label: "Workflow updates", description: "Messages from your company's automations and approvals." },
  ai: { label: "AI activity", description: "AI assistants, generated content and completed AI tasks." },
  messages: { label: "Messages and calls", description: "Team chat messages, mentions, channel invites and incoming calls." },
  system: { label: "System notifications", description: "Announcements, maintenance notices and account or plan updates." },
};

export interface QuietHours {
  enabled: boolean;
  /** `HH:mm`, in `timezone`. */
  start: string;
  end: string;
  /** IANA time zone, e.g. `Asia/Kolkata`. */
  timezone: string;
}

/** Email is a separate channel with its own switches: some things are worth a push but not an inbox, and the other way round. */
export interface EmailPreferences {
  /** Master switch: off = no notification emails at all (sign-in codes, invoices and invitations are not notifications and still arrive). */
  enabled: boolean;
  categories: Record<PushCategory, boolean>;
}

export interface PushPreferences {
  /** Master switch: off = this person gets no push at all (the in-app bell is unaffected). */
  enabled: boolean;
  categories: Record<PushCategory, boolean>;
  quietHours: QuietHours;
  email: EmailPreferences;
}

export const DEFAULT_PREFERENCES: PushPreferences = {
  enabled: true,
  categories: { business: true, reminders: true, alerts: true, workflow: true, ai: true, messages: true, system: true },
  quietHours: { enabled: false, start: "22:00", end: "07:00", timezone: "UTC" },
  // Email by default for what needs someone's attention. Chat messages and AI activity are in-app/push only (an inbox would drown in them).
  email: { enabled: true, categories: { business: true, reminders: true, alerts: true, workflow: true, ai: false, messages: false, system: true } },
};

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Validates untrusted input into a complete preferences object (unknown keys dropped, missing ones defaulted). */
export function normalizePreferences(input: unknown): PushPreferences {
  const raw = (input && typeof input === "object" ? input : {}) as Partial<PushPreferences> & { categories?: Record<string, unknown>; quietHours?: Partial<QuietHours>; email?: { enabled?: unknown; categories?: Record<string, unknown> } };
  const categories = { ...DEFAULT_PREFERENCES.categories };
  for (const key of PUSH_CATEGORIES) if (typeof raw.categories?.[key] === "boolean") categories[key] = raw.categories[key] as boolean;
  const emailCategories = { ...DEFAULT_PREFERENCES.email.categories };
  for (const key of PUSH_CATEGORIES) if (typeof raw.email?.categories?.[key] === "boolean") emailCategories[key] = raw.email.categories[key] as boolean;
  const q: Partial<QuietHours> = raw.quietHours ?? {};
  let timezone = DEFAULT_PREFERENCES.quietHours.timezone;
  if (typeof q.timezone === "string") {
    try {
      new Intl.DateTimeFormat("en", { timeZone: q.timezone });
      timezone = q.timezone;
    } catch {
      /* keep the default */
    }
  }
  return {
    enabled: typeof raw.enabled === "boolean" ? raw.enabled : true,
    categories,
    quietHours: {
      enabled: q.enabled === true,
      start: typeof q.start === "string" && TIME_RE.test(q.start) ? q.start : DEFAULT_PREFERENCES.quietHours.start,
      end: typeof q.end === "string" && TIME_RE.test(q.end) ? q.end : DEFAULT_PREFERENCES.quietHours.end,
      timezone,
    },
    email: { enabled: typeof raw.email?.enabled === "boolean" ? raw.email.enabled : true, categories: emailCategories },
  };
}

/** Whether `now` falls inside the quiet window (which may wrap past midnight). */
export function inQuietHours(q: QuietHours, now = new Date()): boolean {
  if (!q.enabled || q.start === q.end) return false;
  let hhmm: string;
  try {
    hhmm = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: q.timezone }).format(now);
  } catch {
    return false;
  }
  const t = hhmm.replace(/^24/, "00");
  return q.start < q.end ? t >= q.start && t < q.end : t >= q.start || t < q.end;
}

/**
 * Picks a category for a stored notification type. Callers that know better pass the category explicitly; this is the
 * fallback for the many product-specific type names (`leave_requested`, `sop_overdue`, `test_assigned`, …).
 */
export function categorizeType(type: string | null | undefined): PushCategory {
  const t = (type ?? "").toLowerCase();
  if (/(fail|error|alert|breach|reject|declin|critical|locked|overdue|suspend|blocked|violation|security)/.test(t)) return "alerts";
  if (/(expir|due|remind|deadline|renew|birthday|probation|ending|pending|acknowledg|upcoming|schedule)/.test(t)) return "reminders";
  if (/(^ai|_ai|bot|generat|intelligence|assistant)/.test(t)) return "ai";
  if (/(message|mention|chat|call|channel|file_shared|dm)/.test(t)) return "messages";
  if (/(announce|maintenance|system|plan|billing|trial|account|welcome)/.test(t)) return "system";
  if (/(workflow|automation|approval)/.test(t)) return "workflow";
  return "business";
}
