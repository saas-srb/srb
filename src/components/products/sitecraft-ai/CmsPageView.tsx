import SectionRenderer from "@/components/products/sitecraft-ai/SectionRenderer";
import { jsonForScript } from "@/lib/security/json-script";
import { getRuntimeRecords } from "@/lib/products/sitecraft-ai/collections/store";
import { jsonLdNeeds, resolveJsonLd } from "@/lib/products/sitecraft-ai/json-ld-generators";
import type { PublicPage } from "@/lib/products/sitecraft-ai/public";
import { companySiteUrl } from "@/lib/platform/tenancy/site-url";
import type { BlogPostMeta } from "@/types/content";
import type { Job } from "@/types/content";
import type { EngagementCategory } from "@/types/content";
import type { ProductItem } from "@/types/content";

/**
 * Renders a published CMS page: its structured data (JSON-LD) and its
 * sections inside the page's frame. Everything shown comes from the CMS page
 * (and, for record-driven JSON-LD, the live collection records); this
 * component only decides markup.
 */
export default async function CmsPageView({
  page,
  runtimeProps,
  wrapSections = (node) => node,
}: {
  page: PublicPage;
  /** Request-time props for specific section types (see SectionRenderer). */
  runtimeProps?: Record<string, Record<string, unknown>>;
  /** e.g. a page-scoped context provider around the sections. */
  wrapSections?: (node: React.ReactNode) => React.ReactNode;
}) {
  const needs = jsonLdNeeds(page.jsonLd);
  const none = Promise.resolve([]);
  const [siteUrl, blog, jobs, engagement, products] = await Promise.all([
    companySiteUrl(),
    needs.blog ? getRuntimeRecords<BlogPostMeta>("blog") : none,
    needs.jobs ? getRuntimeRecords<Job>("jobs") : none,
    needs.engagement ? getRuntimeRecords<EngagementCategory>("engagement") : none,
    needs.products ? getRuntimeRecords<ProductItem>("products") : none,
  ]);
  const jsonLd = resolveJsonLd(page.jsonLd, {
    siteUrl,
    path: page.path,
    description: page.seo?.description ?? "",
    sections: page.sections,
    blog: blog as BlogPostMeta[],
    jobs: jobs as Job[],
    engagement: engagement as EngagementCategory[],
    products: products as ProductItem[],
  });
  const scripts = jsonLd.map((schema, i) => (
    <script key={i} type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonForScript(schema) }} />
  ));
  const sections = wrapSections(<SectionRenderer sections={page.sections} runtimeProps={runtimeProps} />);

  switch (page.frame) {
    case "accent":
      return (
        <>
          {scripts}
          <div className="flex flex-col min-h-screen selection:bg-primary/30 overflow-hidden">{sections}</div>
        </>
      );
    case "form":
      return (
        <>
          {scripts}
          <div className="flex min-h-screen flex-col overflow-hidden">{sections}</div>
        </>
      );
    case "plain":
      return (
        <div className="flex flex-col min-h-screen pt-16 bg-background">
          {scripts}
          {sections}
        </div>
      );
    case "none":
      return (
        <>
          {scripts}
          {sections}
        </>
      );
    default:
      return (
        <>
          {scripts}
          <div className="flex flex-col min-h-screen overflow-hidden">{sections}</div>
        </>
      );
  }
}
