"use client";

import { motion } from "framer-motion";
import BrandMark from "@/components/BrandMark";
import { CheckCircle2, ShieldCheck, Sparkles, Rocket } from "lucide-react";
import { useSiteInfo } from "@/components/products/sitecraft-ai/SiteInfoContext";
import type { BrandName } from "@/lib/brand";

const ICONS = [CheckCircle2, ShieldCheck, Sparkles, Rocket];

interface Feature {
  name: string;
  desc: string;
}

interface FeatureHighlightsProps {
  title?: string;
  features: Feature[];
}

// Renders the section title as-is, except any brand-name mention is swapped for the
// icon + two-tone wordmark, matching the treatment already used in Header/Footer.
function renderTitle(title: string, brand: BrandName) {
  const name = brand.namePrimary + brand.nameAccent;
  const idx = name ? title.indexOf(name) : -1;
  if (idx === -1) return title;
  return (
    <>
      {title.slice(0, idx)}
      <BrandMark className="w-5 h-5 shrink-0 mx-1.5 inline-block align-[-3px]" />
      <span className="text-foreground">{brand.namePrimary}</span>
      <span className="text-primary">{brand.nameAccent}</span>
      {title.slice(idx + name.length)}
    </>
  );
}

export default function FeatureHighlights({ title, features }: FeatureHighlightsProps) {
  const { brand } = useSiteInfo();
  // When `title` renders its own h3, feature items nest one level deeper as h4.
  // When there's no local title, the items sit directly under the page's own
  // section heading (h2) elsewhere, so they need to be h3 themselves.
  const ItemHeading = title ? "h4" : "h3";

  return (
    <div id="features">
      {title && <h3 className="text-xl font-bold mb-6 text-foreground">{renderTitle(title, brand)}</h3>}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        {features.map((f, i) => {
          const Icon = ICONS[i % ICONS.length];
          return (
            <motion.div
              key={f.name}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ duration: 0.5, delay: i * 0.1 }}
              className="p-6 rounded-2xl bg-muted/20 border border-border/50 hover:border-primary/30 hover:bg-muted/40 hover:-translate-y-1 transition-all duration-300"
            >
              <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
                <Icon className="w-5 h-5 text-primary" />
              </div>
              <ItemHeading className="font-bold text-foreground mb-2 leading-snug">{f.name}</ItemHeading>
              <p className="text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
