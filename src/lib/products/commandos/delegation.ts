import { completeAccess, legacyToAccess } from "@/lib/access/adapter";
import { can } from "@/lib/access/can";
import type { AccessMap } from "@/lib/access/types";

/**
 * A person who manages users WITHOUT being a Director (they hold "manage users") may only hand out access they hold themselves. Otherwise they could give
 * a colleague (or, through a second account, themselves) powers they do not have. Pure: tested without a database.
 * Returns the features of `access` that go beyond the actor's own access, as "product.feature (level)" strings.
 */
export function featuresBeyond(actor: { roles: readonly string[]; permissionOverrides?: Record<string, boolean> | null }, access: AccessMap): string[] {
  if (actor.roles.includes("super_admin")) return [];
  const own = completeAccess(legacyToAccess({ roles: [...actor.roles], permissionOverrides: actor.permissionOverrides ?? null }).access);
  const out: string[] = [];
  for (const [product, features] of Object.entries(access)) for (const [key, level] of Object.entries(features)) if (!can({ access: own }, product, key, level)) out.push(`${product}.${key} (${level})`);
  return out;
}
