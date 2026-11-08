"use server";

import { requireViewer, can } from "@/lib/products/sitecraft-ai/viewer";
import { recordAudit } from "@/lib/products/sitecraft-ai/audit";
import { listNavItems, createNavItem, updateNavItem, reorderNavItem, deleteNavItem, type CmsNavItemDoc } from "@/lib/products/sitecraft-ai/nav";

const SESSION_EXPIRED = "Your session has expired — please sign in again.";
const NO_PERMISSION = "You don't have permission to do that.";
type Result<T extends object = object> = ({ ok: true } & T) | { ok: false; error: string };

async function guard(): Promise<{ v: Awaited<ReturnType<typeof requireViewer>> | null; error: string | null }> {
  const v = await requireViewer().catch(() => null);
  if (!v) return { v: null, error: SESSION_EXPIRED };
  if (!can(v, "NAV_MANAGE")) return { v: null, error: NO_PERMISSION };
  return { v, error: null };
}

export async function listNavItemsAction(): Promise<CmsNavItemDoc[]> {
  const v = await requireViewer().catch(() => null);
  if (!v || !can(v, "VIEW")) return [];
  return listNavItems();
}

export async function createNavItemAction(input: Parameters<typeof createNavItem>[0]): Promise<Result<{ id: string }>> {
  const { v, error } = await guard();
  if (!v) return { ok: false, error: error! };
  const doc = await createNavItem(input, v.userId);
  await recordAudit({ actorId: v.userId, actorEmail: v.email, action: "create", entity: "nav", entityId: doc._id, entityLabel: doc.label, summary: input.parentId ? "Added sub-item" : "Added menu column" });
  return { ok: true, id: doc._id };
}

export async function updateNavItemAction(id: string, patch: Parameters<typeof updateNavItem>[1]): Promise<Result> {
  const { v, error } = await guard();
  if (!v) return { ok: false, error: error! };
  await updateNavItem(id, patch, v.userId);
  await recordAudit({ actorId: v.userId, actorEmail: v.email, action: "update", entity: "nav", entityId: id, entityLabel: patch.label ?? id });
  return { ok: true };
}

export async function reorderNavItemAction(id: string, orderKey: number): Promise<Result> {
  const { v, error } = await guard();
  if (!v) return { ok: false, error: error! };
  await reorderNavItem(id, orderKey, v.userId);
  return { ok: true };
}

export async function deleteNavItemAction(id: string, label: string): Promise<Result> {
  const { v, error } = await guard();
  if (!v) return { ok: false, error: error! };
  await deleteNavItem(id);
  await recordAudit({ actorId: v.userId, actorEmail: v.email, action: "delete", entity: "nav", entityId: id, entityLabel: label });
  return { ok: true };
}
