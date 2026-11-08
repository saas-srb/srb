import type { ComponentType, ReactNode } from "react";
import PageHero from "@/components/sections/PageHero";
import CourseOverview from "@/components/sections/CourseOverview";
import ChecklistGrid from "@/components/sections/ChecklistGrid";
import TechStackGrid from "@/components/sections/TechStackGrid";
import CurriculumTimeline from "@/components/sections/CurriculumTimeline";
import ArchitectureOverview from "@/components/sections/ArchitectureOverview";
import ProjectShowcase from "@/components/sections/ProjectShowcase";
import DeliveryTimeline from "@/components/sections/DeliveryTimeline";
import FAQAccordion from "@/components/sections/FAQAccordion";
import RelatedServices from "@/components/sections/RelatedServices";
import DetailCTA from "@/components/sections/DetailCTA";
import ListingHero from "@/components/sections/ListingHero";
import StatsBand from "@/components/sections/StatsBand";
import HomeHero from "@/components/sections/home/HomeHero";
import { FeatureHighlightsSection, ServicePillarsGrid, type PillarCardConfig } from "@/components/products/sitecraft-ai/section-wrappers";
import { resolveIcon } from "@/lib/products/sitecraft-ai/icon-map";
import { renderInline } from "@/lib/products/sitecraft-ai/rich-text";
import { brandify, type BrandName } from "@/lib/brand";
import { HOME_SECTION_TYPES } from "@/lib/products/sitecraft-ai/section-registry-home";
import { PAGE_SECTION_TYPES } from "@/lib/products/sitecraft-ai/section-registry-pages";
import { FORM_SECTION_TYPES } from "@/lib/products/sitecraft-ai/section-registry-forms";
import { AGENT_SECTION_TYPES } from "@/lib/products/sitecraft-ai/section-registry-agents";
import type { BlogPostMeta } from "@/types/content";
import type { Job } from "@/types/content";
import type { EngagementCategory } from "@/types/content";
import { str, strOpt, bool, tone, strArr, numOr, objArr, record } from "@/lib/products/sitecraft-ai/parse-helpers";

/**
 * The architectural core of the page builder: one entry per section "type".
 * `parse` is a hand-rolled validate+normalize function (this codebase never
 * uses zod — see e.g. `src/lib/seo-product/db.ts`'s `str`/`num` helpers and
 * `src/lib/evaliq/question-types.ts`'s per-type registry), returning `null` for
 * unusable input so the renderer can skip it rather than crash. `toProps`
 * converts JSON-safe config (icon keys, plain strings) into the real props
 * the existing `sections/*` component expects (icon components, ReactNode).
 * `Renderer` is always the existing, untouched component — adding a new type
 * later is one entry here; the renderer and builder UI never change.
 *
 * `fields`/`repeaters`/`objectFields` describe the config's editable shape so
 * ONE generic admin form (`SectionConfigForm`) can edit every type, instead
 * of a bespoke hand-built form per type — see `src/components/sitecraft-ai/SectionConfigForm.tsx`.
 */
/**
 * `list` = an array of plain strings, edited one-per-line. `select` = one of
 * `options`. `group` = a nested object with its own `fields`; `items` = an
 * array of such objects — both nest to any depth. `dictionary` = keyed text
 * (key → text) whose keys are set by code, edited one text box per key.
 */
export type FieldKind = "text" | "textarea" | "icon" | "image" | "boolean" | "url" | "number" | "list" | "select" | "group" | "items" | "dictionary";

export interface FieldSpec {
  key: string;
  label: string;
  kind: FieldKind;
  /** For `select`: the allowed values. */
  options?: string[];
  /** For `group` / `items`: the nested fields. */
  fields?: FieldSpec[];
}

/**
 * What a section's `toProps` can read besides its own config: the merged
 * (code + published CMS) collection records the page is rendering with —
 * see `CollectionsContext`.
 */
export interface SectionRenderContext {
  blog: BlogPostMeta[];
  jobs: Job[];
  engagement: EngagementCategory[];
  /** The site's wordmark (CMS → Site Identity) for brand-styled text. */
  brand: BrandName;
}

export interface RepeaterFieldSpec {
  key: string;
  label: string;
  itemFields: FieldSpec[];
}

export interface ObjectFieldSpec {
  key: string;
  label: string;
  itemFields: FieldSpec[];
}

export interface SectionTypeDef<Config extends Record<string, unknown> = Record<string, unknown>> {
  type: string;
  label: string;
  parse: (raw: unknown) => Config | null;
  defaultConfig: Config;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Renderer: ComponentType<any>;
  /** `null` = nothing to render (e.g. the record a section points at is archived). */
  toProps: (config: Config, ctx: SectionRenderContext) => Record<string, unknown> | null;
  fields: FieldSpec[];
  repeaters?: RepeaterFieldSpec[];
  objectFields?: ObjectFieldSpec[];
}

