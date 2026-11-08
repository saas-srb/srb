import "server-only";
import { loadJurisdiction } from "./store";
import { STAMP_DISCLAIMER, categoryLabel, jurisdictionByCode, type StampEntryContent } from "./structure";

/**
 * The read API for the stamping step. It NEVER presents the table as authoritative: `authoritative` is always false, `disclaimer` is always
 * present, and `unconfirmed` is true unless at least one entry exists and every entry for the category is confirmed (and even then the
 * disclaimer stays). A missing state, a missing category, a database problem and a blank entry all come back as `unconfirmed: true`.
 */

export type GuidanceStatus = "unknown_state" | "unavailable" | "not_entered" | "unconfirmed" | "confirmed";

export interface GuidanceEntry extends StampEntryContent {
  id: string;
  categoryLabel: string;
  status: "unconfirmed" | "confirmed";
  confirmedBy: string | null;
  confirmedOn: string | null;
  /** False when the entry starts after `asOf` or has no start date entered. */
  inForce: boolean;
}

export interface StampGuidance {
  authoritative: false;
  disclaimer: string;
  unconfirmed: boolean;
  status: GuidanceStatus;
  state: { code: string; name: string } | null;
  category: { key: string; label: string };
  entries: GuidanceEntry[];
  message: string;
}

export async function getStampGuidance(input: { state: string; category: string; asOf?: Date }): Promise<StampGuidance> {
  const category = { key: input.category, label: categoryLabel(input.category) };
  const base = { authoritative: false as const, disclaimer: STAMP_DISCLAIMER, category };
  const j = jurisdictionByCode(input.state);
  if (!j) return { ...base, unconfirmed: true, status: "unknown_state", state: null, entries: [], message: "That state or union territory is not recognised, so no duty guidance can be shown." };
  const state = { code: j.code, name: j.name };
  let loaded;
  try {
    loaded = await loadJurisdiction(j.code);
  } catch (err) {
    console.error("[stamp-rulebook] could not read", err instanceof Error ? err.message : err);
    return { ...base, unconfirmed: true, status: "unavailable", state, entries: [], message: "The stamp rulebook could not be read just now. Confirm the duty with a lawyer." };
  }
  const asOf = (input.asOf ?? new Date()).toISOString().slice(0, 10);
  const entries: GuidanceEntry[] = (loaded?.entries ?? [])
    .filter((e) => e.category === input.category)
    .map((e) => ({
      id: e.id,
      category: e.category,
      title: e.title,
      dutyType: e.dutyType,
      fixedAmount: e.fixedAmount,
      ratePercent: e.ratePercent,
      rateBasis: e.rateBasis,
      minAmount: e.minAmount,
      capAmount: e.capAmount,
      exemptions: e.exemptions,
      notes: e.notes,
      sourceUrl: e.sourceUrl,
      sourceTitle: e.sourceTitle,
      effectiveFrom: e.effectiveFrom,
      eStamp: e.eStamp,
      categoryLabel: category.label,
      status: e.status,
      confirmedBy: e.status === "confirmed" ? (e.confirmation?.by ?? null) : null,
      confirmedOn: e.status === "confirmed" ? (e.confirmation?.on ?? null) : null,
      inForce: e.effectiveFrom !== null && e.effectiveFrom <= asOf,
    }));
  if (entries.length === 0 || entries.every((e) => e.dutyType === "not_entered")) {
    return { ...base, unconfirmed: true, status: "not_entered", state, entries, message: `No duty has been entered for ${category.label} in ${j.name}. Ask a lawyer or check the state's stamp office.` };
  }
  const all = entries.every((e) => e.status === "confirmed");
  return {
    ...base,
    unconfirmed: !all,
    status: all ? "confirmed" : "unconfirmed",
    state,
    entries,
    message: all
      ? `Entered and checked by a reviewer for ${j.name}. Still guidance only: confirm with a lawyer.`
      : `NOT CONFIRMED. These figures for ${j.name} have not been checked by a reviewer. Do not rely on them.`,
  };
}
