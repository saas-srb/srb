/** ContractFlow dashboard: the rows the aggregation reads and what it returns. Client-safe (plain data, dates as epoch milliseconds). */
import type { CfFilterOptions, CfFilters } from "@/lib/products/contractflow-ai/dashboard/filters";
import type { ActivityRow, AttentionItem, CountItem, DateRange, FunnelStep, HistBucket, Scope, Tile, TrendPoint } from "@/lib/products/playbook-ai/dashboard/types";

export type { ActivityRow, AttentionItem, CountItem, DateRange, FunnelStep, HistBucket, Scope, Tile, TrendPoint };

export type CfCloneStatus = "clone_draft" | "ready" | "sent" | "partially_signed" | "signed" | "voided" | "declined" | "expired";
export type CfRequestStatus = "sent" | "in_progress" | "completed" | "declined" | "expired" | "voided";
export type CfSignerStatus = "pending" | "sent" | "viewed" | "otp_verified" | "signed" | "declined";

export interface CfDocRow {
  id: string;
  title: string;
  kind: "sop" | "document" | "kpi";
  status: CfCloneStatus;
  createdAt: number;
  updatedAt: number;
  createdBy: string | null;
  partyType: string;
  /** The recipient's name (for search). */
  partyName: string;
  /** Document type label (catalogue name) or the kind's name. */
  typeLabel: string;
  /** Expiry or renewal date of the signed document, when the document carries one. */
  renewalAt: number | null;
  /** A stamp is required and no certificate has been recorded yet. */
  stampPending: boolean;
}
export interface CfRequestRow { id: string; cloneId: string; status: CfRequestStatus; createdAt: number; expiresAt: number; voidedAt: number | null; createdBy: string | null }
export interface CfSignerRow {
  id: string; requestId: string; cloneId: string; name: string; role: string; partyType: string; status: CfSignerStatus;
  sentAt: number; viewedAt: number | null; otpVerifiedAt: number | null; signedAt: number | null; declineReason: string | null; lockedUntil: number | null;
  signatureKind: "drawn" | "typed" | "uploaded" | null;
}
export interface CfEventRow { type: string; at: number; requestId: string; channel: "email" | "sms" | null; resent: boolean }

export interface CfDashboardInput { docs: CfDocRow[]; requests: CfRequestRow[]; signers: CfSignerRow[]; events: CfEventRow[]; activity: ActivityRow[]; names: Record<string, string> }

export interface CfAttention {
  awaitingSignature: AttentionItem[];
  expiringSoon: AttentionItem[];
  viewedNotSigned: AttentionItem[];
  recentlyClosed: AttentionItem[];
  otpLockouts: AttentionItem[];
  employeesUnsigned: AttentionItem[];
  renewalsSoon: AttentionItem[];
  stampPending: AttentionItem[];
}
export interface CfLeader { userId: string; name: string; sent: number; signed: number }

export interface CfDashboardData {
  range: DateRange;
  scope: "all" | "mine";
  generatedAt: number;
  tiles: Tile[];
  over: { granularity: "day" | "week"; points: { label: string; start: number; sent: number; signed: number }[]; sent: number; signed: number };
  funnel: FunnelStep[];
  turnaround: { buckets: HistBucket[]; trend: TrendPoint[]; count: number; avgDays: number | null; medianDays: number | null };
  byType: CountItem[];
  byRecipient: CountItem[];
  byChannel: CountItem[];
  byMethod: CountItem[];
  outcomes: { declined: number; expired: number; voided: number; reasons: CountItem[] };
  attention: CfAttention;
  leaderboard: CfLeader[];
  activity: ActivityRow[];
  compliance: { signed: number; stampPending: number; renewalsSoon: number };
  empty: boolean;
  filters: CfFilters;
  filterCount: number;
  noMatch: boolean;
  options: CfFilterOptions;
}
