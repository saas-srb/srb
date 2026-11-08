import type { SectionTypeDef, FieldSpec } from "@/lib/products/sitecraft-ai/section-registry";
import { str, strOpt, bool, strArr, objArr, record } from "@/lib/products/sitecraft-ai/parse-helpers";
import { resolveIcon } from "@/lib/products/sitecraft-ai/icon-map";
import ProcessOrbit from "@/components/sections/ProcessOrbit";
import HomeTrustBadges from "@/components/sections/home/HomeTrustBadges";
import HomeDepartments from "@/components/sections/home/HomeDepartments";
import { HomeWhyChooseUs, HomeHowWeWork, HomeDeliveryProcess, HomeCommitments, HomeAssurances } from "@/components/sections/home/HomeCardGrids";
import { HomeResourcePreview, HomeIndustries, HomeWhatWeBuild } from "@/components/sections/home/HomeShowcases";
import HomeFinalCta from "@/components/sections/home/HomeFinalCta";

/**
 * Section types for the homepage's bespoke regions (Phase 3). Kept out of
 * `section-registry.ts` only for size; they're merged into the same
 * `SECTION_REGISTRY`, so any page (or theme variant) can use them.
 *
 * Every renderer is the region's original markup moved verbatim into
 * `src/components/sections/home/*` — config holds only text, links, images
 * and icon keys.
 */

// ── Shared shapes ────────────────────────────────────────────────────────

interface HeaderConfig {
  eyebrow: string;
  headerIcon: string;
  heading: string;
  accent?: string;
  description: string;
}

function parseHeader(r: Record<string, unknown>): HeaderConfig | null {
  const heading = str(r.heading, 200);
  if (!heading) return null;
  return {
    eyebrow: str(r.eyebrow, 80),
    headerIcon: str(r.headerIcon, 60) || "Sparkles",
    heading,
    accent: strOpt(r.accent, 120),
    description: str(r.description, 600),
  };
}

const headerProps = (c: HeaderConfig) => ({
  eyebrow: c.eyebrow,
  headerIcon: resolveIcon(c.headerIcon),
  heading: c.heading,
  accent: c.accent,
  description: c.description,
});

const HEADER_FIELDS: FieldSpec[] = [
  { key: "eyebrow", label: "Eyebrow label", kind: "text" },
  { key: "headerIcon", label: "Eyebrow icon", kind: "icon" },
  { key: "heading", label: "Heading", kind: "text" },
  { key: "accent", label: "Heading accent (optional, highlighted)", kind: "text" },
  { key: "description", label: "Description", kind: "textarea" },
];

const LINK_FIELDS: FieldSpec[] = [
  { key: "linkLabel", label: "Bottom link label (optional)", kind: "text" },
  { key: "linkHref", label: "Bottom link URL", kind: "url" },
];

const parseLink = (r: Record<string, unknown>) => ({ linkLabel: strOpt(r.linkLabel, 80), linkHref: strOpt(r.linkHref, 500) });

const HEADER_DEFAULT: HeaderConfig = { eyebrow: "", headerIcon: "Sparkles", heading: "", description: "" };

interface IconTitleDesc { title: string; description: string; icon: string }
function parseIconTitleDesc(raw: unknown): IconTitleDesc | null {
  const r = record(raw);
  const title = str(r.title, 120);
  if (!title) return null;
  return { title, description: str(r.description, 400), icon: str(r.icon, 60) || "Sparkles" };
}
const ICON_TITLE_DESC_FIELDS: FieldSpec[] = [
  { key: "title", label: "Title", kind: "text" },
  { key: "description", label: "Description", kind: "textarea" },
  { key: "icon", label: "Icon", kind: "icon" },
];

// ── home-trust-badges ────────────────────────────────────────────────────

interface TrustBadgesConfig extends Record<string, unknown> {
  badges: { label: string; icon: string }[];
}

