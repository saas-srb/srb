import { featureByKey, isSelfService, satisfies } from "./catalogue";
import type { AccessMap, Level } from "./types";

/** The part of a user the access model needs. Director = holds `super_admin` (the owner of the workspace). */
export interface AccessSubject {
  isDirector?: boolean;
  access?: AccessMap | null;
}

export class AccessDeniedError extends Error {
  constructor(public product: string, public feature: string, public level: Level) {
    super(`No ${level} access to ${feature}.`);
    this.name = "AccessDeniedError";
  }
}

/**
 * Pure access check. The Director always has write everywhere and cannot be reduced; self-service
 * features are always on; everything else needs an entry in the person's access map (write implies read).
 */
export function can(subject: AccessSubject | null | undefined, product: string, feature: string, level: Level = "read"): boolean {
  if (!subject) return false;
  if (subject.isDirector) return true;
  if (isSelfService(feature)) return true;
  return satisfies(subject.access?.[product]?.[feature], level);
}

/** Throws AccessDeniedError. Use at the top of server actions, route handlers and pages. */
export function requireAccess(subject: AccessSubject | null | undefined, product: string, feature: string, level: Level = "read"): void {
  if (!can(subject, product, feature, level)) throw new AccessDeniedError(product, feature, level);
}

/** Keeps only known features with a valid level and the right product; returns a clean map. */
export function normalizeAccess(input: unknown): AccessMap {
  const out: AccessMap = {};
  if (!input || typeof input !== "object") return out;
  for (const [product, features] of Object.entries(input as Record<string, unknown>)) {
    if (!features || typeof features !== "object") continue;
    for (const [key, level] of Object.entries(features as Record<string, unknown>)) {
      const e = featureByKey(key);
      if (!e || e.product !== product) continue;
      if (level !== "read" && level !== "write") continue;
      (out[product] ??= {})[key] = e.level === "read" ? "read" : (level as Level);
    }
  }
  return out;
}
