"use client";

import { startTransition, useActionState, useEffect, useId, useState } from "react";
import { motion } from "framer-motion";
import { ArrowRight, Check, Eye, EyeOff, Gift, Loader2, Clock, X } from "lucide-react";
import Link from "next/link";
import { slugFormatError, slugFromName } from "@/lib/platform/tenancy/slug";
import { checkSlugAction, startSignupAction, validateSignupAction, type SignupState } from "./actions";
import type { SignupFieldErrors } from "@/lib/platform/signup";
import CreatingWorkspace from "./CreatingWorkspace";
import { BUSINESS_CATEGORIES, categoryDescription, categoryKeywords, subDescription, CUSTOM_PREFIX, MAX_BUSINESS_CATEGORIES, MAX_BUSINESS_SUBCATEGORIES, cleanCustomName } from "@/lib/platform/business-taxonomy";
import SearchMultiSelect, { type MultiOption, type SearchExtra } from "@/components/platform/SearchMultiSelect";

const CATEGORY_OPTIONS: MultiOption[] = BUSINESS_CATEGORIES.map((c) => ({ value: c.code, label: c.name, description: categoryDescription(c), keywords: categoryKeywords(c) }));

const initialState: SignupState = {};

/** The plan picked on the pricing page (already checked on the server): it starts as a free trial. */
export interface SelectedPlan {
  id: string;
  name: string;
  interval: "monthly" | "yearly";
  trial: string;
  priceLabel: string;
}

/** A quick guide for the person typing: longer and more varied is stronger. The server applies the real rules. */
function strengthOf(p: string): { score: number; label: string; tone: string } {
  if (!p) return { score: 0, label: "", tone: "" };
  let score = 0;
  if (p.length >= 10) score++;
  if (p.length >= 14) score++;
  if (/[a-z]/.test(p) && /[A-Z]/.test(p)) score++;
  if (/\d/.test(p)) score++;
  if (/[^A-Za-z0-9]/.test(p)) score++;
  if (p.length < 10) score = Math.min(score, 1);
  const label = ["Too short", "Weak", "Okay", "Good", "Strong", "Strong"][score];
  const tone = score <= 1 ? "bg-rose-500" : score === 2 ? "bg-amber-500" : "bg-emerald-500";
  return { score, label, tone };
}

function StepHead({ n, title, note }: { n: number; title: string; note: string }) {
  return (
    <div className="flex items-center gap-3 border-b border-border/60 pb-3">
      <span className="sr-circle h-8 w-8 flex-none text-sm font-black">{n}</span>
      <div><p className="text-sm font-black uppercase tracking-widest">{title}</p><p className="text-xs text-muted-foreground">{note}</p></div>
    </div>
  );
}
type SlugCheck = { for: string; state: "idle" | "checking" | "ok" | "bad"; message: string | null };

