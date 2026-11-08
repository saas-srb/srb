"use client";

import React from "react";
import Link from "next/link";
import Image from "next/image";
import { motion, useMotionValue, useTransform, useSpring } from "framer-motion";
import { ArrowRight, Calendar, Clock, CheckCircle2 } from "lucide-react";
import type { BlogPostMeta } from "@/types/content";
import { useUiLabels } from "@/components/products/sitecraft-ai/SiteInfoContext";

interface BlogCardProps {
  post: BlogPostMeta;
  index?: number;
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

export default function BlogCard({ post, index = 0 }: BlogCardProps) {
  const l = useUiLabels();
  const mouseX = useMotionValue(0.5);
  const mouseY = useMotionValue(0.5);
  const springConfig = { stiffness: 200, damping: 20, mass: 0.5 };
  const rotateX = useSpring(useTransform(mouseY, [0, 1], [3, -3]), springConfig);
  const rotateY = useSpring(useTransform(mouseX, [0, 1], [-3, 3]), springConfig);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    mouseX.set((e.clientX - rect.left) / rect.width);
    mouseY.set((e.clientY - rect.top) / rect.height);
  };
  const handleMouseLeave = () => {
    mouseX.set(0.5);
    mouseY.set(0.5);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-50px" }}
      transition={{ duration: 0.5, delay: (index % 6) * 0.08 }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={{ rotateX, rotateY, transformPerspective: 1000 }}
      className="group/card relative h-full"
    >
      <div className="absolute -inset-1 rounded-[2rem] bg-gradient-to-br from-primary/30 via-primary/0 to-secondary/30 opacity-0 group-hover/card:opacity-100 blur-xl transition-opacity duration-500 pointer-events-none" />

      <Link
        href={`/blog/${post.slug}`}
        aria-label={`Read ${post.title}`}
        className="relative flex flex-col h-full overflow-hidden rounded-3xl bg-muted/10 border border-border/50 hover:border-primary/40 transition-all duration-300 hover:-translate-y-1.5 hover:shadow-2xl hover:shadow-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        <div className="relative aspect-[16/10] overflow-hidden">
          <Image
            src={post.image}
            alt={post.imageAlt}
            fill
            sizes="400px"
            className="object-cover scale-105 group-hover/card:scale-110 transition-transform duration-700 ease-out"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent" />
          <span className="absolute top-4 left-4 inline-flex items-center gap-1.5 rounded-full bg-white/10 backdrop-blur-md px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-white ring-1 ring-white/20">
            {post.category}
          </span>
          <div className="absolute bottom-4 left-4 flex items-center gap-3 text-xs font-medium text-white/90">
            <span className="inline-flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5" />
              {formatDate(post.date)}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" />
              {post.readTime}
            </span>
          </div>
        </div>

        <div className="relative z-10 flex flex-col flex-1 p-6 sm:p-7">
          <h3 className="text-lg font-bold text-foreground mb-2 leading-snug group-hover/card:text-primary transition-colors">
            {post.title}
          </h3>
          <p className="text-sm text-muted-foreground leading-relaxed mb-5 line-clamp-2 flex-1">{post.excerpt}</p>

          <div className="flex flex-wrap gap-2 mb-6">
            {post.tags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-foreground bg-background border border-border/60 px-2.5 py-1 rounded-full group-hover/card:border-primary/30 group-hover/card:bg-primary/5 transition-colors duration-300"
              >
                <CheckCircle2 className="w-3 h-3 text-primary flex-none" />
                {tag}
              </span>
            ))}
          </div>

          <div className="pt-6 border-t border-border/50 mt-auto">
            <span className="inline-flex items-center gap-2 text-sm font-bold text-foreground group-hover/card:text-primary group-hover/card:gap-3 transition-all">
              {l.readArticle} <ArrowRight className="w-4 h-4 group-hover/card:translate-x-1 transition-transform" />
            </span>
          </div>
        </div>
      </Link>
    </motion.div>
  );
}