// Common repeater item-field shapes, reused across several types.
const TITLE_DESC_FIELDS: FieldSpec[] = [
  { key: "title", label: "Title", kind: "text" },
  { key: "description", label: "Description", kind: "textarea" },
];
const TITLE_DESC_HREF_FIELDS: FieldSpec[] = [...TITLE_DESC_FIELDS, { key: "href", label: "Link", kind: "url" }];

// ── page-hero ──────────────────────────────────────────────────────────────

interface PageHeroConfig extends Record<string, unknown> {
  category: string;
  categoryLabel: string;
  title: string;
  subtitle: string;
  description: string;
  icon: string;
  image: string;
  primaryCtaLabel?: string;
  primaryCtaHref?: string;
  primaryCtaExternal?: boolean;
  /** Style the brand name in the description with the two-tone brand treatment. */
  brandDescription?: boolean;
}

const pageHero: SectionTypeDef<PageHeroConfig> = {
  type: "page-hero",
  label: "Page Hero",
  defaultConfig: { category: "services", categoryLabel: "services", title: "", subtitle: "", description: "", icon: "Sparkles", image: "" },
  parse: (raw) => {
    const r = record(raw);
    const title = str(r.title, 200);
    if (!title) return null;
    return {
      category: str(r.category, 60) || "services",
      categoryLabel: str(r.categoryLabel, 60),
      title,
      subtitle: str(r.subtitle, 300),
      description: str(r.description, 800),
      brandDescription: bool(r.brandDescription) || undefined,
      icon: str(r.icon, 60) || "Sparkles",
      image: str(r.image, 1000),
      primaryCtaLabel: strOpt(r.primaryCtaLabel, 60),
      primaryCtaHref: strOpt(r.primaryCtaHref, 500),
      primaryCtaExternal: bool(r.primaryCtaExternal),
    };
  },
  Renderer: PageHero,
  toProps: (c, ctx) => ({
    category: c.category,
    categoryLabel: c.categoryLabel,
    title: c.title,
    subtitle: renderInline(c.subtitle),
    description: c.brandDescription ? brandify(c.description, ctx.brand) : renderInline(c.description),
    icon: resolveIcon(c.icon),
    image: c.image,
    ...(c.primaryCtaLabel && c.primaryCtaHref
      ? { primaryCta: { label: c.primaryCtaLabel, href: c.primaryCtaHref, external: c.primaryCtaExternal } }
      : {}),
  }),
  fields: [
    { key: "brandDescription", label: "Style the brand name in the description with brand colours", kind: "boolean" },
    { key: "categoryLabel", label: "Category label", kind: "text" },
    { key: "title", label: "Title", kind: "text" },
    { key: "subtitle", label: "Subtitle", kind: "textarea" },
    { key: "description", label: "Description", kind: "textarea" },
    { key: "icon", label: "Icon", kind: "icon" },
    { key: "image", label: "Background image", kind: "image" },
    { key: "primaryCtaLabel", label: "CTA label (optional)", kind: "text" },
    { key: "primaryCtaHref", label: "CTA link (optional)", kind: "url" },
  ],
};

// ── course-overview ──────────────────────────────────────────────────────

interface StatItemConfig { label: string; value: string; icon: string }
interface CourseOverviewConfig extends Record<string, unknown> {
  title: string;
  paragraphs: string[];
  stats: StatItemConfig[];
  tone: "default" | "muted";
  /** Style the brand name in the paragraphs with the two-tone brand treatment. */
  brandParagraphs?: boolean;
}

function parseStatItem(raw: unknown): StatItemConfig | null {
  const r = record(raw);
  const label = str(r.label, 80);
  const value = str(r.value, 80);
  if (!label || !value) return null;
  return { label, value, icon: str(r.icon, 60) || "Sparkles" };
}

const courseOverview: SectionTypeDef<CourseOverviewConfig> = {
  type: "course-overview",
  label: "Course Overview",
  defaultConfig: { title: "", paragraphs: [], stats: [], tone: "default" },
  parse: (raw) => {
    const r = record(raw);
    const title = str(r.title, 200);
    if (!title) return null;
    return { title, paragraphs: strArr(r.paragraphs, 6, 1000), stats: objArr(r.stats, parseStatItem, 8), tone: tone(r.tone), brandParagraphs: bool(r.brandParagraphs) || undefined };
  },
  Renderer: CourseOverview,
  toProps: (c, ctx) => ({
    title: c.title,
    paragraphs: c.paragraphs.map((p) => (c.brandParagraphs ? brandify(p, ctx.brand) : renderInline(p))),
    stats: c.stats.map((s) => ({ label: s.label, value: s.value, icon: resolveIcon(s.icon) })),
    tone: c.tone,
  }),
  fields: [
    { key: "brandParagraphs", label: "Style the brand name in paragraphs with brand colours", kind: "boolean" },
    { key: "title", label: "Title", kind: "text" },
    { key: "paragraphs", label: "Paragraphs", kind: "list" },
  ],
  repeaters: [{ key: "stats", label: "Stats", itemFields: [{ key: "label", label: "Label", kind: "text" }, { key: "value", label: "Value", kind: "text" }, { key: "icon", label: "Icon", kind: "icon" }] }],
};

