import { cmsEvents } from "@/lib/notify/triggers/cms";
import "server-only";
import { getDb } from "@/lib/mongodb";
import { COLLECTIONS, expireSiteCache, newId, createStamp, updateStamp, nextVersion, type Stamps } from "@/lib/products/sitecraft-ai/db";
import { SECTION_REGISTRY, type PageSection } from "@/lib/products/sitecraft-ai/section-registry";
import type { PageSeo, PageJsonLd, PageFrame } from "@/lib/products/sitecraft-ai/page-seo";
import { revalidatePath } from "next/cache";

/**
 * CMS pages CRUD + draft/publish/version workflow. Mirrors
 * `src/lib/playbook-ai/sops.ts`'s `publishSop`/`revertDraftToVersion` shape:
 * immutable version snapshots, an insert-first-wins unique index as the
 * concurrency guard, and a restore that loads a snapshot back into `draft`
 * only — history is never touched, and publishing always creates a new
 * version.
 */

export interface ThemeVariant {
  sections: PageSection[];
  updatedAt: Date;
  updatedBy: string | null;
}

/** A page's content state (draft or live): its sections plus its SEO + structured data. */
export interface PageContent {
  sections: PageSection[];
  seo?: PageSeo | null;
  jsonLd?: PageJsonLd[];
  frame?: PageFrame;
}

export interface CmsPageDoc extends Stamps {
  _id: string;
  path: string;
  title: string;
  templateKey: string;
  draft: PageContent;
  live: PageContent | null;
  status: "draft" | "published" | "archived";
  version: string | null;
  hasUnpublishedChanges: boolean;
  publishedAt: Date | null;
  themeRef: "default";
  /**
   * Per-theme alternate section arrangements, keyed by theme slug. Absent or
   * empty for a theme => that theme falls back to `live.sections` (the
   * default theme's real content) when active. Deliberately no separate
   * draft/publish lifecycle here — a theme's own active/inactive state
   * already gates whether a variant is visible to the public.
   */
  themeVariants?: Record<string, ThemeVariant>;
}

export interface CmsPageVersionDoc {
  _id: string;
  pageId: string;
  path: string;
  version: string;
  previousVersion: string | null;
  sections: PageSection[];
  seo?: PageSeo | null;
  jsonLd?: PageJsonLd[];
  frame?: PageFrame;
  changeSummary: string;
  publishedAt: Date;
  publishedBy: string;
}

export type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

let indexesEnsured = false;
async function cols() {
  const db = await getDb();
  const pages = db.collection<CmsPageDoc>(COLLECTIONS.pages);
  const versions = db.collection<CmsPageVersionDoc>(COLLECTIONS.pageVersions);
  if (!indexesEnsured) {
    indexesEnsured = true;
    await Promise.all([
      pages.createIndex({ path: 1 }, { unique: true }).catch(() => {}),
      pages.createIndex({ status: 1, updatedAt: -1 }).catch(() => {}),
      versions.createIndex({ pageId: 1, version: 1 }, { unique: true }).catch(() => {}),
      versions.createIndex({ pageId: 1, publishedAt: -1 }).catch(() => {}),
    ]);
  }
  return { db, pages, versions };
}

export async function listPages(): Promise<CmsPageDoc[]> {
  const { pages } = await cols();
  return pages.find({}, { sort: { path: 1 } }).toArray();
}

export async function getPage(id: string): Promise<CmsPageDoc | null> {
  const { pages } = await cols();
  return pages.findOne({ _id: id });
}

export async function getPageByPath(path: string): Promise<CmsPageDoc | null> {
  const { pages } = await cols();
  return pages.findOne({ path });
}

