/**
 * Brochure Builder – domain types.
 *
 * A brochure is a multi-section document the user builds in the editor, then
 * publishes at a unique public URL. Everything is JSON-serialisable so it can
 * be stored in MongoDB and sent to the browser as-is.
 */

// ── Category ──────────────────────────────────────────────────────────────

export const BROCHURE_CATEGORIES = [
  "training",
  "product",
  "company",
  "service",
  "portfolio",
  "real-estate",
  "event",
  "healthcare",
  "travel",
  "marketing",
  "custom",
] as const;

export type BrochureCategory = (typeof BROCHURE_CATEGORIES)[number];

export interface BrochureCategoryMeta {
  label: string;
  description: string;
  icon: string; // lucide icon name
  color: string; // tailwind accent colour
  defaultSections: BrochureSectionType[];
}

export const BROCHURE_CATEGORY_META: Record<BrochureCategory, BrochureCategoryMeta> = {
  training: {
    label: "Training & Education",
    description: "Courses, coaching programs, workshops, certifications and academic programs.",
    icon: "GraduationCap",
    color: "violet",
    defaultSections: ["hero", "overview", "features", "curriculum", "testimonials", "pricing", "faq", "contact"],
  },
  product: {
    label: "Products",
    description: "Physical products, digital products, SaaS, catalogs and product launches.",
    icon: "Package",
    color: "blue",
    defaultSections: ["hero", "overview", "features", "gallery", "testimonials", "pricing", "contact"],
  },
  company: {
    label: "Company & Business",
    description: "Company profiles, corporate presentations, service overviews and portfolios.",
    icon: "Building2",
    color: "slate",
    defaultSections: ["hero", "about", "services", "team", "stats", "testimonials", "contact"],
  },
  service: {
    label: "Services",
    description: "Professional, consulting, marketing, IT and other service offerings.",
    icon: "Briefcase",
    color: "emerald",
    defaultSections: ["hero", "overview", "services", "process", "testimonials", "pricing", "contact"],
  },
  portfolio: {
    label: "Portfolio",
    description: "Personal, agency, creative portfolios and project showcases.",
    icon: "LayoutGrid",
    color: "pink",
    defaultSections: ["hero", "about", "gallery", "projects", "testimonials", "contact"],
  },
  "real-estate": {
    label: "Real Estate",
    description: "Residential and commercial property listings and project brochures.",
    icon: "Home",
    color: "amber",
    defaultSections: ["hero", "overview", "features", "gallery", "floorplan", "location", "contact"],
  },
  event: {
    label: "Events",
    description: "Conferences, seminars, exhibitions, corporate events and workshops.",
    icon: "CalendarDays",
    color: "orange",
    defaultSections: ["hero", "overview", "agenda", "speakers", "venue", "pricing", "contact"],
  },
  healthcare: {
    label: "Healthcare",
    description: "Hospitals, clinics, healthcare services, treatments and wellness programs.",
    icon: "HeartPulse",
    color: "rose",
    defaultSections: ["hero", "overview", "services", "team", "stats", "testimonials", "contact"],
  },
  travel: {
    label: "Travel & Hospitality",
    description: "Travel packages, tour itineraries, hotels, resorts and holiday packages.",
    icon: "Plane",
    color: "sky",
    defaultSections: ["hero", "overview", "highlights", "itinerary", "gallery", "pricing", "contact"],
  },
  marketing: {
    label: "Marketing & Promotions",
    description: "Sales campaigns, promotional offers, brand introductions and advertising.",
    icon: "Megaphone",
    color: "yellow",
    defaultSections: ["hero", "overview", "features", "offer", "testimonials", "cta", "contact"],
  },
  custom: {
    label: "Custom",
    description: "Build a brochure for any industry or purpose with a blank canvas.",
    icon: "Sparkles",
    color: "primary",
    defaultSections: ["hero", "overview", "contact"],
  },
};

// ── Section types ──────────────────────────────────────────────────────────

export const BROCHURE_SECTION_TYPES = [
  "hero",
  "overview",
  "about",
  "features",
  "services",
  "gallery",
  "team",
  "testimonials",
  "pricing",
  "stats",
  "curriculum",
  "process",
  "projects",
  "agenda",
  "speakers",
  "venue",
  "floorplan",
  "location",
  "highlights",
  "itinerary",
  "offer",
  "faq",
  "cta",
  "contact",
  "custom",
] as const;

export type BrochureSectionType = (typeof BROCHURE_SECTION_TYPES)[number];

// ── Section data models ────────────────────────────────────────────────────

export interface HeroSection {
  type: "hero";
  headline: string;
  subheadline: string;
  description: string;
  ctaLabel: string;
  ctaUrl: string;
  secondaryCtaLabel: string;
  secondaryCtaUrl: string;
  backgroundImage: string | null;
  backgroundOverlay: number; // 0–100
  layout: "centered" | "split-left" | "split-right";
}

