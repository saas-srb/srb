import "server-only";
import { STARTER_CONTACT_FIELDS, STARTER_SITE_INFO_DEFAULTS } from "@/lib/platform/website/starter-defaults";
import { getDb } from "@/lib/mongodb";
import { COLLECTIONS } from "@/lib/products/sitecraft-ai/db";
import { createPage, getPageByPath, publishPage } from "@/lib/products/sitecraft-ai/pages";
import { createNavItem, listNavItems } from "@/lib/products/sitecraft-ai/nav";
import { createFooterColumn, createFooterLink, listFooterColumns } from "@/lib/products/sitecraft-ai/footer";
import { getSiteInfoForEdit, saveSiteInfo } from "@/lib/products/sitecraft-ai/site-info";
import { parseSiteInfo, type SiteInfo } from "@/lib/products/sitecraft-ai/site-info-shared";
import { saveFormFields } from "@/lib/products/sitecraft-ai/forms";
import { parsePageSeo } from "@/lib/products/sitecraft-ai/page-seo";
import { getCompanyBrand } from "@/lib/platform/branding";
import { starterFooter, starterNavigation, starterPages } from "@/lib/platform/website/starter-template";
import { fillName, pickStarterPack, type StarterPack } from "@/lib/platform/website/starter-packs";
import { currentCompanyId } from "@/lib/platform/tenancy/context";
import { getPlatformDb } from "@/lib/platform/tenancy/platform-db";
import { COMPANIES_COLLECTION } from "@/lib/platform/tenancy/companies";
import type { BusinessSelection } from "@/lib/platform/business-taxonomy";
import { categoryFallbackPack } from "@/lib/platform/website/ai/fallback";
import { getActiveThemeKey, installThemePreset, setActiveTheme } from "@/lib/products/sitecraft-ai/theme";
import { DEFAULT_DISPLAY } from "@/lib/products/sitecraft-ai/site-info-shared";

/**
 * Publishes the neutral starter website into the CURRENT company's CMS —
 * called when a company is created, so its public site works from minute
 * one. Idempotent and non-destructive: anything the company already has
 * (a page at the same path, navigation, footer, site identity) is left alone.
 */

const ACTOR = "system:starter-website";

export async function starterSiteInfo(name: string, namePrimary: string, nameAccent: string, pack: StarterPack): Promise<SiteInfo> {
  const base = parseSiteInfo(STARTER_SITE_INFO_DEFAULTS);
  return (
    {
      ...base,
      brand: { namePrimary, nameAccent, subtitle: "", logoUrl: "", logoDarkUrl: "" },
      header: { ...base.header, askAiLabel: base.header?.askAiLabel || "Ask AI", askAiHref: base.header?.askAiHref || "/ask", ...(pack.structure?.headerCta ? { ctaLabel: pack.structure.headerCta, ctaHref: "/contact" } : {}) },
      floating: { ...base.floating, assistantLabel: "Ask AI" },
      // Filled in from the company profile (onboarding) — never guessed.
      contact: { email: "", phoneDisplay: "", phoneHref: "", whatsappHref: "", linkedinHref: "", mapsUrl: "", addressName: "", address: "" },
      social: [],
      display: {
        header: { ...DEFAULT_DISPLAY.header, social: pack.display?.headerSocial ?? DEFAULT_DISPLAY.header.social, ...(pack.structure?.mode === "plan" ? { askAi: false, authLinks: pack.structure.accounts === true } : {}) },
        footer: { ...DEFAULT_DISPLAY.footer, bottomBar: pack.display?.footerBottomBar ?? DEFAULT_DISPLAY.footer.bottomBar },
        // Live chat appears only once the company adds its own widget (CMS → Settings → Tracking); WhatsApp only once it has a number.
        floating: { ...DEFAULT_DISPLAY.floating, ...(pack.structure?.mode === "plan" ? { assistant: false } : {}) },
      },
      footer: {
        ...base.footer,
        badge: pack.footerCta.badge,
        ctaTitle: pack.footerCta.title,
        ctaText: pack.footerCta.text,
        ctaLabel: pack.footerCta.label,
        ctaHref: "/contact",
        whatsappLabel: "Chat on WhatsApp",
        about: fillName(pack.tagline, name),
        copyright: "All rights reserved.",
        legalLinks: [{ label: "Privacy Policy", href: "/privacy-policy" }, { label: "Terms of Service", href: "/terms" }],
        compactLinks: [{ label: "Privacy Policy", href: "/privacy-policy" }, { label: "Terms of Service", href: "/terms" }],
      },
      shareImage: { alt: name, tag: "", headline: name, subline: fillName(pack.tagline, name), domain: "", badges: [] },
    }
  );
}

export interface StarterResult {
  pack: string;
  theme: string | null;
  pagesCreated: string[];
  navigation: boolean;
  footer: boolean;
  siteInfo: boolean;
  contactForm: boolean;
}

