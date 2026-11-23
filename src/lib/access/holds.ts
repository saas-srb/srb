import { can as accessCan, type AccessSubject } from "@/lib/access/can";
import { legacyToAccess } from "@/lib/access/adapter";
import { microByKey, microOf } from "@/lib/access/micro";

/**
 * Cross-product questions ("may this person see company-wide leads?", "does this person have any Playbook access?") answered from the person's micro features.
 * Used by the Workspace menus, the company KPIs, global search and the DataBrain catalogue, which sit above every product and so cannot name one product's features.
 * `legacy` in the micro catalogue says which old capability a feature carries, so a rule written for the old name is answered by the features that hold it.
 * Pure (no server-only imports). The holder carries its `subject`; a bare holder with only roles/overrides (a script, a background job) gets the one its roles give.
 */
export type SubjectHolder = { subject?: AccessSubject | null; roles?: readonly string[]; permissionOverrides?: Record<string, boolean> | null };

const DERIVED = new WeakMap<object, AccessSubject>();
export function subjectOfHolder(h: SubjectHolder | null | undefined): AccessSubject | null {
  if (!h) return null;
  if (h.subject) return h.subject;
  if (!h.roles) return null;
  let s = DERIVED.get(h);
  if (!s) { s = legacyToAccess({ roles: h.roles, permissionOverrides: h.permissionOverrides ?? null }) as AccessSubject; DERIVED.set(h, s); }
  return s;
}

const holdsKey = (s: AccessSubject, key: string): boolean => {
  const m = microByKey(key);
  return Boolean(m) && accessCan(s, m!.product, key, m!.level);
};

/** The features of a product that carry one of the old capability names, found once per (product, names). */
const LEGACY_INDEX = new Map<string, string[]>();
const legacyKeys = (product: string, names: string[]): string[] => {
  const id = `${product}|${names.join(",")}`;
  let keys = LEGACY_INDEX.get(id);
  if (!keys) {
    keys = microOf(product).filter((m) => m.kind !== "scope" && m.legacy.some((l) => names.includes(l))).map((m) => m.key);
    LEGACY_INDEX.set(id, keys);
  }
  return keys;
};
const PRODUCT_KEYS = new Map<string, string[]>();
const productKeys = (product: string): string[] => {
  let keys = PRODUCT_KEYS.get(product);
  if (!keys) { keys = microOf(product).filter((m) => m.kind !== "scope").map((m) => m.key); PRODUCT_KEYS.set(product, keys); }
  return keys;
};

/** Does the person hold ANY feature of the product? (the product is open to them) */
export function holdsProduct(holder: SubjectHolder | null | undefined, product: string): boolean {
  const s = subjectOfHolder(holder);
  return Boolean(s) && productKeys(product).some((k) => holdsKey(s!, k));
}

/** Does the person hold a feature of the product that carries one of these old capability names (`source.NAME`)? */
export function holdsLegacy(holder: SubjectHolder | null | undefined, product: string, ...names: string[]): boolean {
  const s = subjectOfHolder(holder);
  return Boolean(s) && legacyKeys(product, names).some((k) => holdsKey(s!, k));
}