// ── checklist-grid ───────────────────────────────────────────────────────

interface ChecklistItemConfig { title: string; description: string; href?: string }
interface ChecklistGridConfig extends Record<string, unknown> {
  id: string;
  title: string;
  description?: string;
  items: ChecklistItemConfig[];
  columns: 2 | 3;
  tone: "default" | "muted";
}

function parseChecklistItem(raw: unknown): ChecklistItemConfig | null {
  const r = record(raw);
  const title = str(r.title, 120);
  if (!title) return null;
  return { title, description: str(r.description, 400), href: strOpt(r.href, 500) };
}

const checklistGrid: SectionTypeDef<ChecklistGridConfig> = {
  type: "checklist-grid",
  label: "Checklist Grid",
  defaultConfig: { id: "section", title: "", items: [], columns: 2, tone: "default" },
  parse: (raw) => {
    const r = record(raw);
    const title = str(r.title, 200);
    const id = str(r.id, 60);
    if (!title || !id) return null;
    return { id, title, description: strOpt(r.description, 400), items: objArr(r.items, parseChecklistItem, 24), columns: r.columns === 3 ? 3 : 2, tone: tone(r.tone) };
  },
  Renderer: ChecklistGrid,
  toProps: (c) => ({
    id: c.id,
    title: c.title,
    description: c.description ? renderInline(c.description) : undefined,
    items: c.items.map((i) => ({ title: i.title, description: renderInline(i.description), href: i.href })),
    columns: c.columns,
    tone: c.tone,
  }),
  fields: [
    { key: "title", label: "Title", kind: "text" },
    { key: "description", label: "Description", kind: "textarea" },
  ],
  repeaters: [{ key: "items", label: "Items", itemFields: TITLE_DESC_FIELDS }],
};

// ── tech-stack-grid ──────────────────────────────────────────────────────

interface TechItemConfig { name: string; category: string; icon: string }
interface TechStackGridConfig extends Record<string, unknown> {
  title?: string;
  description?: string;
  items: TechItemConfig[];
  tone: "default" | "muted";
  icon?: string;
  category?: string;
  align: "left" | "center";
  ctaLabel?: string;
  ctaHref?: string;
}

function parseTechItem(raw: unknown): TechItemConfig | null {
  const r = record(raw);
  const name = str(r.name, 80);
  if (!name) return null;
  return { name, category: str(r.category, 60), icon: str(r.icon, 60) || "Code2" };
}

const techStackGrid: SectionTypeDef<TechStackGridConfig> = {
  type: "tech-stack-grid",
  label: "Tech Stack Grid",
  defaultConfig: { items: [], tone: "default", align: "left" },
  parse: (raw) => {
    const r = record(raw);
    const items = objArr(r.items, parseTechItem, 16);
    if (items.length === 0) return null;
    return {
      title: strOpt(r.title, 200),
      description: strOpt(r.description, 400),
      items,
      tone: tone(r.tone),
      icon: strOpt(r.icon, 60),
      category: strOpt(r.category, 60),
      align: r.align === "center" ? "center" : "left",
      ctaLabel: strOpt(r.ctaLabel, 60),
      ctaHref: strOpt(r.ctaHref, 500),
    };
  },
  Renderer: TechStackGrid,
  toProps: (c) => ({
    title: c.title,
    description: c.description,
    items: c.items.map((i) => ({ name: i.name, category: i.category, icon: resolveIcon(i.icon) })),
    tone: c.tone,
    icon: c.icon ? resolveIcon(c.icon) : undefined,
    category: c.category,
    align: c.align,
    cta: c.ctaLabel && c.ctaHref ? { label: c.ctaLabel, href: c.ctaHref } : undefined,
  }),
  fields: [
    { key: "title", label: "Title", kind: "text" },
    { key: "description", label: "Description", kind: "textarea" },
  ],
  repeaters: [{ key: "items", label: "Technologies", itemFields: [{ key: "name", label: "Name", kind: "text" }, { key: "category", label: "Category", kind: "text" }, { key: "icon", label: "Icon", kind: "icon" }] }],
};

// ── curriculum-timeline ──────────────────────────────────────────────────

interface ModuleConfig { title: string; duration: string; topics: string[] }
interface CurriculumTimelineConfig extends Record<string, unknown> {
  title?: string;
  description?: string;
  modules: ModuleConfig[];
  tone: "default" | "muted";
  icon?: string;
  category?: string;
  align: "left" | "center";
}

function parseModule(raw: unknown): ModuleConfig | null {
  const r = record(raw);
  const title = str(r.title, 120);
  if (!title) return null;
  return { title, duration: str(r.duration, 60), topics: strArr(r.topics, 10) };
}

