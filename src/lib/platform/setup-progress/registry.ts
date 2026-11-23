import { MODULES } from "@/lib/platform/onboarding/catalog";
import { IDENTITY_LABELS } from "@/lib/platform/company-identity/shared";
import type { ConnState, FactGroup, GroupKey, SetupFacts, StepDef, StepResult, Tier } from "@/lib/platform/setup-progress/types";

/**
 * THE SETUP REGISTRY: every step of setting up a company, once. A step says what it is, why it matters, how long it takes, where to do it, who can,
 * and how to tell from real data whether it is done. To add a step: add it here (see docs/setup-progress.md); the coverage test fails when a settings card,
 * an onboarding step or a setup-related sidebar item has no step and no reasoned "not part of setup" entry.
 */
const done = (detail: string): StepResult => ({ status: "done", detail });
const todo = (detail: string): StepResult => ({ status: "todo", detail });
const partial = (detail: string, fraction = 0.5): StepResult => ({ status: "partial", detail, fraction });
const yes = (ok: boolean, okText: string, noText: string): StepResult => (ok ? done(okText) : todo(noText));

const INT = "/commandos/settings/integrations";
const PRODUCTS = "/commandos/settings/products";
const moduleName = (k: string) => MODULES.find((m) => m.key === k)?.label ?? k;

const identityHas = (f: SetupFacts, keys: string[]) => { const v = f.identity!.values; return keys.filter((k) => String(v[k] ?? "").trim() !== ""); };
const idStep = (id: string, title: string, description: string, why: string, keys: string[], tier: Tier, minutes: number, onboarding?: string): StepDef => ({
  id, group: "company", title, description, why, tier, minutes, href: "/commandos/onboarding", feature: "company.setup", needs: ["identity"],
  covers: onboarding ? [`onboarding:${onboarding}`] : [],
  check: (f) => {
    const have = identityHas(f, keys);
    return have.length === keys.length ? done(keys.length === 1 ? "Filled in." : "All filled in.") : have.length > 0 ? partial(`Missing: ${keys.filter((k) => !have.includes(k)).map((k) => IDENTITY_LABELS[k as keyof typeof IDENTITY_LABELS] ?? k).join(", ")}.`, have.length / keys.length) : todo("Not filled in yet.");
  },
});

/** An integration step: the state of one or more Integrations cards. `mode` any = one working card is enough; all = every card counts. */
const connStep = (o: { id: string; cards: string[]; title: string; description: string; why: string; tier: Tier; minutes: number; mode?: "any" | "all"; usedBy?: string[] | null; product?: string; open: string }): StepDef => ({
  id: o.id, product: o.product, group: "integrations", title: o.title, description: o.description, why: o.why, tier: o.tier, minutes: o.minutes, href: `${INT}?open=${o.open}`, feature: "company.integrations", needs: o.usedBy === null ? ["connections"] : ["connections", "registry"],
  covers: o.cards.map((c) => `integration:${c}`),
  applies: o.usedBy === null || o.usedBy === undefined ? undefined : (f) => (f.modules?.on ?? []).some((m) => (f.registry?.[m] ?? []).some((c) => o.usedBy!.includes(c))),
  check: (f) => {
    const states = o.cards.map((c) => f.connections![c]).filter(Boolean) as { state: ConnState; detail: string }[];
    if (states.length === 0) return { status: "unknown", detail: "Could not check this connection." };
    const best = (s: ConnState) => states.filter((x) => x.state === s);
    if (o.mode === "all") {
      const n = best("done").length + 0.5 * best("partial").length;
      return n === states.length ? done(states[0].detail) : n > 0 ? partial(`${best("done").length} of ${states.length} connected.`, n / states.length) : todo(states[0].detail);
    }
    return best("done")[0] ? done(best("done")[0].detail) : best("partial")[0] ? partial(best("partial")[0].detail) : todo(states[0].detail);
  },
});

