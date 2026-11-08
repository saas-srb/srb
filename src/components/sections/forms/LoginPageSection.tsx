"use client";

import Link from "next/link";
import React, { useActionState } from "react";
import { motion } from "framer-motion";
import { ArrowRight, Eye, EyeOff, Loader2, ShieldCheck, Sparkles, type LucideIcon } from "lucide-react";
import { portalLoginAction, type PortalLoginState } from "@/app/(products)/clientos/login/actions";
import { brandTokens } from "@/lib/brand";
import { useSiteInfo } from "@/components/products/sitecraft-ai/SiteInfoContext";

/**
 * /login — extracted verbatim from the former `login/Content.tsx`. The copy
 * is CMS-editable; the sign-in form and its server action are unchanged code.
 */

const fadeIn = { hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0, transition: { duration: 0.6 } } };
const stagger = { visible: { transition: { staggerChildren: 0.1 } } };
const input =
  "w-full rounded-xl border border-border/50 bg-background/50 px-4 py-3 text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-colors";
const initial: PortalLoginState = {};

export interface LoginPageCopy {
  badge: string;
  headingLead: string;
  headingHighlight: string;
  headingTail: string;
  description: string;
  features: { icon: LucideIcon; title: string; body: string }[];
  rewardsLead: string;
  rewardsLinkLabel: string;
  formTitle: string;
  formSubtitle: string;
  emailLabel: string;
  emailPlaceholder: string;
  passwordLabel: string;
  passwordPlaceholder: string;
  rememberLabel: string;
  forgotLabel: string;
  submitLabel: string;
  submittingLabel: string;
  registerLead: string;
  registerLinkLabel: string;
  registerTail: string;
  privacyNote: string;
}

export default function LoginPageSection(c: LoginPageCopy) {
  const { brand } = useSiteInfo();
  const [state, formAction, pending] = useActionState(portalLoginAction, initial);
  const [show, setShow] = React.useState(false);

  return (
    <section className="relative flex-1 overflow-hidden bg-background pb-20 pt-28 sm:pt-32 lg:pt-36">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-[10%] -top-[20%] h-[60%] w-[60%] animate-blob rounded-full bg-primary/10 blur-[120px] mix-blend-multiply dark:mix-blend-screen" />
        <div className="animation-delay-2000 absolute right-[5%] top-[10%] h-[50%] w-[50%] animate-blob rounded-full bg-secondary/15 blur-[100px] mix-blend-multiply dark:mix-blend-screen" />
        <div className="animation-delay-4000 absolute -bottom-[20%] left-[20%] h-[70%] w-[70%] animate-blob rounded-full bg-brand-accent/15 blur-[140px] mix-blend-multiply dark:mix-blend-screen" />
        <div className="absolute inset-0 bg-grid-slate-900/[0.02] [mask-image:linear-gradient(to_bottom,black,transparent)] dark:bg-grid-slate-400/[0.02]" />
      </div>

      <div className="relative z-10 mx-auto max-w-7xl px-6 lg:px-8">
        <div className="grid grid-cols-1 items-center gap-16 lg:grid-cols-2">
          <motion.div initial="hidden" animate="visible" variants={stagger} className="max-w-xl">
            <motion.div variants={fadeIn} className="mb-6 inline-flex items-center gap-2 rounded-full border border-border/50 bg-muted/40 px-4 py-2 text-sm font-medium text-foreground shadow-sm backdrop-blur-md">
              <Sparkles className="h-4 w-4 animate-pulse text-primary" /> <span>{c.badge}</span>
            </motion.div>
            <motion.h1 variants={fadeIn} className="mb-6 text-5xl font-black leading-[1.1] tracking-tight text-foreground sm:text-6xl">
              {c.headingLead}<span className="bg-gradient-to-r from-primary to-brand-accent bg-clip-text text-transparent">{c.headingHighlight}</span>{c.headingTail}
            </motion.h1>
            <motion.p variants={fadeIn} className="text-xl leading-8 text-muted-foreground">
              {c.description}
            </motion.p>
            <motion.div variants={fadeIn} className="mt-10 space-y-4">
              {c.features.map(({ icon: Icon, title: t, body: b }) => (
                <div key={t} className="flex items-center gap-4 rounded-2xl border border-border/50 bg-muted/30 p-4 transition-colors hover:bg-muted/50">
                  <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-primary/10"><Icon className="h-5 w-5 text-primary" /></div>
                  <div>
                    <p className="font-semibold text-foreground">{t}</p>
                    <p className="text-sm text-muted-foreground">{b}</p>
                  </div>
                </div>
              ))}
            </motion.div>
            {c.rewardsLinkLabel.trim() && (
              <motion.p variants={fadeIn} className="mt-6 text-sm text-muted-foreground">
                {c.rewardsLead}<Link href="/rewards" className="font-semibold text-primary underline">{c.rewardsLinkLabel}</Link>.
              </motion.p>
            )}
          </motion.div>

          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.6 }}>
            <div className="relative mx-auto w-full max-w-xl overflow-hidden rounded-3xl border border-border/50 bg-muted/20 p-8 shadow-2xl backdrop-blur-sm sm:p-12">
              <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent" />
              <form action={formAction} className="relative z-10 space-y-6" noValidate>
                <div>
                  <h2 className="text-2xl font-bold text-foreground">{c.formTitle}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">{brandTokens(c.formSubtitle, brand)}</p>
                </div>
                <div>
                  <label htmlFor="email" className="mb-2 block text-sm font-semibold text-foreground">{c.emailLabel}</label>
                  <input id="email" name="email" type="email" required autoComplete="username" autoFocus className={input} placeholder={c.emailPlaceholder} />
                </div>
                <div>
                  <label htmlFor="password" className="mb-2 block text-sm font-semibold text-foreground">{c.passwordLabel}</label>
                  <div className="relative">
                    <input id="password" name="password" type={show ? "text" : "password"} required autoComplete="current-password" className={`${input} pr-12`} placeholder={c.passwordPlaceholder} />
                    <button type="button" onClick={() => setShow((v) => !v)} aria-label={show ? "Hide password" : "Show password"} tabIndex={-1} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                      {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <label className="flex items-center gap-2 text-muted-foreground">
                    <input type="checkbox" name="remember" className="accent-primary" />{` ${c.rememberLabel}`}
                  </label>
                  <Link href="/clientos/forgot-password" className="font-semibold text-primary hover:underline">{c.forgotLabel}</Link>
                </div>
                {state?.error && <p role="alert" className="rounded-xl bg-red-500/10 px-4 py-3 text-center text-sm text-red-500">{state.error}</p>}
                <button type="submit" disabled={pending} className="group flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-8 py-4 text-sm font-bold text-primary-foreground shadow-lg shadow-primary/20 transition-all hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60">
                  {pending ? <>{`${c.submittingLabel} `}<Loader2 className="h-4 w-4 animate-spin" /></> : <>{`${c.submitLabel} `}<ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" /></>}
                </button>
                <p className="text-center text-sm text-muted-foreground">
                  {c.registerLead}<Link href="/register" className="font-semibold text-primary underline">{c.registerLinkLabel}</Link>{c.registerTail}
                </p>
                <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
                  <ShieldCheck className="h-3.5 w-3.5" />{` ${c.privacyNote}`}
                </p>
              </form>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
