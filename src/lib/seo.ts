import { productionRootDomain } from "@/lib/platform/tenancy/root-domain";

/**
 * The PLATFORM's own origin (its root domain, from the environment) — only a
 * fallback for requests that belong to no company. For "this company's public
 * site" use `companySiteUrl()` (`src/lib/platform/tenancy/site-url.ts`).
 */
const rootDomain = (process.env.PLATFORM_ROOT_DOMAIN || productionRootDomain() || "localhost:3000").trim();
export const siteUrl = `${/^localhost(:\d+)?$/.test(rootDomain) ? "http" : "https"}://${rootDomain}`;

interface SocialMetadataInput {
  title: string;
  description: string;
  path: string;
  image: string;
  imageAlt?: string;
}

/**
 * Builds matching openGraph + twitter metadata fields for a page. `image` may
 * be an absolute URL (e.g. Unsplash) or a site-relative path (resolved via
 * metadataBase). `origin` = the company's public site (`companySiteUrl()`).
 */
export function socialMetadata({ title, description, path, image, imageAlt, siteName, origin = siteUrl }: SocialMetadataInput & { siteName: string; origin?: string }) {
  return {
    openGraph: {
      title,
      description,
      url: `${origin}${path}`,
      siteName,
      images: [{ url: image, alt: imageAlt ?? title }],
      type: "website" as const,
      locale: "en_US",
    },
    twitter: {
      card: "summary_large_image" as const,
      title,
      description,
      images: [image],
    },
  };
}

interface FaqJsonLdInput {
  question: string;
  answer: string;
}

export function faqJsonLd(faqs: FaqJsonLdInput[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((faq) => ({
      "@type": "Question",
      name: faq.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: faq.answer,
      },
    })),
  };
}

interface BreadcrumbItem {
  name: string;
  path: string;
}

/** `origin` = the company's public site (`companySiteUrl()`). */
export function breadcrumbJsonLd(items: BreadcrumbItem[], origin: string = siteUrl) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: `${origin}${item.path}`,
    })),
  };
}
