import { breadcrumbList, itemList, webPage } from "@/lib/platform/saas/jsonld";
import JsonLd from "@/components/platform/saas/JsonLd";
import { pageMeta } from "@/lib/platform/saas/seo-meta";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { AI_CAPABILITIES, INTEGRATIONS, SECURITY_POINTS } from "@/lib/platform/saas/content";
import { getFeatureGroups } from "@/lib/platform/saas/modules";
import { PANEL_VALUE, featureCount } from "@/lib/platform/saas/feature-lists";
import { YOUR_BRAND } from "@/lib/platform/saas/site";
import { CtaBand, HeroCtas, PageHero, SectionHead } from "@/components/platform/saas/blocks";
import FaqSection from "@/components/platform/saas/FaqSection";
import Icon from "@/components/platform/saas/Icon";
import Reveal from "@/components/platform/saas/Reveal";
import type { IconKey } from "@/lib/platform/saas/content";
import ProductCatalog from "@/components/platform/saas/catalog/ProductCatalog";
import { productShort } from "@/lib/platform/saas/product-short";
import { productPath } from "@/lib/platform/saas/product-routes";

export const dynamic = "force-dynamic";
export const metadata: Metadata = pageMeta({ path: "/products", title: "SelfRun AI Features: CRM, HR, Accounting, Projects & More", description: "See everything SelfRun AI does, product by section: customers and sales, HR and payroll, accounting, projects, purchasing, training, documents, AI, SEO and a website builder. Free to start.", keywords: ["business software products", "CRM software", "HR and payroll software", "accounting software", "project management software", "procurement software", "helpdesk software", "website builder", "AI chatbot for business", "SEO software", "contract management software", "online test software"], tag: "Products" });

function IconList({
  items,
}: {
  items: { title: string; body: string; icon: IconKey }[];
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((x, i) => (
        <Reveal key={x.title} delay={(i % 3) * 70}>
          <div className="group relative h-full overflow-hidden rounded-2xl border border-border/60 bg-card p-5 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-primary/40 hover:shadow-xl hover:shadow-primary/10">
            <span className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-primary to-brand-accent opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
            <Icon name={x.icon} className="pointer-events-none absolute -bottom-5 -right-5 h-24 w-24 text-primary/[0.07] transition-transform duration-500 group-hover:scale-110" />
            <span className="sr-icon relative mb-4 h-12 w-12 rounded-2xl transition-transform group-hover:scale-110">
              <Icon name={x.icon} className="h-5 w-5" />
            </span>
            <h3 className="relative text-base font-black leading-snug">{x.title}</h3>
            <p className="relative mt-1.5 text-sm leading-relaxed text-muted-foreground">{x.body}</p>
          </div>
        </Reveal>
      ))}
    </div>
  );
}

/** Everyday jobs, each pointing at the section that does it. */
const WANTS: { key: string; text: string }[] = [
  { key: "lms", text: "Keep track of customers and sales enquiries" },
  { key: "hrms", text: "Manage staff, attendance, leave and salaries" },
  { key: "fms", text: "Send invoices, record payments and see my accounts" },
  { key: "pms", text: "Plan projects, give out tasks and track hours" },
  { key: "prms", text: "Control what I buy and what my business owns" },
  { key: "tms", text: "Run courses, batches and certificates" },
  { key: "ots", text: "Test candidates, staff or students online" },
  { key: "messenger", text: "Chat with my team and hold meetings" },
  { key: "sop", text: "Write procedures and check that people have read them" },
  { key: "lpms", text: "Create agreements and get documents signed" },
  { key: "dlms", text: "Store passwords and important files safely" },
  { key: "aibots", text: "Build an AI assistant on my own documents" },
  { key: "intelligence", text: "Ask questions about my business and get answers" },
  { key: "smms", text: "Plan and publish social media posts" },
  { key: "seo", text: "Get found on Google and fix website problems" },
  { key: "cms", text: "Build and update my website" },
  { key: "portal", text: "Give customers or students a page of their own" },
  { key: "support", text: "Answer customer questions and handle support requests" },
  { key: "workspace", text: "Manage users, access, settings and automations" },
];

