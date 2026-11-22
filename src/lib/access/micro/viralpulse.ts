import type { MicroFeature } from "./types";

const P = "viralpulse-ai";
type Row = [short: string, module: string, kind: MicroFeature["kind"], label: string, description: string, level: "read" | "write", legacy: string[], scope?: "all"];

/** What everybody given ViralPulse gets: the dashboard (which shows only what their other features allow). */
const BASELINE = new Set(["dashboard.view"]);

const ROWS: Row[] = [
  ["dashboard.view", "Dashboard", "page", "Open the dashboard", "Open the ViralPulse dashboard with the numbers of the areas the person can see.", "read", ["smms.VIEW_CAMPAIGNS"]],
  ["campaigns.view", "Campaigns", "page", "See campaigns and ads", "Open campaigns, their ads and the ad launch status.", "read", ["smms.VIEW_CAMPAIGNS"]],
  ["campaigns.create", "Campaigns", "button", "Create campaigns", "Create and duplicate campaigns.", "write", ["smms.CREATE_CAMPAIGNS"]],
  ["campaigns.edit", "Campaigns", "button", "Edit campaigns", "Edit, archive and link campaigns, and change an ad launch before it goes live.", "write", ["smms.EDIT_CAMPAIGNS"]],
  ["campaigns.delete", "Campaigns", "button", "Delete campaigns, ads and posts", "Delete campaigns, ads and posts.", "write", ["smms.DELETE_CAMPAIGNS"]],
  ["ads.create", "Ads", "button", "Create and launch ads", "Create ads and launches and attach media to them.", "write", ["smms.CREATE_ADS"]],
  ["ads.approve", "Ads", "button", "Approve ad spend", "Approve or revoke ad spend, pause everything running, and use the kill switch with the limits.", "write", ["smms.APPROVE_AD_SPEND"]],
  ["ads.limits", "Ads", "button", "Manage ad limits", "Change the spending guard and ad limits.", "write", ["smms.MANAGE_AD_LIMITS"]],
  ["posts.view", "Posts", "page", "See posts", "Open the post list and a post's details.", "read", ["smms.VIEW_CAMPAIGNS"]],
  ["posts.manage", "Posts", "button", "Create and edit posts", "Create, edit, duplicate, archive and plan posts.", "write", ["smms.MANAGE_POSTS"]],
  ["posts.generate", "Posts", "button", "Generate posts with AI", "Use the AI generator and the AI content tools.", "write", ["smms.GENERATE_AI_CONTENT"]],
  ["posts.schedule", "Posts", "button", "Schedule posts", "Schedule posts and ads.", "write", ["smms.SCHEDULE_POSTS"]],
  ["posts.publish", "Posts", "button", "Approve and publish", "Approve, publish, and mark posts and ads live.", "write", ["smms.PUBLISH_CONTENT"]],
  ["library.view", "Media library", "page", "See the media library", "Open the media library and pick media.", "read", ["smms.VIEW_CAMPAIGNS"]],
  ["media.manage", "Media library", "button", "Manage media", "Upload, replace, edit and delete media.", "write", ["smms.MANAGE_MEDIA"]],
  ["brand.view", "Brand kit", "page", "See the brand kit", "Open the brand kit.", "read", ["smms.VIEW_CAMPAIGNS"]],
  ["studio.use", "Image studio", "page", "Use the image studio", "Open the image studio and work on image projects and media.", "write", ["smms.MANAGE_MEDIA"]],
  ["studio.generate", "Image studio", "button", "Generate images with AI", "Generate images with AI in the studio and elsewhere.", "write", ["smms.GENERATE_AI_CONTENT"]],
  ["studio.approve", "Image studio", "button", "Approve studio images", "Approve or reject generated studio images.", "write", ["smms.PUBLISH_CONTENT"]],
  ["ugc.use", "UGC videos", "page", "Make UGC videos", "Open UGC video projects and create, edit and generate them.", "write", ["smms.GENERATE_AI_CONTENT"]],
  ["ugc.settings", "UGC videos", "section", "Change UGC settings", "Change UGC video settings.", "write", ["smms.MANAGE_INTEGRATIONS"]],
  ["brochures.use", "Brochures", "page", "Make brochures", "Open brochures and create, edit and publish them, with AI help.", "write", ["smms.MANAGE_POSTS"]],
  ["vcards.use", "Digital cards", "page", "Make digital cards", "Open digital cards and create, edit and publish them, with AI help.", "write", ["smms.GENERATE_AI_CONTENT"]],
  ["analytics.view", "Analytics", "page", "See analytics", "Open post analytics and export posts.", "read", ["smms.VIEW_ANALYTICS"]],
  ["integrations.manage", "Settings", "section", "Manage accounts and settings", "Connect and disconnect social and ad accounts, and change publishing, brand, AI and metrics settings.", "write", ["smms.MANAGE_INTEGRATIONS"]],
  ["activity.view", "Activity log", "page", "Read the activity log", "Read the ViralPulse activity log.", "read", ["smms.VIEW_AUDIT_LOG"]],
];

export const VIRALPULSE_MICRO: MicroFeature[] = ROWS.map(([short, module, kind, label, description, level, legacy, scope]) => ({
  key: `${P}.${short}`, product: P, module, kind, label, description, level, legacy, ...(scope ? { scope } : {}), ...(BASELINE.has(short) ? { baseline: true } : {}),
}));
