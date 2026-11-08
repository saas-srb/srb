import { blog, breadcrumbList, webPage } from "@/lib/platform/saas/jsonld";
import JsonLd from "@/components/platform/saas/JsonLd";
import { pageMeta } from "@/lib/platform/saas/seo-meta";
import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  Calendar,
  CheckCircle2,
  Clock,
  Sparkles,
  Tag,
} from "lucide-react";
import { POSTS, type BlogPost } from "@/lib/platform/saas/site";
import { PageHero, SectionHead } from "@/components/platform/saas/blocks";
import Reveal from "@/components/platform/saas/Reveal";
import PanelShot from "@/components/platform/saas/PanelShot";
import { marketingFor, screenFor } from "@/lib/platform/saas/screens";
import Icon from "@/components/platform/saas/Icon";
import type { IconKey } from "@/lib/platform/saas/content";

export const dynamic = "force-dynamic";

export const metadata: Metadata = pageMeta({ path: "/blog", title: "Blog and Guides for Running a Business", description: "Practical guides on lead management, payroll, invoicing, social media, websites and automation: how to run and grow a business with SelfRun AI.", keywords: ["business automation blog", "small business tips", "how to automate invoicing", "how to manage leads", "how to run payroll", "business productivity tips", "website for business guide", "social media planning guide", "SME growth guides"], tag: "Blog" });

/** Tag → module key + icon mapping for product pill badges. */
const TAG_META: Record<string, { key: string; icon: IconKey }> = {
  "Website Builder":    { key: "cms",         icon: "globe" },
  "Productivity":       { key: "workspace",    icon: "bolt" },
  "Finance & Billing":  { key: "fms",          icon: "wallet" },
  "Finance & Cash Flow": { key: "fms",         icon: "wallet" },
  "CRM & Sales":        { key: "lms",          icon: "target" },
  "HR & Payroll":       { key: "hrms",         icon: "users" },
  "HR & Talent":        { key: "hrms",         icon: "users" },
  "Social Media":       { key: "smms",         icon: "megaphone" },
  "Operations & SOPs":  { key: "sop",          icon: "book" },
  "SOPs & Docs":        { key: "sop",          icon: "book" },
  "AI & Support":       { key: "support",      icon: "chat" },
  "AI & Chatbots":      { key: "aibots",       icon: "bot" },
  "Project Management": { key: "pms",          icon: "layers" },
  "Procurement & Spend": { key: "prms",        icon: "cart" },
  "Procurement":        { key: "prms",         icon: "cart" },
  "AI Intelligence":    { key: "intelligence", icon: "brain" },
  "AI Analytics":       { key: "intelligence", icon: "brain" },
  "SEO & Growth":       { key: "seo",          icon: "search" },
  "SEO":                { key: "seo",          icon: "search" },
  "Security & Vault":   { key: "dlms",         icon: "lock" },
  "Document Security":  { key: "dlms",         icon: "lock" },
  "Online Tests":       { key: "ots",          icon: "check" },
  "Assessments":        { key: "ots",          icon: "check" },
  "Business Operations": { key: "workspace",   icon: "workflow" },
  "Automation":         { key: "workspace",    icon: "workflow" },
  "Training Management": { key: "tms",         icon: "graduation" },
  "Training":           { key: "tms",          icon: "graduation" },
  "Custom AI Bots":     { key: "aibots",       icon: "bot" },
  "AI Assistants":      { key: "aibots",       icon: "bot" },
  "Branding & Domains": { key: "website",      icon: "globe" },
  "Client Portal":      { key: "portal",       icon: "building" },
};

/** Derives the product module key from a shot key (e.g. "fms-invoices" → "fms"). */
function moduleKeyFrom(shot: string) {
  return shot.split("-")[0];
}