export async function publishStarterWebsite(): Promise<StarterResult> {
  const brand = await getCompanyBrand();
  const name = brand.name;
  const id = await currentCompanyId();
  // A company that chose its business categories gets a plain site built only from those; the generic packs below are for companies that did not.
  const company = (await (await getPlatformDb()).collection(COMPANIES_COLLECTION).findOne({ _id: id } as never)) as { slug?: string; business?: BusinessSelection } | null;
  const cats = company?.business?.categories ?? [];
  const catName = new Map(cats.map((c) => [c.code, c.name]));
  const pack = cats.length || company?.business?.subCategories?.length
    ? categoryFallbackPack({
        name,
        slug: company?.slug ?? id,
        country: "",
        categories: cats.map((c) => c.name),
        subCategories: (company?.business?.subCategories ?? []).map((x) => ({ name: x.name, category: (x.categoryCode && catName.get(x.categoryCode)) || cats[0]?.name || "" })),
        email: "",
        phone: "",
      })
    : pickStarterPack(id);
  const result: StarterResult = { pack: pack.id, theme: null, pagesCreated: [], navigation: false, footer: false, siteInfo: false, contactForm: false };

  for (const page of starterPages({ name, email: "" }, pack)) {
    if (await getPageByPath(page.path)) continue;
    const created = await createPage({ path: page.path, title: page.title, templateKey: "starter", sections: page.sections, seo: parsePageSeo(page.seo), frame: "accent" }, ACTOR);
    if (!created.ok) {
      console.error(`[starter-website] ${page.path}: ${created.error}`);
      continue;
    }
    const published = await publishPage(created.id, ACTOR, "Starter website");
    if (published.ok) result.pagesCreated.push(page.path);
    else console.error(`[starter-website] publish ${page.path}: ${published.error}`);
  }

  if ((await listNavItems()).length === 0) {
    for (const top of starterNavigation(pack)) {
      const parent = await createNavItem({ parentId: null, label: top.name, href: top.href, iconKey: top.iconKey, featuredTitle: top.featured.title, featuredDescription: top.featured.description, featuredImage: top.featured.image }, ACTOR);
      for (const item of top.items) await createNavItem({ parentId: parent._id, label: item.name, href: item.href, description: item.description, iconKey: item.iconKey }, ACTOR);
    }
    result.navigation = true;
  }

  if ((await listFooterColumns()).length === 0) {
    for (const col of starterFooter()) {
      const column = await createFooterColumn({ title: col.title, viewAllHref: col.viewAllHref, viewAllLabel: col.viewAllLabel }, ACTOR);
      for (const link of col.links) await createFooterLink({ columnId: column._id, label: link.label, href: link.href }, ACTOR);
    }
    result.footer = true;
  }

  const currentInfo = await getSiteInfoForEdit();
  if (!currentInfo.brand.namePrimary && !currentInfo.brand.nameAccent) {
    await saveSiteInfo(await starterSiteInfo(name, brand.namePrimary, brand.nameAccent, pack), ACTOR);
    result.siteInfo = true;
  }

  // Its own look: the pack's theme (colours, fonts, header/footer, section layouts) — only while the company is still on the plain default.
  if ((await getActiveThemeKey()) === "default") {
    const installed = await installThemePreset(pack.themePreset, ACTOR);
    if (installed.ok || installed.error === "This theme is already installed.") {
      const activated = await setActiveTheme(pack.themePreset, ACTOR);
      if (activated.ok) result.theme = pack.themePreset;
      else console.error(`[starter-website] activate ${pack.themePreset}: ${activated.error}`);
    } else console.error(`[starter-website] install ${pack.themePreset}: ${installed.error}`);
  }

  const forms = (await getDb()).collection<{ _id: string; fields?: unknown[] }>(COLLECTIONS.forms);
  if (!(await forms.findOne({ _id: "contact" }))?.fields?.length) {
    await saveFormFields("contact", STARTER_CONTACT_FIELDS as Parameters<typeof saveFormFields>[1], ACTOR);
    result.contactForm = true;
  }

  // Site-wide defaults: legal name + maintenance text, only when unset.
  const settings = (await getDb()).collection<{ _id: string; companyLegalName?: string; maintenanceMode?: unknown }>(COLLECTIONS.settings);
  await settings.updateOne(
    { _id: "default" },
    { $setOnInsert: { companyLegalName: name, maintenanceMode: { title: `Down for maintenance | ${name}`, heading: "We'll be right back", message: "We're making some improvements — check back shortly." }, createdAt: new Date() } },
    { upsert: true },
  );
  return result;
}

/**
 * Keeps the public site's contact block in step with the company profile —
 * only fills fields that are still blank, so edits made in the CMS win.
 */
export async function syncSiteContact(contact: { email: string; phone: string }): Promise<void> {
  const info = await getSiteInfoForEdit();
  if (!info.brand.namePrimary && !info.brand.nameAccent) return; // no site identity yet
  const email = contact.email.trim();
  const phone = contact.phone.trim();
  const digits = phone.replace(/[^\d+]/g, "");
  const next = {
    ...info.contact,
    email: info.contact.email || email,
    phoneDisplay: info.contact.phoneDisplay || phone,
    phoneHref: info.contact.phoneHref || (digits ? `tel:${digits}` : ""),
  };
  if (JSON.stringify(next) !== JSON.stringify(info.contact)) await saveSiteInfo({ ...info, contact: next }, ACTOR);
}
