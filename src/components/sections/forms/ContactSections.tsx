"use client";

/**
 * /contact — extracted verbatim from the former `contact/Content.tsx` into a
 * hero and a form section. Copy is CMS-editable; the form fields are managed
 * at /sitecraft-ai/forms (passed in as runtime props with the ?category / ?subService
 * pre-selection), and the lead submission pipeline is unchanged code.
 * Contact details (email, phone, address) stay owned by src/lib/contact.ts.
 */

import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Mail, MapPin, Phone, ArrowRight, MessageCircle, Clock, Sparkles, Loader2 } from "lucide-react";
import { WhatsAppIcon } from "@/components/icons/SocialIcons";
import { useSiteInfo, useUiLabels } from "@/components/products/sitecraft-ai/SiteInfoContext";
import { CATEGORIES, categoryAcceptsResume, getSubServices, type CategorySlug } from "@/lib/categories";
import { SUCCESS_AUTO_HIDE_MS, useLeadSubmit } from "@/lib/useLeadSubmit";
import { useStableCardHeight } from "@/lib/useStableCardHeight";
import LeadSuccessState from "@/components/sections/LeadSuccessState";
import { CONTACT_FORM_FIELD_NAMES, completeFormFields, type CmsFormFieldConfig } from "@/lib/products/sitecraft-ai/forms-shared";

const fadeIn = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6 } }
};

const stagger = { visible: { transition: { staggerChildren: 0.1 } } };

export interface ContactHeroCopy {
  badge: string;
  headingLead: string;
  headingHighlight: string;
  headingTail: string;
  description: string;
  backgroundImage: string;
  cardImage: string;
  badgeOneTitle: string;
  badgeOneSubtitle: string;
  badgeTwoTitle: string;
  badgeTwoSubtitle: string;
}