export default function BlogIndexPage() {
  const [featured, ...others] = POSTS;

  return (
    <>
      <JsonLd data={[webPage({ type: "CollectionPage", path: "/blog", name: "Blog", description: "Practical guides on lead management, payroll, invoicing, social media, websites and automation: how to run and grow a business with SelfRun AI." }), breadcrumbList([{ name: "Home", path: "/" }, { name: "Blog", path: "/blog" }]), blog({ path: "/blog", name: "SelfRun AI blog and guides", description: "Practical guides on running and growing a business.", posts: POSTS.map((x) => ({ title: x.title, path: `/blog/${x.slug}`, date: x.date, author: x.author, description: x.summary })) })]} />
      <PageHero
        eyebrow="Practical Business Guides"
        title="Simple, proven advice"
        accent="to run your business smarter."
        lead="Actionable guides, step-by-step tutorials, and productivity strategies anyone can follow. Written in clear, plain language with real product screenshots and zero fluff."
        photo="laptop-talk"
        shot="cms"
        shotName="SelfRun SiteCraft AI"
        chip={{
          title: "In-Depth Guides",
          text: "Actionable playbooks for every department",
        }}
        notes={[
          "Free forever plan",
          "Zero technical jargon",
          "Step-by-step instructions",
        ]}
      >
        <Link
          href="#guides"
          className="group inline-flex items-center gap-2 rounded-full bg-foreground px-7 py-3.5 text-sm font-bold text-background shadow-xl transition-all hover:scale-105"
        >
          Browse all guides{" "}
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
        </Link>
        <Link
          href="/signup"
          className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/70 px-7 py-3.5 text-sm font-bold text-foreground shadow-sm backdrop-blur transition-all hover:bg-muted"
        >
          Start free workspace
        </Link>
      </PageHero>

      <section id="guides" className="sr-section border-b border-border/50 py-16 lg:py-24">
        <div className="sr-container space-y-16">
          {/* ── Featured Post — Ultra-Modern Showcase Card ── */}
          {featured && (
            <Reveal className="group relative overflow-hidden rounded-[2.5rem] border border-border/70 bg-gradient-to-br from-card via-card/90 to-muted/30 p-6 shadow-2xl transition-all duration-500 hover:border-primary/50 sm:p-9 lg:p-12">
              {/* Ambient back-glow blob */}
              <div
                className="pointer-events-none absolute -inset-10 -z-10 rounded-[4rem] bg-gradient-to-br from-primary/15 via-transparent to-brand-accent/15 blur-3xl opacity-75 group-hover:opacity-100 transition-opacity duration-500"
                aria-hidden
              />

              {/* Top ambient highlight line */}
              <div className="pointer-events-none absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-primary/60 to-transparent" />

              <div className="grid items-center gap-10 lg:grid-cols-12 lg:gap-14">
                {/* Left: Text & Highlights */}
                <div className="space-y-6 lg:col-span-6">
                  <div className="flex flex-wrap items-center gap-3 text-xs font-semibold">
                    {/* Pulsing featured badge */}
                    <span className="inline-flex items-center gap-2 rounded-full bg-primary/15 border border-primary/30 px-3.5 py-1 text-xs font-bold text-primary shadow-sm backdrop-blur">
                      <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
                      </span>
                      Featured Guide
                    </span>

                    <span className="inline-flex items-center gap-1.5 rounded-full bg-muted/70 px-3 py-1 text-muted-foreground border border-border/40">
                      <Tag className="h-3 w-3 text-primary" />
                      {featured.tag}
                    </span>

                    <span className="inline-flex items-center gap-1 text-muted-foreground">
                      <Calendar className="h-3.5 w-3.5" />
                      {featured.date}
                    </span>

                    <span className="inline-flex items-center gap-1 text-muted-foreground">
                      <Clock className="h-3.5 w-3.5" />
                      {featured.readMinutes} min read
                    </span>
                  </div>

                  <h2 className="text-2xl font-black tracking-tight sm:text-3xl lg:text-4xl text-foreground">
                    <Link
                      href={`/blog/${featured.slug}`}
                      className="transition-colors hover:text-primary"
                    >
                      {featured.title}
                    </Link>
                  </h2>

                  <p className="text-base leading-relaxed text-muted-foreground sm:text-lg">
                    {featured.summary}
                  </p>

                  {/* Key Takeaways Highlights */}
                  {featured.keyTakeaways && featured.keyTakeaways.length > 0 && (
                    <ul className="space-y-2.5 pt-1">
                      {featured.keyTakeaways.slice(0, 2).map((point, i) => (
                        <li key={i} className="flex items-start gap-2.5 text-sm text-foreground/85">
                          <CheckCircle2 className="h-4 w-4 shrink-0 text-primary mt-0.5" />
                          <span>{point}</span>
                        </li>
                      ))}
                    </ul>
                  )}

                  <div className="pt-2 flex flex-wrap items-center gap-4">
                    <Link
                      href={`/blog/${featured.slug}`}
                      className="group/btn inline-flex items-center gap-2 rounded-full bg-primary px-7 py-3.5 text-sm font-bold text-primary-foreground shadow-lg shadow-primary/25 transition-all hover:gap-3 hover:bg-primary/90 hover:scale-105"
                    >
                      Read full playbook
                      <ArrowRight className="h-4 w-4 transition-transform group-hover/btn:translate-x-1" />
                    </Link>
                    <span className="text-xs font-medium text-muted-foreground">
                      By {featured.author} · Step-by-step
                    </span>
                  </div>
                </div>

                {/* Right: Featured Screen Visual Window */}
                <div className="lg:col-span-6">
                  <div className="relative overflow-hidden rounded-[2rem] border border-border/70 bg-card/60 p-2 shadow-2xl shadow-primary/20 ring-1 ring-border/60 backdrop-blur-md transition-transform duration-700 group-hover:scale-[1.015]">
                    {/* Window Titlebar */}
                    <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/40 bg-muted/50 rounded-t-xl text-xs">
                      <div className="flex items-center gap-1.5">
                        <span className="h-2.5 w-2.5 rounded-full bg-rose-400/90" />
                        <span className="h-2.5 w-2.5 rounded-full bg-amber-400/90" />
                        <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/90" />
                      </div>
                      <span className="text-[11px] font-mono text-muted-foreground truncate max-w-[200px]">
                        selfrun.com/blog/{featured.slug}
                      </span>
                      <span className="text-[11px] font-semibold text-primary">Live Screen</span>
                    </div>

                    <div className="relative aspect-[16/10] overflow-hidden rounded-b-xl bg-background">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={
                          screenFor(featured.shot) ||
                          marketingFor(featured.shot) ||
                          `/selfrun/photos/${featured.photo}.jpg`
                        }
                        alt={featured.title}
                        className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
                        style={{ transform: "scale(1.04)" }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </Reveal>
          )}

          {/* ── All Guides Grid ── */}
          <div>
            <SectionHead
              eyebrow="Knowledge & Tutorials"
              title="All Published"
              accent="Guides & Articles"
              lead="Explore practical instructions for website building, invoice automation, lead generation, payroll processing, SOP writing, and company operations."
            />

            <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
              {others.map((post, idx) => {
                const moduleKey = moduleKeyFrom(post.shot);
                const marketingSrc = marketingFor(post.shot) ?? marketingFor(moduleKey);
                const screenSrc = screenFor(post.shot) ?? screenFor(moduleKey);
                const meta = TAG_META[post.tag];
                const pillIcon: IconKey = meta?.icon ?? "bolt";

                return (
                  <Reveal key={post.slug} delay={(idx % 3) * 60}>
                    <article className="group relative flex h-full flex-col rounded-[2rem] border border-border/70 bg-gradient-to-b from-card via-card/95 to-muted/20 backdrop-blur-xl shadow-md transition-all duration-500 hover:-translate-y-2 hover:border-primary/50 hover:shadow-[0_24px_50px_-12px_rgba(79,70,229,0.2)] overflow-hidden">
                      {/* Top ambient highlight line on hover */}
                      <div className="pointer-events-none absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-primary/50 to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100 z-20" />

                      {/* Ambient hover glow */}
                      <span
                        className="pointer-events-none absolute -inset-6 -z-10 rounded-[3rem] bg-gradient-to-br from-primary/20 via-transparent to-brand-accent/20 opacity-0 blur-2xl transition-opacity duration-500 group-hover:opacity-100"
                        aria-hidden
                      />

                      {/* Visual Mockup Chamber */}
                      <div className="p-3.5 pb-0">
                        <div className="relative overflow-hidden rounded-2xl border border-border/50 bg-muted/20 shadow-sm transition-all group-hover:border-primary/30">
                          {/* Browser Mockup Top Bar */}
                          <div className="flex items-center justify-between px-3 py-2 border-b border-border/40 bg-muted/50 backdrop-blur-md text-[11px]">
                            <div className="flex items-center gap-1.5">
                              <span className="h-2 w-2 rounded-full bg-rose-400/80" />
                              <span className="h-2 w-2 rounded-full bg-amber-400/80" />
                              <span className="h-2 w-2 rounded-full bg-emerald-400/80" />
                            </div>

                            {/* Tag Pill with Icon */}
                            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-background/90 border border-border/50 font-semibold text-foreground text-[10.5px] shadow-sm">
                              <Icon name={pillIcon} className="h-3 w-3 text-primary" />
                              <span className="truncate max-w-[130px]">{post.tag}</span>
                            </div>

                            {/* Read Time */}
                            <div className="flex items-center gap-1 text-[10.5px] font-medium text-muted-foreground">
                              <Clock className="h-3 w-3" />
                              <span>{post.readMinutes}m</span>
                            </div>
                          </div>

                          {/* Image Screen Preview */}
                          <Link
                            href={`/blog/${post.slug}`}
                            className="relative aspect-[16/10] block overflow-hidden bg-muted/30"
                            tabIndex={-1}
                          >
                            {marketingSrc ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={marketingSrc}
                                alt={`${post.title} — preview`}
                                loading="lazy"
                                decoding="async"
                                className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-105"
                                style={{ transform: "scale(1.15)", transformOrigin: "50% 48%" }}
                              />
                            ) : screenSrc ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={screenSrc}
                                alt={`${post.title} — preview`}
                                loading="lazy"
                                decoding="async"
                                className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-105"
                                style={{ transform: "scale(1.08)", transformOrigin: "50% 48%" }}
                              />
                            ) : (
                              <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-primary/[0.07] via-background to-brand-accent/[0.07] p-4">
                                <PanelShot moduleKey={moduleKey} name={post.tag} labels={[]} />
                              </div>
                            )}

                            {/* Soft bottom vignette */}
                            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-black/20 to-transparent" />
                          </Link>
                        </div>
                      </div>

                      {/* Card Content Chamber */}
                      <div className="flex flex-1 flex-col justify-between p-6">
                        <div className="space-y-3">
                          {/* Date & Author Header */}
                          <div className="flex items-center justify-between text-xs text-muted-foreground">
                            <span className="inline-flex items-center gap-1.5 font-medium">
                              <Calendar className="h-3.5 w-3.5 text-muted-foreground/80" />
                              {post.date}
                            </span>
                            <span className="inline-flex items-center gap-1 rounded-full bg-muted/60 px-2.5 py-0.5 text-[11px] font-semibold text-muted-foreground">
                              {post.author}
                            </span>
                          </div>

                          {/* Title */}
                          <h3 className="text-xl font-bold tracking-tight leading-snug text-foreground transition-colors duration-300 group-hover:text-primary line-clamp-2">
                            <Link href={`/blog/${post.slug}`} className="hover:underline">
                              {post.title}
                            </Link>
                          </h3>

                          {/* Summary */}
                          <p className="line-clamp-2 text-sm leading-relaxed text-muted-foreground">
                            {post.summary}
                          </p>

                          {/* Key Takeaway snippet pill */}
                          {post.keyTakeaways?.[0] && (
                            <div className="flex items-start gap-2 rounded-xl border border-border/40 bg-muted/30 p-2.5 text-xs text-muted-foreground">
                              <Sparkles className="h-3.5 w-3.5 shrink-0 text-primary mt-0.5" />
                              <span className="line-clamp-1">{post.keyTakeaways[0]}</span>
                            </div>
                          )}
                        </div>

                        {/* Card Footer Action */}
                        <div className="mt-5 pt-4 border-t border-border/50 flex items-center justify-between">
                          <Link
                            href={`/blog/${post.slug}`}
                            className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-primary transition-all group-hover:gap-2"
                          >
                            Read guide
                          </Link>

                          <Link
                            href={`/blog/${post.slug}`}
                            aria-label={`Read ${post.title}`}
                            className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary transition-all duration-300 group-hover:bg-primary group-hover:text-primary-foreground group-hover:translate-x-1 group-hover:shadow-md group-hover:shadow-primary/30"
                          >
                            <ArrowUpRight className="h-4 w-4" />
                          </Link>
                        </div>
                      </div>
                    </article>
                  </Reveal>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* ── Free Forever CTA Band ── */}
      <section className="sr-section py-16 lg:py-20">
        <div className="sr-container text-center">
          <div className="relative mx-auto max-w-4xl overflow-hidden rounded-[2.5rem] border border-border/50 bg-gradient-to-br from-primary/15 via-background to-brand-accent/15 p-8 shadow-2xl sm:p-14">
            <h2 className="text-3xl font-black tracking-tight sm:text-4xl">
              Ready to automate your business operations?
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-base text-muted-foreground sm:text-lg">
              Get started with SelfRun AI today. Free forever plan includes every product, every feature, and your own live website.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
              <Link
                href="/signup"
                className="inline-flex items-center gap-2 rounded-full bg-primary px-8 py-3.5 text-base font-bold text-primary-foreground shadow-lg transition-transform hover:scale-105"
              >
                Start free today <ArrowRight className="h-5 w-5" />
              </Link>
              <Link
                href="/contact"
                className="inline-flex items-center gap-2 rounded-full border border-border bg-background/80 px-8 py-3.5 text-base font-bold text-foreground transition-all hover:bg-muted"
              >
                Talk to our team
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