export default async function ProductsPage() {
  const groups = await getFeatureGroups();
  const all = groups.flatMap((g) => g.items);

  return (
    <>
      <JsonLd data={[webPage({ type: "CollectionPage", path: "/products", name: "Products", description: "See everything SelfRun AI does, product by section: customers and sales, HR and payroll, accounting, projects, purchasing, training, documents, AI, SEO and a website builder. Free to start." }), breadcrumbList([{ name: "Home", path: "/" }, { name: "Products", path: "/products" }]), itemList({ name: "SelfRun AI products", items: all.map((m) => ({ name: m.name, path: productPath(m.key) })) })]} />
      <PageHero
        art="features"
        eyebrow="Every product · every feature included"
        title="Everything SelfRun AI does,"
        accent="product by product."
        lead="SelfRun AI is one software for your whole business. It is made of products, one for each job: customers and sales, staff and payroll, invoices and accounts, projects, buying, training, documents, your website and more. Browse them below and open any product to see exactly what it does. Use only the ones you need. Every product and every feature is included in every plan."
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
        afterWall={(
          <section id="find" className="sr-section border-b border-border/50" style={{ scrollMarginTop: 140 }}>
            <div className="sr-container">
              <SectionHead icon="search" eyebrow="Find the right product" title="Start with the job" accent="you want done." lead="Not sure where to look? Pick the sentence that sounds like your problem and open that product. Every product is explained in full further down this page." />
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {WANTS.flatMap((w) => {
                  const m = all.find((x) => x.key === w.key);
                  return m ? [(
                    <Reveal key={w.key}>
                      <Link href={productPath(w.key)} className="group flex h-full flex-col rounded-3xl border border-border/60 bg-card p-5 shadow-sm transition-all hover:-translate-y-1 hover:border-primary/40 hover:shadow-xl hover:shadow-primary/10">
                        <span className="text-xs font-bold uppercase tracking-[0.16em] text-primary">I want to</span>
                        <span className="mt-1 text-lg font-black leading-snug">{w.text}</span>
                        <span className="mt-3 inline-flex items-center gap-1.5 text-sm font-bold text-muted-foreground group-hover:text-primary">Open {m.name.replace(/^SelfRun\s+/i, "")} <ArrowRight className="h-4 w-4" /></span>
                      </Link>
                    </Reveal>
                  )] : [];
                })}
              </div>
            </div>
          </section>
        )}
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

      {/* Platform & Across Every Product */}
      <section
        id="platform"
        className="sr-section border-t border-border/50"
        style={{ scrollMarginTop: 140 }}
      >
        <div className="sr-container space-y-24">
          <div>
            <SectionHead
              icon="brain"
              eyebrow="Across every product"
              title="AI built into"
              accent="the whole software."
              lead="Ask questions about your data, build assistants on your own documents, put an AI chatbot on your website, draft social posts and use AI steps in automatic workflows. The AI only shows each person what they are allowed to see, its answers show how they were worked out, and AI usage is counted per plan."
            />
            <IconList items={AI_CAPABILITIES} />
          </div>
          <div>
            <SectionHead
              icon="target"
              eyebrow="Your brand"
              title="Your business name,"
              accent="everywhere."
              lead="Your team, your customers and your website visitors see your business, not SelfRun. Every item below is a real setting inside your workspace."
            />
            <IconList
              items={YOUR_BRAND.map((b) => ({
                title: b.title,
                body: b.text,
                icon: b.icon,
              }))}
            />
          </div>
          <div>
            <SectionHead
              icon="plug"
              eyebrow="Connect other services"
              title="Works with what"
              accent="you already use."
              lead="Connect your payments, email, social media accounts and AI account, and move your data in and out with spreadsheet (CSV) files."
            />
            <IconList
              items={INTEGRATIONS.map((x) => ({
                title: x.name,
                body: x.body,
                icon: x.icon,
              }))}
            />
          </div>
          <div>
            <SectionHead
              icon="shield"
              eyebrow="Safety"
              title="Control and protection"
              accent="built in."
              lead="Who can see what, a record of every action and encrypted storage are part of every product."
            />
            <IconList items={SECURITY_POINTS} />
            <Link href="/security" className="sr-link mt-10">
              Read how security and trust work <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

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
