import type { BlogPostMeta } from "@/types/content";
import type { Job } from "@/types/content";
import type { EngagementCategory } from "@/types/content";
import type { ProductItem } from "@/types/content";
import type { PageSection } from "@/lib/products/sitecraft-ai/section-registry";

/**
 * JSON-LD blocks that are DERIVED from live records, stored on a CMS page as
 * `{ "$generate": "<kind>", …params }`. Everything fixed (organisation,
 * location, labels) is in the stored entry; the record-driven parts are
 * filled at render so the structured data never drifts from the record.
 * Output shapes are byte-for-byte what the site's pages produced before.
 */

type Entry = Record<string, unknown>;

export interface JsonLdData {
  /** The company's public origin (`companySiteUrl()`), no trailing slash. */
  siteUrl: string;
  path: string;
  description: string;
  sections: PageSection[];
  blog: BlogPostMeta[];
  jobs: Job[];
  engagement: EngagementCategory[];
  products: ProductItem[];
}

const str = (v: unknown) => (typeof v === "string" ? v : "");

function blogList(e: Entry, d: JsonLdData) {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: str(e.name),
    description: d.description,
    url: `${d.siteUrl}${d.path}`,
    numberOfItems: d.blog.length,
    itemListElement: d.blog.map((post, index) => ({ "@type": "ListItem", position: index + 1, url: `${d.siteUrl}/blog/${post.slug}`, name: post.title })),
  };
}

function productsList(e: Entry, d: JsonLdData) {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: str(e.name),
    description: d.description,
    itemListElement: d.products.map((product, index) => ({
      "@type": "ListItem",
      position: index + 1,
      item: { "@type": "Product", name: product.name, description: product.shortDescription, category: product.category, url: `${d.siteUrl}${d.path}#${product.slug}` },
    })),
  };
}

/** Entry: { slug, author, publisher } — author/publisher are the Organization objects. */
function blogArticle(e: Entry, d: JsonLdData) {
  const post = d.blog.find((p) => p.slug === e.slug);
  if (!post) return null;
  const path = `/blog/${post.slug}`;
  return {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: post.description,
    image: post.imageAlt ? { "@type": "ImageObject", url: post.image, description: post.imageAlt } : post.image,
    url: `${d.siteUrl}${path}`,
    datePublished: post.date,
    dateModified: post.date,
    inLanguage: "en-IN",
    ...(post.category ? { articleSection: post.category } : {}),
    ...(post.keywords?.length ? { keywords: post.keywords.join(", ") } : {}),
    author: { ...(e.author as Entry), ...(post.author ? { name: post.author } : {}) },
    publisher: e.publisher,
    mainEntityOfPage: { "@type": "WebPage", "@id": `${d.siteUrl}${path}` },
  };
}

function mapEmploymentType(type: string): string[] {
  const t = type.toLowerCase();
  if (t.includes("full")) return ["FULL_TIME"];
  if (t.includes("part")) return ["PART_TIME"];
  if (t.includes("contract")) return ["CONTRACTOR"];
  if (t.includes("intern")) return ["INTERN"];
  if (t.includes("temp")) return ["TEMPORARY"];
  return ["FULL_TIME"];
}

/**
 * Entry: { slug, hiringOrganization, jobLocation, labels, defaultDatePosted, expiredValidThrough }.
 * Perks ("What We Offer") are the job page's own job-detail section's perks.
 */
