import type { ProductCtaKind, ProductItem, ProductPageItem } from "@/types/content";
import { str, strArr, objArr, record } from "@/lib/products/sitecraft-ai/parse-helpers";
import { resolveIcon } from "@/lib/products/sitecraft-ai/icon-map";
import { slugOf, TITLE_DESC } from "./defs";
import type { CollectionDef } from "./types";
import type { FieldSpec } from "@/lib/products/sitecraft-ai/section-registry";

/**
 * SaaS products — its own module (not in `defs.ts`) so the large product
 * catalogue only ships to the one page that shows it, not to every page
 * that renders CMS sections.
 */

type StoredProduct = Omit<ProductItem, "icon">;
const CTA_KINDS = ["get-started", "request-demo", "start-using", "none"] as const;
const ctaKind = (v: unknown): ProductCtaKind | undefined => ((CTA_KINDS as readonly unknown[]).includes(v) ? (v as ProductCtaKind) : undefined);
/** `{ title, description, icon? }` entries (features, benefits, use cases, AI features). */
function pageItems(v: unknown, max = 12): ProductPageItem[] {
  return objArr(v, (x) => {
    const o = record(x);
    const title = str(o.title, 160);
    if (!title) return null;
    const icon = str(o.icon, 60);
    return { title, description: str(o.description, 1000), ...(icon ? { icon } : {}) };
  }, max);
}
/** Only relative paths and http(s) links — a stored `javascript:` URL must never become an href/src. */
const safeUrl = (v: unknown, max = 500): string => {
  const s = str(v, max);
  return s.startsWith("/") && !s.startsWith("//") ? s : /^https?:\/\//i.test(s) ? s : "";
};
const PRODUCT_CATEGORY_OPTIONS = ["Executive & Operations", "HR & Talent", "Project & Delivery", "Procurement & Finance", "Sales & Marketing", "AI & Intelligence", "Assessment & Security"] as const;

const PAGE_ITEM: FieldSpec[] = [...TITLE_DESC, { key: "icon", label: "Icon", kind: "icon" }];

