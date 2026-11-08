import "server-only";
import { randomUUID } from "node:crypto";
import { getDb } from "@/lib/mongodb";

/**
 * Shared helpers for the Wallet & Credits data layer. Mirrors
 * `src/lib/offers/db.ts` / `src/lib/clientos/db.ts` exactly — string UUID
 * `_id`, audit stamps, soft delete via `deletedAt`.
 */

export type Id = string;

export function newId(): Id {
  return randomUUID();
}

export interface AuditFields {
  createdAt: Date;
  updatedAt: Date;
  createdBy: string | null;
  updatedBy: string | null;
  deletedAt: Date | null;
}

export function createStamp(actorId: string | null): AuditFields {
  const now = new Date();
  return { createdAt: now, updatedAt: now, createdBy: actorId, updatedBy: actorId, deletedAt: null };
}

export function updateStamp(actorId: string | null): { updatedAt: Date; updatedBy: string | null } {
  return { updatedAt: new Date(), updatedBy: actorId };
}

export const notDeleted = { deletedAt: null } as const;

export async function walletCollection<T extends { _id: string }>(name: string) {
  const db = await getDb();
  return db.collection<T>(name);
}
