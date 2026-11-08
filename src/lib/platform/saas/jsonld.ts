import { SAAS_BRAND } from "@/lib/platform/saas/brand";

const ctx = "https://schema.org";
/** The brand and the website have fixed ids, so every page's schema points at the same organisation instead of describing it again. */
export const ORG_ID = "/#organization";
export const SITE_ID = "/#website";
/** Relative addresses are made absolute by the page's origin on the client side of search engines; the layout supplies it. */
export interface Crumb { name: string; path: string }

export function breadcrumbList(crumbs: Crumb[]) {
  return { "@context": ctx, "@type": "BreadcrumbList", itemListElement: crumbs.map((c, i) => ({ "@type": "ListItem", position: i + 1, name: c.name, item: c.path })) };
}

export function webPage(o: { type?: "WebPage" | "CollectionPage" | "AboutPage" | "ContactPage" | "FAQPage" | "ProfilePage"; path: string; name: string; description: string; crumbs?: Crumb[]; about?: string }) {
  return {
    "@context": ctx,
    "@type": o.type ?? "WebPage",
    "@id": `${o.path}#webpage`,
    url: o.path,
    name: o.name,
    description: o.description,
    inLanguage: "en-IN",
    isPartOf: { "@id": SITE_ID },
    publisher: { "@id": ORG_ID },
    ...(o.about ? { about: { "@type": "Thing", name: o.about } } : {}),
  };
}

/** A product as software people can use: free to start, runs in the browser and as apps. Only what the product page itself says. */
export function softwareApplication(o: {
  path: string; name: string; description: string; category?: string; subCategory?: string; features?: string[]; keywords?: string[];
  screenshots?: string[]; audience?: string; related?: { name: string; path: string }[]; alternateName?: string;
}) {
  return {
    "@context": ctx,
    "@type": ["SoftwareApplication", "WebApplication"],
    "@id": `${o.path}#software`,
    name: o.name,
    ...(o.alternateName ? { alternateName: o.alternateName } : {}),
    url: o.path,
    mainEntityOfPage: `${o.path}#webpage`,
    description: o.description,
    applicationCategory: o.category ?? "BusinessApplication",
    ...(o.subCategory ? { applicationSubCategory: o.subCategory } : {}),
    operatingSystem: "Web, Android, iOS, Windows, macOS, Linux",
    browserRequirements: "Requires JavaScript. Works in current versions of Chrome, Edge, Firefox and Safari.",
    inLanguage: "en-IN",
    isAccessibleForFree: true,
    ...(o.features?.length ? { featureList: o.features.slice(0, 12) } : {}),
    ...(o.keywords?.length ? { keywords: o.keywords.slice(0, 15).join(", ") } : {}),
    ...(o.audience ? { audience: { "@type": "BusinessAudience", audienceType: o.audience } } : {}),
    ...(o.screenshots?.length ? { screenshot: o.screenshots.slice(0, 4).map((u) => ({ "@type": "ImageObject", url: u, caption: `${o.name} screen` })) } : {}),
    ...(o.related?.length ? { isRelatedTo: o.related.map((r) => ({ "@type": "SoftwareApplication", name: r.name, url: r.path })) } : {}),
    offers: { "@type": "Offer", price: "0", priceCurrency: "INR", url: "/pricing", availability: "https://schema.org/InStock", description: "Free plan with every product and every feature" },
    publisher: { "@id": ORG_ID },
    provider: { "@id": ORG_ID },
    isPartOf: { "@type": "SoftwareApplication", name: "SelfRun AI", url: "/" },
  };
}

