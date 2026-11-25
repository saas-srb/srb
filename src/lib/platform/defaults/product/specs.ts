import { docName, rateId, type ProductSpec, type SettingDef } from "@/lib/platform/defaults/product/model";
import { DEFAULT_MODELS } from "@/lib/products/agentos/constants";
import { IMAGE_QUALITIES } from "@/lib/products/viralpulse-ai/image-pricing-core";
import { DEFAULT_PROJECT_CATEGORIES } from "@/lib/products/sprintos/constants";
import { DEFAULT_CERTIFICATE_NUMBER_FORMAT, DEFAULT_PROGRAM_TECHNOLOGIES } from "@/lib/products/cohort-ai/constants";

const int = (key: string, label: string, builtIn: number, min: number, max: number, help?: string): SettingDef => ({ key, label, type: "integer", builtIn, min, max, help });
const num = (key: string, label: string, builtIn: number, min: number, max: number, help?: string): SettingDef => ({ key, label, type: "number", builtIn, min, max, help });
const yes = (key: string, label: string, builtIn: boolean, help?: string): SettingDef => ({ key, label, type: "boolean", builtIn, help });
const time = (key: string, label: string, builtIn: string): SettingDef => ({ key, label, type: "time", builtIn });
const pick = (key: string, label: string, builtIn: string, options: [string, string][], help?: string): SettingDef => ({ key, label, type: "select", builtIn, options: options.map(([value, text]) => ({ value, label: text })), help });
const list = (key: string, label: string, builtIn: string[], max = 100, required = false): SettingDef => ({ key, label, type: "list", builtIn, max, required, help: "One per line." });
const currency = (builtIn = "INR"): SettingDef => pick("defaultCurrency", "Currency for new records", builtIn, ["INR", "USD", "EUR", "GBP", "AUD", "CAD", "SGD", "AED"].map((c) => [c, c]));
const model = (key: string, label: string, builtIn: string): SettingDef => ({ key, label, type: "text", builtIn, max: 64, required: true });
const days = (key: string, label: string, builtIn: number[], options: [number, string][], required = false): SettingDef => ({ key, label, type: "days", builtIn, required, options: options.map(([v, text]) => ({ value: String(v), label: text })) });

/**
 * Every product whose settings the platform may default, with exactly the fields it may default (pure, client-safe). What is NOT here is never a
 * platform default: who the company is, its registrations, signatories, bank accounts, people, keys and statutory policy and rates.
 */
