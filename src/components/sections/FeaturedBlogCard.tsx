"use client";

import Link from "next/link";
import Image from "next/image";
import { motion } from "framer-motion";
import { ArrowRight, Calendar, Clock, Sparkles, CheckCircle2 } from "lucide-react";
import type { BlogPostMeta } from "@/types/content";
import DynamicIcon from "@/components/products/sitecraft-ai/DynamicIcon";
import { useUiLabels } from "@/components/products/sitecraft-ai/SiteInfoContext";

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

export default function FeaturedBlogCard({ post }: { post: BlogPostMeta }) {
  const l = useUiLabels();

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-50px" }}
      transition={{ duration: 0.6 }}
      className="group/featured relative"
    >
      <div className="absolute -inset-1 rounded-[2.75rem] bg-gradient-to-br from-primary/30 via-primary/0 to-secondary/30 opacity-0 group-hover/featured:opacity-100 blur-2xl transition-opacity duration-500 pointer-events-none" />

      <Link
        href={`/blog/${post.slug}`}
        aria-label={`Read featured article: ${post.title}`}
        className="relative grid grid-cols-1 lg:grid-cols-2 overflow-hidden rounded-[2.5rem] bg-muted/10 border border-border/50 hover:border-primary/40 transition-all duration-500 hover:-translate-y-1.5 hover:shadow-2xl hover:shadow-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        <div className="relative aspect-[16/10] lg:aspect-auto overflow-hidden">
          <Image
            src={post.image}
            alt={post.imageAlt}
            fill
            sizes="(min-width: 1024px) 700px, 100vw"
            priority
            className="object-cover scale-105 group-hover/featured:scale-110 transition-transform duration-700 ease-out"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/5 to-transparent lg:bg-gradient-to-t lg:from-black/70 lg:via-black/5 lg:to-transparent" />
          <span className="absolute top-6 left-6 inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-1.5 text-[11px] font-bold uppercase tracking-wider text-primary-foreground shadow-lg shadow-primary/30">
            <Sparkles className="w-3 h-3" />
            {l.featured}
          </span>
          <div className="absolute bottom-6 left-6 flex items-center gap-4 text-sm font-medium text-white/90">
            <span className="inline-flex items-center gap-1.5">
              <Calendar className="w-4 h-4" />
              {formatDate(post.date)}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Clock className="w-4 h-4" />
              {post.readTime}
            </span>
          </div>
        </div>

        <div className="relative z-10 flex flex-col justify-center p-8 sm:p-10 lg:p-12">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary/15 to-secondary/15 border border-primary/20 flex items-center justify-center mb-6 group-hover/featured:from-primary group-hover/featured:to-brand-accent group-hover/featured:border-primary group-hover/featured:shadow-lg group-hover/featured:shadow-primary/20 group-hover/featured:scale-110 group-hover/featured:rotate-3 transition-all duration-300">
            <DynamicIcon name={post.icon} className="w-6 h-6 text-primary group-hover/featured:text-white transition-colors duration-300" />
          </div>

          <span className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-primary mb-5 w-fit">
            <span className="w-1.5 h-1.5 rounded-full bg-gradient-to-br from-primary to-secondary" />
            {post.category}
          </span>

          <h2 className="text-2xl sm:text-3xl lg:text-4xl font-black tracking-tight text-foreground mb-4 leading-[1.15] group-hover/featured:text-primary transition-colors">
            {post.title}
          </h2>

          <p className="text-base sm:text-lg text-muted-foreground leading-relaxed mb-6 line-clamp-3">{post.excerpt}</p>

          <div className="flex flex-wrap gap-2 mb-8">
            {post.tags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-foreground bg-background border border-border/60 px-2.5 py-1 rounded-full"
              >
                <CheckCircle2 className="w-3 h-3 text-primary flex-none" />
                {tag}
              </span>
            ))}
          </div>

          <span className="inline-flex items-center justify-center gap-2 rounded-full bg-foreground px-7 py-3.5 text-sm font-bold text-background w-fit transition-all shadow-lg shadow-foreground/10 group-hover/featured:bg-primary group-hover/featured:text-primary-foreground group-hover/featured:shadow-primary/30 group-hover/featured:scale-105">
            {l.readArticle}
            <ArrowRight className="w-4 h-4 group-hover/featured:translate-x-1 transition-transform" />
          </span>
        </div>
      </Link>
    </motion.div>
  );
}
