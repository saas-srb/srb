"use client";

import { motion } from "framer-motion";
import { PUBLIC_AUDIENCE_TABS, type PublicAudienceTabKey } from "@/lib/offers/constants";
import { useText } from "@/components/products/sitecraft-ai/TextContext";

export default function AudienceSelector({
  selected,
  onSelect,
}: {
  selected: PublicAudienceTabKey | null;
  onSelect: (key: PublicAudienceTabKey | null) => void;
}) {
  const tx = useText();
  return (
    <section className="border-b border-border/50 bg-muted/10 py-8">
      <div className="mx-auto max-w-5xl px-6 lg:px-8">
        <p className="mb-4 text-center text-sm font-semibold text-muted-foreground">{tx("offers.audienceSelector.what-are-you-looking-for")}</p>
        <div className="flex flex-wrap items-center justify-center gap-2">
          {PUBLIC_AUDIENCE_TABS.map((tab) => {
            const active = selected === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => onSelect(active ? null : tab.key)}
                className="relative rounded-full px-4 py-2 text-sm font-medium transition-colors"
              >
                {active && (
                  <motion.span
                    layoutId="offers-audience-active"
                    className="absolute inset-0 rounded-full bg-primary"
                    transition={{ type: "spring", stiffness: 400, damping: 32 }}
                  />
                )}
                <span className={`relative ${active ? "text-primary-foreground" : "text-foreground hover:text-primary"}`}>{tab.label}</span>
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => onSelect(null)}
            className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${selected === null ? "bg-foreground text-background" : "text-muted-foreground hover:text-primary"}`}
          >
            {tx("offers.audienceSelector.explore-everything")}</button>
        </div>
      </div>
    </section>
  );
}
