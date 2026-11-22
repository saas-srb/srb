import { CATALOGUE, FILE_ROLES, FILE_PRODUCTS, PRODUCT_NAMES } from "./catalogue.generated";
import type { CatalogueEntry, Level } from "./types";

/**
 * The access catalogue: product -> feature -> description, with a stable key per feature.
 * It is generated from the legacy role files (scripts/gen-access-catalogue.ts), so every capability the
 * 20 role files answer today exists here exactly once (one feature per legacy capability: nothing is merged,
 * so nothing a person can do today is lost or widened).
 *
 * Meaning of the two levels for a feature:
 *  - "read":  open it, view it, use it (the capability is a view/use capability).
 *  - "write": everything read allows, plus change, create, approve, send, publish, reveal (the capability changes something).
 * A feature whose capability is a view/use capability has `level: "read"`: granting it "write" adds nothing.
 * Risky actions (publish, place calls, approvals, secret reveal, own-versus-all scope) are separate write
 * features, so a person can be given the draft work without the dangerous act.
 */
export { CATALOGUE, FILE_ROLES, FILE_PRODUCTS, PRODUCT_NAMES };

const BY_KEY = new Map<string, CatalogueEntry>(CATALOGUE.map((e) => [e.key, e]));
const BY_PRODUCT = new Map<string, CatalogueEntry[]>();
for (const e of CATALOGUE) BY_PRODUCT.set(e.product, [...(BY_PRODUCT.get(e.product) ?? []), e]);

export const PRODUCTS: string[] = [...BY_PRODUCT.keys()].sort();

export function featureByKey(key: string): CatalogueEntry | undefined {
  return BY_KEY.get(key);
}
export function featuresOf(product: string): CatalogueEntry[] {
  return BY_PRODUCT.get(product) ?? [];
}
export function productName(product: string): string {
  return PRODUCT_NAMES[product] ?? product;
}

/** Does holding `held` satisfy a feature whose capability needs `needs`? (write implies read) */
export function satisfies(held: Level | undefined, needs: Level): boolean {
  if (!held) return false;
  return held === "write" || needs === "read";
}

/**
 * Self-service features (owner decision D3): always on for every person, outside the matrix, never stored.
 * They only ever touch the person's own records.
 */
export const SELF_SERVICE: { key: string; label: string; description: string }[] = [
  { key: "me.tasks", label: "My tasks", description: "See and update the tasks assigned to me." },
  { key: "me.leave", label: "My leave", description: "Apply for leave and see my balances." },
  { key: "me.payslips", label: "My payslips", description: "View and download my own payslips." },
  { key: "me.profile", label: "My profile", description: "View and edit my own profile." },
  { key: "me.notifications", label: "My notifications", description: "See and manage my own notifications." },
  { key: "me.expenses", label: "My expenses and requests", description: "Raise and track my own expense claims and requisitions." },
  { key: "me.chat", label: "My chats", description: "Use team chat as myself." },
];
export const isSelfService = (key: string) => SELF_SERVICE.some((s) => s.key === key);

/** The entry gate of a product ("who can open it": `hasXAccess`, or TalentOS's `hasAnyHrmsRole`): derived from what a person is given, never picked. Other tiers (staff tier, employee-only, Director) are identity tiers and are carried. */
export const isAccessGate = (fn: string): boolean => /^has\w*Access$|^hasAny\w*Role$/.test(fn);
