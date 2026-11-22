import type { MicroFeature } from "./types";

const P = "sitecraft-ai";
type Row = [short: string, module: string, kind: MicroFeature["kind"], label: string, description: string, level: "read" | "write", legacy: string[], scope?: "all"];

/** What everybody given SiteCraft gets: the dashboard (which shows only what their other features allow). */
const BASELINE = new Set(["dashboard.view"]);

const ROWS: Row[] = [
  ["dashboard.view", "Dashboard", "page", "Open the dashboard", "Open the SiteCraft dashboard with the numbers of the areas the person can see.", "read", ["cms.VIEW"]],
  ["pages.view", "Pages", "page", "See pages", "Open the page list, a page's builder in read-only mode and its history.", "read", ["cms.VIEW"]],
  ["pages.create", "Pages", "button", "Create pages", "Add a new page.", "write", ["cms.PAGES_CREATE"]],
  ["pages.edit", "Pages", "button", "Change page SEO with the AI assistant", "Change a page's search appearance through the Ask AI assistant (section editing in the builder is its own feature).", "write", ["cms.PAGES_EDIT"]],
  ["sections.edit", "Pages", "button", "Edit sections", "Add, remove, reorder and configure the sections of a page.", "write", ["cms.SECTIONS_EDIT"]],
  ["pages.delete", "Pages", "button", "Delete pages", "Remove a page.", "write", ["cms.PAGES_DELETE"]],
  ["pages.publish", "Pages", "button", "Publish pages", "Publish a page's draft to the live site.", "write", ["cms.PAGES_PUBLISH"]],
  ["pages.restore", "Pages", "button", "Restore versions", "Load a prior published version back into draft.", "write", ["cms.PAGES_RESTORE"]],
  ["navigation.view", "Navigation", "page", "See navigation", "Open the header navigation.", "read", ["cms.VIEW"]],
  ["navigation.manage", "Navigation", "button", "Manage navigation", "Edit and reorder the header navigation.", "write", ["cms.NAV_MANAGE"]],
  ["footer.view", "Footer", "page", "See the footer", "Open the footer columns and links.", "read", ["cms.VIEW"]],
  ["footer.manage", "Footer", "button", "Manage the footer", "Edit and reorder the footer.", "write", ["cms.FOOTER_MANAGE"]],
  ["identity.view", "Site identity", "page", "See site identity", "Open the site identity (name, logo, contact details).", "read", ["cms.VIEW"]],
  ["media.view", "Media library", "page", "See media", "Open the media library.", "read", ["cms.VIEW"]],
  ["media.upload", "Media library", "button", "Upload media", "Upload images to the media library.", "write", ["cms.MEDIA_UPLOAD"]],
  ["media.delete", "Media library", "button", "Delete media", "Remove media library items.", "write", ["cms.MEDIA_DELETE"]],
  ["forms.view", "Forms", "page", "See forms", "Open the contact form fields.", "read", ["cms.VIEW"]],
  ["forms.manage", "Forms", "button", "Manage forms", "Edit form field labels, order and visibility.", "write", ["cms.FORMS_MANAGE"]],
  ["theme.view", "Theme", "page", "See the theme", "Open the themes and their previews.", "read", ["cms.VIEW"]],
  ["theme.edit", "Theme", "button", "Edit the theme", "Edit draft theme tokens and preview them.", "write", ["cms.THEME_UPDATE"]],
  ["theme.publish", "Theme", "button", "Publish the theme", "Publish draft theme tokens to the live site.", "write", ["cms.THEME_PUBLISH"]],
  ["aiwebsite.use", "AI website", "page", "Use the AI website generator", "Open the AI website generator and apply its result (it rewrites the theme and pages).", "write", ["cms.THEME_PUBLISH"]],
  ["collections.view", "Collections", "page", "See collections", "Open blog posts, jobs, engagement models and products.", "read", ["cms.VIEW"]],
  ["collections.edit", "Collections", "button", "Edit collections", "Create and edit draft collection records.", "write", ["cms.COLLECTIONS_EDIT"]],
  ["collections.publish", "Collections", "button", "Publish collections", "Publish, archive or revert collection records on the live site.", "write", ["cms.COLLECTIONS_PUBLISH"]],
  ["seo.view", "SEO", "page", "See page SEO", "Open the SEO overview of the site's pages.", "read", ["cms.VIEW"]],
  ["offers.manage", "Offers & coupons", "page", "Manage offers and coupons", "Open and edit offer campaigns, coupons, claims and subscribers (shared with DealFlow: a DealFlow person who may manage offers holds it there).", "write", ["cms.PAGES_EDIT"]],
  ["wallet.manage", "Wallets & rewards", "page", "Manage wallets and rewards", "Open and edit wallets, reward rules, usage rules, campaigns and referrals (shared with DealFlow: a DealFlow person who may manage wallets holds it there).", "write", ["cms.SETTINGS_MANAGE"]],
  ["settings.manage", "Settings", "section", "Change SiteCraft settings", "Edit global SiteCraft settings (maintenance mode, defaults).", "write", ["cms.SETTINGS_MANAGE"]],
  ["activity.view", "Activity log", "page", "Read the activity log", "Read the SiteCraft audit trail.", "read", ["cms.VIEW_AUDIT"]],
];

export const SITECRAFT_MICRO: MicroFeature[] = ROWS.map(([short, module, kind, label, description, level, legacy, scope]) => ({
  key: `${P}.${short}`, product: P, module, kind, label, description, level, legacy, ...(scope ? { scope } : {}), ...(BASELINE.has(short) ? { baseline: true } : {}),
}));
