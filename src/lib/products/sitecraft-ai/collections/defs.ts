import type { LucideIcon } from "lucide-react";
import type { FieldSpec } from "@/lib/products/sitecraft-ai/section-registry";
import { str, strOpt, bool, strArr, objArr, record } from "@/lib/products/sitecraft-ai/parse-helpers";
import { CMS_ICON_MAP, resolveIcon } from "@/lib/products/sitecraft-ai/icon-map";
import type { BlogPostMeta, Job, JobListItem, BaseSalary, EngagementCategory } from "@/types/content";
import type { CollectionDef } from "./types";

/**
 * The CMS collections. Each parses stored records defensively (a bad CMS
 * write must never break the site) and turns a record into exactly the object
 * the components take. The records themselves live only in the CMS
 * (seeded from `cms-seed/collections/*.json` by the content migration).
 */

// ── helpers ──────────────────────────────────────────────────────────────

export const ICON_KEY_BY_COMPONENT = new Map<unknown, string>(Object.entries(CMS_ICON_MAP).map(([k, v]) => [v, k]));

/** Icon component -> icon-map key. Throws for an icon missing from the map, so a gap fails loudly in dev, not silently. */
export function iconKey(icon: LucideIcon): string {
  const key = ICON_KEY_BY_COMPONENT.get(icon);
  if (!key) throw new Error(`[cms] icon ${(icon as { displayName?: string }).displayName ?? "?"} is not in CMS_ICON_MAP`);
  return key;
}

const listItems = (v: unknown, max = 30) =>
  objArr(v, (x) => {
    const o = record(x);
    const title = str(o.title, 200);
    return title ? { title, description: str(o.description, 1000) } : null;
  }, max);

export const slugOf = (v: unknown) => str(v, 120).toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");

export const TITLE_DESC: FieldSpec[] = [
  { key: "title", label: "Title", kind: "text" },
  { key: "description", label: "Description", kind: "textarea" },
];

// ── blog ─────────────────────────────────────────────────────────────────

export const blogCollection: CollectionDef<BlogPostMeta, BlogPostMeta> = {
  key: "blog",
  label: "Blog Posts",
  singular: "Blog Post",
  pathOf: (slug) => `/blog/${slug}`,
  parse: (raw) => {
    const r = record(raw);
    const slug = slugOf(r.slug);
    const title = str(r.title, 200);
    if (!slug || !title) return null;
    return {
      slug,
      title,
      seoTitle: str(r.seoTitle, 200) || title,
      description: str(r.description, 400),
      excerpt: str(r.excerpt, 600),
      category: str(r.category, 80),
      keywords: strArr(r.keywords, 20, 100),
      tags: strArr(r.tags, 8, 40),
      image: str(r.image, 1000),
      imageAlt: str(r.imageAlt, 300),
      author: str(r.author, 120),
      date: str(r.date, 10),
      readTime: str(r.readTime, 40),
      related: strArr(r.related, 6, 120),
      ...(str(r.icon, 60) ? { icon: str(r.icon, 60) } : {}),
    };
  },
  toRuntime: (r) => r,
  titleOf: (r) => r.title,
  fields: [
    { key: "title", label: "Title", kind: "text" },
    { key: "seoTitle", label: "SEO title", kind: "text" },
    { key: "description", label: "Meta description", kind: "textarea" },
    { key: "excerpt", label: "Card excerpt", kind: "textarea" },
    { key: "category", label: "Category", kind: "text" },
    { key: "tags", label: "Card tags", kind: "list" },
    { key: "keywords", label: "SEO keywords", kind: "list" },
    { key: "image", label: "Image", kind: "image" },
    { key: "imageAlt", label: "Image alt text", kind: "text" },
    { key: "author", label: "Author", kind: "text" },
    { key: "date", label: "Publish date (YYYY-MM-DD)", kind: "text" },
    { key: "readTime", label: "Read time (e.g. \"8 min read\")", kind: "text" },
    { key: "related", label: "Related posts (slugs, up to 3)", kind: "list" },
    { key: "icon", label: "Category icon", kind: "icon" },
  ],
  blank: (slug) => ({ slug, title: "", seoTitle: "", description: "", excerpt: "", category: "", keywords: [], tags: [], image: "", imageAlt: "", author: "", date: new Date().toISOString().slice(0, 10), readTime: "5 min read", related: [] }),
};

// ── jobs ─────────────────────────────────────────────────────────────────

type StoredJob = Omit<Job, "icon"> & { icon: string };
const JOB_STATUSES = ["published", "draft", "closed", "expired"] as const;
const SALARY_UNITS = ["HOUR", "DAY", "WEEK", "MONTH", "YEAR"] as const;

