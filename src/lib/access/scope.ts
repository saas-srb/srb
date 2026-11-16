import { can, type AccessSubject } from "./can";
import type { Level } from "./types";

/**
 * Whose data a person may see or change in a feature that can be "own only" or "everyone's" (attendance, leave, payslips, requests, documents, tasks,
 * timesheets, expenses, certificates ...). Decided by the SERVER in loaders, queries, actions and exports, never only in the screen:
 *   'all'  = the person holds the feature that covers everyone's records
 *   'own'  = only the "my own" feature (the baseline every person with the product has)
 *   'none' = neither
 * A Director is always 'all'. For a write the person needs the Write level of the feature in that scope.
 */
export type Scope = "all" | "own" | "none";

export interface ScopedFeature { product: string; /** the feature that covers everyone's records */ all: string; /** the baseline "my own" feature; omit when there is no own-only variant */ own?: string }

export function scopeFor(subject: AccessSubject | null | undefined, f: ScopedFeature, level: Level = "read"): Scope {
  if (can(subject, f.product, f.all, level)) return "all";
  if (f.own && can(subject, f.product, f.own, level)) return "own";
  return "none";
}

/** A Mongo filter that confines a query to the person's scope: `{}` for 'all', `{ [ownField]: ownId }` for 'own', and null for 'none' (do not even query). */
export function scopeFilter(scope: Scope, ownField: string, ownId: string | null | undefined): Record<string, unknown> | null {
  if (scope === "all") return {};
  if (scope === "own" && ownId) return { [ownField]: ownId };
  return null;
}

/** True when a single record belongs to the person (for loaders that fetch by id): 'all' sees everything, 'own' only their own, 'none' nothing. */
export function inScope(scope: Scope, recordOwnerId: string | null | undefined, ownId: string | null | undefined): boolean {
  if (scope === "all") return true;
  return scope === "own" && Boolean(ownId) && recordOwnerId === ownId;
}
