/**
 * Shapes of the website's content records (blog posts, jobs, engagement
 * models, products). Types only — the records themselves live in the CMS.
 */
import type { LucideIcon } from "lucide-react";

export interface JobListItem {
  title: string;
  description: string;
}

export type JobStatus = "published" | "draft" | "closed" | "expired";

export interface BaseSalary {
  currency: string;
  minValue?: number;
  maxValue?: number;
  value?: number;
  unitText: "HOUR" | "DAY" | "WEEK" | "MONTH" | "YEAR";
}

export interface Job {
  slug: string;
  title: string;
  category: string;
  icon: LucideIcon;
  summary: string;
  employmentType: string;
  location: string;
  experience: string;
  responsibilities: JobListItem[];
  qualifications: JobListItem[];
  niceToHave: string[];
  skills: string[];
  status?: JobStatus;
  datePosted?: string;
  validThrough?: string;
  baseSalary?: BaseSalary;
  isRemote?: boolean;
}

export interface JobCategory {
  name: string;
  icon: LucideIcon;
  description: string;
}

export interface ListItem {
  title: string;
  description: string;
}

export interface HiringStep {
  title: string;
  duration: string;
  topics: string[];
}

export interface Faq {
  question: string;
  answer: string;
}

export interface CardHighlight {
  engagementModel: string;
  idealUseCase: string;
  teamComposition: string;
  pricing: string;
  billingType: string;
  hiringDuration: string;
}

export interface SubOption {
  slug: string;
  title: string;
  icon: LucideIcon;
  tagline: string;
  points: string[];
  price: string;
  featured?: boolean;
}

export interface EngagementCategory {
  slug: string;
  title: string;
  icon: LucideIcon;
  tagline: string;
  summary: string;
  cardHighlight: CardHighlight;
  keyBenefits: string[];
  features: ListItem[];
  overview: ListItem[];
  idealUseCase: string[];
  subOptions: SubOption[];
  subOptionsIntro: string;
  deliverables: string[];
  pricingIntro: string;
  hiringProcess: HiringStep[];
  faqs: Faq[];
}

export interface BlogPostMeta {
  slug: string;
  title: string;
  seoTitle: string;
  description: string;
  excerpt: string;
  category: string;
  keywords: string[];
  /** Short, chip-friendly tags shown on blog cards — distinct from the longer SEO `keywords`. */
  tags: string[];
  image: string;
  imageAlt: string;
  author: string;
  date: string;
  readTime: string;
  /** Slugs of the 3 most topically relevant other posts, used for the "Related reading" block. */
  related: string[];
  /** Icon-map key shown with the post's category. */
  icon?: string;
}

export interface ProductScreen {
  id: string;
  title: string;
  description: string;
  badge?: string;
  mockupType: string;
}

export interface ProductFeature {
  title: string;
  description: string;
  aiPowered?: boolean;
}

export interface Hotspot {
  id: string;
  x: number; // percentage from left (0 - 100)
  y: number; // percentage from top (0 - 100)
  title: string;
  description: string;
  badge?: string;
}

export interface ProductItem {
  id: string;
  slug: string;
  name: string;
  badge: string;
  tagline: string;
  category: "Executive & Operations" | "HR & Talent" | "Project & Delivery" | "Procurement & Finance" | "Sales & Marketing" | "AI & Intelligence" | "Assessment & Security";
  panelPath: string;
  iconName: string;
  icon: LucideIcon;
  shortDescription: string;
  fullDescription: string;
  primaryPurpose: string;
  problemSolved: string;
  businessOutcome: string;
  targetDepartments: string[];
  targetUsers: string[];
  aiCapabilities: string[];
  keyFeatures: ProductFeature[];
  metrics: { label: string; value: string }[];
  screens: ProductScreen[];
  hotspots: Hotspot[];
  accentColor: string;
  isFeatured?: boolean;
  // ── Product page (/products/<slug>) content — all optional; sections hide when empty. ──
  /** Short product label for menus and chips, e.g. "HR & Payroll" (falls back to `name`). */
  shortName?: string;
  /** One-line value for menus and cards (falls back to `tagline`). */
  valueLine?: string;
  /** Hero pitch (falls back to `shortDescription`). */
  pitch?: string;
  /** "What it does" body (falls back to `fullDescription`). */
  overview?: string;
  /** "Business outcome" statement on the page (falls back to `businessOutcome`). */
  outcome?: string;
  /** Verified numbers/facts shown as the metrics strip (falls back to `metrics`). */
  facts?: { label: string; value: string }[];
  /** Product-page feature grid (falls back to `keyFeatures`). */
  features?: ProductPageItem[];
  /** What the AI in/around this product concretely does (falls back to `aiCapabilities`). */
  aiFeatures?: ProductPageItem[];
  benefits?: ProductPageItem[];
  useCases?: ProductPageItem[];
  automationWorkflows?: ProductWorkflow[];
  /** Other products and real integration points only. */
  integrations?: { name: string; description: string; href?: string }[];
  scenarios?: string[];
  faq?: { q: string; a: string }[];
  /** "Who it's for" paragraph. */
  audience?: string;
  screenshots?: ProductScreenshot[];
  /** "The problem it solves": lead-in paragraph, then the cards and the without/with comparison. All optional: the section falls back to `problemSolved`. */
  problemIntro?: string;
  problems?: ProductProblem[];
  beforeAfter?: ProductBeforeAfter[];
  /** Override which CTAs the page shows. */
  ctas?: { primary?: ProductCtaKind; secondary?: ProductCtaKind };
}

export interface ProductPageItem {
  title: string;
  description: string;
  /** Icon-map key. */
  icon?: string;
}
export interface ProductProblem {
  title: string;
  description: string;
  /** Icon-map key (optional; a default is picked by position). */
  icon?: string;
}
export interface ProductBeforeAfter {
  before: string;
  after: string;
}
export interface ProductWorkflow {
  title: string;
  description: string;
  steps: string[];
}
export interface ProductScreenshot {
  src: string;
  alt: string;
  caption: string;
}
export type ProductCtaKind = "get-started" | "request-demo" | "start-using" | "none";
