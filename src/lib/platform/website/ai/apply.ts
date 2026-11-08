import { aiBlockReason, isBillingLimitError, writeBlockReason } from "@/lib/platform/billing/enforce";
import { cmsEvents } from "@/lib/notify/triggers/cms";
import "server-only";
import { setAiFeature } from "@/lib/platform/billing/ai-usage-log";
import { createHash, randomUUID } from "node:crypto";
import { getDb } from "@/lib/mongodb";
import { createPage, getPageByPath, publishPage, saveDraft, saveDraftSeo } from "@/lib/products/sitecraft-ai/pages";
import { createNavItem, deleteNavItem, listNavItems } from "@/lib/products/sitecraft-ai/nav";
import { createFooterColumn, createFooterLink, deleteFooterColumn, listFooterColumns } from "@/lib/products/sitecraft-ai/footer";
import { getSiteInfoForEdit, saveSiteInfo } from "@/lib/products/sitecraft-ai/site-info";
import { createTheme, getActiveThemeKey, getTheme, publishThemeDraft, setActiveTheme } from "@/lib/products/sitecraft-ai/theme";
import { createCmsMediaFromBuffer } from "@/lib/products/sitecraft-ai/media";
import { parsePageSeo } from "@/lib/products/sitecraft-ai/page-seo";
import { THEME_PRESETS } from "@/lib/products/sitecraft-ai/theme-presets";
import { currentCompanyId, isPlatformOwnerContext } from "@/lib/platform/tenancy/context";
import { getPlatformDb } from "@/lib/platform/tenancy/platform-db";
import { COMPANIES_COLLECTION, type Company } from "@/lib/platform/tenancy/companies";
import { getCompanyBrand } from "@/lib/platform/branding";
import type { BusinessSelection } from "@/lib/platform/business-taxonomy";
import { starterFooter, starterNavigation, starterPages } from "@/lib/platform/website/starter-template";
import { starterSiteInfo } from "@/lib/platform/website/starter";
import { planWebsite, type WebsitePlan } from "@/lib/platform/website/ai/plan";
import { audit, scrub } from "@/lib/platform/website/ai/validate";
import { bannedFromPlaybooks, describePlaybooks, playbooksFor } from "@/lib/platform/website/ai/playbooks";
import { imagePrompts, makeImages, toPack, writeWebsite, WEBSITE_MODEL, type WebsiteBrief } from "@/lib/platform/website/ai/generate";
import { buildStyleCss, STYLE_MARKER } from "@/lib/platform/website/ai/style-recipes";
import { buildThemeTokens } from "@/lib/platform/website/ai/tokens";

/**
 * Builds a company's whole public website from its business categories and sub-categories, and publishes it into its CMS: pages,
 * menus, footer, site identity, a theme made for it, and photos. It only ever replaces what the platform itself created (the starter
 * site or an earlier generation); anything the company wrote or changed is left alone. Never runs for the platform operator.
 */

const ACTOR = "system:ai-website";
const SYSTEM_ACTORS = new Set(["system:starter-website", ACTOR]);
const STATE_ID = "ai-website";
const THEME_KEY = "ai-site";
const STALE_MS = 20 * 60_000;

export interface AiWebsiteState {
  status: "running" | "done" | "failed";
  startedAt: Date;
  finishedAt?: Date;
  model?: string;
  error?: string;
  summary?: { checks?: { issuesFound: number; repaired: boolean; scrubbed: number }; mood: string; services: string[]; pages: number; images: number; theme: { primary: string; headingFont: string; bodyFont: string; header: string; footer: string } };
  /** The plan the website was written from, including the full building prompt. */
  plan?: { sitePrompt: string; language: string; audience: string; lookAndFeel: string; pages: string[]; assumptions: string[] };
  /** The photos made for the site, reused when the content is written again. */
  images?: { hero: string; about: string; services: string };
  /** The whole plan, so the building prompt can be edited and the site rebuilt from it without planning again. */
  planFull?: WebsitePlan;
  /** Fingerprint of the site identity text we wrote, to tell later whether the company has edited it. */
  identityHash?: string;
  /** The version whose content is live now. */
  currentVersionId?: string;
}

async function stateCol() {
  return (await getDb()).collection<AiWebsiteState & { _id: string }>("website_generation");
}

