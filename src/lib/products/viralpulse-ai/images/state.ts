import type { ProjectStatus } from "@/lib/products/viralpulse-ai/images/types";

/**
 * Image project states, pure (no server imports) so the engine, the list and the detail page share one set of rules.
 *
 *   draft -> briefed -> generating -> ready | failed -> finished
 *                  \-> awaiting_approval -> generating (a manager approves) | briefed / ready (declined)
 */

export const TRANSITIONS: Record<ProjectStatus, readonly ProjectStatus[]> = {
  draft: ["draft", "briefed"],
  briefed: ["draft", "briefed", "generating", "awaiting_approval"],
  awaiting_approval: ["generating", "briefed", "ready", "failed"],
  generating: ["generating", "ready", "failed"],
  ready: ["draft", "briefed", "ready", "generating", "awaiting_approval", "finished"],
  failed: ["draft", "briefed", "generating", "awaiting_approval"],
  finished: ["draft", "briefed", "ready", "generating", "awaiting_approval", "finished"],
};

export const canTransition = (from: ProjectStatus, to: ProjectStatus) => TRANSITIONS[from].includes(to);

/** The status after the brief is saved: a complete brief is "briefed"; a generated project keeps its pictures ("ready"). */
export function statusAfterBriefSave(cur: ProjectStatus, briefComplete: boolean, hasVariants: boolean): ProjectStatus {
  if (cur === "generating") return cur;
  if (hasVariants && (cur === "ready" || cur === "finished")) return "ready";
  return briefComplete ? "briefed" : "draft";
}

/** The status when a generation or an approval request ends without running. */
export const statusWhenIdle = (hasVariants: boolean): ProjectStatus => (hasVariants ? "ready" : "briefed");

export const isActive = (s: ProjectStatus) => s === "generating";
export const isEditable = (s: ProjectStatus) => s !== "generating";

export type ListTab = "draft" | "generating" | "ready" | "failed";
export const LIST_TABS: { key: ListTab; label: string }[] = [
  { key: "draft", label: "Draft" },
  { key: "generating", label: "Generating" },
  { key: "ready", label: "Ready" },
  { key: "failed", label: "Failed" },
];

export function tabOfStatus(s: ProjectStatus): ListTab {
  if (s === "draft" || s === "briefed") return "draft";
  if (s === "generating" || s === "awaiting_approval") return "generating";
  if (s === "ready" || s === "finished") return "ready";
  return "failed";
}
export const parseTab = (v: string | null | undefined): ListTab | "all" => (LIST_TABS.some((t) => t.key === v) ? (v as ListTab) : "all");

export function countsByTab(counts: Partial<Record<ProjectStatus, number>>): Record<ListTab, number> {
  const out: Record<ListTab, number> = { draft: 0, generating: 0, ready: 0, failed: 0 };
  for (const [s, n] of Object.entries(counts) as [ProjectStatus, number][]) out[tabOfStatus(s)] += n;
  return out;
}

export type Tone = "neutral" | "info" | "warn" | "ok" | "bad";
export function statusMeta(s: ProjectStatus): { label: string; tone: Tone; busy: boolean } {
  switch (s) {
    case "draft": return { label: "Draft", tone: "neutral", busy: false };
    case "briefed": return { label: "Brief ready", tone: "info", busy: false };
    case "awaiting_approval": return { label: "Waiting for a manager", tone: "warn", busy: false };
    case "generating": return { label: "Generating", tone: "info", busy: true };
    case "ready": return { label: "Ready", tone: "ok", busy: false };
    case "finished": return { label: "Saved to library", tone: "ok", busy: false };
    case "failed": return { label: "Failed", tone: "bad", busy: false };
  }
}

/** A generation that has not touched its project for this long has died (server restart, timeout): it is shown as failed. */
export const STALE_GENERATION_MS = 15 * 60_000;
export const isStale = (status: ProjectStatus, updatedAt: Date | string, now: Date) => status === "generating" && now.getTime() - new Date(updatedAt).getTime() > STALE_GENERATION_MS;

export const POLL = { baseMs: 3000, maxMs: 30000, maxErrors: 6 } as const;
export const nextPollDelay = (errors: number) => Math.min(POLL.baseMs * 2 ** Math.max(0, errors), POLL.maxMs);
export function pollDecision(i: { status: ProjectStatus; hidden: boolean; consecutiveErrors: number }): { poll: boolean; reason: "active" | "finished" | "hidden" | "errors" } {
  if (!isActive(i.status)) return { poll: false, reason: "finished" };
  if (i.consecutiveErrors >= POLL.maxErrors) return { poll: false, reason: "errors" };
  if (i.hidden) return { poll: false, reason: "hidden" };
  return { poll: true, reason: "active" };
}

export const progressPct = (p: { total: number; done: number }) => (p.total > 0 ? Math.min(100, Math.round((p.done / p.total) * 100)) : 0);
