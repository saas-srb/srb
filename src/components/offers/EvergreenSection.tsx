"use client";

import Link from "next/link";
import { ArrowRight, Code2, Bot, GraduationCap, Users, Briefcase, Headset, PlayCircle, Gift, Wallet, MessageCircle, Phone } from "lucide-react";
import { getServiceHref } from "@/lib/offers/constants";
import { useSiteInfo } from "@/components/products/sitecraft-ai/SiteInfoContext";
import type { CategorySlug } from "@/lib/categories";
import { useText } from "@/components/products/sitecraft-ai/TextContext";

const POPULAR = (tx: (key: string) => string): { slug: CategorySlug; icon: typeof Code2; title: string; blurb: string }[] => ([
  { slug: "software-development", icon: Code2, title: tx("offers.evergreenSection.web-mobile-apps"), blurb: tx("offers.evergreenSection.custom-web-mobile-and-saas-products-buil") },
  { slug: "ai-automations", icon: Bot, title: tx("offers.evergreenSection.ai-automation"), blurb: tx("offers.evergreenSection.ai-agents-chatbots-and-workflow-automati") },
  { slug: "industrial-training", icon: GraduationCap, title: tx("offers.evergreenSection.industry-training"), blurb: tx("offers.evergreenSection.mentor-led-programs-with-live-projects-a") },
  { slug: "resource-augmentation", icon: Users, title: tx("offers.evergreenSection.hire-developers"), blurb: tx("offers.evergreenSection.pre-vetted-developers-individual-dedicat") },
  { slug: "internship-program", icon: Briefcase, title: tx("offers.evergreenSection.internships"), blurb: tx("offers.evergreenSection.real-project-experience-mentorship-and-a") },
]);

// Always-available, real site features — no discount amounts are claimed here.
const PERKS = (tx: (key: string) => string) => ([
  { icon: Headset, title: tx("offers.evergreenSection.free-consultation"), blurb: tx("offers.evergreenSection.talk-through-your-idea-with-an-engineer-") },
  { icon: PlayCircle, title: tx("offers.evergreenSection.live-demos"), blurb: tx("offers.evergreenSection.see-working-products-and-ai-demos-on-our") },
  { icon: Gift, title: tx("offers.evergreenSection.refer-earn"), blurb: tx("offers.evergreenSection.share-your-link-you-and-your-friend-both"), href: "/rewards" },
  { icon: Wallet, title: tx("offers.evergreenSection.welcome-credits"), blurb: tx("offers.evergreenSection.create-a-free-portal-account-to-start-a-"), href: "/register" },
]);

/** "While you wait" content shared by the no-campaign and upcoming states: popular services, always-on perks, direct lead CTAs. */
export default function EvergreenSection({ heading = "Popular right now" }: { heading?: string }) {
  const tx = useText();
  const { contact } = useSiteInfo();
  return (
    <>
      <section className="bg-background py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <h2 className="text-2xl font-black tracking-tight text-foreground sm:text-3xl">{heading}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{tx("offers.evergreenSection.explore-what-we-do-while-the-next-offers")}</p>
          <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {POPULAR(tx).map((p) => (
              <Link key={p.slug} href={getServiceHref(p.slug, "all")} className="group flex flex-col rounded-3xl border border-border/50 bg-background/95 p-6 transition-transform hover:-translate-y-1">
                <span className="flex size-11 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-secondary"><p.icon className="size-5 text-white" /></span>
                <h3 className="mt-4 text-lg font-bold text-foreground">{p.title}</h3>
                <p className="mt-1 flex-1 text-sm text-muted-foreground">{p.blurb}</p>
                <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-primary">{tx("offers.evergreenSection.explore")}<ArrowRight className="size-4 transition-transform group-hover:translate-x-1" /></span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="border-y border-border/50 bg-muted/10 py-16">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <h2 className="text-2xl font-black tracking-tight text-foreground sm:text-3xl">{tx("offers.evergreenSection.always-on-no-campaign-needed")}</h2>
          <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {PERKS(tx).map((p) => {
              const body = (
                <>
                  <p.icon className="size-6 text-primary" />
                  <h3 className="mt-3 font-bold text-foreground">{p.title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{p.blurb}</p>
                </>
              );
              return p.href ? (
                <Link key={p.title} href={p.href} className="rounded-3xl border border-border/50 bg-background p-5 transition-colors hover:border-primary">{body}</Link>
              ) : (
                <div key={p.title} className="rounded-3xl border border-border/50 bg-background p-5">{body}</div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="bg-background py-16">
        <div className="mx-auto max-w-4xl px-6 text-center lg:px-8">
          <h2 className="text-2xl font-black tracking-tight text-foreground sm:text-3xl">{tx("offers.evergreenSection.need-something-specific-ask-for-a-custom")}</h2>
          <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground">{tx("offers.evergreenSection.tell-us-what-you-re-building-or-learning")}</p>
          <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link href="/contact" className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition-transform hover:scale-105">{tx("offers.evergreenSection.request-a-custom-quote")}<ArrowRight className="size-4" /></Link>
            <a href={contact.whatsappHref} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-full border border-border/60 px-6 py-3 text-sm font-semibold text-foreground hover:border-primary hover:text-primary"><MessageCircle className="size-4" />{tx("offers.evergreenSection.whatsapp-us")}</a>
            <a href={contact.phoneHref} className="inline-flex items-center gap-2 rounded-full border border-border/60 px-6 py-3 text-sm font-semibold text-foreground hover:border-primary hover:text-primary"><Phone className="size-4" /> {contact.phoneDisplay}</a>
          </div>
        </div>
      </section>
    </>
  );
}
