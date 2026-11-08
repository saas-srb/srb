import type { SectionTypeDef, FieldSpec, SectionRenderContext } from "@/lib/products/sitecraft-ai/section-registry";
import { str, strOpt, bool, tone, strArr, objArr, record } from "@/lib/products/sitecraft-ai/parse-helpers";
import { resolveIcon } from "@/lib/products/sitecraft-ai/icon-map";
import { parseTextDictionary } from "@/lib/products/sitecraft-ai/site-info-shared";
import { brandify, brandTokens } from "@/lib/brand";
import CaseStudyShowcase from "@/components/sections/CaseStudyShowcase";
import ArticleHero from "@/components/sections/ArticleHero";
import ArticleBody, { type ArticleBlock } from "@/components/sections/ArticleBody";
import NextPost from "@/components/sections/NextPost";
import RelatedPosts from "@/components/sections/RelatedPosts";
import { nextPostIn, relatedPostsIn } from "@/lib/products/sitecraft-ai/blog-links";
import JobDetailContent from "@/components/sections/JobDetailContent";
import CategoryDetail from "@/components/sections/CategoryDetail";
import { JobBoard, EngagementModelsGrid, BlogListing, FeaturedCardStack } from "@/components/sections/IndexSections";
import TrainingMeta from "@/components/sections/TrainingMeta";
import { ListingGrid, TextPanel, TechShowcaseSection, LegalDocument, TagStrip } from "@/components/products/sitecraft-ai/section-wrappers";
import LiveDemoSection from "@/components/sections/LiveDemoSection";
import ProductGallery from "@/components/sections/ProductGallery";
import { SimpleServiceHero, SimpleServiceOverview, SimpleServiceCta } from "@/components/sections/SimpleServicePage";
import dynamic from "next/dynamic";

// Loaded on demand: the catalogue (and the product data behind it) is large and only
// /services/our-saas-product uses it — a static import here would put it in every page's bundle.
const SaasProductCatalogSection = dynamic(() => import("@/components/products/SaasProductCatalog").then((m) => m.SaasProductCatalogSection));

/**
 * Section types added for the Phase 4 migration of the rest of the public
 * site (industries, AI & automations, training, internships, hub pages, …).
 * Kept out of `section-registry.ts` only for size; merged into the same
 * `SECTION_REGISTRY`. Every renderer is an existing, untouched component (or
 * a wrapper reproducing the exact markup the page hand-wrote around it).
 */

// ── case-study-showcase ──────────────────────────────────────────────────

interface CaseStudyConfig { segment: string; title: string; challenge: string; solution: string; metric: string; metricLabel: string }
interface CaseStudyShowcaseConfig extends Record<string, unknown> {
  title: string;
  description?: string;
  caseStudies: CaseStudyConfig[];
  tone: "default" | "muted";
}

const caseStudyShowcase: SectionTypeDef<CaseStudyShowcaseConfig> = {
  type: "case-study-showcase",
  label: "Case Studies",
  defaultConfig: { title: "", caseStudies: [], tone: "default" },
  parse: (raw) => {
    const r = record(raw);
    const title = str(r.title, 200);
    const caseStudies = objArr(r.caseStudies, (x) => {
      const o = record(x);
      const t = str(o.title, 160);
      return t
        ? { segment: str(o.segment, 80), title: t, challenge: str(o.challenge, 600), solution: str(o.solution, 600), metric: str(o.metric, 40), metricLabel: str(o.metricLabel, 120) }
        : null;
    }, 12);
    if (!title || caseStudies.length === 0) return null;
    return { title, description: strOpt(r.description, 400), caseStudies, tone: tone(r.tone) };
  },
  Renderer: CaseStudyShowcase,
  toProps: (c) => ({ title: c.title, description: c.description, caseStudies: c.caseStudies, tone: c.tone }),
  fields: [
    { key: "title", label: "Title", kind: "text" },
    { key: "description", label: "Description", kind: "textarea" },
  ],
  repeaters: [
    {
      key: "caseStudies",
      label: "Case studies",
      itemFields: [
        { key: "segment", label: "Segment (e.g. \"K-12 Platform\")", kind: "text" },
        { key: "title", label: "Title", kind: "text" },
        { key: "challenge", label: "Challenge", kind: "textarea" },
        { key: "solution", label: "Solution", kind: "textarea" },
        { key: "metric", label: "Headline metric (e.g. \"3x\")", kind: "text" },
        { key: "metricLabel", label: "Metric label", kind: "text" },
      ],
    },
  ],
};

// ── training-meta ────────────────────────────────────────────────────────

interface TrainingMetaConfig extends Record<string, unknown> {
  items: { label: string; value: string; icon: string }[];
}

const trainingMeta: SectionTypeDef<TrainingMetaConfig> = {
  type: "training-meta",
  label: "Program Facts Strip",
  defaultConfig: { items: [] },
  parse: (raw) => {
    const r = record(raw);
    const items = objArr(r.items, (x) => {
      const o = record(x);
      const label = str(o.label, 80);
      return label ? { label, value: str(o.value, 120), icon: str(o.icon, 60) || "Clock" } : null;
    }, 8);
    return items.length ? { items } : null;
  },
  Renderer: TrainingMeta,
  toProps: (c) => ({ items: c.items.map((i) => ({ ...i, icon: resolveIcon(i.icon) })) }),
  fields: [],
  repeaters: [{ key: "items", label: "Facts", itemFields: [{ key: "label", label: "Label", kind: "text" }, { key: "value", label: "Value", kind: "text" }, { key: "icon", label: "Icon", kind: "icon" }] }],
};

