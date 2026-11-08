/**
 * JSON-LD validation for the schema editor. Checks syntax, the schema.org
 * context, the declared @type, and each type's required / recommended
 * properties following Google's rich-result documentation (a subset — it
 * catches the mistakes that stop rich results, it is not a full schema.org
 * validator). Pure: runs in the browser for live feedback and again on the
 * server before publishing.
 */

export const SCHEMA_TYPES = [
  "Organization",
  "LocalBusiness",
  "WebSite",
  "WebPage",
  "Article",
  "BlogPosting",
  "BreadcrumbList",
  "FAQPage",
  "Product",
  "Service",
  "Event",
  "JobPosting",
  "Course",
  "Review",
] as const;
export type SchemaType = (typeof SCHEMA_TYPES)[number];

export const SCHEMA_LABEL: Record<SchemaType, string> = {
  Organization: "Organization",
  LocalBusiness: "Local Business",
  WebSite: "Website",
  WebPage: "Web Page",
  Article: "Article",
  BlogPosting: "Blog Posting",
  BreadcrumbList: "Breadcrumb",
  FAQPage: "FAQ",
  Product: "Product",
  Service: "Service",
  Event: "Event",
  JobPosting: "Job Posting",
  Course: "Course",
  Review: "Review",
};

const RULES: Record<SchemaType, { required: string[]; recommended: string[] }> = {
  Organization: { required: ["name", "url"], recommended: ["logo", "sameAs", "contactPoint"] },
  LocalBusiness: { required: ["name", "address"], recommended: ["telephone", "geo", "openingHoursSpecification", "url", "image"] },
  WebSite: { required: ["name", "url"], recommended: ["publisher", "potentialAction"] },
  WebPage: { required: ["name"], recommended: ["url", "description", "breadcrumb"] },
  Article: { required: ["headline"], recommended: ["author", "datePublished", "dateModified", "image", "publisher"] },
  BlogPosting: { required: ["headline"], recommended: ["author", "datePublished", "dateModified", "image", "publisher"] },
  BreadcrumbList: { required: ["itemListElement"], recommended: [] },
  FAQPage: { required: ["mainEntity"], recommended: [] },
  Product: { required: ["name"], recommended: ["image", "description", "offers", "aggregateRating", "review", "brand"] },
  Service: { required: ["name"], recommended: ["provider", "serviceType", "areaServed", "description"] },
  Event: { required: ["name", "startDate", "location"], recommended: ["endDate", "eventStatus", "eventAttendanceMode", "image", "description", "offers", "organizer"] },
  JobPosting: { required: ["title", "description", "datePosted", "hiringOrganization"], recommended: ["validThrough", "employmentType", "baseSalary", "jobLocation", "identifier"] },
  Course: { required: ["name", "description"], recommended: ["provider", "offers", "hasCourseInstance"] },
  Review: { required: ["itemReviewed", "reviewRating", "author"], recommended: ["datePublished", "reviewBody"] },
};

