import { CATALOGUE, FILE_ROLES } from "./catalogue";
import { completeWith, granted } from "./complete";
import { legacyAnswer, legacyAnswers, type LegacyUser } from "./legacy";
import type { AccessMap } from "./types";
import { baselineMicros, legacyNeededBy, withMicros } from "./micro/derive";
import { FINISHED_PRODUCTS, microOf } from "./micro";

/**
 * COMPATIBILITY ADAPTER between the access map (the new model) and the legacy role files.
 *
 *  legacyToAccess(user)   what a legacy user (roles + overrides) can do today, as an access map. Exact:
 *                         every capability the user holds becomes a feature entry.
 *  accessToLegacy(map)    a legacy user (roles + permission overrides) that makes EVERY legacy check give the
 *                         answer the map asks for. The legacy code does not change: products keep calling
 *                         hrmsCan(), canManageProjects(), hasXAccess()... on the derived user.
 *
 * The derivation is verified against the legacy functions themselves (they are the oracle), and anything it
 * cannot reproduce exactly is returned in `conflicts` instead of being guessed. A conflict happens only for a
 * hand-made map that wants a capability the legacy code can only grant together with another one (a role
 * bundles them and there is no per-capability override key for it).
 */

export interface DerivedLegacy {
  roles: string[];
  permissionOverrides: Record<string, boolean>;
  /** Features whose legacy answer differs from what the map asks for (empty = exact). */
  conflicts: { key: string; wanted: boolean; legacy: boolean }[];
  /** Legacy products would allow these although the map does not (a role bundles them). The map must not be applied while this is non-empty. */
  widened: string[];
  /** The map grants these but the legacy products cannot express them on their own. New code (`can`) honours them; legacy checks say no. */
  withheld: string[];
}

const DIRECTOR = "super_admin";

/** The access map for a legacy user. A Director is reported as `isDirector` with an empty map (write everywhere is implied). */
export function legacyToAccess(user: LegacyUser): { isDirector: boolean; access: AccessMap } {
  const isDirector = user.roles.includes(DIRECTOR);
  if (isDirector) return { isDirector: true, access: {} };
  const access: AccessMap = {};
  const answers = legacyAnswers(user);
  for (const e of CATALOGUE) if (answers[e.key]) (access[e.product] ??= {})[e.key] = e.level;
  return { isDirector: false, access: withMicros(access) };
}

export { granted };

/** Every role any role file knows, except the Director role (the Director is a flag, not a role bundle). */
const ALL_ROLES: string[] = [...new Set(Object.values(FILE_ROLES).flat())].filter((r) => r !== DIRECTOR).sort();

let roleVectors: Map<string, Set<string>> | null = null;
/** What each role grants on its own (no overrides). Roles only ever add capabilities, so a set of roles grants the union. */
function vectors(): Map<string, Set<string>> {
  if (roleVectors) return roleVectors;
  roleVectors = new Map();
  for (const r of ALL_ROLES) {
    const a = legacyAnswers({ roles: [r], permissionOverrides: null });
    roleVectors.set(r, new Set(CATALOGUE.filter((e) => a[e.key]).map((e) => e.key)));
  }
  return roleVectors;
}

/** Entries no override can change: coarse tier gates and capabilities with no override key. Only roles decide them. */
const FIXED = new Set(CATALOGUE.filter((e) => e.kind === "tier" || !e.overrideKey).map((e) => e.key));
const OVERRIDABLE = new Set(CATALOGUE.filter((e) => !FIXED.has(e.key)).map((e) => e.key));
/** "Employee only" style gates are NOT monotone (adding a role can turn them off), so the union rule skips them; the repair search handles them. */
const NON_MONOTONE = new Set(CATALOGUE.filter((e) => e.kind === "tier" && /Only$/.test(e.fn)).map((e) => e.key));

let disqualifiers: Map<string, Set<string>> | null = null;
/** For each non-monotone gate: the roles that switch it OFF when added to a role that has it on ("employee only" is off once a staff role is added). */
function disqualifiersOf(): Map<string, Set<string>> {
  if (disqualifiers) return disqualifiers;
  disqualifiers = new Map();
  const V = vectors();
  for (const g of NON_MONOTONE) {
    const e = CATALOGUE.find((x) => x.key === g)!;
    const witness = ALL_ROLES.find((r) => V.get(r)!.has(g));
    const off = new Set<string>();
    if (witness) for (const r of ALL_ROLES) if (r !== witness && !legacyAnswer(e, { roles: [witness, r], permissionOverrides: null })) off.add(r);
    disqualifiers.set(g, off);
  }
  return disqualifiers;
}