// ── listing-grid ─────────────────────────────────────────────────────────

interface ListingItem { title: string; subtitle: string; description: string; href: string; icon: string; image: string; highlights: string[]; hidden?: boolean }
interface ListingGridConfig extends Record<string, unknown> {
  badge: string;
  badgeIcon: string;
  sectionLabel: string;
  ctaLabel?: string;
  items: ListingItem[];
  /** Style the brand name in item descriptions with the two-tone brand treatment (the About hub). */
  brandDescriptions?: boolean;
}

const LISTING_ITEM_FIELDS: FieldSpec[] = [
  { key: "title", label: "Title", kind: "text" },
  { key: "subtitle", label: "Subtitle", kind: "text" },
  { key: "description", label: "Description", kind: "textarea" },
  { key: "href", label: "Link", kind: "url" },
  { key: "icon", label: "Icon", kind: "icon" },
  { key: "image", label: "Image", kind: "image" },
  { key: "highlights", label: "Highlights", kind: "list" },
  { key: "hidden", label: "Hide this item", kind: "boolean" },
];

const listingGrid: SectionTypeDef<ListingGridConfig> = {
  type: "listing-grid",
  label: "Listing Grid (featured + cards)",
  defaultConfig: { badge: "", badgeIcon: "Layers", sectionLabel: "More", items: [] },
  parse: (raw) => {
    const r = record(raw);
    const items = objArr(r.items, (x) => {
      const o = record(x);
      const title = str(o.title, 120);
      const href = str(o.href, 500);
      if (!title || !href) return null;
      return { title, subtitle: str(o.subtitle, 200), description: str(o.description, 600), href, icon: str(o.icon, 60) || "Layers", image: str(o.image, 1000), highlights: strArr(o.highlights, 6, 60), hidden: bool(o.hidden) || undefined };
    }, 24);
    if (items.length === 0) return null;
    return {
      badge: str(r.badge, 60),
      badgeIcon: str(r.badgeIcon, 60) || "Layers",
      sectionLabel: str(r.sectionLabel, 80),
      ctaLabel: strOpt(r.ctaLabel, 60),
      items,
      brandDescriptions: bool(r.brandDescriptions) || undefined,
    };
  },
  Renderer: ListingGrid,
  toProps: (c, ctx) => ({
    badge: c.badge,
    badgeIcon: resolveIcon(c.badgeIcon),
    sectionLabel: c.sectionLabel,
    ctaLabel: c.ctaLabel,
    // Hidden items stay in the list (and the editor) but aren't shown — e.g. the legal pages on the About hub.
    items: c.items.filter((i) => !i.hidden).map((i) => ({ ...i, icon: resolveIcon(i.icon), description: c.brandDescriptions ? brandify(i.description, ctx.brand) : i.description })),
  }),
  fields: [
    { key: "badge", label: "Card badge", kind: "text" },
    { key: "badgeIcon", label: "Card badge icon", kind: "icon" },
    { key: "sectionLabel", label: "Label above the grid (e.g. \"More Industries\")", kind: "text" },
    { key: "ctaLabel", label: "Card button label (optional)", kind: "text" },
    { key: "brandDescriptions", label: "Style the brand name in descriptions with brand colours", kind: "boolean" },
  ],
  repeaters: [{ key: "items", label: "Items (the first is shown as the featured card)", itemFields: LISTING_ITEM_FIELDS }],
};

// ── text-product ───────────────────────────────────────────────────────────

interface TextPanelConfig extends Record<string, unknown> {
  title: string;
  body: string;
  brandBody?: boolean;
}

const textPanel: SectionTypeDef<TextPanelConfig> = {
  type: "text-panel",
  label: "Text Product",
  defaultConfig: { title: "", body: "" },
  parse: (raw) => {
    const r = record(raw);
    const title = str(r.title, 200);
    return title ? { title, body: str(r.body, 3000), brandBody: bool(r.brandBody) || undefined } : null;
  },
  Renderer: TextPanel,
  toProps: (c, ctx) => ({ title: c.title, body: c.brandBody ? brandify(c.body, ctx.brand) : c.body }),
  fields: [
    { key: "title", label: "Title", kind: "text" },
    { key: "body", label: "Text", kind: "textarea" },
    { key: "brandBody", label: "Style the brand name with brand colours", kind: "boolean" },
  ],
};

// ── tech-showcase ────────────────────────────────────────────────────────

interface TechCategoryConfig { id: string; name: string; icon: string; description: string; expertise: string[]; items: { name: string; blurb: string }[] }
interface TechShowcaseConfig extends Record<string, unknown> {
  eyebrow: string;
  headerIcon: string;
  heading: string;
  description: string;
  categories: TechCategoryConfig[];
  searchPlaceholder: string;
}

