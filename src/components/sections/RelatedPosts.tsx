"use client";

import { motion } from "framer-motion";
import BlogCard from "@/components/sections/BlogCard";
import type { BlogPostMeta } from "@/types/content";
import { useUiLabels } from "@/components/products/sitecraft-ai/SiteInfoContext";

export default function RelatedPosts({ posts, title: titleProp }: { posts: BlogPostMeta[]; title?: string }) {
  const l = useUiLabels();
  const title = titleProp ?? l.relatedPostsTitle;
  if (posts.length === 0) return null;

  return (
    <section className="py-24 sm:py-32 bg-muted/10 relative border-t border-border/50">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.6 }}
          className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl mb-14"
        >
          {title}
        </motion.h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
          {posts.map((post, i) => (
            <BlogCard key={post.slug} post={post} index={i} />
          ))}
        </div>
      </div>
    </section>
  );
}
