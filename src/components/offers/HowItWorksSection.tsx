"use client";

import { motion } from "framer-motion";
import { MousePointerClick, FileText, PhoneCall, BadgePercent, Rocket } from "lucide-react";
import { useText } from "@/components/products/sitecraft-ai/TextContext";

const STEPS = (tx: (key: string) => string) => ([
  { title: tx("offers.howItWorksSection.choose-offer"), description: tx("offers.howItWorksSection.pick-the-service-training-or-hiring-offe"), icon: MousePointerClick },
  { title: tx("offers.howItWorksSection.submit-details"), description: tx("offers.howItWorksSection.a-short-form-no-unnecessary-questions"), icon: FileText },
  { title: tx("offers.howItWorksSection.get-consultation"), description: tx("offers.howItWorksSection.our-team-reaches-out-to-confirm-scope-an"), icon: PhoneCall },
  { title: tx("offers.howItWorksSection.apply-discount"), description: tx("offers.howItWorksSection.your-coupon-and-offer-discount-are-valid"), icon: BadgePercent },
  { title: tx("offers.howItWorksSection.start-your-journey"), description: tx("offers.howItWorksSection.kick-off-the-project-program-or-hiring-e"), icon: Rocket },
]);

export default function HowItWorksSection() {
  const tx = useText();
  return (
    <section className="py-20 sm:py-24 bg-background">
      <div className="mx-auto max-w-6xl px-6 lg:px-8">
        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.5 }}
          className="mb-12 text-center text-3xl font-black tracking-tight text-foreground sm:text-4xl"
        >
          {tx("offers.howItWorksSection.how-the-offer-works")}</motion.h2>
        <div className="grid gap-6 sm:grid-cols-5">
          {STEPS(tx).map((step, i) => (
            <motion.div
              key={step.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ duration: 0.4, delay: i * 0.08 }}
              className="flex flex-col items-center text-center gap-3"
            >
              <div className="relative flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <step.icon className="size-5" />
                <span className="absolute -top-2 -right-2 flex size-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                  {i + 1}
                </span>
              </div>
              <p className="text-sm font-bold text-foreground">{step.title}</p>
              <p className="text-xs text-muted-foreground">{step.description}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
