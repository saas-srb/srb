export const CATEGORIES = [
  { slug: "software-development", label: "Software Development", collection: "leads_software_development" },
  { slug: "digital-marketing", label: "Digital Marketing", collection: "leads_digital_marketing" },
  { slug: "ai-automations", label: "AI & Automations", collection: "leads_ai_automations" },
  { slug: "industrial-training", label: "Industrial Training", collection: "leads_industrial_training" },
  { slug: "resource-augmentation", label: "Resource Augmentation", collection: "leads_resource_augmentation" },
  { slug: "internship-program", label: "Internship Program", collection: "leads_internship_program" },
] as const;

export type CategorySlug = (typeof CATEGORIES)[number]["slug"];

export function isValidCategory(value: string): value is CategorySlug {
  return CATEGORIES.some((c) => c.slug === value);
}

export function getCategoryLabel(slug: CategorySlug): string {
  return CATEGORIES.find((c) => c.slug === slug)?.label ?? String(slug).replace(/-/g, " ").replace(/^./, (ch) => ch.toUpperCase());
}

export function collectionNameFor(slug: CategorySlug): string {
  // A company's own lead category (`lead-categories.ts`) is not one of the built-in six: it gets its own collection by slug.
  return CATEGORIES.find((c) => c.slug === slug)?.collection ?? `leads_${String(slug).replace(/[^a-z0-9]+/g, "_")}`;
}

const RESUME_CATEGORIES: readonly CategorySlug[] = ["industrial-training", "internship-program"];

/** Categories that collect a resume/CV upload instead of a free-text project brief. */
export function categoryAcceptsResume(slug: CategorySlug): boolean {
  return RESUME_CATEGORIES.includes(slug);
}

export interface SubService {
  slug: string;
  label: string;
}

const SUB_SERVICES: Record<CategorySlug, SubService[]> = {
  "software-development": [
    { slug: "web-app-development", label: "Web App Development" },
    { slug: "mobile-app-development", label: "Mobile App Development" },
    { slug: "desktop-app-development", label: "Desktop App Development" },
    { slug: "prediction-and-forecasting", label: "Prediction & Forecasting" },
    { slug: "ai-agent", label: "AI Agent" },
    { slug: "ai-ml-solutions", label: "AI/ML Solutions" },
    { slug: "vision-intelligence", label: "Vision Intelligence" },
    { slug: "ar-vr", label: "AR/VR" },
  ],
  "digital-marketing": [
    { slug: "seo", label: "SEO Services" },
    { slug: "performance-marketing", label: "Performance Marketing" },
    { slug: "social-media-marketing", label: "Social Media Marketing" },
    { slug: "content-marketing", label: "Content Marketing" },
    { slug: "email-marketing", label: "Email Marketing" },
    { slug: "lead-generation", label: "Lead Generation" },
    { slug: "conversion-rate-optimization", label: "Conversion Rate Optimization" },
    { slug: "online-reputation-management", label: "Online Reputation Management" },
    { slug: "local-digital-marketing", label: "Local Digital Marketing" },
    { slug: "ecommerce-marketing", label: "E-commerce Marketing" },
    { slug: "influencer-marketing", label: "Influencer Marketing" },
    { slug: "marketing-analytics", label: "Marketing Analytics & Reporting" },
  ],
  "ai-automations": [
    { slug: "intelligent-process-automation", label: "Intelligent Process Automation" },
    { slug: "conversational-ai-chatbots", label: "Conversational AI & Chatbots" },
    { slug: "ai-powered-data-analytics", label: "AI-Powered Data Analytics" },
    { slug: "document-intelligence", label: "Document Intelligence" },
    { slug: "predictive-ai-workflows", label: "Predictive AI Workflows" },
    { slug: "ai-integration-services", label: "AI Integration Services" },
    { slug: "robotic-process-automation", label: "Robotic Process Automation" },
  ],
  "industrial-training": [
    { slug: "mern-stack", label: "MERN Stack" },
    { slug: "mean-stack", label: "MEAN Stack" },
    { slug: "generative-ai", label: "Generative AI" },
    { slug: "agentic-ai", label: "Agentic AI" },
    { slug: "conversational-ai", label: "Conversational AI" },
    { slug: "computer-vision", label: "Computer Vision" },
  ],
  "resource-augmentation": [
    { slug: "single-resource", label: "Single Resource" },
    { slug: "package-based-team", label: "Package-Based Team" },
    { slug: "hourly-on-demand", label: "Hourly / On-Demand" },
    { slug: "project-based", label: "Project-Based" },
  ],
  "internship-program": [
    { slug: "mern-stack", label: "MERN Stack Internship" },
    { slug: "mean-stack", label: "MEAN Stack Internship" },
    { slug: "generative-ai", label: "Generative AI Internship" },
    { slug: "agentic-ai", label: "Agentic AI Internship" },
    { slug: "conversational-ai", label: "Conversational AI Internship" },
    { slug: "computer-vision", label: "Computer Vision Internship" },
  ],
};

export function getSubServices(slug: CategorySlug): SubService[] {
  // A company's own category (lead-categories.ts) is not one of the built-in six and has no entry here.
  return SUB_SERVICES[slug] ?? [];
}
