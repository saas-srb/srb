import Link from "next/link";
import { ArrowRight, CheckCircle2, Zap } from "lucide-react";
import Reveal from "@/components/platform/saas/Reveal";
import PanelShot from "@/components/platform/saas/PanelShot";
import MarketingShot from "@/components/platform/saas/MarketingShot";
import DeviceScene, { type SceneVariant } from "@/components/platform/saas/DeviceScene";
import { screenFor } from "@/lib/platform/saas/screens";
import { EXTRA_SCREENS } from "@/lib/platform/saas/site";
import { FEATURE_LISTS, PANEL_VALUE } from "@/lib/platform/saas/feature-lists";
import type { FeatureModule } from "@/lib/platform/saas/modules";
import { productPath } from "@/lib/platform/saas/product-routes";
import ProductLogo from "@/components/products/ProductLogo";

/** One product in full: its real screen, every feature it has (grouped like its own menu), what runs on its own and the result. */
export default function ModuleBlock({ m, flip = false, detailed = false, variant = 0 }: { m: FeatureModule; flip?: boolean; detailed?: boolean; variant?: SceneVariant }) {
  const groups = FEATURE_LISTS[m.key] ?? [{ title: "Capabilities", items: m.capabilities.map((c) => ({ name: c, text: "" })) }];
  const value = PANEL_VALUE[m.key];
  return (
    <article id={m.key} className="py-14 lg:py-20" style={{ scrollMarginTop: 150 }}>
      <Reveal className="mb-10 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-3xl">
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <span className="sr-icon"><ProductLogo productKey={m.key} size={36} title={m.name} /></span>
            <span className="sr-eyebrow">{m.name}</span>
            <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">Included in every plan</span>
          </div>
          <h3 className="mb-3 text-3xl font-bold leading-[1.15] tracking-tight sm:text-4xl">{m.headline}</h3>
          <p className="sr-lead">{m.summary}</p>
        </div>
        {!detailed && (
          <Link href={productPath(m.key)} className="group inline-flex shrink-0 items-center gap-3 text-sm font-bold hover:text-primary">
            {m.name} in detail
            <span className="flex h-10 w-10 items-center justify-center rounded-full border border-border/50 bg-muted/40 transition-all group-hover:border-primary group-hover:bg-primary"><ArrowRight className="h-4 w-4 group-hover:text-primary-foreground" /></span>
          </Link>
        )}
      </Reveal>
      {value && (
        <Reveal className="mb-10 overflow-hidden rounded-3xl border border-primary/20 bg-gradient-to-br from-primary/[0.07] via-transparent to-brand-accent/[0.08]">
          <div className="grid gap-px md:grid-cols-[minmax(0,0.9fr)_minmax(0,2.1fr)]">
            <div className="flex flex-col justify-center gap-1.5 p-6">
              <p className="text-xs font-bold uppercase tracking-widest text-primary">Replaces</p>
              <p className="text-lg font-black leading-snug">{value.replaces}</p>
              <p className="text-sm text-muted-foreground">One product instead of another subscription.</p>
            </div>
            <ul className="grid gap-x-8 gap-y-3 p-6 sm:grid-cols-2">
              {value.benefits.map((b) => (
                <li key={b} className="flex gap-2.5 text-sm leading-snug"><span className="sr-circle mt-0.5 h-5 w-5 flex-none"><CheckCircle2 className="h-3 w-3" /></span><span className="font-medium">{b}</span></li>
              ))}
            </ul>
          </div>
        </Reveal>
      )}
      <div className="grid items-start gap-10 lg:grid-cols-[1.15fr_1fr]">
        <Reveal className={`lg:sticky lg:top-40 ${flip ? "lg:order-2" : ""}`}>
          {screenFor(m.key) ? <MarketingShot screenKey={m.key} name={m.name} fallbackVariant={variant} /> : <PanelShot moduleKey={m.key} name={m.name} labels={m.capabilities} variant={variant} />}
          <p className="mt-6 border-l-2 border-primary pl-4 text-[15px] leading-relaxed"><span className="font-bold text-primary">Result · </span>{m.outcome}</p>
        </Reveal>
        <Reveal delay={100} className="space-y-5">
          {groups.map((g) => (
            <div key={g.title} className="sr-card">
              <p className="mb-4 text-xs font-bold uppercase tracking-widest text-primary">{g.title}</p>
              <ul className="grid gap-x-6 gap-y-3.5 sm:grid-cols-2">
                {g.items.map((it) => (
                  <li key={it.name} className="flex gap-2.5">
                    <CheckCircle2 className="mt-0.5 h-4.5 w-4.5 flex-none text-primary" aria-hidden />
                    <span><span className="block text-sm font-semibold leading-snug">{it.name}</span>{it.text && <span className="block text-[13px] leading-snug text-muted-foreground">{it.text}</span>}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          <div className="rounded-3xl border border-primary/20 bg-gradient-to-br from-primary/[0.06] to-brand-accent/[0.06] p-6">
            <p className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-primary"><Zap className="h-4 w-4" /> Runs automatically</p>
            <ul className="space-y-2">
              {m.automations.map((a) => <li key={a} className="flex gap-2.5 text-sm leading-snug"><span className="mt-1.5 h-1.5 w-1.5 flex-none rounded-full bg-primary" />{a}</li>)}
            </ul>
          </div>
        </Reveal>
      </div>
      {(EXTRA_SCREENS[m.key] ?? []).some((x) => screenFor(x.key)) && (
        <Reveal className="mt-14">
          <p className="mb-5 text-xs font-bold uppercase tracking-widest text-primary">More screens inside {m.name}</p>
          <div className="grid gap-8 lg:grid-cols-2">
            {(EXTRA_SCREENS[m.key] ?? []).filter((x) => screenFor(x.key)).slice(0, 2).map((x, i) => (
              <figure key={x.key} className="space-y-3">
                <DeviceScene screenKey={x.key} name={x.title} variant={(((variant as number) + 2 + i) % 6) as SceneVariant} />
                <figcaption className="text-center text-sm font-semibold">{x.title}</figcaption>
              </figure>
            ))}
          </div>
        </Reveal>
      )}
    </article>
  );
}
