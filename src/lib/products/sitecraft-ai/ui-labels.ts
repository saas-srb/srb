/**
 * Interface text used by shared components across many pages (breadcrumbs,
 * card badges, "Read Article", hero badges…). The KEYS are code — each is a
 * slot a component renders — and the TEXT is CMS content (Site Identity →
 * Interface text, stored in `siteInfo.labels`). Values are kept verbatim
 * (not trimmed): some carry a deliberate trailing space.
 */
export const UI_LABELS = {
  breadcrumbHome: "Breadcrumb — home link",
  breadcrumbBlog: "Breadcrumb — blog link (article pages)",
  readingTime: "Article hero — reading-time caption",
  readArticle: "Blog cards — \"read\" button",
  featured: "Featured card badge",
  mostPopular: "Plan / listing cards — highlighted badge",
  bestForListing: "Listing cards — \"best for\" label",
  bestForPlan: "Plan cards — \"best for\" label (keep the trailing space)",
  caseChallenge: "Case studies — challenge label (keep the trailing space)",
  caseSolution: "Case studies — solution label (keep the trailing space)",
  upNext: "Article pages — \"up next\" label",
  readNextArticle: "Article pages — next-article link",
  exploreService: "Related services — link label",
  learnMore: "Homepage showcase — \"learn more\" link",
  onThisPage: "Legal pages — table of contents heading",
  sendAnother: "Form success — \"send another\" link",
  fileSelected: "Forms — selected file prefix (keep the trailing space)",
  heroBadgeOneTitle: "Page hero — floating badge 1 title",
  heroBadgeOneText: "Page hero — floating badge 1 text",
  heroBadgeTwoTitle: "Page hero — floating badge 2 title",
  heroBadgeTwoText: "Page hero — floating badge 2 text",
  exploreMore: "Listing cards — default button label",
  exploreMoreFeatured: "Featured listing card — default button label",
  faqTitle: "FAQ blocks — default heading",
  relatedServicesTitle: "Related services — default heading",
  relatedPostsTitle: "Related articles — default heading",
  messageSent: "Form success — default title",
  liveDemoHeading: "Live demo — default heading",
  liveDemoDescription: "Live demo — default description",
  detailCtaLabel: "Closing CTA — default button label",
  planFeaturesLabel: "Plan cards — features heading",
  viewDetails: "Plan cards — default button label",
  morePillars: "Service pillars — default section label",
} as const;

export type UiLabelKey = keyof typeof UI_LABELS;
export type UiLabels = Record<UiLabelKey, string>;

export const EMPTY_UI_LABELS = Object.fromEntries(Object.keys(UI_LABELS).map((k) => [k, ""])) as UiLabels;

export function parseUiLabels(raw: unknown): UiLabels {
  const r = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return Object.fromEntries(Object.keys(UI_LABELS).map((k) => [k, typeof r[k] === "string" ? (r[k] as string).slice(0, 300) : ""])) as UiLabels;
}