const techShowcase: SectionTypeDef<TechShowcaseConfig> = {
  type: "tech-showcase",
  label: "Technology Catalogue",
  defaultConfig: { eyebrow: "", headerIcon: "Layers", heading: "", description: "", categories: [], searchPlaceholder: "" },
  parse: (raw) => {
    const r = record(raw);
    const categories = objArr(r.categories, (x) => {
      const o = record(x);
      const name = str(o.name, 100);
      if (!name) return null;
      return {
        id: str(o.id, 80) || name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
        name,
        icon: str(o.icon, 60) || "Layers",
        description: str(o.description, 500),
        expertise: strArr(o.expertise, 8, 100),
        items: objArr(o.items, (y) => {
          const i = record(y);
          const n = str(i.name, 80);
          return n ? { name: n, blurb: str(i.blurb, 300) } : null;
        }, 40),
      };
    }, 30);
    if (categories.length === 0) return null;
    return { eyebrow: str(r.eyebrow, 80), headerIcon: str(r.headerIcon, 60) || "Layers", heading: str(r.heading, 200), description: str(r.description, 600), categories, searchPlaceholder: str(r.searchPlaceholder, 200) };
  },
  Renderer: TechShowcaseSection,
  toProps: (c) => ({
    eyebrow: c.eyebrow,
    headerIcon: resolveIcon(c.headerIcon),
    heading: c.heading,
    description: c.description,
    categories: c.categories.map((cat) => ({ ...cat, icon: resolveIcon(cat.icon) })),
    searchPlaceholder: c.searchPlaceholder,
  }),
  fields: [
    { key: "eyebrow", label: "Eyebrow label", kind: "text" },
    { key: "headerIcon", label: "Eyebrow icon", kind: "icon" },
    { key: "heading", label: "Heading", kind: "text" },
    { key: "description", label: "Description", kind: "textarea" },
    { key: "searchPlaceholder", label: "Search box placeholder", kind: "text" },
  ],
  repeaters: [
    {
      key: "categories",
      label: "Categories",
      itemFields: [
        { key: "name", label: "Name", kind: "text" },
        { key: "icon", label: "Icon", kind: "icon" },
        { key: "description", label: "Description", kind: "textarea" },
        { key: "expertise", label: "Expertise tags", kind: "list" },
      ],
    },
  ],
};

// ── legal-document ───────────────────────────────────────────────────────

interface LegalSectionItem { id: string; title: string; tocLabel?: string; icon: string; paragraphs: string[]; bullets: string[] }
interface LegalDocumentConfig extends Record<string, unknown> {
  sections: LegalSectionItem[];
}

const legalDocument: SectionTypeDef<LegalDocumentConfig> = {
  type: "legal-document",
  label: "Legal Document",
  defaultConfig: { sections: [] },
  parse: (raw) => {
    const r = record(raw);
    const sections = objArr(r.sections, (x) => {
      const o = record(x);
      const title = str(o.title, 200);
      if (!title) return null;
      return {
        id: str(o.id, 80) || title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
        title,
        tocLabel: strOpt(o.tocLabel, 200),
        icon: str(o.icon, 60) || "FileText",
        paragraphs: strArr(o.paragraphs, 20, 5000),
        bullets: strArr(o.bullets, 40, 1000),
      };
    }, 40);
    return sections.length ? { sections } : null;
  },
  Renderer: LegalDocument,
  toProps: (c, ctx) => ({
    sections: c.sections.map((s) => ({
      id: s.id,
      title: s.title,
      tocLabel: s.tocLabel ?? s.title,
      icon: resolveIcon(s.icon),
      paragraphs: s.paragraphs.map((p) => brandTokens(p, ctx.brand)),
      bullets: s.bullets.length ? s.bullets : undefined,
    })),
  }),
  fields: [],
  repeaters: [
    {
      key: "sections",
      label: "Sections (each also appears in the \"On this page\" list). Write [[brand]] for the brand-coloured wordmark.",
      itemFields: [
        { key: "title", label: "Title", kind: "text" },
        { key: "id", label: "Anchor id (for links, e.g. \"cookies-policy\")", kind: "text" },
        { key: "tocLabel", label: "\"On this page\" label (optional — defaults to the title)", kind: "text" },
        { key: "icon", label: "Icon", kind: "icon" },
        { key: "paragraphs", label: "Paragraphs", kind: "list" },
        { key: "bullets", label: "Bullet points", kind: "list" },
      ],
    },
  ],
};

// ── blog article sections ────────────────────────────────────────────────
// The article's body is CMS content. Its metadata (title, author, date,
// image, category) stays in `src/lib/blog.ts` — the /blog index, related /
// next-post links and each post's SEO metadata all read it, so a second copy
// here would drift. The hero / next / related sections reference it by slug.

// Slugs are free text, not a fixed list: posts added in the CMS must be selectable too.
// Whether the post exists is decided at render time from the live collection.
const POST_SLUG_FIELD: FieldSpec = { key: "slug", label: "Post slug (Collections → Blog Posts)", kind: "text" };
const postSlug = (r: Record<string, unknown>) => str(r.slug, 200) || null;
const findPost = (ctx: SectionRenderContext, slug: string) => ctx.blog.find((p) => p.slug === slug);

