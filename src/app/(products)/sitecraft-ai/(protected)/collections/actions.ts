"use server";

import { requireViewer, can } from "@/lib/products/sitecraft-ai/viewer";
import { recordAudit } from "@/lib/products/sitecraft-ai/audit";
import { COLLECTIONS } from "@/lib/products/sitecraft-ai/collections/registry";
import type { CollectionKey } from "@/lib/products/sitecraft-ai/collections/types";
import {
  saveRecordDraft, publishRecord, setRecordArchived, revertRecord, createRecord, type Result,
} from "@/lib/products/sitecraft-ai/collections/store";

const SESSION_EXPIRED = "Your session has expired — please sign in again.";
const NO_PERMISSION = "You don't have permission to do that.";

function isKey(k: string): k is CollectionKey {
  return k in COLLECTIONS;
}

async function guard(permission: "COLLECTIONS_EDIT" | "COLLECTIONS_PUBLISH") {
  const v = await requireViewer().catch(() => null);
  if (!v) return { v: null, error: SESSION_EXPIRED } as const;
  if (!can(v, permission)) return { v: null, error: NO_PERMISSION } as const;
  return { v, error: null } as const;
}

const audit = (v: { userId: string; email: string | null }, action: "create" | "update" | "publish" | "delete" | "restore", key: CollectionKey, slug: string, summary: string) =>
  recordAudit({ actorId: v.userId, actorEmail: v.email, action, entity: "collection", entityId: `${key}/${slug}`, entityLabel: `${COLLECTIONS[key].singular}: ${slug}`, summary });

export async function saveRecordAction(key: string, slug: string, data: Record<string, unknown>): Promise<Result> {
  if (!isKey(key)) return { ok: false, error: "Unknown collection." };
  const { v, error } = await guard("COLLECTIONS_EDIT");
  if (!v) return { ok: false, error };
  const res = await saveRecordDraft(key, slug, data, v.userId);
  if (res.ok) await audit(v, "update", key, slug, "Saved draft");
  return res;
}

export async function publishRecordAction(key: string, slug: string): Promise<Result<{ pageCreated?: boolean }>> {
  if (!isKey(key)) return { ok: false, error: "Unknown collection." };
  const { v, error } = await guard("COLLECTIONS_PUBLISH");
  if (!v) return { ok: false, error };
  const res = await publishRecord(key, slug, v.userId);
  if (res.ok) await audit(v, "publish", key, slug, "Published");
  return res;
}

export async function archiveRecordAction(key: string, slug: string, archived: boolean): Promise<Result> {
  if (!isKey(key)) return { ok: false, error: "Unknown collection." };
  const { v, error } = await guard("COLLECTIONS_PUBLISH");
  if (!v) return { ok: false, error };
  const res = await setRecordArchived(key, slug, archived, v.userId);
  if (res.ok) await audit(v, "update", key, slug, archived ? "Archived (hidden from the site)" : "Restored to the site");
  return res;
}

export async function revertRecordAction(key: string, slug: string): Promise<Result> {
  if (!isKey(key)) return { ok: false, error: "Unknown collection." };
  const { v, error } = await guard("COLLECTIONS_PUBLISH");
  if (!v) return { ok: false, error };
  const res = await revertRecord(key, slug);
  if (res.ok) await audit(v, res.deleted ? "delete" : "restore", key, slug, res.deleted ? "Deleted (never published)" : "Unpublished changes discarded");
  return res;
}

export async function createRecordAction(key: string, slug: string): Promise<Result<{ slug: string }>> {
  if (!isKey(key)) return { ok: false, error: "Unknown collection." };
  const { v, error } = await guard("COLLECTIONS_EDIT");
  if (!v) return { ok: false, error };
  const res = await createRecord(key, slug, v.userId);
  if (res.ok) await audit(v, "create", key, res.slug, "Created");
  return res;
}

/** Dashboard "Quick Draft": a new unpublished record with just a title (slug derived from it, made unique). */
export async function quickDraftAction(key: string, title: string): Promise<Result<{ slug: string }>> {
  if (!isKey(key)) return { ok: false, error: "Unknown collection." };
  const clean = title.trim();
  if (!clean) return { ok: false, error: "Give the draft a title." };
  const { v, error } = await guard("COLLECTIONS_EDIT");
  if (!v) return { ok: false, error };
  const base = clean.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 70) || "untitled";
  for (let n = 1; n <= 20; n++) {
    const res = await createRecord(key, n === 1 ? base : `${base}-${n}`, v.userId, { title: clean });
    if (res.ok) {
      await audit(v, "create", key, res.slug, "Created (Quick Draft)");
      return res;
    }
    if (!res.error.includes("already exists")) return res;
  }
  return { ok: false, error: "Couldn't find a free URL slug for that title." };
}
