"use client";

import { startTransition, useActionState, useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion, MotionConfig } from "framer-motion";
import { ArrowLeft, ArrowRight, AtSign, Building2, Check, CheckCircle2, Circle, Clock, Eye, EyeOff, Gift, Globe, Info, LayoutGrid, Loader2, Lock, MonitorSmartphone, PackageCheck, Search, ShieldCheck, Sparkles, UserRound, X } from "lucide-react";
import { ALL_PRODUCTS_VALUE, SITES_MODULE, billableCount, parseSelection } from "@/lib/platform/products/selection";
import { slugFormatError, slugFromName } from "@/lib/platform/tenancy/slug";
import type { SignupFieldErrors } from "@/lib/platform/signup";
import { BUSINESS_CATEGORIES, categoryDescription, categoryKeywords, subDescription, CUSTOM_PREFIX, MAX_BUSINESS_CATEGORIES, MAX_BUSINESS_SUBCATEGORIES, cleanCustomName } from "@/lib/platform/business-taxonomy";
import SearchMultiSelect, { type MultiOption, type SearchExtra } from "@/components/platform/SearchMultiSelect";
import ProductLogo from "@/components/products/ProductLogo";
import Logo from "@/components/platform/saas/Logo";
import ThemeToggle from "@/components/platform/saas/ThemeToggle";
import { cn } from "@/lib/utils";
import { checkSlugAction, startSignupAction, validateSignupAction, type SignupState } from "./actions";
import CreatingWorkspace from "./CreatingWorkspace";

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

type SlugCheck = { for: string; state: "idle" | "checking" | "ok" | "bad"; message: string | null };

const STEPS = [
  { title: "Products", hint: "Choose what you need", icon: PackageCheck, heading: "What do you want to use?", note: "Pick one or more. You can add or remove products later." },
  { title: "Business", hint: "Name and address", icon: Building2, heading: "Tell us about your business", note: "A few details so your workspace is ready for your kind of work." },
  { title: "Account", hint: "Your sign-in", icon: UserRound, heading: "Create your sign-in", note: "Last step. Check your choices and create the workspace." },
] as const;

/** The filters above the product cards. */
const GROUPS: { id: string; title: string; keys: string[] }[] = [
  { id: "", title: "All", keys: [] },
  { id: "grow", title: "Sales", keys: ["lms", "smms", "cms"] },
  { id: "people", title: "People", keys: ["hrms", "tms", "ots"] },
  { id: "money", title: "Money", keys: ["fms", "prms"] },
  { id: "work", title: "Work", keys: ["pms", "sop", "lpms", "dlms"] },
  { id: "team", title: "AI & team", keys: ["aibots", "messenger"] },
];

/** The three things each product card names. */
const TAGS: Record<string, string[]> = {
  lms: ["Leads", "Pipeline", "Offers"], smms: ["Posts", "Calendar", "Ads"], cms: ["Website", "SEO", "Client portal"], hrms: ["Attendance", "Leave", "Payroll"],
  tms: ["Batches", "Attendance", "Certificates"], ots: ["Tests", "Anti-cheat", "Results"], fms: ["Invoices", "GST", "Reports"], pms: ["Tasks", "Boards", "Timesheets"],
  prms: ["Vendors", "Orders", "Expenses"], sop: ["Policies", "Approvals", "Read receipts"], lpms: ["Contracts", "E-sign", "Templates"], dlms: ["Passwords", "Documents", "Expiry alerts"],
  aibots: ["Chatbots", "AI calls", "Training"], messenger: ["Chat", "Meetings", "Calls"],
};

/** A few common kinds of business, one tap away. */
const QUICK_CATEGORIES = [/retail|shop/i, /software|information tech/i, /consult/i, /school|education|coaching/i, /health|clinic|doctor/i, /restaurant|food/i, /manufactur/i, /real estate|property/i, /travel|tour/i, /construction|contractor/i]
  .map((pattern) => BUSINESS_CATEGORIES.find((c) => pattern.test(c.name)))
  .filter((c, i, all): c is (typeof BUSINESS_CATEGORIES)[number] => Boolean(c) && all.indexOf(c) === i);

/** What every workspace has, shown in the preview. */
const ALWAYS = [{ key: "workspace", name: "CommandOS" }, { key: "intelligence", name: "DataBrain" }, { key: "support", name: "ResolveIQ" }];

/** Which step shows each field, so an answer from the server opens the right one. */
const STEP_OF: Partial<Record<keyof SignupFieldErrors, number>> = { product: 0, companyName: 1, slug: 1, websiteUrl: 1, websiteMode: 1, businessCategories: 1, businessSubCategories: 1 };
const stepErrors = (errors: SignupFieldErrors, step: number) => Object.fromEntries(Object.entries(errors).filter(([k]) => (STEP_OF[k as keyof SignupFieldErrors] ?? 2) === step || k === "form")) as SignupFieldErrors;
const firstStepWith = (errors: SignupFieldErrors) => Math.min(2, ...Object.keys(errors).map((k) => STEP_OF[k as keyof SignupFieldErrors] ?? 2));

const WEBSITE_CHOICES = [
  { value: "platform", icon: Sparkles, title: "Make my website", text: "We build it for you." },
  { value: "external", icon: Globe, title: "I have a website", text: "Keep it, use the software." },
  { value: "none", icon: MonitorSmartphone, title: "No website", text: "Only the software." },
];

const ALL_DESCRIPTION = "Run the whole business from one place: sales, marketing, website, HR, training, tests, accounts, projects, buying, documents, contracts, secure locker, AI assistants, team chat.";

