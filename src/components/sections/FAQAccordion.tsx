"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, LucideIcon } from "lucide-react";
import { useUiLabels } from "@/components/products/sitecraft-ai/SiteInfoContext";

interface FAQ {
  question: React.ReactNode;
  answer: React.ReactNode;
}

interface FAQAccordionProps {
  title?: string;
  faqs: FAQ[];
  tone?: "default" | "muted";
  icon?: LucideIcon;
  category?: string;
}

export default function FAQAccordion({ title: titleProp, faqs, tone = "default", icon: Icon, category }: FAQAccordionProps) {
  const l = useUiLabels();
  const title = titleProp ?? l.faqTitle;
  const [openIndex, setOpenIndex] = React.useState<number | null>(0);
  const enhanced = Boolean(Icon || category);

  return (
    <section id="faqs" className={`py-24 sm:py-32 relative ${tone === "muted" ? "bg-muted/10" : "bg-background"}`}>
      <div className="mx-auto max-w-4xl px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.6 }}
          className="text-center mb-12"
        >
          {Icon && (
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-muted/40 border border-border/50 shadow-sm mb-6">
              <Icon className="w-6 h-6 text-primary" />
            </div>
          )}
          {category && (
            <p className="text-sm font-semibold tracking-widest uppercase text-primary mb-3">{category}</p>
          )}
          <h2 className={`font-bold tracking-tight text-foreground ${enhanced ? "text-4xl sm:text-5xl" : "text-3xl sm:text-4xl"}`}>
            {title}
          </h2>
        </motion.div>

        <div className="space-y-4">
          {faqs.map((faq, i) => {
            const isOpen = openIndex === i;
            return (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 15 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-40px" }}
                transition={{ duration: 0.4, delay: (i % 8) * 0.05 }}
                className="rounded-2xl bg-muted/20 border border-border/50 overflow-hidden"
              >
                <button
                  type="button"
                  onClick={() => setOpenIndex(isOpen ? null : i)}
                  aria-expanded={isOpen}
                  className="w-full flex items-center justify-between gap-4 text-left px-6 py-5"
                >
                  <span className="font-semibold text-foreground">{faq.question}</span>
                  <ChevronDown
                    className={`w-5 h-5 flex-none text-primary transition-transform duration-300 ${isOpen ? "rotate-180" : ""}`}
                  />
                </button>
                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.25, ease: "easeInOut" }}
                      className="overflow-hidden"
                    >
                      <p className="px-6 pb-5 text-sm leading-relaxed text-muted-foreground">{faq.answer}</p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