export interface OverviewSection {
  type: "overview";
  title: string;
  body: string;
  image: string | null;
  layout: "text-left" | "text-right" | "text-only";
}

export interface AboutSection {
  type: "about";
  title: string;
  body: string;
  image: string | null;
  founded: string;
  mission: string;
  vision: string;
}

export interface FeaturesItem {
  icon: string;
  title: string;
  description: string;
}

export interface FeaturesSection {
  type: "features";
  title: string;
  subtitle: string;
  items: FeaturesItem[];
  columns: 2 | 3 | 4;
}

export interface ServicesItem {
  title: string;
  description: string;
  icon: string;
  price: string;
}

export interface ServicesSection {
  type: "services";
  title: string;
  subtitle: string;
  items: ServicesItem[];
}

export interface GalleryItem {
  src: string | null;
  alt: string;
  caption: string;
}

export interface GallerySection {
  type: "gallery";
  title: string;
  items: GalleryItem[];
  columns: 2 | 3 | 4;
  style: "grid" | "masonry";
}

export interface TeamMember {
  name: string;
  role: string;
  bio: string;
  photo: string | null;
  linkedin: string;
  twitter: string;
}

export interface TeamSection {
  type: "team";
  title: string;
  subtitle: string;
  members: TeamMember[];
}

export interface Testimonial {
  quote: string;
  author: string;
  role: string;
  company: string;
  avatar: string | null;
  rating: 1 | 2 | 3 | 4 | 5 | null;
}

export interface TestimonialsSection {
  type: "testimonials";
  title: string;
  subtitle: string;
  items: Testimonial[];
  style: "cards" | "carousel";
}

export interface PricingTier {
  name: string;
  price: string;
  period: string;
  description: string;
  features: string[];
  highlighted: boolean;
  ctaLabel: string;
  ctaUrl: string;
}

export interface PricingSection {
  type: "pricing";
  title: string;
  subtitle: string;
  tiers: PricingTier[];
  currency: string;
}

export interface StatItem {
  value: string;
  label: string;
  icon: string;
}

export interface StatsSection {
  type: "stats";
  title: string;
  items: StatItem[];
  style: "dark" | "light" | "branded";
}

export interface CurriculumModule {
  title: string;
  description: string;
  lessons: string[];
  duration: string;
}

export interface CurriculumSection {
  type: "curriculum";
  title: string;
  subtitle: string;
  modules: CurriculumModule[];
}

export interface ProcessStep {
  number: string;
  title: string;
  description: string;
  icon: string;
}

export interface ProcessSection {
  type: "process";
  title: string;
  subtitle: string;
  steps: ProcessStep[];
  orientation: "horizontal" | "vertical";
}

export interface ProjectCard {
  title: string;
  description: string;
  image: string | null;
  tags: string[];
  link: string;
}

export interface ProjectsSection {
  type: "projects";
  title: string;
  subtitle: string;
  items: ProjectCard[];
}

export interface AgendaItem {
  time: string;
  title: string;
  speaker: string;
  description: string;
}

export interface AgendaSection {
  type: "agenda";
  title: string;
  items: AgendaItem[];
}

export interface Speaker {
  name: string;
  role: string;
  company: string;
  bio: string;
  photo: string | null;
  topic: string;
}

export interface SpeakersSection {
  type: "speakers";
  title: string;
  subtitle: string;
  speakers: Speaker[];
}

export interface VenueSection {
  type: "venue";
  title: string;
  name: string;
  address: string;
  city: string;
  mapEmbedUrl: string;
  directions: string;
  image: string | null;
}

export interface FloorplanSection {
  type: "floorplan";
  title: string;
  subtitle: string;
  image: string | null;
  specs: { label: string; value: string }[];
}

export interface LocationSection {
  type: "location";
  title: string;
  address: string;
  city: string;
  mapEmbedUrl: string;
  nearbyPlaces: { name: string; distance: string }[];
}

export interface HighlightsItem {
  icon: string;
  title: string;
  description: string;
  image: string | null;
}

export interface HighlightsSection {
  type: "highlights";
  title: string;
  subtitle: string;
  items: HighlightsItem[];
}

export interface ItineraryDay {
  day: string;
  title: string;
  activities: string[];
  meals: string;
  accommodation: string;
}

export interface ItinerarySection {
  type: "itinerary";
  title: string;
  subtitle: string;
  days: ItineraryDay[];
}

export interface OfferSection {
  type: "offer";
  title: string;
  subtitle: string;
  discount: string;
  originalPrice: string;
  offerPrice: string;
  validUntil: string;
  terms: string;
  ctaLabel: string;
  ctaUrl: string;
  features: string[];
}

export interface FaqItem {
  question: string;
  answer: string;
}