export const PRODUCT_SPECS: ProductSpec[] = [
  {
    key: "talentos", name: "TalentOS", category: "people", description: "Work schedule and how pay days, overtime and claims are counted.",
    docs: [
      {
        collection: "hrms_settings", docId: "org", title: "Work schedule",
        settings: [
          days("workingDays", "Working days", [1, 2, 3, 4, 5], [[0, "Sunday"], [1, "Monday"], [2, "Tuesday"], [3, "Wednesday"], [4, "Thursday"], [5, "Friday"], [6, "Saturday"]], true),
          days("saturdayOffs", "Saturdays off in a month", [], [[1, "1st"], [2, "2nd"], [3, "3rd"], [4, "4th"], [5, "5th"]]),
          time("shiftStart", "Shift starts", "09:30"),
          time("shiftEnd", "Shift ends", "18:30"),
          int("graceMinutes", "Grace period (minutes)", 15, 0, 240),
          int("earlyDepartureMinutes", "Early departure allowance (minutes)", 15, 0, 240),
          num("halfDayHours", "Hours for a half day", 4, 0.5, 24),
          num("fullDayHours", "Hours for a full day", 8, 1, 24),
        ],
      },
      {
        collection: "hrms_payroll_config", docId: "org", title: "Pay policy",
        settings: [
          pick("paidDaysBasis", "A day's pay is the month's pay over", "calendar", [["calendar", "Calendar days"], ["working", "Working days"], ["fixed", "A fixed number of days"]]),
          int("fixedDays", "Fixed number of days", 30, 20, 31),
          pick("sandwichRule", "Weekly offs between days without pay", "none", [["none", "Paid"], ["unpaid_leave", "Unpaid after unpaid leave"], ["all_lop", "Unpaid after any loss of pay"]]),
          pick("unmarkedDay", "A working day with no attendance", "lop", [["lop", "Not paid"], ["present", "Paid"]]),
          int("lateMarksPerHalfDay", "Late marks that cost half a day (0 = never)", 0, 0, 31),
          yes("overtimeEnabled", "Pay overtime", false),
          yes("overtimeRequiresApproval", "Overtime needs a manager's approval", true),
          int("overtimeMaxMinutesPerDay", "Most overtime in a day (minutes)", 240, 30, 720),
          int("overtimeMaxMinutesPerMonth", "Most overtime in a month (minutes)", 3000, 60, 20000),
          num("overtimeMultiplier", "Overtime rate (times normal pay)", 2, 1, 4),
          num("holidayWorkMultiplier", "Holiday work rate (times normal pay)", 2, 1, 4),
          num("hoursPerDay", "Hours in a working day", 8, 1, 24),
          int("shortLeavesPerMonth", "Short leaves in a month", 2, 0, 10),
          int("shortLeaveMaxMinutes", "Longest short leave (minutes)", 240, 30, 480),
          int("expenseMaxAgeDays", "Days to file an expense claim", 60, 7, 365),
        ],
      },
    ],
    check: (v) => (String(v.shiftEnd) <= String(v.shiftStart) ? "The shift must end after it starts." : Number(v.halfDayHours) >= Number(v.fullDayHours) ? "Half-day hours must be less than full-day hours." : null),
  },
  {
    key: "cashflow-ai", name: "CashFlow", category: "finance", description: "Starting payment limits and the list of tax rates.",
    docs: [
      {
        collection: "fms_payment_controls", docId: "main", title: "Payment limits",
        settings: [
          int("perPayoutMax", "Most for one payment (Rs)", 1_000_000, 1000, 100_000_000),
          int("dailyMax", "Most for a day (Rs)", 2_500_000, 1000, 1_000_000_000),
          int("salaryDailyMax", "Most in salaries for a day (Rs)", 10_000_000, 1000, 10_000_000_000),
          int("approvalThreshold", "Second person approves from (Rs)", 100_000, 0, 100_000_000),
          int("payeeHoldHours", "Hours new bank details wait before payment", 24, 0, 168),
        ],
      },
      { collection: "fms_tax_config", docId: "org", title: "Tax rates", settings: [{ key: "rates", label: "Tax rates offered on entries", type: "rates", builtIn: ([["GST 18%", 18], ["GST 12%", 12], ["GST 5%", 5], ["No Tax", 0]] as const).map(([name, ratePercent]) => ({ id: rateId(name), name, ratePercent, isActive: true })), help: "One per line as Name | percent. A convenience list, not a tax rulebook." }] },
    ],
    check: (v) => (Number(v.dailyMax) < Number(v.perPayoutMax) ? "The daily limit cannot be below the limit for one payment." : Number(v.approvalThreshold) > Number(v.perPayoutMax) ? "Approval must start at or below the limit for one payment." : null),
  },
  {
    key: "spendiq", name: "SpendIQ", category: "finance", description: "Approval amounts, currency and item suggestions for purchase requests.",
    docs: [{ collection: "prms_settings", docId: "config", title: "Purchasing", settings: [currency(), int("procurementReviewThreshold", "Second approval from (amount)", 50000, 0, 1_000_000_000), int("financeNotifyThreshold", "Tell finance from (amount)", 200000, 0, 1_000_000_000), list("itemSuggestions", "Item suggestions", [], 200)] }],
  },
  {
    key: "sprintos", name: "SprintOS", category: "delivery", description: "Project categories, technology suggestions and currency.",
    docs: [{ collection: "pms_settings", docId: "config", title: "Projects", settings: [list("categories", "Project categories", [...DEFAULT_PROJECT_CATEGORIES], 100, true), list("technologySuggestions", "Technology suggestions", ["Next.js", "React", "TypeScript", "Node.js", "Python", "PostgreSQL", "MongoDB", "Tailwind CSS", "AWS", "Docker", "Kubernetes", "React Native", "Flutter", "FastAPI", "TensorFlow", "PyTorch", "Redis", "GraphQL"]), currency()] }],
  },
  {
    key: "cohort-ai", name: "Cohort AI", category: "learning", description: "Program tracks, class length, certificate numbers and currency.",
    docs: [{ collection: "training_settings", docId: "config", title: "Programs", settings: [list("technologySuggestions", "Program track suggestions", [...DEFAULT_PROGRAM_TECHNOLOGIES]), currency(), { key: "certificateNumberFormat", label: "Certificate number format", type: "text", builtIn: DEFAULT_CERTIFICATE_NUMBER_FORMAT, max: 80, required: true, help: "{n} is the running number, {yyyy} the year." }, int("defaultClassDurationMinutes", "Usual class length (minutes)", 90, 1, 600)] }],
    check: (v) => (String(v.certificateNumberFormat).includes("{n}") ? null : "The certificate number format must contain {n}."),
  },
  {
    key: "playbook-ai", name: "Playbook", category: "ai", description: "Approval of your own documents, AI drafting limits and SOP reminders.",
    docs: [
      {
        collection: "pb_settings", docId: "main", title: "Documents",
        settings: [
          yes("approval.default.requireDifferentApprover", "Someone else must approve a document", false),
          yes("approval.default.autoApproveOwn", "An author's own document is approved when submitted", true),
          yes("ai.enabled", "AI drafting", true),
          int("ai.perUserPerMinute", "AI drafts per person per minute", 6, 1, 60),
          int("ai.perUserPerDay", "AI drafts per person per day", 100, 1, 5000),
          int("ai.perCompanyPerDay", "AI drafts per company per day", 1000, 1, 100000),
          int("ai.maxOutputTokens", "Longest AI draft (tokens)", 4000, 500, 16000),
        ],
      },
      {
        collection: "sop_settings", docId: "main", title: "SOPs",
        settings: [int("expiringSoonDays", "Days before a review counts as expiring soon", 30, 1, 365), int("defaultReviewMonths", "Months between reviews", 12, 1, 60), int("defaultDueDays", "Days to finish an assignment", 14, 1, 365), yes("reackOnNewVersion", "Ask people to confirm a new version again", true), int("reminderRepeatDays", "Days between reminders", 3, 1, 60), yes("defaultAllowDownload", "New SOPs may be downloaded", true)],
      },
    ],
  },
  {
    key: "agentos", name: "AgentOS", category: "ai", description: "Chat limits, the usual model and calling limits.",
    docs: [
      {
        collection: "aibots_settings", docId: "main", title: "Chat",
        settings: [pick("defaultModel", "Model for new bots and chats", DEFAULT_MODELS[0].id, DEFAULT_MODELS.map((m) => [m.id, m.label])), int("maxOutputTokens", "Longest reply (tokens)", 4000, 256, 32000), int("dailyMessageLimit", "Messages per person per day (0 = no limit)", 200, 0, 10000)],
      },
      {
        collection: "agentos_call_settings", docId: "main", filter: { kind: "main" }, title: "Calls",
        settings: [
          time("windowStart", "Calls may start from", "09:00"), time("windowEnd", "Calls must start before", "21:00"),
          int("duplicateWindowMinutes", "Minutes before the same number can be called again", 30, 0, 1440),
          int("perUserHourlyCap", "Calls per person per hour", 20, 1, 1000), int("perCompanyHourlyCap", "Calls per company per hour", 100, 1, 1000),
          pick("callMode", "How calls are connected", "auto", [["auto", "Automatic"], ["conference", "Conference"], ["direct", "Direct"]]),
          int("publicDailyMinutes", "Website call minutes per day", 30, 0, 10000), int("publicPerIpHourly", "Website calls per visitor per hour", 3, 1, 1000), int("publicPerAgentHourly", "Website calls per agent per hour", 30, 1, 1000), int("publicMaxSessionSecs", "Longest website call (seconds)", 300, 30, 3600),
          yes("maskInboundNumbers", "Mask callers' numbers in lists", true),
        ],
      },
    ],
    check: (v) => (String(v.windowEnd) <= String(v.windowStart) ? "The calling window must end after it starts." : null),
  },
  {
    key: "evaliq", name: "EvalIQ", category: "learning", description: "Certificate numbers, validity, reminders and the time allowance.",
    docs: [{ collection: "ots_settings", docId: "global", title: "Assessments", settings: [{ key: "certificateNumberFormat", label: "Certificate number format", type: "text", builtIn: "EvalIQ-{yyyy}-{n}", max: 60, required: true, help: "{n} is the running number, {yyyy} the year." }, int("defaultValidityMonths", "Months a certificate stays valid (0 = always)", 24, 0, 240), int("reminderHoursBeforeDue", "Hours before the deadline to remind", 24, 1, 336), int("graceSeconds", "Seconds allowed after time runs out", 20, 0, 120)] }],
    check: (v) => (String(v.certificateNumberFormat).includes("{n}") ? null : "The certificate number format must contain {n}."),
  },
  {
    key: "viralpulse-ai", name: "ViralPulse", category: "marketing", description: "AI models and limits, studio spend limits, publishing and metrics.",
    docs: [
      {
        collection: "smms_settings", docId: "main", title: "AI and studios",
        settings: [
          model("ai.textModel", "Text model", "gpt-6-luna"), model("ai.imageModel", "Image model", "gpt-image-2.5-flare"),
          pick("ai.imageQuality", "Image quality", "medium", [...IMAGE_QUALITIES].map((q) => [q, q])),
          num("ai.temperature", "Creativity (temperature)", 0.8, 0, 2), int("ai.maxOutputTokens", "Longest AI text (tokens)", 6000, 1000, 32000), int("ai.dailyGenerationLimit", "AI generations per person per day (0 = no limit)", 150, 0, 5000),
          yes("images.enabled", "Image Studio", true), pick("images.defaultQuality", "Image Studio quality", "medium", [...IMAGE_QUALITIES].map((q) => [q, q])), int("images.maxVariants", "Most image variants at once", 4, 1, 4), int("images.perUserPerMinute", "Images per person per minute", 8, 1, 60), num("images.dailySpendCapUsd", "Image spend per day (USD)", 20, 0, 100000), num("images.approvalThresholdUsd", "Image run needs approval from (USD)", 2, 0, 100000),
          yes("ugc.enabled", "AI UGC Studio", true), num("ugc.dailySpendCapUsd", "Video spend per day (USD)", 25, 0, 100000), num("ugc.approvalThresholdUsd", "Video run needs approval from (USD)", 5, 0, 100000), int("ugc.maxConcurrentJobs", "Videos rendering at once", 3, 1, 20), int("ugc.maxAttemptsPerScene", "Attempts per scene", 3, 1, 6),
        ],
      },
      { collection: "smms_settings", docId: "publishing", id: "smms_settings:publishing", title: "Publishing", settings: [int("batchCap", "Posts started per run", 10, 1, 50)] },
      {
        collection: "smms_metric_settings", docId: "main", filter: {}, title: "Metrics",
        settings: [int("retentionDays", "Days metrics are kept", 730, 90, 3650), int("recentPostDays", "Days a post counts as recent", 14, 1, 60), int("olderPostDays", "Days older posts are still read", 180, 7, 730), int("youtubeDailyUnitCap", "YouTube quota units per day", 3000, 100, 10000), int("x.maxPostsPerRun", "X posts read per run", 25, 1, 200), int("x.minHoursBetween", "Hours between X reads", 24, 1, 168)],
      },
    ],
  },
  {
    key: "rankmax-ai", name: "RankMax", category: "marketing", description: "Crawl limits, page quality thresholds and search defaults.",
    docs: [
      {
        collection: "seo_settings", docId: "global", title: "Audits",
        settings: [
          int("crawl.maxPages", "Pages per audit", 300, 10, 2000), int("crawl.concurrency", "Pages read at once", 5, 1, 10), int("crawl.timeoutMs", "Page timeout (milliseconds)", 15000, 3000, 60000), yes("crawl.checkExternalLinks", "Check links to other sites", true), int("crawl.maxExternalChecks", "External links checked", 150, 0, 1000),
          int("thresholds.titleMin", "Shortest good title", 30, 10, 100), int("thresholds.titleMax", "Longest good title", 60, 30, 120), int("thresholds.descriptionMin", "Shortest good description", 70, 20, 200), int("thresholds.descriptionMax", "Longest good description", 160, 80, 400), int("thresholds.thinContentWords", "Words below which a page is thin", 300, 50, 3000), int("thresholds.slowResponseMs", "Slow page from (milliseconds)", 1500, 200, 20000), int("thresholds.staleContentDays", "Days before content is stale", 365, 30, 3650), int("thresholds.minInternalLinksIn", "Links a page should receive", 3, 1, 50),
          pick("defaults.device", "Device", "desktop", [["desktop", "Desktop"], ["mobile", "Mobile"]]), pick("integrations.psi.strategy", "Speed check device", "mobile", [["desktop", "Desktop"], ["mobile", "Mobile"]]), yes("integrations.psi.enabled", "Speed checks", true),
        ],
      },
    ],
    check: (v) => (Number(v["thresholds.titleMin"]) >= Number(v["thresholds.titleMax"]) || Number(v["thresholds.descriptionMin"]) >= Number(v["thresholds.descriptionMax"]) ? "Each shortest length must be below the longest." : null),
  },
  {
    key: "cybervault", name: "CyberVault", category: "security", description: "Expiry warnings for documents and licences.",
    docs: [{ collection: "dlms_settings", docId: "main", title: "Expiry alerts", settings: [int("warnDays", "Days before expiry that count as expiring soon", 30, 1, 365), yes("alertsEnabled", "Send expiry alerts", true)] }],
  },
];

export const productSpec = (key: string): ProductSpec | null => PRODUCT_SPECS.find((p) => p.key === key) ?? null;

export function settingsDoc(productKey: string, collection: string) {
  const doc = productSpec(productKey)?.docs.find((d) => docName(d) === collection);
  if (!doc) throw new Error(`No default-able settings registered for ${productKey}/${collection}`);
  return doc;
}