/**
 * Picks the roles, then the overrides. Roles are chosen greedily by set cover over what each role grants:
 * a role is admissible only if everything it grants that no override can remove is wanted; fixed features
 * must all be covered; remaining wants that an override can add are added as overrides, and a chosen role's
 * unwanted overridable grants become explicit denies. The result is verified against the legacy functions.
 */
function solve(want: Set<string>): { roles: string[]; overrides: Record<string, boolean> } {
  const V = vectors();
  const banned = new Set<string>();
  for (const [g, off] of disqualifiersOf()) if (want.has(g)) off.forEach((r) => banned.add(r));
  const admissible = ALL_ROLES.filter((r) => !banned.has(r) && [...V.get(r)!].every((k) => !FIXED.has(k) || NON_MONOTONE.has(k) || want.has(k)));
  const uncovered = new Set([...want].filter((k) => FIXED.has(k) && !NON_MONOTONE.has(k)));
  const chosen: string[] = [];
  const covered = new Set<string>();
  const score = (r: string, mandatory: boolean) => {
    let gain = 0, cost = 0;
    for (const k of V.get(r)!) {
      if (want.has(k)) { if (!covered.has(k)) gain += mandatory && FIXED.has(k) ? 100 : 1; }
      else cost++;
    }
    return gain - cost;
  };
  // mandatory: cover every wanted fixed feature
  while ([...uncovered].some((k) => !covered.has(k))) {
    let best: string | null = null, bestScore = -Infinity;
    for (const r of admissible) {
      if (chosen.includes(r)) continue;
      const gainsFixed = [...V.get(r)!].some((k) => uncovered.has(k) && !covered.has(k));
      if (!gainsFixed) continue;
      const sc = score(r, true);
      if (sc > bestScore) { best = r; bestScore = sc; }
    }
    if (!best) break; // not coverable: reported as a conflict by the verification below
    chosen.push(best);
    V.get(best)!.forEach((k) => covered.add(k));
  }
  // optional: a role that removes more overrides than it adds
  for (;;) {
    let best: string | null = null, bestScore = 0;
    for (const r of admissible) {
      if (chosen.includes(r)) continue;
      const sc = score(r, false);
      if (sc > bestScore) { best = r; bestScore = sc; }
    }
    if (!best) break;
    chosen.push(best);
    V.get(best)!.forEach((k) => covered.add(k));
  }
  const evaluate = (rs: string[]) => {
    const roles = [...rs].sort();
    const base = legacyAnswers({ roles, permissionOverrides: null });
    const overrides: Record<string, boolean> = {};
    for (const e of CATALOGUE) {
      if (!OVERRIDABLE.has(e.key)) continue;
      if (base[e.key] !== want.has(e.key)) overrides[e.overrideKey!] = want.has(e.key);
    }
    const actual = legacyAnswers({ roles, permissionOverrides: overrides });
    // Never widen: an extra grant (legacy true, not wanted) is a silent privilege, so it costs ten times a missing one.
    let conflicts = 0, cost = 0;
    for (const e of CATALOGUE) {
      if (actual[e.key] === want.has(e.key)) continue;
      conflicts++;
      cost += want.has(e.key) ? 10000 : 100000;
    }
    return { roles, overrides, conflicts, cost: cost + Object.keys(overrides).length * 10 + roles.length };
  };
  let best = evaluate(chosen);
  // Some legacy predicates are not monotone (e.g. "employee ONLY": true for a lone employee, false once any other role is added),
  // so the union rule can be wrong. Repair by local search over adding, removing and swapping one role, judged by the legacy functions.
  for (let round = 0; round < 8 && best.conflicts > 0; round++) {
    let improved = false;
    const tryRoles = (rs: string[]) => { const c = evaluate(rs); if (c.cost < best.cost) { best = c; improved = true; } };
    for (const r of ALL_ROLES) if (!best.roles.includes(r)) tryRoles([...best.roles, r]);
    for (const r of best.roles) tryRoles(best.roles.filter((x) => x !== r));
    for (const out of [...best.roles]) for (const r of ALL_ROLES) if (!best.roles.includes(r)) tryRoles([...best.roles.filter((x) => x !== out), r]);
    if (!improved) break;
  }
  return { roles: best.roles, overrides: best.overrides };
}

