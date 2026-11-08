"use server";

import { requireViewer, can } from "@/lib/products/sitecraft-ai/viewer";
import { recordAudit } from "@/lib/products/sitecraft-ai/audit";
import {
  getPage,
  saveDraft,
  upsertDraftSection,
  removeDraftSection,
  reorderDraftSection,
  setSectionEnabled,
  publishPage,
  listVersions,
  restoreVersionToDraft,
  getThemeVariantSections,
  upsertThemeVariantSection,
  removeThemeVariantSection,
  reorderThemeVariantSection,
  setThemeVariantSectionEnabled,
  copyDefaultIntoThemeVariant,
  deleteThemeVariant,
  saveDraftSeo,
  discardDraftChanges,
  type Result,
} from "@/lib/products/sitecraft-ai/pages";
import { parsePageSeo, parsePageJsonLd, parsePageFrame } from "@/lib/products/sitecraft-ai/page-seo";
import type { PageSection } from "@/lib/products/sitecraft-ai/section-registry";

const SESSION_EXPIRED = "Your session has expired — please sign in again.";
const NO_PERMISSION = "You don't have permission to do that.";

async function guard(permission: Parameters<typeof can>[1]) {
  const v = await requireViewer().catch(() => null);
  if (!v) return { v: null, error: SESSION_EXPIRED } as const;
  if (!can(v, permission)) return { v: null, error: NO_PERMISSION } as const;
  return { v, error: null } as const;
}

export async function saveSectionAction(pageId: string, section: PageSection): Promise<Result> {
  const { v, error } = await guard("SECTIONS_EDIT");
  if (!v) return { ok: false, error: error! };
  return upsertDraftSection(pageId, section, v.userId);
}

export async function removeSectionAction(pageId: string, sectionId: string): Promise<Result> {
  const { v, error } = await guard("SECTIONS_EDIT");
  if (!v) return { ok: false, error: error! };
  return removeDraftSection(pageId, sectionId, v.userId);
}

export async function reorderSectionAction(pageId: string, sectionId: string, orderKey: number): Promise<Result> {
  const { v, error } = await guard("SECTIONS_EDIT");
  if (!v) return { ok: false, error: error! };
  return reorderDraftSection(pageId, sectionId, orderKey, v.userId);
}

export async function toggleSectionAction(pageId: string, sectionId: string, enabled: boolean): Promise<Result> {
  const { v, error } = await guard("SECTIONS_EDIT");
  if (!v) return { ok: false, error: error! };
  return setSectionEnabled(pageId, sectionId, enabled, v.userId);
}

export async function saveDraftSectionsAction(pageId: string, sections: PageSection[]): Promise<Result> {
  const { v, error } = await guard("SECTIONS_EDIT");
  if (!v) return { ok: false, error: error! };
  return saveDraft(pageId, sections, v.userId);
}

export async function publishPageAction(pageId: string, changeSummary: string): Promise<Result<{ version: string }>> {
  const { v, error } = await guard("PAGES_PUBLISH");
  if (!v) return { ok: false, error: error! };
  const page = await getPage(pageId);
  const res = await publishPage(pageId, v.userId, changeSummary);
  if (res.ok && page) {
    await recordAudit({
      actorId: v.userId,
      actorEmail: v.email,
      action: "publish",
      entity: "page",
      entityId: pageId,
      entityLabel: page.title,
      path: page.path,
      summary: `Published v${res.version}${changeSummary ? ` — ${changeSummary}` : ""}`,
    });
  }
  return res;
}

export async function listVersionsAction(pageId: string) {
  const v = await requireViewer().catch(() => null);
  if (!v || !can(v, "VIEW")) return [];
  return listVersions(pageId);
}

export async function restoreVersionAction(pageId: string, version: string): Promise<Result> {
  const { v, error } = await guard("PAGES_RESTORE");
  if (!v) return { ok: false, error: error! };
  const res = await restoreVersionToDraft(pageId, version, v.userId);
  if (res.ok) {
    const page = await getPage(pageId);
    await recordAudit({ actorId: v.userId, actorEmail: v.email, action: "restore", entity: "page", entityId: pageId, entityLabel: page?.title ?? pageId, path: page?.path, summary: `Restored v${version} into draft` });
  }
  return res;
}

