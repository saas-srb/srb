/**
 * Interface text for the Products section. Same system as the rest of the
 * site: keyed text that is CMS content (CMS → Site Identity → Page & widget
 * text, `siteInfo.text`). These are the starting values — a CMS value for a
 * key always wins, so every heading and button below is editable there.
 */
export const PRODUCTS_TEXT_DEFAULTS: Record<string, string> = {
  // Shared
  "products.breadcrumb.home": "Home",
  "products.breadcrumb.products": "Products",
  "products.cta.getStarted": "Get Started",
  "products.cta.requestDemo": "Request Demo",
  "products.cta.startUsing": "Start Using",
  "products.cta.startUsingHint": "Already a customer? Sign in to this product.",
  "products.card.explore": "Explore Product",
  "products.card.ai": "AI-assisted",

  // Listing
  "products.listing.meta.title": "Products — AI-Powered Business Software",
  "products.listing.meta.description": "One connected platform of AI-powered business software: HR and payroll, projects, finance, CRM, procurement, training, assessments, documents, social media, SEO, team chat and AI assistants.",
  "products.listing.badge": "Product suite",
  "products.listing.title": "AI-powered software for every part of your",
  "products.listing.titleAccent": "business",
  "products.listing.description": "Run people, projects, money, sales and knowledge from one connected platform. Every product shares one sign-in, one set of roles and one company record, and the AI works across all of them.",
  "products.listing.filterAll": "All products",
  "products.listing.filterLabel": "Filter products by category",
  "products.listing.gridHeading": "Explore the product suite",
  "products.listing.gridDescription": "Pick a product to see what it does, how it automates the work, and how it connects to the rest of the platform.",
  "products.listing.count": "Product list updated.",
  "products.listing.connected.badge": "One connected platform",
  "products.listing.connected.title": "Products that share one company record",
  "products.listing.connected.description": "A client created in Projects is the same client in Finance and in the Client Portal. A lead won in CRM becomes a client. One sign-in and one role model cover every product, and every company's data is kept separate from every other's.",
  "products.listing.connected.hub": "One sign-in · one set of roles · one company record",
  "products.cta.bullet1": "Each company's data is kept separate from every other company's.",
  "products.cta.bullet2": "One sign-in and one role model across every product.",
  "products.cta.bullet3": "AI and automations that work across the products.",
  "products.listing.connected.flow1.title": "Applicant to employee",
  "products.listing.connected.flow1.text": "A shortlisted careers applicant converts into an HR employee record, with the application kept as history.",
  "products.listing.connected.flow2.title": "Client to invoice",
  "products.listing.connected.flow2.text": "Finance invoices point at the same client and project records that Projects manages — nothing is copied or re-typed.",
  "products.listing.connected.flow3.title": "Payroll, bills and training fees in the books",
  "products.listing.connected.flow3.text": "Finance reads payroll runs from HR, vendors, bills and expense claims from Procurement, and training payments from Training.",
  "products.listing.connected.flow4.title": "Automations across products",
  "products.listing.connected.flow4.text": "When a lead, task, invoice or leave request changes, an automation can email, notify a team or call a webhook.",
  "products.listing.ai.badge": "AI across the suite",
  "products.listing.ai.title": "AI where the work happens",
  "products.listing.ai.description": "These are the AI features that exist today, in the products that have them.",
  "products.listing.cta.title": "See which products fit your business",
  "products.listing.cta.description": "Start with the products you need today and switch on more as you grow. Or let us walk you through it.",

  // Detail — section headings
  "products.detail.problem": "The problem it solves",
  "products.detail.whatItDoes": "What it does",
  "products.detail.purpose": "Primary purpose",
  "products.detail.features": "Key features",
  "products.detail.featuresDescription": "What you can do with it, day to day.",
  "products.detail.ai": "AI capabilities",
  "products.detail.aiDescription": "What the AI does in and around this product — concretely.",
  "products.detail.automation": "Automation & workflows",
  "products.detail.automationDescription": "How work moves from start to finish without hand-offs and re-typing.",
  "products.detail.useCases": "Use cases",
  "products.detail.useCasesDescription": "Real tasks, real roles.",
  "products.detail.scenarios": "Supported business scenarios",
  "products.detail.benefits": "Benefits & business outcome",
  "products.detail.benefitsDescription": "What changes for your business.",
  "products.detail.whoFor": "Who it's for",
  "products.detail.departments": "Departments",
  "products.detail.users": "Typical users",
  "products.detail.integrations": "Works with",
  "products.detail.integrationsDescription": "The other products and integration points it connects to.",
  "products.detail.tour": "Product tour",
  "products.detail.tourDescription": "A preview of the interface with sample data. Select a screen, then hover or tap the markers.",
  "products.detail.screenshots": "Screenshots",
  "products.detail.faq": "Frequently asked questions",
  "products.detail.related": "Related products",
  "products.detail.prev": "Previous product",
  "products.detail.next": "Next product",
  "products.detail.allProducts": "All products",
  "products.detail.steps": "How it runs",
  "products.detail.cta.title": "Ready to put {name} to work?",
  "products.detail.cta.description": "Create your company workspace, or ask for a walkthrough with your own scenarios.",
  "products.detail.meta.suffix": "Product",

  // Round 2: signup CTAs, listing hero + featured card, problem section, hero images.
  // (New keys rather than edits to the old ones, so a database that already stored the round-1 values keeps working.)
  "products.cta.createAutomation": "Create Your Business Automation",
  "products.cta.startAutomating": "Start Automating Your Business",
  "products.cta.explorePlatform": "Explore the Platform",
  "products.cta.automateHint": "Ready to automate your own business?",
  "products.menu.cta": "Start Automating Your Business",
  "products.menu.viewAll": "View all Products",
  "products.listing.heroTitle": "Our Products",
  "products.listing.heroEyebrow": "AI-powered business software",
  "products.listing.heroImage": "https://images.unsplash.com/photo-1551288049-bebda4e38f71?q=80&w=1400&auto=format&fit=crop",
  "products.hero.imageDefault": "https://images.unsplash.com/photo-1639322537228-f710d846310a?q=80&w=1400&auto=format&fit=crop",
  "products.hero.imageAi": "https://images.unsplash.com/photo-1677442136019-21780ecad995?q=80&w=1400&auto=format&fit=crop",
  // The pitch + points replace the round-2 description/chip keys (new keys, so a stored database picks up the whole-platform wording).
  "products.featured.image": "https://images.unsplash.com/photo-1639322537228-f710d846310a?q=80&w=1200&auto=format&fit=crop",
  "products.featured.subtitle": "One connected platform",
  "products.featured.badge": "Business Automation SaaS",
  "products.featured.title": "Automate Your Business with Our AI-Powered Business Automation SaaS",
  "products.featured.pitch": "The complete connected business-automation platform: HR, projects, finance, CRM, procurement, training and more share one workspace, one sign-in, one set of roles and one company record. Automations turn events in any of them into emails, notifications and webhooks, and AI answers questions from your own data.",
  "products.featured.href": "/services/our-saas-product",
  "products.featured.point1": "Every product in one workspace",
  "products.featured.point2": "Workflow automation across all of them",
  "products.featured.point3": "AI that answers from your own data",
  "products.featured.point4": "One sign-in, one set of roles",
  "products.listing.moreLabel": "Explore the product suite",
  "products.detail.problem.title": "The Problem It Solves",
  "products.detail.compare.title": "Without it, and with it",
  "products.detail.compare.description": "The same everyday work, before and after.",
  "products.detail.compare.before": "Without it",
  "products.detail.compare.after": "With it",
  "products.detail.band.check1": "One sign-in for every product",
  "products.detail.band.check2": "Workflow automations",
  "products.detail.band.check3": "AI across the products",
  "products.detail.band.title": "Create your own automated workspace",
  "products.detail.band.description": "Register your company and set up {name} with the rest of the platform: one sign-in, shared roles and automations that connect your work.",

  // Demo form
  "products.demo.title": "Request a demo",
  "products.demo.description": "Tell us what you want to run and we will walk you through it on your own scenarios.",
  "products.demo.product": "Interested product",
  "products.demo.name": "Your name",
  "products.demo.phone": "Phone number",
  "products.demo.email": "Email address",
  "products.demo.message": "What would you like to see? (optional)",
  "products.demo.submit": "Request demo",
  "products.demo.sending": "Sending request",
  "products.demo.successTitle": "Demo request sent",
  "products.demo.successText": "Thank you. We will get back to you shortly.",
  "products.demo.allProducts": "The whole platform",
};

/** Defaults overlaid with the CMS dictionary; a blank CMS value falls back to the default. */
export function resolveProductsText(cms: Record<string, string> | undefined): Record<string, string> {
  const out = { ...PRODUCTS_TEXT_DEFAULTS };
  for (const [k, v] of Object.entries(cms ?? {})) if (k.startsWith("products.") && v.trim()) out[k] = v;
  return out;
}

/** `{n}`-style placeholders. */
export const fillText = (template: string, vars: Record<string, string | number>) => template.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ""));
