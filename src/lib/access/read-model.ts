import { CATALOGUE, SELF_SERVICE, featuresOf, productName, PRODUCTS, satisfies } from "./catalogue";
import type { AccessMap, Level } from "./types";
import { isFinished, microOf } from "./micro";
import { withMicros } from "./micro/derive";

/**
 * The read model for "what can this person do": one object the Preview step and the locked-item UI both use.
 * `level` is what the person effectively has for each feature: "write", "read" or "none".
 */
export type Effective = Level | "none";

export interface FeatureView { key: string; label: string; description: string; needs: Level; level: Effective }
export interface ProductView { product: string; name: string; features: FeatureView[]; summary: { write: number; read: number; none: number }; reachable: boolean }
export interface AccessView { isDirector: boolean; products: ProductView[]; selfService: { key: string; label: string; description: string }[] }

export function describeAccess(input: AccessMap | null | undefined, isDirector = false): AccessView {
  const access = input ? withMicros(input) : input;
  const products: ProductView[] = PRODUCTS.map((product) => {
    const features: FeatureView[] = (isFinished(product) ? microOf(product) : featuresOf(product)).map((e) => {
      const held = access?.[product]?.[e.key];
      // A feature the person holds at "write" but whose capability only needs "read" is effectively read.
      const level: Effective = isDirector ? (e.level === "read" ? "read" : "write") : satisfies(held, e.level) ? (e.level === "read" ? "read" : (held as Level)) : "none";
      return { key: e.key, label: e.label, description: e.description, needs: e.level, level };
    });
    const summary = { write: 0, read: 0, none: 0 };
    for (const f of features) summary[f.level]++;
    return { product, name: productName(product), features, summary, reachable: summary.write + summary.read > 0 };
  });
  return { isDirector, products, selfService: SELF_SERVICE };
}

/** Lock state for the sidebar: an item is locked when the person has no access to any feature of its product. */
export function isProductLocked(view: AccessView, product: string): boolean {
  if (view.isDirector) return false;
  return !(view.products.find((p) => p.product === product)?.reachable ?? false);
}

export const TOTAL_FEATURES = CATALOGUE.length;