const articleHero: SectionTypeDef<{ slug: string }> = {
  type: "article-hero",
  label: "Article Header",
  defaultConfig: { slug: "" },
  parse: (raw) => {
    const slug = postSlug(record(raw));
    return slug ? { slug } : null;
  },
  Renderer: ArticleHero,
  toProps: (c, ctx) => {
    const post = findPost(ctx, c.slug);
    return post ? { post } : null;
  },
  fields: [POST_SLUG_FIELD],
};

const nextPost: SectionTypeDef<{ slug: string }> = {
  type: "next-post",
  label: "Next Article Link",
  defaultConfig: { slug: "" },
  parse: (raw) => {
    const slug = postSlug(record(raw));
    return slug ? { slug } : null;
  },
  Renderer: NextPost,
  toProps: (c, ctx) => (findPost(ctx, c.slug) && ctx.blog.length > 1 ? { post: nextPostIn(ctx.blog, c.slug) } : null),
  fields: [POST_SLUG_FIELD],
};

const relatedPosts: SectionTypeDef<{ slug: string; title?: string }> = {
  type: "related-posts",
  label: "Related Articles",
  defaultConfig: { slug: "" },
  parse: (raw) => {
    const r = record(raw);
    const slug = postSlug(r);
    return slug ? { slug, title: strOpt(r.title, 120) } : null;
  },
  Renderer: RelatedPosts,
  toProps: (c, ctx) => ({ posts: relatedPostsIn(ctx.blog, c.slug), title: c.title }),
  fields: [POST_SLUG_FIELD, { key: "title", label: "Heading (optional)", kind: "text" }],
};

const BLOCK_TYPES = ["lead", "p", "h2", "h3", "ul", "ol", "quote", "callout", "link"] as const;

function parseBlock(raw: unknown): ArticleBlock | null {
  const o = record(raw);
  const text = str(o.text, 6000);
  switch (o.type) {
    case "lead": case "p": case "h3": case "quote":
      return text ? { type: o.type, text } : null;
    case "h2":
      return text ? { type: "h2", text, id: str(o.id, 80) || text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) } : null;
    case "ul": case "ol": {
      const items = strArr(o.items, 30, 1000);
      return items.length ? { type: o.type, items } : null;
    }
    case "callout":
      return text ? { type: "callout", title: str(o.title, 200), text } : null;
    case "link": {
      const href = str(o.href, 500);
      return text && href ? { type: "link", text, href } : null;
    }
    default:
      return null;
  }
}

const articleBody: SectionTypeDef<{ blocks: ArticleBlock[] }> = {
  type: "article-body",
  label: "Article Body",
  defaultConfig: { blocks: [] },
  parse: (raw) => {
    const blocks = objArr(record(raw).blocks, parseBlock, 200);
    return blocks.length ? { blocks } : null;
  },
  Renderer: ArticleBody,
  toProps: (c) => ({ blocks: c.blocks }),
  fields: [],
  repeaters: [
    {
      key: "blocks",
      label: "Blocks — lead/p/h2/h3/quote use Text (**bold** works); ul/ol use Items; callout uses Title + Text; link uses Text + Link",
      itemFields: [
        { key: "type", label: "Block type", kind: "select", options: [...BLOCK_TYPES] },
        { key: "text", label: "Text", kind: "textarea" },
        { key: "title", label: "Title (callout)", kind: "text" },
        { key: "items", label: "Items (lists)", kind: "list" },
        { key: "href", label: "Link (link blocks)", kind: "url" },
        { key: "id", label: "Anchor id (h2, optional)", kind: "text" },
      ],
    },
  ],
};

// ── job-detail / engagement-detail ───────────────────────────────────────
// Same reasoning as the blog: a job posting / engagement model is a record
// that /careers, /resource-augmentation, the apply form and the homepage all
// read from their data files, so the page section references it by slug.

/** A section's "page text" group: every field a string (or a string list for `list` fields). */
function parseCopy(raw: unknown, fields: FieldSpec[]): Record<string, unknown> {
  const c = record(raw);
  return Object.fromEntries(fields.map((f) => [f.key, f.kind === "list" ? strArr(c[f.key], 30, 500) : str(c[f.key], f.kind === "textarea" ? 2000 : 500)]));
}

