"use server";

import { requireViewer, can } from "@/lib/products/sitecraft-ai/viewer";
import { recordAudit } from "@/lib/products/sitecraft-ai/audit";
import {
  listFooterColumns, listFooterLinks, createFooterColumn, updateFooterColumn, deleteFooterColumn,
  createFooterLink, updateFooterLink, deleteFooterLink,
  type CmsFooterColumnDoc, type CmsFooterLinkDoc,
} from "@/lib/products/sitecraft-ai/footer";

const SESSION_EXPIRED = "Your session has expired — please sign in again.";
const NO_PERMISSION = "You don't have permission to do that.";
type Result<T extends object = object> = ({ ok: true } & T) | { ok: false; error: string };

async function guard() {
  const v = await requireViewer().catch(() => null);
  if (!v) return { v: null, error: SESSION_EXPIRED } as const;
  if (!can(v, "FOOTER_MANAGE")) return { v: null, error: NO_PERMISSION } as const;
  return { v, error: null } as const;
}

export async function listFooterAction(): Promise<{ columns: CmsFooterColumnDoc[]; links: CmsFooterLinkDoc[] }> {
  const v = await requireViewer().catch(() => null);
  if (!v || !can(v, "VIEW")) return { columns: [], links: [] };
  const [columns, links] = await Promise.all([listFooterColumns(), listFooterLinks()]);
  return { columns, links };
}

export async function createFooterColumnAction(input: Parameters<typeof createFooterColumn>[0]): Promise<Result<{ id: string }>> {
  const { v, error } = await guard();
  if (!v) return { ok: false, error: error! };
  const doc = await createFooterColumn(input, v.userId);
  await recordAudit({ actorId: v.userId, actorEmail: v.email, action: "create", entity: "footer", entityId: doc._id, entityLabel: doc.title });
  return { ok: true, id: doc._id };
}

export async function updateFooterColumnAction(id: string, patch: Parameters<typeof updateFooterColumn>[1]): Promise<Result> {
  const { v, error } = await guard();
  if (!v) return { ok: false, error: error! };
  await updateFooterColumn(id, patch, v.userId);
  return { ok: true };
}

export async function deleteFooterColumnAction(id: string, title: string): Promise<Result> {
  const { v, error } = await guard();
  if (!v) return { ok: false, error: error! };
  await deleteFooterColumn(id);
  await recordAudit({ actorId: v.userId, actorEmail: v.email, action: "delete", entity: "footer", entityId: id, entityLabel: title });
  return { ok: true };
}

export async function createFooterLinkAction(input: Parameters<typeof createFooterLink>[0]): Promise<Result<{ id: string }>> {
  const { v, error } = await guard();
  if (!v) return { ok: false, error: error! };
  const doc = await createFooterLink(input, v.userId);
  return { ok: true, id: doc._id };
}

export async function updateFooterLinkAction(id: string, patch: Parameters<typeof updateFooterLink>[1]): Promise<Result> {
  const { v, error } = await guard();
  if (!v) return { ok: false, error: error! };
  await updateFooterLink(id, patch, v.userId);
  return { ok: true };
}

export async function deleteFooterLinkAction(id: string): Promise<Result> {
  const { v, error } = await guard();
  if (!v) return { ok: false, error: error! };
  await deleteFooterLink(id);
  return { ok: true };
}
