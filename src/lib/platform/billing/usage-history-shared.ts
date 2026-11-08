/** Types and labels for the Usage & limits page (shared by the server loaders and the client charts). */

export const USAGE_METRIC_KEYS = ["ai", "storage", "emails", "voice", "seats", "domains"] as const;
export type UsageMetricKey = (typeof USAGE_METRIC_KEYS)[number];
export const isUsageMetricKey = (v: unknown): v is UsageMetricKey => typeof v === "string" && (USAGE_METRIC_KEYS as readonly string[]).includes(v);

export interface MetricMeta {
  key: UsageMetricKey;
  label: string;
  short: string;
  unit: string;
  limitKey: string;
  /** monthly = resets on the 1st; stock = what you hold right now (storage, seats, domains). */
  kind: "monthly" | "stock";
  provider: string | null;
  /** What counts, in plain words. */
  counts: string;
  /** What happens when the limit is reached. */
  atLimit: string;
  /** What to do about it. */
  fix: string;
}

export const METRICS: Record<UsageMetricKey, MetricMeta> = {
  ai: {
    key: "ai", label: "AI tokens", short: "AI", unit: "tokens", limitKey: "aiTokensPerMonth", kind: "monthly", provider: "OpenAI",
    counts: "Every AI request your workspace makes: the AI-written website, the Ask AI assistant, the website chatbot, AI Bots, AI Intelligence, knowledge-base indexing, writing and image tools. Reading the question and writing the answer both count.",
    atLimit: "AI features pause for everyone until the 1st of next month. The rest of the product keeps working.",
    fix: "Upgrade your plan in Settings → Billing for a bigger monthly allowance.",
  },
  storage: {
    key: "storage", label: "File storage", short: "Storage", unit: "MB", limitKey: "storageMb", kind: "stock", provider: "Vercel Blob",
    counts: "Every file you upload: documents, resumes, chat attachments, support attachments, test media, website images and voice recordings. Deleting a file gives its space back.",
    atLimit: "New uploads are refused until you delete files or upgrade. Existing files stay available.",
    fix: "Delete files you no longer need, or upgrade your plan for more space.",
  },
  emails: {
    key: "emails", label: "Emails sent", short: "Emails", unit: "emails", limitKey: "emailsPerMonth", kind: "monthly", provider: "Email provider",
    counts: "Every email your workspace sends: invitations, invoices, reminders, notifications and automations.",
    atLimit: "Emails stop sending until the 1st of next month (the action that triggered them still completes).",
    fix: "Upgrade your plan for a bigger monthly email allowance.",
  },
  voice: {
    key: "voice", label: "Voice minutes", short: "Voice", unit: "minutes", limitKey: "voiceMinutesPerMonth", kind: "monthly", provider: "ElevenLabs",
    counts: "Time spent on the website voice assistant: visitors speaking to it and the assistant speaking back.",
    atLimit: "Voice mode pauses until the 1st of next month; text chat is not affected.",
    fix: "Upgrade your plan for more voice minutes.",
  },
  seats: {
    key: "seats", label: "Users (seats)", short: "Seats", unit: "users", limitKey: "seats", kind: "stock", provider: null,
    counts: "Active accounts that can sign in (staff and employees). Training students don't take a seat on team plans; a one-person plan has no seat for anyone else. Pending invitations are held against the limit.",
    atLimit: "No more people can be added or invited until someone is deactivated or you upgrade.",
    fix: "Deactivate people who left, or upgrade your plan to add your team.",
  },
  domains: {
    key: "domains", label: "Custom domains", short: "Domains", unit: "domains", limitKey: "customDomains", kind: "stock", provider: "Hosting provider",
    counts: "Your own domains connected to the website or the app (the free address that comes with your workspace doesn't count).",
    atLimit: "You can't connect another domain until you remove one or upgrade.",
    fix: "Remove a domain you don't use, or upgrade your plan.",
  },
};

export type Level = "ok" | "near" | "over";

export interface MetricOverview {
  key: UsageMetricKey;
  label: string;
  unit: string;
  used: number;
  limit: number | null;
  remaining: number | null;
  percent: number;
  level: Level;
  comingSoon: boolean;
  /** Where a monthly meter will end the month at this month's pace (null = too early / no use / unlimited-unknown). */
  projected: number | null;
  projectedPercent: number | null;
  /** True when, at this pace, the monthly allowance runs out before it resets. */
  willRunOut: boolean;
}

export interface UsageOverview {
  plan: { name: string | null; status: string; trialDaysLeft: number | null; unlimited: boolean };
  period: { key: string; label: string; startsOn: string; resetsOn: string; dayOfPeriod: number; daysTotal: number; daysLeft: number };
  metrics: MetricOverview[];
  /** First day detailed history exists for the non-AI meters (earlier months show monthly totals only). */
  historySince: string | null;
}

