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

// ---------------------------------------------------------------------------------------------------------------------------------
// Staff products (TalentOS, SprintOS, SpendIQ, CohortAI, Playbook): "own", "my reporting line / my projects" and "everyone".
// ---------------------------------------------------------------------------------------------------------------------------------

/** Whose records a person may use in a feature that can be own-only, team-only (reporting line / membership) or everyone's. `all` > `team` > `own` > `none`. */
export type PeopleScope = "all" | "team" | "own" | "none";

export interface PeopleFeature { product: string; /** the feature that covers everyone's records */ all: string; /** the feature that covers the person's reporting line (a manager's team) */ team?: string; /** the baseline "my own" feature */ own?: string }

/** The widest scope the person holds in this feature at this level (a Write in a scope needs the Write level of that scope's feature). */
export function peopleScopeFor(subject: AccessSubject | null | undefined, f: PeopleFeature, level: Level = "read"): PeopleScope {
  if (can(subject, f.product, f.all, level)) return "all";
  if (f.team && can(subject, f.product, f.team, level)) return "team";
  if (f.own && can(subject, f.product, f.own, level)) return "own";
  return "none";
}

/** Who the signed-in person is for scope decisions: their own employee/user id, and the ids of the people in their reporting line (direct and indirect), computed by the product. */
export interface Me { id: string | null | undefined; line?: ReadonlySet<string> | readonly string[] }

const inLine = (me: Me, ownerId: string): boolean => (me.line instanceof Set ? me.line.has(ownerId) : Array.isArray(me.line) ? (me.line as readonly string[]).includes(ownerId) : false);

/** True when one record (by the id of the person it belongs to) is inside the scope: 'all' anything, 'team' the person's own and the reporting line's, 'own' only their own. The one rule actions, routes and loaders share. */
export function ownOrStaff(scope: PeopleScope, recordOwnerId: string | null | undefined, me: Me): boolean {
  if (scope === "all") return true;
  if (!recordOwnerId) return false;
  const mine = Boolean(me.id) && recordOwnerId === me.id;
  if (scope === "own") return mine;
  if (scope === "team") return mine || inLine(me, recordOwnerId);
  return false;
}

/** A Mongo filter confining a query to the scope on the field that names the record's person: `{}` for all, `{ field: { $in: [me, ...line] } }` for team, `{ field: me }` for own, null for none (do not query). */
export function peopleFilter(scope: PeopleScope, ownerField: string, me: Me): Record<string, unknown> | null {
  if (scope === "all") return {};
  if (scope === "none" || !me.id) return null;
  if (scope === "own") return { [ownerField]: me.id };
  return { [ownerField]: { $in: [...new Set([me.id, ...(me.line ? [...me.line] : [])])] } };
}