/** Creates a page already seeded with the given sections in `draft` (typically a code-defined fallback array), left as `draft` status until explicitly published. */
export async function createPage(
  input: { path: string; title: string; templateKey: string; sections: PageSection[]; seo?: PageSeo | null; jsonLd?: PageJsonLd[]; frame?: PageFrame },
  actorId: string
): Promise<Result<{ id: string }>> {
  const path = input.path.trim();
  if (!path.startsWith("/")) return { ok: false, error: "Path must start with \"/\"." };
  const { pages } = await cols();
  const existing = await pages.findOne({ path });
  if (existing) return { ok: false, error: "A CMS page already exists for this path." };

  const doc: CmsPageDoc = {
    _id: newId(),
    path,
    title: input.title.trim() || path,
    templateKey: input.templateKey,
    draft: { sections: input.sections, seo: input.seo ?? null, jsonLd: input.jsonLd ?? [], frame: input.frame ?? "default" },
    live: null,
    status: "draft",
    version: null,
    hasUnpublishedChanges: true,
    publishedAt: null,
    themeRef: "default",
    ...createStamp(actorId),
  };
  await pages.insertOne(doc);
  return { ok: true, id: doc._id };
}

const contentKey = (c: PageContent) => JSON.stringify([c.sections, c.seo ?? null, c.jsonLd ?? [], c.frame ?? "default"]);

/** Replaces the working draft (any part left out keeps its current value). Never touches `live` — the public site is unaffected until publish. */
async function saveDraftContent(id: string, patch: Partial<PageContent>, actorId: string): Promise<Result> {
  const { pages } = await cols();
  const doc = await pages.findOne({ _id: id });
  if (!doc) return { ok: false, error: "Page not found." };
  const draft: PageContent = { sections: doc.draft.sections, seo: doc.draft.seo ?? null, jsonLd: doc.draft.jsonLd ?? [], frame: doc.draft.frame ?? "default", ...patch };
  const hasUnpublishedChanges = !doc.live || contentKey(doc.live) !== contentKey(draft);
  await pages.updateOne({ _id: id }, { $set: { draft, hasUnpublishedChanges, ...updateStamp(actorId) } });
  return { ok: true };
}

/** Saves the working draft's sections. */
export async function saveDraft(id: string, sections: PageSection[], actorId: string): Promise<Result> {
  return saveDraftContent(id, { sections }, actorId);
}

/** Saves the working draft's SEO, structured data and frame. */
export async function saveDraftSeo(id: string, seo: PageSeo | null, jsonLd: PageJsonLd[], frame: PageFrame, actorId: string): Promise<Result> {
  return saveDraftContent(id, { seo, jsonLd, frame }, actorId);
}

/** Adds, updates or removes one section in the draft (the page builder's unit of work) without the caller re-sending the whole array. */
export async function upsertDraftSection(id: string, section: PageSection, actorId: string): Promise<Result> {
  const { pages } = await cols();
  const doc = await pages.findOne({ _id: id });
  if (!doc) return { ok: false, error: "Page not found." };
  if (!SECTION_REGISTRY[section.type]) return { ok: false, error: "Unknown section type." };
  const sections = doc.draft.sections.some((s) => s.id === section.id)
    ? doc.draft.sections.map((s) => (s.id === section.id ? section : s))
    : [...doc.draft.sections, section];
  return saveDraft(id, sections, actorId);
}

export async function removeDraftSection(id: string, sectionId: string, actorId: string): Promise<Result> {
  const { pages } = await cols();
  const doc = await pages.findOne({ _id: id });
  if (!doc) return { ok: false, error: "Page not found." };
  return saveDraft(id, doc.draft.sections.filter((s) => s.id !== sectionId), actorId);
}

export async function reorderDraftSection(id: string, sectionId: string, orderKey: number, actorId: string): Promise<Result> {
  const { pages } = await cols();
  const doc = await pages.findOne({ _id: id });
  if (!doc) return { ok: false, error: "Page not found." };
  const sections = doc.draft.sections.map((s) => (s.id === sectionId ? { ...s, orderKey } : s));
  return saveDraft(id, sections, actorId);
}

export async function setSectionEnabled(id: string, sectionId: string, enabled: boolean, actorId: string): Promise<Result> {
  const { pages } = await cols();
  const doc = await pages.findOne({ _id: id });
  if (!doc) return { ok: false, error: "Page not found." };
  const sections = doc.draft.sections.map((s) => (s.id === sectionId ? { ...s, enabled } : s));
  return saveDraft(id, sections, actorId);
}

/** Every section in the draft must parse against its own type's validator before a publish is allowed. */
function draftIsValid(sections: PageSection[]): boolean {
  return sections.every((s) => {
    const def = SECTION_REGISTRY[s.type];
    return def ? def.parse(s.config) !== null : false;
  });
}