export default function SignupForm({ rootDomain, approval = false, selectedPlan = null, products, initialProduct = "", allNote = null, oneNote = null }: { rootDomain: string; approval?: boolean; selectedPlan?: SelectedPlan | null; products: MultiOption[]; initialProduct?: string; allNote?: string | null; oneNote?: string | null }) {
  const [step, setStep] = useState(0);
  const [picked, setPicked] = useState<string[]>(initialProduct ? [initialProduct] : []);
  // "All products" stands alone: picking it clears the others, picking a product clears it.
  const toggleProduct = (value: string) => {
    setErrors((e) => ({ ...e, product: undefined }));
    setPicked((now) => (now.includes(value) ? now.filter((v) => v !== value) : value === ALL_PRODUCTS_VALUE ? [value] : [...now.filter((v) => v !== ALL_PRODUCTS_VALUE), value]));
  };
  const [find, setFind] = useState("");
  const [group, setGroup] = useState("");
  // The product whose full description is shown under the cards.
  const [about, setAbout] = useState(initialProduct);
  const allPicked = picked.includes(ALL_PRODUCTS_VALUE);
  // More than one paid product starts a paid plan's trial; one stays on the free plan.
  const several = allPicked || (billableCount(parseSelection(picked)) ?? 0) > 1;
  const [websiteMode, setWebsiteMode] = useState("platform");
  // Whether we make their website (SiteCraft, or all products with "make my website"): then it gets its own address beside the app's.
  const makesWebsite = picked.includes(SITES_MODULE) || (allPicked && websiteMode === "platform");
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
  const ids = { product: useId(), site: useId(), siteUrl: useId(), company: useId(), slug: useId(), email: useId(), password: useId(), terms: useId(), category: useId(), sub: useId() };

  const companyRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const goTo = (next: number) => {
    setStep(next);
    setTimeout(() => (next === 1 ? companyRef : next === 2 ? emailRef : null)?.current?.focus({ preventScroll: true }), 60);
  };

  // The creation answered with something to fix (rate limit, address taken a moment ago…): back to the form, on that step.
  /* eslint-disable react-hooks/set-state-in-effect -- reacts once to the server action's answer */
  useEffect(() => {
    if (state.errors) {
      setErrors(state.errors);
      setStep(firstStepWith(state.errors));
      setCreating(false);
    }
    if (state.awaitingApproval) setCreating(false);
  }, [state]);
  /* eslint-enable react-hooks/set-state-in-effect */

  /** The "Continue" of steps 1 and 2 and the final "Create workspace": the same server rules, applied to the step shown. */
  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (checking || creating) return;
    if (step === 0) {
      if (!parseSelection(picked)) {
        setErrors({ product: "Choose a product, or All products." });
        return;
      }
      setErrors({});
      goTo(1);
      return;
    }
    const data = new FormData(e.currentTarget);
    setErrors({});
    setChecking(true);
    const pre = await validateSignupAction(data).catch((): { errors?: SignupFieldErrors } => ({ errors: { form: "Something went wrong. Please try again." } }));
    setChecking(false);
    if (step === 1) {
      const mine = stepErrors(pre.errors ?? {}, 1);
      if (Object.keys(mine).length) setErrors(mine);
      else goTo(2);
      return;
    }
    if (pre.errors) {
      setErrors(pre.errors);
      setStep(firstStepWith(pre.errors));
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

  const fieldError = (msg?: string) => (
    <AnimatePresence>
      {msg && (
        <motion.p role="alert" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto", x: [0, -5, 5, 0] }} exit={{ opacity: 0, height: 0 }} className="mt-1 text-xs font-medium" style={{ color: "#c0262d" }}>
          {msg}
        </motion.p>
      )}
    </AnimatePresence>
  );
  // A result only counts for the address it was checked against.
  const current: SlugCheck = check.for === slug ? check : { for: slug, state: "idle", message: null };
  const slugMessage = errors.slug ?? (current.state === "bad" ? current.message : null);
  const input = "sr-input !h-11 !rounded-xl !py-0 !pl-10 !text-sm transition-shadow focus:!shadow-[0_0_0_4px_color-mix(in_oklch,var(--primary)_16%,transparent)] [@media(max-height:760px)]:!h-10 [@media(min-height:860px)]:!h-12";
  const fieldIcon = "pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground transition-colors peer-focus:text-primary";
  const select = "!min-h-11 !rounded-xl !px-3 flex-nowrap overflow-hidden transition-colors hover:!border-primary/50 [@media(max-height:760px)]:!min-h-10 [@media(min-height:860px)]:!min-h-12";
  const box = "rounded-[18px] border border-border/70 bg-background p-3 [@media(min-height:860px)]:px-4 [@media(min-height:1020px)]:p-5";
  const boxHead = (Icon: typeof Globe, title: string, note: string) => (
    <div className="mb-2.5 flex items-center gap-2.5 [@media(max-height:760px)]:mb-1.5">
      <span className="flex size-8 flex-none items-center justify-center rounded-lg bg-primary/10 text-primary [@media(max-height:760px)]:hidden"><Icon className="size-4" /></span>
      <span className="min-w-0"><span className="block text-sm font-black leading-tight">{title}</span><span className="block text-[11px] text-muted-foreground [@media(max-height:760px)]:hidden">{note}</span></span>
    </div>
  );
  const chip = (key: string, text: string, on: boolean, onClick: () => void) => (
    <motion.button key={key} type="button" whileTap={{ scale: 0.94 }} aria-pressed={on} onClick={onClick} className={cn("inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors", on ? "border-primary bg-primary text-primary-foreground" : "border-border/70 text-muted-foreground hover:border-primary/50 hover:bg-primary/5 hover:text-foreground")}>
      {on && <Check className="size-3" strokeWidth={3} />}{text}
    </motion.button>
  );
  const toggleCategory = (code: string) => {
    if (categories.includes(code)) {
      setCategories(categories.filter((c) => c !== code));
      setSubCategories((subs) => subs.filter((c) => c.startsWith(CUSTOM_PREFIX) || c.split(":")[0] !== code));
    } else if (categories.length < MAX_BUSINESS_CATEGORIES) setCategories([...categories, code]);
  };
  const toggleSub = (code: string) => setSubCategories((subs) => (subs.includes(code) ? subs.filter((c) => c !== code) : subs.length < MAX_BUSINESS_SUBCATEGORIES ? [...subs, code] : subs));
  const label = "sr-label !mb-1 !text-[13px]";
  const bad = { borderColor: "#c0262d" } as const;
  const nameOf = (v: string) => (v === ALL_PRODUCTS_VALUE ? "All products" : (products.find((p) => p.value === v)?.label ?? v));
  const q = find.trim().toLowerCase();
  const groupKeys = GROUPS.find((g) => g.id === group)?.keys ?? [];
  const shown = products.filter((p) => (q ? `${p.label} ${p.description ?? ""} ${(p.keywords ?? []).join(" ")}`.toLowerCase().includes(q) : !group || groupKeys.includes(p.value)));
  const aboutText = about === ALL_PRODUCTS_VALUE ? ALL_DESCRIPTION : products.find((p) => p.value === about)?.description;
  const planNote = (several ? allNote : picked.length ? oneNote : null) ?? null;
  // The products the preview shows: all of them, or the ones picked.
  const previewKeys = allPicked ? products.map((p) => p.value) : picked;
  const host = `${slug || "your-business"}${makesWebsite && slug ? "-app" : ""}.${rootDomain}`;
  const rules = [
    { ok: pw.length >= 10, text: "10 or more characters" },
    { ok: /[a-z]/.test(pw) && /[A-Z]/.test(pw), text: "Capital and small letters" },
    { ok: /\d/.test(pw), text: "A number" },
    { ok: /[^A-Za-z0-9]/.test(pw), text: "A symbol" },
  ];

  const card = (value: string, title: string, text: string, wide: boolean, order: number) => {
    const on = picked.includes(value);
    const all = value === ALL_PRODUCTS_VALUE;
    return (
      <motion.button
        key={value}
        layout
        type="button"
        role="checkbox"
        aria-checked={on}
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.92 }}
        transition={{ duration: 0.28, delay: Math.min(order, 15) * 0.02 }}
        whileHover={{ y: -4 }}
        whileTap={{ scale: 0.97 }}
        onClick={() => {
          setAbout(value);
          toggleProduct(value);
        }}
        onMouseEnter={() => setAbout(value)}
        onFocus={() => setAbout(value)}
        className={cn(
          "group relative flex min-h-0 min-w-0 flex-col overflow-hidden rounded-[18px] border p-2.5 text-left transition-[border-color,box-shadow,background-color] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 md:max-h-[210px] [@media(max-height:760px)]:p-2 [@media(min-height:860px)]:p-3",
          all
            ? cn("col-span-2 border-transparent bg-gradient-to-br from-primary to-brand-accent text-white shadow-lg shadow-primary/25", on && "ring-4 ring-primary/35")
            : on
              ? "border-primary bg-primary/[0.08] shadow-xl shadow-primary/15 ring-1 ring-primary"
              : "border-border/70 bg-background shadow-sm hover:border-primary/50 hover:shadow-xl hover:shadow-primary/10",
          wide && "col-span-2"
        )}
      >
        <span aria-hidden className={cn("pointer-events-none absolute -right-10 -top-12 size-28 rounded-full blur-2xl transition-opacity duration-500", all ? "bg-white/25" : cn("bg-primary/20", on ? "opacity-100" : "opacity-0 group-hover:opacity-80"))} />
        <span className="relative flex flex-none items-center gap-2.5">
          <span className="flex-none transition-transform duration-300 group-hover:-rotate-6 group-hover:scale-110">
            {all ? (
              <span className="flex size-8 items-center justify-center rounded-xl bg-white/20 text-white [@media(min-height:860px)]:size-9"><LayoutGrid className="size-5" /></span>
            ) : (
              <ProductLogo productKey={value} size={44} className="!size-8 [@media(min-height:860px)]:!size-9" />
            )}
          </span>
          <span className="min-w-0 flex-1 pr-5">
            <span className="block truncate text-[13px] font-black leading-tight tracking-tight [@media(min-height:860px)]:text-[15px]" title={title}>{title}</span>
            {all && <span className="mt-0.5 inline-block rounded-full bg-white/20 px-1.5 text-[10px] font-bold [@media(max-height:760px)]:hidden">{products.length} products</span>}
          </span>
        </span>
        <span className={cn("relative mt-1.5 line-clamp-2 flex-none text-[11px] leading-snug [@media(max-height:690px)]:mt-1 [@media(max-height:690px)]:line-clamp-1 [@media(min-height:860px)]:mt-1.5 [@media(min-height:860px)]:line-clamp-1 [@media(min-height:860px)]:text-xs [@media(min-height:1020px)]:mt-2 [@media(min-height:1020px)]:line-clamp-3", all ? "text-white/90" : "text-muted-foreground")}>{text}</span>
        <span className="relative mt-auto hidden h-7 flex-none flex-nowrap items-end gap-1 overflow-hidden pt-1 [@media(min-height:860px)]:flex">
          {all
            ? <span className="flex -space-x-1.5">{products.slice(0, 9).map((p) => <ProductLogo key={p.value} productKey={p.value} size={24} className="rounded-md ring-2 ring-white/70" />)}</span>
            : (TAGS[value] ?? []).map((t) => <span key={t} className={cn("flex-none whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-semibold", on ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground")}>{t}</span>)}
        </span>
        <span className={cn("absolute right-2.5 top-2.5 flex size-5 items-center justify-center rounded-full border-2 transition-colors", all ? (on ? "border-white bg-white text-primary" : "border-white/70") : on ? "border-primary bg-primary text-primary-foreground" : "border-border group-hover:border-primary/60")} aria-hidden>
          <AnimatePresence>{on && <motion.span initial={{ scale: 0, rotate: -90 }} animate={{ scale: 1, rotate: 0 }} exit={{ scale: 0 }} transition={{ type: "spring", stiffness: 500, damping: 18 }}><Check className="size-3" strokeWidth={4} /></motion.span>}</AnimatePresence>
        </span>
      </motion.button>
    );
  };

  /** One step's panel: always in the form (so everything is sent), shown and slid in when it is the current one. */
  const panel = (i: number, children: React.ReactNode) => (
    <motion.section key={i} aria-label={STEPS[i].title} initial={false} animate={step === i ? { opacity: 1, x: 0 } : { opacity: 0, x: i < step ? -48 : 48 }} transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }} className={step === i ? "flex min-h-0 flex-1 flex-col" : "hidden"}>
      {children}
    </motion.section>
  );

  const preview = (
    <aside className="relative hidden min-h-0 flex-col justify-between gap-4 overflow-hidden border-r border-border/60 bg-gradient-to-br from-primary/[0.12] via-background to-brand-accent/[0.12] p-8 lg:flex xl:p-12 [@media(max-height:700px)]:!py-5" aria-label="Preview of your workspace">
      <div className="sr-blobs" aria-hidden>
        <span className="-left-[10%] -top-[10%] h-[30vw] w-[30vw] bg-primary/20 blur-[110px]" />
        <span className="bottom-[5%] right-[-10%] h-[26vw] w-[26vw] bg-brand-accent/20 blur-[100px]" style={{ animationDelay: "-4s" }} />
      </div>
      <div className="relative"><Logo /></div>
      <div className="relative min-h-0">
        <p className="text-3xl font-black leading-[1.1] tracking-tight xl:text-4xl [@media(max-height:700px)]:!text-2xl">
          The business that <span className="bg-gradient-to-r from-primary to-brand-accent bg-clip-text text-transparent">runs itself.</span>
        </p>
        <p className="mt-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-primary">
          <span className="relative flex size-2"><span className="absolute inset-0 animate-ping rounded-full bg-emerald-500/60" /><span className="size-2 rounded-full bg-emerald-500" /></span>
          Your workspace, as you build it
        </p>

        <motion.div initial={{ opacity: 0, y: 24, rotateX: 12 }} animate={{ opacity: 1, y: 0, rotateX: 0 }} transition={{ duration: 0.7, ease: "easeOut" }} className="mt-4 overflow-hidden rounded-2xl border border-border/70 bg-background shadow-[0_30px_70px_-30px] shadow-primary/40 [@media(max-height:700px)]:mt-3">
          <div className="flex items-center gap-2 border-b border-border/60 bg-muted/50 px-3 py-2">
            <span className="flex gap-1" aria-hidden><i className="size-2 rounded-full bg-rose-400" /><i className="size-2 rounded-full bg-amber-400" /><i className="size-2 rounded-full bg-emerald-400" /></span>
            <span className="flex min-w-0 flex-1 items-center gap-1.5 rounded-full bg-background px-2.5 py-1 text-[11px] text-muted-foreground"><Lock className="size-3 flex-none text-emerald-600" /><span className="truncate font-semibold text-foreground">{host}</span></span>
          </div>
          <div className="p-3">
            <div className="flex items-center gap-2.5">
              <motion.span key={companyName.trim()[0] ?? "w"} initial={{ scale: 0.5, rotate: -20 }} animate={{ scale: 1, rotate: 0 }} className="flex size-9 flex-none items-center justify-center rounded-xl bg-gradient-to-br from-primary to-brand-accent text-base font-black text-white">{(companyName.trim()[0] ?? "W").toUpperCase()}</motion.span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-black">{companyName.trim() || "Your business"}</span>
                <span className="block truncate text-[11px] text-muted-foreground">{categories.length ? CATEGORY_OPTIONS.find((c) => c.value === categories[0])?.label ?? categories[0].replace(CUSTOM_PREFIX, "") : "Workspace"}</span>
              </span>
            </div>
            <div className="mt-3 grid min-h-[84px] grid-cols-7 content-start gap-1.5 rounded-xl bg-muted/40 p-2">
              <AnimatePresence mode="popLayout">
                {previewKeys.map((k, i) => (
                  <motion.span key={k} layout initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0, opacity: 0 }} transition={{ type: "spring", stiffness: 420, damping: 22, delay: allPicked ? i * 0.03 : 0 }} title={nameOf(k)} className="flex justify-center">
                    <ProductLogo productKey={k} size={30} />
                  </motion.span>
                ))}
              </AnimatePresence>
              {previewKeys.length === 0 && <span className="col-span-7 flex h-[68px] items-center justify-center text-center text-[11px] text-muted-foreground">Pick a product and it appears here.</span>}
            </div>
            <div className="mt-2 flex items-center gap-1.5 [@media(max-height:640px)]:hidden">
              {ALWAYS.map((a) => (
                <span key={a.key} className="inline-flex min-w-0 items-center gap-1 rounded-full border border-border/60 px-1.5 py-0.5 text-[10px] font-bold"><ProductLogo productKey={a.key} size={14} />{a.name}</span>
              ))}
              <span className="text-[10px] text-muted-foreground">included</span>
            </div>
            {makesWebsite && (
              <motion.p initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="mt-2 flex items-center gap-1.5 truncate rounded-lg bg-emerald-500/10 px-2 py-1.5 text-[11px] font-semibold">
                <Globe className="size-3.5 flex-none text-emerald-600" /><span className="truncate">Website: {slug || "your-business"}.{rootDomain}</span>
              </motion.p>
            )}
          </div>
        </motion.div>
      </div>
      <p className="relative flex items-center gap-2 text-[13px] text-muted-foreground"><ShieldCheck className="h-4 w-4 flex-none text-primary" />Your data is kept separate from every other business&apos;s.</p>
    </aside>
  );

  const waiting = Boolean(state.awaitingApproval);

  return (
    <MotionConfig reducedMotion="user">
      {/* One screen: the page never scrolls. The steps stay at the top and the buttons at the bottom; only the middle may scroll. */}
      <main className="grid h-dvh overflow-hidden lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)]">
        {preview}
        <div className="flex min-h-0 min-w-0 flex-col">
          <div className="flex flex-none items-center justify-between gap-3 px-4 py-2.5 sm:px-8">
            <div className="lg:invisible"><Logo /></div>
            <div className="flex items-center gap-3">
              <ThemeToggle />
            </div>
          </div>

          {waiting ? (
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="m-auto max-w-md px-6 pb-16 text-center">
              <div className="sr-icon mx-auto mb-4 h-14 w-14 rounded-2xl"><Clock className="size-6" /></div>
              <h2 className="text-2xl font-black tracking-tight">Awaiting approval</h2>
              <p className="mt-2 text-muted-foreground">
                Thanks — your workspace request is with our team. We&apos;ll email <strong className="text-foreground">{state.awaitingApproval}</strong> as soon as it&apos;s approved.
              </p>
              <p className="mt-4 text-sm text-muted-foreground">Nothing yet? Approval is done by hand, so it can take a little while. Check spam too.</p>
            </motion.div>
          ) : (
            <>
              {/* While the workspace is being created the form is hidden (kept mounted, so the submission completes) and the progress is shown instead. */}
              {creating && (
                <div className="m-auto w-full max-w-lg overflow-y-auto px-5 pb-8">
                  <CreatingWorkspace companyName={companyName} host={`${slug || "your-company"}.${rootDomain}`} approval={approval} website={makesWebsite} />
                </div>
              )}
              <form onSubmit={onSubmit} noValidate className={cn("flex min-h-0 flex-1 flex-col", creating && "hidden")}>
                {/* ── steps: always in the same place ── */}
                <div className="flex-none px-4 pb-1 sm:px-8">
                  <ol className="mx-auto flex w-full max-w-5xl items-start sm:items-center" aria-label="Sign-up progress">
                    {STEPS.map((s, i) => {
                      const done = i < step;
                      const now = i === step;
                      return (
                        <li key={s.title} className={cn("flex min-w-0 items-start sm:items-center", i < STEPS.length - 1 && "flex-1")}>
                          <button type="button" disabled={!done} onClick={() => goTo(i)} aria-current={now ? "step" : undefined} className="group flex flex-none flex-col items-center gap-1 text-center disabled:cursor-default sm:flex-row sm:gap-3 sm:text-left">
                            <span className="relative flex size-10 flex-none items-center justify-center [@media(max-height:760px)]:size-9">
                              {now && <motion.span aria-hidden className="absolute inset-0 rounded-full bg-primary/30" animate={{ scale: [1, 1.45], opacity: [0.7, 0] }} transition={{ duration: 1.8, repeat: Infinity }} />}
                              <span className={cn("relative flex size-full items-center justify-center rounded-full border-2 transition-colors duration-300", now ? "border-transparent bg-gradient-to-br from-primary to-brand-accent text-white shadow-lg shadow-primary/35" : done ? "border-transparent bg-emerald-500 text-white group-hover:bg-emerald-600" : "border-border bg-background text-muted-foreground")}>
                                {done ? <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }}><Check className="size-5" strokeWidth={3} /></motion.span> : <s.icon className="size-4" />}
                              </span>
                            </span>
                            <span className="min-w-0">
                              <span className="hidden text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground xl:block">Step {i + 1}</span>
                              <span className={cn("block text-[11px] font-black leading-tight sm:text-sm", !now && !done && "text-muted-foreground")}>{s.title}</span>
                              <span className="hidden max-w-36 truncate text-[11px] text-muted-foreground md:block">{done ? (i === 0 ? (allPicked ? "All products" : `${picked.length} chosen`) : companyName || s.hint) : s.hint}</span>
                            </span>
                          </button>
                          {i < STEPS.length - 1 && (
                            <span aria-hidden className="mx-2 mt-[18px] h-[3px] min-w-4 flex-1 overflow-hidden rounded-full bg-border sm:mx-4 sm:mt-0">
                              <motion.span className="block h-full rounded-full bg-gradient-to-r from-emerald-500 to-primary" initial={false} animate={{ width: done ? "100%" : "0%" }} transition={{ duration: 0.6, ease: "easeInOut" }} />
                            </span>
                          )}
                        </li>
                      );
                    })}
                  </ol>
                </div>

                {selectedPlan && (
                  <>
                    <input type="hidden" name="plan" value={selectedPlan.id} />
                    <input type="hidden" name="interval" value={selectedPlan.interval} />
                  </>
                )}
                {picked.map((v) => <input key={v} type="hidden" name="product" value={v} />)}

                {/* ── the step itself: fills the space between the steps and the buttons ── */}
                <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-4 sm:px-8">
                  {/* The product cards share exactly the space there is; the other steps may grow (and scroll) when they need to. */}
                  <div className={cn("mx-auto flex w-full max-w-5xl flex-col py-3 [@media(min-height:860px)]:py-4", step === 0 ? "min-h-full md:h-full md:min-h-0" : "min-h-full")}>
                    <motion.div key={`heading-${step}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mb-2.5 flex-none [@media(min-height:860px)]:mb-4">
                      <h1 className="text-xl font-black tracking-tight sm:text-2xl [@media(min-height:860px)]:text-3xl">{STEPS[step].heading}</h1>
                      <p className="mt-0.5 text-sm text-muted-foreground [@media(max-height:760px)]:hidden">{STEPS[step].note}</p>
                    </motion.div>
                    {selectedPlan && (
                      <div className="mb-3 flex flex-none items-center gap-3 rounded-xl border border-primary/30 bg-primary/10 px-3 py-2 text-xs" role="note">
                        <Gift className="h-4 w-4 flex-none text-primary" />
                        <p className="min-w-0 flex-1"><b>{selectedPlan.name} plan · {selectedPlan.trial} free.</b> <span className="text-muted-foreground">No card needed now; after the trial it is {selectedPlan.priceLabel}.</span></p>
                        <Link href="/pricing" className="flex-none font-bold text-primary hover:underline">Change</Link>
                      </div>
                    )}

                    {/* ── 1. Products ── */}
                    {panel(0, (
                      <>
                        <div className="flex flex-none flex-col gap-2 md:flex-row md:items-center md:justify-between">
                          <div className="flex min-w-0 gap-1 overflow-x-auto rounded-full border border-border/60 bg-muted/40 p-1 [scrollbar-width:none]" role="tablist" aria-label="Product groups">
                            {GROUPS.map((g) => {
                              const on = !q && group === g.id;
                              return (
                                <button key={g.id} type="button" role="tab" aria-selected={on} onClick={() => { setGroup(g.id); setFind(""); }} className={cn("relative flex-none whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-bold transition-colors", on ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>
                                  {on && <motion.span layoutId="signup-group" className="absolute inset-0 rounded-full bg-primary shadow-md shadow-primary/30" transition={{ type: "spring", stiffness: 400, damping: 32 }} />}
                                  <span className="relative">{g.title}</span>
                                </button>
                              );
                            })}
                          </div>
                          <label className="flex h-10 flex-none items-center gap-2 rounded-full border border-border/70 bg-background px-3.5 text-muted-foreground transition-shadow focus-within:border-primary focus-within:ring-4 focus-within:ring-primary/15 md:w-60">
                            <Search className="size-4 flex-none" aria-hidden />
                            <input type="search" value={find} onChange={(e) => setFind(e.target.value)} onKeyDown={(e) => e.key === "Enter" && e.preventDefault()} placeholder="Search: payroll, invoices…" aria-label="Search products by work" className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none [&::-webkit-search-cancel-button]:hidden" style={{ outline: "none", boxShadow: "none" }} />
                            {find && <button type="button" onClick={() => setFind("")} aria-label="Clear search" className="rounded-full p-1 hover:bg-muted"><X className="size-3.5" /></button>}
                          </label>
                        </div>
                        <motion.div layout role="group" aria-label="Products" className="mt-2.5 grid min-h-0 flex-1 grid-cols-2 content-start gap-2 p-1 md:grid-cols-4 md:content-stretch md:[grid-auto-rows:minmax(0,1fr)] [@media(min-height:860px)]:mt-3 [@media(min-height:860px)]:gap-3">
                          <AnimatePresence mode="popLayout">
                            {!q && !group && card(ALL_PRODUCTS_VALUE, "All products", "Everything below in one workspace, for the whole business.", true, 0)}
                            {shown.map((p, i) => card(p.value, p.label, p.description ?? "", false, i + 1))}
                          </AnimatePresence>
                        </motion.div>
                        {shown.length === 0 && <p className="py-10 text-center text-sm text-muted-foreground">No product matches “{find}”.</p>}
                        <div className="mt-2.5 flex min-h-11 flex-none items-start gap-2 rounded-xl border border-primary/20 bg-primary/[0.05] px-3 py-2 text-xs leading-snug text-muted-foreground [@media(min-height:860px)]:mt-3 [@media(min-height:860px)]:text-[13px]" aria-live="polite">
                          <Info className="mt-0.5 size-4 flex-none text-primary" aria-hidden />
                          <motion.span key={about || "none"} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}>{aboutText ? <><b className="text-foreground">{nameOf(about)}:</b> {aboutText}</> : "Point at a product to read everything it does. CommandOS, DataBrain and ResolveIQ are always included."}</motion.span>
                        </div>
                        {fieldError(errors.product)}
                      </>
                    ))}

                    {/* ── 2. Business ── */}
                    {panel(1, (
                      <div className="flex flex-1 flex-col gap-2.5 [@media(min-height:1020px)]:gap-4">
                        <div className={box}>
                          {boxHead(Building2, "Name and address", "How your business appears, and where your team signs in.")}
                          <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2">
                            <div className="min-w-0">
                              <label htmlFor={ids.company} className={label}>Business name</label>
                              <div className="relative">
                                <input
                                  ref={companyRef}
                                  id={ids.company}
                                  name="companyName"
                                  required
                                  autoComplete="organization"
                                  placeholder="Enter your business name"
                                  className={cn(input, "peer")}
                                  style={errors.companyName ? bad : undefined}
                                  value={companyName}
                                  onChange={(e) => {
                                    setCompanyName(e.target.value);
                                    if (!slugEdited) setSlug(slugFromName(e.target.value));
                                  }}
                                  aria-invalid={!!errors.companyName || undefined}
                                />
                                <Building2 className={fieldIcon} aria-hidden />
                              </div>
                              {fieldError(errors.companyName)}
                            </div>

                            <div className="min-w-0">
                              <label htmlFor={ids.slug} className={label}>Workspace address</label>
                              <div className="sr-input flex !h-11 items-center !rounded-xl !p-0 focus-within:!border-[var(--primary)] focus-within:!shadow-[0_0_0_4px_color-mix(in_oklch,var(--primary)_16%,transparent)] [@media(max-height:760px)]:!h-10 [@media(min-height:860px)]:!h-12" style={slugMessage ? bad : undefined}>
                                <Globe className="ml-3.5 size-4 flex-none text-muted-foreground" aria-hidden />
                                <input
                                  id={ids.slug}
                                  name="slug"
                                  required
                                  placeholder="your-business"
                                  value={slug}
                                  onChange={(e) => {
                                    setSlugEdited(true);
                                    setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""));
                                  }}
                                  className="h-full min-w-0 flex-1 bg-transparent px-2.5 text-sm outline-none"
                                  style={{ outline: "none", boxShadow: "none" }}
                                  aria-invalid={!!slugMessage || undefined}
                                  aria-describedby={`${ids.slug}-status`}
                                />
                                <span className="max-w-[45%] shrink-0 self-stretch truncate rounded-r-[11px] bg-muted/60 px-3 py-3 text-xs font-semibold text-muted-foreground">.{rootDomain}</span>
                              </div>
                              <p id={`${ids.slug}-status`} className="mt-1 flex items-center gap-1 text-[11px] leading-4" style={{ color: slugMessage ? "#c0262d" : undefined }} aria-live="polite">
                                {current.state === "checking" && <Loader2 className="size-3 flex-none animate-spin" />}
                                {current.state === "ok" && !errors.slug && <Check className="size-3 flex-none text-emerald-600" />}
                                {slugMessage && <X className="size-3 flex-none" />}
                                <span className={slugMessage ? "" : "text-muted-foreground"}>{slugMessage ?? (current.state === "ok" ? "This address is available." : "Small letters, numbers and dashes.")}</span>
                              </p>
                            </div>
                          </div>
                          {slug && !slugMessage && (
                            <motion.p initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} className="mt-2 flex items-start gap-2 rounded-xl bg-emerald-500/10 px-3 py-2 text-xs lg:hidden">
                              <Globe className="mt-0.5 size-3.5 flex-none text-emerald-600" aria-hidden />
                              <span className="min-w-0 break-all">{makesWebsite ? <>Website: <b>{slug}.{rootDomain}</b> · Your team signs in at <b>{host}</b></> : <>Your team signs in at <b>{host}</b></>} <span className="text-muted-foreground">· You can add your own domain later.</span></span>
                            </motion.p>
                          )}
                        </div>

                        {allPicked && (
                          <fieldset className={box}>
                            <legend className="sr-only">Do you need a website?</legend>
                            {boxHead(Globe, "Do you need a website?", "We can build it, or you keep the one you have.")}
                            <div className="grid gap-2 sm:grid-cols-3">
                              {WEBSITE_CHOICES.map((c) => (
                                <label key={c.value} className="group flex cursor-pointer items-center gap-2.5 rounded-[14px] border border-border/70 bg-background px-3 py-2 transition-all hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-md has-checked:border-primary has-checked:bg-primary/10 has-focus-visible:ring-2 has-focus-visible:ring-primary/60 [@media(min-height:1020px)]:py-3.5">
                                  <input type="radio" name="websiteMode" value={c.value} checked={websiteMode === c.value} onChange={() => setWebsiteMode(c.value)} className="peer sr-only" />
                                  <span className="flex size-9 flex-none items-center justify-center rounded-lg bg-muted text-muted-foreground transition-colors peer-checked:bg-primary peer-checked:text-primary-foreground"><c.icon className="size-4" /></span>
                                  <span className="min-w-0"><span className="block text-[13px] font-bold leading-tight">{c.title}</span><span className="block text-[11px] leading-snug text-muted-foreground">{c.text}</span></span>
                                </label>
                              ))}
                            </div>
                            {websiteMode === "external" && (
                              <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="mt-2.5">
                                <label htmlFor={ids.siteUrl} className={label}>Your website address</label>
                                <div className="relative">
                                  <input id={ids.siteUrl} name="websiteUrl" type="url" placeholder="https://www.example.com" className={cn(input, "peer")} style={errors.websiteUrl ? bad : undefined} aria-invalid={!!errors.websiteUrl || undefined} />
                                  <Globe className={fieldIcon} aria-hidden />
                                </div>
                                {fieldError(errors.websiteUrl)}
                              </motion.div>
                            )}
                          </fieldset>
                        )}

                        <div className={cn(box, "flex flex-1 flex-col")}>
                          {boxHead(Sparkles, "What does your business do?", "Tap a common one, or search the full list. We set your workspace up for it.")}
                          <div className="grid flex-1 content-start gap-x-4 gap-y-3 sm:grid-cols-2">
                            <div className="min-w-0">
                              <label htmlFor={ids.category} className={label}>Business categories</label>
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
                                placeholder="Search all categories (up to 5)"
                                searchPlaceholder="Enter your business category"
                                title="Business categories"
                                customLabel="category"
                                searchExtras={categorySearchExtras}
                                customExample="Flat broker"
                                max={MAX_BUSINESS_CATEGORIES}
                                customPrefix={CUSTOM_PREFIX}
                                cleanCustom={cleanCustomName}
                                invalid={!!errors.businessCategories}
                                maxChips={1}
                                triggerClassName={select}
                              />
                              {fieldError(errors.businessCategories)}
                              <div className="mt-2.5 hidden flex-wrap gap-1.5 [@media(min-height:700px)]:flex" aria-label="Common categories">
                                {QUICK_CATEGORIES.slice(0, 6).map((c) => chip(c.code, c.name, categories.includes(c.code), () => toggleCategory(c.code)))}
                              </div>
                            </div>

                            <div className="min-w-0">
                              <label htmlFor={ids.sub} className={label}>Sub-categories</label>
                              <SearchMultiSelect
                                id={ids.sub}
                                name="businessSubCategory"
                                options={subOptions}
                                values={subCategories}
                                onChange={setSubCategories}
                                disabled={categories.length === 0}
                                placeholder={categories.length === 0 ? "Choose a category first" : "Search all sub-categories"}
                                searchPlaceholder="Enter your sub-category"
                                title="Sub-categories"
                                customLabel="sub-category"
                                customExample="Rental flats"
                                max={MAX_BUSINESS_SUBCATEGORIES}
                                customPrefix={CUSTOM_PREFIX}
                                cleanCustom={cleanCustomName}
                                invalid={!!errors.businessSubCategories}
                                maxChips={1}
                                triggerClassName={select}
                              />
                              {fieldError(errors.businessSubCategories)}
                              <div className="mt-2.5 hidden flex-wrap gap-1.5 [@media(min-height:700px)]:flex" aria-label="Suggested sub-categories">
                                {subOptions.slice(0, 8).map((o) => chip(o.value, o.label, subCategories.includes(o.value), () => toggleSub(o.value)))}
                                {subOptions.length === 0 && <p className="rounded-xl border border-dashed border-border/70 px-3 py-4 text-center text-[11px] text-muted-foreground sm:w-full">Suggestions appear here after you pick a category.</p>}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}

                    {/* ── 3. Account ── */}
                    {panel(2, (
                      <div className="grid flex-1 content-stretch gap-2.5 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] [@media(min-height:860px)]:gap-4">
                        <div className={cn(box, "flex flex-col")}>
                          {boxHead(UserRound, "Your sign-in", "The first account of the workspace, with full control.")}
                          <div className="space-y-3 [@media(min-height:860px)]:space-y-5">
                            <div className="min-w-0">
                              <label htmlFor={ids.email} className={label}>Email address</label>
                              <div className="relative">
                                <input ref={emailRef} id={ids.email} name="email" type="email" required autoComplete="email" placeholder="you@yourbusiness.com" className={cn(input, "peer")} style={errors.email ? bad : undefined} aria-invalid={!!errors.email || undefined} />
                                <AtSign className={fieldIcon} aria-hidden />
                              </div>
                              {fieldError(errors.email)}
                            </div>
                            <div className="min-w-0">
                              <label htmlFor={ids.password} className={label}>Password</label>
                              <div className="relative">
                                <input id={ids.password} name="password" type={showPassword ? "text" : "password"} required minLength={10} autoComplete="new-password" placeholder="Enter a strong password" className={cn(input, "peer")} style={{ paddingRight: 44, ...(errors.password ? bad : null) }} aria-invalid={!!errors.password || undefined} value={pw} onChange={(e) => setPw(e.target.value)} />
                                <Lock className={fieldIcon} aria-hidden />
                                <button type="button" onClick={() => setShowPassword((v) => !v)} className="absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground" aria-label={showPassword ? "Hide password" : "Show password"}>
                                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                                </button>
                              </div>
                              {fieldError(errors.password)}
                              <div className="mt-2" aria-live="polite">
                                <div className="flex items-center gap-2">
                                  <div className="flex flex-1 gap-1" aria-hidden>
                                    {[1, 2, 3, 4].map((n) => (
                                      <span key={n} className="h-1.5 flex-1 overflow-hidden rounded-full bg-border"><motion.span className={`block h-full ${strengthOf(pw).tone}`} initial={false} animate={{ width: strengthOf(pw).score >= n ? "100%" : "0%" }} /></span>
                                    ))}
                                  </div>
                                  <p className="w-16 text-right text-[11px] font-bold">{strengthOf(pw).label}</p>
                                </div>
                                <ul className="mt-2 grid grid-cols-2 gap-1.5 text-[11px]">
                                  {rules.map((r) => (
                                    <li key={r.text} className={cn("flex items-center gap-1.5 rounded-lg px-2 py-1 transition-colors [@media(max-height:760px)]:py-0", r.ok ? "bg-emerald-500/10 font-semibold text-foreground" : "bg-muted/50 text-muted-foreground")}>
                                      {r.ok ? <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }}><CheckCircle2 className="size-3.5 flex-none text-emerald-600" /></motion.span> : <Circle className="size-3.5 flex-none" />}{r.text}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            </div>
                          </div>
                          <div className="pt-3 [@media(min-height:860px)]:pt-5">
                            <label htmlFor={ids.terms} className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-border/70 px-3 py-2.5 text-[13px] leading-snug text-muted-foreground transition-colors has-checked:border-primary has-checked:bg-primary/5 [@media(max-height:760px)]:py-2">
                              <input id={ids.terms} name="acceptTerms" type="checkbox" className="mt-0.5 size-4 flex-none accent-[var(--primary)]" />
                              <span>I agree to the <Link href="/terms" target="_blank" className="font-semibold text-primary underline-offset-2 hover:underline">Terms of Service</Link> and <Link href="/privacy" target="_blank" className="font-semibold text-primary underline-offset-2 hover:underline">Privacy Policy</Link>.</span>
                            </label>
                            {fieldError(errors.acceptTerms)}
                          </div>
                          <ul className="mt-auto hidden grid-cols-3 gap-2 pt-4 [@media(min-height:860px)]:grid">
                            {[
                              { icon: ShieldCheck, t: "Protected password", x: "Stored scrambled, never readable." },
                              { icon: AtSign, t: "Verify later", x: "We email you a link; start at once." },
                              { icon: Lock, t: "Two-step sign-in", x: "Switch it on any time." },
                            ].map((f) => (
                              <li key={f.t} className="rounded-xl bg-muted/50 p-3">
                                <f.icon className="size-4 text-primary" aria-hidden />
                                <span className="mt-1.5 block text-xs font-bold">{f.t}</span>
                                <span className="block text-[11px] leading-snug text-muted-foreground">{f.x}</span>
                              </li>
                            ))}
                          </ul>
                        </div>

                        <div className="flex min-h-0 flex-col rounded-[18px] border border-primary/30 bg-gradient-to-br from-primary/10 to-brand-accent/10 p-3 [@media(min-height:860px)]:p-5">
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-sm font-black">Your workspace</p>
                            <button type="button" onClick={() => goTo(0)} className="text-xs font-bold text-primary hover:underline">Change</button>
                          </div>
                          <p className="mt-2 truncate text-base font-black">{companyName || "Your business"}</p>
                          <p className="break-all text-xs text-muted-foreground">{host}</p>
                          <ul className="mt-2.5 flex flex-wrap content-start gap-1.5" aria-label="Chosen products">
                            {allPicked ? (
                              <>
                                <li className="w-full text-xs font-bold">All {products.length} products</li>
                                {products.map((p) => <li key={p.value} title={p.label}><ProductLogo productKey={p.value} size={28} /></li>)}
                              </>
                            ) : (
                              picked.map((v) => <li key={v} className="inline-flex items-center gap-1.5 rounded-full bg-background py-1 pl-1 pr-2.5 text-xs font-bold shadow-sm"><ProductLogo productKey={v} size={20} />{nameOf(v)}</li>)
                            )}
                          </ul>
                          {planNote && <p className="mt-2.5 rounded-xl bg-background/80 px-3 py-2 text-xs leading-snug text-muted-foreground">{planNote}</p>}
                          <div className="mt-auto hidden pt-3 [@media(min-height:760px)]:block">
                            <p className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-primary">What happens next</p>
                            <ol className="space-y-1.5 text-xs">
                              {(approval ? ["Our team reviews your request", "We email you when it is approved", "Sign in and invite your team"] : ["Your workspace is created in a few seconds", "You are signed in and verify your email", "Invite your team and start working"]).map((t, i) => (
                                <li key={t} className="flex items-center gap-2"><span className="flex size-5 flex-none items-center justify-center rounded-full bg-primary text-[10px] font-black text-primary-foreground">{i + 1}</span>{t}</li>
                              ))}
                            </ol>
                          </div>
                        </div>
                      </div>
                    ))}

                    {errors.form && (
                      <p role="alert" className="mt-3 flex-none rounded-xl px-3 py-2 text-sm font-medium" style={{ background: "#c0262d1a", color: "#c0262d" }}>
                        {errors.form}
                      </p>
                    )}
                  </div>
                </div>

                {/* ── buttons: always in the same place ── */}
                <div className="flex-none border-t border-border/60 bg-background/90 px-4 py-3 backdrop-blur sm:px-8">
                  <div className="mx-auto flex w-full max-w-5xl items-center gap-3">
                    <button type="button" onClick={() => goTo(step - 1)} disabled={checking || step === 0} aria-hidden={step === 0} tabIndex={step === 0 ? -1 : 0} className={cn("inline-flex h-12 w-12 flex-none items-center justify-center gap-2 rounded-full border border-border text-sm font-bold transition-all hover:border-primary/50 hover:bg-muted/60 sm:w-28", step === 0 && "pointer-events-none opacity-30")}>
                      <ArrowLeft className="size-4" /> <span className="hidden sm:inline">Back</span>
                    </button>
                    <div className="min-w-0 flex-1" aria-live="polite">
                      <div className="flex items-center gap-2">
                        <span className="hidden flex-none -space-x-1.5 sm:flex">
                          <AnimatePresence>
                            {(allPicked ? [] : picked.slice(0, 6)).map((v) => (
                              <motion.button key={v} type="button" layout initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} whileHover={{ y: -3 }} onClick={() => toggleProduct(v)} title={`Remove ${nameOf(v)}`} aria-label={`Remove ${nameOf(v)}`} className="rounded-lg ring-2 ring-background">
                                <ProductLogo productKey={v} size={26} />
                              </motion.button>
                            ))}
                          </AnimatePresence>
                        </span>
                        <p className="min-w-0 truncate text-xs font-bold">
                          {picked.length === 0 ? <span className="text-muted-foreground">Nothing chosen yet</span> : allPicked ? "All products chosen" : `${picked.length} chosen`}
                        </p>
                      </div>
                      <p className="hidden truncate text-[11px] text-muted-foreground sm:block">Step {step + 1} of {STEPS.length} · {approval ? "Approved by our team before it goes live" : "Free to start, no card needed"}</p>
                    </div>
                    <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }} type="submit" disabled={checking || creating} className="group relative inline-flex h-12 w-40 flex-none items-center justify-center gap-2 overflow-hidden rounded-full bg-gradient-to-r from-primary to-brand-accent text-sm font-black text-white shadow-xl shadow-primary/30 disabled:opacity-70 sm:w-56 sm:text-base">
                      <span aria-hidden className="absolute inset-y-0 -left-1/2 w-1/3 -skew-x-12 bg-white/25 transition-all duration-700 group-hover:left-[120%]" />
                      {checking ? (
                        <>
                          <Loader2 className="size-5 animate-spin" /> Checking…
                        </>
                      ) : (
                        <>
                          {step < 2 ? "Continue" : approval ? "Request workspace" : "Create workspace"}
                          <ArrowRight className="size-5 transition-transform group-hover:translate-x-1" />
                        </>
                      )}
                    </motion.button>
                  </div>
                </div>
              </form>
            </>
          )}
        </div>
      </main>
    </MotionConfig>
  );
}