export function ContactHero({
  badge, headingLead, headingHighlight, headingTail, description, backgroundImage, cardImage,
  badgeOneTitle, badgeOneSubtitle, badgeTwoTitle, badgeTwoSubtitle,
}: ContactHeroCopy) {
  const [mousePosition, setMousePosition] = React.useState({ x: 0, y: 0 });

  React.useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => setMousePosition({ x: e.clientX, y: e.clientY });
    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, []);

  return (
    <section className="relative overflow-hidden bg-background pt-28 sm:pt-32 lg:pt-36 pb-20 sm:pb-24 border-b border-border/50">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={backgroundImage}
          alt=""
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-background/90 lg:hidden"></div>
        <div
          className="absolute inset-0 bg-background hidden lg:block"
          style={{
            maskImage: "linear-gradient(to right, black 0%, black 45%, transparent 92%)",
            WebkitMaskImage: "linear-gradient(to right, black 0%, black 45%, transparent 92%)",
          }}
        ></div>
        <div
          className="absolute inset-0 bg-background hidden lg:block"
          style={{
            maskImage: "linear-gradient(to top, black 0%, transparent 40%)",
            WebkitMaskImage: "linear-gradient(to top, black 0%, transparent 40%)",
          }}
        ></div>
      </div>
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-[20%] -left-[10%] w-[60%] h-[60%] rounded-full bg-primary/10 blur-[120px] mix-blend-multiply dark:mix-blend-screen animate-blob"></div>
        <div className="absolute top-[10%] right-[5%] w-[50%] h-[50%] rounded-full bg-secondary/15 blur-[100px] mix-blend-multiply dark:mix-blend-screen animate-blob animation-delay-2000"></div>
        <div className="absolute -bottom-[20%] left-[20%] w-[70%] h-[70%] rounded-full bg-brand-accent/15 blur-[140px] mix-blend-multiply dark:mix-blend-screen animate-blob animation-delay-4000"></div>
      </div>
      <div className="absolute inset-0 z-0 pointer-events-none">
        <div className="absolute inset-0 bg-grid-slate-900/[0.02] dark:bg-grid-slate-400/[0.02] [mask-image:linear-gradient(to_bottom,black,transparent)]"></div>
        <div
          className="absolute inset-0 bg-grid-slate-900/[0.08] dark:bg-grid-slate-400/[0.08]"
          style={{
            WebkitMaskImage: `radial-gradient(400px circle at ${mousePosition.x}px ${mousePosition.y}px, black, transparent 80%)`,
            maskImage: `radial-gradient(400px circle at ${mousePosition.x}px ${mousePosition.y}px, black, transparent 80%)`,
          }}
        />
      </div>

      <div className="mx-auto max-w-7xl px-6 lg:px-8 relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          <motion.div initial="hidden" animate="visible" variants={stagger} className="lg:col-span-7 max-w-2xl">
            <motion.div variants={fadeIn} className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-muted/40 border border-border/50 text-sm font-medium text-foreground backdrop-blur-md mb-6 shadow-sm">
              <Sparkles className="w-4 h-4 text-primary animate-pulse" />
              <span>{badge}</span>
            </motion.div>
            <motion.h1 variants={fadeIn} className="text-5xl font-black tracking-tight text-foreground sm:text-6xl mb-6 leading-[1.1]">
              {headingLead}<span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-brand-accent">{headingHighlight}</span>{headingTail}
            </motion.h1>
            <motion.p variants={fadeIn} className="text-xl leading-8 text-muted-foreground">
              {description}
            </motion.p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="lg:col-span-5 relative hidden lg:block"
          >
            <div className="relative aspect-square max-w-md mx-auto">
              <div className="absolute inset-0 bg-gradient-to-tr from-primary/20 to-secondary/20 rounded-[3rem] blur-2xl opacity-60 animate-pulse"></div>
              <div className="relative h-full w-full rounded-[3rem] shadow-2xl border border-border/60 overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={cardImage}
                  alt=""
                  className="absolute inset-0 w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent"></div>
                <div className="absolute inset-0 bg-gradient-to-br from-primary/25 via-transparent to-secondary/30 mix-blend-overlay"></div>
                <div className="absolute top-6 left-6 w-16 h-16 rounded-2xl bg-white/15 backdrop-blur-md border border-white/20 flex items-center justify-center shadow-xl">
                  <MessageCircle className="w-8 h-8 text-white" />
                </div>
              </div>

              <motion.div
                animate={{ y: [0, -15, 0] }}
                transition={{ repeat: Infinity, duration: 4, ease: "easeInOut" }}
                className="absolute -right-6 top-10 p-4 bg-background/80 backdrop-blur-xl border border-border/50 rounded-2xl shadow-xl flex items-center gap-3"
              >
                <div className="w-10 h-10 rounded-full bg-green-500/10 flex items-center justify-center">
                  <Clock className="w-5 h-5 text-green-500" />
                </div>
                <div>
                  <div className="text-sm font-bold">{badgeOneTitle}</div>
                  <div className="text-xs text-muted-foreground">{badgeOneSubtitle}</div>
                </div>
              </motion.div>

              <motion.div
                animate={{ y: [0, 15, 0] }}
                transition={{ repeat: Infinity, duration: 5, ease: "easeInOut" }}
                className="absolute -left-8 bottom-12 p-4 bg-background/80 backdrop-blur-xl border border-border/50 rounded-2xl shadow-xl flex items-center gap-3"
              >
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <Sparkles className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <div className="text-sm font-bold">{badgeTwoTitle}</div>
                  <div className="text-xs text-muted-foreground">{badgeTwoSubtitle}</div>
                </div>
              </motion.div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}

export interface ContactFormCopy {
  heading: string;
  intro: string;
  emailTitle: string;
  emailText: string;
  callTitle: string;
  callText: string;
  whatsappTitle: string;
  whatsappText: string;
  visitTitle: string;
  successDescription: string;
  submitLabel: string;
  submittingLabel: string;
  interestLabel: string;
  subServiceLabel: string;
  resumeLabel: string;
  consentLead: string;
  consentLinkLabel: string;
  consentHref: string;
  consentTail: string;
}