export interface FaqSection {
  type: "faq";
  title: string;
  subtitle: string;
  items: FaqItem[];
  columns: 1 | 2;
}

export interface CtaSection {
  type: "cta";
  headline: string;
  subheadline: string;
  ctaLabel: string;
  ctaUrl: string;
  secondaryCtaLabel: string;
  secondaryCtaUrl: string;
  style: "dark" | "branded" | "light";
}

export interface ContactSection {
  type: "contact";
  title: string;
  subtitle: string;
  email: string;
  phone: string;
  address: string;
  website: string;
  whatsapp: string;
  instagram: string;
  linkedin: string;
  facebook: string;
  youtube: string;
  twitter: string;
  showForm: boolean;
  formFields: ContactFormField[];
}

export interface ContactFormField {
  key: string;
  label: string;
  type: "text" | "email" | "phone" | "textarea" | "select";
  required: boolean;
  options?: string[];
}

export interface CustomSection {
  type: "custom";
  title: string;
  content: string; // rich text / html
}

// Union of all section data types
export type BrochureSectionData =
  | HeroSection
  | OverviewSection
  | AboutSection
  | FeaturesSection
  | ServicesSection
  | GallerySection
  | TeamSection
  | TestimonialsSection
  | PricingSection
  | StatsSection
  | CurriculumSection
  | ProcessSection
  | ProjectsSection
  | AgendaSection
  | SpeakersSection
  | VenueSection
  | FloorplanSection
  | LocationSection
  | HighlightsSection
  | ItinerarySection
  | OfferSection
  | FaqSection
  | CtaSection
  | ContactSection
  | CustomSection;

// ── Section (the structural wrapper) ──────────────────────────────────────

export interface BrochureSection {
  id: string;
  data: BrochureSectionData;
  /** User may toggle sections off without deleting them. */
  hidden: boolean;
  /** Background override for this section. */
  background?: string;
}

// ── Design / theme ─────────────────────────────────────────────────────────

export interface BrochureTheme {
  primaryColor: string;
  accentColor: string;
  backgroundColor: string;
  textColor: string;
  headingFont: string;
  bodyFont: string;
  borderRadius: "none" | "sm" | "md" | "lg" | "xl";
  density: "compact" | "comfortable" | "spacious";
}

export const DEFAULT_THEME: BrochureTheme = {
  primaryColor: "#2563eb",
  accentColor: "#7c3aed",
  backgroundColor: "#ffffff",
  textColor: "#111827",
  headingFont: "Inter",
  bodyFont: "Inter",
  borderRadius: "lg",
  density: "comfortable",
};

// ── Brochure status ────────────────────────────────────────────────────────

export type BrochureStatus = "draft" | "published";

// ── Brochure document ──────────────────────────────────────────────────────

export interface BrochureDoc {
  _id: string;
  title: string;
  slug: string;
  category: BrochureCategory;
  customCategory: string | null; // when category === "custom"
  status: BrochureStatus;
  sections: BrochureSection[];
  theme: BrochureTheme;
  meta: {
    description: string;
    keywords: string;
    ogImage: string | null;
    favicon: string | null;
    logoUrl: string | null;
    logoAlt: string;
    brandName: string;
    qrEnabled: boolean;
  };
  analytics: {
    views: number;
    ctaClicks: number;
    formSubmissions: number;
    lastViewedAt: Date | null;
  };
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string | null;
  updatedBy: string | null;
  deletedAt: Date | null;
}

// ── Lead captures ──────────────────────────────────────────────────────────

export interface BrochureLeadDoc {
  _id: string;
  brochureId: string;
  brochureTitle: string;
  fields: Record<string, string>;
  submittedAt: Date;
  ip: string | null;
  userAgent: string | null;
}

// ── Analytics event ────────────────────────────────────────────────────────

export interface BrochureEventDoc {
  _id: string;
  brochureId: string;
  type: "view" | "cta_click" | "form_submit";
  section: string | null;
  referrer: string | null;
  country: string | null;
  device: "desktop" | "tablet" | "mobile" | null;
  at: Date;
}

// ── API return shapes ──────────────────────────────────────────────────────

export interface BrochureListItem {
  id: string;
  title: string;
  slug: string;
  category: BrochureCategory;
  status: BrochureStatus;
  views: number;
  ctaClicks: number;
  updatedAt: string;
  publishedAt: string | null;
}

export interface BrochureDetail {
  id: string;
  title: string;
  slug: string;
  category: BrochureCategory;
  customCategory: string | null;
  status: BrochureStatus;
  sections: BrochureSection[];
  theme: BrochureTheme;
  meta: BrochureDoc["meta"];
  analytics: {
    views: number;
    ctaClicks: number;
    formSubmissions: number;
    lastViewedAt: string | null;
  };
  publishedAt: string | null;
  updatedAt: string;
  createdAt: string;
}
