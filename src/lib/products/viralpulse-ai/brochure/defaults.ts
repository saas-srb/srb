/**
 * Default section data factories for the Brochure Builder.
 * Each factory produces fully-structured, field-labelled (but empty) section data
 * ready for the editor. No fake company names, statistics, or testimonials.
 */

export function newSectionId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "sec_" + Math.random().toString(36).slice(2, 11) + Date.now().toString(36);
}

import type {
  BrochureSection,
  BrochureSectionType,
  HeroSection,
  OverviewSection,
  AboutSection,
  FeaturesSection,
  ServicesSection,
  GallerySection,
  TeamSection,
  TestimonialsSection,
  PricingSection,
  StatsSection,
  CurriculumSection,
  ProcessSection,
  ProjectsSection,
  AgendaSection,
  SpeakersSection,
  VenueSection,
  FloorplanSection,
  LocationSection,
  HighlightsSection,
  ItinerarySection,
  OfferSection,
  FaqSection,
  CtaSection,
  ContactSection,
  CustomSection,
  BrochureSectionData,
} from "./types";
import { DEFAULT_THEME, BROCHURE_CATEGORY_META, type BrochureCategory, type BrochureTheme } from "./types";

// ── Section data factories ───────────────────────────────────────────────────

function hero(): HeroSection {
  return {
    type: "hero",
    headline: "",
    subheadline: "",
    description: "",
    ctaLabel: "Get Started",
    ctaUrl: "",
    secondaryCtaLabel: "Learn More",
    secondaryCtaUrl: "",
    backgroundImage: null,
    backgroundOverlay: 40,
    layout: "centered",
  };
}

function overview(): OverviewSection {
  return {
    type: "overview",
    title: "Overview",
    body: "",
    image: null,
    layout: "text-left",
  };
}

function about(): AboutSection {
  return {
    type: "about",
    title: "About Us",
    body: "",
    image: null,
    founded: "",
    mission: "",
    vision: "",
  };
}

function features(): FeaturesSection {
  return {
    type: "features",
    title: "Key Features",
    subtitle: "",
    items: [
      { icon: "Star", title: "", description: "" },
      { icon: "Shield", title: "", description: "" },
      { icon: "Zap", title: "", description: "" },
    ],
    columns: 3,
  };
}

function services(): ServicesSection {
  return {
    type: "services",
    title: "Our Services",
    subtitle: "",
    items: [
      { title: "", description: "", icon: "Briefcase", price: "" },
      { title: "", description: "", icon: "Settings", price: "" },
      { title: "", description: "", icon: "Globe", price: "" },
    ],
  };
}

function gallery(): GallerySection {
  return {
    type: "gallery",
    title: "Gallery",
    items: [
      { src: null, alt: "", caption: "" },
      { src: null, alt: "", caption: "" },
      { src: null, alt: "", caption: "" },
    ],
    columns: 3,
    style: "grid",
  };
}

function team(): TeamSection {
  return {
    type: "team",
    title: "Meet the Team",
    subtitle: "",
    members: [
      { name: "", role: "", bio: "", photo: null, linkedin: "", twitter: "" },
      { name: "", role: "", bio: "", photo: null, linkedin: "", twitter: "" },
    ],
  };
}

function testimonials(): TestimonialsSection {
  return {
    type: "testimonials",
    title: "What Our Clients Say",
    subtitle: "",
    items: [
      { quote: "", author: "", role: "", company: "", avatar: null, rating: 5 },
      { quote: "", author: "", role: "", company: "", avatar: null, rating: 5 },
    ],
    style: "cards",
  };
}

function pricing(): PricingSection {
  return {
    type: "pricing",
    title: "Pricing",
    subtitle: "",
    currency: "₹",
    tiers: [
      {
        name: "Basic",
        price: "",
        period: "/month",
        description: "",
        features: ["", "", ""],
        highlighted: false,
        ctaLabel: "Get Started",
        ctaUrl: "",
      },
      {
        name: "Professional",
        price: "",
        period: "/month",
        description: "",
        features: ["", "", "", ""],
        highlighted: true,
        ctaLabel: "Get Started",
        ctaUrl: "",
      },
    ],
  };
}

function stats(): StatsSection {
  return {
    type: "stats",
    title: "",
    items: [
      { value: "", label: "Years of Experience", icon: "Clock" },
      { value: "", label: "Happy Clients", icon: "Users" },
      { value: "", label: "Projects Completed", icon: "CheckCircle" },
      { value: "", label: "Team Members", icon: "Award" },
    ],
    style: "dark",
  };
}

function curriculum(): CurriculumSection {
  return {
    type: "curriculum",
    title: "Course Curriculum",
    subtitle: "",
    modules: [
      { title: "Module 1", description: "", lessons: ["", ""], duration: "" },
      { title: "Module 2", description: "", lessons: ["", ""], duration: "" },
    ],
  };
}

function process(): ProcessSection {
  return {
    type: "process",
    title: "How It Works",
    subtitle: "",
    orientation: "horizontal",
    steps: [
      { number: "01", title: "", description: "", icon: "FileText" },
      { number: "02", title: "", description: "", icon: "Settings" },
      { number: "03", title: "", description: "", icon: "CheckCircle" },
    ],
  };
}