/** Derives the legacy roles and permission overrides that reproduce the access map exactly (or reports conflicts). */
export function accessToLegacy(access: AccessMap, opts: { isDirector?: boolean } = {}): DerivedLegacy {
  if (opts.isDirector) return { roles: [DIRECTOR], permissionOverrides: {}, conflicts: [], widened: [], withheld: [] };
  const want = new Set(CATALOGUE.filter((e) => granted(access, e)).map((e) => e.key));
  // Finished products: the micro features the person holds need these legacy capabilities (the old role files stay derivable).
  for (const k of legacyNeededBy(access)) want.add(k);
  const { roles, overrides } = solve(want);
  const actual = legacyAnswers({ roles, permissionOverrides: overrides });
  const conflicts: DerivedLegacy["conflicts"] = [];
  for (const e of CATALOGUE) {
    const wanted = want.has(e.key);
    if (wanted !== actual[e.key]) conflicts.push({ key: e.key, wanted, legacy: actual[e.key] });
  }
  return { roles, permissionOverrides: overrides, conflicts, widened: conflicts.filter((c) => !c.wanted).map((c) => c.key), withheld: conflicts.filter((c) => c.wanted).map((c) => c.key) };
}

const baselineMemo = new Map<string, string[]>();
/**
 * The baseline of a product: everything its lowest role that can open it bundles (the "employee" level), including
 * access the legacy code implies in other products. Legacy code can only let a person into a product through a role, so
 * anyone who is given access to the product also gets this baseline. It is written into the map (and shown in the
 * Preview) instead of being hidden.
 */
export function baselineFeatures(product: string): string[] {
  const hit = baselineMemo.get(product);
  if (hit) return hit;
  const V = vectors();
  const entries = CATALOGUE.filter((e) => e.product === product);
  const gates = entries.filter((e) => e.kind === "tier" && /^has\w*Access$/.test(e.fn)).map((e) => e.key);
  let best: string[] | null = null;
  for (const r of ALL_ROLES) {
    const v = V.get(r)!;
    if (!gates.some((g) => v.has(g))) continue;
    // only roles that belong to this product's own role files can be its baseline (a foreign role that happens to imply access is not)
    if (!entries.some((e) => (FILE_ROLES[e.source] ?? []).includes(r))) continue;
    // the WHOLE vector: legacy roles also imply access in other products (a training role implies the test-taker role), and that is part of the baseline
    const mine = [...v];
    if (!best || mine.length < best.length) best = mine;
  }
  baselineMemo.set(product, best ?? []);
  return best ?? [];
}

/**
 * Completes a hand-made map: a product with at least one real feature can be opened and gets its baseline, and everybody gets the
 * Workspace baseline. Identity tiers (admin, manager tier, employee-only) found in the input are carried while the product is used.
 */
export function completeAccess(input: AccessMap): AccessMap {
  const access = withMicros(input);
  const real: AccessMap = {};
  const carried: AccessMap = {};
  for (const e of CATALOGUE) {
    const held = access[e.product]?.[e.key];
    if (!held) continue;
    if (e.kind === "tier" && !/^has\w*Access$/.test(e.fn)) (carried[e.product] ??= {})[e.key] = held;
    else if (e.kind !== "tier") (real[e.product] ??= {})[e.key] = held;
  }
  // Finished products: the micro features picked need their legacy capabilities, which are then part of the product's picks.
  for (const product of FINISHED_PRODUCTS) {
    for (const m of microOf(product)) {
      if (!access[product]?.[m.key]) continue;
      for (const k of m.legacy) { const e = CATALOGUE.find((x) => x.key === k); if (e && e.kind !== "tier") (real[e.product] ??= {})[e.key] = e.level; }
    }
  }
  const out = completeWith(real, carried, baselineFeatures);
  // The micro features themselves: the ones picked (any legacy requirement is now present), plus the product baseline once the product is opened.
  for (const product of FINISHED_PRODUCTS) {
    const opened = Object.keys(out[product] ?? {}).length > 0;
    for (const m of microOf(product)) { const held = access[product]?.[m.key]; if (held) (out[product] ??= {})[m.key] = m.level === "read" ? "read" : held; }
    if (opened) for (const m of baselineMicros(product)) (out[product] ??= {})[m.key] ??= m.level;
  }
  return out;
}