const JOB_COPY_FIELDS: FieldSpec[] = [
  { key: "heroImage", label: "Hero image", kind: "image" },
  { key: "categoryLabel", label: "Hero category label", kind: "text" },
  { key: "applyLabel", label: "Apply button label", kind: "text" },
  { key: "departmentLabel", label: "Label — department", kind: "text" },
  { key: "employmentTypeLabel", label: "Label — employment type", kind: "text" },
  { key: "locationLabel", label: "Label — location", kind: "text" },
  { key: "experienceLabel", label: "Label — experience", kind: "text" },
  { key: "responsibilitiesTitle", label: "Responsibilities — heading", kind: "text" },
  { key: "responsibilitiesDescription", label: "Responsibilities — text ({title} = job title)", kind: "textarea" },
  { key: "qualificationsTitle", label: "Qualifications — heading", kind: "text" },
  { key: "qualificationsDescription", label: "Qualifications — text", kind: "textarea" },
  { key: "niceToHaveTitle", label: "Nice to have — heading", kind: "text" },
  { key: "niceToHaveDescription", label: "Nice to have — text", kind: "textarea" },
  { key: "skillsTitle", label: "Skills — heading", kind: "text" },
  { key: "skillsDescription", label: "Skills — text", kind: "textarea" },
  { key: "perksTitle", label: "Perks — heading", kind: "text" },
  { key: "perksDescription", label: "Perks — text ({title} = job title)", kind: "textarea" },
  { key: "stepsTitle", label: "How to apply — heading", kind: "text" },
  { key: "stepsDescription", label: "How to apply — text", kind: "textarea" },
  { key: "ctaHeading", label: "Closing CTA — heading ({title} = job title)", kind: "text" },
  { key: "ctaDescription", label: "Closing CTA — text", kind: "textarea" },
  { key: "ctaLabel", label: "Closing CTA — button label", kind: "text" },
  { key: "ctaChecklist", label: "Closing CTA — checklist (one per line)", kind: "list" },
];

interface JobDetailConfig extends Record<string, unknown> {
  slug: string;
  copy: Record<string, unknown>;
  perks: { title: string; description: string; icon: string }[];
  steps: { title: string; duration: string; description: string; icon: string }[];
}

const jobDetail: SectionTypeDef<JobDetailConfig> = {
  type: "job-detail",
  label: "Job Posting",
  defaultConfig: { slug: "", copy: {}, perks: [], steps: [] },
  parse: (raw) => {
    const r = record(raw);
    const slug = str(r.slug, 120);
    if (!slug) return null;
    return {
      slug,
      copy: parseCopy(r.copy, JOB_COPY_FIELDS),
      perks: objArr(r.perks, (x) => {
        const o = record(x);
        const title = str(o.title, 200);
        return title ? { title, description: str(o.description, 1000), icon: str(o.icon, 60) } : null;
      }),
      steps: objArr(r.steps, (x) => {
        const o = record(x);
        const title = str(o.title, 200);
        return title ? { title, duration: str(o.duration, 200), description: str(o.description, 1000), icon: str(o.icon, 60) } : null;
      }),
    };
  },
  Renderer: JobDetailContent,
  toProps: (c, ctx) => {
    const job = ctx.jobs.find((j) => j.slug === c.slug);
    if (!job) return null;
    return {
      job,
      copy: c.copy,
      perks: c.perks.map((p) => ({ ...p, icon: resolveIcon(p.icon) })),
      steps: c.steps.map((st) => ({ ...st, icon: resolveIcon(st.icon) })),
    };
  },
  fields: [
    { key: "slug", label: "Job slug (Collections → Jobs)", kind: "text" },
    { key: "copy", label: "Page text", kind: "group", fields: JOB_COPY_FIELDS },
    {
      key: "perks", label: "What we offer", kind: "items",
      fields: [{ key: "title", label: "Title", kind: "text" }, { key: "description", label: "Description", kind: "textarea" }, { key: "icon", label: "Icon", kind: "icon" }],
    },
    {
      key: "steps", label: "How to apply — steps", kind: "items",
      fields: [{ key: "title", label: "Title", kind: "text" }, { key: "duration", label: "Duration", kind: "text" }, { key: "description", label: "Description", kind: "textarea" }, { key: "icon", label: "Icon", kind: "icon" }],
    },
  ],
};

const ENGAGEMENT_COPY_FIELDS: FieldSpec[] = [
  { key: "heroImage", label: "Hero image", kind: "image" },
  { key: "categoryLabel", label: "Hero category label", kind: "text" },
  { key: "quoteLabel", label: "Quote button label", kind: "text" },
  { key: "teamLabel", label: "Label — team composition", kind: "text" },
  { key: "billingLabel", label: "Label — billing type", kind: "text" },
  { key: "durationLabel", label: "Label — hiring duration", kind: "text" },
  { key: "priceLabel", label: "Label — starting price", kind: "text" },
  { key: "overviewTitle", label: "Overview — heading", kind: "text" },
  { key: "overviewDescription", label: "Overview — text ({title_lower} = model name)", kind: "textarea" },
  { key: "featuresTitle", label: "Features — heading", kind: "text" },
  { key: "featuresDescription", label: "Features — text", kind: "textarea" },
  { key: "useCaseTitle", label: "Ideal use case — heading", kind: "text" },
  { key: "useCaseDescription", label: "Ideal use case — text", kind: "textarea" },
  { key: "optionsEyebrow", label: "Plans — eyebrow", kind: "text" },
  { key: "optionsTitle", label: "Plans — heading", kind: "text" },
  { key: "optionCtaLabel", label: "Plans — button label", kind: "text" },
  { key: "deliverablesTitle", label: "Deliverables — heading", kind: "text" },
  { key: "deliverablesDescription", label: "Deliverables — text", kind: "textarea" },
  { key: "pricingTitle", label: "Pricing — heading", kind: "text" },
  { key: "processTitle", label: "Hiring process — heading", kind: "text" },
  { key: "processDescription", label: "Hiring process — text", kind: "textarea" },
  { key: "ctaHeading", label: "Closing CTA — heading ({title} = model name)", kind: "text" },
  { key: "ctaDescription", label: "Closing CTA — text", kind: "textarea" },
  { key: "ctaChecklist", label: "Closing CTA — checklist (one per line)", kind: "list" },
  { key: "mailSubject", label: "Enquiry email — subject ({title})", kind: "text" },
  { key: "mailOptionSubject", label: "Plan enquiry email — subject ({title}, {option})", kind: "text" },
  { key: "mailBody", label: "Enquiry email — body", kind: "textarea" },
];

