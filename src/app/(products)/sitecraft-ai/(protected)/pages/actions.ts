"use server";

import { requireViewer, can } from "@/lib/products/sitecraft-ai/viewer";
import { recordAudit } from "@/lib/products/sitecraft-ai/audit";
import { createPage, deletePage, listPages, getPage, publishPage, type Result } from "@/lib/products/sitecraft-ai/pages";
import type { PageSection } from "@/lib/products/sitecraft-ai/section-registry";

const SESSION_EXPIRED = "Your session has expired — please sign in again.";
const NO_PERMISSION = "You don't have permission to do that.";

export async function listPagesAction() {
  const v = await requireViewer().catch(() => null);
  if (!v || !can(v, "VIEW")) return [];
  return listPages();
}

export async function createPageAction(input: { path: string; title: string; templateKey: string }): Promise<Result<{ id: string }>> {
  let v;
  try {
    v = await requireViewer();
  } catch {
    return { ok: false, error: SESSION_EXPIRED };
  }
  if (!can(v, "PAGES_CREATE")) return { ok: false, error: NO_PERMISSION };

  // A new page starts empty; its sections are added in the page builder.
  const sections: PageSection[] = [];
  const res = await createPage({ path: input.path, title: input.title, templateKey: input.templateKey, sections }, v.userId);
  if (res.ok) {
    await recordAudit({ actorId: v.userId, actorEmail: v.email, action: "create", entity: "page", entityId: res.id, entityLabel: input.path, path: input.path, summary: "Created" });
  }
  return res;
}

export async function deletePageAction(id: string, path: string): Promise<Result> {
  let v;
  try {
    v = await requireViewer();
  } catch {
    return { ok: false, error: SESSION_EXPIRED };
  }
  if (!can(v, "PAGES_DELETE")) return { ok: false, error: NO_PERMISSION };

  const res = await deletePage(id, v.userId);
  if (res.ok) {
    await recordAudit({ actorId: v.userId, actorEmail: v.email, action: "delete", entity: "page", entityId: id, entityLabel: path, path, summary: "Deleted" });
  }
  return res;
}

/**
 * Pages list bulk action: publishes every selected page that has something to
 * publish (a never-published draft or unpublished changes) — the same publish,
 * permission check and audit entry as the page editor's Publish button.
 */
export async function bulkPublishPagesAction(ids: string[]): Promise<Result<{ published: number; skipped: number; failed: { title: string; error: string }[] }>> {
  let v;
  try {
    v = await requireViewer();
  } catch {
    return { ok: false, error: SESSION_EXPIRED };
  }
  if (!can(v, "PAGES_PUBLISH")) return { ok: false, error: NO_PERMISSION };
  if (ids.length > 200) return { ok: false, error: "Publish at most 200 pages at a time." };

  let published = 0;
  let skipped = 0;
  const failed: { title: string; error: string }[] = [];
  for (const id of ids) {
    const page = await getPage(id);
    if (!page) continue;
    if (page.live && !page.hasUnpublishedChanges) {
      skipped++;
      continue;
    }
    const res = await publishPage(id, v.userId, "Bulk publish");
    if (!res.ok) {
      failed.push({ title: page.title, error: res.error });
      continue;
    }
    published++;
    await recordAudit({ actorId: v.userId, actorEmail: v.email, action: "publish", entity: "page", entityId: id, entityLabel: page.title, path: page.path, summary: `Published v${res.version} — bulk publish` });
  }
  return { ok: true, published, skipped, failed };
}
