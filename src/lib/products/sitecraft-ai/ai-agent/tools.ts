import { getPrompt } from "@/lib/prompts/store";
import { setAiFeature } from "@/lib/platform/billing/ai-usage-log";
import "server-only";
import type { CmsViewer } from "@/lib/products/sitecraft-ai/viewer";
import { can } from "@/lib/products/sitecraft-ai/viewer";
import type { CmsPermission } from "@/lib/cms-roles";
import { recordAudit, type AuditAction, type AuditEntity } from "@/lib/products/sitecraft-ai/audit";
import { expireSiteCache } from "@/lib/products/sitecraft-ai/db";
import { SECTION_REGISTRY, type FieldSpec, type PageSection } from "@/lib/products/sitecraft-ai/section-registry";
import { createPage, deletePage, getPageByPath, listPages, publishPage, saveDraft, saveDraftSeo } from "@/lib/products/sitecraft-ai/pages";
import { createNavItem, deleteNavItem, listNavItems, updateNavItem } from "@/lib/products/sitecraft-ai/nav";
import { createFooterColumn, createFooterLink, deleteFooterColumn, deleteFooterLink, listFooterColumns, listFooterLinks } from "@/lib/products/sitecraft-ai/footer";
import { getSiteInfoForEdit, saveSiteInfo } from "@/lib/products/sitecraft-ai/site-info";
import { createTheme, getActiveThemeKey, getTheme, publishThemeDraft, setActiveTheme } from "@/lib/products/sitecraft-ai/theme";
import { parsePageSeo } from "@/lib/products/sitecraft-ai/page-seo";
import { FONT_OPTIONS } from "@/lib/products/sitecraft-ai/theme-shared";
import { CARD_VARIANTS, DENSITY_VARIANTS, FOOTER_VARIANTS, HEADER_VARIANTS, IMAGE_VARIANTS, MENU_VARIANTS, WIDTH_VARIANTS } from "@/lib/products/sitecraft-ai/component-variants";
import { buildThemeTokens, isHex } from "@/lib/platform/website/ai/tokens";
import { generateAiWebsite } from "@/lib/platform/website/ai/apply";
import { createCmsMediaFromBuffer, getMedia, listMedia, updateMedia } from "@/lib/products/sitecraft-ai/media";
import { getFormDoc, saveFormFields, CONTACT_FORM_FIELD_NAMES } from "@/lib/products/sitecraft-ai/forms";
import { getOpenAI } from "@/lib/openai";
import { COLLECTIONS } from "@/lib/products/sitecraft-ai/collections/registry";
import type { CollectionKey } from "@/lib/products/sitecraft-ai/collections/types";
import { createRecord, getEditableRecord, listAdminRecords, publishRecord, revertRecord, saveRecordDraft, setRecordArchived } from "@/lib/products/sitecraft-ai/collections/store";

/**
 * What the CMS "Ask AI" assistant can do: read the site and change any part of it (pages and their sections, menus, footer, site
 * identity, theme, photos), exactly as a person in the CMS could. Every tool checks the signed-in person's own CMS permission first and
 * works only inside their company; changes are recorded in the audit trail like manual ones.
 */

type Json = Record<string, unknown>;
type Out = Json | { error: string };
const err = (error: string): Out => ({ error });

interface Tool {
  name: string;
  description: string;
  /** JSON-schema `properties`; every key listed in `required` must be given. */
  properties: Record<string, unknown>;
  required?: string[];
  permission?: CmsPermission;
  run: (args: Json, v: CmsViewer) => Promise<Out>;
}

const isCollection = (k: unknown): k is CollectionKey => typeof k === "string" && k in COLLECTIONS;
const s = (v: unknown, max = 2000) => (typeof v === "string" ? v.slice(0, max) : "");
const normPath = (p: unknown) => { const t = s(p, 200).trim(); return t.startsWith("/") ? t : `/${t}`; };

async function audit(v: CmsViewer, action: AuditAction, entity: AuditEntity, id: string, label: string, path?: string) {
  await recordAudit({ actorId: v.userId, actorEmail: v.email, action, entity, entityId: id, entityLabel: label, ...(path ? { path } : {}), summary: "Made by the Ask AI assistant" } as never);
}

function mergeDeep(base: unknown, patch: unknown): unknown {
  if (Array.isArray(patch)) return patch; // arrays are replaced whole
  if (patch && typeof patch === "object" && base && typeof base === "object" && !Array.isArray(base)) {
    const out: Json = { ...(base as Json) };
    for (const [k, val] of Object.entries(patch as Json)) out[k] = mergeDeep((base as Json)[k], val);
    return out;
  }
  return patch;
}