function parseSalary(raw: unknown): BaseSalary | undefined {
  const r = record(raw);
  const currency = str(r.currency, 8);
  if (!currency) return undefined;
  const unitText = (SALARY_UNITS as readonly string[]).includes(r.unitText as string) ? (r.unitText as BaseSalary["unitText"]) : "YEAR";
  const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
  const out: BaseSalary = { currency, unitText };
  if (n(r.minValue) !== undefined) out.minValue = n(r.minValue);
  if (n(r.maxValue) !== undefined) out.maxValue = n(r.maxValue);
  if (n(r.value) !== undefined) out.value = n(r.value);
  return out;
}

export const jobsCollection: CollectionDef<StoredJob, Job> = {
  key: "jobs",
  label: "Jobs",
  singular: "Job",
  pathOf: (slug) => `/careers/${slug}`,
  parse: (raw) => {
    const r = record(raw);
    const slug = slugOf(r.slug);
    const title = str(r.title, 160);
    if (!slug || !title) return null;
    const job: StoredJob = {
      slug,
      title,
      category: str(r.category, 80),
      icon: str(r.icon, 60) || "Briefcase",
      summary: str(r.summary, 600),
      employmentType: str(r.employmentType, 60),
      location: str(r.location, 120),
      experience: str(r.experience, 60),
      responsibilities: listItems(r.responsibilities) as JobListItem[],
      qualifications: listItems(r.qualifications) as JobListItem[],
      niceToHave: strArr(r.niceToHave, 20, 300),
      skills: strArr(r.skills, 30, 80),
    };
    // Optional fields only when present, so a code record round-trips unchanged.
    if ((JOB_STATUSES as readonly string[]).includes(r.status as string)) job.status = r.status as Job["status"];
    if (strOpt(r.datePosted, 10)) job.datePosted = strOpt(r.datePosted, 10);
    if (strOpt(r.validThrough, 10)) job.validThrough = strOpt(r.validThrough, 10);
    const salary = parseSalary(r.baseSalary);
    if (salary) job.baseSalary = salary;
    if (typeof r.isRemote === "boolean") job.isRemote = r.isRemote;
    return job;
  },
  toRuntime: (r) => ({ ...r, icon: resolveIcon(r.icon) }),
  titleOf: (r) => r.title,
  fields: [
    { key: "title", label: "Title", kind: "text" },
    { key: "status", label: "Status (draft = hidden from search engines)", kind: "select", options: [...JOB_STATUSES] },
    { key: "category", label: "Category (filter group on /careers)", kind: "text" },
    { key: "icon", label: "Icon", kind: "icon" },
    { key: "summary", label: "Summary", kind: "textarea" },
    { key: "employmentType", label: "Employment type", kind: "text" },
    { key: "location", label: "Location", kind: "text" },
    { key: "experience", label: "Experience", kind: "text" },
    { key: "responsibilities", label: "Responsibilities", kind: "items", fields: TITLE_DESC },
    { key: "qualifications", label: "Qualifications", kind: "items", fields: TITLE_DESC },
    { key: "niceToHave", label: "Nice to have", kind: "list" },
    { key: "skills", label: "Skills", kind: "list" },
    { key: "datePosted", label: "Date posted (YYYY-MM-DD, optional)", kind: "text" },
    { key: "validThrough", label: "Valid through (YYYY-MM-DD, optional)", kind: "text" },
    { key: "isRemote", label: "Fully remote", kind: "boolean" },
    {
      key: "baseSalary",
      label: "Salary (optional — shown to search engines)",
      kind: "group",
      fields: [
        { key: "currency", label: "Currency (e.g. INR)", kind: "text" },
        { key: "minValue", label: "Minimum", kind: "number" },
        { key: "maxValue", label: "Maximum", kind: "number" },
        { key: "unitText", label: "Per", kind: "select", options: [...SALARY_UNITS] },
      ],
    },
  ],
  blank: (slug) => ({ slug, title: "", category: "Engineering & Development", icon: "Briefcase", summary: "", employmentType: "Full-time", location: "Chennai, India · Hybrid", experience: "", responsibilities: [], qualifications: [], niceToHave: [], skills: [], status: "draft" }),
};

// ── engagement models ────────────────────────────────────────────────────

type StoredEngagement = Omit<EngagementCategory, "icon" | "subOptions"> & {
  icon: string;
  subOptions: (Omit<EngagementCategory["subOptions"][number], "icon"> & { icon: string })[];
};

