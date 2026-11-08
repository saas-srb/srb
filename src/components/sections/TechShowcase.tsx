"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2, ChevronDown, LucideIcon, Search, X } from "lucide-react";

interface TechItem {
  name: string;
  blurb: string;
}

export interface TechCategory {
  id: string;
  name: string;
  icon: LucideIcon;
  description: string;
  expertise: string[];
  items: TechItem[];
}

interface TechShowcaseProps {
  categories: TechCategory[];
  searchPlaceholder: string;
}

export default function TechShowcase({ categories, searchPlaceholder }: TechShowcaseProps) {
  const [openId, setOpenId] = React.useState<string | null>(categories[0]?.id ?? null);
  const [query, setQuery] = React.useState("");

  const q = query.trim().toLowerCase();
  const isSearching = q.length > 0;

  const filtered = React.useMemo(() => {
    if (!isSearching) return categories;
    return categories
      .map((cat) => {
        const nameMatch = cat.name.toLowerCase().includes(q);
        const matchedItems = cat.items.filter((item) => item.name.toLowerCase().includes(q));
        if (!nameMatch && matchedItems.length === 0) return null;
        return nameMatch ? cat : { ...cat, items: matchedItems };
      })
      .filter((c): c is TechCategory => c !== null);
  }, [categories, q, isSearching]);

  const totalMatches = isSearching ? filtered.reduce((sum, c) => sum + c.items.length, 0) : null;

  return (
    <div id="tech-stack" className="relative">
      <div className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/4 w-[900px] h-[500px] bg-primary/10 rounded-full blur-[140px] pointer-events-none" />

      {/* Search */}
      <div className="relative flex flex-col sm:flex-row sm:items-center gap-3 mb-10">
        <div className="relative w-full max-w-md">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={searchPlaceholder}
            className="w-full rounded-full border border-border/50 bg-muted/20 pl-11 pr-10 py-3 text-sm text-foreground placeholder:text-muted-foreground outline-none transition-all duration-300 focus:border-primary/40 focus:bg-background"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Clear search"
              className="absolute right-3.5 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors duration-200"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        {isSearching && (
          <span className="text-sm text-muted-foreground">
            {totalMatches} result{totalMatches === 1 ? "" : "s"} across {filtered.length} categor{filtered.length === 1 ? "y" : "ies"}
          </span>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16 px-6 rounded-3xl bg-muted/20 border border-border/50">
          <p className="text-muted-foreground">No technologies match &ldquo;{query}&rdquo;.</p>
        </div>
      ) : (
        <div className="relative space-y-4">
          {filtered.map((cat, index) => {
            const isOpen = isSearching || openId === cat.id;
            const Icon = cat.icon;
            return (
              <motion.div
                key={cat.id}
                layout
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-40px" }}
                transition={{ duration: 0.4, delay: (index % 8) * 0.04 }}
                className={`group/row relative rounded-3xl border overflow-hidden transition-colors duration-300 ${
                  isOpen
                    ? "bg-muted/25 border-primary/30"
                    : "bg-muted/10 border-border/50 hover:border-primary/30 hover:bg-muted/20"
                }`}
              >
                <button
                  type="button"
                  onClick={() => !isSearching && setOpenId(isOpen ? null : cat.id)}
                  aria-expanded={isOpen}
                  disabled={isSearching}
                  className="w-full flex items-center gap-4 sm:gap-5 text-left px-5 sm:px-7 py-5 sm:py-6 disabled:cursor-default"
                >
                  <span className="hidden sm:block text-xs font-mono font-semibold text-muted-foreground/50 w-6 flex-none">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <div
                    className={`w-11 h-11 sm:w-12 sm:h-12 rounded-2xl flex items-center justify-center flex-none transition-all duration-300 ${
                      isOpen
                        ? "bg-primary text-primary-foreground scale-105"
                        : "bg-primary/10 text-primary group-hover/row:scale-105"
                    }`}
                  >
                    <Icon className="w-5 h-5 sm:w-6 sm:h-6" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <h3 className="font-bold text-foreground leading-snug">{cat.name}</h3>
                      <span className="text-[11px] font-semibold text-primary bg-primary/10 rounded-full px-2 py-0.5">
                        {cat.items.length}
                      </span>
                    </div>
                    {!isOpen && (
                      <p className="text-sm text-muted-foreground truncate mt-0.5 hidden sm:block">{cat.description}</p>
                    )}
                  </div>
                  {!isSearching && (
                    <ChevronDown
                      className={`w-5 h-5 flex-none text-muted-foreground transition-transform duration-300 ${
                        isOpen ? "rotate-180 text-primary" : ""
                      }`}
                    />
                  )}
                </button>

                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.3, ease: "easeInOut" }}
                      className="overflow-hidden"
                    >
                      <div className="px-5 sm:px-7 pb-6 sm:pb-7">
                        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 pb-6 border-b border-border/40 mb-6">
                          <p className="text-sm sm:text-base text-muted-foreground leading-relaxed max-w-2xl">
                            {cat.description}
                          </p>
                          <div className="flex flex-wrap gap-2 sm:flex-none sm:w-56">
                            {cat.expertise.map((point) => (
                              <span
                                key={point}
                                className="inline-flex items-center gap-1.5 text-xs font-semibold text-foreground bg-background border border-border/60 px-2.5 py-1.5 rounded-full"
                              >
                                <CheckCircle2 className="w-3.5 h-3.5 text-primary flex-none" />
                                {point}
                              </span>
                            ))}
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
                          {cat.items.map((item, i) => (
                            <motion.div
                              key={item.name}
                              initial={{ opacity: 0, y: 10 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ duration: 0.3, delay: i * 0.03 }}
                              className="group/item p-4 rounded-2xl bg-background border border-border/50 hover:border-primary/40 hover:-translate-y-0.5 transition-all duration-300"
                            >
                              <div className="flex items-center gap-2.5 mb-1.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-primary flex-none group-hover/item:scale-150 transition-transform duration-300" />
                                <h4 className="font-bold text-sm text-foreground leading-snug">{item.name}</h4>
                              </div>
                              <p className="text-xs text-muted-foreground leading-relaxed pl-4">{item.blurb}</p>
                            </motion.div>
                          ))}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