const curriculumTimeline: SectionTypeDef<CurriculumTimelineConfig> = {
  type: "curriculum-timeline",
  label: "Curriculum Timeline",
  defaultConfig: { modules: [], tone: "default", align: "left" },
  parse: (raw) => {
    const r = record(raw);
    const modules = objArr(r.modules, parseModule, 12);
    if (modules.length === 0) return null;
    return {
      title: strOpt(r.title, 200),
      description: strOpt(r.description, 400),
      modules,
      tone: tone(r.tone),
      icon: strOpt(r.icon, 60),
      category: strOpt(r.category, 60),
      align: r.align === "center" ? "center" : "left",
    };
  },
  Renderer: CurriculumTimeline,
  toProps: (c) => ({
    title: c.title,
    description: c.description,
    modules: c.modules.map((m) => ({ title: renderInline(m.title), duration: m.duration, topics: m.topics })),
    tone: c.tone,
    icon: c.icon ? resolveIcon(c.icon) : undefined,
    category: c.category,
    align: c.align,
  }),
  fields: [
    { key: "title", label: "Title", kind: "text" },
    { key: "description", label: "Description", kind: "textarea" },
  ],
  repeaters: [{ key: "modules", label: "Modules", itemFields: [{ key: "title", label: "Title", kind: "text" }, { key: "duration", label: "Duration", kind: "text" }, { key: "topics", label: "Topics", kind: "list" }] }],
};

// ── architecture-overview ────────────────────────────────────────────────

interface ArchLayerConfig { name: string; description: string; tech: string; icon: string }
interface ArchitectureOverviewConfig extends Record<string, unknown> {
  title: string;
  description?: string;
  layers: ArchLayerConfig[];
  tone: "default" | "muted";
}

function parseLayer(raw: unknown): ArchLayerConfig | null {
  const r = record(raw);
  const name = str(r.name, 80);
  if (!name) return null;
  return { name, description: str(r.description, 400), tech: str(r.tech, 100), icon: str(r.icon, 60) || "Layers3" };
}

const architectureOverview: SectionTypeDef<ArchitectureOverviewConfig> = {
  type: "architecture-overview",
  label: "Architecture Overview",
  defaultConfig: { title: "", layers: [], tone: "default" },
  parse: (raw) => {
    const r = record(raw);
    const title = str(r.title, 200);
    const layers = objArr(r.layers, parseLayer, 8);
    if (!title || layers.length === 0) return null;
    return { title, description: strOpt(r.description, 400), layers, tone: tone(r.tone) };
  },
  Renderer: ArchitectureOverview,
  toProps: (c) => ({
    title: c.title,
    description: c.description,
    layers: c.layers.map((l) => ({ name: l.name, description: l.description, tech: l.tech, icon: resolveIcon(l.icon) })),
    tone: c.tone,
  }),
  fields: [
    { key: "title", label: "Title", kind: "text" },
    { key: "description", label: "Description", kind: "textarea" },
  ],
  repeaters: [{ key: "layers", label: "Layers", itemFields: [{ key: "name", label: "Name", kind: "text" }, { key: "description", label: "Description", kind: "textarea" }, { key: "tech", label: "Tech", kind: "text" }, { key: "icon", label: "Icon", kind: "icon" }] }],
};

// ── project-showcase ─────────────────────────────────────────────────────

interface ProjectConfig { title: string; description: string; skills: string[] }
interface ProjectShowcaseConfig extends Record<string, unknown> {
  title: string;
  description?: string;
  projects: ProjectConfig[];
  tone: "default" | "muted";
}

function parseProject(raw: unknown): ProjectConfig | null {
  const r = record(raw);
  const title = str(r.title, 120);
  if (!title) return null;
  return { title, description: str(r.description, 400), skills: strArr(r.skills, 8) };
}

const projectShowcase: SectionTypeDef<ProjectShowcaseConfig> = {
  type: "project-showcase",
  label: "Project Showcase",
  defaultConfig: { title: "", projects: [], tone: "default" },
  parse: (raw) => {
    const r = record(raw);
    const title = str(r.title, 200);
    const projects = objArr(r.projects, parseProject, 8);
    if (!title || projects.length === 0) return null;
    return { title, description: strOpt(r.description, 400), projects, tone: tone(r.tone) };
  },
  Renderer: ProjectShowcase,
  toProps: (c) => ({
    title: c.title,
    description: c.description ? renderInline(c.description) : undefined,
    projects: c.projects.map((p) => ({ title: renderInline(p.title), description: p.description, skills: p.skills })),
    tone: c.tone,
  }),
  fields: [
    { key: "title", label: "Title", kind: "text" },
    { key: "description", label: "Description", kind: "textarea" },
  ],
  repeaters: [{ key: "projects", label: "Projects", itemFields: [...TITLE_DESC_FIELDS, { key: "skills", label: "Skills", kind: "list" }] }],
};

// ── feature-highlights ───────────────────────────────────────────────────

