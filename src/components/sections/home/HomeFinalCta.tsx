"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, CheckCircle2, Clock3, Loader2, Mail, Phone, ShieldCheck } from "lucide-react";
import LeadSuccessState from "@/components/sections/LeadSuccessState";
import { CATEGORIES, categoryAcceptsResume, getSubServices, type CategorySlug } from "@/lib/categories";
import { SUCCESS_AUTO_HIDE_MS, useLeadSubmit } from "@/lib/useLeadSubmit";
import { useStableCardHeight } from "@/lib/useStableCardHeight";

/**
 * Homepage final CTA + consultation form — extracted verbatim from the
 * former `src/app/(site)/Content.tsx` (section 14). Only the copy is
 * CMS-editable; the form's behaviour (`useLeadSubmit` → `/api/leads/[category]`,
 * category/sub-service lists, resume upload) is unchanged code.
 */

export interface HomeFinalCtaProps {
  /** A company's own enquiry categories (`lib/lead-categories.ts`); absent = the operator's built-in services. */
  leadCategories?: { slug: string; label: string; acceptsResume: boolean; subServices: { slug: string; label: string }[] }[];
  heading: string;
  description: string;
  checklist: string[];
  email: string;
  phone: string;
  responseBadgeTitle: string;
  responseBadgeSubtitle: string;
  formIntro: string;
  namePlaceholder: string;
  phonePlaceholder: string;
  emailPlaceholder: string;
  messagePlaceholder: string;
  submitLabel: string;
  submittingLabel: string;
  successTitle: string;
  successDescription: string;
}

