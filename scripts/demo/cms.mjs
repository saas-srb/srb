// CMS product demo data: CMS-role logins, the theme(s) (seeded from today's globals.css values,
// already "published" and active by default, so activating the CMS theme engine changes nothing
// visually until an admin explicitly switches themes), and a cms_pages draft/published doc per
// migrated route.
//
// IMPORTANT: any page here that's seeded with `status: "published"` must carry its FULL real
// section set (matching the page's own `sections.ts` fallback), not a trimmed stub — publishing
// replaces what the live site renders, so a short seed would visibly truncate the real page. This
// was gotten wrong once during Phase 1 verification (a 1-section stub got published and briefly
// live-truncated /services/web-app-development) and fixed by deleting the doc; the full set below
// is the actual permanent fix.
//
// Idempotent: re-running replaces the same demo accounts, theme docs and draft pages, but never
// overwrites a page/theme someone has since edited in the CMS (checked by existence, not content).
import { randomUUID } from "node:crypto";
import { hashPassword } from "./lib.mjs";

const PASSWORD = "Demo@12345";

export const CMS_DEMO_ACCOUNTS = [
  { email: "demo.cms.admin@example.com", label: "CMS Admin", roles: ["cms_admin"] },
  { email: "demo.cms.editor@example.com", label: "CMS Editor", roles: ["cms_editor"] },
  { email: "demo.cms.viewer@example.com", label: "CMS Viewer", roles: ["cms_viewer"] },
];

// Copied verbatim from src/app/globals.css's :root / .dark blocks — activating the theme
// engine must not change the live site's appearance until someone activates a different theme.
export const DEFAULT_THEME_TOKENS = {
  colors: {
    background: "#ffffff", foreground: "#1b1a1a", card: "#ffffff", cardForeground: "#1b1a1a",
    popover: "#ffffff", popoverForeground: "#1b1a1a", primary: "#E56043", primaryForeground: "#1b1a1a",
    secondary: "#ECF2FD", secondaryForeground: "#1D428A", muted: "#f1f5f9", mutedForeground: "#64748b",
    accent: "#ECF2FD", accentForeground: "#1D428A", destructive: "#ef4444", border: "#e2e8f0", input: "#e2e8f0", ring: "#E56043",
  },
  colorsDark: {
    background: "#1b1a1a", foreground: "#ECF2FD", card: "#1b1a1a", cardForeground: "#ECF2FD",
    popover: "#1b1a1a", popoverForeground: "#ECF2FD", primary: "#E56043", primaryForeground: "#1b1a1a",
    secondary: "#1D428A", secondaryForeground: "#ECF2FD", muted: "#1D428A", mutedForeground: "#94a3b8",
    accent: "#1D428A", accentForeground: "#ECF2FD", destructive: "#ef4444", border: "#334155", input: "#334155", ring: "#E56043",
  },
  radius: "0.625rem",
};

// A distinct dark/tech palette for the "AI Technology" theme — published but NOT activated by
// the seed (activating stays an explicit admin action, per Rule 1: nothing changes by default).
export const AI_THEME_TOKENS = {
  colors: {
    background: "#05060a", foreground: "#f5f7ff", card: "#0d0f1a", cardForeground: "#f5f7ff",
    popover: "#0d0f1a", popoverForeground: "#f5f7ff", primary: "#6ea8ff", primaryForeground: "#05060a",
    secondary: "#1a1d2e", secondaryForeground: "#b8c4ff", muted: "#12141f", mutedForeground: "#8890a8",
    accent: "#1a1d2e", accentForeground: "#b8c4ff", destructive: "#ff5c5c", border: "#1f2233", input: "#1f2233", ring: "#6ea8ff",
  },
  colorsDark: {
    background: "#05060a", foreground: "#f5f7ff", card: "#0d0f1a", cardForeground: "#f5f7ff",
    popover: "#0d0f1a", popoverForeground: "#f5f7ff", primary: "#6ea8ff", primaryForeground: "#05060a",
    secondary: "#1a1d2e", secondaryForeground: "#b8c4ff", muted: "#12141f", mutedForeground: "#8890a8",
    accent: "#1a1d2e", accentForeground: "#b8c4ff", destructive: "#ff5c5c", border: "#1f2233", input: "#1f2233", ring: "#6ea8ff",
  },
  radius: "0.5rem",
};

