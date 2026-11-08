import type { StarterPack, StarterService } from "@/lib/platform/website/starter-packs";
import type { WebsiteBrief } from "@/lib/platform/website/ai/generate";

/**
 * The plain site a company gets until its AI-written one is ready (or if AI is unavailable): built ONLY from the business name and the
 * categories it chose, with no claims, no invented detail and no wording about any other kind of business. Honest and modest on
 * purpose; the AI website replaces it.
 */

const PRESETS = ["corporate-blue", "ocean-breeze", "forest-clay", "editorial", "graphite-pro", "emerald-finance"];
const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 0);
const cut = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);
const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
const list = (items: string[]) => (items.length <= 1 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`);

export function categoryFallbackPack(b: WebsiteBrief): StarterPack {
  const offers = (b.subCategories.length ? b.subCategories.map((s) => s.name) : b.categories).map((n) => n.replace(/\s*\([^)]*\)/g, "").trim()).filter(Boolean);
  const main = offers.slice(0, 3);
  const first = offers[0] ?? b.name;
  const services: StarterService[] = offers.slice(0, 8).map((n, i) => ({
    title: cut(n, 70),
    subtitle: b.subCategories[i]?.category ?? b.categories[0] ?? "",
    description: `${n}. Get in touch with ${b.name} to ask about it.`,
    icon: "BadgeCheck",
    image: "",
    highlights: [b.subCategories[i]?.category ?? b.categories[0] ?? n].filter(Boolean),
  }));
  while (services.length < 3) services.push({ title: b.name, subtitle: "", description: `Get in touch with ${b.name} to ask about what is available.`, icon: "BadgeCheck", image: "", highlights: [] });
  return {
    id: `category-${b.slug}`,
    themePreset: PRESETS[hash(b.slug) % PRESETS.length],
    hero: {
      badge: cut(b.categories[0] ?? "Welcome", 60),
      line1: `Welcome to ${b.name}`,
      highlight: cut(first, 60),
      description: `${b.name} offers ${list(main.map(lower))}. Get in touch to ask about what you need.`,
      primaryCta: "Contact us",
      secondaryCta: "What we offer",
      chips: [main[0] ?? b.name, main[1] ?? b.categories[0] ?? b.name, main[2] ?? b.categories[1] ?? b.categories[0] ?? b.name].map((c) => cut(c, 40)) as [string, string, string],
      status: ["What we offer", cut(list(main), 50)],
      perf: ["Ask us", "Tell us what you need"],
      image: "",
    },
    tagline: `${b.name}: ${list(b.categories.map(lower)) || "get in touch"}.`,
    footerCta: { badge: "Get in touch", title: "Have a question?", text: "Tell us what you need and we'll get back to you.", label: "Contact us" },
    servicesIntro: `What ${b.name} offers.`,
    servicesImage: "",
    services,
    why: {
      eyebrow: `About ${b.name}`, icon: "BadgeCheck", heading: "Getting started is simple", description: "Three easy ways to find out more.",
      reasons: [
        { name: "Ask us anything", desc: "Send a message with your question and we'll reply.", icon: "Mail" },
        { name: "Tell us what you need", desc: "Share the details and we'll point you to the right next step.", icon: "ClipboardCheck" },
        { name: "Reach us directly", desc: "Use the contact details on this site to talk to us.", icon: "Phone" },
      ],
    },
    steps: {
      eyebrow: "How it works", icon: "Route", heading: "From first message to", accent: "getting started.", description: "A simple way to begin.",
      items: [
        { title: "Get in touch", description: "Send us a message or call.", icon: "Mail" },
        { title: "Tell us what you need", description: "Share the details of your request.", icon: "ClipboardList" },
        { title: "We reply", description: "We confirm what is available and the next step.", icon: "CheckCircle2" },
      ],
      linkLabel: "Contact us",
    },
    faqs: [
      { question: `How do I contact ${b.name}?`, answer: "Use the contact page on this site to send a message, or use the phone and email shown there." },
      { question: `What does ${b.name} offer?`, answer: `${b.name} offers ${list(main.map(lower))}. See the services page for the full list.` },
      { question: "How do I find out more about a service?", answer: "Open the service page or send us a message and we'll tell you what you need to know." },
    ],
    cta: { heading: "Ready when you are", description: "Tell us what you need and we'll reply.", label: "Contact us", checklist: [] },
    about: {
      intro: `${b.name} offers ${list(main.map(lower))}.`, image: "", approachHeading: "How to reach us", approachDescription: "Get in touch and we'll help with what you need.",
      principles: [
        { title: "Ask", description: "Send your question.", icon: "Mail" },
        { title: "Confirm", description: "We confirm the details with you.", icon: "CheckCircle2" },
      ],
    },
    home: ["services", "why", "steps", "faq", "cta"],
  };
}
