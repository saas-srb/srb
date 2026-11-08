/**
 * Domain types for the AI-Powered Business Visiting Card module.
 * Covers 6 card layouts, 9 color schemes, sections, analytics, and document schemas.
 */

export type VCardLayout =
  | "classic"
  | "modern"
  | "minimal"
  | "bold"
  | "creative"
  | "executive";

export type VCardColorScheme =
  | "professional-blue"
  | "midnight-black"
  | "elegant-white"
  | "forest-green"
  | "royal-purple"
  | "rose-gold"
  | "coral-orange"
  | "slate-gray"
  | "custom";

export const VCARD_LAYOUTS: readonly VCardLayout[] = [
  "classic",
  "modern",
  "minimal",
  "bold",
  "creative",
  "executive",
];

export const VCARD_COLOR_SCHEMES: readonly VCardColorScheme[] = [
  "professional-blue",
  "midnight-black",
  "elegant-white",
  "forest-green",
  "royal-purple",
  "rose-gold",
  "coral-orange",
  "slate-gray",
  "custom",
];

export const VCARD_LAYOUT_META: Record<
  VCardLayout,
  { label: string; description: string }
> = {
  classic: {
    label: "Classic",
    description: "Traditional horizontal card — avatar left, contact info right",
  },
  modern: {
    label: "Modern",
    description: "Full-bleed gradient cover with centered floating avatar",
  },
  minimal: {
    label: "Minimal",
    description: "Clean white card, refined typography, generous spacing",
  },
  bold: {
    label: "Bold",
    description: "Dark background, large name, vibrant accent strip",
  },
  creative: {
    label: "Creative",
    description: "Asymmetric diagonal color split, dynamic composition",
  },
  executive: {
    label: "Executive",
    description: "Premium two-column with colored sidebar accent panel",
  },
};

export const VCARD_COLOR_SCHEME_META: Record<
  VCardColorScheme,
  { label: string; primary: string; secondary: string; bg: string; text: string; accent: string }
> = {
  "professional-blue": {
    label: "Professional Blue",
    primary: "#1d4ed8",
    secondary: "#3b82f6",
    bg: "#ffffff",
    text: "#0f172a",
    accent: "#dbeafe",
  },
  "midnight-black": {
    label: "Midnight Black",
    primary: "#1e293b",
    secondary: "#334155",
    bg: "#0f172a",
    text: "#f8fafc",
    accent: "#334155",
  },
  "elegant-white": {
    label: "Elegant White",
    primary: "#18181b",
    secondary: "#52525b",
    bg: "#ffffff",
    text: "#18181b",
    accent: "#f4f4f5",
  },
  "forest-green": {
    label: "Forest Green",
    primary: "#15803d",
    secondary: "#16a34a",
    bg: "#f0fdf4",
    text: "#14532d",
    accent: "#dcfce7",
  },
  "royal-purple": {
    label: "Royal Purple",
    primary: "#7c3aed",
    secondary: "#8b5cf6",
    bg: "#faf5ff",
    text: "#4c1d95",
    accent: "#ede9fe",
  },
  "rose-gold": {
    label: "Rose Gold",
    primary: "#be185d",
    secondary: "#db2777",
    bg: "#fff1f2",
    text: "#881337",
    accent: "#fce7f3",
  },
  "coral-orange": {
    label: "Coral Orange",
    primary: "#ea580c",
    secondary: "#f97316",
    bg: "#fff7ed",
    text: "#7c2d12",
    accent: "#ffedd5",
  },
  "slate-gray": {
    label: "Slate Gray",
    primary: "#475569",
    secondary: "#64748b",
    bg: "#f8fafc",
    text: "#1e293b",
    accent: "#e2e8f0",
  },
  custom: {
    label: "Custom",
    primary: "#1d4ed8",
    secondary: "#3b82f6",
    bg: "#ffffff",
    text: "#0f172a",
    accent: "#dbeafe",
  },
};

// ── Card Style ───────────────────────────────────────────────────────────────

export interface VCardStyle {
  primaryColor: string;
  secondaryColor: string;
  backgroundColor: string;
  textColor: string;
  accentColor: string;
  fontFamily: string;
  borderRadius: string;
}

export const DEFAULT_VCARD_STYLE: VCardStyle = {
  primaryColor: "#1d4ed8",
  secondaryColor: "#3b82f6",
  backgroundColor: "#ffffff",
  textColor: "#0f172a",
  accentColor: "#dbeafe",
  fontFamily: "Inter",
  borderRadius: "lg",
};

// ── Contact Info ─────────────────────────────────────────────────────────────

export interface VCardContact {
  email?: string;
  phone?: string;
  mobile?: string;
  website?: string;
  address?: string;
  city?: string;
  country?: string;
  linkedin?: string;
  twitter?: string;
  instagram?: string;
  facebook?: string;
  whatsapp?: string;
  calendly?: string;
}

// ── Branding ─────────────────────────────────────────────────────────────────

export interface VCardBranding {
  logo?: string | null;
  avatar?: string | null;
  coverImage?: string | null;
  tagline?: string;
}

// ── Sections ─────────────────────────────────────────────────────────────────

export type VCardSectionType =
  | "bio"
  | "services"
  | "skills"
  | "portfolio"
  | "testimonials"
  | "cta"
  | "social"
  | "custom";

export interface VCardSection {
  id: string;
  type: VCardSectionType;
  title?: string;
  content: Record<string, unknown>;
  hidden?: boolean;
}

// ── Main document ─────────────────────────────────────────────────────────────

export interface VCardDoc {
  _id: string;
  /** Display title for dashboard listing (e.g. "John's Visiting Card") */
  title: string;
  slug: string;
  name: string;
  jobTitle: string;
  company: string;
  bio?: string;
  layout: VCardLayout;
  colorScheme: VCardColorScheme;
  style: VCardStyle;
  contact: VCardContact;
  branding: VCardBranding;
  sections: VCardSection[];
  status: "draft" | "published";
  analytics: {
    views: number;
    ctaClicks: number;
    shares: number;
    lastViewedAt?: Date | null;
  };
  meta: {
    description?: string;
    keywords?: string;
  };
  publishedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string | null;
  updatedBy: string | null;
  deletedAt?: Date | null;
}

// ── Frontend types ────────────────────────────────────────────────────────────

export interface VCardDetail {
  id: string;
  title: string;
  slug: string;
  name: string;
  jobTitle: string;
  company: string;
  bio?: string;
  layout: VCardLayout;
  colorScheme: VCardColorScheme;
  style: VCardStyle;
  contact: VCardContact;
  branding: VCardBranding;
  sections: VCardSection[];
  status: "draft" | "published";
  analytics: {
    views: number;
    ctaClicks: number;
    shares: number;
    lastViewedAt: string | null;
  };
  meta: {
    description?: string;
    keywords?: string;
  };
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface VCardListItem {
  id: string;
  title: string;
  slug: string;
  name: string;
  jobTitle: string;
  company: string;
  layout: VCardLayout;
  colorScheme: VCardColorScheme;
  status: "draft" | "published";
  views: number;
  updatedAt: string;
  publishedAt: string | null;
}