export default function HomeFinalCta({
  heading,
  description,
  checklist,
  email,
  phone,
  responseBadgeTitle,
  responseBadgeSubtitle,
  formIntro,
  namePlaceholder,
  phonePlaceholder,
  emailPlaceholder,
  messagePlaceholder,
  submitLabel,
  submittingLabel,
  successTitle,
  successDescription,
  leadCategories,
}: HomeFinalCtaProps) {
  const options = leadCategories ?? CATEGORIES.map((c) => ({ slug: c.slug as string, label: c.label as string, acceptsResume: categoryAcceptsResume(c.slug), subServices: getSubServices(c.slug) }));
  const subsOf = (slug: string) => options.find((o) => o.slug === slug)?.subServices ?? [];
  const [heroCategory, setHeroCategory] = useState<string>(options[0].slug);
  const [heroSubService, setHeroSubService] = useState<string>(subsOf(options[0].slug)[0]?.slug ?? "");
  const [heroName, setHeroName] = useState("");
  const [heroEmail, setHeroEmail] = useState("");
  const [heroPhone, setHeroPhone] = useState("");
  const [heroMessage, setHeroMessage] = useState("");
  const [heroResumeFile, setHeroResumeFile] = useState<File | null>(null);
  const heroLead = useLeadSubmit();
  const { ref: heroCardBodyRef, minHeight: heroCardMinHeight } = useStableCardHeight(heroLead.status === "success");
  const heroWantsResume = options.find((o) => o.slug === heroCategory)?.acceptsResume ?? false;

  function handleHeroCategoryChange(next: string) {
    setHeroCategory(next);
    setHeroSubService(subsOf(next)[0]?.slug ?? "");
  }

  async function handleHeroSubmit(e: React.FormEvent) {
    e.preventDefault();
    const ok = await heroLead.submit(heroCategory, {
      name: heroName,
      email: heroEmail,
      phone: heroPhone,
      message: heroWantsResume ? undefined : heroMessage,
      subService: heroSubService || undefined,
      resume: heroWantsResume ? heroResumeFile : undefined,
      source: "homepage-hero",
    });
    if (ok) {
      setHeroName("");
      setHeroEmail("");
      setHeroPhone("");
      setHeroMessage("");
      setHeroResumeFile(null);
    }
  }

  return (
    <section data-site-cta className="relative overflow-hidden border-t border-border/50 py-24 sm:py-32">
      <div className="absolute inset-0 bg-gradient-to-b from-primary/5 via-primary/5 to-transparent"></div>
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[500px] bg-primary/10 rounded-full blur-[120px] pointer-events-none"></div>
      <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-b from-transparent to-background pointer-events-none"></div>

      <div className="mx-auto max-w-7xl px-6 lg:px-8 relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="space-y-8"
          >
            <h2 className="text-4xl font-black tracking-tight text-foreground sm:text-6xl leading-[1.1]">
              {heading}
            </h2>
            <p className="text-xl leading-8 text-muted-foreground max-w-lg">
              {description}
            </p>

            <div className="flex flex-col sm:flex-row items-start gap-6 pt-2 text-sm text-muted-foreground">
              {checklist.map((item) => (
                <div key={item} className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-primary" />{` ${item}`}</div>
              ))}
            </div>

            <div className="flex flex-col sm:flex-row gap-6 pt-4">
              {email && (
                <a href={`mailto:${email}`} className="flex items-center gap-3 group">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center group-hover:bg-primary transition-colors">
                    <Mail className="w-4 h-4 text-primary group-hover:text-primary-foreground transition-colors" />
                  </div>
                  <span className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">{email}</span>
                </a>
              )}
              {phone && (
                <a href={`tel:${phone.replace(/\s+/g, "")}`} className="flex items-center gap-3 group">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center group-hover:bg-primary transition-colors">
                    <Phone className="w-4 h-4 text-primary group-hover:text-primary-foreground transition-colors" />
                  </div>
                  <span className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">{phone}</span>
                </a>
              )}
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="relative"
          >
            {responseBadgeTitle && (
              <div className="absolute -top-6 -right-6 z-10 p-3 bg-background/90 backdrop-blur-xl border border-border/50 rounded-2xl shadow-xl hidden sm:flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-green-500/10 flex items-center justify-center">
                  <Clock3 className="w-4 h-4 text-green-500" />
                </div>
                <div>
                  <div className="text-xs font-bold">{responseBadgeTitle}</div>
                  <div className="text-[11px] text-muted-foreground">{responseBadgeSubtitle}</div>
                </div>
              </div>
            )}

            <div className="p-8 sm:p-10 rounded-[2rem] bg-muted/20 border border-border/50 shadow-2xl relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent pointer-events-none"></div>
              <div ref={heroCardBodyRef} style={{ minHeight: heroCardMinHeight }} className="relative flex flex-col justify-center">
              {heroLead.status !== "success" && formIntro && (
                <p className="relative z-10 text-sm text-muted-foreground mb-6 flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-primary flex-none" />
                  {formIntro}
                </p>
              )}
              <AnimatePresence mode="wait">
              {heroLead.status === "success" ? (
                <LeadSuccessState
                  key="success"
                  title={successTitle}
                  description={successDescription}
                  onDismiss={heroLead.reset}
                  autoHideMs={SUCCESS_AUTO_HIDE_MS}
                  compact
                />
              ) : (
              <form key="form" className="relative z-10 space-y-5" onSubmit={handleHeroSubmit} noValidate>
                {options.length > 1 && <select
                  value={heroCategory}
                  onChange={(e) => handleHeroCategoryChange(e.target.value)}
                  aria-label="I'm interested in"
                  className="w-full rounded-xl border border-border/50 bg-background/50 px-4 py-3 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-colors"
                >
                  {options.map((c) => (
                    <option key={c.slug} value={c.slug}>{c.label}</option>
                  ))}
                </select>}
                {subsOf(heroCategory).length > 0 && <select
                  value={heroSubService}
                  onChange={(e) => setHeroSubService(e.target.value)}
                  aria-label="Specific service"
                  className="w-full rounded-xl border border-border/50 bg-background/50 px-4 py-3 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-colors"
                >
                  {subsOf(heroCategory).map((s) => (
                    <option key={s.slug} value={s.slug}>{s.label}</option>
                  ))}
                </select>}
                {heroLead.fieldErrors.subService && <p className="text-xs text-red-500 -mt-3">{heroLead.fieldErrors.subService}</p>}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <input
                      type="text"
                      placeholder={namePlaceholder}
                      value={heroName}
                      onChange={(e) => setHeroName(e.target.value)}
                      required
                      className="w-full rounded-xl border border-border/50 bg-background/50 px-4 py-3 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-colors"
                    />
                    {heroLead.fieldErrors.name && <p className="text-xs text-red-500 mt-1">{heroLead.fieldErrors.name}</p>}
                  </div>
                  <div>
                    <input
                      type="text"
                      placeholder={phonePlaceholder}
                      value={heroPhone}
                      onChange={(e) => setHeroPhone(e.target.value)}
                      required
                      className="w-full rounded-xl border border-border/50 bg-background/50 px-4 py-3 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-colors"
                    />
                    {heroLead.fieldErrors.phone && <p className="text-xs text-red-500 mt-1">{heroLead.fieldErrors.phone}</p>}
                  </div>
                </div>
                <div>
                  <input
                    type="email"
                    placeholder={emailPlaceholder}
                    value={heroEmail}
                    onChange={(e) => setHeroEmail(e.target.value)}
                    required
                    autoComplete="email"
                    className="w-full rounded-xl border border-border/50 bg-background/50 px-4 py-3 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-colors"
                  />
                  {heroLead.fieldErrors.email && <p className="text-xs text-red-500 mt-1">{heroLead.fieldErrors.email}</p>}
                </div>
                {heroWantsResume ? (
                  <div>
                    <input
                      type="file"
                      aria-label="Resume / CV"
                      accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                      onChange={(e) => setHeroResumeFile(e.target.files?.[0] ?? null)}
                      className="w-full rounded-xl border border-border/50 bg-background/50 px-4 py-3 text-sm text-foreground file:mr-4 file:rounded-lg file:border-0 file:bg-primary file:px-4 file:py-2 file:text-xs file:font-semibold file:text-primary-foreground hover:file:bg-primary/90 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-colors"
                    />
                    {heroResumeFile && <p className="text-xs text-muted-foreground mt-1">Selected: {heroResumeFile.name}</p>}
                    {heroLead.fieldErrors.resume && <p className="text-xs text-red-500 mt-1">{heroLead.fieldErrors.resume}</p>}
                  </div>
                ) : (
                  <textarea
                    rows={3}
                    placeholder={messagePlaceholder}
                    value={heroMessage}
                    onChange={(e) => setHeroMessage(e.target.value)}
                    className="w-full rounded-xl border border-border/50 bg-background/50 px-4 py-3 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-colors resize-none"
                  ></textarea>
                )}
                {heroLead.error && <p className="text-xs text-red-500 text-center">{heroLead.error}</p>}
                <button
                  type="submit"
                  disabled={heroLead.status === "submitting"}
                  className="group w-full rounded-xl bg-primary px-8 py-4 text-sm font-bold text-primary-foreground hover:bg-primary/90 transition-all shadow-lg shadow-primary/20 flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {heroLead.status === "submitting" ? (
                    <>{`${submittingLabel} `}<Loader2 className="w-4 h-4 animate-spin" /></>
                  ) : (
                    <>{`${submitLabel} `}<ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" /></>
                  )}
                </button>
              </form>
              )}
              </AnimatePresence>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