export default function SignupForm({ rootDomain, approval = false, selectedPlan = null }: { rootDomain: string; approval?: boolean; selectedPlan?: SelectedPlan | null }) {
  const [state, formAction] = useActionState(startSignupAction, initialState);
  // Two phases: the server validates first (`checking`), and only then the creation starts and the progress replaces the form (`creating`).
  const [checking, setChecking] = useState(false);
  const [creating, setCreating] = useState(false);
  const [errors, setErrors] = useState<SignupFieldErrors>({});
  const [companyName, setCompanyName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [check, setCheck] = useState<SlugCheck>({ for: "", state: "idle", message: null });
  const [showPassword, setShowPassword] = useState(false);
  const [pw, setPw] = useState("");
  const [categories, setCategories] = useState<string[]>([]);
  const [subCategories, setSubCategories] = useState<string[]>([]);
  // Sub-categories of the chosen categories, grouped by category.
  const subOptions: MultiOption[] = BUSINESS_CATEGORIES.filter((c) => categories.includes(c.code)).flatMap((c) => c.subs.map((x) => ({ value: x.code, label: x.name, description: subDescription(x, c.name), group: c.name })));
  // Typing in the category field also finds individual business types ("halwai", "welder") inside any category; picking one selects both.
  const categorySearchExtras = (q: string): SearchExtra[] => {
    const out: SearchExtra[] = [];
    for (const c of BUSINESS_CATEGORIES) {
      for (const x of c.subs) {
        if (!x.name.toLowerCase().includes(q)) continue;
        out.push({
          key: x.code,
          label: x.name,
          hint: c.name,
          picked: categories.includes(c.code) && subCategories.includes(x.code),
          onPick: () => {
            if (!categories.includes(c.code)) {
              if (categories.length >= MAX_BUSINESS_CATEGORIES) return;
              setCategories([...categories, c.code]);
            }
            if (!subCategories.includes(x.code) && subCategories.length < MAX_BUSINESS_SUBCATEGORIES) setSubCategories((s) => [...s, x.code]);
          },
        });
        if (out.length >= 40) return out;
      }
    }
    return out;
  };
  const ids = { company: useId(), slug: useId(), email: useId(), password: useId(), terms: useId(), category: useId(), sub: useId() };

  // The creation answered with something to fix (rate limit, address taken a moment ago…): back to the form.
  useEffect(() => {
    if (state.errors) {
      setErrors(state.errors);
      setCreating(false);
    }
    if (state.awaitingApproval) setCreating(false);
  }, [state]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (checking || creating) return;
    const data = new FormData(e.currentTarget);
    setErrors({});
    setChecking(true);
    const pre = await validateSignupAction(data).catch((): { errors?: SignupFieldErrors } => ({ errors: { form: "Something went wrong. Please try again." } }));
    setChecking(false);
    if (pre.errors) {
      setErrors(pre.errors);
      return;
    }
    setCreating(true);
    startTransition(() => formAction(data));
  }

  // Live availability check (debounced). Format problems are answered locally without a round trip.
  useEffect(() => {
    if (!slug) return;
    const local = slugFormatError(slug);
    let cancelled = false;
    const timer = setTimeout(async () => {
      if (local) {
        if (!cancelled) setCheck({ for: slug, state: "bad", message: local });
        return;
      }
      if (!cancelled) setCheck({ for: slug, state: "checking", message: null });
      const res = await checkSlugAction(slug).catch(() => null);
      if (cancelled) return;
      setCheck(res ? { for: slug, state: res.available ? "ok" : "bad", message: res.message } : { for: slug, state: "idle", message: null });
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [slug]);

  if (state.awaitingApproval) {
    return (
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="py-4 text-center">
        <div className="sr-icon mx-auto mb-4 h-14 w-14 rounded-2xl"><Clock className="size-6" /></div>
        <h2 className="text-2xl font-black tracking-tight">Awaiting approval</h2>
        <p className="mt-2 text-muted-foreground">
          Thanks — your workspace request is with our team. We&apos;ll email <strong className="text-foreground">{state.awaitingApproval}</strong> as soon as it&apos;s approved.
        </p>
        <p className="mt-4 text-sm text-muted-foreground">Nothing yet? Approval is done by hand, so it can take a little while. Check spam too.</p>
      </motion.div>
    );
  }

  const fieldError = (msg?: string) => (msg ? <p className="mt-1.5 text-xs font-medium" style={{ color: "#c0262d" }}>{msg}</p> : null);
  // A result only counts for the address it was checked against.
  const current: SlugCheck = check.for === slug ? check : { for: slug, state: "idle", message: null };
  const slugMessage = errors.slug ?? (current.state === "bad" ? current.message : null);
  const inputStyle = { height: 50, borderRadius: 14 } as const;
  const bad = { borderColor: "#c0262d" } as const;

  return (
    <>
      {/* While the workspace is being created the form is hidden (kept mounted, so the submission completes) and the progress is shown instead. */}
      {creating && <CreatingWorkspace companyName={companyName} host={`${slug || "your-company"}.${rootDomain}`} approval={approval} />}
      <motion.div hidden={creating} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
        <div className="mb-7">
          <h2 className="text-3xl font-black tracking-tight">Create your workspace</h2>
          <p className="mt-1.5 text-muted-foreground">{approval ? "Free to start. New workspaces are approved by our team before they go live." : "Free to start. Set up takes a few seconds."}</p>
        </div>
        <form onSubmit={onSubmit} className="space-y-5" noValidate>
          {selectedPlan && (
            <>
              <input type="hidden" name="plan" value={selectedPlan.id} />
              <input type="hidden" name="interval" value={selectedPlan.interval} />
              <div className="flex items-start gap-3 rounded-2xl border border-primary/30 bg-primary/10 p-4" role="note">
                <span className="sr-icon h-10 w-10 flex-none rounded-xl"><Gift className="h-5 w-5" /></span>
                <div className="min-w-0 flex-1 text-sm">
                  <p className="font-black leading-snug">{selectedPlan.name} plan · {selectedPlan.trial} free</p>
                  <p className="mt-0.5 text-muted-foreground">No card needed now. After the trial it is {selectedPlan.priceLabel}; cancel any time.</p>
                  <Link href="/pricing" className="mt-1.5 inline-block text-xs font-bold text-primary hover:underline">Change plan</Link>
                </div>
              </div>
            </>
          )}
          <StepHead n={1} title="Your business" note="Tell us what you run, so we can set it up for you." />
          <div>
            <label htmlFor={ids.company} className="sr-label">Business name</label>
            <input
              id={ids.company}
              name="companyName"
              required
              autoFocus
              autoComplete="organization"
              placeholder="Enter your business name"
              className="sr-input"
              style={{ ...inputStyle, ...(errors.companyName ? bad : null) }}
              value={companyName}
              onChange={(e) => {
                setCompanyName(e.target.value);
                if (!slugEdited) setSlug(slugFromName(e.target.value));
              }}
              aria-invalid={!!errors.companyName || undefined}
            />
            {fieldError(errors.companyName)}
          </div>

          <div>
            <label htmlFor={ids.slug} className="sr-label">Workspace address</label>
            <div className="sr-input flex items-center !p-0 focus-within:!border-[var(--primary)]" style={{ ...inputStyle, ...(slugMessage ? bad : null) }}>
              <input
                id={ids.slug}
                name="slug"
                required
                placeholder="Enter your workspace address"
                value={slug}
                onChange={(e) => {
                  setSlugEdited(true);
                  setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""));
                }}
                className="h-full min-w-0 flex-1 bg-transparent px-4 text-[15px] outline-none"
                aria-invalid={!!slugMessage || undefined}
                aria-describedby={`${ids.slug}-status`}
              />
              <span className="shrink-0 rounded-r-[13px] bg-muted/60 px-3.5 py-3.5 text-sm font-semibold text-muted-foreground">.{rootDomain}</span>
            </div>
            <p id={`${ids.slug}-status`} className="mt-1.5 flex items-center gap-1 text-xs" style={{ color: slugMessage ? "#c0262d" : undefined }} aria-live="polite">
              {current.state === "checking" && <Loader2 className="size-3 animate-spin" />}
              {current.state === "ok" && !errors.slug && <Check className="size-3 text-emerald-600" />}
              {slugMessage && <X className="size-3" />}
              <span className={slugMessage ? "" : "text-muted-foreground"}>{slugMessage ?? (current.state === "ok" ? "Available" : "Your team signs in here. You can add your own domain later.")}</span>
            </p>
          </div>

          <div>
            <label htmlFor={ids.category} className="sr-label">Business categories</label>
            <SearchMultiSelect
              id={ids.category}
              name="businessCategory"
              options={CATEGORY_OPTIONS}
              values={categories}
              onChange={(next) => {
                setCategories(next);
                // Drop sub-categories whose category was just removed.
                setSubCategories((subs) => subs.filter((c) => c.startsWith(CUSTOM_PREFIX) || next.includes(c.split(":")[0])));
              }}
              placeholder="Enter your business categories (up to 5)"
              searchPlaceholder="Enter your business category"
              title="Business categories"
              customLabel="category"
              searchExtras={categorySearchExtras}
              customExample="Flat broker"
              max={MAX_BUSINESS_CATEGORIES}
              customPrefix={CUSTOM_PREFIX}
              cleanCustom={cleanCustomName}
              invalid={!!errors.businessCategories}
            />
            {fieldError(errors.businessCategories)}
          </div>

          <div>
            <label htmlFor={ids.sub} className="sr-label">Sub-categories</label>
            <SearchMultiSelect
              id={ids.sub}
              name="businessSubCategory"
              options={subOptions}
              values={subCategories}
              onChange={setSubCategories}
              disabled={categories.length === 0}
              placeholder={categories.length === 0 ? "Choose a business category first" : "Enter your sub-categories (up to 50)"}
              searchPlaceholder="Enter your sub-category"
              title="Sub-categories"
              customLabel="sub-category"
              customExample="Rental flats"
              max={MAX_BUSINESS_SUBCATEGORIES}
              customPrefix={CUSTOM_PREFIX}
              cleanCustom={cleanCustomName}
              invalid={!!errors.businessSubCategories}
            />
            {fieldError(errors.businessSubCategories)}
          </div>

          <div className="pt-2"><StepHead n={2} title="Your account" note="You will use these to sign in." /></div>
          <div>
            <label htmlFor={ids.email} className="sr-label">Email address</label>
            <input id={ids.email} name="email" type="email" required autoComplete="email" placeholder="Enter your email address" className="sr-input" style={{ ...inputStyle, ...(errors.email ? bad : null) }} aria-invalid={!!errors.email || undefined} />
            {fieldError(errors.email)}
          </div>

          <div>
            <label htmlFor={ids.password} className="sr-label">Password</label>
            <div className="relative">
              <input id={ids.password} name="password" type={showPassword ? "text" : "password"} required minLength={10} autoComplete="new-password" placeholder="Enter your password" className="sr-input" style={{ ...inputStyle, paddingRight: 48, ...(errors.password ? bad : null) }} aria-invalid={!!errors.password || undefined}  value={pw} onChange={(e) => setPw(e.target.value)} />
              <button type="button" onClick={() => setShowPassword((v) => !v)} className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground" aria-label={showPassword ? "Hide password" : "Show password"} tabIndex={-1}>
                {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
            {fieldError(errors.password) ?? (
              pw ? (
                <div className="mt-2" aria-live="polite">
                  <div className="flex gap-1.5" aria-hidden>{[1, 2, 3, 4].map((n) => <span key={n} className={`h-1.5 flex-1 rounded-full ${strengthOf(pw).score >= n ? strengthOf(pw).tone : "bg-border"}`} />)}</div>
                  <p className="mt-1.5 text-xs text-muted-foreground"><b className="text-foreground">{strengthOf(pw).label}.</b> Use at least 10 characters. A longer password with a mix of letters, numbers and symbols is stronger.</p>
                </div>
              ) : <p className="mt-1.5 text-xs text-muted-foreground">At least 10 characters. A longer password with a mix of letters, numbers and symbols is stronger.</p>
            )}
          </div>

          <div>
            <label htmlFor={ids.terms} className="flex items-start gap-3 text-sm leading-snug text-muted-foreground">
              <input id={ids.terms} name="acceptTerms" type="checkbox" className="mt-0.5 size-[18px] accent-[var(--primary)]" />
              <span>I agree to the <Link href="/terms" target="_blank" className="font-semibold text-primary underline-offset-2 hover:underline">Terms of Service</Link> and <Link href="/privacy" target="_blank" className="font-semibold text-primary underline-offset-2 hover:underline">Privacy Policy</Link>.</span>
            </label>
            {fieldError(errors.acceptTerms)}
          </div>

          {errors.form && (
            <p role="alert" className="rounded-xl px-4 py-3 text-sm font-medium" style={{ background: "#c0262d1a", color: "#c0262d" }}>
              {errors.form}
            </p>
          )}
          <button type="submit" disabled={checking || creating} className="group inline-flex w-full items-center justify-center gap-2 rounded-full bg-foreground px-6 py-4 text-base font-black text-background shadow-xl transition-all hover:scale-[1.02] disabled:opacity-70">
            {checking ? (
              <>
                <Loader2 className="size-5 animate-spin" /> Checking…
              </>
            ) : (
              <>
                {approval ? "Request workspace" : "Create workspace"}
                <ArrowRight className="size-5 transition-transform group-hover:translate-x-1" />
              </>
            )}
          </button>
          <ul className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 text-xs font-semibold text-muted-foreground">
            {["Free to start", "No card needed", "Every feature included"].map((t) => <li key={t} className="inline-flex items-center gap-1.5"><Check className="size-3.5 text-emerald-600" strokeWidth={3} />{t}</li>)}
          </ul>
          <p className="text-center text-sm text-muted-foreground">
            Already have a workspace? <Link href="/login" className="font-bold text-primary hover:underline">Log in</Link>
          </p>
        </form>
      </motion.div>
    </>
  );
}