function jobPosting(e: Entry, d: JsonLdData) {
  const job = d.jobs.find((j) => j.slug === e.slug);
  if (!job || job.status === "draft") return null;
  const labels = (e.labels ?? {}) as Record<string, string>;
  const detail = d.sections.find((s) => s.type === "job-detail")?.config as { perks?: { title: string; description: string }[] } | undefined;
  const perks = detail?.perks ?? [];
  const li = (items: string[]) => items.map((x) => `<li>${x}</li>`).join("");
  const niceHtml = li(job.niceToHave);
  const description = `
    <p>${job.summary}</p>
    <h3>${labels.overview}</h3>
    <p>${labels.department}: ${job.category}<br/>${labels.employmentType}: ${job.employmentType}<br/>${labels.location}: ${job.location}<br/>${labels.experience}: ${job.experience}</p>
    <h3>${labels.responsibilities}</h3>
    <ul>${job.responsibilities.map((i) => `<li><strong>${i.title}:</strong> ${i.description}</li>`).join("")}</ul>
    <h3>${labels.qualifications}</h3>
    <ul>${job.qualifications.map((i) => `<li><strong>${i.title}:</strong> ${i.description}</li>`).join("")}</ul>
    ${niceHtml ? `<h3>${labels.niceToHave}</h3><ul>${niceHtml}</ul>` : ""}
    <h3>${labels.skills}</h3>
    <ul>${li(job.skills)}</ul>
    <h3>${labels.perks}</h3>
    <ul>${perks.map((p) => `<li><strong>${p.title}:</strong> ${p.description}</li>`).join("")}</ul>
  `.trim();
  const remote = job.location.toLowerCase().includes("remote") || job.location.toLowerCase().includes("hybrid") || job.isRemote;
  const years = job.experience.match(/(\d+)/);
  const expMonths = years ? parseInt(years[1], 10) * 12 : null;
  const schema: Entry = {
    "@context": "https://schema.org",
    "@type": "JobPosting",
    title: job.title,
    description,
    datePosted: job.datePosted || str(e.defaultDatePosted),
    employmentType: mapEmploymentType(job.employmentType),
    hiringOrganization: e.hiringOrganization,
    jobLocation: e.jobLocation,
    directApply: true,
    url: `${d.siteUrl}/careers/${job.slug}`,
    skills: job.skills.join(", "),
  };
  if (job.validThrough) schema.validThrough = job.validThrough;
  else if (job.status === "closed" || job.status === "expired") schema.validThrough = str(e.expiredValidThrough);
  if (remote) {
    schema.jobLocationType = "TELECOMMUTE";
    schema.applicantLocationRequirements = { "@type": "Country", name: "IN" };
  }
  if (expMonths !== null && expMonths > 0) schema.experienceRequirements = { "@type": "OccupationalExperienceRequirements", monthsOfExperience: expMonths };
  if (job.baseSalary) {
    schema.baseSalary = {
      "@type": "MonetaryAmount",
      currency: job.baseSalary.currency,
      value: {
        "@type": "QuantitativeValue",
        ...(job.baseSalary.value !== undefined ? { value: job.baseSalary.value } : {}),
        ...(job.baseSalary.minValue !== undefined ? { minValue: job.baseSalary.minValue } : {}),
        ...(job.baseSalary.maxValue !== undefined ? { maxValue: job.baseSalary.maxValue } : {}),
        unitText: job.baseSalary.unitText,
      },
    };
  }
  return schema;
}

/** Entry: { collection: "engagement", slug } — the record's own FAQs. */
function recordFaq(e: Entry, d: JsonLdData) {
  const rec = d.engagement.find((c) => c.slug === e.slug);
  if (!rec) return null;
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: rec.faqs.map((faq) => ({ "@type": "Question", name: faq.question, acceptedAnswer: { "@type": "Answer", text: faq.answer } })),
  };
}

const GENERATORS: Record<string, (e: Entry, d: JsonLdData) => Entry | null> = {
  "blog-list": blogList,
  "products-list": productsList,
  "blog-article": blogArticle,
  "job-posting": jobPosting,
  "record-faq": recordFaq,
};

export const JSON_LD_GENERATOR_KINDS = Object.keys(GENERATORS);

/** Which collections a page's JSON-LD needs loaded. */
export function jsonLdNeeds(list: Entry[]): { blog: boolean; jobs: boolean; engagement: boolean; products: boolean } {
  const kinds = new Set(list.map((e) => e.$generate).filter(Boolean));
  return {
    blog: kinds.has("blog-list") || kinds.has("blog-article"),
    jobs: kinds.has("job-posting"),
    engagement: kinds.has("record-faq"),
    products: kinds.has("products-list"),
  };
}

/** Literal blocks pass through; generator blocks are filled from live records (and dropped if their record is gone). */
export function resolveJsonLd(list: Entry[], d: JsonLdData): Entry[] {
  return list.flatMap((e) => {
    const kind = typeof e.$generate === "string" ? e.$generate : null;
    if (!kind) return [e];
    const out = GENERATORS[kind]?.(e, d) ?? null;
    return out ? [out] : [];
  });
}