export async function getAiWebsiteState(): Promise<AiWebsiteState | null> {
  return (await (await stateCol()).findOne({ _id: STATE_ID })) as AiWebsiteState | null;
}

const hashOf = (v: unknown) => createHash("sha1").update(JSON.stringify(v)).digest("hex");

async function loadBrief(): Promise<WebsiteBrief> {
  const id = await currentCompanyId();
  const company = (await (await getPlatformDb()).collection<Company & { business?: BusinessSelection; profile?: { country?: string; timezone?: string } }>(COMPANIES_COLLECTION).findOne({ _id: id })) as (Company & { business?: BusinessSelection; profile?: { country?: string; timezone?: string } }) | null;
  if (!company) throw new Error("Company not found.");
  const brand = await getCompanyBrand();
  const info = await getSiteInfoForEdit();
  const cats = company.business?.categories ?? [];
  const catName = new Map(cats.map((c) => [c.code, c.name]));
  return {
    name: brand.name || company.name,
    slug: company.slug,
    country: company.profile?.country ?? "",
    categories: cats.map((c) => c.name),
    subCategories: (company.business?.subCategories ?? []).map((s) => ({ name: s.name, category: (s.categoryCode && catName.get(s.categoryCode)) || cats[0]?.name || "" })),
    email: info.contact.email,
    phone: info.contact.phoneDisplay,
    hints: { ...company.signupHints, ...(company.timezone && !company.signupHints?.timezone ? { timezone: company.timezone } : {}) },
  };
}

type Content = { pages: ReturnType<typeof starterPages>; nav: ReturnType<typeof starterNavigation>; footer: ReturnType<typeof starterFooter>; siteInfo: Awaited<ReturnType<typeof starterSiteInfo>> };

/** Publishes `content` into the CMS: pages, menus, footer and site identity. Only replaces what the platform made; the company's own pages and edits stay. */
async function applyContent(content: Content, prevIdentityHash?: string): Promise<{ pages: number; identityHash: string | undefined }> {
  const prev = { identityHash: prevIdentityHash };
    // ── Pages: create, or replace the ones the platform made; never touch a page the company made ──
  let pages = 0;
  for (const page of content.pages) {
    const existing = await getPageByPath(page.path);
    if (existing && existing.templateKey !== "starter" && existing.templateKey !== "ai-site") continue;
    let id: string;
    if (existing) {
      id = existing._id;
      const a = await saveDraft(id, page.sections, ACTOR);
      if (!a.ok) throw new Error(`${page.path}: ${a.error}`);
      await saveDraftSeo(id, parsePageSeo(page.seo), [], "accent", ACTOR);
    } else {
      const created = await createPage({ path: page.path, title: page.title, templateKey: "ai-site", sections: page.sections, seo: parsePageSeo(page.seo), frame: "accent" }, ACTOR);
      if (!created.ok) throw new Error(`${page.path}: ${created.error}`);
      id = created.id;
    }
    const done = await publishPage(id, ACTOR, "AI-generated website");
    if (done.ok || /no unpublished changes/i.test(done.error)) pages += 1;
    else throw new Error(`${page.path}: ${done.error}`);
  }

  // ── Menus and footer: replaced only when everything in them was made by the platform ──
  const nav = await listNavItems();
  if (nav.every((n) => SYSTEM_ACTORS.has(n.createdBy ?? ""))) {
    for (const n of nav.filter((x) => x.parentId)) await deleteNavItem(n._id);
    for (const n of nav.filter((x) => !x.parentId)) await deleteNavItem(n._id);
    for (const top of content.nav) {
      const parent = await createNavItem({ parentId: null, label: top.name, href: top.href, iconKey: top.iconKey, featuredTitle: top.featured.title, featuredDescription: top.featured.description, featuredImage: top.featured.image }, ACTOR);
      for (const item of top.items) await createNavItem({ parentId: parent._id, label: item.name, href: item.href, description: item.description, iconKey: item.iconKey }, ACTOR);
    }
  }
  const cols = await listFooterColumns();
  if (cols.every((c) => SYSTEM_ACTORS.has(c.createdBy ?? ""))) {
    for (const c of cols) await deleteFooterColumn(c._id);
    for (const col2 of content.footer) {
      const column = await createFooterColumn({ title: col2.title, viewAllHref: col2.viewAllHref, viewAllLabel: col2.viewAllLabel }, ACTOR);
      for (const link of col2.links) await createFooterLink({ columnId: column._id, label: link.label, href: link.href }, ACTOR);
    }
  }

  // ── Site identity text: rewritten only while it is still what the platform wrote ──
  const info = await getSiteInfoForEdit();
  let identityHash: string | undefined;
  const identity = (i: typeof info) => ({ footer: i.footer, shareImage: i.shareImage });
  if (!prev?.identityHash || hashOf(identity(info)) === prev.identityHash) {
    const fresh = content.siteInfo;
    const next = { ...fresh, brand: info.brand.logoUrl || info.brand.logoDarkUrl ? { ...fresh.brand, logoUrl: info.brand.logoUrl, logoDarkUrl: info.brand.logoDarkUrl } : fresh.brand, contact: info.contact, social: info.social };
    const saved = await saveSiteInfo(next, ACTOR);
    identityHash = hashOf(identity(saved));
  } else {
    identityHash = prev.identityHash;
  }

  return { pages, identityHash };
}

