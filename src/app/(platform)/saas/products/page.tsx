import { breadcrumbList, itemList, webPage } from "@/lib/platform/saas/jsonld";
import JsonLd from "@/components/platform/saas/JsonLd";
import { pageMeta } from "@/lib/platform/saas/seo-meta";
import type { Metadata } from "next";
import { getFeatureGroups } from "@/lib/platform/saas/modules";
import { PANEL_VALUE, featureCount } from "@/lib/platform/saas/feature-lists";
import { CtaBand, HeroCtas, PageHero } from "@/components/platform/saas/blocks";
import FaqSection from "@/components/platform/saas/FaqSection";
import ProductCatalog from "@/components/platform/saas/catalog/ProductCatalog";
import { productShort } from "@/lib/platform/saas/product-short";
import { productPath } from "@/lib/platform/saas/product-routes";

export const dynamic = "force-dynamic";
export const metadata: Metadata = pageMeta({ path: "/products", title: "SRB AI Features: CRM, HR, Accounting, Projects & More", description: "See everything SRB AI does, product by section: customers and sales, HR and payroll, accounting, projects, purchasing, training, documents, AI, SEO and a website builder. Free to start.", keywords: ["business software products", "CRM software", "HR and payroll software", "accounting software", "project management software", "procurement software", "helpdesk software", "website builder", "AI chatbot for business", "SEO software", "contract management software", "online test software"], tag: "Products" });

export default async function ProductsPage() {
  const groups = await getFeatureGroups();
  const all = groups.flatMap((g) => g.items);

  return (
    <>
      <JsonLd data={[webPage({ type: "CollectionPage", path: "/products", name: "Products", description: "See everything SRB AI does, product by section: customers and sales, HR and payroll, accounting, projects, purchasing, training, documents, AI, SEO and a website builder. Free to start." }), breadcrumbList([{ name: "Home", path: "/" }, { name: "Products", path: "/products" }]), itemList({ name: "SRB AI products", items: all.map((m) => ({ name: m.name, path: productPath(m.key) })) })]} />
      <PageHero
        art="features"
        eyebrow="Every product · every feature included"
        title="Everything SRB AI does,"
        accent="product by product."
        lead="SRB AI is one software for your whole business. It is made of products, one for each job: customers and sales, staff and payroll, invoices and accounts, projects, buying, training, documents, your website and more. Browse them below and open any product to see exactly what it does. Use only the ones you need. Every product and every feature is included in every plan."
        photo="analytics"
        shot="workspace"
        chip={{
          title: "Every product included",
          text: "Every feature is free to start, no card needed",
        }}
      >
        <HeroCtas />
      </PageHero>

      <ProductCatalog
        groups={groups.map((g) => ({ id: g.id, title: g.title, lead: g.lead }))}
        products={groups.flatMap((g) =>
          g.items.map((m) => ({
            key: m.key,
            name: m.name,
            short: productShort(m.key, m.summary),
            headline: m.headline,
            summary: m.summary,
            group: g.id,
            features: featureCount(m.key) || m.capabilities.length,
            replaces: PANEL_VALUE[m.key]?.replaces,
            benefits: PANEL_VALUE[m.key]?.benefits ?? m.capabilities,
            href: productPath(m.key),
            docsHref: `/docs#${m.key}`,
          })),
        )}
      />

      <CtaBand />
      <FaqSection
        topics={[
          "AI & automation",
          "Your brand",
          "Apps & devices",
          "Data & security",
          "Setup",
        ]}
        limit={7}
        title="Questions about"
        accent="what is inside."
        lead="How the products, AI and automation, your own brand and apps, devices and your data work."
      />
    </>
  );
}