const webAppDevelopmentFaqs = [
  { question: "Do you work with our existing codebase, or only build from scratch?", answer: "Both — we regularly take over and modernize existing codebases as well as build new products from scratch, starting with a technical audit either way." },
  { question: "Which frontend and backend technologies do you use?", answer: "Our default stack is React/Next.js on the frontend and Node.js on the backend, but we adapt to your existing stack when we're extending an established product." },
  { question: "How do you handle SEO for JavaScript-heavy applications?", answer: "We use server-side rendering and static generation strategically for public, SEO-critical pages, while keeping the rich interactivity your product needs." },
  { question: "Can you integrate with our existing tools like a CRM or payment processor?", answer: "Yes, API integration with common CRM, payment, and internal tooling platforms is a routine part of our web app projects." },
  { question: "What happens if we need changes after launch?", answer: "Our SLA-backed support plans cover bug fixes, performance monitoring, and ongoing feature work after go-live." },
];

// Mirrors src/app/(site)/services/web-app-development/sections.ts's FALLBACK_SECTIONS exactly —
// the FULL real page, so seeding this as "published" is a lossless, zero-visual-diff operation.
const WEB_APP_DEV_SECTIONS = {
  hero: { id: "hero", type: "page-hero", orderKey: 1024, enabled: true, config: { category: "services", categoryLabel: "services", title: "Web App Development", subtitle: "Scalable platforms for the modern web.", description: "We engineer lightning-fast, highly secure web applications using React, Next.js, and modern cloud architectures that provide seamless experiences across all devices.", icon: "Globe", image: "https://images.unsplash.com/photo-1461749280684-dccba630e2f6?q=80&w=1200&auto=format&fit=crop" } },
  overview: { id: "overview", type: "course-overview", orderKey: 2048, enabled: true, config: { title: "Web software built to handle real traffic, not just a demo", paragraphs: ["A web app that works in a demo and a web app that holds up under real user traffic, real data volume, and real edge cases are two very different things. We build for the second one, from the first line of code.", "Whether it's a customer-facing SaaS product, an internal operations tool, or a full e-commerce platform, we architect for the load, security, and SEO requirements your business will actually face, not just the ones visible on day one."], stats: [{ label: "Typical Timeline", value: "4–8 Weeks", icon: "Clock" }, { label: "Engagement Model", value: "Dedicated Team or Fixed Scope", icon: "Users" }, { label: "Team Composition", value: "Full-stack + DevOps", icon: "Layers" }, { label: "Support", value: "SLA-backed Maintenance", icon: "Headphones" }] } },
  challenges: { id: "challenges", type: "checklist-grid", orderKey: 3072, enabled: true, config: { id: "challenges", title: "Business challenges we solve", description: "The problems that show up once a web app leaves the prototype stage.", items: [{ title: "Slow Page Loads Costing Conversions", description: "Every extra second of load time measurably increases bounce rate and cart abandonment." }, { title: "Scaling Past the MVP", description: "Architecture that worked for the first 1,000 users often breaks down at 100,000." }, { title: "SEO That Doesn't Work with JS Frameworks", description: "Client-rendered apps frequently get under-indexed by search engines without the right rendering strategy." }, { title: "Accumulating Technical Debt", description: "Fast early development often leaves a codebase that's expensive and risky to extend." }, { title: "Fragmented Data Across Systems", description: "Apps that need to talk to CRMs, payment processors, and internal tools often end up with brittle, one-off integrations." }, { title: "Security Gaps Under Deadline Pressure", description: "Shipping fast without a security review leaves common vulnerabilities in auth and APIs unaddressed." }] } },
  approach: { id: "approach", type: "checklist-grid", orderKey: 4096, enabled: true, config: { id: "approach", tone: "muted", title: "Our approach", description: "How we turn those problems into architectural decisions from day one.", items: [{ title: "Architecture Before Code", description: "We map data flow, scaling points, and integration needs before writing the first feature." }, { title: "Server-rendered Where It Matters", description: "SSR/SSG for public, SEO-critical pages; client-rendered where interactivity matters more than indexing." }, { title: "API-first Design", description: "We build a clean API layer first so web, mobile, and future integrations all consume the same contract." }, { title: "Continuous Performance Budgets", description: "Page-weight and load-time budgets enforced in CI, not discovered after launch." }, { title: "Security Reviewed at Each Milestone", description: "Auth, input validation, and dependency scanning built into delivery, not a final audit." }, { title: "Documented, Testable Codebases", description: "Code that the next engineer, yours or ours, can pick up without a lengthy handoff." }] } },
  features: { id: "features", type: "checklist-grid", orderKey: 5120, enabled: true, config: { id: "features", title: "Key features", items: [{ title: "Responsive, Accessible UI", description: "Interfaces that work well on any device and meet WCAG accessibility guidelines." }, { title: "Real-time Data Sync", description: "Live updates via WebSockets or polling where your product genuinely needs them." }, { title: "Role-based Access Control", description: "Granular permissions for multi-user, multi-team products." }, { title: "Admin & Analytics Dashboards", description: "Internal tooling that gives your team visibility without extra engineering requests." }] } },
  offerings: { id: "offerings", type: "checklist-grid", orderKey: 6144, enabled: true, config: { id: "offerings", tone: "muted", title: "Service offerings", items: [{ title: "Custom SaaS Platforms", description: "Multi-tenant products built to onboard and scale across customer accounts." }, { title: "E-commerce Storefronts", description: "Catalog, cart, checkout, and payments built for conversion and reliability." }, { title: "Internal Tools & Portals", description: "Purpose-built dashboards and workflow tools for your own team." }, { title: "API & Backend Development", description: "Standalone APIs and services that power your web, mobile, and partner integrations." }, { title: "Legacy Application Modernization", description: "Incremental migration of aging codebases to modern, maintainable stacks." }, { title: "Progressive Web Apps", description: "Installable, offline-capable web experiences that blur the line with native apps." }] } },
  techStack: { id: "tech-stack", type: "tech-stack-grid", orderKey: 7168, enabled: true, config: { tone: "muted", title: "Technologies & tools we use", items: [{ name: "React / Next.js", category: "Frontend", icon: "Code2" }, { name: "Node.js", category: "Backend", icon: "Server" }, { name: "PostgreSQL / MongoDB", category: "Database", icon: "Database" }, { name: "GraphQL / REST", category: "APIs", icon: "Workflow" }, { name: "AWS / Vercel", category: "Cloud & Hosting", icon: "Cloud" }, { name: "Redis", category: "Caching", icon: "Zap" }, { name: "Tailwind CSS", category: "Styling", icon: "Palette" }, { name: "GitHub Actions", category: "CI/CD", icon: "GitBranch" }] } },
  process: { id: "process", type: "curriculum-timeline", orderKey: 8192, enabled: true, config: { title: "Development process", description: "How we take a web application from architecture to a supported, production system.", modules: [{ title: "Discovery & Architecture", duration: "3–5 Days", topics: ["Requirements workshops", "System architecture", "Data modeling", "Tech stack decisions"] }, { title: "UI/UX Design", duration: "1 Week", topics: ["Wireframes", "Design system", "Prototype review", "Accessibility pass"] }, { title: "Core Development", duration: "2–4 Weeks", topics: ["Frontend build", "API development", "Database implementation", "Third-party integrations"] }, { title: "Testing & QA", duration: "3–5 Days", topics: ["Unit & integration tests", "Cross-browser testing", "Performance testing", "Security review"] }, { title: "Deployment", duration: "2–3 Days", topics: ["CI/CD setup", "Staging validation", "Production rollout", "Monitoring setup"] }, { title: "Post-launch Support", duration: "Ongoing", topics: ["Bug fixes", "Performance monitoring", "Feature iteration", "SLA-backed maintenance"] }] } },
  architecture: { id: "architecture", type: "architecture-overview", orderKey: 9216, enabled: true, config: { tone: "muted", title: "Architecture & solution overview", description: "A typical layered architecture for the web applications we build.", layers: [{ name: "Presentation Layer", description: "Server-rendered React components for fast, SEO-friendly pages with client-side interactivity where needed.", tech: "Next.js / React", icon: "Code2" }, { name: "Application & API Layer", description: "A clean, versioned API layer that mediates all business logic between the frontend and your data.", tech: "Node.js / GraphQL", icon: "Server" }, { name: "Data Layer", description: "Relational or document storage chosen based on your data shape, with caching for hot paths.", tech: "PostgreSQL / Redis", icon: "Database" }, { name: "Infrastructure Layer", description: "Auto-scaling cloud infrastructure with CI/CD pipelines and monitoring built in from day one.", tech: "AWS / Vercel", icon: "Cloud" }] } },
  aiAutomation: { id: "ai-automation", type: "checklist-grid", orderKey: 10240, enabled: true, config: { id: "ai-automation", title: "AI & automation capabilities", description: "Where AI adds real leverage to a modern web application.", items: [{ title: "AI-assisted Search & Recommendations", description: "Semantic search and personalized content recommendations powered by embeddings." }, { title: "Automated QA & Regression Testing", description: "AI-assisted test generation that catches regressions before they reach production." }, { title: "Smart Form & Data Validation", description: "Intelligent input validation that reduces bad data and support tickets." }, { title: "In-app AI Assistants", description: "Embedded chat-based help that answers user questions using your own product documentation." }] } },
  useCases: { id: "use-cases", type: "project-showcase", orderKey: 11264, enabled: true, config: { tone: "muted", title: "Industry use cases", description: "The kinds of web applications we build across SaaS, commerce, and internal tooling.", projects: [{ title: "Multi-tenant SaaS Dashboard", description: "A B2B analytics platform serving thousands of customer accounts with isolated data and usage-based billing.", skills: ["Next.js", "Multi-tenancy", "Billing"] }, { title: "High-traffic E-commerce Platform", description: "A storefront rebuilt to handle a 3x traffic spike during seasonal sales without downtime.", skills: ["Performance", "Payments", "Caching"] }, { title: "Internal Operations Portal", description: "A unified dashboard replacing five spreadsheets and two legacy tools for a logistics team.", skills: ["APIs", "RBAC", "Reporting"] }] } },
  benefits: { id: "benefits", type: "feature-highlights", orderKey: 12288, enabled: true, config: { title: "Benefits & business outcomes", features: [{ name: "Faster Page Loads, Higher Conversions", desc: "Performance-first architecture directly improves signup and checkout completion rates." }, { name: "Lower Long-term Maintenance Cost", desc: "Clean architecture and documentation reduce the cost of every future feature." }, { name: "Confident Scaling", desc: "Infrastructure that grows with usage instead of requiring a rebuild at your next growth milestone." }] } },
  whyUs: { id: "why-us", type: "feature-highlights", orderKey: 13312, enabled: true, config: { tone: "muted", title: "Why choose our team", features: [{ name: "Senior Engineers, Not Just Junior Hours", desc: "Your project is led by engineers who've shipped production systems at scale, not learning on your budget." }, { name: "Transparent, Milestone-based Delivery", desc: "You see working software at every milestone, not just a final reveal." }, { name: "We Stick Around Post-launch", desc: "SLA-backed support means we're still accountable after go-live, not gone the day after." }] } },
  engagementModels: { id: "engagement-models", type: "feature-highlights", orderKey: 14336, enabled: true, config: { title: "Engagement models", features: [{ name: "Dedicated Team", desc: "A committed team working exclusively on your product — best for ongoing, evolving platforms." }, { name: "Fixed Scope Project", desc: "A defined scope, timeline, and price — best for well-specified projects with clear requirements." }, { name: "Staff Augmentation", desc: "Embed our engineers directly into your existing team — best for filling specific skill or capacity gaps." }] } },
  deliveryTimeline: { id: "delivery-timeline", type: "delivery-timeline", orderKey: 15360, enabled: true, config: { tone: "muted", title: "Project delivery timeline", description: "Typical timelines by project scope, so you can plan around a realistic launch date.", bands: [{ scope: "MVP / Proof of Concept", duration: "3–4 Weeks", fill: 35, description: "A focused build validating your core value proposition with real users." }, { scope: "Full Product Launch", duration: "6–10 Weeks", fill: 70, description: "A production-ready platform with the complete feature set, integrations, and QA." }, { scope: "Enterprise-scale Platform", duration: "10+ Weeks", fill: 100, description: "Multi-team, multi-phase delivery for platforms with complex compliance or scale needs." }] } },
  faqs: { id: "faqs", type: "faq-accordion", orderKey: 16384, enabled: true, config: { faqs: webAppDevelopmentFaqs } },
  relatedServices: { id: "related-services", type: "related-services", orderKey: 17408, enabled: true, config: { tone: "muted", services: [{ title: "Mobile App Development", description: "Extend your web product to native iOS and Android experiences.", href: "/services/mobile-app-development", icon: "Smartphone" }, { title: "AI/ML Solutions", description: "Add recommendation engines, search, and predictive features to your platform.", href: "/services/ai-ml-solutions", icon: "Cpu" }, { title: "AI Agent", description: "Give your web app a 24/7 support or automation assistant.", href: "/services/ai-agent", icon: "Bot" }] } },
  cta: { id: "cta", type: "detail-cta", orderKey: 18432, enabled: true, config: { heading: "Ready to build a web app that scales?", description: "Let's talk about your product, your users, and how we can help you ship something built to last.", ctaLabel: "Get a Quote", category: "software-development", subService: "web-app-development" } },
};

