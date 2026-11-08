"use client";

import React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Loader2, Sparkles } from "lucide-react";
import { SUCCESS_AUTO_HIDE_MS, useCareerApplySubmit } from "@/lib/useCareerApplySubmit";
import { useStableCardHeight } from "@/lib/useStableCardHeight";
import LeadSuccessState from "@/components/sections/LeadSuccessState";
import { useUiLabels } from "@/components/products/sitecraft-ai/SiteInfoContext";

/**
 * /careers/apply — extracted verbatim from the former `careers/apply/Content.tsx`.
 * One section (the heading reacts to the selected role, which is form state).
 * Copy is CMS-editable; the open-positions list and ?position= pre-selection
 * are runtime props from the page; the submit flow is unchanged code.
 */

const GENERAL_APPLICATION_VALUE = "";

export interface CareerApplyCopy {
  badge: string;
  generalHeadingLead: string;
  generalHeadingHighlight: string;
  generalHeadingTail: string;
  roleHeadingLead: string;
  description: string;
  successTitle: string;
  successDescription: string;
  submitLabel: string;
  submittingLabel: string;
  positionLabel: string;
  generalOption: string;
  nameLabel: string;
  namePlaceholder: string;
  emailLabel: string;
  emailPlaceholder: string;
  phoneLabel: string;
  phonePlaceholder: string;
  resumeLabel: string;
  coverNoteLabel: string;
  coverNotePlaceholder: string;
  consentLead: string;
  consentLinkLabel: string;
  consentHref: string;
  consentTail: string;
}