// ── Version history: every generation (and every restore) is stored and never removed ──
export interface AiWebsiteVersion {
  _id: string;
  number: number;
  createdAt: Date;
  source: "generated" | "restored";
  restoredFrom?: number;
  model?: string;
  /** The owner's prompt for this run, when they wrote one. */
  prompt?: string;
  plan: WebsitePlan;
  images?: { hero: string; about: string; services: string };
  summary?: AiWebsiteState["summary"];
  content: Content;
}

const MAX_REGENERATIONS_PER_DAY = 5;
/** Room the AI allowance must have to start writing a website (a full generation uses roughly 100–200K tokens; a rewrite about 80K). */
const WEBSITE_MIN_TOKENS = Math.max(1, Number(process.env.WEBSITE_AI_MIN_TOKENS) || 80_000);

async function versionsCol() {
  return (await getDb()).collection<AiWebsiteVersion>("website_versions");
}

async function saveVersion(v: Omit<AiWebsiteVersion, "_id" | "number" | "createdAt"> & { restoredFrom?: number }): Promise<string> {
  const c = await versionsCol();
  const last = await c.find({}, { projection: { number: 1 } }).sort({ number: -1 }).limit(1).toArray();
  const doc: AiWebsiteVersion = { ...v, _id: randomUUID(), number: (last[0]?.number ?? 0) + 1, createdAt: new Date() };
  await c.insertOne(doc);
  return doc._id;
}

export interface AiWebsiteVersionInfo { id: string; number: number; createdAt: Date; source: "generated" | "restored"; restoredFrom?: number; model?: string; prompt?: string; mood?: string; pages: number; services: string[]; current: boolean }

export async function listAiWebsiteVersions(): Promise<AiWebsiteVersionInfo[]> {
  const [docs, state] = await Promise.all([
    (await versionsCol()).find({}, { projection: { content: 0, plan: 0 } }).sort({ number: -1 }).toArray(),
    getAiWebsiteState(),
  ]);
  return docs.map((d) => ({ id: d._id, number: d.number, createdAt: d.createdAt, source: d.source, restoredFrom: d.restoredFrom, model: d.model, prompt: d.prompt, mood: d.summary?.mood, pages: d.summary?.pages ?? 0, services: d.summary?.services ?? [], current: d._id === state?.currentVersionId }));
}

/** Brings an earlier version's content back. Nothing is deleted: the restore is recorded as a new version too. */
export async function restoreAiWebsiteVersion(id: string): Promise<{ ok: true; number: number } | { ok: false; error: string }> {
  if (await isPlatformOwnerContext()) return { ok: false, error: "Not available." };
  const col = await stateCol();
  const state = await col.findOne({ _id: STATE_ID });
  if (state?.status === "running" && Date.now() - new Date(state.startedAt).getTime() < STALE_MS) return { ok: false, error: "A website is being generated right now. Try again when it finishes." };
  const src = await (await versionsCol()).findOne({ _id: id });
  if (!src) return { ok: false, error: "That version was not found." };
  try {
    const { pages, identityHash } = await applyContent(src.content, state?.identityHash);
    const summary = src.summary ? { ...src.summary, pages } : undefined;
    const versionId = await saveVersion({ source: "restored", restoredFrom: src.number, model: src.model, prompt: src.prompt, plan: src.plan, images: src.images, summary, content: src.content });
    const p = src.plan;
    await col.updateOne({ _id: STATE_ID }, { $set: { status: "done", finishedAt: new Date(), identityHash, currentVersionId: versionId, planFull: p, plan: { sitePrompt: p.sitePrompt, language: p.language, audience: p.audience, lookAndFeel: p.lookAndFeel, pages: p.pages.map((x) => x.title), assumptions: p.assumptions }, ...(src.images ? { images: src.images } : {}), ...(summary ? { summary } : {}) }, $unset: { error: "" } }, { upsert: true });
    return { ok: true, number: src.number };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "The version could not be restored." };
  }
}