const WEB_APP_DEV_DEFAULT_ORDER = [
  "hero", "overview", "challenges", "approach", "features", "offerings", "techStack", "process",
  "architecture", "aiAutomation", "useCases", "benefits", "whyUs", "engagementModels",
  "deliveryTimeline", "faqs", "relatedServices", "cta",
];

// The AI Technology theme's own arrangement for the same page — inserts a new `stats-band`
// section (a real, previously-unregistered component, see section-registry.ts), moves the tech
// stack and AI-automation sections earlier, and drops 3 sections (why-us, engagement-models,
// delivery-timeline) that are redundant once the whole page leans into the AI framing. Everything
// kept reuses the DEFAULT theme's own section config BY COPY (not a live reference) — see the
// plan's stated content-sharing caveat.
const AI_STATS_SECTION = {
  id: "ai-stats",
  type: "stats-band",
  orderKey: 1536,
  enabled: true,
  config: {
    title: "Built for AI-scale products",
    description: "The numbers behind every web app we ship on this stack.",
    tone: "muted",
    stats: [
      { label: "Faster time to first deploy", value: 40, suffix: "%", icon: "Rocket" },
      { label: "Uptime SLA", value: 99, suffix: ".9%", icon: "ShieldCheck" },
      { label: "AI-assisted code review coverage", value: 100, suffix: "%", icon: "Bot" },
      { label: "Deploys per week, average", value: 3, suffix: "x", icon: "TrendingUp" },
    ],
  },
};