const PRODUCT_SETTINGS: { module: string; slug: string; needs?: "ai" | "aiAndSocial" | "google" }[] = [
  { module: "hrms", slug: "talentos" }, { module: "pms", slug: "sprintos" }, { module: "tms", slug: "cohort-ai" }, { module: "fms", slug: "cashflow-ai" },
  { module: "prms", slug: "spendiq" }, { module: "aibots", slug: "agentos", needs: "ai" }, { module: "ots", slug: "evaliq" }, { module: "smms", slug: "viralpulse-ai", needs: "aiAndSocial" },
  { module: "seo", slug: "rankmax-ai", needs: "google" }, { module: "dlms", slug: "cybervault" }, { module: "sop", slug: "playbook-ai" }, { module: "cms", slug: "sitecraft-ai" },
];
/** Products whose Product settings card has no settings of its own: their "review" is explicit. */
const NO_SETTINGS: { module: string; slug: string }[] = [
  { module: "lms", slug: "dealflow-ai" }, { module: "lpms", slug: "contractflow-ai" }, { module: "intelligence", slug: "databrain-ai" },
];

const productSettingsSteps: StepDef[] = PRODUCT_SETTINGS.map((p) => ({
  id: `product-settings:${p.module}`, group: "product_settings" as GroupKey, product: p.module,
  title: `Set up ${moduleName(p.module)}`, description: `Check the ${moduleName(p.module)} settings fit your business.`,
  why: p.needs ? "It cannot do its main job until its connections are ready." : "The defaults are generic; your own choices make it work the way you do.",
  tier: "recommended" as Tier, minutes: 5, href: `${PRODUCTS}?open=${p.slug}`, feature: "company.products", needs: ["productSettings", ...(p.needs ? (["connections"] as FactGroup[]) : [])],
  covers: [`product:${p.slug}`], manual: true,
  check: (f: SetupFacts): StepResult => {
    const saved = Boolean(f.productSettings?.[p.module]);
    const c = f.connections ?? {};
    const ok = (k: string) => c[k]?.state === "done";
    if (p.needs === "ai") return ok("openai") ? done("The AI account is ready.") : saved ? partial("Saved, but no AI account is ready.") : todo("Connect an AI account.");
    if (p.needs === "google") return ok("google-service-account") ? done("Google search data is connected.") : saved ? partial("Saved, but Google is not connected.") : todo("Connect Google search data.");
    if (p.needs === "aiAndSocial") {
      const social = ["meta", "google", "linkedin", "x"].some(ok);
      return ok("openai") && social ? done("AI and a social app are connected.") : ok("openai") || social ? partial(ok("openai") ? "No social app is connected yet." : "No AI account is ready yet.") : todo("Connect an AI account and a social app.");
    }
    return saved ? done("Settings have been saved.") : todo("Open the settings and save your choices, or mark them reviewed.");
  },
}));

const noSettingsSteps: StepDef[] = NO_SETTINGS.map((p) => ({
  id: `product-settings:${p.module}`, group: "product_settings" as GroupKey, product: p.module,
  title: `Set up ${moduleName(p.module)}`, description: `Open ${moduleName(p.module)} and check it fits how you work.`,
  why: "It has no settings of its own; it uses your company details and connections.", tier: "optional" as Tier, minutes: 3, href: PRODUCTS, feature: "company.products", manual: true,
  needs: ["usage"] as FactGroup[], covers: [`product:${p.slug}`],
  check: (f: SetupFacts): StepResult => (p.module === "lms" && (f.usage?.lms ?? 0) > 0 ? done("You already have leads.") : todo("Open it, check it fits how you work, then mark it reviewed.")),
}));