export function ContactFormSection({
  heading, intro, emailTitle, emailText, callTitle, callText, whatsappTitle, whatsappText, visitTitle,
  successDescription, submitLabel, submittingLabel,
  interestLabel, subServiceLabel, resumeLabel, consentLead, consentLinkLabel, consentHref, consentTail,
  initialCategory,
  initialSubService,
  formFields = [],
  leadCategories,
}: ContactFormCopy & {
  initialCategory?: string;
  initialSubService?: string;
  formFields?: CmsFormFieldConfig[];
  /** A company's own enquiry categories (see `lib/lead-categories.ts`). Absent = the operator's built-in services. */
  leadCategories?: { slug: string; label: string; acceptsResume: boolean; subServices: { slug: string; label: string }[] }[];
}) {
  const l = useUiLabels();
  const fields = completeFormFields(CONTACT_FORM_FIELD_NAMES, formFields);
  const fieldConfig = (name: string): CmsFormFieldConfig => fields.find((f) => f.name === name)!;
  const nameField = fieldConfig("name");
  const emailField = fieldConfig("email");
  const phoneField = fieldConfig("phone");
  const messageField = fieldConfig("message");

  const options = React.useMemo(
    () => leadCategories ?? CATEGORIES.map((c) => ({ slug: c.slug as string, label: c.label as string, acceptsResume: categoryAcceptsResume(c.slug), subServices: getSubServices(c.slug) })),
    [leadCategories],
  );
  const subsOf = (slug: string) => options.find((o) => o.slug === slug)?.subServices ?? [];
  const initialCat = options.some((o) => o.slug === initialCategory) ? (initialCategory as string) : options[0].slug;
  const { brand, contact } = useSiteInfo();
  const [category, setCategory] = React.useState<string>(initialCat);
  const [subService, setSubService] = React.useState<string>(initialSubService ?? subsOf(initialCat)[0]?.slug ?? "");
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [phoneNumber, setPhoneNumber] = React.useState("");
  const [message, setMessage] = React.useState("");
  const [resumeFile, setResumeFile] = React.useState<File | null>(null);
  const { status, error, fieldErrors, submit, reset } = useLeadSubmit();
  const { ref: cardBodyRef, minHeight: cardMinHeight } = useStableCardHeight(status === "success");

  const wantsResume = options.find((o) => o.slug === category)?.acceptsResume ?? false;

  function handleCategoryChange(next: string) {
    setCategory(next);
    setSubService(subsOf(next)[0]?.slug ?? "");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const ok = await submit(category, {
      name,
      email,
      phone: phoneNumber,
      message: wantsResume ? undefined : message,
      subService: subService || undefined,
      resume: wantsResume ? resumeFile : undefined,
      source: "contact-page",
    });
    if (ok) {
      setName("");
      setEmail("");
      setPhoneNumber("");
      setMessage("");
      setResumeFile(null);
    }
  }

  return (
    <section className="py-24 sm:py-32 bg-background relative">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16">

          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeIn} className="space-y-12">
            <div>
              <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl mb-4">
                {heading}
              </h2>
              <p className="text-lg text-muted-foreground">
                {intro}
              </p>
            </div>

            <div className="space-y-8">
              {contact.email && (
              <div className="flex gap-4 p-6 rounded-2xl bg-muted/30 border border-border/50 hover:bg-muted/50 transition-colors">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <Mail className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold text-foreground text-lg">{emailTitle}</h3>
                  <p className="text-muted-foreground mb-2">{emailText}</p>
                  <div className="flex flex-col gap-1">
                    <a href={`mailto:${contact.email}`} className="text-primary font-medium hover:underline">
                      {contact.email}
                    </a>
                  </div>
                </div>
              </div>
              )}

              {contact.phoneHref && contact.phoneDisplay && (
              <div className="flex gap-4 p-6 rounded-2xl bg-muted/30 border border-border/50 hover:bg-muted/50 transition-colors">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <Phone className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold text-foreground text-lg">{callTitle}</h3>
                  <p className="text-muted-foreground mb-1">{callText}</p>
                  <a href={contact.phoneHref} className="text-primary font-medium hover:underline">{contact.phoneDisplay}</a>
                </div>
              </div>
              )}

              {contact.whatsappHref && (
              <div className="flex gap-4 p-6 rounded-2xl bg-muted/30 border border-border/50 hover:bg-muted/50 transition-colors">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <WhatsAppIcon className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold text-foreground text-lg">{whatsappTitle}</h3>
                  <p className="text-muted-foreground mb-1">{whatsappText}</p>
                  <a href={contact.whatsappHref} target="_blank" rel="noopener noreferrer" className="text-primary font-medium hover:underline">
                    {contact.phoneDisplay}
                  </a>
                </div>
              </div>
              )}

              {(contact.address || contact.mapsUrl) && (
              <div className="flex gap-4 p-6 rounded-2xl bg-muted/30 border border-border/50 hover:bg-muted/50 transition-colors">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <MapPin className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold text-foreground text-lg">{visitTitle}</h3>
                  <p className="text-muted-foreground"><span className="font-semibold"><span className="text-foreground">{brand.namePrimary}</span><span className="text-primary">{brand.nameAccent}</span></span>{` ${contact.addressName}`}{contact.address.split("\n").map((line, i) => <React.Fragment key={i}><br/>{line}</React.Fragment>)}</p>
                </div>
              </div>
              )}
            </div>
          </motion.div>

          <motion.div initial={{ opacity: 0, x: 20 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ duration: 0.6 }}>
            <div className="p-8 sm:p-12 rounded-3xl bg-muted/20 border border-border/50 shadow-2xl backdrop-blur-sm relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent"></div>
              <div ref={cardBodyRef} style={{ minHeight: cardMinHeight }} className="relative flex flex-col justify-center">
              <AnimatePresence mode="wait">
              {status === "success" ? (
                <LeadSuccessState
                  key="success"
                  description={successDescription}
                  onDismiss={reset}
                  autoHideMs={SUCCESS_AUTO_HIDE_MS}
                />
              ) : (
              <form key="form" className="relative z-10 space-y-6" onSubmit={handleSubmit} noValidate>
                  {options.length > 1 && (<div>
                    <label htmlFor="category" className="block text-sm font-semibold text-foreground mb-2">{interestLabel}</label>
                    <select
                      id="category"
                      value={category}
                      onChange={(e) => handleCategoryChange(e.target.value)}
                      className="w-full rounded-xl border border-border/50 bg-background/50 px-4 py-3 text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-colors"
                    >
                      {options.map((c) => (
                        <option key={c.slug} value={c.slug}>{c.label}</option>
                      ))}
                    </select>
                  </div>)}
                  {subsOf(category).length > 0 && (<div>
                    <label htmlFor="subService" className="block text-sm font-semibold text-foreground mb-2">{subServiceLabel}</label>
                    <select
                      id="subService"
                      value={subService}
                      onChange={(e) => setSubService(e.target.value)}
                      className="w-full rounded-xl border border-border/50 bg-background/50 px-4 py-3 text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-colors"
                    >
                      {subsOf(category).map((s) => (
                        <option key={s.slug} value={s.slug}>{s.label}</option>
                      ))}
                    </select>
                    {fieldErrors.subService && <p className="text-xs text-red-500 mt-1">{fieldErrors.subService}</p>}
                  </div>)}
                  <div>
                    <label htmlFor="firstName" className="block text-sm font-semibold text-foreground mb-2">{nameField.label}</label>
                    <input type="text" id="firstName" value={name} onChange={(e) => setName(e.target.value)} required={nameField.required} className="w-full rounded-xl border border-border/50 bg-background/50 px-4 py-3 text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-colors" placeholder={nameField.placeholder} />
                    {nameField.helpText && <p className="text-xs text-muted-foreground mt-1">{nameField.helpText}</p>}
                    {fieldErrors.name && <p className="text-xs text-red-500 mt-1">{fieldErrors.name}</p>}
                  </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div>
                    <label htmlFor="email" className="block text-sm font-semibold text-foreground mb-2">{emailField.label}</label>
                    <input type="email" id="email" value={email} onChange={(e) => setEmail(e.target.value)} required={emailField.required} className="w-full rounded-xl border border-border/50 bg-background/50 px-4 py-3 text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-colors" placeholder={emailField.placeholder} />
                    {fieldErrors.email && <p className="text-xs text-red-500 mt-1">{fieldErrors.email}</p>}
                  </div>
                  <div>
                    <label htmlFor="phone" className="block text-sm font-semibold text-foreground mb-2">{phoneField.label}</label>
                    <input type="tel" id="phone" value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} required={phoneField.required} className="w-full rounded-xl border border-border/50 bg-background/50 px-4 py-3 text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-colors" placeholder={phoneField.placeholder} />
                    {fieldErrors.phone && <p className="text-xs text-red-500 mt-1">{fieldErrors.phone}</p>}
                  </div>
                </div>
                {wantsResume ? (
                  <div>
                    <label htmlFor="resume" className="block text-sm font-semibold text-foreground mb-2">{resumeLabel}</label>
                    <input
                      type="file"
                      id="resume"
                      accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                      onChange={(e) => setResumeFile(e.target.files?.[0] ?? null)}
                      className="w-full rounded-xl border border-border/50 bg-background/50 px-4 py-3 text-sm text-foreground file:mr-4 file:rounded-lg file:border-0 file:bg-primary file:px-4 file:py-2 file:text-sm file:font-semibold file:text-primary-foreground hover:file:bg-primary/90 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-colors"
                    />
                    {resumeFile && <p className="text-xs text-muted-foreground mt-1">{l.fileSelected}{resumeFile.name}</p>}
                    {fieldErrors.resume && <p className="text-xs text-red-500 mt-1">{fieldErrors.resume}</p>}
                  </div>
                ) : (
                  <div>
                    <label htmlFor="message" className="block text-sm font-semibold text-foreground mb-2">{messageField.label}</label>
                    <textarea id="message" rows={5} value={message} onChange={(e) => setMessage(e.target.value)} required={messageField.required} className="w-full rounded-xl border border-border/50 bg-background/50 px-4 py-3 text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-colors resize-none" placeholder={messageField.placeholder}></textarea>
                    {fieldErrors.message && <p className="text-xs text-red-500 mt-1">{fieldErrors.message}</p>}
                  </div>
                )}
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
      </div>
    </section>
  );
}