function reorderedWebAppDevSections() {
  const order = ["hero", "aiStats", "techStack", "challenges", "approach", "aiAutomation", "features", "offerings", "process", "architecture", "useCases", "benefits", "faqs", "relatedServices", "cta"];
  let orderKey = 1024;
  return order.map((key) => {
    const base = key === "aiStats" ? AI_STATS_SECTION : WEB_APP_DEV_SECTIONS[key];
    const section = { ...base, orderKey };
    orderKey += 1024;
    return section;
  });
}

const DRAFT_PAGES = [
  // "/" and "/services" are seeded with EMPTY drafts on purpose: their real
  // content comes from the content migration (content migration),
  // which publishes it and drops an empty placeholder draft like these.
  // Seeding a partial section list here instead would mean publishing it
  // deletes every section it doesn't list from the live page.
  { path: "/", title: "Homepage", templateKey: "homepage", sections: [] },
  { path: "/services", title: "Services", templateKey: "generic", sections: [] },
  {
    path: "/services/web-app-development",
    title: "Web App Development",
    templateKey: "service-detail",
    sections: WEB_APP_DEV_DEFAULT_ORDER.map((key) => WEB_APP_DEV_SECTIONS[key]),
    // The AI Technology theme's own arrangement for this same page.
    themeVariants: { "ai-technology": reorderedWebAppDevSections() },
  },
];

