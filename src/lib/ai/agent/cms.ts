import { getPrompt } from "@/lib/prompts/store";
import "server-only";
import { getViewer } from "@/lib/products/sitecraft-ai/viewer";
import { TOOL_SCHEMAS, runTool } from "@/lib/products/sitecraft-ai/ai-agent/tools";
import { getSiteInfoForEdit } from "@/lib/products/sitecraft-ai/site-info";
import { getCompanyBrand } from "@/lib/platform/branding";
import type { Json } from "@/lib/ai/agent/types";

/** The CMS assistant's website tools, exposed to the shared agent engine (reads run freely, changes need approval). */

const READS = new Set(["site_overview", "section_types", "describe_section_type", "get_page", "list_collections", "list_records", "get_record", "list_media", "get_contact_form"]);
const DESTRUCTIVE = new Set(["delete_page", "remove_section", "menu_remove", "footer_remove", "rewrite_whole_website", "discard_record_changes", "archive_record"]);

export const CMS_LABELS: Record<string, string> = {
  update_section: "Edit a section", add_section: "Add a section", remove_section: "Remove a section", move_section: "Move a section", set_section_enabled: "Show / hide a section",
  update_page_seo: "Update page SEO", create_page: "Create a page", delete_page: "Delete a page", publish_page: "Publish a page", menu_add: "Add a menu item", menu_update: "Update the menu",
  menu_remove: "Remove a menu item", footer_add_column: "Add a footer column", footer_add_link: "Add a footer link", footer_remove: "Remove from the footer", update_site_info: "Update site details",
  set_theme: "Change the look", save_record: "Save a blog post / job / product", publish_record: "Publish a record", archive_record: "Hide or restore a record", discard_record_changes: "Discard record changes", update_media: "Edit a photo's details", update_contact_form: "Change the contact form", generate_image: "Create a photo", rewrite_whole_website: "Rewrite the whole website",
};

export const cmsSchemas = () => TOOL_SCHEMAS;
export const isCmsTool = (name: string) => TOOL_SCHEMAS.some((t) => t.function.name === name);
export const isCmsRead = (name: string) => READS.has(name);
export const isCmsDestructive = (name: string) => DESTRUCTIVE.has(name);

export async function runCmsTool(name: string, args: Json): Promise<Json> {
  const viewer = await getViewer();
  if (!viewer) return { error: "Please sign in again." };
  return (await runTool(name, JSON.stringify(args), viewer)) as Json;
}

export async function cmsSystem(companyName: string): Promise<string> {
  const [brand, info] = await Promise.all([getCompanyBrand(), getSiteInfoForEdit()]);
  const about = [info.footer.about, info.footer.ctaText].filter(Boolean).join(" ");
  return getPrompt("agent.cms.system", { company: companyName || brand.name, about_line: about ? await getPrompt("agent.cms.about", { about }) : "" });
}
