import type { PageSection } from "@/lib/products/sitecraft-ai/section-registry";
import { fillName, type StarterBlock, type StarterPack } from "@/lib/platform/website/starter-packs";

/**
 * A neutral starter website for a new company — the pages the public site
 * can't render without (`/`, `/contact`) plus Services, About and a privacy
 * policy starting point. Built only from the CMS's existing section types, so
 * everything is editable in the company's CMS afterwards. Which copy, images
 * and section order a company gets comes from its starter pack
 * (`starter-packs.ts`), so new websites don't all look alike.
 *
 * Content is deliberately generic: no client names, testimonials, statistics
 * or promises that the company hasn't made.
 */

export interface StarterVars {
  name: string;
  /** Public contact email for the privacy page; blank until the company profile provides one. */
  email: string;
}

export interface StarterPage {
  path: string;
  title: string;
  sections: PageSection[];
  seo: { title: string; description: string };
}

const IMG = {
  contact: "https://images.unsplash.com/photo-1519337265831-281ec6cc8514?q=80&w=1600&auto=format&fit=crop",
  privacy: "https://images.unsplash.com/photo-1633265486064-086b219458ec?q=80&w=1200&auto=format&fit=crop",
};

/** The URL word for one offering: its title in plain letters, or `item-N` when the title has none (another script). */
export const offeringSlug = (title: string, index: number) => {
  const s = title.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
  return s || `item-${index + 1}`;
};

/** `/services/<slug>` for a service title. */
export const serviceSlug = (title: string) => title.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** Whether a block has enough real content to be shown (a block without it is dropped, never published half-empty). */
export function blockUsable(b: StarterBlock): boolean {
  const items = b.items.filter((i) => i.title && i.text);
  switch (b.kind) {
    case "services-grid": return true;
    case "features": return items.length >= 3;
    case "checklist": return items.length >= 3 && !!b.heading;
    case "why": return items.length >= 3;
    case "steps": return items.length >= 3;
    case "faq": return items.length >= 3;
    case "text": return !!b.heading && b.text.length >= 80;
    case "cta": return true;
  }
}

let order = 0;
function section(type: string, config: Record<string, unknown>): PageSection {
  order += 1024;
  return { id: `${type}-${order}`, type, orderKey: order, enabled: true, config } as PageSection;
}