const homeTrustBadges: SectionTypeDef<TrustBadgesConfig> = {
  type: "home-trust-badges",
  label: "Trust Badges Strip",
  defaultConfig: { badges: [] },
  parse: (raw) => {
    const r = record(raw);
    const badges = objArr(r.badges, (b) => {
      const x = record(b);
      const label = str(x.label, 80);
      return label ? { label, icon: str(x.icon, 60) || "CheckCircle2" } : null;
    }, 12);
    return badges.length ? { badges } : null;
  },
  Renderer: HomeTrustBadges,
  toProps: (c) => ({ badges: c.badges.map((b) => ({ label: b.label, icon: resolveIcon(b.icon) })) }),
  fields: [],
  repeaters: [{ key: "badges", label: "Badges", itemFields: [{ key: "label", label: "Label", kind: "text" }, { key: "icon", label: "Icon", kind: "icon" }] }],
};

// ── home-departments ─────────────────────────────────────────────────────

interface DepartmentConfig {
  tag: string;
  title: string;
  description: string;
  services: string[];
  icon: string;
  href: string;
  cta: string;
  badge?: string;
  featured: boolean;
  image: string;
}
interface DepartmentsConfig extends Record<string, unknown>, HeaderConfig {
  departments: DepartmentConfig[];
  footnoteText: string;
  footnoteLinkLabel: string;
  footnoteHref: string;
}

function parseDepartment(raw: unknown): DepartmentConfig | null {
  const r = record(raw);
  const title = str(r.title, 120);
  const href = str(r.href, 500);
  if (!title || !href) return null;
  return {
    tag: str(r.tag, 60),
    title,
    description: str(r.description, 600),
    services: strArr(r.services, 24, 100),
    icon: str(r.icon, 60) || "Layers",
    href,
    cta: str(r.cta, 80),
    badge: strOpt(r.badge, 60),
    featured: bool(r.featured),
    image: str(r.image, 1000),
  };
}

const homeDepartments: SectionTypeDef<DepartmentsConfig> = {
  type: "home-departments",
  label: "Departments Showcase",
  defaultConfig: { ...HEADER_DEFAULT, departments: [], footnoteText: "", footnoteLinkLabel: "", footnoteHref: "" },
  parse: (raw) => {
    const r = record(raw);
    const header = parseHeader(r);
    const departments = objArr(r.departments, parseDepartment, 12);
    if (!header || departments.length === 0) return null;
    return {
      ...header,
      departments,
      footnoteText: str(r.footnoteText, 200),
      footnoteLinkLabel: str(r.footnoteLinkLabel, 100),
      footnoteHref: str(r.footnoteHref, 500),
    };
  },
  Renderer: HomeDepartments,
  toProps: (c) => ({
    ...headerProps(c),
    departments: c.departments.map((d) => ({ ...d, icon: resolveIcon(d.icon) })),
    footnoteText: c.footnoteText,
    footnoteLinkLabel: c.footnoteLinkLabel,
    footnoteHref: c.footnoteHref,
  }),
  fields: [
    ...HEADER_FIELDS,
    { key: "footnoteText", label: "Footnote text (optional)", kind: "text" },
    { key: "footnoteLinkLabel", label: "Footnote link label", kind: "text" },
    { key: "footnoteHref", label: "Footnote link URL", kind: "url" },
  ],
  repeaters: [
    {
      key: "departments",
      label: "Departments (the first two render as large featured cards)",
      itemFields: [
        { key: "tag", label: "Tag (e.g. \"Department 01\")", kind: "text" },
        { key: "title", label: "Title", kind: "text" },
        { key: "description", label: "Description", kind: "textarea" },
        { key: "services", label: "Capabilities", kind: "list" },
        { key: "icon", label: "Icon", kind: "icon" },
        { key: "href", label: "Link", kind: "url" },
        { key: "cta", label: "CTA label", kind: "text" },
        { key: "badge", label: "Badge (large cards only)", kind: "text" },
        { key: "featured", label: "Highlight as flagship", kind: "boolean" },
        { key: "image", label: "Background image", kind: "image" },
      ],
    },
  ],
};