interface FeatureConfig { name: string; desc: string }
interface FeatureHighlightsConfig extends Record<string, unknown> {
  title?: string;
  features: FeatureConfig[];
  tone: "default" | "muted";
}

function parseFeature(raw: unknown): FeatureConfig | null {
  const r = record(raw);
  const name = str(r.name, 100);
  if (!name) return null;
  return { name, desc: str(r.desc, 300) };
}

const featureHighlights: SectionTypeDef<FeatureHighlightsConfig> = {
  type: "feature-highlights",
  label: "Feature Highlights",
  defaultConfig: { features: [], tone: "default" },
  parse: (raw) => {
    const r = record(raw);
    const features = objArr(r.features, parseFeature, 6);
    if (features.length === 0) return null;
    return { title: strOpt(r.title, 200), features, tone: tone(r.tone) };
  },
  Renderer: FeatureHighlightsSection,
  toProps: (c) => ({ title: c.title, features: c.features, tone: c.tone }),
  fields: [{ key: "title", label: "Title (optional)", kind: "text" }],
  repeaters: [{ key: "features", label: "Features", itemFields: [{ key: "name", label: "Name", kind: "text" }, { key: "desc", label: "Description", kind: "textarea" }] }],
};

// ── delivery-timeline ────────────────────────────────────────────────────

interface BandConfig { scope: string; duration: string; fill: number; description: string }
interface DeliveryTimelineConfig extends Record<string, unknown> {
  title: string;
  description?: string;
  bands: BandConfig[];
  tone: "default" | "muted";
}

function parseBand(raw: unknown): BandConfig | null {
  const r = record(raw);
  const scope = str(r.scope, 100);
  if (!scope) return null;
  return { scope, duration: str(r.duration, 60), fill: Math.min(Math.max(numOr(r.fill, 50), 0), 100), description: str(r.description, 400) };
}

const deliveryTimeline: SectionTypeDef<DeliveryTimelineConfig> = {
  type: "delivery-timeline",
  label: "Delivery Timeline",
  defaultConfig: { title: "", bands: [], tone: "default" },
  parse: (raw) => {
    const r = record(raw);
    const title = str(r.title, 200);
    const bands = objArr(r.bands, parseBand, 6);
    if (!title || bands.length === 0) return null;
    return { title, description: strOpt(r.description, 400), bands, tone: tone(r.tone) };
  },
  Renderer: DeliveryTimeline,
  toProps: (c) => ({ title: c.title, description: c.description, bands: c.bands, tone: c.tone }),
  fields: [
    { key: "title", label: "Title", kind: "text" },
    { key: "description", label: "Description", kind: "textarea" },
  ],
  repeaters: [{ key: "bands", label: "Bands", itemFields: [{ key: "scope", label: "Scope", kind: "text" }, { key: "duration", label: "Duration", kind: "text" }, { key: "description", label: "Description", kind: "textarea" }] }],
};

// ── faq-accordion ────────────────────────────────────────────────────────

interface FaqConfig { question: string; answer: string }
interface FAQAccordionConfig extends Record<string, unknown> {
  title?: string;
  faqs: FaqConfig[];
  tone: "default" | "muted";
  icon?: string;
  category?: string;
  /** Render the brand name in questions with the two-tone brand treatment (homepage FAQ). Opt-in so other pages' FAQs are unchanged. */
  brandQuestions?: boolean;
}

function parseFaq(raw: unknown): FaqConfig | null {
  const r = record(raw);
  const question = str(r.question, 300);
  const answer = str(r.answer, 2000);
  if (!question || !answer) return null;
  return { question, answer };
}

const faqAccordion: SectionTypeDef<FAQAccordionConfig> = {
  type: "faq-accordion",
  label: "FAQ Accordion",
  defaultConfig: { faqs: [], tone: "default" },
  parse: (raw) => {
    const r = record(raw);
    const faqs = objArr(r.faqs, parseFaq, 20);
    if (faqs.length === 0) return null;
    return { title: strOpt(r.title, 200), faqs, tone: tone(r.tone), icon: strOpt(r.icon, 60), category: strOpt(r.category, 60), brandQuestions: bool(r.brandQuestions) || undefined };
  },
  Renderer: FAQAccordion,
  toProps: (c, ctx) => ({
    title: c.title,
    faqs: c.faqs.map((f) => ({ question: c.brandQuestions ? brandify(f.question, ctx.brand) : renderInline(f.question), answer: renderInline(f.answer) })),
    tone: c.tone,
    icon: c.icon ? resolveIcon(c.icon) : undefined,
    category: c.category,
  }),
  fields: [
    { key: "title", label: "Title (optional)", kind: "text" },
    { key: "category", label: "Eyebrow label (optional)", kind: "text" },
    { key: "icon", label: "Icon (optional)", kind: "icon" },
    { key: "brandQuestions", label: "Style the brand name in questions with brand colours", kind: "boolean" },
  ],
  repeaters: [{ key: "faqs", label: "Questions", itemFields: [{ key: "question", label: "Question", kind: "text" }, { key: "answer", label: "Answer", kind: "textarea" }] }],
};