export function starterPages(v: StarterVars, pack: StarterPack): StarterPage[] {
  order = 0;
  const t = (text: string) => fillName(text, v.name);
  const planMode = pack.structure?.mode === "plan";
  /** Where "see what we offer" style links lead: the first page the plan made, else the contact page. */
  const detailSlugs = new Set((pack.structure?.offeringPages ?? []).map((p) => p.slug));
  const planDetailHref = (n: number): string | null => {
    const slug = pack.services[n] ? offeringSlug(pack.services[n].title, n) : "";
    return planMode && slug && detailSlugs.has(slug) ? `/${pack.structure?.offeringBase ?? "offerings"}/${slug}` : null;
  };
  const firstPlanPath = pack.structure?.extraPages[0] ? `/${pack.structure.extraPages[0].slug}` : "/contact";
  const servicesSection = () => section("listing-grid", { badge: "Services", badgeIcon: "Layers", sectionLabel: "What We Do", items: pack.services.map((s) => ({ ...s, href: `/services/${serviceSlug(s.title)}` })) });
  const homeSections: Record<string, () => PageSection> = {
    services: servicesSection,
    why: () => section("home-why-choose-us", { eyebrow: t(pack.why.eyebrow), headerIcon: pack.why.icon, heading: pack.why.heading, description: pack.why.description, reasons: pack.why.reasons }),
    steps: () => section("home-how-we-work", { eyebrow: pack.steps.eyebrow, headerIcon: pack.steps.icon, heading: pack.steps.heading, accent: pack.steps.accent, description: pack.steps.description, steps: pack.steps.items, linkLabel: pack.steps.linkLabel, linkHref: "/contact" }),
    faq: () => section("faq-accordion", { title: "Frequently asked questions", faqs: pack.faqs.map((f) => ({ question: t(f.question), answer: f.answer })) }),
    cta: () => section("detail-cta", { heading: pack.cta.heading, description: pack.cta.description, ctaLabel: pack.cta.label, external: false, checklist: pack.cta.checklist }),
  };

  const c = pack.copy ?? {};
  const blockSection = (b: StarterBlock, n: number): PageSection | null => {
    const items = b.items.filter((i) => i.title && i.text);
    switch (b.kind) {
      case "services-grid":
        return section("listing-grid", { badge: b.eyebrow || "Services", badgeIcon: "Layers", sectionLabel: b.heading || "What we do", items: pack.services.map((s, n) => ({ ...s, href: planMode ? planDetailHref(n) ?? "/contact" : `/services/${serviceSlug(s.title)}` })) });
      case "features":
        return items.length >= 2 ? section("feature-highlights", { title: b.heading, features: items.slice(0, 6).map((i) => ({ name: t(i.title), desc: t(i.text) })) }) : null;
      case "checklist":
        return items.length >= 2 && b.heading ? section("checklist-grid", { id: `list-${n}`, title: t(b.heading), description: t(b.text), items: items.slice(0, 12).map((i) => ({ title: t(i.title), description: t(i.text) })), columns: items.length > 4 ? 3 : 2, tone: "default" }) : null;
      case "why":
        return items.length >= 3 ? section("home-why-choose-us", { eyebrow: t(b.eyebrow), headerIcon: items[0].icon || "BadgeCheck", heading: t(b.heading), description: t(b.text), reasons: items.slice(0, 4).map((i) => ({ name: t(i.title), desc: t(i.text), icon: i.icon || "BadgeCheck" })) }) : null;
      case "steps":
        return items.length >= 3 ? section("home-how-we-work", { eyebrow: t(b.eyebrow), headerIcon: "Route", heading: t(b.heading), accent: "", description: t(b.text), steps: items.slice(0, 4).map((i) => ({ title: t(i.title), description: t(i.text), icon: i.icon || "CheckCircle2" })), linkLabel: b.ctaLabel || pack.cta.label, linkHref: "/contact" }) : null;
      case "faq":
        return items.length >= 2 ? section("faq-accordion", { title: t(b.heading || "Frequently asked questions"), faqs: items.slice(0, 8).map((i) => ({ question: t(i.title), answer: t(i.text) })) }) : null;
      case "text":
        return b.heading && b.text ? section("text-panel", { title: t(b.heading), body: t(b.text) }) : null;
      case "cta":
        return section("detail-cta", { heading: t(b.heading || pack.cta.heading), description: t(b.text || pack.cta.description), ctaLabel: b.ctaLabel || pack.cta.label, external: false, checklist: items.slice(0, 4).map((i) => i.title) });
    }
  };
  const blocks = (list: StarterBlock[]) => list.map((b, n) => blockSection(b, n)).filter((x): x is PageSection => x !== null);

  const h = pack.hero;
  const home: StarterPage = {
    path: "/",
    title: "Home",
    seo: { title: `${v.name} — ${h.badge.split("·")[0].trim()}`, description: t(h.description) },
    sections: [
      section("home-hero", {
        badge: h.badge,
        titleLine1: h.line1,
        titleHighlight: h.highlight,
        description: t(h.description),
        primaryCtaLabel: h.primaryCta,
        primaryCtaHref: "/contact",
        secondaryCtaLabel: h.secondaryCta,
        secondaryCtaHref: planMode ? firstPlanPath : "/services",
        chipOne: h.chips[0],
        chipTwo: h.chips[1],
        chipThree: h.chips[2],
        statusTitle: h.status[0],
        statusText: h.status[1],
        perfTitle: h.perf[0],
        perfText: h.perf[1],
        scrollLabel: "Scroll to explore",
        image: h.image,
      }),
      ...(pack.structure ? blocks(pack.structure.homeBlocks) : pack.home.map((key) => homeSections[key]())),
    ],
  };

  const services: StarterPage = {
    path: "/services",
    title: "Services",
    seo: { title: `Services | ${v.name}`, description: t(pack.servicesIntro) },
    sections: [
      section("listing-hero", { eyebrow: "services", title: "Our Services", description: t(pack.servicesIntro), icon: "Layers", image: pack.servicesImage }),
      servicesSection(),
      section("detail-cta", { heading: "Not sure what you need?", description: "Tell us about your idea and we'll recommend the right approach.", ctaLabel: "Contact Us", external: false, checklist: [] }),
    ],
  };

  const about: StarterPage = {
    path: "/about",
    title: "About",
    seo: { title: `About | ${v.name}`, description: `Learn about ${v.name} and how we work.` },
    sections: [
      section("listing-hero", { eyebrow: "about", title: `About ${v.name}`, description: t(pack.about.intro), icon: "Users", image: pack.about.image }),
      section("home-how-we-work", {
        eyebrow: "Our Approach",
        headerIcon: "Compass",
        heading: pack.about.approachHeading,
        accent: "",
        description: pack.about.approachDescription,
        steps: pack.about.principles,
        linkLabel: c.about?.linkLabel ?? "Work with us",
        linkHref: "/contact",
      }),
      section("detail-cta", { heading: c.about?.ctaHeading ?? "Get in touch", description: c.about?.ctaDescription ?? "Tell us what you need and we'll take it from there.", ctaLabel: c.about?.ctaLabel ?? "Contact Us", external: false, checklist: [] }),
    ],
  };

  const contact: StarterPage = {
    path: "/contact",
    title: "Contact",
    seo: { title: `Contact | ${v.name}`, description: `Get in touch with ${v.name}.` },
    sections: [
      section("contact-hero", {
        badge: c.contact?.badge ?? "Get in touch",
        headingLead: c.contact?.headingLead ?? "We'd love to ",
        headingHighlight: c.contact?.headingHighlight ?? "hear from you",
        headingTail: c.contact?.headingTail ?? ".",
        description: c.contact?.description ?? "Have a question or a request? Send us a message and we'll get back to you.",
        backgroundImage: IMG.contact,
        cardImage: IMG.contact,
        badgeOneTitle: c.contact?.badgeOne[0] ?? "Quick response",
        badgeOneSubtitle: c.contact?.badgeOne[1] ?? "Every enquiry answered",
        badgeTwoTitle: c.contact?.badgeTwo[0] ?? "Clear answers",
        badgeTwoSubtitle: c.contact?.badgeTwo[1] ?? "No pressure",
      }),
      section("contact-form", {
        heading: "Get in Touch",
        intro: c.contact?.intro ?? "Fill out the form and we'll reach out to you.",
        emailTitle: "Email us",
        emailText: c.contact?.emailText ?? "For general enquiries and requests.",
        callTitle: "Call us",
        callText: c.contact?.callText ?? "Available during business hours.",
        whatsappTitle: "Chat on WhatsApp",
        whatsappText: c.contact?.whatsappText ?? "Message us directly.",
        visitTitle: "Visit us",
        successDescription: c.contact?.successDescription ?? "Thanks for reaching out. We'll get back to you soon.",
        submitLabel: "Send Message",
        submittingLabel: "Sending",
        interestLabel: c.contact?.interestLabel ?? "I'm interested in",
        subServiceLabel: "Specific Service",
        resumeLabel: "Resume / CV (PDF or Word, optional)",
        consentLead: "By submitting this form, you agree to our ",
        consentLinkLabel: "Privacy Policy",
        consentHref: "/privacy-policy",
        consentTail: ".",
      }),
    ],
  };

  const reach = v.email ? `by writing to ${v.email}` : "through the Contact page of this website";
  const doc = (id: string, title: string, icon: string, paragraphs: string[], bullets: string[] = []) => ({ id, title, icon, paragraphs, bullets });
  const privacy: StarterPage = {
    path: "/privacy-policy",
    title: "Privacy Policy",
    seo: { title: `Privacy Policy | ${v.name}`, description: `How ${v.name} collects, uses and protects personal data under Indian law, and your rights.` },
    sections: [
      section("page-hero", { category: "legal", categoryLabel: "legal", title: "Privacy Policy", subtitle: "How we handle your personal data.", description: `This notice explains what personal data ${v.name} collects through this website, why, how long we keep it and your rights under the Digital Personal Data Protection Act, 2023 and the Information Technology Act, 2000.`, icon: "ShieldCheck", image: IMG.privacy, primaryCtaExternal: false }),
      section("legal-document", {
        sections: [
          doc("who", "Who we are", "Building2", [`${v.name} (“we”, “us”) is the Data Fiduciary for the personal data collected through this website. You can reach us ${reach}.`]),
          doc("collect", "Personal data we collect", "FileText", ["We collect only what you choose to give us, and basic technical data needed to run and secure the website."], ["Contact details and messages: your name, email address, phone number and the message you send through a form or by email.", "Account details, if this website has sign-in: your name, email, phone number and a password that we store only as a secure hash.", "Technical data: IP address, browser type and the pages you open, kept in server logs for security."]),
          doc("why", "Why we use it", "Settings", ["We use your personal data to answer your enquiry, provide the service or product you asked for, keep the website secure, and meet legal duties such as tax and accounting. We use it for marketing messages only if you have agreed. We do not sell your personal data."]),
          doc("consent", "Consent", "UserCheck", ["Where we rely on your consent we ask for it clearly, for a stated purpose, and you can withdraw it at any time as easily as you gave it, by writing to us. Withdrawing consent does not affect what was done before. On request we give you this notice in English or in any language listed in the Eighth Schedule to the Constitution of India."]),
          doc("share", "Who we share it with", "Share2", ["We share personal data only with providers that help us run this website and our business (for example hosting, email and payment services), who may use it only for that purpose, and with courts, government agencies and regulators when the law requires it. Some providers may process data outside India; we do not transfer personal data to any country the Central Government has restricted."]),
          doc("keep", "How long we keep it", "Clock", ["We keep personal data only as long as the purpose needs, and as long as the law requires for tax and accounting records. When the purpose is served and no law needs us to keep it, we erase it."]),
          doc("security", "How we protect it", "Lock", ["We take reasonable security safeguards, such as access control, encrypted connections and limiting who can see the data. If a personal data breach happens we will inform the Data Protection Board of India and the people affected as the law requires."]),
          doc("rights", "Your rights", "UserCheck", ["Under the Digital Personal Data Protection Act, 2023 you have the right to:"], ["Get a summary of the personal data we hold about you and how we process it.", "Have inaccurate or incomplete data corrected, completed or updated.", "Have your data erased when it is no longer needed for its purpose.", "Have a grievance answered, and nominate another person to exercise these rights if you die or cannot do so yourself.", "Withdraw consent at any time."]),
          doc("children", "Children", "Baby", ["This website is not meant for anyone under 18. We do not knowingly collect a child's personal data without the verifiable consent of a parent or guardian, and we never track the behaviour of children or show them targeted advertising."]),
          doc("cookies", "Cookies", "Cookie", ["We use only the cookies and browser storage this website needs to work and stay secure. Any tool that is not strictly necessary, such as analytics or advertising, is loaded only after you agree."]),
          doc("grievance", "Grievance and contact", "Mail", [`To use a right, withdraw consent or complain, write to us ${reach}. We acknowledge every complaint within 24 hours and resolve it within 30 days. If you are not satisfied you can complain to the Data Protection Board of India after using this process.`]),
          doc("changes", "Changes", "RefreshCw", ["We may update this notice when the law or our practices change, and will show the updated notice on this page."]),
        ],
      }),
      section("detail-cta", { heading: "Questions about your data?", description: "Reach out any time.", ctaLabel: "Contact Us", external: false, checklist: [] }),
    ],
  };
  const terms: StarterPage = {
    path: "/terms",
    title: "Terms of Service",
    seo: { title: `Terms of Service | ${v.name}`, description: `The terms for using the ${v.name} website and its services.` },
    sections: [
      section("page-hero", { category: "legal", categoryLabel: "legal", title: "Terms of Service", subtitle: "The terms for using this website and our services.", description: `By using this website or our services you agree to these terms. They are governed by the laws of India.`, icon: "FileText", image: IMG.privacy, primaryCtaExternal: false }),
      section("legal-document", {
        sections: [
          doc("accept", "Accepting these terms", "FileText", [`These terms are an agreement between you and ${v.name}. This is an electronic record under the Information Technology Act, 2000 and needs no signature. If you do not agree, please do not use the website.`]),
          doc("use", "Using the website", "Settings", ["Use the website lawfully. You must not misuse it, try to break its security, copy it in bulk, send spam through it, or post content that is unlawful, defamatory, obscene, infringing or that impersonates anyone."]),
          doc("accounts", "Accounts", "UserCheck", ["Where the website has accounts, you must give accurate details, keep your password secret and tell us if you think your account has been used without your permission. You must be at least 18 to open an account."]),
          doc("orders", "Prices, payment and GST", "Wallet", ["Prices are in Indian rupees. Goods and Services Tax is charged where it applies and shown on the invoice. Where an order or service is paid online, the payment is processed by a payment provider regulated in India; we do not store your card details."]),
          doc("refunds", "Cancellations and refunds", "RefreshCw", [`The terms of any cancellation or refund for a particular product or service are given when you order it. If you were charged by mistake or twice, contact us ${reach} and we will correct it.`]),
          doc("ip", "Our content", "Copyright", ["The content of this website, including text, images, logos and design, belongs to us or our licensors and may not be copied or used without our written permission."]),
          doc("liability", "Limits of our responsibility", "ShieldCheck", ["The website and its information are provided as they are. To the extent the law permits, we are not liable for indirect or consequential loss arising from your use of the website. Nothing in these terms limits any right you have under the Consumer Protection Act, 2019 or any liability that cannot be limited by law."]),
          doc("law", "Governing law and disputes", "Scale", ["These terms are governed by the laws of India. The courts having territorial jurisdiction over our place of business have jurisdiction over any dispute, after you have first tried to settle it with us."]),
          doc("complaints", "Complaints", "Mail", [`To make a complaint, write to us ${reach}. We acknowledge a complaint within 48 hours and resolve it within one month.`]),
        ],
      }),
      section("detail-cta", { heading: "Questions about these terms?", description: "Reach out any time.", ctaLabel: "Contact Us", external: false, checklist: [] }),
    ],
  };

  // One detail page per service — so a listing card leads somewhere of its own.
  const details: StarterPage[] = pack.services.map((svc) => ({
    path: `/services/${serviceSlug(svc.title)}`,
    title: svc.title,
    seo: { title: `${svc.title} | ${v.name}`, description: t(svc.description) },
    sections: [
      section("page-hero", { category: "services", categoryLabel: "services", title: svc.title, subtitle: svc.subtitle, description: t(svc.description), icon: svc.icon, image: svc.image, primaryCtaLabel: pack.cta.label, primaryCtaHref: "/contact" }),
      section("feature-highlights", { title: c.detail?.included ?? "What's included", features: svc.highlights.slice(0, 6).map((h) => ({ name: h, desc: (c.detail?.highlightText ?? "{h} — taken care of by the {name} team.").replaceAll("{h}", h).replaceAll("{name}", v.name) })) }),
      homeSections.steps(),
      section("faq-accordion", { title: `${svc.title} — questions`, faqs: pack.faqs.slice(0, 2).map((f) => ({ question: t(f.question), answer: f.answer })) }),
      section("detail-cta", { heading: `Interested in ${svc.title}?`, description: c.detail?.ctaDescription ?? "Tell us what you need and we'll reply with next steps.", ctaLabel: pack.cta.label, external: false, checklist: pack.cta.checklist }),
    ],
  }));

  const login: StarterPage = {
    path: "/login",
    title: "Login",
    seo: { title: `Login | ${v.name}`, description: `Sign in to your ${v.name} account.` },
    sections: [
      section("login-page", {
        badge: c.login?.badge ?? "Customer portal",
        headingLead: "Welcome ",
        headingHighlight: "back",
        headingTail: ".",
        description: c.login?.description ?? `Sign in to your ${v.name} account.`,
        features: c.login?.features ?? [],
        rewardsLead: "",
        rewardsLinkLabel: "",
        formTitle: "Sign in to your account",
        formSubtitle: "Enter your credentials to access [[brand]]",
        emailLabel: "Email address",
        emailPlaceholder: "you@example.com",
        passwordLabel: "Password",
        passwordPlaceholder: "••••••••",
        rememberLabel: "Remember me",
        forgotLabel: "Forgot password?",
        submitLabel: "Sign In",
        submittingLabel: "Signing in...",
        registerLead: "Don't have an account? ",
        registerLinkLabel: "Create one now",
        registerTail: "",
        privacyNote: "Protected by industry-standard encryption.",
      }),
    ],
  };

  const register: StarterPage = {
    path: "/register",
    title: "Create Account",
    seo: { title: `Create Account | ${v.name}`, description: `Create an account to get started with ${v.name}.` },
    sections: [
      section("register-hero", {
        badge: c.register?.badge ?? "Create an Account",
        headingLead: c.register?.headingLead ?? "Create your account with",
        headingHighlight: v.name,
        description: c.register?.description ?? `Create your ${v.name} account.`,
      }),
      section("register-form", {
        heading: "Create your account",
        description: "Fill in your details below to get started.",
        submitLabel: "Create Account",
        submittingLabel: "Creating account...",
        loginLead: "Already have an account? ",
        loginLinkLabel: "Sign in here",
        referTitle: "Refer & Earn",
        referText: "Invite friends and earn reward credits when they join and complete milestones.",
        youEarn: "You earn",
        friendEarns: "Friend earns",
        stepShareTitle: "Share your link",
        stepShareText: "Send your unique referral code to friends and colleagues.",
        stepJoinTitle: "They join",
        stepJoinText: "They sign up with your code and get a welcome bonus.",
        stepEarnTitle: "You both earn",
        stepEarnText: "Get reward credits directly to your wallet.",
        creditsNote: "Credits can be redeemed for discounts and rewards.",
        earnMoreLabel: "",
        earnMoreHref: "",
        invitedText: "has invited you to join!",
        welcomeLead: "You'll receive a welcome bonus of",
        welcomeTail: "credits upon registration.",
        codeRejectedText: "This referral code is invalid or expired.",
        accountTypeLabel: "I am a",
        accountTypePlaceholder: "Select account type",
        typeStudent: "",
        typeIntern: "",
        typeClient: c.register?.clientLabel ?? "Customer",
        typeJobSeeker: "",
        nameLabel: "Full Name",
        namePlaceholder: "Your full name",
        emailLabel: "Email Address",
        emailPlaceholder: "john@example.com",
        phoneLabel: "Phone Number",
        phonePlaceholder: "+91 98XXX XXXXX",
        passwordLabel: "Password",
        passwordPlaceholder: "••••••••",
        confirmLabel: "Confirm Password",
        confirmPlaceholder: "••••••••",
        referralLabel: "Referral Code (Optional)",
        referralOptional: "Optional",
        referralPlaceholder: "Enter referral code",
        termsLead: "By signing up, you agree to our ",
        termsLinkLabel: "Terms of Service",
        termsHref: "/terms",
        termsJoin: " and ",
        privacyLinkLabel: "Privacy Policy",
        privacyHref: "/privacy-policy",
        termsTail: ".",
      }),
    ],
  };

  // Pages only this kind of business needs (a menu, treatments, a process…), planned by the AI.
  const extra: StarterPage[] = (pack.structure?.extraPages ?? []).map((pg) => ({
    path: `/${pg.slug}`,
    title: pg.title,
    seo: { title: `${pg.title} | ${v.name}`, description: t(pg.intro) },
    sections: [
      section("listing-hero", { eyebrow: pg.slug, title: t(pg.title), description: t(pg.intro), icon: "BadgeCheck", image: pack.servicesImage }),
      ...blocks(pg.blocks),
      // Every page ends by inviting the visitor to act, unless its own last block already does.
      ...(pg.blocks.some((b) => b.kind === "cta" && blockUsable(b)) ? [] : [section("detail-cta", { heading: pack.cta.heading, description: pack.cta.description, ctaLabel: pack.cta.label, external: false, checklist: [] })]),
    ],
  }));

  // One detailed page for each offering (planned sites): what it is, what to know, common questions.
  const offeringDetails: StarterPage[] = planMode
    ? (pack.structure?.offeringPages ?? []).flatMap((pg) => {
        const n = pack.services.findIndex((sv, i) => offeringSlug(sv.title, i) === pg.slug);
        if (n < 0) return [];
        const sv = pack.services[n];
        return [{
          path: `/${pack.structure?.offeringBase ?? "offerings"}/${pg.slug}`,
          title: pg.title,
          seo: { title: `${pg.title} | ${v.name}`, description: t(pg.intro || sv.description) },
          sections: [
            section("listing-hero", { eyebrow: pack.structure?.offeringBase ?? "offerings", title: t(pg.title), description: t(pg.intro || sv.description), icon: sv.icon || "BadgeCheck", image: pack.servicesImage }),
            ...blocks(pg.blocks),
            ...(pg.blocks.some((b) => b.kind === "cta" && blockUsable(b)) ? [] : [section("detail-cta", { heading: pack.cta.heading, description: pack.cta.description, ctaLabel: pack.cta.label, external: false, checklist: [] })]),
          ],
        }];
      })
    : [];

  // A planned site has exactly the pages planned for the business: no fixed Services / About / per-service pages, and sign-in and
  // sign-up only when its customers need accounts.
  if (planMode) return [home, ...extra, ...offeringDetails, contact, privacy, terms, ...(pack.structure?.accounts ? [login, register] : [])];
  return [home, services, about, contact, privacy, terms, login, register, ...extra, ...details];
}

