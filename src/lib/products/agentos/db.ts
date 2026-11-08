import "server-only";
import { randomUUID } from "node:crypto";
import { getDb } from "@/lib/mongodb";

/**
 * Shared helpers for the AI Bots data layer (mirrors `lib/cybervault/db.ts`): string
 * UUID `_id`s, audit stamps, soft delete via `deletedAt`.
 *
 * Mongo holds APPLICATION METADATA ONLY. The knowledge itself (files, chunks,
 * embeddings) lives in each bot's OpenAI vector store, and every chat's
 * transcript lives in its OpenAI Conversation — neither is copied here.
 * Six collections — the Atlas cluster has a 500 collection ceiling.
 */

export type Id = string;

export function newId(): Id {
  return randomUUID();
}

export interface Stamps {
  createdAt: Date;
  updatedAt: Date;
  createdBy: string | null;
  updatedBy: string | null;
  deletedAt: Date | null;
}

export function createStamp(actorId: string | null): Stamps {
  const now = new Date();
  return { createdAt: now, updatedAt: now, createdBy: actorId, updatedBy: actorId, deletedAt: null };
}

export function updateStamp(actorId: string | null): { updatedAt: Date; updatedBy: string | null } {
  return { updatedAt: new Date(), updatedBy: actorId };
}

export const notDeleted = { deletedAt: null } as const;

export const COLLECTIONS = {
  bots: "aibots_bots",
  files: "aibots_files",
  chats: "aibots_chats",
  /** One row per OpenAI execution — usage, cost, status. Never message content. */
  runs: "aibots_runs",
  settings: "aibots_settings",
  audit: "aibots_activity_logs",
} as const;

export async function aibotsCollection<T extends { _id: string }>(name: string) {
  const db = await getDb();
  return db.collection<T>(name);
}

export function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export const str = (v: unknown, max = 300): string => (typeof v === "string" ? v.trim().slice(0, max) : "");
export const strOrNull = (v: unknown, max = 300): string | null => str(v, max) || null;