const engagementDetail: SectionTypeDef<{ slug: string; copy: Record<string, unknown> }> = {
  type: "engagement-detail",
  label: "Engagement Model Details",
  defaultConfig: { slug: "", copy: {} },
  parse: (raw) => {
    const r = record(raw);
    const slug = str(r.slug, 120);
    return slug ? { slug, copy: parseCopy(r.copy, ENGAGEMENT_COPY_FIELDS) } : null;
  },
  Renderer: CategoryDetail,
  toProps: (c, ctx) => {
    const category = ctx.engagement.find((e) => e.slug === c.slug);
    return category ? { category, copy: c.copy } : null;
  },
  fields: [
    { key: "slug", label: "Engagement model slug (Collections → Engagement Models)", kind: "text" },
    { key: "copy", label: "Page text", kind: "group", fields: ENGAGEMENT_COPY_FIELDS },
  ],
};

// ── index-page listings (records come from their data files) ─────────────

const jobBoard: SectionTypeDef<{ badge: string; badgeIcon: string; allLabel: string; ctaLabel: string; image: string; categories: { name: string; icon: string }[] }> = {
  type: "job-board",
  label: "Job Board (open roles with filters)",
  defaultConfig: { badge: "", badgeIcon: "Briefcase", allLabel: "", ctaLabel: "", image: "", categories: [] },
  parse: (raw) => {
    const r = record(raw);
    return {
      badge: str(r.badge, 60),
      badgeIcon: str(r.badgeIcon, 60),
      allLabel: str(r.allLabel, 60),
      ctaLabel: str(r.ctaLabel, 60),
      image: str(r.image, 1000),
      categories: objArr(r.categories, (x) => {
        const o = record(x);
        const name = str(o.name, 120);
        return name ? { name, icon: str(o.icon, 60) } : null;
      }),
    };
  },
  Renderer: JobBoard,
  toProps: (c) => ({ ...c, badgeIcon: resolveIcon(c.badgeIcon), categories: c.categories.map((cat) => ({ name: cat.name, icon: resolveIcon(cat.icon) })) }),
  fields: [
    { key: "badge", label: "Card badge", kind: "text" },
    { key: "badgeIcon", label: "Card badge icon", kind: "icon" },
    { key: "allLabel", label: "\"All\" filter label", kind: "text" },
    { key: "ctaLabel", label: "Card button label", kind: "text" },
    { key: "image", label: "Card image", kind: "image" },
    {
      key: "categories", label: "Filters (job categories — must match the jobs' Category)", kind: "items",
      fields: [{ key: "name", label: "Category", kind: "text" }, { key: "icon", label: "Icon", kind: "icon" }],
    },
  ],
};

const engagementModelsGrid: SectionTypeDef<{ eyebrow: string; heading: string; description: string; featuredSlug: string; featuresLabel: string; ctaLabel: string }> = {
  type: "engagement-models-grid",
  label: "Engagement Model Cards",
  defaultConfig: { eyebrow: "", heading: "", description: "", featuredSlug: "", featuresLabel: "", ctaLabel: "" },
  parse: (raw) => {
    const r = record(raw);
    return {
      eyebrow: str(r.eyebrow, 80),
      heading: str(r.heading, 200),
      description: str(r.description, 600),
      featuredSlug: str(r.featuredSlug, 80),
      featuresLabel: str(r.featuresLabel, 60),
      ctaLabel: str(r.ctaLabel, 60),
    };
  },
  Renderer: EngagementModelsGrid,
  toProps: (c) => c,
  fields: [
    { key: "eyebrow", label: "Eyebrow", kind: "text" },
    { key: "heading", label: "Heading", kind: "text" },
    { key: "description", label: "Description", kind: "textarea" },
    { key: "featuredSlug", label: "Highlighted model (slug)", kind: "text" },
    { key: "featuresLabel", label: "Benefits label", kind: "text" },
    { key: "ctaLabel", label: "Card button label", kind: "text" },
  ],
};

const blogListing: SectionTypeDef<{ sectionLabel: string }> = {
  type: "blog-listing",
  label: "Blog Article List",
  defaultConfig: { sectionLabel: "" },
  parse: (raw) => ({ sectionLabel: str(record(raw).sectionLabel, 80) }),
  Renderer: BlogListing,
  toProps: (c) => c,
  fields: [{ key: "sectionLabel", label: "Label above the grid", kind: "text" }],
};