export const engagementCollection: CollectionDef<StoredEngagement, EngagementCategory> = {
  key: "engagement",
  label: "Engagement Models",
  singular: "Engagement Model",
  pathOf: (slug) => `/resource-augmentation/${slug}`,
  parse: (raw) => {
    const r = record(raw);
    const slug = slugOf(r.slug);
    const title = str(r.title, 160);
    if (!slug || !title) return null;
    const ch = record(r.cardHighlight);
    return {
      slug,
      title,
      icon: str(r.icon, 60) || "UserCheck",
      tagline: str(r.tagline, 200),
      summary: str(r.summary, 1000),
      cardHighlight: {
        engagementModel: str(ch.engagementModel, 200),
        idealUseCase: str(ch.idealUseCase, 300),
        teamComposition: str(ch.teamComposition, 200),
        pricing: str(ch.pricing, 80),
        billingType: str(ch.billingType, 120),
        hiringDuration: str(ch.hiringDuration, 120),
      },
      keyBenefits: strArr(r.keyBenefits, 12, 200),
      features: listItems(r.features),
      overview: listItems(r.overview),
      idealUseCase: strArr(r.idealUseCase, 12, 300),
      subOptions: objArr(r.subOptions, (x) => {
        const o = record(x);
        const t = str(o.title, 120);
        if (!t) return null;
        const sub = { slug: slugOf(o.slug) || slugOf(t), title: t, icon: str(o.icon, 60) || "UserCheck", tagline: str(o.tagline, 200), points: strArr(o.points, 8, 200), price: str(o.price, 60) } as StoredEngagement["subOptions"][number];
        if (bool(o.featured)) sub.featured = true;
        return sub;
      }, 12),
      subOptionsIntro: str(r.subOptionsIntro, 600),
      deliverables: strArr(r.deliverables, 20, 300),
      pricingIntro: str(r.pricingIntro, 600),
      hiringProcess: objArr(r.hiringProcess, (x) => {
        const o = record(x);
        const t = str(o.title, 120);
        return t ? { title: t, duration: str(o.duration, 60), topics: strArr(o.topics, 10, 200) } : null;
      }, 12),
      faqs: objArr(r.faqs, (x) => {
        const o = record(x);
        const q = str(o.question, 300);
        return q ? { question: q, answer: str(o.answer, 2000) } : null;
      }, 20),
    };
  },
  toRuntime: (r) => ({ ...r, icon: resolveIcon(r.icon), subOptions: r.subOptions.map((s) => ({ ...s, icon: resolveIcon(s.icon) })) }),
  titleOf: (r) => r.title,
  fields: [
    { key: "title", label: "Title", kind: "text" },
    { key: "icon", label: "Icon", kind: "icon" },
    { key: "tagline", label: "Tagline", kind: "text" },
    { key: "summary", label: "Summary", kind: "textarea" },
    {
      key: "cardHighlight",
      label: "Card highlights",
      kind: "group",
      fields: [
        { key: "pricing", label: "Price", kind: "text" },
        { key: "billingType", label: "Billing type", kind: "text" },
        { key: "engagementModel", label: "Engagement", kind: "text" },
        { key: "teamComposition", label: "Team size", kind: "text" },
        { key: "hiringDuration", label: "Duration", kind: "text" },
        { key: "idealUseCase", label: "Best for", kind: "textarea" },
      ],
    },
    { key: "keyBenefits", label: "Key benefits", kind: "list" },
    { key: "overview", label: "Overview", kind: "items", fields: TITLE_DESC },
    { key: "features", label: "Features", kind: "items", fields: TITLE_DESC },
    { key: "idealUseCase", label: "Ideal for", kind: "list" },
    { key: "subOptionsIntro", label: "Options intro", kind: "textarea" },
    {
      key: "subOptions",
      label: "Options",
      kind: "items",
      fields: [
        { key: "title", label: "Title", kind: "text" },
        { key: "icon", label: "Icon", kind: "icon" },
        { key: "tagline", label: "Tagline", kind: "text" },
        { key: "points", label: "Points", kind: "list" },
        { key: "price", label: "Price", kind: "text" },
        { key: "featured", label: "Highlight", kind: "boolean" },
      ],
    },
    { key: "deliverables", label: "Deliverables", kind: "list" },
    { key: "pricingIntro", label: "Pricing intro", kind: "textarea" },
    {
      key: "hiringProcess",
      label: "Hiring process",
      kind: "items",
      fields: [
        { key: "title", label: "Step", kind: "text" },
        { key: "duration", label: "Duration", kind: "text" },
        { key: "topics", label: "Details", kind: "list" },
      ],
    },
    { key: "faqs", label: "FAQs", kind: "items", fields: [{ key: "question", label: "Question", kind: "text" }, { key: "answer", label: "Answer", kind: "textarea" }] },
  ],
  blank: (slug) => ({ slug, title: "", icon: "UserCheck", tagline: "", summary: "", cardHighlight: { engagementModel: "", idealUseCase: "", teamComposition: "", pricing: "", billingType: "", hiringDuration: "" }, keyBenefits: [], features: [], overview: [], idealUseCase: [], subOptions: [], subOptionsIntro: "", deliverables: [], pricingIntro: "", hiringProcess: [], faqs: [] }),
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- heterogeneous record types
export const SITE_COLLECTIONS = { blog: blogCollection, jobs: jobsCollection, engagement: engagementCollection } satisfies Record<string, CollectionDef<any, any>>;