/** The plans as offers, with their real monthly prices. A plan without a public price (contact us) has no price line. */
export function planOffers(plans: { id: string; name: string; description: string; currency: string; kind: "free" | "paid" | "contact"; monthly: number | null; validUntil?: string | null }[]) {
  return {
    "@context": ctx,
    "@type": "OfferCatalog",
    name: "SelfRun AI plans",
    itemListElement: plans.flatMap((p) => {
      if (p.kind === "contact" || (p.kind === "paid" && !p.monthly)) return [];
      const price = p.kind === "free" ? 0 : (p.monthly as number) / 100;
      return [{
        "@type": "Offer",
        "@id": `/pricing/${p.id}#offer`,
        url: `/pricing/${p.id}`,
        name: `${p.name} plan`,
        description: p.description,
        price: price.toFixed(2),
        priceCurrency: p.currency || "INR",
        priceSpecification: { "@type": "UnitPriceSpecification", price: price.toFixed(2), priceCurrency: p.currency || "INR", billingDuration: "P1M", unitText: "month" },
        availability: "https://schema.org/InStock",
        itemOffered: { "@type": "SoftwareApplication", name: "SelfRun AI", url: "/" },
        ...(p.validUntil ? { priceValidUntil: p.validUntil.slice(0, 10) } : {}),
      }];
    }),
  };
}

export function imageGallery(o: { path: string; name: string; description: string; images: { url: string; name: string }[] }) {
  return {
    "@context": ctx,
    "@type": "ImageGallery",
    "@id": `${o.path}#gallery`,
    name: o.name,
    description: o.description,
    url: o.path,
    image: o.images.slice(0, 40).map((i) => ({ "@type": "ImageObject", contentUrl: i.url, name: i.name, caption: i.name })),
  };
}

export function blog(o: { path: string; name: string; description: string; posts: { title: string; path: string; date: string; author: string; description: string }[] }) {
  return {
    "@context": ctx,
    "@type": "Blog",
    "@id": `${o.path}#blog`,
    name: o.name,
    description: o.description,
    url: o.path,
    inLanguage: "en-IN",
    publisher: { "@id": ORG_ID },
    blogPost: o.posts.map((p) => ({ "@type": "BlogPosting", headline: p.title, url: p.path, datePublished: p.date, description: p.description, author: { "@type": "Person", name: p.author } })),
  };
}

export function organizationPage(o: { path: string; type: "AboutPage" | "ContactPage"; name: string; description: string }) {
  return { "@context": ctx, "@type": o.type, "@id": `${o.path}#webpage`, url: o.path, name: o.name, description: o.description, inLanguage: "en-IN", isPartOf: { "@id": SITE_ID }, mainEntity: { "@id": ORG_ID } };
}

export function article(o: { path: string; title: string; description: string; date: string; author: string; image?: string; section?: string; keywords?: string[]; authorOrg?: boolean; type?: "Article" | "TechArticle" }) {
  return {
    "@context": ctx,
    "@type": o.type ?? "Article",
    "@id": `${o.path}#article`,
    mainEntityOfPage: o.path,
    headline: o.title.slice(0, 110),
    description: o.description,
    datePublished: o.date,
    dateModified: o.date,
    author: { "@type": o.authorOrg ? "Organization" : "Person", name: o.author },
    publisher: { "@id": ORG_ID },
    ...(o.image ? { image: [o.image] } : {}),
    ...(o.section ? { articleSection: o.section } : {}),
    ...(o.keywords?.length ? { keywords: o.keywords.join(", ") } : {}),
    inLanguage: "en-IN",
  };
}

export function howTo(o: { path: string; name: string; description: string; steps: { name: string; text: string }[]; totalMinutes?: number }) {
  return {
    "@context": ctx,
    "@type": "HowTo",
    "@id": `${o.path}#howto`,
    name: o.name,
    description: o.description,
    ...(o.totalMinutes ? { totalTime: `PT${o.totalMinutes}M` } : {}),
    step: o.steps.map((s, i) => ({ "@type": "HowToStep", position: i + 1, name: s.name, text: s.text })),
  };
}

export function itemList(o: { name: string; items: { name: string; path: string }[] }) {
  return { "@context": ctx, "@type": "ItemList", name: o.name, itemListElement: o.items.map((x, i) => ({ "@type": "ListItem", position: i + 1, name: x.name, url: x.path })) };
}

export function faqPage(items: { q: string; a: string }[]) {
  return { "@context": ctx, "@type": "FAQPage", mainEntity: items.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) };
}
