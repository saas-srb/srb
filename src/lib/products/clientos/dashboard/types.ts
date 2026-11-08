/** Client-safe dashboard model — plain serialisable data only (no server-only imports). */

export type DashboardKind = "student" | "client" | "business" | "hiring";

export type IconKey =
  | "trending" | "calendar" | "award" | "clipboard" | "wallet" | "coins" | "gift" | "users" | "folder" | "flag"
  | "receipt" | "briefcase" | "file" | "clock" | "check" | "alert" | "book" | "chart" | "message" | "target"
  | "sparkles" | "bell" | "shield";

export type Tone = "default" | "good" | "warn" | "bad";
export type ValueFormat = "number" | "currency" | "percent" | "credits" | "text";

export interface Kpi {
  id: string;
  label: string;
  value: number | string;
  format: ValueFormat;
  icon: IconKey;
  href?: string;
  hint?: string;
  tone?: Tone;
  /** Change vs the previous comparable period, when it can be measured honestly. */
  delta?: { pct: number; label: string };
}

export interface TimeSeriesSpec {
  key: string;
  label: string;
  color: "primary" | "coral" | "blue" | "green";
}

export interface ChartCategory {
  name: string;
  value: number;
  href?: string;
}

export interface ChartDef {
  id: string;
  title: string;
  subtitle?: string;
  section: "overview" | "performance" | "money" | "wallet";
  kind: "area" | "bar" | "donut" | "hbar";
  /** Where clicking the chart (or a slice/bar) goes. */
  href?: string;
  /** Time-series charts: rows carry a `date` (yyyy-mm-dd) and numeric keys, and respond to the date-range filter. */
  series?: TimeSeriesSpec[];
  rows?: ({ date: string } & Record<string, number | string>)[];
  /** Categorical charts. */
  categories?: ChartCategory[];
  /** Format of the values for tooltips. */
  format?: ValueFormat;
  emptyText?: string;
}

export interface TableColumn {
  key: string;
  label: string;
  type?: "text" | "number" | "date" | "currency" | "badge";
  align?: "left" | "right";
}

export interface TableRow {
  cells: Record<string, string | number | null>;
  href?: string;
}

export interface TableDef {
  id: string;
  title: string;
  href?: string;
  columns: TableColumn[];
  rows: TableRow[];
  /** Column key holding an ISO date — enables the date-range filter for this table. */
  dateKey?: string;
  exportName: string;
  emptyText?: string;
}

export interface FeedItem {
  id: string;
  kind: "credit" | "spend" | "lead" | "notification" | "message" | "system";
  title: string;
  detail?: string | null;
  at: string;
  href?: string;
}

export interface ActionItem {
  id: string;
  title: string;
  detail?: string;
  href: string;
  priority: "high" | "medium" | "low";
  due?: string;
}

export interface EventItem {
  id: string;
  title: string;
  detail?: string;
  at: string;
  href: string;
  kind: "class" | "deadline" | "interview" | "milestone" | "payment" | "delivery" | "expiry";
}

export interface Insight {
  id: string;
  type: "changed" | "attention" | "good" | "tip";
  title: string;
  body: string;
  href?: string;
}

export interface QuickAction {
  id: string;
  label: string;
  href: string;
  icon: IconKey;
}

export interface Recommendation {
  id: string;
  title: string;
  body: string;
  href: string;
  cta: string;
}

export interface WidgetToggle {
  id: string;
  label: string;
}

export interface DashboardModel {
  kind: DashboardKind;
  title: string;
  subtitle: string;
  /** Extra context shown next to the title (account type / plan). */
  badge?: string;
  kpis: Kpi[];
  charts: ChartDef[];
  tables: TableDef[];
  timeline: FeedItem[];
  pending: ActionItem[];
  completed: FeedItem[];
  upcoming: EventItem[];
  insights: Insight[];
  recommendations: Recommendation[];
  quickActions: QuickAction[];
  notifications: { id: string; title: string; body: string | null; href: string | null; at: string; read: boolean }[];
  unreadCount: number;
  wallet: {
    available: number;
    pending: number;
    locked: number;
    lifetimeEarned: number;
    lifetimeRedeemed: number;
    expiringSoon: number;
    frozen: boolean;
    referral: { total: number; pending: number; rewarded: number; credits: number };
  } | null;
  /** Where the person is in their lead lifecycle (from Lead Management), with what's next. */
  journey?: { code: string; stageLabel: string; steps: { label: string; state: "done" | "current" | "upcoming" | "skipped" }[]; nextLabel: string | null } | null;
  /** Optional notice explaining that part of the dashboard is empty for a legitimate reason. */
  notice?: string;
}
