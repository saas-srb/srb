"use client";

import Link from "next/link";
import Image from "next/image";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import type { BlogPostMeta } from "@/types/content";
import { useUiLabels } from "@/components/products/sitecraft-ai/SiteInfoContext";

export default function NextPost({ post }: { post: BlogPostMeta }) {
  const l = useUiLabels();
  return (
    <section className="py-20 sm:py-24 bg-background relative border-t border-border/50">
      <div className="mx-auto max-w-4xl px-6 lg:px-8">
        <motion.p
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-40px" }}
          transition={{ duration: 0.5 }}
          className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-primary mb-5"
        >
          {l.upNext}
          <ArrowRight className="w-3.5 h-3.5" />
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-40px" }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="group/card relative"
        >
          <div className="absolute -inset-1 rounded-[2rem] bg-gradient-to-br from-primary/30 via-primary/0 to-secondary/30 opacity-0 group-hover/card:opacity-100 blur-xl transition-opacity duration-500 pointer-events-none" />

          <Link
            href={`/blog/${post.slug}`}
            aria-label={`Read next: ${post.title}`}
            className="relative flex flex-col sm:flex-row items-stretch gap-0 overflow-hidden rounded-3xl bg-muted/10 border border-border/50 hover:border-primary/40 transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl hover:shadow-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <div className="relative sm:w-64 lg:w-80 flex-none aspect-[16/10] sm:aspect-auto overflow-hidden">
              <Image
                src={post.image}
                alt={post.imageAlt}
                fill
                sizes="320px"
                className="object-cover scale-105 group-hover/card:scale-110 transition-transform duration-700 ease-out"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/0 to-transparent sm:bg-gradient-to-r" />
            </div>

            <div className="flex-1 p-6 sm:p-8 flex flex-col justify-center">
              <span className="text-xs font-semibold uppercase tracking-wider text-primary mb-2">{post.category}</span>
              <h3 className="text-xl sm:text-2xl font-black text-foreground mb-2 leading-snug group-hover/card:text-primary transition-colors">
                {post.title}
              </h3>
              <p className="text-sm sm:text-base text-muted-foreground leading-relaxed mb-5 line-clamp-2">{post.excerpt}</p>
              <span className="inline-flex items-center gap-2 text-sm font-bold text-foreground group-hover/card:text-primary group-hover/card:gap-3 transition-all">
                {l.readNextArticle} <ArrowRight className="w-4 h-4 group-hover/card:translate-x-1 transition-transform" />
              </span>
            </div>
          </Link>
        </motion.div>
      </div>
    </section>
  );
}
