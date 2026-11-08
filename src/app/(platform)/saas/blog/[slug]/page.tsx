import { article, breadcrumbList } from "@/lib/platform/saas/jsonld";
import JsonLd from "@/components/platform/saas/JsonLd";
import { pageMeta } from "@/lib/platform/saas/seo-meta";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Calendar,
  CheckCircle2,
  ChevronRight,
  Clock,
  Sparkles,
  Tag,
  User,
} from "lucide-react";
import { POSTS, type BlogPost } from "@/lib/platform/saas/site";
import { HeroCtas, PageHero } from "@/components/platform/saas/blocks";
import { screenFor } from "@/lib/platform/saas/screens";
import BlogSidebar from "@/components/platform/saas/BlogSidebar";
import ScrollToTop from "@/components/platform/saas/product/ScrollToTop";
import Reveal from "@/components/platform/saas/Reveal";
import DeviceScene, { type SceneVariant } from "@/components/platform/saas/DeviceScene";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = POSTS.find((p) => p.slug === slug);
  if (!post) return { title: "Blog Post Not Found" };

  return pageMeta({
    path: `/blog/${post.slug}`,
    title: post.title,
    description: post.summary,
    keywords: [post.title.toLowerCase(), post.tag, `${post.tag} guide`, `${post.tag} tips`, "business guide", ...post.keyTakeaways.slice(0, 3).map((k) => k.toLowerCase().slice(0, 60))],
    tag: post.tag,
    type: "article",
    publishedTime: post.date,
    authors: [post.author],
    section: post.tag,
  });
}

