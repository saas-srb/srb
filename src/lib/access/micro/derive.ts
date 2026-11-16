import { CATALOGUE, satisfies } from "../catalogue";
import type { AccessMap, CatalogueEntry } from "../types";
import { FINISHED_PRODUCTS, MICRO, isFinished, microOf, type MicroFeature } from "./index";

const LEGACY = new Map<string, CatalogueEntry>(CATALOGUE.map((e) => [e.key, e]));

export const microGranted = (access: AccessMap, m: MicroFeature) => satisfies(access[m.product]?.[m.key], m.level);

/**
 * A person who has legacy features for a FINISHED product but no micro features yet (stored before the product was finished, or just converted
 * from the old roles) gets exactly the micro features whose legacy capabilities they hold: the same things they could do before, nothing more.
 * Once any micro feature is stored for the product, the micro features are the truth and are left alone.
 */
export function withMicros(access: AccessMap): AccessMap {
  let out: AccessMap | null = null;
  for (const product of FINISHED_PRODUCTS) {
    const held = access[product] ?? {};
    const micros = microOf(product);
    if (micros.some((m) => held[m.key])) continue;
    const add: Record<string, "read" | "write"> = {};
    for (const m of micros) {
      if (m.legacy.length === 0) continue;
      if (m.legacy.every((k) => { const e = LEGACY.get(k); return e ? satisfies(held[k], e.level) : false; })) add[m.key] = m.level;
    }
    if (Object.keys(add).length === 0) continue;
    out ??= { ...access };
    out[product] = { ...held, ...add };
  }
  return out ?? access;
}

/** The legacy capabilities the granted micro features need (keys), so the old role files can be derived for people who use finished products. */
export function legacyNeededBy(access: AccessMap): Set<string> {
  const need = new Set<string>();
  for (const m of MICRO) if (microGranted(access, m)) m.legacy.forEach((k) => need.add(k));
  return need;
}

/** The visible baseline of a finished product. */
export const baselineMicros = (product: string): MicroFeature[] => microOf(product).filter((m) => m.baseline);

export { isFinished };