const featuredCardStack: SectionTypeDef<{ badge: string; badgeIcon: string; ctaLabel?: string; items: Omit<ListingItem, "hidden">[] }> = {
  type: "featured-card-stack",
  label: "Featured Cards (stacked)",
  defaultConfig: { badge: "", badgeIcon: "PlayCircle", items: [] },
  parse: (raw) => {
    const r = record(raw);
    const items = objArr(r.items, (x) => {
      const o = record(x);
      const title = str(o.title, 120);
      const href = str(o.href, 500);
      if (!title || !href) return null;
      return { title, subtitle: str(o.subtitle, 200), description: str(o.description, 600), href, icon: str(o.icon, 60) || "Sparkles", image: str(o.image, 1000), highlights: strArr(o.highlights, 6, 60) };
    }, 12);
    return items.length ? { badge: str(r.badge, 60), badgeIcon: str(r.badgeIcon, 60) || "PlayCircle", ctaLabel: strOpt(r.ctaLabel, 60), items } : null;
  },
  Renderer: FeaturedCardStack,
  toProps: (c) => ({ badge: c.badge, badgeIcon: resolveIcon(c.badgeIcon), ctaLabel: c.ctaLabel, items: c.items.map((i) => ({ ...i, icon: resolveIcon(i.icon) })) }),
  fields: [
    { key: "badge", label: "Card badge", kind: "text" },
    { key: "badgeIcon", label: "Card badge icon", kind: "icon" },
    { key: "ctaLabel", label: "Card button label (optional)", kind: "text" },
  ],
  repeaters: [{ key: "items", label: "Cards", itemFields: LISTING_ITEM_FIELDS.filter((f) => f.key !== "hidden") }],
};

// ── tag-strip / live-demo / product-gallery ──────────────────────────────

const tagStrip: SectionTypeDef<{ tags: string[] }> = {
  type: "tag-strip",
  label: "Tag Strip",
  defaultConfig: { tags: [] },
  parse: (raw) => {
    const tags = strArr(record(raw).tags, 20, 60);
    return tags.length ? { tags } : null;
  },
  Renderer: TagStrip,
  toProps: (c) => c,
  fields: [{ key: "tags", label: "Tags", kind: "list" }],
};

const liveDemo: SectionTypeDef<{ demoUrl: string; heading?: string; description?: string; previewImage: string; badge: string; launchLabel: string; newTabNote: string; previewAlt: string }> = {
  type: "live-demo",
  label: "Live Demo Launcher",
  defaultConfig: { demoUrl: "", previewImage: "", badge: "", launchLabel: "", newTabNote: "", previewAlt: "" },
  parse: (raw) => {
    const r = record(raw);
    const demoUrl = str(r.demoUrl, 500);
    return demoUrl
      ? {
          demoUrl, heading: strOpt(r.heading, 200), description: strOpt(r.description, 600), previewImage: str(r.previewImage, 1000),
          badge: str(r.badge, 80), launchLabel: str(r.launchLabel, 80), newTabNote: typeof r.newTabNote === "string" ? r.newTabNote.slice(0, 200) : "", previewAlt: str(r.previewAlt, 200),
        }
      : null;
  },
  Renderer: LiveDemoSection,
  toProps: (c) => c,
  fields: [
    { key: "demoUrl", label: "Demo URL", kind: "url" },
    { key: "heading", label: "Heading (optional)", kind: "text" },
    { key: "description", label: "Description (optional)", kind: "textarea" },
    { key: "previewImage", label: "Preview image", kind: "image" },
    { key: "previewAlt", label: "Preview image alt text", kind: "text" },
    { key: "badge", label: "Badge", kind: "text" },
    { key: "launchLabel", label: "Launch button label", kind: "text" },
    { key: "newTabNote", label: "New-tab note (before the URL — keep the trailing space)", kind: "text" },
  ],
};

const productGallery: SectionTypeDef<{ title: string; description?: string; images: { src: string; caption: string }[]; tone: "default" | "muted" }> = {
  type: "product-gallery",
  label: "Image Gallery",
  defaultConfig: { title: "", images: [], tone: "default" },
  parse: (raw) => {
    const r = record(raw);
    const images = objArr(r.images, (x) => {
      const o = record(x);
      const src = str(o.src, 1000);
      return src ? { src, caption: str(o.caption, 200) } : null;
    }, 24);
    const title = str(r.title, 200);
    return title && images.length ? { title, description: strOpt(r.description, 400), images, tone: tone(r.tone) } : null;
  },
  Renderer: ProductGallery,
  toProps: (c) => c,
  fields: [
    { key: "title", label: "Title", kind: "text" },
    { key: "description", label: "Description", kind: "textarea" },
  ],
  repeaters: [{ key: "images", label: "Images", itemFields: [{ key: "src", label: "Image", kind: "image" }, { key: "caption", label: "Caption", kind: "text" }] }],
};

// ── saas-product-catalog ─────────────────────────────────────────────────
// The whole Our SaaS Product catalogue (hero, value grid, ecosystem, product
// directory, flagship showcases, FAQ, demo form). Its products are the CMS
// products collection; its long-form copy stays in the component for now.

const saasProductCatalog: SectionTypeDef<{ text: Record<string, string>; categories: string[] }> = {
  type: "saas-product-catalog",
  label: "SaaS Product Catalogue",
  defaultConfig: { text: {}, categories: [] },
  parse: (raw) => {
    const r = record(raw);
    return { text: parseTextDictionary(r.text), categories: strArr(r.categories, 20, 80) };
  },
  Renderer: SaasProductCatalogSection,
  toProps: (c) => ({ text: c.text, categories: c.categories }),
  fields: [
    { key: "categories", label: "Filter tabs (the first one shows every product)", kind: "list" },
    { key: "text", label: "Catalogue text", kind: "dictionary" },
  ],
};

