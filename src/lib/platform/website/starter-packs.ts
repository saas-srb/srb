/**
 * Starter website packs. Every new company gets ONE of these (picked from its
 * id), so each starts with a different look, structure and copy instead of the
 * same generic site: its own theme preset (colours, fonts, header, footer,
 * section layouts), headline, services, process, FAQs and footer call to
 * action. All of it is plain CMS content — editable afterwards.
 *
 * Text may contain `{name}`, replaced with the company's name. No client
 * names, testimonials, statistics or claims the company hasn't made.
 */

export interface StarterService { title: string; subtitle: string; description: string; icon: string; image: string; highlights: string[] }
export interface StarterReason { name: string; desc: string; icon: string }
export interface StarterStep { title: string; description: string; icon: string }

export interface StarterPack {
  id: string;
  /** Theme-library preset installed and activated for the company (theme-presets.ts). */
  themePreset: string;
  /** Switches that differ from the defaults (site-info-shared.ts DEFAULT_DISPLAY). */
  display?: { headerSocial?: boolean; footerBottomBar?: boolean; footerAbout?: boolean };
  hero: { badge: string; line1: string; highlight: string; description: string; primaryCta: string; secondaryCta: string; chips: [string, string, string]; status: [string, string]; perf: [string, string]; image: string };
  tagline: string;
  footerCta: { badge: string; title: string; text: string; label: string };
  servicesIntro: string;
  servicesImage: string;
  services: StarterService[];
  why: { eyebrow: string; icon: string; heading: string; description: string; reasons: StarterReason[] };
  steps: { eyebrow: string; icon: string; heading: string; accent: string; description: string; items: StarterStep[]; linkLabel: string };
  faqs: { question: string; answer: string }[];
  cta: { heading: string; description: string; label: string; checklist: string[] };
  about: { intro: string; image: string; approachHeading: string; approachDescription: string; principles: StarterStep[] };
  /** Which home sections follow the hero, and in what order (varies the page structure). */
  home: ("why" | "steps" | "services" | "faq" | "cta")[];
  /** The shape of the site itself (home blocks, extra pages, menu, footer): set by the AI generator, absent for the code-defined packs. */
  structure?: StarterStructure;
  /** Wording for the pages around the home page (about, contact, service pages, sign-in, sign-up). Absent = the neutral defaults in starter-template.ts. */
  copy?: StarterCopy;
}

/** The kinds of content block a page can be composed of; each maps to one section type in the page builder. */
export const BLOCK_KINDS = ["services-grid", "features", "checklist", "why", "steps", "faq", "text", "cta"] as const;
export type StarterBlockKind = (typeof BLOCK_KINDS)[number];
export interface StarterBlock { kind: StarterBlockKind; eyebrow: string; heading: string; text: string; items: { title: string; text: string; icon: string }[]; ctaLabel: string }
export interface StarterExtraPage { slug: string; title: string; navLabel: string; intro: string; blocks: StarterBlock[] }
export interface StarterStructure {
  homeBlocks: StarterBlock[];
  extraPages: StarterExtraPage[];
  nav: { label: string; target: string }[];
  footerColumns: { title: string; links: { label: string; target: string }[] }[];
  headerCta: string;
  /** "plan": the pages are exactly the ones planned for this business (no fixed Services / About / sign-in pages). */
  mode?: "plan";
  /** Whether customers of this business need sign-in and sign-up pages. */
  accounts?: boolean;
  /** URL word of the page of each single offering, and those pages (in plan mode every offering has its own detailed page). */
  offeringBase?: string;
  offeringPages?: { slug: string; title: string; intro: string; blocks: StarterBlock[] }[];
}

export interface StarterCopy {
  about?: { ctaHeading: string; ctaDescription: string; ctaLabel: string; linkLabel: string };
  contact?: { badge: string; headingLead: string; headingHighlight: string; headingTail: string; description: string; intro: string; emailText: string; callText: string; whatsappText: string; interestLabel: string; successDescription: string; badgeOne: [string, string]; badgeTwo: [string, string] };
  detail?: { included: string; highlightText: string; ctaDescription: string };
  login?: { badge: string; description: string; features: { title: string; body: string; icon: string }[] };
  register?: { badge: string; headingLead: string; description: string; clientLabel: string };
}

const U = (id: string, w = 1400) => `https://images.unsplash.com/${id}?q=80&w=${w}&auto=format&fit=crop`;
const IMG = {
  laptop: U("photo-1498050108023-c5249f4df085"), code: U("photo-1555066931-4365d14bab8c"), chip: U("photo-1518770660439-4636190af475"),
  security: U("photo-1550751827-4bd374c3f58b"), lock: U("photo-1563986768609-322da13575f3"), analytics: U("photo-1460925895917-afdab827c52f"),
  dashboard: U("photo-1551288049-bebda4e38f71"), servers: U("photo-1558494949-ef010cbdcc31"), team: U("photo-1522071820081-009f0129c71c"),
  meeting: U("photo-1556761175-4b46a572b786"), office: U("photo-1504384308090-c894fdcc538d"), ai: U("photo-1677442136019-21780ecad995"),
  robot: U("photo-1485827404703-89b55fcc595e"), matrix: U("photo-1526374965328-7f61d4dc18c5"), earth: U("photo-1451187580459-43490279c0fa"),
  design: U("photo-1558655146-d09347e92766"), marketing: U("photo-1432888498266-38ffec3eaf0a"), mobile: U("photo-1512941937669-90a1b58e7e9c"),
  support: U("photo-1553877522-43269d4ea984"), woman: U("photo-1581091226825-a6a2a5aee158"), dark: U("photo-1531297484001-80022131f5a1"),
};