// ── home-why-choose-us ───────────────────────────────────────────────────

interface WhyChooseUsConfig extends Record<string, unknown>, HeaderConfig {
  reasons: { name: string; desc: string; icon: string }[];
}

const homeWhyChooseUs: SectionTypeDef<WhyChooseUsConfig> = {
  type: "home-why-choose-us",
  label: "Why Choose Us Cards",
  defaultConfig: { ...HEADER_DEFAULT, reasons: [] },
  parse: (raw) => {
    const r = record(raw);
    const header = parseHeader(r);
    const reasons = objArr(r.reasons, (x) => {
      const o = record(x);
      const name = str(o.name, 120);
      return name ? { name, desc: str(o.desc, 400), icon: str(o.icon, 60) || "Sparkles" } : null;
    }, 16);
    if (!header || reasons.length === 0) return null;
    return { ...header, reasons };
  },
  Renderer: HomeWhyChooseUs,
  toProps: (c) => ({ ...headerProps(c), reasons: c.reasons.map((x) => ({ ...x, icon: resolveIcon(x.icon) })) }),
  fields: HEADER_FIELDS,
  repeaters: [{ key: "reasons", label: "Reasons", itemFields: [{ key: "name", label: "Title", kind: "text" }, { key: "desc", label: "Description", kind: "textarea" }, { key: "icon", label: "Icon", kind: "icon" }] }],
};

// ── home-how-we-work ─────────────────────────────────────────────────────

interface HowWeWorkConfig extends Record<string, unknown>, HeaderConfig {
  steps: IconTitleDesc[];
  linkLabel?: string;
  linkHref?: string;
}

const homeHowWeWork: SectionTypeDef<HowWeWorkConfig> = {
  type: "home-how-we-work",
  label: "Steps (How We Work)",
  defaultConfig: { ...HEADER_DEFAULT, steps: [] },
  parse: (raw) => {
    const r = record(raw);
    const header = parseHeader(r);
    const steps = objArr(r.steps, parseIconTitleDesc, 8);
    if (!header || steps.length === 0) return null;
    return { ...header, steps, ...parseLink(r) };
  },
  Renderer: HomeHowWeWork,
  toProps: (c) => ({ ...headerProps(c), steps: c.steps.map((x) => ({ ...x, icon: resolveIcon(x.icon) })), linkLabel: c.linkLabel, linkHref: c.linkHref }),
  fields: [...HEADER_FIELDS, ...LINK_FIELDS],
  repeaters: [{ key: "steps", label: "Steps", itemFields: ICON_TITLE_DESC_FIELDS }],
};

// ── home-delivery-process ────────────────────────────────────────────────

interface DeliveryProcessConfig extends Record<string, unknown>, HeaderConfig {
  phases: { title: string; duration: string; topics: string[]; icon: string }[];
}

const homeDeliveryProcess: SectionTypeDef<DeliveryProcessConfig> = {
  type: "home-delivery-process",
  label: "Process Phases",
  defaultConfig: { ...HEADER_DEFAULT, phases: [] },
  parse: (raw) => {
    const r = record(raw);
    const header = parseHeader(r);
    const phases = objArr(r.phases, (x) => {
      const o = record(x);
      const title = str(o.title, 120);
      return title ? { title, duration: str(o.duration, 60), topics: strArr(o.topics, 8, 120), icon: str(o.icon, 60) || "Sparkles" } : null;
    }, 12);
    if (!header || phases.length === 0) return null;
    return { ...header, phases };
  },
  Renderer: HomeDeliveryProcess,
  toProps: (c) => ({ ...headerProps(c), phases: c.phases.map((x) => ({ ...x, icon: resolveIcon(x.icon) })) }),
  fields: HEADER_FIELDS,
  repeaters: [
    {
      key: "phases",
      label: "Phases",
      itemFields: [
        { key: "title", label: "Title", kind: "text" },
        { key: "duration", label: "Label (e.g. \"Phase 1\")", kind: "text" },
        { key: "topics", label: "Topics", kind: "list" },
        { key: "icon", label: "Icon", kind: "icon" },
      ],
    },
  ],
};

