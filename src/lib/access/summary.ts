import type { AccessMap } from "./types";
import type { UiProduct } from "./ui-model";

/** The Preview of one product: what the person can do, can only view, and cannot. */
export interface ProductSummary {
  key: string;
  name: string;
  /** "none" when the person has nothing in the product, "read" when only view features, "write" otherwise. */
  level: "none" | "read" | "write";
  canDo: string[];
  canView: string[];
  cannot: string[];
}

/** Pure: builds the readable summary from the access map and the catalogue of the screen. */
export function summarizeAccess(access: AccessMap, products: UiProduct[], isDirector = false): ProductSummary[] {
  return products.map((p) => {
    const canDo: string[] = [];
    const canView: string[] = [];
    const cannot: string[] = [];
    for (const f of p.features) {
      const held = isDirector ? (f.needs === "read" ? "read" : "write") : access[p.key]?.[f.key];
      const has = Boolean(held) && (held === "write" || f.needs === "read");
      if (!has) cannot.push(f.label);
      else if (f.needs === "write") canDo.push(f.label);
      else canView.push(f.label);
    }
    return { key: p.key, name: p.name, level: canDo.length ? "write" : canView.length ? "read" : "none", canDo, canView, cannot };
  });
}

/** Number of products (other than the Workspace everybody has) the person can open. */
export function productCount(summary: ProductSummary[], workspaceProduct = "commandos"): number {
  return summary.filter((s) => s.key !== workspaceProduct && s.level !== "none").length;
}