function projects(): ProjectsSection {
  return {
    type: "projects",
    title: "Our Work",
    subtitle: "",
    items: [
      { title: "", description: "", image: null, tags: [], link: "" },
      { title: "", description: "", image: null, tags: [], link: "" },
    ],
  };
}

function agenda(): AgendaSection {
  return {
    type: "agenda",
    title: "Event Agenda",
    items: [
      { time: "", title: "", speaker: "", description: "" },
      { time: "", title: "", speaker: "", description: "" },
    ],
  };
}

function speakers(): SpeakersSection {
  return {
    type: "speakers",
    title: "Speakers",
    subtitle: "",
    speakers: [
      { name: "", role: "", company: "", bio: "", photo: null, topic: "" },
      { name: "", role: "", company: "", bio: "", photo: null, topic: "" },
    ],
  };
}

function venue(): VenueSection {
  return {
    type: "venue",
    title: "Venue",
    name: "",
    address: "",
    city: "",
    mapEmbedUrl: "",
    directions: "",
    image: null,
  };
}

function floorplan(): FloorplanSection {
  return {
    type: "floorplan",
    title: "Floor Plan",
    subtitle: "",
    image: null,
    specs: [
      { label: "Total Area", value: "" },
      { label: "Bedrooms", value: "" },
      { label: "Bathrooms", value: "" },
      { label: "Parking", value: "" },
    ],
  };
}

function location(): LocationSection {
  return {
    type: "location",
    title: "Location",
    address: "",
    city: "",
    mapEmbedUrl: "",
    nearbyPlaces: [
      { name: "", distance: "" },
      { name: "", distance: "" },
    ],
  };
}

function highlights(): HighlightsSection {
  return {
    type: "highlights",
    title: "Highlights",
    subtitle: "",
    items: [
      { icon: "Star", title: "", description: "", image: null },
      { icon: "MapPin", title: "", description: "", image: null },
      { icon: "Camera", title: "", description: "", image: null },
    ],
  };
}

function itinerary(): ItinerarySection {
  return {
    type: "itinerary",
    title: "Itinerary",
    subtitle: "",
    days: [
      { day: "Day 1", title: "", activities: ["", ""], meals: "", accommodation: "" },
      { day: "Day 2", title: "", activities: ["", ""], meals: "", accommodation: "" },
    ],
  };
}

function offer(): OfferSection {
  return {
    type: "offer",
    title: "Special Offer",
    subtitle: "",
    discount: "",
    originalPrice: "",
    offerPrice: "",
    validUntil: "",
    terms: "",
    ctaLabel: "Claim Offer",
    ctaUrl: "",
    features: ["", "", ""],
  };
}

function faq(): FaqSection {
  return {
    type: "faq",
    title: "Frequently Asked Questions",
    subtitle: "",
    columns: 1,
    items: [
      { question: "", answer: "" },
      { question: "", answer: "" },
      { question: "", answer: "" },
    ],
  };
}

function cta(): CtaSection {
  return {
    type: "cta",
    headline: "",
    subheadline: "",
    ctaLabel: "Get Started",
    ctaUrl: "",
    secondaryCtaLabel: "Contact Us",
    secondaryCtaUrl: "",
    style: "dark",
  };
}

function contact(): ContactSection {
  return {
    type: "contact",
    title: "Contact Us",
    subtitle: "",
    email: "",
    phone: "",
    address: "",
    website: "",
    whatsapp: "",
    instagram: "",
    linkedin: "",
    facebook: "",
    youtube: "",
    twitter: "",
    showForm: true,
    formFields: [
      { key: "name", label: "Full Name", type: "text", required: true },
      { key: "email", label: "Email Address", type: "email", required: true },
      { key: "phone", label: "Phone Number", type: "phone", required: false },
      { key: "message", label: "Message", type: "textarea", required: false },
    ],
  };
}

function custom(): CustomSection {
  return {
    type: "custom",
    title: "Custom Section",
    content: "",
  };
}

// ── Section data map ─────────────────────────────────────────────────────────

const SECTION_FACTORIES: Record<BrochureSectionType, () => BrochureSectionData> = {
  hero,
  overview,
  about,
  features,
  services,
  gallery,
  team,
  testimonials,
  pricing,
  stats,
  curriculum,
  process,
  projects,
  agenda,
  speakers,
  venue,
  floorplan,
  location,
  highlights,
  itinerary,
  offer,
  faq,
  cta,
  contact,
  custom,
};

export function makeSection(type: BrochureSectionType): BrochureSection {
  const factory = SECTION_FACTORIES[type];
  return {
    id: newSectionId(),
    data: factory(),
    hidden: false,
  };
}

// ── Default sections for a category ─────────────────────────────────────────

export function defaultSections(category: BrochureCategory): BrochureSection[] {
  const meta = BROCHURE_CATEGORY_META[category];
  return meta.defaultSections.map((type) => makeSection(type));
}

// ── Default meta ─────────────────────────────────────────────────────────────

export function defaultMeta(): import("./types").BrochureDoc["meta"] {
  return {
    description: "",
    keywords: "",
    ogImage: null,
    favicon: null,
    logoUrl: null,
    logoAlt: "",
    brandName: "",
    qrEnabled: true,
  };
}

// ── Default theme ────────────────────────────────────────────────────────────

export function defaultTheme(): BrochureTheme {
  return { ...DEFAULT_THEME };
}