type NavTop = { name: string; href: string; iconKey: string; featured: { title: string; description: string; image: string }; items: { name: string; href: string; description: string; iconKey: string }[] };

/** Every path a generated site really has, so a menu or footer link can never point at a page that does not exist. */
export function knownPaths(pack: StarterPack): Set<string> {
  if (pack.structure?.mode === "plan") return new Set(["/", "/contact", "/privacy-policy", "/terms", ...(pack.structure.accounts ? ["/login", "/register"] : []), ...pack.structure.extraPages.map((p) => `/${p.slug}`), ...(pack.structure.offeringPages ?? []).map((p) => `/${pack.structure!.offeringBase ?? "offerings"}/${p.slug}`)]);
  return new Set(["/", "/services", "/about", "/contact", "/privacy-policy", "/terms", ...(pack.structure?.extraPages ?? []).map((p) => `/${p.slug}`), ...pack.services.map((s) => `/services/${serviceSlug(s.title)}`)]);
}

export function starterNavigation(pack: StarterPack): NavTop[] {
  const services: NavTop = {
    name: "Services",
    href: "/services",
    iconKey: "Layers",
    featured: { title: "What We Do", description: pack.servicesIntro, image: pack.servicesImage },
    items: [
      ...pack.services.slice(0, 5).map((s) => ({ name: s.title, href: `/services/${serviceSlug(s.title)}`, description: s.subtitle, iconKey: s.icon })),
      { name: pack.cta.label, href: "/contact", description: "Get in touch", iconKey: "Mail" },
    ],
  };
  const about: NavTop = {
    name: "About",
    href: "/about",
    iconKey: "Compass",
    featured: { title: "About Us", description: pack.tagline, image: pack.about.image },
    items: [
      { name: "About Us", href: "/about", description: "Who we are", iconKey: "Users" },
      { name: "Contact", href: "/contact", description: "Get in touch", iconKey: "Mail" },
    ],
  };
  const st = pack.structure;
  if (!st) return [services, about];
  if (st.mode === "plan") {
    // Only the pages that exist, named the way this business's customers say them.
    const known = knownPaths(pack);
    const plain = (label: string, href: string): NavTop => ({ name: label, href, iconKey: "Sparkles", featured: { title: "", description: "", image: "" }, items: [] });
    const out: NavTop[] = [];
    for (const item of st.nav) if (known.has(item.target) && item.label.trim() && !out.some((o) => o.href === item.target) && item.target !== "/privacy-policy" && item.target !== "/terms") out.push(plain(item.label, item.target));
    if (!out.some((o) => o.href === "/contact")) out.push(plain("Contact", "/contact"));
    return out.slice(0, 7);
  }
  // The menu the AI planned for this business: only real pages, "Services" keeps its list of services under it.
  const known = knownPaths(pack);
  const out: NavTop[] = [];
  for (const item of st.nav) {
    if (!known.has(item.target) || out.some((o) => o.href === item.target) || !item.label.trim()) continue;
    if (item.target === "/services") out.push({ ...services, name: item.label });
    else if (item.target === "/about") out.push({ ...about, name: item.label });
    else out.push({ name: item.label, href: item.target, iconKey: "Sparkles", featured: { title: "", description: "", image: "" }, items: [] });
  }
  if (!out.some((o) => o.href === "/services")) out.splice(Math.min(1, out.length), 0, services);
  if (!out.some((o) => o.href === "/contact")) out.push({ name: "Contact", href: "/contact", iconKey: "Mail", featured: { title: "", description: "", image: "" }, items: [] });
  return out.slice(0, 7);
}

export function starterFooter(pack?: StarterPack): { title: string; viewAllHref?: string; viewAllLabel?: string; links: { label: string; href: string }[] }[] {
  const st = pack?.structure;
  if (!pack || !st) {
    return [
      { title: "Company", links: [{ label: "About", href: "/about" }, { label: "Services", href: "/services" }, { label: "Contact", href: "/contact" }] },
      { title: "Legal", links: [{ label: "Privacy Policy", href: "/privacy-policy" }, { label: "Terms of Service", href: "/terms" }] },
    ];
  }
  const known = knownPaths(pack);
  const cols = st.footerColumns
    .map((c) => ({ title: c.title, links: c.links.filter((l) => known.has(l.target) && l.label.trim()).map((l) => ({ label: l.label, href: l.target })) }))
    .filter((c) => c.title.trim() && c.links.length)
    .slice(0, 4);
  if (!cols.some((c) => c.links.some((l) => l.href === "/privacy-policy"))) cols.push({ title: "Legal", links: [{ label: "Privacy Policy", href: "/privacy-policy" }, { label: "Terms of Service", href: "/terms" }] });
  return cols;
}