// ── Per-theme section arrangements ──────────────────────────────────────

export async function getThemeVariantSectionsAction(pageId: string, themeKey: string): Promise<PageSection[]> {
  const v = await requireViewer().catch(() => null);
  if (!v || !can(v, "VIEW")) return [];
  return getThemeVariantSections(pageId, themeKey);
}

export async function saveThemeVariantSectionAction(pageId: string, themeKey: string, section: PageSection): Promise<Result> {
  const { v, error } = await guard("SECTIONS_EDIT");
  if (!v) return { ok: false, error: error! };
  return upsertThemeVariantSection(pageId, themeKey, section, v.userId);
}

export async function removeThemeVariantSectionAction(pageId: string, themeKey: string, sectionId: string): Promise<Result> {
  const { v, error } = await guard("SECTIONS_EDIT");
  if (!v) return { ok: false, error: error! };
  return removeThemeVariantSection(pageId, themeKey, sectionId, v.userId);
}

export async function reorderThemeVariantSectionAction(pageId: string, themeKey: string, sectionId: string, orderKey: number): Promise<Result> {
  const { v, error } = await guard("SECTIONS_EDIT");
  if (!v) return { ok: false, error: error! };
  return reorderThemeVariantSection(pageId, themeKey, sectionId, orderKey, v.userId);
}

export async function toggleThemeVariantSectionAction(pageId: string, themeKey: string, sectionId: string, enabled: boolean): Promise<Result> {
  const { v, error } = await guard("SECTIONS_EDIT");
  if (!v) return { ok: false, error: error! };
  return setThemeVariantSectionEnabled(pageId, themeKey, sectionId, enabled, v.userId);
}

export async function copyDefaultIntoThemeVariantAction(pageId: string, themeKey: string): Promise<Result> {
  const { v, error } = await guard("SECTIONS_EDIT");
  if (!v) return { ok: false, error: error! };
  return copyDefaultIntoThemeVariant(pageId, themeKey, v.userId);
}

export async function deleteThemeVariantAction(pageId: string, themeKey: string): Promise<Result> {
  const { v, error } = await guard("SECTIONS_EDIT");
  if (!v) return { ok: false, error: error! };
  return deleteThemeVariant(pageId, themeKey, v.userId);
}

/** Saves the page draft's SEO, structured data and frame (published with the page's next publish). */
export async function saveSeoAction(pageId: string, raw: { seo: unknown; jsonLd: unknown; frame: unknown }): Promise<Result> {
  const { v, error } = await guard("SECTIONS_EDIT");
  if (!v) return { ok: false, error };
  if (!Array.isArray(raw.jsonLd)) return { ok: false, error: "Structured data must be a JSON array of objects." };
  const res = await saveDraftSeo(pageId, parsePageSeo(raw.seo), parsePageJsonLd(raw.jsonLd), parsePageFrame(raw.frame), v.userId);
  if (res.ok) {
    const page = await getPage(pageId);
    await recordAudit({ actorId: v.userId, actorEmail: v.email, action: "update", entity: "page", entityId: pageId, entityLabel: page?.path ?? pageId, path: page?.path, summary: "SEO / structured data edited (draft)" });
  }
  return res;
}

/** Resets the draft to the published version (the "Discard changes" button). */
export async function discardChangesAction(pageId: string): Promise<Result<{ sections: PageSection[] }>> {
  const { v, error } = await guard("SECTIONS_EDIT");
  if (!v) return { ok: false, error: error! };
  const res = await discardDraftChanges(pageId, v.userId);
  if (res.ok) {
    const page = await getPage(pageId);
    await recordAudit({ actorId: v.userId, actorEmail: v.email, action: "restore", entity: "page", entityId: pageId, entityLabel: page?.title ?? pageId, path: page?.path, summary: "Discarded unpublished changes (draft reset to the live version)" });
  }
  return res;
}