// ── home-commitments ─────────────────────────────────────────────────────

interface CommitmentsConfig extends Record<string, unknown>, HeaderConfig {
  items: IconTitleDesc[];
}

const homeCommitments: SectionTypeDef<CommitmentsConfig> = {
  type: "home-commitments",
  label: "Commitment Cards",
  defaultConfig: { ...HEADER_DEFAULT, items: [] },
  parse: (raw) => {
    const r = record(raw);
    const header = parseHeader(r);
    const items = objArr(r.items, parseIconTitleDesc, 12);
    if (!header || items.length === 0) return null;
    return { ...header, items };
  },
  Renderer: HomeCommitments,
  toProps: (c) => ({ ...headerProps(c), items: c.items.map((x) => ({ ...x, icon: resolveIcon(x.icon) })) }),
  fields: HEADER_FIELDS,
  repeaters: [{ key: "items", label: "Cards", itemFields: ICON_TITLE_DESC_FIELDS }],
};

// ── home-assurances ──────────────────────────────────────────────────────

interface AssurancesConfig extends Record<string, unknown>, HeaderConfig {
  items: { title: string; desc: string; icon: string }[];
}

const homeAssurances: SectionTypeDef<AssurancesConfig> = {
  type: "home-assurances",
  label: "Assurance Tiles",
  defaultConfig: { ...HEADER_DEFAULT, items: [] },
  parse: (raw) => {
    const r = record(raw);
    const header = parseHeader(r);
    const items = objArr(r.items, (x) => {
      const o = record(x);
      const title = str(o.title, 120);
      return title ? { title, desc: str(o.desc, 400), icon: str(o.icon, 60) || "ShieldCheck" } : null;
    }, 12);
    if (!header || items.length === 0) return null;
    return { ...header, items };
  },
  Renderer: HomeAssurances,
  toProps: (c) => ({ ...headerProps(c), items: c.items.map((x) => ({ ...x, icon: resolveIcon(x.icon) })) }),
  fields: HEADER_FIELDS,
  repeaters: [{ key: "items", label: "Tiles", itemFields: [{ key: "title", label: "Title", kind: "text" }, { key: "desc", label: "Description", kind: "textarea" }, { key: "icon", label: "Icon", kind: "icon" }] }],
};

// ── home-resource-preview ────────────────────────────────────────────────

interface ResourcePreviewConfig extends Record<string, unknown>, HeaderConfig {
  categorySlugs: string[];
  featuredSlug: string;
  featuresLabel: string;
  ctaLabel: string;
  linkLabel?: string;
  linkHref?: string;
}

const homeResourcePreview: SectionTypeDef<ResourcePreviewConfig> = {
  type: "home-resource-preview",
  label: "Engagement Models Preview",
  defaultConfig: { ...HEADER_DEFAULT, categorySlugs: [], featuredSlug: "", featuresLabel: "", ctaLabel: "" },
  parse: (raw) => {
    const r = record(raw);
    const header = parseHeader(r);
    const categorySlugs = strArr(r.categorySlugs, 6, 60);
    if (!header || categorySlugs.length === 0) return null;
    return {
      ...header,
      categorySlugs,
      featuredSlug: str(r.featuredSlug, 60),
      featuresLabel: str(r.featuresLabel, 60),
      ctaLabel: str(r.ctaLabel, 60),
      ...parseLink(r),
    };
  },
  Renderer: HomeResourcePreview,
  toProps: (c) => ({
    ...headerProps(c),
    categorySlugs: c.categorySlugs,
    featuredSlug: c.featuredSlug,
    featuresLabel: c.featuresLabel,
    ctaLabel: c.ctaLabel,
    linkLabel: c.linkLabel,
    linkHref: c.linkHref,
  }),
  fields: [
    ...HEADER_FIELDS,
    { key: "categorySlugs", label: "Engagement models to show (slugs from Resource Augmentation, e.g. single-resource)", kind: "list" },
    { key: "featuredSlug", label: "Highlighted model (slug)", kind: "text" },
    { key: "featuresLabel", label: "Benefits label", kind: "text" },
    { key: "ctaLabel", label: "Card button label", kind: "text" },
    ...LINK_FIELDS,
  ],
};