/** First-records steps: the products are only useful once something is in them. Derived from real counts. */
const FIRST: { module: string; key: string; title: string; text: string; href: string; feature: string }[] = [
  { module: "hrms", key: "employees", title: "Add your employees", text: "Add the people who work for you.", href: "/talentos/employees", feature: "product.hrms" },
  { module: "pms", key: "clients", title: "Add your first client", text: "Add a client so projects have someone to belong to.", href: "/sprintos/clients", feature: "product.pms" },
  { module: "prms", key: "vendors", title: "Add your first vendor", text: "Add a supplier you buy from.", href: "/spendiq/vendors", feature: "product.prms" },
  { module: "lms", key: "leads", title: "Capture your first lead", text: "Add a lead or connect a lead source.", href: "/dealflow-ai/leads", feature: "product.lms" },
  { module: "sop", key: "procedures", title: "Write your first procedure", text: "Create a procedure your team follows.", href: "/playbook-ai", feature: "product.sop" },
  { module: "fms", key: "transactions", title: "Record your first transaction", text: "Record an invoice or a payment.", href: "/cashflow-ai", feature: "product.fms" },
];
const firstSteps: StepDef[] = FIRST.map((p) => ({
  id: `first:${p.module}`, group: "product_settings" as GroupKey, product: p.module, title: p.title, description: p.text, why: "Everything else in this product builds on it.", tier: "optional" as Tier, minutes: 5,
  href: p.href, feature: p.feature, needs: ["usage"] as FactGroup[], covers: [],
  check: (f: SetupFacts): StepResult => ((f.usage?.[p.module] ?? 0) > 0 ? done(`${f.usage![p.module]} added.`) : todo("Nothing added yet.")),
}));

