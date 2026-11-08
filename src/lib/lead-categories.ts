import "server-only";
import { CATEGORIES, categoryAcceptsResume, getSubServices } from "@/lib/categories";
import { getDb } from "@/lib/mongodb";
import { isPlatformOwnerContext } from "@/lib/platform/tenancy/context";

/**
 * What a visitor can ask about on a company's contact form. The platform operator keeps its fixed service categories (`categories.ts`);
 * every other company has its own list, stored in its own data (`lead_categories`), never the operator's. With nothing configured it is one
 * neutral "General enquiry" with no sub-services, so the form shows just the person's details and message.
 */
export interface LeadCategoryConfig {
  slug: string;
  label: string;
  acceptsResume: boolean;
  subServices: { slug: string; label: string }[];
}

export interface LeadCategorySet {
  /** false = the operator's built-in categories (existing behaviour, untouched). */
  custom: boolean;
  categories: LeadCategoryConfig[];
}

const DOC_ID = "config";
export const DEFAULT_LEAD_CATEGORY: LeadCategoryConfig = { slug: "general-enquiry", label: "General enquiry", acceptsResume: false, subServices: [] };
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

async function collection() {
  return (await getDb()).collection<{ _id: string; categories: LeadCategoryConfig[] }>("lead_categories");
}

/** Cleans stored/entered categories: valid slugs, trimmed labels, no duplicates. */
export function normalizeLeadCategories(input: unknown): LeadCategoryConfig[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const out: LeadCategoryConfig[] = [];
  for (const raw of input.slice(0, 20)) {
    const r = (raw ?? {}) as Partial<LeadCategoryConfig>;
    const label = typeof r.label === "string" ? r.label.trim().slice(0, 80) : "";
    const slug = typeof r.slug === "string" ? r.slug.trim().toLowerCase() : "";
    if (!label || !SLUG_RE.test(slug) || slug.length > 60 || seen.has(slug)) continue;
    seen.add(slug);
    const subSeen = new Set<string>();
    const subServices = (Array.isArray(r.subServices) ? r.subServices : []).slice(0, 40).flatMap((s) => {
      const sl = typeof s?.label === "string" ? s.label.trim().slice(0, 80) : "";
      const ss = typeof s?.slug === "string" ? s.slug.trim().toLowerCase() : "";
      if (!sl || !SLUG_RE.test(ss) || subSeen.has(ss)) return [];
      subSeen.add(ss);
      return [{ slug: ss, label: sl }];
    });
    out.push({ slug, label, acceptsResume: r.acceptsResume === true, subServices });
  }
  return out;
}

export async function getLeadCategories(): Promise<LeadCategorySet> {
  if (await isPlatformOwnerContext()) {
    return { custom: false, categories: CATEGORIES.map((c) => ({ slug: c.slug, label: c.label, acceptsResume: categoryAcceptsResume(c.slug), subServices: getSubServices(c.slug) })) };
  }
  const doc = await (await collection()).findOne({ _id: DOC_ID });
  const categories = normalizeLeadCategories(doc?.categories);
  return { custom: true, categories: categories.length ? categories : [DEFAULT_LEAD_CATEGORY] };
}

export async function saveLeadCategories(input: unknown): Promise<LeadCategoryConfig[]> {
  const categories = normalizeLeadCategories(input);
  await (await collection()).updateOne({ _id: DOC_ID }, { $set: { categories } }, { upsert: true });
  return categories;
}