// ── related-services ─────────────────────────────────────────────────────

interface RelatedServiceConfig { title: string; description: string; href: string; icon: string }
interface RelatedServicesConfig extends Record<string, unknown> {
  title?: string;
  services: RelatedServiceConfig[];
  tone: "default" | "muted";
}

function parseRelatedService(raw: unknown): RelatedServiceConfig | null {
  const r = record(raw);
  const title = str(r.title, 100);
  const href = str(r.href, 500);
  if (!title || !href) return null;
  return { title, description: str(r.description, 300), href, icon: str(r.icon, 60) || "ArrowRight" };
}

const relatedServices: SectionTypeDef<RelatedServicesConfig> = {
  type: "related-services",
  label: "Related Services",
  defaultConfig: { services: [], tone: "default" },
  parse: (raw) => {
    const r = record(raw);
    const services = objArr(r.services, parseRelatedService, 6);
    if (services.length === 0) return null;
    return { title: strOpt(r.title, 200), services, tone: tone(r.tone) };
  },
  Renderer: RelatedServices,
  toProps: (c) => ({
    title: c.title,
    services: c.services.map((s) => ({ title: s.title, description: s.description, href: s.href, icon: resolveIcon(s.icon) })),
    tone: c.tone,
  }),
  fields: [{ key: "title", label: "Title (optional)", kind: "text" }],
  repeaters: [{ key: "services", label: "Services", itemFields: [...TITLE_DESC_HREF_FIELDS, { key: "icon", label: "Icon", kind: "icon" }] }],
};

// ── detail-cta ───────────────────────────────────────────────────────────

interface DetailCTAConfig extends Record<string, unknown> {
  heading: string;
  description: string;
  ctaLabel?: string;
  ctaHref?: string;
  external: boolean;
  checklist: string[];
  category?: string;
  subService?: string;
}

const detailCta: SectionTypeDef<DetailCTAConfig> = {
  type: "detail-cta",
  label: "Detail CTA",
  defaultConfig: { heading: "", description: "", external: false, checklist: [] },
  parse: (raw) => {
    const r = record(raw);
    const heading = str(r.heading, 200);
    const description = str(r.description, 500);
    if (!heading || !description) return null;
    return {
      heading,
      description,
      ctaLabel: strOpt(r.ctaLabel, 60),
      ctaHref: strOpt(r.ctaHref, 500),
      external: bool(r.external),
      checklist: strArr(r.checklist, 6),
      category: strOpt(r.category, 60),
      subService: strOpt(r.subService, 60),
    };
  },
  Renderer: DetailCTA,
  toProps: (c) => ({
    heading: c.heading,
    description: c.description,
    ctaLabel: c.ctaLabel,
    ctaHref: c.ctaHref,
    external: c.external,
    checklist: c.checklist.length > 0 ? c.checklist : undefined,
    category: c.category,
    subService: c.subService,
  }),
  fields: [
    { key: "heading", label: "Heading", kind: "text" },
    { key: "description", label: "Description", kind: "textarea" },
    { key: "ctaLabel", label: "CTA label (optional)", kind: "text" },
    { key: "ctaHref", label: "CTA link (optional — overrides the default contact link)", kind: "url" },
    { key: "category", label: "Contact form category (optional)", kind: "text" },
    { key: "subService", label: "Contact form sub-service (optional)", kind: "text" },
    { key: "checklist", label: "Checklist (optional)", kind: "list" },
  ],
};

// ── listing-hero ─────────────────────────────────────────────────────────

interface ListingHeroConfig extends Record<string, unknown> {
  eyebrow: string;
  title: string;
  description: string;
  icon: string;
  image: string;
}

const listingHero: SectionTypeDef<ListingHeroConfig> = {
  type: "listing-hero",
  label: "Listing Hero",
  defaultConfig: { eyebrow: "", title: "", description: "", icon: "Layers", image: "" },
  parse: (raw) => {
    const r = record(raw);
    const title = str(r.title, 120);
    if (!title) return null;
    return { eyebrow: str(r.eyebrow, 80), title, description: str(r.description, 400), icon: str(r.icon, 60) || "Layers", image: str(r.image, 1000) };
  },
  Renderer: ListingHero,
  toProps: (c) => ({ eyebrow: c.eyebrow, title: c.title, description: c.description, icon: resolveIcon(c.icon), image: c.image }),
  fields: [
    { key: "eyebrow", label: "Eyebrow", kind: "text" },
    { key: "title", label: "Title", kind: "text" },
    { key: "description", label: "Description", kind: "textarea" },
    { key: "icon", label: "Icon", kind: "icon" },
    { key: "image", label: "Background image", kind: "image" },
  ],
};

// ── service-pillars-grid (composite: FeaturedListingCard + ListingCard grid) ─