/**
 * Generates and publishes the site. `force` regenerates even when a generation already exists (the CMS button); without it a company
 * is generated once. Returns a plain result (never throws): the existing site stays as it was when anything fails.
 */
export async function generateAiWebsite(opts: { force?: boolean; ownerPrompt?: string } = {}): Promise<{ ok: true; pages: number } | { ok: false; error: string }> {
  setAiFeature("Website generation");
  if (await isPlatformOwnerContext()) return { ok: false, error: "The platform's own website is not generated." };
  const col = await stateCol();
  const prev = await col.findOne({ _id: STATE_ID });
  if (prev?.status === "running" && Date.now() - new Date(prev.startedAt).getTime() < STALE_MS) return { ok: false, error: "A website is already being generated. Give it a few minutes." };
  if (prev?.status === "done" && !opts.force) return { ok: false, error: "This company's website was already generated." };
  // The generation is paid for by the platform, so it is capped per company: a few rewrites a day, none while the subscription is suspended.
  const readOnly = await writeBlockReason();
  if (readOnly) return { ok: false, error: readOnly };
  const today = await (await versionsCol()).countDocuments({ source: "generated", createdAt: { $gt: new Date(Date.now() - 24 * 3600 * 1000) } });
  if (today >= MAX_REGENERATIONS_PER_DAY) return { ok: false, error: `You can generate the website up to ${MAX_REGENERATIONS_PER_DAY} times a day. Try again tomorrow, or edit the pages in the builder.` };

  // The website draws on the company's AI-token allowance like every other AI feature: refuse up front when it can't be finished.
  const aiBlock = await aiBlockReason(WEBSITE_MIN_TOKENS);
  if (aiBlock) return { ok: false, error: aiBlock };

  const startedAt = new Date();
  await col.updateOne({ _id: STATE_ID }, { $set: { status: "running", startedAt, model: WEBSITE_MODEL() }, $unset: { error: "", finishedAt: "" } }, { upsert: true });
  try {
    const brief = await loadBrief();
    if (brief.categories.length === 0 && brief.subCategories.length === 0) throw new Error("This company has not chosen its business categories yet.");

    // The website text and the three photos are made at the same time.
    // Step 1: plan this business's website (audience, language, pages, look and feel) and write the building prompt. Step 2: write it.
    const owner = opts.ownerPrompt?.trim() ?? "";
    const playbooks = await playbooksFor(brief);
    const knowledge = describePlaybooks(playbooks);
    // The prompt is the owner's to edit: unchanged -> the same plan is written again with fresh content; changed -> the plan is made again
    // from their instructions (pages, names, language, tone), so they have full freedom over the direction.
    const prevPlan = prev?.planFull;
    const promptEdited = !!owner && (!prevPlan || owner !== prevPlan.sitePrompt.trim());
    const plan: WebsitePlan = !promptEdited && prevPlan ? prevPlan : await planWebsite(brief, knowledge, promptEdited ? owner : "");
    await col.updateOne({ _id: STATE_ID }, { $set: { planFull: plan, plan: { sitePrompt: plan.sitePrompt, language: plan.language, audience: plan.audience, lookAndFeel: plan.lookAndFeel, pages: plan.pages.map((p) => p.title), assumptions: plan.assumptions } } });
    // Writing again keeps the theme and the photos the site already has; only the content is new.
    // (A theme made before style recipes existed is rebuilt once, so every site gets its own look.)
    let themeExists = false;
    try { themeExists = !!(await getTheme(THEME_KEY)).tokens.customCss?.includes(STYLE_MARKER); } catch { themeExists = false; }
    const keepLook = themeExists && prev?.status === "done";
    const [first, images] = await Promise.all([
      writeWebsite(brief, plan, knowledge),
      keepLook && prev?.images && (prev.images.hero || prev.images.about || prev.images.services)
        ? Promise.resolve(prev.images)
        : imagePrompts(brief).then((p) => makeImages(p, (png, name) => createCmsMediaFromBuffer(png, `${brief.name} — ${name}`, `${brief.name} — ${name}`, ACTOR))),
    ]);
    // Check what was written; one repair pass for anything invented, off-topic or in the wrong language; then remove whatever is left.
    const banned = { ...bannedFromPlaybooks(playbooks), techBusiness: brief.categories.some((c) => /software|information technology|ai, |cyber|cloud|blockchain|digital|internet|telecom|vertical tech|emerging/i.test(c)) };
    let raw = first;
    let found = audit(raw, plan, banned, brief.name);
    let repaired = 0;
    if (found.length) {
      try {
        raw = await writeWebsite(brief, plan, knowledge, { raw, issues: found });
        repaired = found.length;
        found = audit(raw, plan, banned, brief.name);
      } catch (err) {
        console.error("[ai-website] repair pass failed; scrubbing the first draft", err instanceof Error ? err.message : err);
      }
    }
    const left = found.length;
    if (left) raw = scrub(raw, banned, brief.name);
    const { pack, palette, components, style } = toPack(raw, brief.slug, images, plan);
    const v = { name: brief.name, email: brief.email };

    // ── Theme: made once, at sign-up, for this company. Writing the content again never touches it. ──
    if (!keepLook) {
      const tokens = buildThemeTokens(palette, buildStyleCss(style));
      const made = await createTheme({ key: THEME_KEY, name: `${brief.name} (designed for you)`, description: (plan.lookAndFeel || raw.design.mood).slice(0, 300) }, ACTOR);
      if (!made.ok && !/already exists/i.test(made.error)) throw new Error(made.error);
      const published = await publishThemeDraft(THEME_KEY, tokens, components, ACTOR);
      if (!published.ok) throw new Error(published.error);
      const active = await getActiveThemeKey();
      const platformChosen = active === "default" || active === THEME_KEY || THEME_PRESETS.some((p) => p.id === active);
      if (platformChosen) await setActiveTheme(THEME_KEY, ACTOR);
    }

    const content: Content = { pages: starterPages(v, pack), nav: starterNavigation(pack), footer: starterFooter(pack), siteInfo: await starterSiteInfo(brief.name, (await getCompanyBrand()).namePrimary, (await getCompanyBrand()).nameAccent, pack) };
    const { pages, identityHash } = await applyContent(content, prev?.identityHash);
    const summary = { checks: { issuesFound: repaired || left, repaired: repaired > 0 && left === 0, scrubbed: left }, mood: raw.design.mood, services: pack.services.map((s) => s.title), pages, images: [images.hero, images.about, images.services].filter(Boolean).length, theme: { primary: palette.primary, headingFont: palette.headingFont, bodyFont: palette.bodyFont, header: components.header ?? "default", footer: components.footer ?? "default" } };
    // Every generation is kept as a version, forever, so any earlier one can be brought back.
    const versionId = await saveVersion({ source: "generated", model: WEBSITE_MODEL(), prompt: owner, plan, images, summary, content });

    await col.updateOne(
      { _id: STATE_ID },
      {
        $set: {
          status: "done", finishedAt: new Date(), identityHash, images, currentVersionId: versionId,
          summary,
        },
      },
    );
    await cmsEvents.aiWebsite(true, `${pages} pages were written. Review and publish them in the CMS.`);
    return { ok: true, pages };
  } catch (err) {
    const message = isBillingLimitError(err) ? `${err.message} Your existing website was not changed.` : err instanceof Error ? err.message : "The website could not be generated.";
    console.error("[ai-website] failed", err);
    await col.updateOne({ _id: STATE_ID }, { $set: { status: "failed", finishedAt: new Date(), error: message.slice(0, 500) } });
    await cmsEvents.aiWebsite(false, message);
    return { ok: false, error: message };
  }
}

