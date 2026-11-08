import "server-only";
import { requireViewer, can, SmmsInputError, ForbiddenError } from "@/lib/products/viralpulse-ai/viewer";
import { run } from "@/lib/products/viralpulse-ai/run";
import {
  createBrochure,
  getBrochure,
  listBrochures,
  updateBrochure,
  publishBrochure,
  unpublishBrochure,
  softDeleteBrochure,
  duplicateBrochure,
  renameBrochureSlug,
  listBrochureLeads,
  brochureAnalyticsSummary,
  requireBrochure,
} from "./store";
import { defaultSections, defaultMeta, defaultTheme } from "./defaults";
import type { BrochureCategory, BrochureSection, BrochureTheme, BrochureDoc, BrochureDetail, BrochureListItem } from "./types";
import { BROCHURE_CATEGORIES } from "./types";

/**
 * Business-logic API for the Brochure Builder. All methods resolve the viewer
 * from the session cookie, check permissions, and return `{ ok, ... }` or
 * throw. Used by server actions and route handlers.
 */

function toDetail(b: BrochureDoc): BrochureDetail {
  return {
    id: b._id,
    title: b.title,
    slug: b.slug,
    category: b.category,
    customCategory: b.customCategory,
    status: b.status,
    sections: b.sections,
    theme: b.theme,
    meta: b.meta,
    analytics: {
      views: b.analytics.views,
      ctaClicks: b.analytics.ctaClicks,
      formSubmissions: b.analytics.formSubmissions,
      lastViewedAt: b.analytics.lastViewedAt?.toISOString() ?? null,
    },
    publishedAt: b.publishedAt?.toISOString() ?? null,
    updatedAt: b.updatedAt.toISOString(),
    createdAt: b.createdAt.toISOString(),
  };
}

function toListItem(b: BrochureDoc): BrochureListItem {
  return {
    id: b._id,
    title: b.title,
    slug: b.slug,
    category: b.category,
    status: b.status,
    views: b.analytics.views,
    ctaClicks: b.analytics.ctaClicks,
    updatedAt: b.updatedAt.toISOString(),
    publishedAt: b.publishedAt?.toISOString() ?? null,
  };
}

// ── Validation helpers ────────────────────────────────────────────────────────

function parseCategory(v: unknown): BrochureCategory {
  if (typeof v === "string" && (BROCHURE_CATEGORIES as readonly string[]).includes(v)) {
    return v as BrochureCategory;
  }
  throw new SmmsInputError("Please select a valid brochure category.");
}

function parseTitle(v: unknown): string {
  const s = typeof v === "string" ? v.trim() : "";
  if (!s) throw new SmmsInputError("Brochure title is required.");
  if (s.length > 200) throw new SmmsInputError("Brochure title must be 200 characters or fewer.");
  return s;
}

function parseSections(v: unknown): BrochureSection[] {
  if (!Array.isArray(v)) throw new SmmsInputError("Sections must be an array.");
  if (v.length > 50) throw new SmmsInputError("A brochure can have at most 50 sections.");
  return v as BrochureSection[];
}

function parseTheme(v: unknown): BrochureTheme {
  if (typeof v !== "object" || !v) throw new SmmsInputError("Invalid theme.");
  return v as BrochureTheme;
}

function parseMeta(v: unknown): BrochureDoc["meta"] {
  if (typeof v !== "object" || !v) throw new SmmsInputError("Invalid meta.");
  const m = v as Record<string, unknown>;
  return {
    description: typeof m.description === "string" ? m.description.slice(0, 300) : "",
    keywords: typeof m.keywords === "string" ? m.keywords.slice(0, 300) : "",
    ogImage: typeof m.ogImage === "string" ? m.ogImage : null,
    favicon: typeof m.favicon === "string" ? m.favicon : null,
    logoUrl: typeof m.logoUrl === "string" ? m.logoUrl : null,
    logoAlt: typeof m.logoAlt === "string" ? m.logoAlt.slice(0, 120) : "",
    brandName: typeof m.brandName === "string" ? m.brandName.slice(0, 120) : "",
    qrEnabled: m.qrEnabled !== false,
  };
}

