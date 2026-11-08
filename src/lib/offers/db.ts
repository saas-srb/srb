import "server-only";
import { randomUUID } from "node:crypto";

/**
 * Shared helpers for the Festival Offers data layer (`offer_campaigns`,
 * `offers`, `coupons`, `offer_claims`). Every collection:
 *  - uses a string UUID `_id` (generated here, never derived from user input)
 *  - carries `createdAt` / `updatedAt` / `createdBy` / `updatedBy` audit fields
 *  - is soft-deleted via a `deletedAt` timestamp (never hard-removed)
 *
 * Mirrors `src/lib/cohort-ai/db.ts`.
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

/** Excludes soft-deleted rows. Spread into any find filter. */
export const notDeleted = { deletedAt: null } as const;