// ── home-industries ──────────────────────────────────────────────────────

interface IndustryConfig { title: string; subtitle: string; desc: string; icon: string; image: string; href: string; related: string[] }
interface IndustriesConfig extends Record<string, unknown>, HeaderConfig {
  industries: IndustryConfig[];
  linkLabel?: string;
  linkHref?: string;
}

const homeIndustries: SectionTypeDef<IndustriesConfig> = {
  type: "home-industries",
  label: "Industries Accordion",
  defaultConfig: { ...HEADER_DEFAULT, industries: [] },
  parse: (raw) => {
    const r = record(raw);
    const header = parseHeader(r);
    const industries = objArr(r.industries, (x) => {
      const o = record(x);
      const title = str(o.title, 80);
      const href = str(o.href, 500);
      if (!title || !href) return null;
      return { title, subtitle: str(o.subtitle, 120), desc: str(o.desc, 500), icon: str(o.icon, 60) || "Building2", image: str(o.image, 1000), href, related: strArr(o.related, 6, 60) };
    }, 6);
    if (!header || industries.length === 0) return null;
    return { ...header, industries, ...parseLink(r) };
  },
  Renderer: HomeIndustries,
  toProps: (c) => ({ ...headerProps(c), industries: c.industries.map((x) => ({ ...x, icon: resolveIcon(x.icon) })), linkLabel: c.linkLabel, linkHref: c.linkHref }),
  fields: [...HEADER_FIELDS, ...LINK_FIELDS],
  repeaters: [
    {
      key: "industries",
      label: "Industries",
      itemFields: [
        { key: "title", label: "Title", kind: "text" },
        { key: "subtitle", label: "Subtitle", kind: "text" },
        { key: "desc", label: "Description", kind: "textarea" },
        { key: "icon", label: "Icon", kind: "icon" },
        { key: "image", label: "Image", kind: "image" },
        { key: "href", label: "Link", kind: "url" },
        { key: "related", label: "Related services", kind: "list" },
      ],
    },
  ],
};

// ── home-what-we-build ───────────────────────────────────────────────────

interface BuildServiceConfig { title: string; subtitle: string; desc: string; icon: string; image: string; href: string }
interface WhatWeBuildConfig extends Record<string, unknown>, HeaderConfig {
  services: BuildServiceConfig[];
  linkLabel?: string;
  linkHref?: string;
}

const homeWhatWeBuild: SectionTypeDef<WhatWeBuildConfig> = {
  type: "home-what-we-build",
  label: "Interactive Service Showcase",
  defaultConfig: { ...HEADER_DEFAULT, services: [] },
  parse: (raw) => {
    const r = record(raw);
    const header = parseHeader(r);
    const services = objArr(r.services, (x) => {
      const o = record(x);
      const title = str(o.title, 80);
      const href = str(o.href, 500);
      if (!title || !href) return null;
      return { title, subtitle: str(o.subtitle, 120), desc: str(o.desc, 500), icon: str(o.icon, 60) || "Sparkles", image: str(o.image, 1000), href };
    }, 8);
    if (!header || services.length === 0) return null;
    return { ...header, services, ...parseLink(r) };
  },
  Renderer: HomeWhatWeBuild,
  toProps: (c) => ({ ...headerProps(c), services: c.services.map((x) => ({ ...x, icon: resolveIcon(x.icon) })), linkLabel: c.linkLabel, linkHref: c.linkHref }),
  fields: [...HEADER_FIELDS, ...LINK_FIELDS],
  repeaters: [
    {
      key: "services",
      label: "Services",
      itemFields: [
        { key: "title", label: "Title", kind: "text" },
        { key: "subtitle", label: "Subtitle", kind: "text" },
        { key: "desc", label: "Description", kind: "textarea" },
        { key: "icon", label: "Icon", kind: "icon" },
        { key: "image", label: "Image", kind: "image" },
        { key: "href", label: "Link", kind: "url" },
      ],
    },
  ],
};