export interface SchemaValidation {
  valid: boolean;
  errors: string[];
  warnings: string[];
  types: string[];
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const has = (o: Record<string, unknown>, k: string) => o[k] !== undefined && o[k] !== null && o[k] !== "" && !(Array.isArray(o[k]) && (o[k] as unknown[]).length === 0);
const typesOf = (o: Record<string, unknown>): string[] => (typeof o["@type"] === "string" ? [o["@type"]] : Array.isArray(o["@type"]) ? (o["@type"] as unknown[]).filter((x): x is string => typeof x === "string") : []);

const LOCAL_BUSINESS_SUBTYPES = ["LocalBusiness", "ITService", "ProfessionalService", "Store", "EducationalOrganization"];

function checkNode(node: Record<string, unknown>, where: string, errors: string[], warnings: string[]) {
  const types = typesOf(node);
  if (types.length === 0) {
    errors.push(`${where}: missing "@type".`);
    return;
  }
  for (const t of types) {
    const key = (LOCAL_BUSINESS_SUBTYPES.includes(t) && t !== "LocalBusiness" ? "LocalBusiness" : t) as SchemaType;
    const rule = RULES[key];
    if (!rule) continue;
    for (const r of rule.required) if (!has(node, r)) errors.push(`${where} (${t}): required property "${r}" is missing.`);
    for (const r of rule.recommended) if (!has(node, r)) warnings.push(`${where} (${t}): recommended property "${r}" is missing.`);
  }

  if (types.includes("BreadcrumbList") && Array.isArray(node.itemListElement)) {
    (node.itemListElement as unknown[]).forEach((it, i) => {
      if (!isObj(it)) return errors.push(`${where}: itemListElement[${i}] must be an object.`);
      if (typeof it.position !== "number") errors.push(`${where}: itemListElement[${i}] needs a numeric "position".`);
      if (!has(it, "name")) errors.push(`${where}: itemListElement[${i}] needs a "name".`);
      if (!has(it, "item") && i < (node.itemListElement as unknown[]).length - 1) warnings.push(`${where}: itemListElement[${i}] should have an "item" URL.`);
    });
  }
  if (types.includes("FAQPage") && Array.isArray(node.mainEntity)) {
    (node.mainEntity as unknown[]).forEach((q, i) => {
      if (!isObj(q) || !typesOf(q).includes("Question")) return errors.push(`${where}: mainEntity[${i}] must be a Question.`);
      if (!has(q, "name")) errors.push(`${where}: Question ${i + 1} needs "name" (the question text).`);
      const a = q.acceptedAnswer;
      if (!isObj(a) || !has(a, "text")) errors.push(`${where}: Question ${i + 1} needs acceptedAnswer.text.`);
    });
  }
  if (types.includes("Product") && !has(node, "offers") && !has(node, "review") && !has(node, "aggregateRating")) {
    errors.push(`${where} (Product): needs at least one of "offers", "review" or "aggregateRating" for rich results.`);
  }
  if (types.includes("JobPosting") && !has(node, "jobLocation") && node.jobLocationType !== "TELECOMMUTE") {
    errors.push(`${where} (JobPosting): needs "jobLocation", or jobLocationType "TELECOMMUTE" for remote roles.`);
  }
  if (types.includes("Review") && isObj(node.reviewRating) && !has(node.reviewRating, "ratingValue")) {
    errors.push(`${where} (Review): reviewRating.ratingValue is required.`);
  }
  for (const dateKey of ["datePublished", "dateModified", "startDate", "endDate", "datePosted", "validThrough"]) {
    const v = node[dateKey];
    if (typeof v === "string" && Number.isNaN(Date.parse(v))) errors.push(`${where}: "${dateKey}" is not a valid ISO 8601 date ("${v}").`);
  }
  for (const urlKey of ["url", "logo", "image"]) {
    const v = node[urlKey];
    if (typeof v === "string" && !/^https?:\/\//.test(v)) warnings.push(`${where}: "${urlKey}" should be an absolute URL.`);
  }
}

export function validateJsonLd(source: string, expectedType?: string): SchemaValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  let data: unknown;
  try {
    data = JSON.parse(source);
  } catch (err) {
    return { valid: false, errors: [`Invalid JSON: ${err instanceof Error ? err.message : "parse error"}`], warnings: [], types: [] };
  }
  const roots = Array.isArray(data) ? data : [data];
  const allTypes: string[] = [];
  roots.forEach((root, i) => {
    const where = roots.length > 1 ? `Item ${i + 1}` : "Root";
    if (!isObj(root)) return errors.push(`${where}: must be a JSON object.`);
    const ctx = root["@context"];
    const ctxStr = typeof ctx === "string" ? ctx : isObj(ctx) ? String(ctx["@vocab"] ?? "") : "";
    if (!/^https?:\/\/schema\.org\/?$/.test(ctxStr)) errors.push(`${where}: "@context" must be "https://schema.org".`);
    const nodes = Array.isArray(root["@graph"]) ? (root["@graph"] as unknown[]).filter(isObj) : [root];
    nodes.forEach((n, j) => {
      allTypes.push(...typesOf(n));
      checkNode(n, nodes.length > 1 ? `${where} @graph[${j}]` : where, errors, warnings);
    });
  });
  if (expectedType && !allTypes.includes(expectedType) && !(expectedType === "LocalBusiness" && allTypes.some((t) => LOCAL_BUSINESS_SUBTYPES.includes(t)))) {
    warnings.push(`Declared type is ${expectedType} but the JSON-LD contains ${allTypes.join(", ") || "no @type"}.`);
  }
  if (source.length > 100_000) errors.push("JSON-LD is larger than 100 KB.");
  return { valid: errors.length === 0, errors, warnings, types: allTypes };
}

/** Starter templates for the editor (organization data is filled in by the server). */
export function schemaTemplate(type: SchemaType, org: { name: string; url: string; logo: string; telephone: string; email: string; address: Record<string, string> }): string {
  const base = { "@context": "https://schema.org", "@type": type };
  const provider = { "@type": "Organization", name: org.name, url: org.url };
  const address = { "@type": "PostalAddress", ...org.address };
  const today = new Date().toISOString().slice(0, 10);
  const bodies: Record<SchemaType, Record<string, unknown>> = {
    Organization: { name: org.name, url: org.url, logo: org.logo, sameAs: [], contactPoint: { "@type": "ContactPoint", telephone: org.telephone, contactType: "customer service", email: org.email } },
    LocalBusiness: { name: org.name, url: org.url, image: org.logo, telephone: org.telephone, address, geo: { "@type": "GeoCoordinates", latitude: 0, longitude: 0 }, openingHoursSpecification: [{ "@type": "OpeningHoursSpecification", dayOfWeek: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"], opens: "09:00", closes: "18:00" }] },
    WebSite: { name: org.name, url: org.url, publisher: provider },
    WebPage: { name: "", url: org.url, description: "" },
    Article: { headline: "", description: "", image: org.logo, datePublished: today, dateModified: today, author: provider, publisher: { ...provider, logo: { "@type": "ImageObject", url: org.logo } } },
    BlogPosting: { headline: "", description: "", image: org.logo, datePublished: today, dateModified: today, author: provider, publisher: { ...provider, logo: { "@type": "ImageObject", url: org.logo } } },
    BreadcrumbList: { itemListElement: [{ "@type": "ListItem", position: 1, name: "Home", item: org.url }, { "@type": "ListItem", position: 2, name: "", item: `${org.url}/` }] },
    FAQPage: { mainEntity: [{ "@type": "Question", name: "", acceptedAnswer: { "@type": "Answer", text: "" } }] },
    Product: { name: "", description: "", image: org.logo, brand: { "@type": "Brand", name: org.name }, offers: { "@type": "Offer", price: "0", priceCurrency: "INR", availability: "https://schema.org/InStock" } },
    Service: { name: "", serviceType: "", description: "", provider, areaServed: { "@type": "Country", name: "India" } },
    Event: { name: "", startDate: `${today}T10:00:00+05:30`, endDate: `${today}T12:00:00+05:30`, eventStatus: "https://schema.org/EventScheduled", eventAttendanceMode: "https://schema.org/OnlineEventAttendanceMode", location: { "@type": "VirtualLocation", url: org.url }, organizer: provider, description: "" },
    JobPosting: { title: "", description: "", datePosted: today, validThrough: "", employmentType: "FULL_TIME", hiringOrganization: { ...provider, logo: org.logo }, jobLocation: { "@type": "Place", address } },
    Course: { name: "", description: "", provider, offers: { "@type": "Offer", category: "Paid" }, hasCourseInstance: { "@type": "CourseInstance", courseMode: "Online", courseWorkload: "P6W" } },
    Review: { itemReviewed: provider, reviewRating: { "@type": "Rating", ratingValue: 5, bestRating: 5 }, author: { "@type": "Person", name: "" }, reviewBody: "", datePublished: today },
  };
  return JSON.stringify({ ...base, ...bodies[type] }, null, 2);
}