function fieldTree(fields: FieldSpec[], depth = 0): unknown[] {
  return fields.map((f) => ({ key: f.key, label: f.label, kind: f.kind, ...(f.options ? { options: f.options } : {}), ...(f.fields && depth < 3 ? { fields: fieldTree(f.fields, depth + 1) } : {}) }));
}

const viewSection = (sec: PageSection) => ({ id: sec.id, type: sec.type, enabled: sec.enabled, config: sec.config });

async function pageOrError(path: unknown) {
  const page = await getPageByPath(normPath(path));
  return page ?? null;
}

/** Saves sections after validating each against its type, so the assistant can never store content the page builder would reject. */
function checkSections(sections: PageSection[]): string | null {
  for (const sec of sections) {
    const def = SECTION_REGISTRY[sec.type];
    if (!def) return `Unknown section type "${sec.type}".`;
    if (def.parse(sec.config) === null) return `The content for section "${sec.id}" (${sec.type}) is not valid.`;
  }
  return null;
}

const TOOLS: Tool[] = [
  {
    name: "site_overview",
    description: "Everything at a glance: pages (path, title, published or draft), the menu, the footer columns, the active theme and the site identity. Call this first when you need to know what exists.",
    properties: {},
    permission: "VIEW",
    run: async () => {
      const [pages, nav, cols, links, info, themeKey] = await Promise.all([listPages(), listNavItems(), listFooterColumns(), listFooterLinks(), getSiteInfoForEdit(), getActiveThemeKey()]);
      return {
        pages: pages.map((p) => ({ path: p.path, title: p.title, status: p.status, unpublishedChanges: p.hasUnpublishedChanges, sections: p.draft.sections.length })),
        menu: nav.filter((n) => !n.parentId).map((n) => ({ id: n._id, label: n.label, href: n.href, children: nav.filter((c) => c.parentId === n._id).map((c) => ({ id: c._id, label: c.label, href: c.href })) })),
        footer: cols.map((c) => ({ id: c._id, title: c.title, links: links.filter((l) => l.columnId === c._id).map((l) => ({ id: l._id, label: l.label, href: l.href })) })),
        theme: { activeKey: themeKey },
        siteInfo: { brand: info.brand, contact: info.contact, header: info.header, footer: info.footer },
      };
    },
  },
  {
    name: "section_types",
    description: "The kinds of sections a page can contain (type key and name). Use describe_section_type to see the fields of one.",
    properties: {},
    permission: "VIEW",
    run: async () => ({ types: Object.values(SECTION_REGISTRY).map((d) => ({ type: d.type, label: d.label })) }),
  },
  {
    name: "describe_section_type",
    description: "The editable fields of a section type and its default content, so you know exactly which keys to set.",
    properties: { type: { type: "string" } },
    required: ["type"],
    permission: "VIEW",
    run: async (a) => {
      const def = SECTION_REGISTRY[s(a.type)];
      if (!def) return err("Unknown section type.");
      return { type: def.type, label: def.label, fields: fieldTree(def.fields), defaultConfig: def.defaultConfig };
    },
  },
  {
    name: "get_page",
    description: "A page's current draft: title, SEO and every section with its id, type, enabled flag and content.",
    properties: { path: { type: "string", description: "Page path such as / or /about" } },
    required: ["path"],
    permission: "VIEW",
    run: async (a) => {
      const page = await pageOrError(a.path);
      if (!page) return err("No page at that path.");
      return { path: page.path, title: page.title, status: page.status, unpublishedChanges: page.hasUnpublishedChanges, seo: page.draft.seo, sections: page.draft.sections.map(viewSection) };
    },
  },
  {
    name: "update_section",
    description: "Change the content of one section. `config` is a partial object of the fields to change (nested objects are merged; arrays such as lists of items are replaced whole, so send the full new array). The page's draft is saved; call publish_page to make it live.",
    properties: { path: { type: "string" }, sectionId: { type: "string" }, config: { type: "object", additionalProperties: true } },
    required: ["path", "sectionId", "config"],
    permission: "SECTIONS_EDIT",
    run: async (a, v) => {
      const page = await pageOrError(a.path);
      if (!page) return err("No page at that path.");
      const sec = page.draft.sections.find((x) => x.id === s(a.sectionId));
      if (!sec) return err("No such section on that page.");
      const merged = mergeDeep(sec.config, a.config) as Json;
      const next = page.draft.sections.map((x) => (x.id === sec.id ? { ...x, config: merged } : x));
      const bad = checkSections(next);
      if (bad) return err(bad);
      const done = await saveDraft(page._id, next, v.userId);
      if (!done.ok) return err(done.error);
      await audit(v, "update", "section", sec.id, `${sec.type} on ${page.path}`, page.path);
      return { ok: true, note: "Saved as a draft. Publish the page to make it live." };
    },
  },
  {
    name: "add_section",
    description: "Add a section to a page. `config` overrides the type's defaults. Put it after `afterSectionId`, or at the end when omitted.",
    properties: { path: { type: "string" }, type: { type: "string" }, config: { type: "object", additionalProperties: true }, afterSectionId: { type: "string" } },
    required: ["path", "type"],
    permission: "SECTIONS_EDIT",
    run: async (a, v) => {
      const page = await pageOrError(a.path);
      if (!page) return err("No page at that path.");
      const def = SECTION_REGISTRY[s(a.type)];
      if (!def) return err("Unknown section type.");
      const secs = [...page.draft.sections].sort((x, y) => x.orderKey - y.orderKey);
      const idx = a.afterSectionId ? secs.findIndex((x) => x.id === s(a.afterSectionId)) : secs.length - 1;
      const before = secs[idx]?.orderKey ?? 0;
      const after = secs[idx + 1]?.orderKey ?? before + 2048;
      const orderKey = Math.round((before + after) / 2);
      const section: PageSection = { id: `${def.type}-${Date.now().toString(36)}`, type: def.type, orderKey, enabled: true, config: mergeDeep(def.defaultConfig, a.config ?? {}) as Json };
      const next = [...secs, section];
      const bad = checkSections(next);
      if (bad) return err(bad);
      const done = await saveDraft(page._id, next, v.userId);
      if (!done.ok) return err(done.error);
      await audit(v, "create", "section", section.id, `${def.type} on ${page.path}`, page.path);
      return { ok: true, sectionId: section.id, note: "Saved as a draft. Publish the page to make it live." };
    },
  },
  {
    name: "remove_section",
    description: "Remove a section from a page.",
    properties: { path: { type: "string" }, sectionId: { type: "string" } },
    required: ["path", "sectionId"],
    permission: "SECTIONS_EDIT",
    run: async (a, v) => {
      const page = await pageOrError(a.path);
      if (!page) return err("No page at that path.");
      if (!page.draft.sections.some((x) => x.id === s(a.sectionId))) return err("No such section on that page.");
      const next = page.draft.sections.filter((x) => x.id !== s(a.sectionId));
      if (next.length === 0) return err("A page needs at least one section.");
      const done = await saveDraft(page._id, next, v.userId);
      if (!done.ok) return err(done.error);
      await audit(v, "delete", "section", s(a.sectionId), `section on ${page.path}`, page.path);
      return { ok: true };
    },
  },
  {
    name: "move_section",
    description: "Move a section so it comes right after another section (or to the top when afterSectionId is empty).",
    properties: { path: { type: "string" }, sectionId: { type: "string" }, afterSectionId: { type: "string" } },
    required: ["path", "sectionId"],
    permission: "SECTIONS_EDIT",
    run: async (a, v) => {
      const page = await pageOrError(a.path);
      if (!page) return err("No page at that path.");
      const moving = page.draft.sections.find((x) => x.id === s(a.sectionId));
      if (!moving) return err("No such section on that page.");
      const rest = [...page.draft.sections].filter((x) => x.id !== moving.id).sort((x, y) => x.orderKey - y.orderKey);
      const at = a.afterSectionId ? rest.findIndex((x) => x.id === s(a.afterSectionId)) : -1;
      if (a.afterSectionId && at < 0) return err("The section to move after was not found.");
      rest.splice(at + 1, 0, moving);
      const done = await saveDraft(page._id, rest.map((x, i) => ({ ...x, orderKey: (i + 1) * 1024 })), v.userId);
      if (!done.ok) return err(done.error);
      await audit(v, "reorder", "section", moving.id, `section on ${page.path}`, page.path);
      return { ok: true };
    },
  },
  {
    name: "set_section_enabled",
    description: "Show or hide a section without deleting it.",
    properties: { path: { type: "string" }, sectionId: { type: "string" }, enabled: { type: "boolean" } },
    required: ["path", "sectionId", "enabled"],
    permission: "SECTIONS_EDIT",
    run: async (a, v) => {
      const page = await pageOrError(a.path);
      if (!page) return err("No page at that path.");
      if (!page.draft.sections.some((x) => x.id === s(a.sectionId))) return err("No such section on that page.");
      const done = await saveDraft(page._id, page.draft.sections.map((x) => (x.id === s(a.sectionId) ? { ...x, enabled: a.enabled === true } : x)), v.userId);
      if (!done.ok) return err(done.error);
      await audit(v, "update", "section", s(a.sectionId), `section on ${page.path}`, page.path);
      return { ok: true };
    },
  },
  {
    name: "update_page_seo",
    description: "Set a page's search title and description.",
    properties: { path: { type: "string" }, title: { type: "string" }, description: { type: "string" } },
    required: ["path"],
    permission: "PAGES_EDIT",
    run: async (a, v) => {
      const page = await pageOrError(a.path);
      if (!page) return err("No page at that path.");
      const seo = parsePageSeo({ ...(page.draft.seo ?? {}), ...(a.title ? { title: s(a.title, 120) } : {}), ...(a.description ? { description: s(a.description, 320) } : {}) });
      const done = await saveDraftSeo(page._id, seo, page.draft.jsonLd ?? [], page.draft.frame ?? "default", v.userId);
      if (!done.ok) return err(done.error);
      await audit(v, "update", "page", page._id, page.path, page.path);
      return { ok: true };
    },
  },
  {
    name: "create_page",
    description: "Create a new page at a path with its sections (each {type, config}). It is saved as a draft; publish it to make it live. Add it to the menu with menu_add if it should be linked.",
    properties: { path: { type: "string" }, title: { type: "string" }, sections: { type: "array", items: { type: "object", properties: { type: { type: "string" }, config: { type: "object", additionalProperties: true } }, required: ["type"] } }, seoTitle: { type: "string" }, seoDescription: { type: "string" } },
    required: ["path", "title", "sections"],
    permission: "PAGES_CREATE",
    run: async (a, v) => {
      const raw = Array.isArray(a.sections) ? (a.sections as Json[]) : [];
      const sections: PageSection[] = [];
      for (const [i, r] of raw.entries()) {
        const def = SECTION_REGISTRY[s(r.type)];
        if (!def) return err(`Unknown section type "${s(r.type)}".`);
        sections.push({ id: `${def.type}-${(i + 1) * 1024}`, type: def.type, orderKey: (i + 1) * 1024, enabled: true, config: mergeDeep(def.defaultConfig, r.config ?? {}) as Json });
      }
      if (!sections.length) return err("Give the page at least one section.");
      const bad = checkSections(sections);
      if (bad) return err(bad);
      const created = await createPage({ path: normPath(a.path), title: s(a.title, 120), templateKey: "ai-agent", sections, seo: parsePageSeo({ title: s(a.seoTitle || a.title, 120), description: s(a.seoDescription, 320) }), frame: "accent" }, v.userId);
      if (!created.ok) return err(created.error);
      await audit(v, "create", "page", created.id, s(a.title, 120), normPath(a.path));
      return { ok: true, note: "Created as a draft. Publish it to make it live." };
    },
  },
  {
    name: "delete_page",
    description: "Permanently delete a page. Only call this after the person has clearly confirmed in the chat that they want this exact page deleted; then pass confirmed=true.",
    properties: { path: { type: "string" }, confirmed: { type: "boolean" } },
    required: ["path", "confirmed"],
    permission: "PAGES_DELETE",
    run: async (a, v) => {
      if (a.confirmed !== true) return err("Ask the person to confirm the deletion first.");
      const page = await pageOrError(a.path);
      if (!page) return err("No page at that path.");
      if (page.path === "/") return err("The home page can't be deleted.");
      const done = await deletePage(page._id, v.userId);
      if (!done.ok) return err(done.error);
      await audit(v, "delete", "page", page._id, page.title, page.path);
      expireSiteCache();
      return { ok: true };
    },
  },
  {
    name: "publish_page",
    description: "Make a page's draft live on the public website.",
    properties: { path: { type: "string" }, summary: { type: "string" } },
    required: ["path"],
    permission: "PAGES_PUBLISH",
    run: async (a, v) => {
      const page = await pageOrError(a.path);
      if (!page) return err("No page at that path.");
      const done = await publishPage(page._id, v.userId, s(a.summary, 200) || "Updated with Ask AI");
      if (!done.ok) return /no unpublished changes/i.test(done.error) ? { ok: true, note: "Already live." } : err(done.error);
      await audit(v, "publish", "page", page._id, page.title, page.path);
      expireSiteCache();
      return { ok: true };
    },
  },
  {
    name: "menu_add",
    description: "Add an item to the website menu (top level, or under a parent item by its id).",
    properties: { label: { type: "string" }, href: { type: "string" }, parentId: { type: "string" }, description: { type: "string" } },
    required: ["label", "href"],
    permission: "NAV_MANAGE",
    run: async (a, v) => {
      const created = await createNavItem({ parentId: a.parentId ? s(a.parentId) : null, label: s(a.label, 60), href: s(a.href, 300), description: s(a.description, 160) }, v.userId);
      await audit(v, "create", "nav", created._id, created.label);
      return { ok: true, id: created._id };
    },
  },
  {
    name: "menu_update",
    description: "Rename or relink a menu item by id.",
    properties: { id: { type: "string" }, label: { type: "string" }, href: { type: "string" }, description: { type: "string" } },
    required: ["id"],
    permission: "NAV_MANAGE",
    run: async (a, v) => {
      await updateNavItem(s(a.id), { ...(a.label ? { label: s(a.label, 60) } : {}), ...(a.href ? { href: s(a.href, 300) } : {}), ...(a.description ? { description: s(a.description, 160) } : {}) }, v.userId);
      await audit(v, "update", "nav", s(a.id), s(a.label) || "menu item");
      return { ok: true };
    },
  },
  {
    name: "menu_remove",
    description: "Remove a menu item (and its sub-items) by id.",
    properties: { id: { type: "string" } },
    required: ["id"],
    permission: "NAV_MANAGE",
    run: async (a, v) => {
      const all = await listNavItems();
      for (const child of all.filter((n) => n.parentId === s(a.id))) await deleteNavItem(child._id);
      await deleteNavItem(s(a.id));
      await audit(v, "delete", "nav", s(a.id), "menu item");
      return { ok: true };
    },
  },
  {
    name: "footer_add_column",
    description: "Add a footer column with its links ([{label, href}]).",
    properties: { title: { type: "string" }, links: { type: "array", items: { type: "object", properties: { label: { type: "string" }, href: { type: "string" } }, required: ["label", "href"] } } },
    required: ["title"],
    permission: "FOOTER_MANAGE",
    run: async (a, v) => {
      const col = await createFooterColumn({ title: s(a.title, 60) }, v.userId);
      for (const l of (Array.isArray(a.links) ? a.links : []) as Json[]) await createFooterLink({ columnId: col._id, label: s(l.label, 60), href: s(l.href, 300) }, v.userId);
      await audit(v, "create", "footer", col._id, col.title);
      return { ok: true, id: col._id };
    },
  },
  {
    name: "footer_add_link",
    description: "Add a link to an existing footer column (by column id).",
    properties: { columnId: { type: "string" }, label: { type: "string" }, href: { type: "string" } },
    required: ["columnId", "label", "href"],
    permission: "FOOTER_MANAGE",
    run: async (a, v) => {
      const link = await createFooterLink({ columnId: s(a.columnId), label: s(a.label, 60), href: s(a.href, 300) }, v.userId);
      await audit(v, "create", "footer", link._id, link.label);
      return { ok: true, id: link._id };
    },
  },
  {
    name: "footer_remove",
    description: "Remove a footer link (linkId) or a whole footer column (columnId).",
    properties: { linkId: { type: "string" }, columnId: { type: "string" } },
    permission: "FOOTER_MANAGE",
    run: async (a, v) => {
      if (a.linkId) await deleteFooterLink(s(a.linkId));
      else if (a.columnId) await deleteFooterColumn(s(a.columnId));
      else return err("Give a linkId or a columnId.");
      await audit(v, "delete", "footer", s(a.linkId || a.columnId), "footer item");
      return { ok: true };
    },
  },
  {
    name: "update_site_info",
    description: "Change the site identity: brand name parts, tagline-like footer text, call-to-action text and labels, contact details (email, phone, address, WhatsApp, map link) and social links. `patch` is a partial object merged into the current site info (see site_overview for its shape).",
    properties: { patch: { type: "object", additionalProperties: true } },
    required: ["patch"],
    permission: "SETTINGS_MANAGE",
    run: async (a, v) => {
      const current = await getSiteInfoForEdit();
      const saved = await saveSiteInfo(mergeDeep(current, a.patch), v.userId);
      await audit(v, "settings", "settings", "site-info", "Site identity");
      return { ok: true, brand: saved.brand, contact: saved.contact };
    },
  },
  {
    name: "set_theme",
    description: `Change the look of the website. Any of: primary/secondary/accent (hex colours like #1f6f5c), tone (white|warm|cool|tinted), radius (0.25rem|0.5rem|0.75rem|1rem|1.5rem), headingFont/bodyFont (${FONT_OPTIONS.map((f) => f.key).join("|")}), header (${HEADER_VARIANTS.map((x) => x.key).join("|")}), footer (${FOOTER_VARIANTS.map((x) => x.key).join("|")}), menu (${MENU_VARIANTS.map((x) => x.key).join("|")}), cards (${CARD_VARIANTS.map((x) => x.key).join("|")}), width (${WIDTH_VARIANTS.map((x) => x.key).join("|")}), density (${DENSITY_VARIANTS.map((x) => x.key).join("|")}), images (${IMAGE_VARIANTS.map((x) => x.key).join("|")}). Colours and fonts rebuild a full light and dark theme with safe contrast. Content is never changed.`,
    properties: Object.fromEntries(["primary", "secondary", "accent", "tone", "radius", "headingFont", "bodyFont", "header", "footer", "menu", "cards", "width", "density", "images"].map((k) => [k, { type: "string" }])),
    permission: "THEME_PUBLISH",
    run: async (a, v) => {
      const key = "ai-site";
      const active = await getActiveThemeKey();
      let current: Awaited<ReturnType<typeof getTheme>> | null = null;
      try { current = await getTheme(active); } catch { current = null; }
      const cur = current?.tokens.colors;
      const pick = (k: string, fallback: string) => (isHex(a[k]) ? (a[k] as string) : fallback);
      const known = (list: { key: string }[], k: string, fallback: string) => (list.some((x) => x.key === a[k]) ? (a[k] as string) : fallback);
      const palette = {
        primary: pick("primary", cur?.primary ?? "#2f5d8a"), secondary: pick("secondary", cur?.secondaryForeground ?? "#3b4a63"), accent: pick("accent", cur?.accentForeground ?? "#c07a2c"),
        tone: ["white", "warm", "cool", "tinted"].includes(s(a.tone)) ? s(a.tone) : "white",
        radius: ["0.25rem", "0.5rem", "0.75rem", "1rem", "1.5rem"].includes(s(a.radius)) ? s(a.radius) : current?.tokens.radius ?? "0.75rem",
        headingFont: known(FONT_OPTIONS, "headingFont", current?.tokens.typography?.headingFont ?? "geist"), bodyFont: known(FONT_OPTIONS, "bodyFont", current?.tokens.typography?.bodyFont ?? "geist"),
      };
      const prev = current?.components ?? {};
      const components = {
        ...prev,
        header: known(HEADER_VARIANTS, "header", prev.header ?? "default"), footer: known(FOOTER_VARIANTS, "footer", prev.footer ?? "default"), menu: known(MENU_VARIANTS, "menu", prev.menu ?? "default"),
        cards: known(CARD_VARIANTS, "cards", prev.cards ?? "classic"), width: known(WIDTH_VARIANTS, "width", prev.width ?? "standard"), density: known(DENSITY_VARIANTS, "density", prev.density ?? "comfortable"), images: known(IMAGE_VARIANTS, "images", prev.images ?? "natural"),
      };
      const made = await createTheme({ key, name: "Site theme", description: "Made with Ask AI" }, v.userId);
      if (!made.ok && !/already exists/i.test(made.error)) return err(made.error);
      const colorsChanged = ["primary", "secondary", "accent", "tone", "radius", "headingFont", "bodyFont"].some((k) => a[k] !== undefined);
      const tokens = colorsChanged || active !== key ? buildThemeTokens(palette) : (await getTheme(key)).tokens;
      const done = await publishThemeDraft(key, tokens, components, v.userId);
      if (!done.ok) return err(done.error);
      await setActiveTheme(key, v.userId);
      expireSiteCache();
      await audit(v, "update", "theme", key, "Site theme");
      return { ok: true };
    },
  },
  {
    name: "generate_image",
    description: "Create a new photo from a description and add it to the media library. Returns a URL you can put in a section's image field. Describe a realistic photograph of the business setting; no text or logos.",
    properties: { prompt: { type: "string" }, name: { type: "string" } },
    required: ["prompt"],
    permission: "MEDIA_UPLOAD",
    run: async (a, v) => {
      setAiFeature("Website assistant");
      const client = await getOpenAI();
      const r = await client.images.generate({ model: process.env.WEBSITE_AI_IMAGE_MODEL || "gpt-image-1", prompt: await getPrompt("website.image", { text: s(a.prompt, 900) }), size: "1536x1024", quality: "medium", n: 1 });
      const b64 = r.data?.[0]?.b64_json;
      if (!b64) return err("The image could not be created.");
      const url = await createCmsMediaFromBuffer(Buffer.from(b64, "base64"), s(a.name, 80) || "AI image", s(a.prompt, 120), v.userId);
      await audit(v, "upload", "media", url, s(a.name, 80) || "AI image");
      return { ok: true, url };
    },
  },
  {
    name: "rewrite_whole_website",
    description: "Rewrite the whole website (all generated pages, menu, footer, theme and photos) from the business categories. Slow (about a minute) and replaces what the platform generated earlier; pages the person wrote or edited are kept. Only when the person asks for a complete redo.",
    properties: {},
    permission: "THEME_PUBLISH",
    run: async (_a, v) => {
      const res = await generateAiWebsite({ force: true });
      if (!res.ok) return err(res.error);
      expireSiteCache();
      await audit(v, "update", "settings", "ai-website", "AI-generated website");
      return { ok: true, pages: res.pages };
    },
  },
  {
    name: "list_collections",
    description: "The site's content collections (blog posts, jobs, engagement models, products): key, name, and the editable fields of one record, plus how many records exist.",
    properties: {},
    permission: "VIEW",
    run: async () => ({ collections: await Promise.all((Object.keys(COLLECTIONS) as CollectionKey[]).map(async (key) => ({ key, label: COLLECTIONS[key].label, singular: COLLECTIONS[key].singular, records: (await listAdminRecords(key)).length, fields: fieldTree(COLLECTIONS[key].fields) }))) }),
  },
  {
    name: "list_records",
    description: "The records of one collection with slug, title, state (published / draft / archived) and whether there are unpublished changes.",
    properties: { collection: { type: "string", description: "blog, jobs, engagement or products" } },
    required: ["collection"],
    permission: "VIEW",
    run: async (a) => (isCollection(a.collection) ? { records: await listAdminRecords(a.collection) } : err("Unknown collection.")),
  },
  {
    name: "get_record",
    description: "One record's current draft content.",
    properties: { collection: { type: "string" }, slug: { type: "string" } },
    required: ["collection", "slug"],
    permission: "VIEW",
    run: async (a) => {
      if (!isCollection(a.collection)) return err("Unknown collection.");
      const rec = await getEditableRecord(a.collection, s(a.slug, 120));
      return rec ? { slug: rec.doc.slug, state: rec.doc.archived ? "archived" : rec.doc.live ? "published" : "draft", unpublishedChanges: rec.doc.hasUnpublishedChanges, data: rec.data } : err("No such record.");
    },
  },
  {
    name: "save_record",
    description: "Create a record (if the slug is new) or change an existing one. `data` holds the fields to set (see list_collections for the field keys; nested objects merge, arrays are replaced whole). It saves a draft; call publish_record to make it live.",
    properties: { collection: { type: "string" }, slug: { type: "string", description: "URL slug, lowercase letters, digits and dashes" }, data: { type: "object", additionalProperties: true } },
    required: ["collection", "slug", "data"],
    permission: "COLLECTIONS_EDIT",
    run: async (a, v) => {
      if (!isCollection(a.collection)) return err("Unknown collection.");
      const key = a.collection;
      const slug = s(a.slug, 120).trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
      if (!slug) return err("Give the record a slug.");
      let rec = await getEditableRecord(key, slug);
      let created = false;
      if (!rec) {
        const made = await createRecord(key, slug, v.userId);
        if (!made.ok) return err(made.error);
        created = true;
        rec = await getEditableRecord(key, slug);
        if (!rec) return err("Could not create the record.");
      }
      const merged = mergeDeep(rec.data, (a.data as Json) ?? {}) as Json;
      const res = await saveRecordDraft(key, slug, merged, v.userId);
      if (!res.ok) return err(res.error);
      await audit(v, created ? "create" : "update", "collection", `${key}/${slug}`, `${COLLECTIONS[key].singular}: ${slug}`);
      return { ok: true, slug, created, note: "Saved as a draft. Publish it to make it live." };
    },
  },
  {
    name: "publish_record",
    description: "Publish a record's draft so it is live on the site.",
    properties: { collection: { type: "string" }, slug: { type: "string" } },
    required: ["collection", "slug"],
    permission: "COLLECTIONS_PUBLISH",
    run: async (a, v) => {
      if (!isCollection(a.collection)) return err("Unknown collection.");
      const res = await publishRecord(a.collection, s(a.slug, 120), v.userId);
      if (!res.ok) return err(res.error);
      await audit(v, "publish", "collection", `${a.collection}/${s(a.slug, 120)}`, `${COLLECTIONS[a.collection].singular}: ${s(a.slug, 120)}`);
      return { ok: true, published: s(a.slug, 120) };
    },
  },
  {
    name: "archive_record",
    description: "Hide a published record from the site (archive), or bring it back (archived: false).",
    properties: { collection: { type: "string" }, slug: { type: "string" }, archived: { type: "boolean" } },
    required: ["collection", "slug", "archived"],
    permission: "COLLECTIONS_PUBLISH",
    run: async (a, v) => {
      if (!isCollection(a.collection)) return err("Unknown collection.");
      const res = await setRecordArchived(a.collection, s(a.slug, 120), a.archived === true, v.userId);
      if (!res.ok) return err(res.error);
      await audit(v, "update", "collection", `${a.collection}/${s(a.slug, 120)}`, `${COLLECTIONS[a.collection].singular}: ${s(a.slug, 120)}`);
      return { ok: true, archived: a.archived === true };
    },
  },
  {
    name: "discard_record_changes",
    description: "Throw away a record's unpublished changes (a record that was never published is deleted).",
    properties: { collection: { type: "string" }, slug: { type: "string" } },
    required: ["collection", "slug"],
    permission: "COLLECTIONS_PUBLISH",
    run: async (a, v) => {
      if (!isCollection(a.collection)) return err("Unknown collection.");
      const res = await revertRecord(a.collection, s(a.slug, 120));
      if (!res.ok) return err(res.error);
      await audit(v, res.deleted ? "delete" : "restore", "collection", `${a.collection}/${s(a.slug, 120)}`, `${COLLECTIONS[a.collection].singular}: ${s(a.slug, 120)}`);
      return { ok: true, deleted: res.deleted };
    },
  },
  {
    name: "list_media",
    description: "The photos and files in the media library (id, name, url, alt text). Use a photo's url inside section content.",
    properties: { q: { type: "string", description: "Optional search text" } },
    permission: "VIEW",
    run: async (a) => ({ media: (await listMedia(s(a.q, 100) || undefined)).slice(0, 60) }),
  },
  {
    name: "update_media",
    description: "Rename a library photo or set its alt text (for accessibility and SEO).",
    properties: { id: { type: "string" }, name: { type: "string" }, altText: { type: "string" } },
    required: ["id"],
    permission: "MEDIA_UPLOAD",
    run: async (a, v) => {
      const m = await getMedia(s(a.id, 80));
      if (!m) return err("No such media item.");
      await updateMedia(m._id, { ...(typeof a.name === "string" ? { name: s(a.name, 200) } : {}), ...(typeof a.altText === "string" ? { altText: s(a.altText, 400) } : {}) }, v.userId);
      await audit(v, "update", "media", m._id, m.name);
      return { ok: true };
    },
  },
  {
    name: "get_contact_form",
    description: "The contact form's fields (name, label, placeholder, help text, required, visible, order).",
    properties: {},
    permission: "VIEW",
    run: async () => ({ fields: await getFormDoc("contact", CONTACT_FORM_FIELD_NAMES) }),
  },
  {
    name: "update_contact_form",
    description: "Change contact-form fields. Send only the fields to change, each identified by its `name` (system key from get_contact_form); label, placeholder, helpText, required, visible and orderKey can be set.",
    properties: { fields: { type: "array", items: { type: "object", additionalProperties: true } } },
    required: ["fields"],
    permission: "FORMS_MANAGE",
    run: async (a, v) => {
      const cur = await getFormDoc("contact", CONTACT_FORM_FIELD_NAMES);
      const patches = Array.isArray(a.fields) ? (a.fields as Json[]) : [];
      const next = cur.map((f) => {
        const p = patches.find((x) => x.name === f.name);
        if (!p) return f;
        return { ...f, ...(typeof p.label === "string" ? { label: s(p.label, 120) } : {}), ...(typeof p.placeholder === "string" ? { placeholder: s(p.placeholder, 200) } : {}), ...(typeof p.helpText === "string" ? { helpText: s(p.helpText, 300) } : {}), ...(typeof p.required === "boolean" ? { required: p.required } : {}), ...(typeof p.visible === "boolean" ? { visible: p.visible } : {}), ...(typeof p.orderKey === "number" ? { orderKey: p.orderKey } : {}) };
      });
      await saveFormFields("contact", next, v.userId);
      await audit(v, "update", "form", "contact", "Contact form");
      return { ok: true, fields: next };
    },
  },
];