// ── process-orbit ────────────────────────────────────────────────────────
// The existing `ProcessOrbit` component, registered as-is (the homepage's
// "AI & Innovation" hexagon). The layout has six fixed positions, so at most
// six nodes.

interface OrbitNodeConfig { label: string; icon: string; color: string; detail: string }
interface ProcessOrbitConfig extends Record<string, unknown> {
  eyebrowIcon: string;
  heading: string;
  headingAccent: string;
  description: string;
  centerLabel: string;
  centerSublabel: string;
  nodes: OrbitNodeConfig[];
  numbered: boolean;
  glow: "primary" | "secondary";
  image?: string;
}

const processOrbit: SectionTypeDef<ProcessOrbitConfig> = {
  type: "process-orbit",
  label: "Orbit Diagram",
  defaultConfig: { eyebrowIcon: "Network", heading: "", headingAccent: "", description: "", centerLabel: "", centerSublabel: "", nodes: [], numbered: false, glow: "secondary" },
  parse: (raw) => {
    const r = record(raw);
    const heading = str(r.heading, 120);
    const nodes = objArr(r.nodes, (x) => {
      const o = record(x);
      const label = str(o.label, 60);
      return label ? { label, icon: str(o.icon, 60) || "Sparkles", color: str(o.color, 60) || "text-primary", detail: str(o.detail, 200) } : null;
    }, 6);
    if (!heading || nodes.length === 0) return null;
    return {
      eyebrowIcon: str(r.eyebrowIcon, 60) || "Network",
      heading,
      headingAccent: str(r.headingAccent, 120),
      description: str(r.description, 600),
      centerLabel: str(r.centerLabel, 60),
      centerSublabel: str(r.centerSublabel, 80),
      nodes,
      numbered: bool(r.numbered),
      glow: r.glow === "primary" ? "primary" : "secondary",
      image: strOpt(r.image, 1000),
    };
  },
  Renderer: ProcessOrbit,
  toProps: (c) => ({
    eyebrowIcon: resolveIcon(c.eyebrowIcon),
    heading: c.heading,
    headingAccent: c.headingAccent,
    description: c.description,
    centerLabel: c.centerLabel,
    centerSublabel: c.centerSublabel,
    nodes: c.nodes.map((n) => ({ ...n, icon: resolveIcon(n.icon) })),
    numbered: c.numbered,
    glow: c.glow,
    image: c.image,
  }),
  fields: [
    { key: "eyebrowIcon", label: "Top icon", kind: "icon" },
    { key: "heading", label: "Heading", kind: "text" },
    { key: "headingAccent", label: "Heading accent", kind: "text" },
    { key: "description", label: "Description", kind: "textarea" },
    { key: "centerLabel", label: "Centre label", kind: "text" },
    { key: "centerSublabel", label: "Centre sub-label", kind: "text" },
    { key: "numbered", label: "Number the nodes", kind: "boolean" },
    { key: "image", label: "Background image (optional)", kind: "image" },
  ],
  repeaters: [
    {
      key: "nodes",
      label: "Nodes (max 6)",
      itemFields: [
        { key: "label", label: "Label", kind: "text" },
        { key: "detail", label: "Detail", kind: "textarea" },
        { key: "icon", label: "Icon", kind: "icon" },
        { key: "color", label: "Icon colour class (e.g. text-primary)", kind: "text" },
      ],
    },
  ],
};