export async function publishPage(
  id: string,
  actorId: string,
  changeSummary: string
): Promise<Result<{ version: string }>> {
  const { pages, versions } = await cols();
  const doc = await pages.findOne({ _id: id });
  if (!doc) return { ok: false, error: "Page not found." };
  if (doc.draft.sections.length === 0) return { ok: false, error: "Add at least one section before publishing." };
  if (!draftIsValid(doc.draft.sections)) return { ok: false, error: "One or more sections have invalid content — fix them before publishing." };

  const isFirst = !doc.version;
  if (!isFirst && !doc.hasUnpublishedChanges) return { ok: false, error: "There are no unpublished changes to publish." };

  const version = nextVersion(doc.version, "minor");
  const versionDoc: CmsPageVersionDoc = {
    _id: newId(),
    pageId: id,
    path: doc.path,
    version,
    previousVersion: doc.version,
    sections: doc.draft.sections,
    seo: doc.draft.seo ?? null,
    jsonLd: doc.draft.jsonLd ?? [],
    frame: doc.draft.frame ?? "default",
    changeSummary: changeSummary.trim() || (isFirst ? "Initial publish" : "Published"),
    publishedAt: new Date(),
    publishedBy: actorId,
  };

  try {
    // The unique (pageId, version) index makes a concurrent double-publish fail here instead of overwriting.
    await versions.insertOne(versionDoc);
  } catch {
    return { ok: false, error: "Someone else just published this page. Reload to see the latest version." };
  }

  const res = await pages.findOneAndUpdate(
    { _id: id, version: doc.version },
    {
      $set: {
        live: { sections: doc.draft.sections, seo: doc.draft.seo ?? null, jsonLd: doc.draft.jsonLd ?? [], frame: doc.draft.frame ?? "default" },
        status: "published",
        version,
        hasUnpublishedChanges: false,
        publishedAt: versionDoc.publishedAt,
        ...updateStamp(actorId),
      },
    },
    { returnDocument: "after" }
  );
  if (!res) {
    await versions.deleteOne({ _id: versionDoc._id }); // compensate: the publish lost a race, leave no orphan version
    return { ok: false, error: "Someone else changed this page while you were publishing. Reload and try again." };
  }

  expireSiteCache();
  revalidatePath(doc.path === "/" ? "/" : doc.path);
  await cmsEvents.pagePublished({ id, path: doc.path, version }, actorId);
  return { ok: true, version };
}

export async function listVersions(pageId: string): Promise<CmsPageVersionDoc[]> {
  const { versions } = await cols();
  return versions.find({ pageId }, { sort: { publishedAt: -1 } }).toArray();
}

/** Loads a past version's sections into `draft` only — history is untouched, and publish creates a NEW version. */
/**
 * Throws away the draft's unpublished changes: the draft becomes the live
 * version again (sections, SEO, structured data, frame). Theme variants and
 * history are untouched. Returns the restored sections for the editor.
 */
export async function discardDraftChanges(id: string, actorId: string): Promise<Result<{ sections: PageSection[] }>> {
  const { pages } = await cols();
  const doc = await pages.findOne({ _id: id });
  if (!doc) return { ok: false, error: "Page not found." };
  if (!doc.live) return { ok: false, error: "This page has never been published, so there's no live version to go back to." };
  if (!doc.hasUnpublishedChanges) return { ok: false, error: "There are no unpublished changes to discard." };
  const live: PageContent = { sections: doc.live.sections, seo: doc.live.seo ?? null, jsonLd: doc.live.jsonLd ?? [], frame: doc.live.frame ?? "default" };
  await pages.updateOne({ _id: id }, { $set: { draft: live, hasUnpublishedChanges: false, ...updateStamp(actorId) } });
  return { ok: true, sections: live.sections };
}

export async function restoreVersionToDraft(id: string, version: string, actorId: string): Promise<Result> {
  const { versions } = await cols();
  const v = await versions.findOne({ pageId: id, version });
  if (!v) return { ok: false, error: "Version not found." };
  return saveDraftContent(id, { sections: v.sections, ...(v.seo !== undefined ? { seo: v.seo, jsonLd: v.jsonLd ?? [], frame: v.frame ?? "default" } : {}) }, actorId);
}