export async function seedCms(db) {
  const now = new Date();
  const passwordHash = hashPassword(PASSWORD);

  const users = {};
  for (const a of CMS_DEMO_ACCOUNTS) {
    const existing = await db.collection("admin_users").findOne({ email: a.email }, { projection: { _id: 1 } });
    const id = existing?._id;
    await db.collection("admin_users").updateOne(
      { email: a.email },
      {
        $set: {
          email: a.email,
          passwordHash,
          roles: a.roles,
          permissionOverrides: {},
          userType: "employee",
          employeeId: null,
          mustChangePassword: false,
          failedLoginAttempts: 0,
          lockedUntil: null,
          lastLoginAt: null,
        },
        $setOnInsert: { createdAt: now },
      },
      { upsert: true }
    );
    const doc = await db.collection("admin_users").findOne({ email: a.email }, { projection: { _id: 1 } });
    users[a.roles[0]] = (id ?? doc._id).toString();
  }

  // "default" = "Current Website / Default Theme" — builtIn, already published, and (unless an
  // admin has since activated something else) the active theme.
  await db.collection("cms_theme").updateOne(
    { _id: "default" },
    {
      $set: { name: "Current Website / Default", description: "The existing website's real, unchanged design — the baseline every other theme is optional on top of.", builtIn: true, tokens: DEFAULT_THEME_TOKENS, draftTokens: DEFAULT_THEME_TOKENS, publishedAt: now, updatedAt: now, updatedBy: users.cms_admin ?? null },
      $setOnInsert: { _id: "default", createdAt: now, createdBy: users.cms_admin ?? null },
    },
    { upsert: true }
  );
  await db.collection("cms_settings").updateOne({ _id: "default" }, { $setOnInsert: { activeThemeKey: "default" } }, { upsert: true });

  // "ai-technology" — published so it CAN be activated/previewed, but seeding never activates it.
  const aiThemeExists = await db.collection("cms_theme").findOne({ _id: "ai-technology" }, { projection: { _id: 1 } });
  if (!aiThemeExists) {
    await db.collection("cms_theme").insertOne({
      _id: "ai-technology",
      name: "AI Technology Theme",
      description: "A dark, tech-forward alternate look — different hero, header and footer components and a reordered/expanded section arrangement on the Web App Development page.",
      builtIn: false,
      tokens: AI_THEME_TOKENS,
      draftTokens: AI_THEME_TOKENS,
      // Component variants (src/lib/sitecraft-ai/component-variants.ts): terminal-style hero, menu-only header, compact footer.
      components: { header: "menu", footer: "compact", sections: { "page-hero": "terminal" } },
      publishedAt: now,
      createdAt: now,
      updatedAt: now,
      createdBy: users.cms_admin ?? null,
      updatedBy: users.cms_admin ?? null,
    });
  }

  let publishedCount = 0;
  for (const p of DRAFT_PAGES) {
    const existing = await db.collection("cms_pages").findOne({ path: p.path }, { projection: { _id: 1 } });
    if (existing) continue; // never overwrite a page someone has since edited/published in the CMS
    const isFullPage = p.path === "/services/web-app-development";
    const doc = {
      _id: randomUUID(),
      path: p.path,
      title: p.title,
      templateKey: p.templateKey,
      draft: { sections: p.sections },
      live: isFullPage ? { sections: p.sections } : null,
      status: isFullPage ? "published" : "draft",
      version: isFullPage ? "1.0" : null,
      hasUnpublishedChanges: !isFullPage,
      publishedAt: isFullPage ? now : null,
      themeRef: "default",
      createdAt: now,
      updatedAt: now,
      createdBy: users.cms_admin ?? null,
      updatedBy: users.cms_admin ?? null,
      ...(p.themeVariants
        ? { themeVariants: Object.fromEntries(Object.entries(p.themeVariants).map(([key, sections]) => [key, { sections, updatedAt: now, updatedBy: users.cms_admin ?? null }])) }
        : {}),
    };
    await db.collection("cms_pages").insertOne(doc);
    if (isFullPage) publishedCount++;
  }

  return { accounts: CMS_DEMO_ACCOUNTS.length, pages: DRAFT_PAGES.length, publishedPages: publishedCount };
}