export const TOOL_SCHEMAS = TOOLS.map((t) => ({
  type: "function" as const,
  function: { name: t.name, description: t.description, parameters: { type: "object", properties: t.properties, required: t.required ?? [], additionalProperties: false } },
}));

/** Runs one tool call for the signed-in person. Never throws: problems come back as `{ error }` for the model to explain. */
export async function runTool(name: string, rawArgs: string, v: CmsViewer): Promise<Out> {
  const tool = TOOLS.find((t) => t.name === name);
  if (!tool) return err(`Unknown tool ${name}.`);
  if (tool.permission && !can(v, tool.permission)) return err("The signed-in person does not have permission to do that in the CMS.");
  let args: Json = {};
  try { args = rawArgs ? (JSON.parse(rawArgs) as Json) : {}; } catch { return err("The tool arguments were not valid JSON."); }
  try {
    return await tool.run(args, v);
  } catch (e) {
    return err(e instanceof Error ? e.message : "That action failed.");
  }
}

/** Tools that change the site (the UI lists these as "changes made"). */
export const MUTATING_TOOLS = new Set(TOOLS.filter((t) => !["site_overview", "section_types", "describe_section_type", "get_page", "list_collections", "list_records", "get_record", "list_media", "get_contact_form"].includes(t.name)).map((t) => t.name));