// ── API ───────────────────────────────────────────────────────────────────────

export async function createBrochureProject(input: { title: unknown; category: unknown; customCategory?: unknown }) {
  return run(["MANAGE_POSTS"], async (v) => {
    const title = parseTitle(input.title);
    const category = parseCategory(input.category);
    const customCategory = category === "custom" && typeof input.customCategory === "string" ? input.customCategory.trim().slice(0, 100) : null;
    const sections = defaultSections(category);
    const theme = defaultTheme();
    const meta = { ...defaultMeta(), brandName: "" };
    const brochure = await createBrochure({ title, category, customCategory, sections, theme, meta }, v.userId);
    return { brochure: toDetail(brochure) };
  });
}

export async function listBrochureProjects(opts: { q?: string; category?: string; status?: string; page?: number }) {
  return run(["MANAGE_POSTS"], async () => {
    const r = await listBrochures({ q: opts.q, category: opts.category, status: opts.status, page: opts.page, pageSize: 20 });
    return { items: r.items.map(toListItem), total: r.total, totalPages: r.totalPages };
  }, { revalidate: false });
}

export async function getBrochureProject(id: string) {
  return run(["MANAGE_POSTS"], async () => {
    const b = await requireBrochure(id);
    return { brochure: toDetail(b) };
  }, { revalidate: false });
}

export async function saveBrochureSections(id: string, sections: unknown[]) {
  return run(["MANAGE_POSTS"], async (v) => {
    await requireBrochure(id);
    await updateBrochure(id, { sections: parseSections(sections) }, v.userId);
    return {};
  });
}

export async function saveBrochureTheme(id: string, theme: unknown) {
  return run(["MANAGE_POSTS"], async (v) => {
    await requireBrochure(id);
    await updateBrochure(id, { theme: parseTheme(theme) }, v.userId);
    return {};
  });
}

export async function saveBrochureMeta(id: string, meta: unknown) {
  return run(["MANAGE_POSTS"], async (v) => {
    const b = await requireBrochure(id);
    const parsed = parseMeta(meta);
    if (typeof (meta as Record<string, unknown>)?.title === "string") {
      await updateBrochure(id, { title: parseTitle((meta as Record<string, unknown>).title), meta: parsed }, v.userId);
    } else {
      await updateBrochure(id, { meta: parsed }, v.userId);
    }
    return {};
  });
}

export async function publishBrochureProject(id: string) {
  return run(["MANAGE_POSTS"], async (v) => {
    const b = await requireBrochure(id);
    if (b.status === "published") return { slug: b.slug };
    await publishBrochure(id, v.userId);
    return { slug: b.slug };
  });
}

export async function unpublishBrochureProject(id: string) {
  return run(["MANAGE_POSTS"], async (v) => {
    await requireBrochure(id);
    await unpublishBrochure(id, v.userId);
    return {};
  });
}

export async function duplicateBrochureProject(id: string) {
  return run(["MANAGE_POSTS"], async (v) => {
    const source = await requireBrochure(id);
    const copy = await duplicateBrochure(source, v.userId);
    return { id: copy._id };
  });
}

export async function deleteBrochureProject(id: string) {
  return run(["MANAGE_POSTS"], async (v) => {
    await requireBrochure(id);
    await softDeleteBrochure(id, v.userId);
    return {};
  });
}

export async function getBrochureLeadsAndAnalytics(id: string) {
  return run(["VIEW_ANALYTICS"], async () => {
    await requireBrochure(id);
    const [leads, summary] = await Promise.all([listBrochureLeads(id, 50), brochureAnalyticsSummary(id)]);
    return {
      leads: leads.map((l) => ({
        id: l._id,
        fields: l.fields,
        submittedAt: l.submittedAt.toISOString(),
      })),
      analytics: summary,
    };
  }, { revalidate: false });
}

export async function renameBrochureSlugProject(id: string, newTitle: string) {
  return run(["MANAGE_POSTS"], async (v) => {
    if (!newTitle?.trim()) throw new SmmsInputError("Title is required.");
    const slug = await renameBrochureSlug(id, newTitle.trim(), v.userId);
    return { slug };
  });
}
