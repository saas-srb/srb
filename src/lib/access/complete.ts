import { CATALOGUE, satisfies } from "./catalogue";
import type { AccessMap, CatalogueEntry } from "./types";

/** Is this feature granted by the map? (write implies read) */
export function granted(access: AccessMap, e: CatalogueEntry): boolean {
  return satisfies(access[e.product]?.[e.key], e.level);
}

/** The product everybody signs in to: the Workspace (CommandOS). Every person has its baseline, so everyone gets the same shell (R9). */
export const WORKSPACE_PRODUCT = "commandos";

/**
 * Completes a person's choices into the full map.
 *  - `explicit`: the features the Director picked (real features only; no tier gates).
 *  - `carried`: identity tiers (admin, manager tier, employee-only) of a person who came from the legacy roles. They are kept only
 *    while the product still has a real feature.
 *  - `baselineOf(product)`: what the product's lowest role bundles (see `baselineFeatures`).
 * A product with at least one picked feature can be opened and gets its baseline. The decision looks at the PICKED features only, so a
 * baseline never cascades into another product's baseline. Everybody gets the Workspace baseline.
 */
export function completeWith(explicit: AccessMap, carried: AccessMap, baselineOf: (product: string) => string[]): AccessMap {
  const out: AccessMap = {};
  const put = (e: CatalogueEntry, level = e.level) => {
    const cur = out[e.product]?.[e.key];
    if (cur === "write") return;
    (out[e.product] ??= {})[e.key] = level;
  };
  const byKey = new Map(CATALOGUE.map((e) => [e.key, e]));
  const products = new Set(CATALOGUE.map((e) => e.product));
  const pickedIn = new Map<string, boolean>();
  for (const product of products) {
    const real = CATALOGUE.filter((e) => e.product === product && e.kind !== "tier");
    pickedIn.set(product, real.some((e) => granted(explicit, e)));
  }
  for (const e of CATALOGUE) {
    if (e.kind === "tier") continue;
    const held = explicit[e.product]?.[e.key];
    if (held && satisfies(held, e.level)) put(e, e.level === "read" ? "read" : held);
  }
  for (const product of products) {
    if (!pickedIn.get(product) && product !== WORKSPACE_PRODUCT) continue;
    for (const key of baselineOf(product)) {
      const e = byKey.get(key);
      if (e) put(e);
    }
  }
  for (const e of CATALOGUE) {
    if (e.kind !== "tier") continue;
    const keep = carried[e.product]?.[e.key];
    if (keep && pickedIn.get(e.product)) put(e, keep);
  }
  return out;
}