const PILLAR_FIELDS: FieldSpec[] = [
  { key: "title", label: "Title", kind: "text" },
  { key: "subtitle", label: "Subtitle", kind: "text" },
  { key: "description", label: "Description", kind: "textarea" },
  { key: "href", label: "Link", kind: "url" },
  { key: "icon", label: "Icon", kind: "icon" },
  { key: "image", label: "Image", kind: "image" },
  { key: "highlights", label: "Highlights", kind: "list" },
  { key: "badge", label: "Badge (optional)", kind: "text" },
  { key: "ctaLabel", label: "CTA label (optional)", kind: "text" },
];

function parsePillar(raw: unknown): PillarCardConfig | null {
  const r = record(raw);
  const title = str(r.title, 100);
  const href = str(r.href, 500);
  if (!title || !href) return null;
  return {
    title,
    subtitle: str(r.subtitle, 200),
    description: str(r.description, 500),
    href,
    icon: resolveIcon(str(r.icon, 60)),
    image: str(r.image, 1000),
    highlights: strArr(r.highlights, 6),
    badge: strOpt(r.badge, 60),
    badgeIcon: r.badgeIcon ? resolveIcon(str(r.badgeIcon, 60)) : undefined,
    ctaLabel: strOpt(r.ctaLabel, 60),
  };
}

interface ServicePillarsGridConfig extends Record<string, unknown> {
  sectionLabel: string;
  featured: PillarCardConfig;
  items: PillarCardConfig[];
}

const servicePillarsGrid: SectionTypeDef<ServicePillarsGridConfig> = {
  type: "service-pillars-grid",
  label: "Service Pillars Grid",
  defaultConfig: { sectionLabel: "", featured: { title: "", subtitle: "", description: "", href: "", icon: resolveIcon("Layers"), image: "", highlights: [] }, items: [] },
  parse: (raw) => {
    const r = record(raw);
    const featured = parsePillar(r.featured);
    if (!featured) return null;
    return { sectionLabel: str(r.sectionLabel, 80), featured, items: objArr(r.items, parsePillar, 12) };
  },
  Renderer: ServicePillarsGrid,
  toProps: (c) => ({ sectionLabel: c.sectionLabel, featured: c.featured, items: c.items }),
  fields: [{ key: "sectionLabel", label: "\"More pillars\" section label", kind: "text" }],
  objectFields: [{ key: "featured", label: "Featured pillar", itemFields: PILLAR_FIELDS }],
  repeaters: [{ key: "items", label: "Other pillars", itemFields: PILLAR_FIELDS }],
};

// ── home-hero ────────────────────────────────────────────────────────────

interface HomeHeroConfig extends Record<string, unknown> {
  badge: string;
  titleLine1: string;
  titleHighlight: string;
  description: string;
  primaryCtaLabel: string;
  primaryCtaHref: string;
  secondaryCtaLabel: string;
  secondaryCtaHref: string;
  chipOne: string;
  chipTwo: string;
  chipThree: string;
  statusTitle: string;
  statusText: string;
  perfTitle: string;
  perfText: string;
  scrollLabel: string;
  /** Optional background photo (empty = the built-in one). */
  image?: string;
}

const homeHero: SectionTypeDef<HomeHeroConfig> = {
  type: "home-hero",
  label: "Homepage Hero",
  defaultConfig: { badge: "", titleLine1: "", titleHighlight: "", description: "", primaryCtaLabel: "", primaryCtaHref: "", secondaryCtaLabel: "", secondaryCtaHref: "", chipOne: "", chipTwo: "", chipThree: "", statusTitle: "", statusText: "", perfTitle: "", perfText: "", scrollLabel: "" },
  parse: (raw) => {
    const r = record(raw);
    const titleLine1 = str(r.titleLine1, 100);
    if (!titleLine1) return null;
    return {
      badge: str(r.badge, 150),
      titleLine1,
      titleHighlight: str(r.titleHighlight, 100),
      description: str(r.description, 600),
      primaryCtaLabel: str(r.primaryCtaLabel, 40),
      primaryCtaHref: str(r.primaryCtaHref, 500),
      secondaryCtaLabel: str(r.secondaryCtaLabel, 40),
      secondaryCtaHref: str(r.secondaryCtaHref, 500),
      chipOne: str(r.chipOne, 100),
      chipTwo: str(r.chipTwo, 100),
      chipThree: str(r.chipThree, 100),
      statusTitle: str(r.statusTitle, 100),
      statusText: str(r.statusText, 100),
      perfTitle: str(r.perfTitle, 100),
      perfText: str(r.perfText, 100),
      scrollLabel: str(r.scrollLabel, 100),
      image: strOpt(r.image, 1000),
    };
  },
  Renderer: HomeHero,
  toProps: (c) => c,
  fields: [
    { key: "badge", label: "Badge text", kind: "text" },
    { key: "titleLine1", label: "Title (line 1)", kind: "text" },
    { key: "titleHighlight", label: "Title (highlighted line)", kind: "text" },
    { key: "description", label: "Description", kind: "textarea" },
    { key: "primaryCtaLabel", label: "Primary CTA label", kind: "text" },
    { key: "primaryCtaHref", label: "Primary CTA link", kind: "url" },
    { key: "secondaryCtaLabel", label: "Secondary CTA label", kind: "text" },
    { key: "secondaryCtaHref", label: "Secondary CTA link", kind: "url" },
    { key: "chipOne", label: "Mock-up chip 1", kind: "text" },
    { key: "chipTwo", label: "Mock-up chip 2", kind: "text" },
    { key: "chipThree", label: "Mock-up chip 3", kind: "text" },
    { key: "statusTitle", label: "Floating badge 1 — title", kind: "text" },
    { key: "statusText", label: "Floating badge 1 — text", kind: "text" },
    { key: "perfTitle", label: "Floating badge 2 — title", kind: "text" },
    { key: "perfText", label: "Floating badge 2 — text", kind: "text" },
    { key: "scrollLabel", label: "\"Scroll\" hint", kind: "text" },
    { key: "image", label: "Background photo (optional)", kind: "image" },
  ],
};

