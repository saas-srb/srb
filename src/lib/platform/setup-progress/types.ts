/**
 * Setup progress: the ONE list of everything a company sets up, and the ONE percentage (pure types; client-safe).
 * A step is derived from real data (`check`), never stored as done. Only these are stored: "Not applicable" marks (optional steps), "Reviewed" marks
 * (steps that cannot be derived), reminder state and a daily snapshot of the percentage for a small trend.
 */
export type Tier = "required" | "recommended" | "optional";
export type StepStatus = "done" | "partial" | "todo" | "notApplicable" | "unknown";

export const TIER_WEIGHT: Record<Tier, number> = { required: 3, recommended: 2, optional: 1 };
/** How much a half-finished step counts, unless the step says how much. */
export const PARTIAL_DEFAULT = 0.5;

export type GroupKey = "company" | "organization" | "people" | "products" | "product_settings" | "integrations" | "branding" | "billing" | "system" | "security" | "engagement";

export const GROUPS: { key: GroupKey; title: string; description: string }[] = [
  { key: "company", title: "Company setup", description: "Who your company is, printed on every document." },
  { key: "organization", title: "Organization", description: "Departments, teams and job titles." },
  { key: "people", title: "People and access", description: "Your team and what each person can open." },
  { key: "products", title: "Products", description: "Which products your company uses." },
  { key: "product_settings", title: "Product settings", description: "Each product you use, set up for your business." },
  { key: "integrations", title: "Integrations", description: "The outside services your products rely on." },
  { key: "branding", title: "Branding and domains", description: "Your logo, web address and sender email." },
  { key: "billing", title: "Plan and billing", description: "Your plan and invoice details." },
  { key: "system", title: "System defaults", description: "Notifications, AI wording, scheduled jobs and letterhead." },
  { key: "security", title: "Security and logs", description: "Sign-in protection, backups and records." },
  { key: "engagement", title: "Engagement", description: "Push notifications and your website chatbot." },
];

/** Where a state check reads from: which group of facts it needs. A group that could not be read makes its steps "unknown", never wrong. */
export type FactGroup = "identity" | "onboarding" | "modules" | "org" | "people" | "connections" | "domain" | "sender" | "branding" | "billing" | "security" | "engagement" | "productSettings" | "usage" | "registry";

export type ConnState = "done" | "partial" | "todo";

export interface SetupFacts {
  /** Groups that could not be read right now (the steps that need them show "Could not check"). */
  failed: FactGroup[];
  now: Date;
  identity?: { values: Record<string, string | number>; saved: boolean };
  onboarding?: { completedSteps: string[] };
  /** Module keys that count: switched on by the company, in the plan, and not switched off by the platform. */
  modules?: { on: string[] };
  org?: { departments: number; teams: number; designations: number };
  people?: { active: number; directors: number; pendingInvites: number; staffWithAccess: number };
  /** One entry per Integrations card key. */
  connections?: Record<string, { state: ConnState; detail: string }>;
  domain?: { customVerified: boolean; customPending: boolean };
  sender?: { status: "none" | "pending" | "verified" | "failed" };
  branding?: { logo: boolean };
  billing?: { internal: boolean; status: string; hasPlan: boolean; hasBillingDetails: boolean; trialDaysLeft: number | null; paying: boolean };
  security?: { directors: number; directorsWithTwoStep: number; emailVerified: boolean; backups: number };
  engagement?: { pushReady: boolean; knowledgeItems: number };
  /** Module key to "someone saved this product's settings". */
  productSettings?: Record<string, boolean>;
  /** Module key to how many first records exist (employees, clients, vendors, leads, procedures, invoices). */
  usage?: Record<string, number>;
  /** Module key to the connection ids its registry row declares. */
  registry?: Record<string, string[]>;
  marks: Marks;
}

export interface Marks {
  reviewed: Record<string, { at: string; by: string | null }>;
  notApplicable: Record<string, { reason: string; at: string; by: string | null }>;
}
export const NO_MARKS: Marks = { reviewed: {}, notApplicable: {} };

export interface StepResult { status: StepStatus; detail: string; /** For "partial": how much it counts, 0 to 1. */ fraction?: number }

export interface StepDef {
  id: string;
  group: GroupKey;
  /** The module key of the product this step belongs to (only counted while the product is on). */
  product?: string;
  title: string;
  /** One plain sentence. */
  description: string;
  why: string;
  tier: Tier;
  minutes: number;
  /** The page, and where it matters the right-hand panel, that completes it. */
  href: string;
  /** The Workspace item (nav key) whose access completes it: the button is locked for people without it. */
  feature: string;
  /** Other step ids that should come first. */
  dependsOn?: string[];
  /** Cannot be derived from data: a Director marks it reviewed. */
  manual?: boolean;
  /** What this step covers, for the coverage test: `onboarding:<key>`, `integration:<card>`, `product:<slug>`, `nav:<key>`. */
  covers: string[];
  /** The fact groups the check reads. */
  needs: FactGroup[];
  /** Extra condition for the step to count at all (besides the product being on). */
  applies?: (f: SetupFacts) => boolean;
  check: (f: SetupFacts) => StepResult;
}

export interface StepState {
  id: string;
  group: GroupKey;
  product?: string;
  title: string;
  description: string;
  why: string;
  tier: Tier;
  weight: number;
  minutes: number;
  href: string;
  feature: string;
  manual: boolean;
  status: StepStatus;
  detail: string;
  /** What it counts as in the percentage, 0 to 1 (null when it is not counted). */
  score: number | null;
  /** "Reviewed" or "Not applicable" was set by a person. */
  mark: "reviewed" | "notApplicable" | null;
  canMarkNotApplicable: boolean;
  blockedBy: string[];
}

export interface ProgressSummary {
  percent: number;
  complete: boolean;
  /** Steps that count (not "not applicable", not "could not check"). */
  applicable: number;
  done: number;
  partial: number;
  todo: number;
  notApplicable: number;
  unknown: number;
  minutesLeft: number;
  groups: { key: GroupKey; title: string; percent: number; done: number; applicable: number }[];
  products: { module: string; percent: number; done: number; applicable: number }[];
}

export interface SetupProgress { steps: StepState[]; summary: ProgressSummary; next: StepState[]; computedAt: string }
