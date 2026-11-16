import "server-only";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { accessToLegacy, completeAccess, legacyToAccess } from "./adapter";
import { normalizeAccess, type AccessSubject } from "./can";
import type { AccessMap } from "./types";
import { withMicros } from "./micro/derive";

const PEOPLE = "admin_users";

interface PersonRow {
  _id: ObjectId;
  roles?: string[];
  permissionOverrides?: Record<string, boolean> | null;
  access?: AccessMap | null;
  accessMigration?: { id: string; at: Date; source: string } | null;
  deletedAt?: Date | null;
}

/**
 * The access subject for a person: their stored access map when they have one, otherwise what their legacy
 * roles and overrides grant today (so a person who has not been migrated yet behaves exactly as before).
 */
export async function loadAccessSubject(userId: string): Promise<AccessSubject | null> {
  if (!ObjectId.isValid(userId)) return null;
  const db = await getDb();
  const row = await db.collection<PersonRow>(PEOPLE).findOne({ _id: new ObjectId(userId) });
  if (!row) return null;
  return subjectFromRow(row);
}

export function subjectFromRow(row: { roles?: string[]; permissionOverrides?: Record<string, boolean> | null; access?: AccessMap | null }): AccessSubject {
  const isDirector = (row.roles ?? []).includes("super_admin");
  if (row.access) return { isDirector, access: withMicros(row.access) };
  return legacyToAccess({ roles: row.roles ?? [], permissionOverrides: row.permissionOverrides ?? null });
}

/**
 * Stores a person's access map. Refused when the legacy products could not reproduce it exactly (the map
 * would grant a capability the legacy code can only give together with another). The legacy fields
 * (roles, permissionOverrides) are NOT touched here; deriving them from the map is the People & Access step (P3).
 */
export async function setAccess(userId: string, input: unknown, actorId: string): Promise<{ ok: true; withheld: string[] } | { ok: false; error: string; conflicts?: string[] }> {
  if (!ObjectId.isValid(userId)) return { ok: false, error: "Person not found." };
  const db = await getDb();
  const row = await db.collection<PersonRow>(PEOPLE).findOne({ _id: new ObjectId(userId) });
  if (!row) return { ok: false, error: "Person not found." };
  if ((row.roles ?? []).includes("super_admin")) return { ok: false, error: "The Director always has full access and cannot be changed." };
  const access = completeAccess(normalizeAccess(input));
  const derived = accessToLegacy(access);
  if (derived.widened.length) {
    return { ok: false, error: "These choices would also give access to more than selected, because older roles bundle features together.", conflicts: derived.widened };
  }
  await db.collection<PersonRow>(PEOPLE).updateOne({ _id: new ObjectId(userId) }, { $set: { access, accessUpdatedAt: new Date(), accessUpdatedBy: actorId } as never });
  return { ok: true, withheld: derived.withheld };
}