// ── stats-band ───────────────────────────────────────────────────────────
// Reuses the existing, previously-unregistered `StatsBand` component — added
// for the AI Technology theme's alternate section arrangement (a section the
// default theme's page doesn't use), but registered here in the base
// registry like every other type, so any theme/page can use it.

interface StatItemBandConfig { label: string; value: number; suffix: string; icon: string }
interface StatsBandConfig extends Record<string, unknown> {
  title: string;
  description?: string;
  stats: StatItemBandConfig[];
  tone: "default" | "muted";
}

function parseStatsBandItem(raw: unknown): StatItemBandConfig | null {
  const r = record(raw);
  const label = str(r.label, 80);
  if (!label) return null;
  return { label, value: Math.round(numOr(r.value, 0)), suffix: str(r.suffix, 10), icon: str(r.icon, 60) || "TrendingUp" };
}

const statsBand: SectionTypeDef<StatsBandConfig> = {
  type: "stats-band",
  label: "Stats Band",
  defaultConfig: { title: "", stats: [], tone: "default" },
  parse: (raw) => {
    const r = record(raw);
    const title = str(r.title, 200);
    const stats = objArr(r.stats, parseStatsBandItem, 8);
    if (!title || stats.length === 0) return null;
    return { title, description: strOpt(r.description, 400), stats, tone: tone(r.tone) };
  },
  Renderer: StatsBand,
  toProps: (c) => ({
    title: c.title,
    description: c.description,
    stats: c.stats.map((s) => ({ label: s.label, value: s.value, suffix: s.suffix || undefined, icon: resolveIcon(s.icon) })),
    tone: c.tone,
  }),
  fields: [
    { key: "title", label: "Title", kind: "text" },
    { key: "description", label: "Description", kind: "textarea" },
  ],
  repeaters: [
    {
      key: "stats",
      label: "Stats",
      itemFields: [
        { key: "label", label: "Label", kind: "text" },
        { key: "value", label: "Value", kind: "number" },
        { key: "suffix", label: "Suffix (e.g. \"+\", \"%\")", kind: "text" },
        { key: "icon", label: "Icon", kind: "icon" },
      ],
    },
  ],
};

// ── registry ─────────────────────────────────────────────────────────────

// Heterogeneous config types per entry; each def is fully typed where it's declared.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const SECTION_REGISTRY: Record<string, SectionTypeDef<any>> = {
  [pageHero.type]: pageHero,
  [homeHero.type]: homeHero,
  [statsBand.type]: statsBand,
  [courseOverview.type]: courseOverview,
  [checklistGrid.type]: checklistGrid,
  [techStackGrid.type]: techStackGrid,
  [curriculumTimeline.type]: curriculumTimeline,
  [architectureOverview.type]: architectureOverview,
  [projectShowcase.type]: projectShowcase,
  [featureHighlights.type]: featureHighlights,
  [deliveryTimeline.type]: deliveryTimeline,
  [faqAccordion.type]: faqAccordion,
  [relatedServices.type]: relatedServices,
  [detailCta.type]: detailCta,
  [listingHero.type]: listingHero,
  [servicePillarsGrid.type]: servicePillarsGrid,
  ...Object.fromEntries(HOME_SECTION_TYPES.map((d) => [d.type, d])),
  ...Object.fromEntries(PAGE_SECTION_TYPES.map((d) => [d.type, d])),
  ...Object.fromEntries(FORM_SECTION_TYPES.map((d) => [d.type, d])),
  ...Object.fromEntries(AGENT_SECTION_TYPES.map((d) => [d.type, d])),
};

export type SectionType = keyof typeof SECTION_REGISTRY;

export interface PageSection {
  id: string;
  type: string;
  orderKey: number;
  config: Record<string, unknown>;
  enabled: boolean;
}

/** ReactNode re-export so callers building fallback arrays don't need a separate import. */
export type { ReactNode };
