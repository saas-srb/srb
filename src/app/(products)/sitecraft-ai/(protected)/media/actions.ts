"use server";

import { requireViewer, can } from "@/lib/products/sitecraft-ai/viewer";
import { recordAudit } from "@/lib/products/sitecraft-ai/audit";
import { registerCmsUpload, listMedia, deleteMedia, updateMedia, type CmsMediaDoc } from "@/lib/products/sitecraft-ai/media";

type Result<T extends object = object> = ({ ok: true } & T) | { ok: false; error: string };
const SESSION_EXPIRED = "Your session has expired — please sign in again.";
const NO_PERMISSION = "You don't have permission to do that.";

export async function registerCmsMediaAction(pathname: string, name: string): Promise<Result<{ media: CmsMediaDoc }>> {
  const v = await requireViewer().catch(() => null);
  if (!v) return { ok: false, error: SESSION_EXPIRED };
  if (!can(v, "MEDIA_UPLOAD")) return { ok: false, error: NO_PERMISSION };
  try {
    const media = await registerCmsUpload(pathname, name, v.userId);
    await recordAudit({ actorId: v.userId, actorEmail: v.email, action: "upload", entity: "media", entityId: media._id, entityLabel: media.name });
    return { ok: true, media };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Upload failed." };
  }
}

export async function listCmsMediaAction(q?: string): Promise<CmsMediaDoc[]> {
  const v = await requireViewer().catch(() => null);
  if (!v || !can(v, "VIEW")) return [];
  return listMedia(q);
}

export async function updateCmsMediaAction(id: string, patch: { name?: string; altText?: string }): Promise<Result> {
  const v = await requireViewer().catch(() => null);
  if (!v) return { ok: false, error: SESSION_EXPIRED };
  if (!can(v, "MEDIA_UPLOAD")) return { ok: false, error: NO_PERMISSION };
  await updateMedia(id, patch, v.userId);
  await recordAudit({ actorId: v.userId, actorEmail: v.email, action: "update", entity: "media", entityId: id, entityLabel: patch.name ?? id, summary: "Edited attachment details" });
  return { ok: true };
}

export async function deleteCmsMediaAction(id: string, name: string): Promise<Result> {
  const v = await requireViewer().catch(() => null);
  if (!v) return { ok: false, error: SESSION_EXPIRED };
  if (!can(v, "MEDIA_DELETE")) return { ok: false, error: NO_PERMISSION };
  await deleteMedia(id);
  await recordAudit({ actorId: v.userId, actorEmail: v.email, action: "delete", entity: "media", entityId: id, entityLabel: name });
  return { ok: true };
}