export async function deletePage(id: string, actorId = ""): Promise<Result> {
  const { pages } = await cols();
  const doc = await pages.findOne({ _id: id });
  if (!doc) return { ok: false, error: "Page not found." };
  await pages.deleteOne({ _id: id });
  if (doc.status === "published") {
    expireSiteCache();
    revalidatePath(doc.path === "/" ? "/" : doc.path);
  }
  await cmsEvents.pageDeleted({ path: doc.path }, actorId);
  return { ok: true };
}

// ── Per-theme section arrangements ──────────────────────────────────────
// Mirrors the draft.sections CRUD above (saveDraft/upsertDraftSection/etc.)
// but targets `themeVariants[themeKey].sections` — see the `ThemeVariant`
// doc comment for why there's no separate draft/publish step here.

export async function getThemeVariantSections(id: string, themeKey: string): Promise<PageSection[]> {
  const { pages } = await cols();
  const doc = await pages.findOne({ _id: id });
  return doc?.themeVariants?.[themeKey]?.sections ?? [];
}

async function saveThemeVariantSections(id: string, themeKey: string, sections: PageSection[], actorId: string): Promise<Result> {
  const { pages } = await cols();
  const doc = await pages.findOne({ _id: id });
  if (!doc) return { ok: false, error: "Page not found." };
  await pages.updateOne(
    { _id: id },
    { $set: { [`themeVariants.${themeKey}`]: { sections, updatedAt: new Date(), updatedBy: actorId }, ...updateStamp(actorId) } }
  );
  expireSiteCache();
  return { ok: true };
}

/** Seeds a theme's variant from the page's current default (live) sections, so the admin isn't starting from empty. */
export async function copyDefaultIntoThemeVariant(id: string, themeKey: string, actorId: string): Promise<Result> {
  const { pages } = await cols();
  const doc = await pages.findOne({ _id: id });
  if (!doc) return { ok: false, error: "Page not found." };
  const base = doc.live?.sections ?? doc.draft.sections;
  return saveThemeVariantSections(id, themeKey, structuredClone(base), actorId);
}

export async function deleteThemeVariant(id: string, themeKey: string, actorId: string): Promise<Result> {
  const { pages } = await cols();
  const doc = await pages.findOne({ _id: id });
  if (!doc) return { ok: false, error: "Page not found." };
  await pages.updateOne({ _id: id }, { $unset: { [`themeVariants.${themeKey}`]: "" }, $set: updateStamp(actorId) });
  expireSiteCache();
  return { ok: true };
}

export async function upsertThemeVariantSection(id: string, themeKey: string, section: PageSection, actorId: string): Promise<Result> {
  if (!SECTION_REGISTRY[section.type]) return { ok: false, error: "Unknown section type." };
  const current = await getThemeVariantSections(id, themeKey);
  const sections = current.some((s) => s.id === section.id) ? current.map((s) => (s.id === section.id ? section : s)) : [...current, section];
  return saveThemeVariantSections(id, themeKey, sections, actorId);
}

export async function removeThemeVariantSection(id: string, themeKey: string, sectionId: string, actorId: string): Promise<Result> {
  const current = await getThemeVariantSections(id, themeKey);
  return saveThemeVariantSections(id, themeKey, current.filter((s) => s.id !== sectionId), actorId);
}

export async function reorderThemeVariantSection(id: string, themeKey: string, sectionId: string, orderKey: number, actorId: string): Promise<Result> {
  const current = await getThemeVariantSections(id, themeKey);
  return saveThemeVariantSections(id, themeKey, current.map((s) => (s.id === sectionId ? { ...s, orderKey } : s)), actorId);
}

export async function setThemeVariantSectionEnabled(id: string, themeKey: string, sectionId: string, enabled: boolean, actorId: string): Promise<Result> {
  const current = await getThemeVariantSections(id, themeKey);
  return saveThemeVariantSections(id, themeKey, current.map((s) => (s.id === sectionId ? { ...s, enabled } : s)), actorId);
}