export const STEPS: StepDef[] = [
  // ── Company setup (identity) ──
  idStep("company:names", "Add your company name", "Your brand name and legal name.", "They are printed on invoices, payslips, letters and your website.", ["brandName", "legalName"], "required", 2, "profile"),
  idStep("company:address", "Add your address", "Your registered address.", "It is printed on invoices, payslips and letters.", ["addressLine1", "city", "state", "postalCode", "country"], "required", 3),
  idStep("company:registrations", "Add your GSTIN, PAN and CIN", "The registration numbers that apply to you.", "Tax invoices and payslips need them.", ["gstin", "pan"], "recommended", 3),
  idStep("company:cin", "Add your CIN", "The Corporate Identification Number of a registered company.", "Contracts and letters can show it. Mark it not applicable if you have none.", ["cin"], "optional", 1),
  idStep("company:contact", "Add your contact email and phone", "How customers and staff reach you.", "They appear on documents and on your website.", ["email", "phone"], "required", 1),
  idStep("company:website", "Add your website address", "Your public website.", "Documents and emails link to it.", ["website"], "optional", 1),
  idStep("company:locale", "Choose your time zone, currency, financial year and language", "The defaults every product uses.", "Dates, money and reports follow them.", ["timeZone", "currency", "fiscalYearStartMonth", "language"], "required", 2),
  {
    id: "company:profile", group: "company", title: "Tell us what your company does", description: "Your industry and team size.", why: "It picks sensible departments and products for you.", tier: "required", minutes: 1,
    href: "/commandos/onboarding", feature: "company.setup", needs: ["onboarding"], covers: ["onboarding:profile", "nav:company.setup"],
    check: (f) => yes(f.onboarding!.completedSteps.includes("profile"), "Your company profile is saved.", "Complete the Company profile step."),
  },

  // ── Organization ──
  {
    id: "org:departments", group: "organization", title: "Create your departments", description: "The parts of your company, such as Sales or Finance.", why: "People, budgets and reports are grouped by department.", tier: "required", minutes: 4,
    href: "/commandos/settings/organization/departments", feature: "company.departments", needs: ["org"], covers: ["onboarding:structure", "nav:company.departments"],
    check: (f) => (f.org!.departments > 0 ? done(`${f.org!.departments} department${f.org!.departments === 1 ? "" : "s"}.`) : todo("No departments yet.")),
  },
  {
    id: "org:teams", group: "organization", title: "Create your teams", description: "Groups of people inside a department.", why: "Teams make assigning work and access quicker.", tier: "optional", minutes: 3,
    href: "/commandos/settings/organization/teams", feature: "company.teams", needs: ["org"], covers: ["nav:company.teams"],
    check: (f) => (f.org!.teams > 0 ? done(`${f.org!.teams} team${f.org!.teams === 1 ? "" : "s"}.`) : todo("No teams yet.")),
  },
  {
    id: "org:designations", group: "organization", title: "Create your job titles", description: "The designations people hold, such as Manager.", why: "Each person is added with a title.", tier: "recommended", minutes: 3,
    href: "/commandos/settings/organization/designations", feature: "company.designations", needs: ["org"], covers: ["nav:company.designations"],
    check: (f) => (f.org!.designations > 0 ? done(`${f.org!.designations} job title${f.org!.designations === 1 ? "" : "s"}.`) : todo("No job titles yet.")),
  },

  // ── People and access ──
  {
    id: "people:invite", group: "people", title: "Invite your team", description: "Add the people who will use the workspace.", why: "Nothing is shared until your team is in.", tier: "required", minutes: 5,
    href: "/commandos/users/new", feature: "company.users", needs: ["people", "onboarding"], covers: ["onboarding:team", "nav:company.users"],
    check: (f) => (f.people!.active + f.people!.pendingInvites > 1 || f.onboarding!.completedSteps.includes("team") ? done(`${f.people!.active} active, ${f.people!.pendingInvites} invited.`) : todo("Only you are here so far.")),
  },
  {
    id: "people:access", group: "people", title: "Give your team access", description: "Choose what each person can open.", why: "People see only what you allow.", tier: "required", minutes: 5,
    href: "/commandos/users", feature: "company.users", needs: ["people"], covers: [], dependsOn: ["people:invite"],
    check: (f) => (f.people!.staffWithAccess > 0 ? done(`${f.people!.staffWithAccess} teammate${f.people!.staffWithAccess === 1 ? " has" : "s have"} access assigned.`) : f.people!.active <= 1 ? todo("Invite someone first.") : partial("Teammates exist but none has access yet.", 0.25)),
  },
  {
    id: "people:backup-admin", group: "people", title: "Add a second Director", description: "Make one more person a Director as a backup.", why: "If you are away or locked out, someone can still manage the company.", tier: "recommended", minutes: 2,
    href: "/commandos/users", feature: "company.users", needs: ["people"], covers: [],
    check: (f) => (f.people!.directors >= 2 ? done("There is a backup Director.") : todo("You are the only Director.")),
  },
  {
    id: "people:pending", group: "people", title: "Follow up on pending invitations", description: "People you invited who have not joined.", why: "An unanswered invitation is a teammate who cannot work yet.", tier: "optional", minutes: 2,
    href: "/commandos/users", feature: "company.users", needs: ["people"], covers: [],
    check: (f) => (f.people!.pendingInvites === 0 ? done("No invitation is waiting.") : partial(`${f.people!.pendingInvites} invitation${f.people!.pendingInvites === 1 ? " is" : "s are"} waiting.`, 0.5)),
  },

  // ── Products ──
  {
    id: "products:choose", group: "products", title: "Choose your products", description: "Switch on the products your company uses.", why: "Only the products you use ask you to set anything up.", tier: "required", minutes: 2,
    href: "/commandos/onboarding", feature: "company.setup", needs: ["onboarding"], covers: ["onboarding:modules"],
    check: (f) => yes(f.onboarding!.completedSteps.includes("modules"), "Your products are chosen.", "Choose your products."),
  },
  ...productSettingsSteps,
  ...noSettingsSteps,
  ...firstSteps,

  // ── Integrations ──
  connStep({ id: "integration:email", cards: ["smtp", "resend", "sendgrid"], title: "Choose how emails are sent", description: "Send emails from the included default address or from your own account.", why: "Invitations, invoices and reminders are all emails.", tier: "required", minutes: 3, usedBy: ["email"], open: "smtp" }),
  connStep({ id: "integration:push", cards: ["vapid"], title: "Turn on push notifications", description: "Send alerts to phones and computers.", why: "People hear about approvals and reminders at once.", tier: "optional", minutes: 2, usedBy: ["push"], open: "vapid" }),
  connStep({ id: "integration:payments", cards: ["razorpay"], title: "Connect Razorpay", description: "Collect payments and pay salaries.", why: "Payment links and payroll payouts need it.", tier: "recommended", minutes: 6, usedBy: ["razorpay"], open: "razorpay" }),
  connStep({ id: "integration:ai", cards: ["openai", "ai-chatbot"], title: "Connect an AI account", description: "Power assistants, chatbots and content writing.", why: "Every AI feature in your products uses it.", tier: "required", minutes: 2, usedBy: ["openai"], open: "openai", mode: "any" }),
  connStep({ id: "integration:chatbot", cards: ["ai-chatbot"], title: "Set up your website chatbot", description: "Choose how the chatbot answers visitors.", why: "It answers visitors while you sleep.", tier: "optional", minutes: 5, usedBy: ["ai-chatbot"], open: "ai-chatbot" }),
  connStep({ id: "integration:voice", cards: ["elevenlabs"], title: "Add a voice", description: "Give your chatbot and phone agents a natural voice.", why: "Voice makes calls and the chatbot feel human.", tier: "optional", minutes: 2, usedBy: ["elevenlabs"], open: "elevenlabs" }),
  connStep({ id: "integration:video", cards: ["gemini"], title: "Connect AI video", description: "Create AI videos with your Google Gemini account.", why: "Needed only for AI video posts.", tier: "optional", minutes: 3, usedBy: ["gemini"], open: "gemini" }),
  connStep({ id: "integration:phone", cards: ["twilio", "whatsapp-cloud"], title: "Connect phone and WhatsApp", description: "Send WhatsApp messages and make phone calls.", why: "Lead follow-up and voice agents use it.", tier: "optional", minutes: 5, usedBy: ["twilio", "whatsapp-cloud"], open: "twilio" }),
  connStep({ id: "integration:meetings", cards: ["livekit", "turn"], title: "Check meetings and calls", description: "Run video meetings and calls.", why: "Meetings need a server; an included one is provided.", tier: "optional", minutes: 2, usedBy: ["livekit", "turn"], open: "livekit", mode: "any" }),
  connStep({ id: "integration:storage", cards: ["storage"], title: "Check file storage", description: "Keep uploaded files, documents and backups safe.", why: "Every upload and backup is stored there.", tier: "recommended", minutes: 1, usedBy: ["storage"], open: "storage" }),
  connStep({ id: "integration:google", cards: ["google-service-account", "pagespeed"], title: "Connect Google search data", description: "Read Search Console and Analytics and request indexing.", why: "Rankings and SEO reports come from it.", tier: "recommended", minutes: 8, usedBy: ["google-service-account", "pagespeed"], open: "google-service-account", mode: "any" }),
  connStep({ id: "integration:social", cards: ["meta", "google", "linkedin", "x", "social-accounts"], title: "Connect your social apps", description: "Publish to Facebook, Instagram, YouTube, LinkedIn and X.", why: "Posts can only go out to accounts you connect.", tier: "recommended", minutes: 10, usedBy: ["meta", "google", "linkedin", "x", "social-accounts"], open: "meta", mode: "any" }),
  connStep({ id: "integration:tracking", cards: ["website-tracking"], title: "Add website tracking", description: "Add analytics and site verification to your website.", why: "You see who visits and can verify the site with search engines.", tier: "optional", minutes: 4, usedBy: ["website-tracking"], open: "website-tracking" }),
  connStep({ id: "integration:webhooks", cards: ["webhooks"], title: "Connect your own systems", description: "Send a message to your systems when something happens.", why: "Other tools can react to events in your workspace.", tier: "optional", minutes: 5, usedBy: null, open: "webhooks" }),
  connStep({ id: "integration:leads", cards: ["dealflow-sync"], title: "Check your lead sources", description: "See where your leads and job applications come from.", why: "A lead source you forgot is a lead you never see.", tier: "optional", minutes: 2, product: "lms", open: "dealflow-sync" }),

  // ── Branding and domains ──
  {
    id: "branding:logo", group: "branding", title: "Upload your logo", description: "Your logo and brand name.", why: "It shows on every screen, document and email.", tier: "required", minutes: 2,
    href: "/commandos/settings/branding", feature: "company.branding", needs: ["branding"], covers: ["onboarding:branding", "nav:company.branding"],
    check: (f) => yes(f.branding!.logo, "Your logo is set.", "No logo yet."),
  },
  {
    id: "branding:domain", group: "branding", title: "Use your own web address", description: "Serve your workspace and website from your own domain, so your address carries only your name.", why: "It looks professional and builds trust.", tier: "optional", minutes: 10,
    href: "/commandos/settings/domains", feature: "company.domains", needs: ["domain"], covers: ["integration:domains", "nav:company.domains", "nav:company.addresses"],
    check: (f) => (f.domain!.customVerified ? done("Your domain is verified.") : f.domain!.customPending ? partial("Your domain is waiting for DNS.") : todo("Using the default address.")),
  },
  {
    id: "branding:sender", group: "branding", title: "Send emails from your own address", description: "Use an address like hello@yourbusiness.com.", why: "Customers trust emails that come from your name.", tier: "optional", minutes: 8,
    href: "/commandos/settings/domains#sender-email", feature: "company.email", needs: ["sender"], covers: ["nav:company.email"],
    check: (f) => (f.sender!.status === "verified" ? done("Your sender address is verified.") : f.sender!.status === "pending" ? partial("Waiting for DNS.") : f.sender!.status === "failed" ? partial("Verification failed. Check the records.", 0.25) : todo("Included default's address.")),
  },
  {
    id: "branding:apps", group: "branding", title: "Offer your own apps", description: "Generate the phone and computer apps with your brand.", why: "People install your workspace like any other app.", tier: "optional", minutes: 5,
    href: "/commandos/settings/apps", feature: "company.app", needs: ["onboarding"], covers: ["nav:company.app"], manual: true,
    check: () => todo("Optional. Open Apps and downloads, then mark it reviewed."),
  },

  // ── Plan and billing ──
  {
    id: "billing:plan", group: "billing", title: "Choose your plan", description: "Pick the plan that fits your company.", why: "It decides which products and limits you have.", tier: "required", minutes: 3,
    href: "/commandos/settings/billing", feature: "company.billing", needs: ["billing"], covers: ["nav:company.billing"],
    applies: (f) => !f.billing!.internal,
    check: (f) => (f.billing!.paying ? done("Your plan is active.") : f.billing!.hasPlan ? partial(f.billing!.trialDaysLeft !== null ? `Free trial: ${f.billing!.trialDaysLeft} days left.` : "A plan is chosen but not yet paid.") : todo("No plan chosen.")),
  },
  {
    id: "billing:details", group: "billing", title: "Add your GST invoice details", description: "The name, GSTIN and address on your invoices.", why: "Your tax invoices need them.", tier: "required", minutes: 3,
    href: "/commandos/settings/billing", feature: "company.billing", needs: ["billing"], covers: ["nav:company.invoices"],
    applies: (f) => !f.billing!.internal,
    check: (f) => yes(f.billing!.hasBillingDetails, "Billing details are saved.", "Billing details are missing."),
  },
  {
    id: "billing:usage", group: "billing", title: "Look at your usage and limits", description: "See what you use against your plan.", why: "You are never surprised by a limit.", tier: "optional", minutes: 2,
    href: "/commandos/settings/usage", feature: "company.usage", needs: ["billing"], covers: ["nav:company.usage"], manual: true,
    check: () => todo("Open Usage and limits, then mark it reviewed."),
  },
  {
    id: "billing:payments", group: "billing", title: "Set up company bank accounts", description: "Add the bank accounts used for payouts and dues.", why: "Salaries and government dues are paid from them.", tier: "optional", minutes: 6,
    href: "/commandos/settings/payments", feature: "company.payments", needs: ["connections"], covers: ["nav:company.payments"],
    applies: (f) => (f.modules?.on ?? []).includes("hrms") || (f.modules?.on ?? []).includes("fms"),
    check: (f) => (f.connections!.razorpay?.state === "done" ? done("Razorpay is connected.") : todo("Connect Razorpay first.")),
  },

  // ── System defaults ──
  { id: "system:notifications", group: "system", title: "Review your notifications", description: "Choose which emails, alerts and pushes are sent.", why: "Too many alerts get ignored; too few miss things.", tier: "recommended", minutes: 4, href: "/commandos/settings/notifications", feature: "company.notifications", needs: [], manual: true, covers: ["nav:company.notifications"], check: () => todo("Open the Notification center, then mark it reviewed.") },
  { id: "system:prompts", group: "system", title: "Review your AI wording", description: "How your AI assistants write and behave.", why: "The wording shapes every AI answer.", tier: "optional", minutes: 4, href: "/commandos/settings/prompts", feature: "company.prompts", needs: [], manual: true, covers: ["nav:company.prompts"], applies: (f) => (f.modules?.on ?? []).some((m) => ["aibots", "smms", "cms", "sop", "intelligence"].includes(m)), check: () => todo("Open AI prompts, then mark it reviewed.") },
  { id: "system:schedules", group: "system", title: "Review your scheduled jobs", description: "What runs on its own and when.", why: "Reminders, backups and reports depend on them.", tier: "optional", minutes: 2, href: "/commandos/settings/schedules", feature: "company.schedules", needs: [], manual: true, covers: ["nav:company.schedules"], check: () => todo("Open Scheduled jobs, then mark it reviewed.") },
  {
    id: "system:letterhead", group: "system", title: "Check your letterhead", description: "Preview the documents your company sends.", why: "Invoices, payslips and certificates use your address and logo.", tier: "recommended", minutes: 3,
    href: "/commandos/settings/documents", feature: "company.pdfs", needs: ["identity", "branding"], covers: ["nav:company.pdfs"], manual: true,
    check: (f) => (f.branding!.logo && String(f.identity!.values.addressLine1 ?? "") !== "" ? partial("Your logo and address are set. Preview a document, then mark it reviewed.", 0.5) : todo("Add your logo and address first.")),
  },

  // ── Security and logs ──
  {
    id: "security:two-step", group: "security", title: "Turn on two-step sign-in for Directors", description: "Ask for a second code when a Director signs in.", why: "A stolen password alone cannot open your company.", tier: "required", minutes: 3,
    href: "/commandos/settings/security", feature: "company.security", needs: ["security"], covers: ["nav:company.security", "nav:account.sessions", "nav:account.password"],
    check: (f) => { const s = f.security!; return s.directors > 0 && s.directorsWithTwoStep >= s.directors ? done("Every Director uses two-step sign-in.") : s.directorsWithTwoStep > 0 ? partial(`${s.directorsWithTwoStep} of ${s.directors} Directors use it.`, s.directorsWithTwoStep / Math.max(1, s.directors)) : todo("No Director uses it yet."); },
  },
  { id: "security:email", group: "security", title: "Verify your email", description: "Confirm the email address you signed up with.", why: "Without it your workspace is put on hold.", tier: "required", minutes: 1, href: "/commandos/settings/security", feature: "company.security", needs: ["security"], covers: [], check: (f) => yes(f.security!.emailVerified, "Your email is verified.", "Check your inbox for the verification email.") },
  {
    id: "security:backup", group: "security", title: "Make your first backup", description: "Keep a copy of your company data.", why: "You can get back to a good state after a mistake.", tier: "recommended", minutes: 2,
    href: "/commandos/settings/backups", feature: "company.backups", needs: ["security"], covers: ["nav:company.backups"],
    check: (f) => yes(f.security!.backups > 0, `${f.security!.backups} backup${f.security!.backups === 1 ? "" : "s"} exist.`, "No backup yet."),
  },
  { id: "security:audit", group: "security", title: "Look at your audit log", description: "See who did what in your workspace.", why: "You can answer \"who changed this?\" any time.", tier: "optional", minutes: 2, href: "/commandos/settings/audit-log", feature: "company.audit", needs: [], manual: true, covers: ["nav:company.audit"], check: () => todo("Open the Audit log, then mark it reviewed.") },
  { id: "security:import", group: "security", title: "Bring in your existing data", description: "Import leads, clients and employees from files.", why: "You start with your real data, not an empty system.", tier: "optional", minutes: 10, href: "/commandos/settings/import", feature: "company.import", needs: [], manual: true, covers: ["nav:company.import"], check: () => todo("Open Import data, then mark it reviewed, or mark it not applicable.") },

  // ── Engagement ──
  {
    id: "engagement:push", group: "engagement", title: "Set up push notifications", description: "Send notifications to your team's and visitors' devices.", why: "People see important things the moment they happen.", tier: "optional", minutes: 3,
    href: "/commandos/push", feature: "manage.push", needs: ["engagement"], covers: ["nav:manage.push"],
    check: (f) => yes(f.engagement!.pushReady, "Push is ready.", "Push is not set up."),
  },
  {
    id: "engagement:chatbot", group: "engagement", title: "Teach your chatbot", description: "Add your website and documents to its knowledge.", why: "A chatbot that knows nothing gives poor answers.", tier: "recommended", minutes: 8,
    href: `${INT}?open=ai-chatbot&tab=knowledge`, feature: "manage.chatbot", needs: ["engagement"], covers: ["nav:manage.chatbot", "nav:manage.chatbot.knowledge-base", "nav:manage.chatbot.config", "nav:manage.chatbot.conversations"],
    applies: (f) => (f.modules?.on ?? []).some((m) => (f.registry?.[m] ?? []).includes("ai-chatbot")),
    check: (f) => (f.engagement!.knowledgeItems > 0 ? done(`${f.engagement!.knowledgeItems} item${f.engagement!.knowledgeItems === 1 ? "" : "s"} in its knowledge.`) : todo("Its knowledge is empty.")),
  },
  { id: "engagement:voice", group: "engagement", title: "Check your voice assistant", description: "Choose the voice and greeting.", why: "It is what callers and visitors hear.", tier: "optional", minutes: 3, href: `${INT}?open=elevenlabs&tab=settings`, feature: "manage.chatbot.voice.config", needs: [], manual: true, covers: ["nav:manage.chatbot.voice", "nav:manage.chatbot.voice.config", "nav:manage.chatbot.voice-conversations"], applies: (f) => (f.modules?.on ?? []).some((m) => (f.registry?.[m] ?? []).includes("elevenlabs")), check: () => todo("Open Voice settings, then mark it reviewed.") },
];

/**
 * Things on the setup-related pages that are NOT a setup step, each with the reason. The coverage test accepts a settings card, onboarding step or
 * sidebar item that is either covered by a step above or listed here; anything else fails the build.
 */
export const NOT_PART_OF_SETUP: Record<string, string> = {
  "nav:company.automations": "Automations are rules a company writes when it wants them; there is nothing to set up first.",
  "nav:account.documents": "A person's own documents, not company setup.",
  "nav:account.notifications": "A person's own notification feed.",
  "nav:company.progress": "This is the Setup progress page itself.",
  "nav:company.products": "The Product settings page is covered product by product.",
  "nav:company.integrations": "The Integrations page is covered card by card.",
  "product:resolveiq": "Help and support is provided for every company; there is nothing to set up.",
};