export default function CareerApplySection({
  positions = [],
  initialPositionSlug,
  badge,
  generalHeadingLead,
  generalHeadingHighlight,
  generalHeadingTail,
  roleHeadingLead,
  description,
  successTitle,
  successDescription,
  submitLabel,
  submittingLabel,
  positionLabel,
  generalOption,
  nameLabel,
  namePlaceholder,
  emailLabel,
  emailPlaceholder,
  phoneLabel,
  phonePlaceholder,
  resumeLabel,
  coverNoteLabel,
  coverNotePlaceholder,
  consentLead,
  consentLinkLabel,
  consentHref,
  consentTail,
}: CareerApplyCopy & {
  positions?: { slug: string; title: string; category: string }[];
  initialPositionSlug?: string;
}) {
  const l = useUiLabels();
  const [positionSlug, setPositionSlug] = React.useState<string>(initialPositionSlug ?? GENERAL_APPLICATION_VALUE);
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [coverNote, setCoverNote] = React.useState("");
  const [resumeFile, setResumeFile] = React.useState<File | null>(null);
  const { status, error, fieldErrors, submit, reset } = useCareerApplySubmit();
  const { ref: cardBodyRef, minHeight: cardMinHeight } = useStableCardHeight(status === "success");

  const selectedPosition = positions.find((p) => p.slug === positionSlug);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!resumeFile) return;
    const ok = await submit({
      name,
      email,
      phone,
      coverNote: coverNote || undefined,
      positionSlug: positionSlug || undefined,
      resume: resumeFile,
      source: positionSlug ? "careers-job-page" : "careers-general",
    });
    if (ok) {
      setName("");
      setEmail("");
      setPhone("");
      setCoverNote("");
      setResumeFile(null);
    }
  }

  return (
    <>
      <section className="relative overflow-hidden bg-background pt-28 sm:pt-32 lg:pt-36 pb-20 sm:pb-24 border-b border-border/50">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-[20%] -left-[10%] w-[60%] h-[60%] rounded-full bg-primary/10 blur-[120px] mix-blend-multiply dark:mix-blend-screen animate-blob"></div>
          <div className="absolute top-[10%] right-[5%] w-[50%] h-[50%] rounded-full bg-secondary/15 blur-[100px] mix-blend-multiply dark:mix-blend-screen animate-blob animation-delay-2000"></div>
          <div className="absolute -bottom-[20%] left-[20%] w-[70%] h-[70%] rounded-full bg-brand-accent/15 blur-[140px] mix-blend-multiply dark:mix-blend-screen animate-blob animation-delay-4000"></div>
        </div>

        <div className="mx-auto max-w-3xl px-6 lg:px-8 relative z-10 text-center">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }} className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-muted/40 border border-border/50 text-sm font-medium text-foreground backdrop-blur-md mb-6 shadow-sm">
            <Sparkles className="w-4 h-4 text-primary animate-pulse" />
            <span>{badge}</span>
          </motion.div>
          <motion.h1 initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.1 }} className="text-4xl font-black tracking-tight text-foreground sm:text-5xl mb-6 leading-[1.1]">
            {selectedPosition ? (
              <>{roleHeadingLead}<span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-brand-accent">{selectedPosition.title}</span></>
            ) : (
              <>{generalHeadingLead}<span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-brand-accent">{generalHeadingHighlight}</span>{generalHeadingTail}</>
            )}
          </motion.h1>
          <motion.p initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.2 }} className="text-lg leading-8 text-muted-foreground">
            {description}
          </motion.p>
        </div>
      </section>

      <section className="py-24 sm:py-32 bg-background relative">
        <div className="mx-auto max-w-xl px-6 lg:px-8">
          <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.6 }}>
            <div className="p-8 sm:p-12 rounded-3xl bg-muted/20 border border-border/50 shadow-2xl backdrop-blur-sm relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent"></div>
              <div ref={cardBodyRef} style={{ minHeight: cardMinHeight }} className="relative flex flex-col justify-center">
                <AnimatePresence mode="wait">
                  {status === "success" ? (
                    <LeadSuccessState
                      key="success"
                      title={successTitle}
                      description={successDescription}
                      onDismiss={reset}
                      autoHideMs={SUCCESS_AUTO_HIDE_MS}
                    />
                  ) : (
                    <form key="form" className="relative z-10 space-y-6" onSubmit={handleSubmit} noValidate>
                      <div>
                        <label htmlFor="position" className="block text-sm font-semibold text-foreground mb-2">{positionLabel}</label>
                        <select
                          id="position"
                          value={positionSlug}
                          onChange={(e) => setPositionSlug(e.target.value)}
                          className="w-full rounded-xl border border-border/50 bg-background/50 px-4 py-3 text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-colors"
                        >
                          <option value={GENERAL_APPLICATION_VALUE}>{generalOption}</option>
                          {positions.map((p) => (
                            <option key={p.slug} value={p.slug}>{p.title}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label htmlFor="name" className="block text-sm font-semibold text-foreground mb-2">{nameLabel}</label>
                        <input type="text" id="name" value={name} onChange={(e) => setName(e.target.value)} required className="w-full rounded-xl border border-border/50 bg-background/50 px-4 py-3 text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-colors" placeholder={namePlaceholder} />
                        {fieldErrors.name && <p className="text-xs text-red-500 mt-1">{fieldErrors.name}</p>}
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                        <div>
                          <label htmlFor="email" className="block text-sm font-semibold text-foreground mb-2">{emailLabel}</label>
                          <input type="email" id="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="w-full rounded-xl border border-border/50 bg-background/50 px-4 py-3 text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-colors" placeholder={emailPlaceholder} />
                          {fieldErrors.email && <p className="text-xs text-red-500 mt-1">{fieldErrors.email}</p>}
                        </div>
                        <div>
                          <label htmlFor="phone" className="block text-sm font-semibold text-foreground mb-2">{phoneLabel}</label>
                          <input type="tel" id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} required className="w-full rounded-xl border border-border/50 bg-background/50 px-4 py-3 text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-colors" placeholder={phonePlaceholder} />
                          {fieldErrors.phone && <p className="text-xs text-red-500 mt-1">{fieldErrors.phone}</p>}
                        </div>
                      </div>
                      <div>
                        <label htmlFor="resume" className="block text-sm font-semibold text-foreground mb-2">{resumeLabel}</label>
                        <input
                          type="file"
                          id="resume"
                          required
                          accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                          onChange={(e) => setResumeFile(e.target.files?.[0] ?? null)}
                          className="w-full rounded-xl border border-border/50 bg-background/50 px-4 py-3 text-sm text-foreground file:mr-4 file:rounded-lg file:border-0 file:bg-primary file:px-4 file:py-2 file:text-sm file:font-semibold file:text-primary-foreground hover:file:bg-primary/90 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-colors"
                        />
                        {resumeFile && <p className="text-xs text-muted-foreground mt-1">{l.fileSelected}{resumeFile.name}</p>}
                        {fieldErrors.resume && <p className="text-xs text-red-500 mt-1">{fieldErrors.resume}</p>}
                      </div>
                      <div>
                        <label htmlFor="coverNote" className="block text-sm font-semibold text-foreground mb-2">{coverNoteLabel}</label>
                        <textarea id="coverNote" rows={4} value={coverNote} onChange={(e) => setCoverNote(e.target.value)} className="w-full rounded-xl border border-border/50 bg-background/50 px-4 py-3 text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-colors resize-none" placeholder={coverNotePlaceholder}></textarea>
                        {fieldErrors.coverNote && <p className="text-xs text-red-500 mt-1">{fieldErrors.coverNote}</p>}
                      </div>
                      {fieldErrors.positionSlug && <p className="text-sm text-red-500 text-center">{fieldErrors.positionSlug}</p>}
                      {error && <p className="text-sm text-red-500 text-center">{error}</p>}
                      <button type="submit" disabled={status === "submitting"} className="group w-full rounded-xl bg-primary px-8 py-4 text-sm font-bold text-primary-foreground hover:bg-primary/90 transition-all shadow-lg shadow-primary/20 flex items-center justify-center gap-2 mt-4 disabled:opacity-60 disabled:cursor-not-allowed">
                        {status === "submitting" ? (
                          <>{`${submittingLabel} `}<Loader2 className="w-4 h-4 animate-spin" /></>
                        ) : (
                          <>{`${submitLabel} `}<ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" /></>
                        )}
                      </button>
                      <p className="text-xs text-center text-muted-foreground mt-4">
                        {consentLead}<a href={consentHref} className="underline hover:text-primary transition-colors">{consentLinkLabel}</a>{consentTail}
                      </p>
                    </form>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </motion.div>
        </div>
      </section>
    </>
  );
}
