import { PURPOSE_BY_KEY } from "@/lib/products/agentos/calls/purposes";
import type { BriefingItem } from "@/lib/products/agentos/calls/briefing-core";

/**
 * Pieces shared by the products' call-briefing providers (pure). A settled AI call is described the same way wherever it was written back
 * (DealFlow's call results, TalentOS' `aiCalls`, SprintOS' activity trail), so the next call's briefing reads them identically.
 */

export interface PastCall {
  callId: string;
  at: string | null;
  purpose: string;
  status: string;
  outcome: string | null;
  summary: string | null;
  fields: { label: string; value: string }[];
}

const STATUS_WORDS: Record<string, string> = { completed: "answered and completed", failed: "failed to connect", no_answer: "not answered", busy: "line was busy" };
const OUTCOME_WORDS: Record<string, string> = { success: "successful", failure: "unsuccessful", unknown: "unclear" };

/** One earlier AI call as a briefing entry: when, why, how it went, the summary and what the person answered. */
export function pastCallItem(c: PastCall): BriefingItem {
  const purpose = PURPOSE_BY_KEY.get(c.purpose)?.label ?? c.purpose.replace(/_/g, " ");
  const parts = [`${purpose} call, ${STATUS_WORDS[c.status] ?? c.status.replace(/_/g, " ")}${c.outcome ? `, outcome ${OUTCOME_WORDS[c.outcome] ?? c.outcome}` : ""}.`];
  if (c.summary) parts.push(`Summary: ${c.summary}`);
  if (c.fields.length) parts.push(`What they answered: ${c.fields.map((f) => `${f.label}: ${f.value}`).join("; ")}.`);
  if (!c.summary && !c.fields.length) parts.push("No summary or answers were recorded.");
  return { at: c.at, who: "AI call", channel: "Phone", text: parts.join(" ") };
}

/** Oldest first, one entry per call id. */
export function orderedCalls(calls: PastCall[]): PastCall[] {
  const seen = new Set<string>();
  return calls
    .filter((c) => !seen.has(c.callId) && seen.add(c.callId))
    .sort((a, b) => (a.at ?? "").localeCompare(b.at ?? ""));
}

/** Newest-first rows loaded with a cap become the oldest-first list a briefing wants. */
export const chronological = <T extends { at: string | null }>(xs: T[]): T[] => [...xs].sort((a, b) => (a.at ?? "").localeCompare(b.at ?? ""));