export interface UsageEventRow {
  at: string;
  source: string;
  detail: string;
  /** In the meter's display unit (tokens, MB, emails, minutes, messages); storage is signed. */
  value: number;
  /** AI only. */
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  estimated?: boolean;
  /** Who did it (name and email, or "Website visitors" / "Automatic"); empty on rows from before per-person history. */
  by?: string;
  byKey?: string;
}

export interface SeriesPoint { date: string; label: string; value: number }
export interface SourceRow { source: string; value: number; share: number; count: number }
export interface ModelRow { model: string; value: number; calls: number; inputTokens: number; outputTokens: number }
export interface MonthRow { period: string; label: string; value: number; limit: number | null; current: boolean }

/** One person's (or visitor group's / system's) share of one meter. */
export interface ActorShareRow { key: string; label: string; kind: string; value: number; share: number; count: number }

/** The key and label used for use that was recorded before per-person history began. */
export const UNATTRIBUTED_KEY = "unknown";
export const UNATTRIBUTED_LABEL = "Not recorded (before per-person history)";

export interface PeopleUsageRow {
  key: string;
  label: string;
  kind: string;
  /** AI tokens, with how many requests and what they mostly used. */
  ai: number;
  aiCalls: number;
  topFeature: string | null;
  emails: number;
  voiceMinutes: number;
  /** MB uploaded (removals aren't counted against the person who uploaded). */
  storageMb: number;
  lastAt: string | null;
  /** Share of the company's AI tokens this month, 0–100. */
  aiShare: number;
}

export interface PeopleUsage {
  period: string;
  periodLabel: string;
  rows: PeopleUsageRow[];
  totals: { ai: number; emails: number; voiceMinutes: number; storageMb: number };
}

export interface PersonDetail {
  key: string;
  label: string;
  kind: string;
  period: string;
  periodLabel: string;
  /** This person's use of each monthly meter, with the company's total and the person's share. */
  meters: { key: UsageMetricKey; label: string; unit: string; value: number; companyTotal: number; share: number }[];
  daily: SeriesPoint[];
  months: MonthRow[];
  bySource: SourceRow[];
  byModel: ModelRow[];
  events: UsageEventRow[];
  eventsTruncated: boolean;
}

export interface PersonRow { email: string; roles: string; joined: string; lastLogin: string | null; status: "active" | "pending" }
export interface DomainRow { host: string; status: string; added: string; primary: boolean }

export interface MetricDetail {
  key: UsageMetricKey;
  period: string;
  periodLabel: string;
  periods: { key: string; label: string }[];
  isCurrentPeriod: boolean;
  unit: string;
  limit: number | null;
  /** Total in the period (monthly meters) or what is held at the end of it (stock meters). */
  total: number;
  calls: number;
  peak: { date: string; value: number } | null;
  averagePerDay: number;
  daily: SeriesPoint[];
  cumulative: SeriesPoint[];
  bySource: SourceRow[];
  byModel: ModelRow[];
  /** Who used it (monthly meters and storage). */
  byPerson: ActorShareRow[];
  inputTokens: number;
  outputTokens: number;
  months: MonthRow[];
  events: UsageEventRow[];
  eventsTruncated: boolean;
  people: PersonRow[];
  domains: DomainRow[];
  /** Why part of the history is missing, in plain words (null = complete). */
  historyNote: string | null;
}

/** Friendly names for the storage folders. */
export const STORAGE_SOURCE_LABELS: Record<string, string> = {
  "cms/uploads": "Website media library", ots: "Online-test media", support: "Support attachments", resumes: "Job-application resumes", kb: "Chatbot knowledge base",
  "hrms-documents": "HR documents", hrms: "HR documents", pms: "Project documents", "pms-attachments": "Project task attachments", sop: "SOP files", dlms: "Digi Locker files",
  messenger: "Team chat attachments", voice: "Voice recordings", "smms/media": "Social-media library", smms: "Social-media library", "lead-message-files": "Lead message attachments",
  prms: "Procurement attachments", fms: "Finance attachments", lpms: "Legal documents", aibots: "AI Bots files", branding: "Brand logo",
};
export function storageSourceLabel(folder: string): string {
  if (STORAGE_SOURCE_LABELS[folder]) return STORAGE_SOURCE_LABELS[folder];
  const top = folder.split("/")[0];
  if (STORAGE_SOURCE_LABELS[top]) return STORAGE_SOURCE_LABELS[top];
  return folder.replace(/[-_/]+/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}