// ── simple-service-* ─────────────────────────────────────────────────────
// The plain service layout (/services/prediction-forecasting): hero, overview + contact card, closing CTA.

type Strs<K extends string> = Record<K, string> & Record<string, unknown>;
/** A section whose config is flat, all-required strings. */
function flatStrings<K extends string>(type: string, label: string, keys: { key: K; label: string; long?: boolean }[], Renderer: SectionTypeDef<Strs<K>>["Renderer"]): SectionTypeDef<Strs<K>> {
  return {
    type,
    label,
    defaultConfig: Object.fromEntries(keys.map((k) => [k.key, ""])) as Strs<K>,
    parse: (raw) => {
      const r = record(raw);
      const out = Object.fromEntries(keys.map((k) => [k.key, str(r[k.key], k.long ? 3000 : 300)])) as Strs<K>;
      return keys.every((k) => out[k.key]) ? out : null;
    },
    Renderer,
    toProps: (c) => ({ ...c }),
    fields: keys.map((k) => ({ key: k.key, label: k.label, kind: k.long ? "textarea" : "text" })),
  };
}

const simpleServiceHero = flatStrings("simple-service-hero", "Simple Service — Hero", [
  { key: "breadcrumbLabel", label: "Breadcrumb label" },
  { key: "title", label: "Title" },
  { key: "description", label: "Description", long: true },
], SimpleServiceHero);

interface SimpleServiceOverviewConfig extends Record<string, unknown> {
  heading: string; lead: string; text: string; capabilitiesHeading: string; capabilities: string[];
  cardTitle: string; cardText: string; cardCtaLabel: string; cardCtaHref: string;
}
const simpleServiceOverview: SectionTypeDef<SimpleServiceOverviewConfig> = {
  type: "simple-service-overview",
  label: "Simple Service — Overview",
  defaultConfig: { heading: "", lead: "", text: "", capabilitiesHeading: "", capabilities: [], cardTitle: "", cardText: "", cardCtaLabel: "", cardCtaHref: "" },
  parse: (raw) => {
    const r = record(raw);
    const heading = str(r.heading, 200);
    if (!heading) return null;
    return {
      heading,
      lead: str(r.lead, 3000),
      text: str(r.text, 3000),
      capabilitiesHeading: str(r.capabilitiesHeading, 200),
      capabilities: strArr(r.capabilities, 30, 500),
      cardTitle: str(r.cardTitle, 200),
      cardText: str(r.cardText, 1000),
      cardCtaLabel: str(r.cardCtaLabel, 100),
      cardCtaHref: str(r.cardCtaHref, 500),
    };
  },
  Renderer: SimpleServiceOverview,
  toProps: (c) => ({ ...c }),
  fields: [
    { key: "heading", label: "Heading", kind: "text" },
    { key: "lead", label: "Lead paragraph", kind: "textarea" },
    { key: "text", label: "Paragraph", kind: "textarea" },
    { key: "capabilitiesHeading", label: "Capabilities heading", kind: "text" },
    { key: "capabilities", label: "Capabilities (one per line)", kind: "list" },
    { key: "cardTitle", label: "Contact card — title", kind: "text" },
    { key: "cardText", label: "Contact card — text", kind: "textarea" },
    { key: "cardCtaLabel", label: "Contact card — button label", kind: "text" },
    { key: "cardCtaHref", label: "Contact card — button link", kind: "url" },
  ],
};

const simpleServiceCta = flatStrings("simple-service-cta", "Simple Service — CTA", [
  { key: "heading", label: "Heading" },
  { key: "ctaLabel", label: "Button label" },
  { key: "ctaHref", label: "Button link" },
], SimpleServiceCta);

// ── product-content ────────────────────────────────────────────────────────
// Marks a page whose main content is rendered by another product (/offers — Festival
// Offers, /rewards — Wallet, /ask — AI chatbot). The CMS page holds its SEO and
// structured data; this section renders nothing itself.

const PanelContentMarker = () => null;
const panelContent: SectionTypeDef<{ panel: string }> = {
  type: "panel-content",
  label: "Product-managed content (marker)",
  defaultConfig: { panel: "" },
  parse: (raw) => ({ panel: str(record(raw).panel, 80) }),
  Renderer: PanelContentMarker,
  toProps: () => ({}),
  fields: [{ key: "panel", label: "Managed by", kind: "text" }],
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- heterogeneous config types, same as SECTION_REGISTRY
export const PAGE_SECTION_TYPES: SectionTypeDef<any>[] = [
  caseStudyShowcase, trainingMeta, listingGrid, textPanel, techShowcase, legalDocument,
  articleHero, articleBody, nextPost, relatedPosts, jobDetail, engagementDetail,
  jobBoard, engagementModelsGrid, blogListing, featuredCardStack, tagStrip, liveDemo, productGallery,
  saasProductCatalog, simpleServiceHero, simpleServiceOverview, simpleServiceCta, panelContent,
];
