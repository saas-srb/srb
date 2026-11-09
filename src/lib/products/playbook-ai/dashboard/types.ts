/**
 * Playbook dashboard: the rows the aggregation reads and the numbers it returns. Client-safe (plain data, dates as epoch milliseconds), so the
 * pure aggregation in `compute.ts` can be unit-tested and the charts can render the result without any server module.
 */

import type { PbFilterOptions, PbFilters } from "@/lib/products/playbook-ai/dashboard/filters";

export type DashKind = "sop" | "document" | "kpi";
export type DashDocStatus = "draft" | "in_review" | "approved" | "issued" | "archived";
export type DashSendStatus = "clone_draft" | "ready" | "sent" | "viewed" | "partially_signed" | "signed" | "declined" | "expired" | "voided";

export interface DocRow {
  id: string;
  title: string;
  kind: DashKind;
  status: DashDocStatus;
  createdAt: number;
  updatedAt: number;
  createdBy: string | null;
  department: string;
  /** Catalogue category label (or the kind's name for items that have none). */
  category: string;
  /** The library entry or catalogue type it was made from; null for a document written from scratch. */
  templateId: string | null;
  templateName: string | null;
  versionSeq: number;
  /** A legal type whose lawyer-review confirmation has not been recorded. */
  legalPending: boolean;
  /** When the item was last reviewed or issued (SOP review clock). */
  reviewedAt: number | null;
}

export interface SendRow {
  id: string;
  documentId: string;
  cloneId: string;
  title: string;
  sentAt: number;
  viewedAt: number | null;
  signedAt: number | null;
  status: DashSendStatus;
  sentBy: string | null;
  partyName: string;
  partyType: string;
}

export interface AiRunRow { at: number; userId: string; documentId: string; inputTokens: number; outputTokens: number; status: "running" | "proposed" | "failed" }
export interface ExportRow { at: number; format: "pdf" | "docx" | "other"; actorId: string }
export interface ActivityRow { at: number; actorId: string; actor: string; action: string; summary: string; documentId: string | null }

export interface DashboardInput {
  docs: DocRow[];
  sends: SendRow[];
  ai: AiRunRow[];
  exports: ExportRow[];
  activity: ActivityRow[];
  /** User id to display name. */
  names: Record<string, string>;
}

export type RangeKey = "today" | "7" | "30" | "90" | "month" | "fy" | "custom";
export interface DateRange { key: RangeKey; from: number; to: number; prevFrom: number; prevTo: number; label: string; days: number }
export interface Scope { all: boolean; userId: string }

export interface Tile {
  key: string;
  label: string;
  value: number | null;
  format: "int" | "days" | "pct";
  prev: number | null;
  /** Change against the previous period in percent; null when there is nothing to compare with. */
  deltaPct: number | null;
  note: string;
  /** Whether a rise is good, bad or neither (for the colour of the change). */
  good: "up" | "down" | "neutral";
  href: string;
}
export interface SeriesPoint { label: string; start: number; sop: number; document: number; kpi: number }
export interface FunnelStep { key: string; label: string; value: number; pctOfFirst: number | null; dropPct: number | null }
export interface CountItem { key: string; label: string; value: number }
export interface HistBucket { label: string; value: number }
export interface TrendPoint { label: string; value: number | null }
export interface AttentionItem { id: string; title: string; detail: string; href: string }
export interface AttentionLists { staleDrafts: AttentionItem[]; awaitingSignature: AttentionItem[]; legalPending: AttentionItem[]; sopsDueReview: AttentionItem[]; employeesUnsigned: AttentionItem[] }
export interface LeaderRow { userId: string; name: string; created: number; sent: number; signed: number }

export interface DashboardData {
  range: DateRange;
  scope: "all" | "mine";
  generatedAt: number;
  tiles: Tile[];
  created: { granularity: "day" | "week"; points: SeriesPoint[]; total: number };
  funnel: FunnelStep[];
  byCategory: CountItem[];
  byDepartment: CountItem[];
  turnaround: { buckets: HistBucket[]; trend: TrendPoint[]; count: number; avgDays: number | null; medianDays: number | null };
  ai: { runs: number; proposed: number; failed: number; inputTokens: number; outputTokens: number; docsWithAi: number; docsActive: number; sharePct: number | null; series: { label: string; value: number }[] };
  source: { fromLibrary: number; scratch: number };
  topTemplates: CountItem[];
  versions: HistBucket[];
  exports: { pdf: number; docx: number; other: number; total: number };
  attention: AttentionLists;
  leaderboard: LeaderRow[];
  activity: ActivityRow[];
  /** True when there is nothing at all in scope (the page shows the empty state with its calls to action). */
  empty: boolean;
  /** The filters applied (already narrowing every figure above), how many are set, and whether they match nothing. */
  filters: PbFilters;
  filterCount: number;
  noMatch: boolean;
  /** The choices for the selects, from the rows in scope. */
  options: PbFilterOptions;
}