export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const postIndex = POSTS.findIndex((p) => p.slug === slug);
  if (postIndex === -1) notFound();

  const post = POSTS[postIndex];
  const nextPost = POSTS[(postIndex + 1) % POSTS.length];
  const prevPost = POSTS[(postIndex - 1 + POSTS.length) % POSTS.length];
  const variant = (postIndex % 6) as SceneVariant;
  const sidebarPosts = POSTS.map((p) => ({ slug: p.slug, title: p.title, tag: p.tag, readMinutes: p.readMinutes }));

  return (
    <article className="min-h-screen bg-background">
      <JsonLd data={[
        article({ path: `/blog/${post.slug}`, title: post.title, description: post.summary, date: post.date, author: post.author, section: post.tag, image: `/og?title=${encodeURIComponent(post.title.slice(0, 90))}&tag=${encodeURIComponent(post.tag)}`, keywords: [post.tag] }),
        breadcrumbList([{ name: "Home", path: "/" }, { name: "Blog", path: "/blog" }, { name: post.title, path: `/blog/${post.slug}` }]),
      ]} />
      <ScrollToTop pageKey={post.slug} />
      {/* Hero Banner: Exactly matches all other site pages (features, pricing, docs, about) */}
      <PageHero
        eyebrow={`${post.tag} · ${post.readMinutes} min read`}
        title={post.title}
        lead={post.summary}
        photo={post.photo}
        shot={post.shot}
        shotName={post.title}
        chip={{ title: `${post.readMinutes} min practical read`, text: `Published on ${post.date}` }}
        notes={[`Written by ${post.author}`, "Zero fluff & 100% practical", "Verified product workflows"]}
      >
        <HeroCtas />
        <Link
          href="/blog"
          className="group inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/80 px-5 py-3 text-xs font-bold text-foreground shadow-sm backdrop-blur transition-all hover:bg-muted"
        >
          <ArrowLeft className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-1" />
          All Guides
        </Link>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-4 py-2.5 text-xs font-bold text-primary">
          <Tag className="h-3.5 w-3.5" />
          {post.tag}
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-muted/60 px-4 py-2.5 text-xs font-semibold text-muted-foreground">
          <Clock className="h-3.5 w-3.5" />
          {post.readMinutes} min read
        </span>
      </PageHero>

      {/* Main Layout: Left Sidebar + Article Body */}
      <div className="sr-container max-w-7xl py-12 lg:py-16">
        <div data-hop-target className="grid grid-cols-1 items-start gap-10 md:grid-cols-12 lg:gap-12">
          {/* Left Sidebar: sticky */}
          <aside className="md:col-span-5 lg:col-span-4 md:sticky md:top-28 md:self-start" aria-label="All guides">
            <details className="group rounded-2xl border border-border/60 bg-card shadow-sm md:hidden">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3.5 text-sm font-black">All guides<span className="text-xs font-bold text-primary group-open:hidden">Tap to browse</span></summary>
              <div className="border-t border-border/60 p-2"><BlogSidebar posts={sidebarPosts} activeSlug={post.slug} /></div>
            </details>
            <div className="hidden md:block"><BlogSidebar posts={sidebarPosts} activeSlug={post.slug} /></div>
          </aside>

          {/* Main Article Content */}
          <main className="md:col-span-7 lg:col-span-8 xl:col-span-8 min-w-0">
            {/* Device Scene Image */}
            {screenFor(post.shot) && (
              <Reveal className="mb-12">
                <DeviceScene screenKey={post.shot} name={post.title} variant={variant} priority />
              </Reveal>
            )}

            {/* Key Takeaways Box */}
            {post.keyTakeaways && post.keyTakeaways.length > 0 && (
              <Reveal className="mb-10 rounded-3xl border border-primary/20 bg-primary/5 p-6 shadow-sm sm:p-8">
                <h3 className="mb-4 flex items-center gap-2 text-lg font-bold text-primary">
                  <Sparkles className="h-5 w-5" />
                  Key Takeaways
                </h3>
                <ul className="space-y-3">
                  {post.keyTakeaways.map((item, i) => (
                    <li
                      key={i}
                      className="flex items-start gap-3 text-sm text-foreground/90 sm:text-base"
                    >
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </Reveal>
            )}

            {/* Article Sections */}
            <div className="space-y-12">
              {post.sections.map((section, idx) => (
                <Reveal key={idx} delay={idx * 40} className="space-y-4">
                  <h2 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                    {section.heading}
                  </h2>
                  <div className="space-y-4 text-base leading-relaxed text-muted-foreground sm:text-lg">
                    {section.body.map((p, pIdx) => (
                      <p key={pIdx}>{p}</p>
                    ))}
                  </div>
                </Reveal>
              ))}
            </div>

            {/* Author Bio Card */}
            <div className="mt-14 rounded-3xl border border-border/50 bg-muted/20 p-6 sm:p-8">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/15 text-primary">
                  <User className="h-6 w-6" />
                </div>
                <div>
                  <h4 className="text-base font-bold text-foreground">
                    Written by {post.author}
                  </h4>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    SelfRun AI offers independent products for your website, leads, project delivery, payroll, and finance, managed as a suite under your own brand.
                  </p>
                </div>
              </div>
            </div>

            {/* Next and Previous CTA with Full Blog Titles */}
            <div className="mt-12 space-y-4 border-t border-border/50 pt-8">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Continue Reading
                </span>
                <Link
                  href="/blog"
                  className="text-xs font-semibold text-primary transition-colors hover:underline"
                >
                  View all articles
                </Link>
              </div>

              <div className="grid gap-5 sm:grid-cols-2">
                {/* Previous Blog Post CTA */}
                {prevPost && (
                  <Link
                    data-product-link
                    href={`/blog/${prevPost.slug}`}
                    className="group relative flex flex-col justify-between rounded-2xl border border-border/60 bg-card p-5 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-primary/50 hover:bg-muted/10 hover:shadow-lg"
                  >
                    <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-primary">
                      <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-1" />
                      <span>Previous Guide</span>
                    </div>

                    <div className="my-3">
                      <span className="text-[11px] font-semibold text-muted-foreground">
                        {prevPost.tag} • {prevPost.readMinutes} min read
                      </span>
                      <h4 className="mt-1 text-base font-bold leading-snug text-foreground transition-colors group-hover:text-primary">
                        {prevPost.title}
                      </h4>
                    </div>

                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground group-hover:text-primary">
                      Read article <ChevronRight className="h-3 w-3" />
                    </span>
                  </Link>
                )}

                {/* Next Blog Post CTA */}
                {nextPost && (
                  <Link
                    data-product-link
                    href={`/blog/${nextPost.slug}`}
                    className="group relative flex flex-col justify-between rounded-2xl border border-border/60 bg-card p-5 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-primary/50 hover:bg-muted/10 hover:shadow-lg sm:text-right"
                  >
                    <div className="flex items-center justify-start sm:justify-end gap-2 text-xs font-bold uppercase tracking-wider text-primary">
                      <span>Next Guide</span>
                      <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                    </div>

                    <div className="my-3">
                      <span className="text-[11px] font-semibold text-muted-foreground">
                        {nextPost.tag} • {nextPost.readMinutes} min read
                      </span>
                      <h4 className="mt-1 text-base font-bold leading-snug text-foreground transition-colors group-hover:text-primary">
                        {nextPost.title}
                      </h4>
                    </div>

                    <span className="inline-flex items-center justify-start sm:justify-end gap-1 text-xs font-semibold text-muted-foreground group-hover:text-primary">
                      Read article <ChevronRight className="h-3 w-3" />
                    </span>
                  </Link>
                )}
              </div>
            </div>

            {/* Bottom Free Signup CTA */}
            <div className="mt-14 overflow-hidden rounded-[2rem] border border-border/50 bg-gradient-to-br from-primary/15 via-background to-brand-accent/15 p-8 text-center shadow-xl sm:p-10">
              <h3 className="text-2xl font-black tracking-tight sm:text-3xl">
                Start automating your business with SelfRun AI
              </h3>
              <p className="mx-auto mt-2 max-w-lg text-sm text-muted-foreground">
                Every product included on our free plan. Launch your website, manage your sales pipeline, and run payroll with zero complexity.
              </p>
              <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                <Link
                  href="/signup"
                  className="inline-flex items-center gap-2 rounded-full bg-primary px-7 py-2.5 text-sm font-bold text-primary-foreground shadow-md transition-transform hover:scale-105"
                >
                  Get started free <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  href="/blog"
                  className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-6 py-2.5 text-sm font-bold text-foreground transition-all hover:bg-muted"
                >
                  Browse all guides
                </Link>
              </div>
            </div>
          </main>
        </div>
      </div>
    </article>
  );
}