export const productsCollection: CollectionDef<StoredProduct, ProductItem> = {
  key: "products",
  label: "SaaS Products",
  singular: "Product",
  // Products open in a modal on /services/our-saas-product, and each has its own page at /products/<slug> (platform owner's site only).
  parse: (raw) => {
    const r = record(raw);
    const slug = slugOf(r.slug);
    const name = str(r.name, 120);
    if (!slug || !name) return null;
    const category = (PRODUCT_CATEGORY_OPTIONS as readonly string[]).includes(r.category as string) ? (r.category as ProductItem["category"]) : "AI & Intelligence";
    const p: StoredProduct = {
      id: str(r.id, 120) || slug,
      slug,
      name,
      badge: str(r.badge, 60),
      tagline: str(r.tagline, 200),
      category,
      panelPath: str(r.panelPath, 200),
      iconName: str(r.iconName, 60) || "Sparkles",
      shortDescription: str(r.shortDescription, 600),
      fullDescription: str(r.fullDescription, 3000),
      primaryPurpose: str(r.primaryPurpose, 1000),
      problemSolved: str(r.problemSolved, 1000),
      businessOutcome: str(r.businessOutcome, 1000),
      targetDepartments: strArr(r.targetDepartments, 20, 80),
      targetUsers: strArr(r.targetUsers, 20, 80),
      aiCapabilities: strArr(r.aiCapabilities, 20, 300),
      keyFeatures: objArr(r.keyFeatures, (x) => {
        const o = record(x);
        const t = str(o.title, 160);
        return t ? ({ ...o, title: t, description: str(o.description, 1000) } as ProductItem["keyFeatures"][number]) : null;
      }, 30),
      metrics: objArr(r.metrics, (x) => {
        const o = record(x);
        const label = str(o.label, 80);
        return label ? { label, value: str(o.value, 40) } : null;
      }, 12),
      // Screens & hotspots drive the interactive mockup; kept as authored (validated shallowly).
      screens: Array.isArray(r.screens) ? (r.screens as ProductItem["screens"]) : [],
      hotspots: Array.isArray(r.hotspots) ? (r.hotspots as ProductItem["hotspots"]) : [],
      accentColor: str(r.accentColor, 200),
    };
    // Product-page content: each is set only when present, so records without it stay exactly as they were.
    const shortName = str(r.shortName, 60);
    if (shortName) p.shortName = shortName;
    const valueLine = str(r.valueLine, 140);
    if (valueLine) p.valueLine = valueLine;
    const pitch = str(r.pitch, 600);
    if (pitch) p.pitch = pitch;
    const overview = str(r.overview, 3000);
    if (overview) p.overview = overview;
    const outcome = str(r.outcome, 1000);
    if (outcome) p.outcome = outcome;
    const audience = str(r.audience, 1000);
    if (audience) p.audience = audience;
    const facts = objArr(r.facts, (x) => {
      const o = record(x);
      const label = str(o.label, 80);
      return label ? { label, value: str(o.value, 40) } : null;
    }, 8);
    if (facts.length) p.facts = facts;
    for (const k of ["features", "aiFeatures", "benefits", "useCases"] as const) {
      const items = pageItems(r[k], k === "features" ? 16 : 12);
      if (items.length) p[k] = items;
    }
    const workflows = objArr(r.automationWorkflows, (x) => {
      const o = record(x);
      const title = str(o.title, 160);
      return title ? { title, description: str(o.description, 1000), steps: strArr(o.steps, 10, 300) } : null;
    }, 8);
    if (workflows.length) p.automationWorkflows = workflows;
    const integrations = objArr(r.integrations, (x) => {
      const o = record(x);
      const name = str(o.name, 120);
      if (!name) return null;
      const href = safeUrl(o.href);
      return { name, description: str(o.description, 600), ...(href ? { href } : {}) };
    }, 16);
    if (integrations.length) p.integrations = integrations;
    const scenarios = strArr(r.scenarios, 12, 400);
    if (scenarios.length) p.scenarios = scenarios;
    const faq = objArr(r.faq, (x) => {
      const o = record(x);
      const q = str(o.q, 300);
      const a = str(o.a, 1500);
      return q && a ? { q, a } : null;
    }, 16);
    if (faq.length) p.faq = faq;
    const screenshots = objArr(r.screenshots, (x) => {
      const o = record(x);
      const src = safeUrl(o.src);
      return src ? { src, alt: str(o.alt, 300), caption: str(o.caption, 300) } : null;
    }, 12);
    if (screenshots.length) p.screenshots = screenshots;
    const problemIntro = str(r.problemIntro, 1000);
    if (problemIntro) p.problemIntro = problemIntro;
    const problems = pageItems(r.problems, 8);
    if (problems.length) p.problems = problems;
    const beforeAfter = objArr(r.beforeAfter, (x) => {
      const o = record(x);
      const before = str(o.before, 400);
      const after = str(o.after, 400);
      return before && after ? { before, after } : null;
    }, 8);
    if (beforeAfter.length) p.beforeAfter = beforeAfter;
    const ctas = record(r.ctas);
    const primary = ctaKind(ctas.primary);
    const secondary = ctaKind(ctas.secondary);
    if (primary || secondary) p.ctas = { ...(primary ? { primary } : {}), ...(secondary ? { secondary } : {}) };
    // Keep an explicit `false` too — the built-in catalogue sets it on some products.
    if (typeof r.isFeatured === "boolean") p.isFeatured = r.isFeatured;
    return p;
  },
  toRuntime: (r) => ({ ...r, icon: resolveIcon(r.iconName) }),
  titleOf: (r) => r.name,
  fields: [
    { key: "name", label: "Name", kind: "text" },
    { key: "badge", label: "Badge", kind: "text" },
    { key: "tagline", label: "Tagline", kind: "text" },
    { key: "category", label: "Category", kind: "select", options: [...PRODUCT_CATEGORY_OPTIONS] },
    { key: "iconName", label: "Icon", kind: "icon" },
    { key: "panelPath", label: "Product product link", kind: "text" },
    { key: "isFeatured", label: "Featured", kind: "boolean" },
    { key: "shortDescription", label: "Short description", kind: "textarea" },
    { key: "fullDescription", label: "Full description", kind: "textarea" },
    { key: "primaryPurpose", label: "Primary purpose", kind: "textarea" },
    { key: "problemSolved", label: "Problem solved", kind: "textarea" },
    { key: "businessOutcome", label: "Business outcome", kind: "textarea" },
    { key: "targetDepartments", label: "Target departments", kind: "list" },
    { key: "targetUsers", label: "Target users", kind: "list" },
    { key: "aiCapabilities", label: "AI capabilities (catalogue pop-up; the product page uses \"AI features\" below when set)", kind: "list" },
    { key: "keyFeatures", label: "Key features (catalogue pop-up; the product page uses \"Features\" below when set)", kind: "items", fields: TITLE_DESC },
    { key: "metrics", label: "Metrics (catalogue pop-up; the product page uses \"Key facts\" below when set)", kind: "items", fields: [{ key: "label", label: "Label", kind: "text" }, { key: "value", label: "Value", kind: "text" }] },
    { key: "accentColor", label: "Accent colour classes", kind: "text" },
    // ── Product page (/products/<slug>) ──
    { key: "shortName", label: "Page: short name for menus and chips (e.g. HR & Payroll)", kind: "text" },
    { key: "valueLine", label: "Page: one-line value for menus and cards", kind: "text" },
    { key: "pitch", label: "Page: hero pitch (falls back to the short description)", kind: "textarea" },
    { key: "overview", label: "Page: what it does (falls back to the full description)", kind: "textarea" },
    { key: "outcome", label: "Page: business outcome (falls back to the business outcome above)", kind: "textarea" },
    { key: "facts", label: "Page: key facts — only verifiable figures", kind: "items", fields: [{ key: "label", label: "Label", kind: "text" }, { key: "value", label: "Value", kind: "text" }] },
    { key: "features", label: "Page: features", kind: "items", fields: PAGE_ITEM },
    { key: "aiFeatures", label: "Page: AI features — only AI that really exists", kind: "items", fields: PAGE_ITEM },
    { key: "benefits", label: "Page: benefits", kind: "items", fields: PAGE_ITEM },
    { key: "useCases", label: "Page: use cases", kind: "items", fields: PAGE_ITEM },
    { key: "automationWorkflows", label: "Page: automation & workflows", kind: "items", fields: [...TITLE_DESC, { key: "steps", label: "Steps", kind: "list" }] },
    { key: "integrations", label: "Page: works with — other products and real integration points", kind: "items", fields: [{ key: "name", label: "Name", kind: "text" }, { key: "description", label: "Description", kind: "textarea" }, { key: "href", label: "Link (optional)", kind: "text" }] },
    { key: "scenarios", label: "Page: supported business scenarios", kind: "list" },
    { key: "faq", label: "Page: FAQ", kind: "items", fields: [{ key: "q", label: "Question", kind: "text" }, { key: "a", label: "Answer", kind: "textarea" }] },
    { key: "audience", label: "Page: who it is for", kind: "textarea" },
    { key: "problemIntro", label: "Page: the problem it solves — introduction (general operational challenges only)", kind: "textarea" },
    { key: "problems", label: "Page: the problem it solves — problem cards (4-6)", kind: "items", fields: PAGE_ITEM },
    { key: "beforeAfter", label: "Page: without it / with it — pairs (3-4); \"with it\" must be something the product really does", kind: "items", fields: [{ key: "before", label: "Without it", kind: "textarea" }, { key: "after", label: "With it", kind: "textarea" }] },
    { key: "screenshots", label: "Page: screenshots (optional — the interactive preview is always shown)", kind: "items", fields: [{ key: "src", label: "Image", kind: "image" }, { key: "alt", label: "Alt text", kind: "text" }, { key: "caption", label: "Caption", kind: "text" }] },
    { key: "ctas", label: "Page: call-to-action override", kind: "group", fields: [{ key: "primary", label: "Primary", kind: "select", options: [...CTA_KINDS] }, { key: "secondary", label: "Secondary", kind: "select", options: [...CTA_KINDS] }] },
  ],
  blank: (slug) => ({ id: slug, slug, name: "", badge: "", tagline: "", category: "AI & Intelligence", panelPath: "", iconName: "Sparkles", shortDescription: "", fullDescription: "", primaryPurpose: "", problemSolved: "", businessOutcome: "", targetDepartments: [], targetUsers: [], aiCapabilities: [], keyFeatures: [], metrics: [], screens: [], hotspots: [], accentColor: "" }),
};