// ── home-final-cta ───────────────────────────────────────────────────────

interface FinalCtaConfig extends Record<string, unknown> {
  heading: string;
  description: string;
  checklist: string[];
  email: string;
  phone: string;
  responseBadgeTitle: string;
  responseBadgeSubtitle: string;
  formIntro: string;
  namePlaceholder: string;
  phonePlaceholder: string;
  emailPlaceholder: string;
  messagePlaceholder: string;
  submitLabel: string;
  successTitle: string;
  successDescription: string;
}

const homeFinalCta: SectionTypeDef<FinalCtaConfig> = {
  type: "home-final-cta",
  label: "Final CTA + Consultation Form",
  defaultConfig: {
    heading: "",
    description: "",
    checklist: [],
    email: "",
    phone: "",
    responseBadgeTitle: "",
    responseBadgeSubtitle: "",
    formIntro: "",
    namePlaceholder: "",
    phonePlaceholder: "",
    emailPlaceholder: "",
    messagePlaceholder: "",
    submitLabel: "",
    submittingLabel: "",
    successTitle: "",
    successDescription: "",
  },
  parse: (raw) => {
    const r = record(raw);
    const heading = str(r.heading, 200);
    if (!heading) return null;
    return {
      heading,
      description: str(r.description, 600),
      checklist: strArr(r.checklist, 6, 60),
      email: str(r.email, 200),
      phone: str(r.phone, 40),
      responseBadgeTitle: str(r.responseBadgeTitle, 60),
      responseBadgeSubtitle: str(r.responseBadgeSubtitle, 60),
      formIntro: str(r.formIntro, 200),
      namePlaceholder: str(r.namePlaceholder, 60),
      phonePlaceholder: str(r.phonePlaceholder, 60),
      emailPlaceholder: str(r.emailPlaceholder, 60),
      messagePlaceholder: str(r.messagePlaceholder, 120),
      submitLabel: str(r.submitLabel, 40),
      submittingLabel: str(r.submittingLabel, 40),
      successTitle: str(r.successTitle, 80),
      successDescription: str(r.successDescription, 300),
    };
  },
  Renderer: HomeFinalCta,
  toProps: (c) => c,
  fields: [
    { key: "heading", label: "Heading", kind: "text" },
    { key: "description", label: "Description", kind: "textarea" },
    { key: "checklist", label: "Checklist", kind: "list" },
    { key: "email", label: "Contact email", kind: "text" },
    { key: "phone", label: "Contact phone", kind: "text" },
    { key: "responseBadgeTitle", label: "Floating badge title (optional)", kind: "text" },
    { key: "responseBadgeSubtitle", label: "Floating badge subtitle", kind: "text" },
    { key: "formIntro", label: "Form intro line", kind: "text" },
    { key: "namePlaceholder", label: "Name placeholder", kind: "text" },
    { key: "phonePlaceholder", label: "Phone placeholder", kind: "text" },
    { key: "emailPlaceholder", label: "Email placeholder", kind: "text" },
    { key: "messagePlaceholder", label: "Message placeholder", kind: "text" },
    { key: "submitLabel", label: "Submit button label", kind: "text" },
    { key: "submittingLabel", label: "Button while sending", kind: "text" },
    { key: "successTitle", label: "Success title", kind: "text" },
    { key: "successDescription", label: "Success message", kind: "textarea" },
  ],
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- heterogeneous config types, same as SECTION_REGISTRY
export const HOME_SECTION_TYPES: SectionTypeDef<any>[] = [
  homeTrustBadges,
  homeDepartments,
  homeWhyChooseUs,
  homeHowWeWork,
  homeDeliveryProcess,
  homeCommitments,
  homeResourcePreview,
  homeIndustries,
  homeWhatWeBuild,
  processOrbit,
  homeAssurances,
  homeFinalCta,
];