const svc = (title: string, subtitle: string, description: string, icon: string, image: string, highlights: string[]): StarterService => ({ title, subtitle, description, icon, image, highlights });
const reason = (name: string, desc: string, icon: string): StarterReason => ({ name, desc, icon });
const step = (title: string, description: string, icon: string): StarterStep => ({ title, description, icon });

export const STARTER_PACKS: StarterPack[] = [
  {
    id: "product-studio",
    themePreset: "aurora",
    hero: { badge: "Product design & engineering", line1: "We build digital products", highlight: "people love to use", description: "{name} turns ideas into polished web and mobile products — designed, built and launched by one small, focused team.", primaryCta: "Start a project", secondaryCta: "See what we build", chips: ["Web apps", "Mobile apps", "SaaS"], status: ["Shipped fast", "Weekly releases"], perf: ["Quality", "Tested & reviewed"], image: IMG.laptop },
    tagline: "{name} is a product studio — we design, build and grow software people enjoy using.",
    footerCta: { badge: "Let's build", title: "Have a product idea?", text: "Tell us what you're building — we'll help you shape it and ship it.", label: "Start a project" },
    servicesIntro: "From the first sketch to the app store — everything it takes to launch a product.",
    servicesImage: IMG.code,
    services: [
      svc("Web Applications", "Fast, secure, built to scale.", "Custom web platforms, portals and dashboards built with modern frameworks.", "Code2", IMG.code, ["Web apps", "Portals", "Dashboards"]),
      svc("Mobile Apps", "iOS, Android and cross-platform.", "Native and cross-platform apps with clean design and reliable releases.", "Smartphone", IMG.mobile, ["iOS", "Android", "Cross-platform"]),
      svc("SaaS Platforms", "From MVP to multi-tenant.", "Subscription products with billing, roles, analytics and an admin product built in.", "Layers", IMG.dashboard, ["MVP", "Billing", "Multi-tenant"]),
      svc("UI/UX Design", "Products that feel obvious.", "Research, wireframes, design systems and prototypes you can test before building.", "Palette", IMG.design, ["Research", "Design systems", "Prototypes"]),
      svc("APIs & Integrations", "Connect everything.", "Clean APIs and integrations with the payment, messaging and CRM tools you already use.", "Plug", IMG.chip, ["REST", "Webhooks", "Payments"]),
      svc("Support & Growth", "We stay after launch.", "Monitoring, fixes and an ongoing roadmap so your product keeps improving.", "LifeBuoy", IMG.support, ["Monitoring", "Fixes", "Roadmap"]),
    ],
    why: { eyebrow: "Why {name}", icon: "Sparkles", heading: "Small team. Big product sense.", description: "What it's like to build with us.", reasons: [reason("Product thinking", "We challenge scope so you build the right thing first.", "Lightbulb"), reason("Design + code together", "Designers and engineers work side by side, not in hand-offs.", "Users"), reason("Weekly demos", "See real progress every week, not a status report.", "MonitorPlay"), reason("Built to evolve", "Clean foundations so version two is easier than version one.", "Blocks")] },
    steps: { eyebrow: "How we work", icon: "Workflow", heading: "From idea to launch in", accent: "four steps.", description: "A simple loop we repeat until your product is live.", items: [step("Discover", "Goals, users and the smallest version worth building.", "Search"), step("Design", "Flows and interfaces you can click before we code.", "Palette"), step("Build", "Short sprints with a working demo each week.", "Code2"), step("Launch", "Release, measure and keep improving.", "Rocket")], linkLabel: "Plan your product" },
    faqs: [{ question: "How do I start a project with {name}?", answer: "Send a short message through the contact page. We'll book a call to understand the idea and suggest the right first step." }, { question: "Can you take over an existing product?", answer: "Yes — we start with a review of the code and design, then agree a plan to stabilise and improve it." }, { question: "Do you work on a fixed price?", answer: "We can do fixed-scope phases or a monthly team — whichever fits how defined your product is." }],
    cta: { heading: "Have a product in mind?", description: "Tell us about it — we'll reply with next steps.", label: "Contact us", checklist: ["Free first call", "Clear estimates", "Weekly demos"] },
    about: { intro: "We're a product studio that designs and builds software, and stays to help it grow.", image: IMG.team, approachHeading: "How we build products.", approachDescription: "The habits behind every product we ship.", principles: [step("Start small", "Launch the core, learn, then expand.", "Target"), step("Show, don't tell", "Working software over long documents.", "Eye"), step("Own the quality", "Reviews, tests and docs as standard.", "BadgeCheck"), step("Stay accountable", "Support long after launch.", "HeartHandshake")] },
    home: ["services", "why", "steps", "faq", "cta"],
  },
  {
    id: "cloud-devops",
    themePreset: "midnight-tech",
    hero: { badge: "Cloud · DevOps · Reliability", line1: "Infrastructure that", highlight: "never gets in the way", description: "{name} helps engineering teams ship faster on the cloud — with pipelines, platforms and monitoring that just work.", primaryCta: "Talk to an engineer", secondaryCta: "Our services", chips: ["AWS · Azure · GCP", "Kubernetes", "CI/CD"], status: ["Uptime first", "Monitored 24×7"], perf: ["Deploys", "Many times a day"], image: IMG.servers },
    tagline: "{name} builds and runs cloud platforms so your team can focus on the product.",
    footerCta: { badge: "Ship with confidence", title: "Ready to modernise your stack?", text: "Book a free infrastructure review — we'll show you where the quick wins are.", label: "Book a review" },
    servicesIntro: "Cloud engineering, delivery pipelines and reliability — end to end.",
    servicesImage: IMG.servers,
    services: [
      svc("Cloud Migration", "Move without the downtime.", "Assess, plan and migrate workloads to AWS, Azure or Google Cloud safely.", "Cloud", IMG.earth, ["Assessment", "Migration", "Hybrid"]),
      svc("DevOps & CI/CD", "Ship on every merge.", "Automated build, test and release pipelines that make deployments routine.", "GitBranch", IMG.code, ["Pipelines", "IaC", "Automation"]),
      svc("Kubernetes & Containers", "Platforms that scale.", "Container platforms, service meshes and autoscaling set up the right way.", "Boxes", IMG.chip, ["Kubernetes", "Docker", "Helm"]),
      svc("Observability", "Know before users do.", "Metrics, logs, traces and alerts that turn incidents into non-events.", "Activity", IMG.dashboard, ["Metrics", "Tracing", "Alerts"]),
      svc("Cost Optimisation", "Pay for what you use.", "Right-sizing, reservations and architecture changes that cut the cloud bill.", "Gauge", IMG.analytics, ["FinOps", "Right-sizing", "Reports"]),
      svc("Managed SRE", "An on-call team for you.", "Round-the-clock reliability engineering with clear runbooks and SLAs.", "LifeBuoy", IMG.support, ["24×7", "Runbooks", "SLAs"]),
    ],
    why: { eyebrow: "Why {name}", icon: "ShieldCheck", heading: "Reliability is a feature.", description: "How we keep systems fast and calm.", reasons: [reason("Everything as code", "Reproducible environments, reviewed like any other change.", "Code2"), reason("Security built in", "Least privilege, secrets management and audit trails by default.", "Lock"), reason("Measured outcomes", "Deploy frequency, lead time and uptime you can see.", "LineChart"), reason("Knowledge transfer", "We document and train, so you're never dependent on us.", "BookOpen")] },
    steps: { eyebrow: "Engagement", icon: "Route", heading: "A clear path to", accent: "better delivery.", description: "How a typical platform engagement runs.", items: [step("Assess", "Review architecture, pipelines and costs.", "Search"), step("Plan", "A prioritised roadmap with quick wins first.", "ClipboardList"), step("Implement", "Build and migrate in small, reversible steps.", "Wrench"), step("Operate", "Monitor, tune and hand over — or run it for you.", "Activity")], linkLabel: "Request a review" },
    faqs: [{ question: "Which cloud providers do you work with?", answer: "AWS, Microsoft Azure and Google Cloud — we choose based on your workloads and team." }, { question: "Can you work alongside our engineers?", answer: "Yes. We embed with your team or deliver a defined project — whichever you prefer." }, { question: "Do you offer on-call support?", answer: "We offer managed reliability engineering with agreed response times." }],
    cta: { heading: "Let's make deployments boring.", description: "Tell us about your stack and we'll suggest where to start.", label: "Contact us", checklist: ["Free infrastructure review", "No lock-in", "Documented hand-over"] },
    about: { intro: "We're a cloud and DevOps engineering team that cares about calm, repeatable delivery.", image: IMG.dark, approachHeading: "How we engineer.", approachDescription: "The principles behind every platform we build.", principles: [step("Automate first", "If it's done twice, it's a pipeline.", "Workflow"), step("Observe everything", "You can't fix what you can't see.", "Eye"), step("Design for failure", "Systems that degrade gracefully.", "ShieldCheck"), step("Share knowledge", "Runbooks, not tribal knowledge.", "BookOpen")] },
    home: ["services", "steps", "why", "faq", "cta"],
  },
  {
    id: "ai-data",
    themePreset: "neon-cyber",
    display: { headerSocial: true },
    hero: { badge: "AI · Data · Automation", line1: "Turn your data into", highlight: "intelligent products", description: "{name} builds AI agents, analytics and data platforms that solve real problems — practical, measurable and secure.", primaryCta: "Explore AI for your business", secondaryCta: "What we build", chips: ["AI agents", "Machine learning", "Analytics"], status: ["Responsible AI", "Privacy-first"], perf: ["Accuracy", "Measured"], image: IMG.ai },
    tagline: "{name} designs practical AI and data solutions for growing businesses.",
    footerCta: { badge: "Start with a pilot", title: "Where could AI help you most?", text: "Book a free discovery session and leave with a prioritised list of use cases.", label: "Book a session" },
    servicesIntro: "From data pipelines to AI agents — the building blocks of an intelligent business.",
    servicesImage: IMG.matrix,
    services: [
      svc("AI Agents & Chatbots", "Assistants that do the work.", "Customer-facing and internal agents grounded in your own documents and systems.", "Bot", IMG.robot, ["Agents", "RAG", "Voice"]),
      svc("Machine Learning", "Models that earn their keep.", "Forecasting, classification and recommendation models taken all the way to production.", "BrainCircuit", IMG.ai, ["Forecasting", "NLP", "Recommendations"]),
      svc("Data Engineering", "A foundation you can trust.", "Pipelines, warehouses and governance so your data is clean and available.", "Database", IMG.servers, ["Pipelines", "Warehousing", "Quality"]),
      svc("Computer Vision", "Teach software to see.", "Image and video analysis for inspection, counting and verification.", "ScanEye", IMG.matrix, ["Detection", "OCR", "Inspection"]),
      svc("Analytics & BI", "Decisions, not dashboards.", "Self-serve reporting that shows what's happening and why.", "BarChart3", IMG.analytics, ["Dashboards", "KPIs", "Self-serve"]),
      svc("MLOps & Governance", "Keep models healthy.", "Monitoring, versioning and evaluation so AI stays accurate and accountable.", "ShieldCheck", IMG.dark, ["Monitoring", "Evaluation", "Compliance"]),
    ],
    why: { eyebrow: "Why {name}", icon: "Sparkles", heading: "AI with a business case.", description: "We start from the outcome, not the model.", reasons: [reason("Use-case first", "We rank ideas by value and feasibility before writing code.", "Target"), reason("Your data stays yours", "Private deployments and strict access controls.", "Lock"), reason("Evaluated, not assumed", "Every model ships with tests and success metrics.", "ClipboardCheck"), reason("Built for people", "Interfaces your team will actually use.", "Users")] },
    steps: { eyebrow: "From pilot to production", icon: "Rocket", heading: "A practical route to", accent: "real AI.", description: "How we take an idea from slide to system.", items: [step("Discover", "Find the use cases worth pursuing.", "Search"), step("Prototype", "A working pilot in weeks, not quarters.", "Wand2"), step("Productionise", "Integrate, secure and scale it.", "Server"), step("Improve", "Measure results and keep tuning.", "TrendingUp")], linkLabel: "Plan a pilot" },
    faqs: [{ question: "Do we need a lot of data to start?", answer: "Not always. Many useful AI features work with the documents and records you already have." }, { question: "Is our data used to train public models?", answer: "No. We design solutions so your data stays within your own environment." }, { question: "How long does a pilot take?", answer: "Usually a few weeks, with a clear success measure agreed up front." }],
    cta: { heading: "Ready to put AI to work?", description: "Tell us about the problem — we'll suggest the simplest thing that could work.", label: "Contact us", checklist: ["Free discovery session", "Pilot-first approach", "Clear success metrics"] },
    about: { intro: "We're a team of data and AI engineers building practical, responsible systems.", image: IMG.dark, approachHeading: "How we approach AI.", approachDescription: "Principles we hold ourselves to.", principles: [step("Outcome over hype", "Start from the business result.", "Target"), step("Measure honestly", "Evaluate with real data.", "LineChart"), step("Protect privacy", "Minimise data, maximise control.", "Lock"), step("Keep humans in the loop", "AI assists, people decide.", "HeartHandshake")] },
    home: ["why", "services", "steps", "cta", "faq"],
  },
  {
    id: "enterprise-it",
    themePreset: "corporate-blue",
    display: { footerBottomBar: true },
    hero: { badge: "Enterprise IT · Consulting", line1: "Technology partner for", highlight: "enterprise transformation", description: "{name} helps established organisations modernise systems, integrate platforms and run technology with confidence.", primaryCta: "Speak to a consultant", secondaryCta: "Our capabilities", chips: ["ERP & CRM", "Integration", "Managed IT"], status: ["Enterprise-grade", "Governed delivery"], perf: ["Delivery", "On plan"], image: IMG.office },
    tagline: "{name} delivers enterprise technology consulting, integration and managed services.",
    footerCta: { badge: "Let's talk", title: "Planning a transformation programme?", text: "Our consultants will help you scope it, de-risk it and deliver it.", label: "Speak to a consultant" },
    servicesIntro: "Consulting, platforms and managed services for complex organisations.",
    servicesImage: IMG.meeting,
    services: [
      svc("Digital Transformation", "Strategy to execution.", "Roadmaps and programme delivery that move legacy operations onto modern platforms.", "Compass", IMG.meeting, ["Roadmaps", "Programmes", "Change"]),
      svc("ERP & CRM", "Systems that fit your process.", "Selection, implementation and customisation of the platforms your teams live in.", "Building2", IMG.office, ["Implementation", "Customisation", "Migration"]),
      svc("Systems Integration", "One connected landscape.", "APIs, middleware and data flows that make your applications work as one.", "Network", IMG.chip, ["APIs", "Middleware", "ETL"]),
      svc("Application Modernisation", "Retire the legacy.", "Re-platform and refactor ageing applications without disrupting the business.", "RefreshCw", IMG.code, ["Re-platform", "Refactor", "Cloud-native"]),
      svc("IT Infrastructure", "Reliable foundations.", "Networks, servers, end-user computing and hybrid cloud, designed and supported.", "Server", IMG.servers, ["Networks", "Servers", "Hybrid"]),
      svc("Managed Services", "Operate with confidence.", "Service-desk and operations support backed by clear SLAs and reporting.", "Headphones", IMG.support, ["Service desk", "SLAs", "Reporting"]),
    ],
    why: { eyebrow: "Why {name}", icon: "BadgeCheck", heading: "Delivery you can govern.", description: "What enterprise teams expect from a partner.", reasons: [reason("Clear governance", "Plans, status and risks reported in a consistent rhythm.", "ClipboardList"), reason("Experienced consultants", "People who've run programmes like yours before.", "UserCheck"), reason("Security & compliance", "Controls designed in from the start.", "ShieldCheck"), reason("Transparent commercials", "Fixed scopes or time-and-materials, agreed up front.", "ReceiptText")] },
    steps: { eyebrow: "Our approach", icon: "Route", heading: "A structured path from", accent: "plan to production.", description: "How we run delivery programmes.", items: [step("Assess", "Understand systems, processes and constraints.", "Search"), step("Design", "Target architecture and a phased plan.", "LayoutTemplate"), step("Deliver", "Governed delivery in manageable releases.", "Workflow"), step("Support", "Hand over to operations or run it for you.", "LifeBuoy")], linkLabel: "Start the conversation" },
    faqs: [{ question: "What size of organisation do you work with?", answer: "We work with mid-sized and large organisations — and with teams inside them." }, { question: "Can you work with our existing vendors?", answer: "Yes. We regularly integrate with incumbent platforms and partners." }, { question: "How do you report progress?", answer: "Regular status reviews with plan, risks and decisions — agreed during mobilisation." }],
    cta: { heading: "Let's plan your next programme.", description: "Share your objectives and we'll recommend an approach.", label: "Contact us", checklist: ["Initial consultation", "Scoped proposal", "Named delivery lead"] },
    about: { intro: "We're a technology consultancy helping organisations modernise with less risk.", image: IMG.meeting, approachHeading: "How we work with you.", approachDescription: "Principles we bring to every engagement.", principles: [step("Understand the business", "Technology serves the operation.", "Building2"), step("Be transparent", "Honest plans and honest status.", "Eye"), step("Manage risk", "Surface issues early.", "ShieldAlert"), step("Transfer ownership", "Leave your teams stronger.", "Users")] },
    home: ["why", "services", "steps", "faq", "cta"],
  },
  {
    id: "digital-agency",
    themePreset: "sunset-studio",
    display: { headerSocial: true },
    hero: { badge: "Brand · Web · Growth", line1: "Brands, websites and growth,", highlight: "all under one roof", description: "{name} is a digital agency that designs memorable brands, builds fast websites and runs marketing that brings customers in.", primaryCta: "Get a free proposal", secondaryCta: "See our services", chips: ["Branding", "Websites", "Marketing"], status: ["Creative-led", "Results-driven"], perf: ["Campaigns", "Tracked"], image: IMG.marketing },
    tagline: "{name} is a digital agency — brand, web and marketing under one roof.",
    footerCta: { badge: "Say hello", title: "Let's make something people remember.", text: "Tell us about your brand and goals — we'll send a free proposal.", label: "Get a free proposal" },
    servicesIntro: "Everything you need to look great online and grow.",
    servicesImage: IMG.design,
    services: [
      svc("Brand Identity", "A look that sticks.", "Logos, colour, typography and guidelines that make your brand unmistakable.", "Palette", IMG.design, ["Logo", "Guidelines", "Collateral"]),
      svc("Website Design", "Beautiful and conversion-ready.", "Custom, responsive websites designed around how your customers decide.", "LayoutTemplate", IMG.laptop, ["Design", "Responsive", "CMS"]),
      svc("Web Development", "Fast, secure and flexible.", "Modern builds that load quickly, rank well and are easy to update.", "Code2", IMG.code, ["Performance", "SEO-ready", "E-commerce"]),
      svc("SEO & Content", "Be found, be trusted.", "Search strategy and content that earns organic traffic month after month.", "Search", IMG.analytics, ["Strategy", "Content", "Reporting"]),
      svc("Social Media", "Show up consistently.", "Content calendars, creative and community management across your channels.", "Share2", IMG.marketing, ["Content", "Community", "Creative"]),
      svc("Performance Marketing", "Spend that pays back.", "Paid campaigns with clear tracking so you know what's working.", "TrendingUp", IMG.dashboard, ["Paid search", "Paid social", "Analytics"]),
    ],
    why: { eyebrow: "Why {name}", icon: "Heart", heading: "Creative with a spreadsheet.", description: "Good-looking work that also has to perform.", reasons: [reason("One accountable team", "Brand, web and marketing planned together.", "Users"), reason("Strategy before pixels", "We start with your audience and goals.", "Target"), reason("Measurable results", "Dashboards that tie work to outcomes.", "LineChart"), reason("Friendly and fast", "Quick turnarounds and straight answers.", "Smile")] },
    steps: { eyebrow: "Our process", icon: "Workflow", heading: "From brief to", accent: "launch day.", description: "How a typical project flows.", items: [step("Brief", "Goals, audience and what success looks like.", "ClipboardList"), step("Concept", "Directions and designs to react to.", "Lightbulb"), step("Create", "Build, write and refine together.", "PenTool"), step("Launch", "Go live and track the results.", "Rocket")], linkLabel: "Start your brief" },
    faqs: [{ question: "How do we get started?", answer: "Send us a short brief via the contact page. We'll reply with questions and a free proposal." }, { question: "Do you work with small businesses?", answer: "Yes — we tailor scope and budget to where you are." }, { question: "Can you manage our ongoing marketing?", answer: "Yes, on a monthly plan with clear reporting." }],
    cta: { heading: "Ready to stand out?", description: "Tell us about your brand and we'll send a free proposal.", label: "Contact us", checklist: ["Free proposal", "Fast turnaround", "Clear reporting"] },
    about: { intro: "We're a small digital agency that pairs good design with measurable growth.", image: IMG.team, approachHeading: "How we work.", approachDescription: "What you can expect from us.", principles: [step("Listen first", "Your goals shape the work.", "MessageSquare"), step("Design with purpose", "Every choice has a reason.", "Palette"), step("Measure it", "Track what matters.", "BarChart3"), step("Keep improving", "Great brands evolve.", "RefreshCw")] },
    home: ["services", "steps", "why", "cta", "faq"],
  },
  {
    id: "managed-security",
    themePreset: "graphite-pro",
    hero: { badge: "Cybersecurity · Managed IT", line1: "Secure, reliable IT", highlight: "that keeps you running", description: "{name} protects and supports your technology — from security monitoring to the helpdesk your team calls first.", primaryCta: "Get a security review", secondaryCta: "Our services", chips: ["Security", "Managed IT", "Backup & DR"], status: ["Proactive", "Always monitored"], perf: ["Response", "Fast"], image: IMG.security },
    tagline: "{name} provides cybersecurity and managed IT services for growing businesses.",
    footerCta: { badge: "Stay protected", title: "Not sure how exposed you are?", text: "Book a free security review and get a plain-English report.", label: "Get a security review" },
    servicesIntro: "Protection, support and continuity — handled by one team.",
    servicesImage: IMG.lock,
    services: [
      svc("Cybersecurity", "Defence in depth.", "Assessments, endpoint protection and monitoring that close gaps before attackers find them.", "ShieldCheck", IMG.lock, ["Assessments", "Endpoint", "Monitoring"]),
      svc("Managed IT", "Your outsourced IT team.", "Proactive management of devices, users and software with predictable monthly pricing.", "Server", IMG.servers, ["Devices", "Users", "Patching"]),
      svc("Network & Infrastructure", "Fast, stable, secure.", "Design, install and support of networks, Wi-Fi and on-site infrastructure.", "Network", IMG.chip, ["Networking", "Wi-Fi", "Firewalls"]),
      svc("Backup & Disaster Recovery", "Be back in minutes.", "Tested backups and recovery plans so an incident never becomes a crisis.", "HardDrive", IMG.servers, ["Backups", "Recovery", "Testing"]),
      svc("Compliance Support", "Audit-ready.", "Policies, evidence and controls mapped to the standards you must meet.", "FileCheck", IMG.office, ["Policies", "Evidence", "Audits"]),
      svc("Helpdesk", "Friendly, fast support.", "A responsive service desk for your team, with clear priorities and updates.", "Headphones", IMG.support, ["Tickets", "Remote", "On-site"]),
    ],
    why: { eyebrow: "Why {name}", icon: "ShieldCheck", heading: "Calm, competent IT.", description: "What good IT support feels like.", reasons: [reason("Proactive, not reactive", "We fix issues before they interrupt work.", "Radar"), reason("Plain-English reporting", "You always know your risk and what we're doing.", "FileText"), reason("Predictable pricing", "Simple monthly plans, no surprise bills.", "Banknote"), reason("Real people", "A named team who know your environment.", "Users")] },
    steps: { eyebrow: "Getting started", icon: "Route", heading: "Onboarding in", accent: "four steps.", description: "How we take over and improve your IT.", items: [step("Review", "Audit your environment and risks.", "Search"), step("Stabilise", "Fix the urgent issues first.", "Wrench"), step("Protect", "Roll out security and backups.", "Lock"), step("Support", "Ongoing monitoring and helpdesk.", "Headphones")], linkLabel: "Book a review" },
    faqs: [{ question: "Do you support remote and hybrid teams?", answer: "Yes — we manage devices and security wherever your people work." }, { question: "What happens if there's an incident?", answer: "We contain it, restore from backups and give you a clear report of what happened." }, { question: "Can you work with our current IT person?", answer: "Absolutely — we can complement or fully replace your in-house team." }],
    cta: { heading: "Let's secure your business.", description: "Request a free review and we'll show you where to start.", label: "Contact us", checklist: ["Free security review", "No long contracts", "Plain-English report"] },
    about: { intro: "We're an IT and security team that treats your systems like our own.", image: IMG.dark, approachHeading: "How we protect you.", approachDescription: "The principles behind our service.", principles: [step("Assume breach", "Layer defences, plan for failure.", "ShieldAlert"), step("Keep it simple", "Fewer tools, better managed.", "Settings"), step("Communicate clearly", "No jargon, no surprises.", "MessageSquare"), step("Test everything", "Backups that actually restore.", "ClipboardCheck")] },
    home: ["services", "why", "steps", "cta", "faq"],
  },
  {
    id: "fintech-software",
    themePreset: "emerald-finance",
    hero: { badge: "Fintech · Payments · Banking software", line1: "Software for money,", highlight: "built with trust", description: "{name} builds secure payments, lending and banking software for finance teams that can't afford surprises.", primaryCta: "Discuss your platform", secondaryCta: "What we build", chips: ["Payments", "Lending", "Compliance"], status: ["Security first", "Audit-ready"], perf: ["Reliability", "Built in"], image: IMG.dashboard },
    tagline: "{name} builds secure, compliant software for payments, lending and financial services.",
    footerCta: { badge: "Let's talk", title: "Building a financial product?", text: "Share your requirements — we'll outline an approach and timeline.", label: "Discuss your platform" },
    servicesIntro: "Secure financial software, from core systems to customer apps.",
    servicesImage: IMG.analytics,
    services: [
      svc("Payments Platforms", "Move money reliably.", "Gateways, wallets and reconciliation built for accuracy and uptime.", "CreditCard", IMG.dashboard, ["Gateways", "Wallets", "Reconciliation"]),
      svc("Lending & Credit", "From application to repayment.", "Origination, scoring, collections and reporting in one workflow.", "Banknote", IMG.analytics, ["Origination", "Scoring", "Collections"]),
      svc("Banking Apps", "Customer experiences that earn trust.", "Mobile and web banking interfaces that are clear, fast and accessible.", "Smartphone", IMG.mobile, ["Mobile", "Web", "Onboarding"]),
      svc("Compliance & KYC", "Meet the rules, smoothly.", "Identity verification, audit trails and reporting designed in.", "FileCheck", IMG.office, ["KYC", "AML", "Audit trails"]),
      svc("Data & Reporting", "See the whole picture.", "Dashboards and analytics for risk, operations and finance teams.", "BarChart3", IMG.analytics, ["Dashboards", "Risk", "Finance"]),
      svc("Integrations", "Connect your ecosystem.", "Bureaus, banks, accounting and partner APIs wired in securely.", "Plug", IMG.chip, ["Banks", "Bureaus", "Accounting"]),
    ],
    why: { eyebrow: "Why {name}", icon: "ShieldCheck", heading: "Where accuracy matters.", description: "Qualities financial teams look for.", reasons: [reason("Security by design", "Encryption, access control and logging from day one.", "Lock"), reason("Auditability", "Every action traceable and reportable.", "ClipboardCheck"), reason("Resilient systems", "Designed for high availability and safe recovery.", "Server"), reason("Domain fluency", "We speak the language of finance and compliance.", "BookOpen")] },
    steps: { eyebrow: "How we deliver", icon: "Workflow", heading: "Careful delivery,", accent: "in four stages.", description: "A disciplined process for sensitive systems.", items: [step("Scope", "Requirements, risks and regulatory needs.", "ClipboardList"), step("Architect", "Secure, scalable design reviewed up front.", "Blocks"), step("Build & test", "Rigorous testing for every release.", "BadgeCheck"), step("Go live", "Controlled rollout and monitoring.", "Rocket")], linkLabel: "Scope your platform" },
    faqs: [{ question: "Do you handle regulatory requirements?", answer: "We design for them from the start and work with your compliance team to map controls." }, { question: "Can you integrate with our core banking system?", answer: "Yes — we build secure integrations with core systems and third-party providers." }, { question: "How do you protect sensitive data?", answer: "Encryption, least-privilege access, logging and regular security reviews." }],
    cta: { heading: "Let's build it properly.", description: "Share your requirements and we'll propose an approach.", label: "Contact us", checklist: ["Security review included", "Clear milestones", "Named delivery lead"] },
    about: { intro: "We're a software team focused on financial products where trust is everything.", image: IMG.meeting, approachHeading: "How we build.", approachDescription: "Principles for sensitive systems.", principles: [step("Get it right", "Accuracy before speed.", "BadgeCheck"), step("Protect data", "Security as a baseline.", "Lock"), step("Be auditable", "Everything traceable.", "FileSearch"), step("Stay calm", "Predictable, boring releases.", "Gauge")] },
    home: ["why", "steps", "services", "faq", "cta"],
  },
  {
    id: "commerce-tech",
    themePreset: "candy-pastel",
    display: { headerSocial: true },
    hero: { badge: "E-commerce · Retail technology", line1: "Online stores that", highlight: "sell while you sleep", description: "{name} builds fast, friendly e-commerce experiences — storefronts, checkout, inventory and the integrations behind them.", primaryCta: "Launch your store", secondaryCta: "Our services", chips: ["Storefronts", "Checkout", "Inventory"], status: ["Conversion-focused", "Mobile-first"], perf: ["Speed", "Optimised"], image: IMG.mobile },
    tagline: "{name} designs and builds e-commerce and retail technology that customers love.",
    footerCta: { badge: "Let's grow", title: "Ready to sell more online?", text: "Tell us about your products — we'll plan a store that converts.", label: "Launch your store" },
    servicesIntro: "Everything behind a great online shop.",
    servicesImage: IMG.marketing,
    services: [
      svc("Custom Storefronts", "Designed to convert.", "Beautiful, fast online stores tailored to your brand and catalogue.", "ShoppingCart", IMG.marketing, ["Design", "Catalogue", "Mobile-first"]),
      svc("Checkout & Payments", "Fewer abandoned carts.", "Smooth checkout with the payment methods your customers prefer.", "CreditCard", IMG.dashboard, ["Checkout", "UPI & cards", "Wallets"]),
      svc("Inventory & Orders", "Stay in control.", "Stock, orders and fulfilment in one place — synced across channels.", "Package", IMG.office, ["Stock", "Orders", "Fulfilment"]),
      svc("Marketplace Integration", "Sell everywhere.", "Connect to marketplaces and social shops from a single catalogue.", "Share2", IMG.laptop, ["Marketplaces", "Social", "Feeds"]),
      svc("Mobile Shopping Apps", "Your store in their pocket.", "Native apps with push notifications, loyalty and fast reordering.", "Smartphone", IMG.mobile, ["iOS", "Android", "Loyalty"]),
      svc("Growth & Analytics", "Know what sells.", "Funnels, cohorts and campaign tracking that guide your next move.", "LineChart", IMG.analytics, ["Funnels", "Cohorts", "Campaigns"]),
    ],
    why: { eyebrow: "Why {name}", icon: "Heart", heading: "Shops people enjoy.", description: "What makes our stores different.", reasons: [reason("Conversion-first design", "Every screen built to help people buy.", "Target"), reason("Blazing fast", "Speed that lifts sales and search ranking.", "Zap"), reason("Easy to manage", "Simple tools for your team, not a maze.", "Smile"), reason("Grows with you", "Add products, regions and channels without a rebuild.", "TrendingUp")] },
    steps: { eyebrow: "How we launch", icon: "Rocket", heading: "From catalogue to", accent: "first order.", description: "A simple route to a live store.", items: [step("Plan", "Catalogue, payments and shipping.", "ClipboardList"), step("Design", "A storefront that fits your brand.", "Palette"), step("Build", "Develop, connect and test.", "Code2"), step("Launch", "Go live and watch the orders come in.", "Rocket")], linkLabel: "Plan your store" },
    faqs: [{ question: "Can you migrate our existing store?", answer: "Yes — products, customers and orders can be moved across safely." }, { question: "Which payment methods can you set up?", answer: "Cards, UPI, wallets and more, depending on your payment provider." }, { question: "Will I be able to update products myself?", answer: "Yes — we build simple admin tools and train your team." }],
    cta: { heading: "Ready to open for business?", description: "Tell us about your products and we'll plan the store.", label: "Contact us", checklist: ["Free consultation", "Fast launch", "Training included"] },
    about: { intro: "We're a team of designers and engineers who love making online shopping better.", image: IMG.team, approachHeading: "How we build stores.", approachDescription: "Habits that help shops sell.", principles: [step("Know the customer", "Design from their point of view.", "Users"), step("Keep it fast", "Speed is a feature.", "Zap"), step("Make it simple", "Fewer clicks, more orders.", "Smile"), step("Measure & improve", "Let the data guide you.", "BarChart3")] },
    home: ["services", "why", "steps", "cta", "faq"],
  },
];

/** A stable pick: the same company always gets the same pack, different companies spread across all of them. */
export function pickStarterPack(companyId: string): StarterPack {
  let h = 0;
  for (let i = 0; i < companyId.length; i++) h = (h * 31 + companyId.charCodeAt(i)) >>> 0;
  return STARTER_PACKS[h % STARTER_PACKS.length];
}

export const fillName = (text: string, name: string) => text.replaceAll("{name}", name);
