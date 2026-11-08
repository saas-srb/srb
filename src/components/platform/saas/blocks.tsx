import Link from "next/link";
import { ArrowRight, CheckCircle2, Play, Sparkles, Zap } from "lucide-react";
import PanelShot from "@/components/platform/saas/PanelShot";
import MarketingShot from "@/components/platform/saas/MarketingShot";
import { heroFor, marketingFor } from "@/lib/platform/saas/screens";
import Icon from "@/components/platform/saas/Icon";
import Reveal from "@/components/platform/saas/Reveal";
import type { Feature, IconKey } from "@/lib/platform/saas/content";

/** The default theme's soft colour blobs behind a section. */
export function Blobs({ strong = false }: { strong?: boolean }) {
  return (
    <div className="sr-blobs" aria-hidden>
      <span className={`-left-[10%] -top-[10%] h-[45vw] w-[45vw] blur-[120px] ${strong ? "bg-primary/15" : "bg-primary/10"}`} />
      <span className={`right-[5%] top-[20%] h-[35vw] w-[35vw] blur-[110px] ${strong ? "bg-brand-accent/15" : "bg-brand-accent/10"}`} style={{ animationDelay: "-4s" }} />
    </div>
  );
}

/** Section heading in the default theme's style: optional icon tile, primary eyebrow, bold title with a gradient accent. */
export function SectionHead({ eyebrow, title, accent, lead, center = true, icon, tone, n }: { n?: string; eyebrow?: string; title: React.ReactNode; accent?: string; lead?: React.ReactNode; center?: boolean; icon?: IconKey | React.ReactNode; tone?: "dark" }) {
  const dark = tone === "dark";
  return (
    <Reveal className={`${center ? "mx-auto text-center" : ""} mb-12 max-w-2xl sm:mb-14`}>
      {n && <span className={`mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-primary to-brand-accent text-lg font-black text-white shadow-lg shadow-primary/30 ${center ? "mx-auto" : ""}`}>{n}</span>}
      {icon && !n && (
        <div className={`mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border shadow-sm ${center ? "mx-auto" : ""} ${dark ? "border-white/25 bg-white/10 text-white backdrop-blur" : "border-border/50 bg-muted/40"}`}>
          {typeof icon === "string" ? <Icon name={icon as IconKey} className={`h-6 w-6 ${dark ? "text-white" : "text-primary"}`} /> : icon}
        </div>
      )}
      {eyebrow && <p className={`sr-eyebrow mb-3 ${dark ? "sr-dh-soft" : ""}`}>{eyebrow}</p>}
      <h2 className={`sr-h2 mb-4 ${dark ? "sr-dh" : ""}`}>
        {title}
        {accent && <> <span className={`bg-gradient-to-r bg-clip-text text-transparent ${dark ? "from-white to-white/60" : "from-primary to-brand-accent"}`}>{accent}</span></>}
      </h2>
      {lead && <p className={`sr-lead ${dark ? "sr-dh-soft" : ""}`}>{lead}</p>}
    </Reveal>
  );
}

/**
 * The one hero every page uses: a full-bleed photo faded into the page, soft blobs and grid, the message on the left and a real
 * product screen on the right. `size="home"` is the taller homepage version.
 */
export function PageHero({
  eyebrow, title, accent, lead, children, photo = "team-desk", shot = "workspace", shotName = "Workspace", chip, notes, size = "page", hero = 1, art, artContent,
}: {
  eyebrow: string;
  title: React.ReactNode;
  accent?: string;
  lead: React.ReactNode;
  children?: React.ReactNode;
  photo?: string;
  shot?: string;
  shotName?: string;
  chip?: { title: string; text: string };
  notes?: string[];
  size?: "home" | "page" | "compact";
  hero?: 0 | 1 | 2 | 3 | 4 | 5;
  /** The page's own generated hero artwork (see scripts/hero-art.mjs). When present it replaces the photo and the framed screen. */
  art?: string;
  /** A live visual to use in place of generated artwork or a product screen. */
  artContent?: React.ReactNode;
}) {
  const home = size === "home";
  const compact = size === "compact";
  const artSrc = art ? heroFor(art) : null;
  const hasArtwork = Boolean(artSrc || artContent);
  const bgSrc = art ? heroFor(`bg-${art}`) : null;
  const bgDark = art ? heroFor(`bg-${art}-dark`) : null;
  return (
    <section className={`relative flex items-center overflow-hidden border-b border-border/50 ${home ? "py-20 lg:min-h-[780px] lg:py-24" : compact ? "py-8 lg:py-10" : "py-16 lg:min-h-[560px] lg:py-20"}`}>
      {bgSrc && (
        <div className="pointer-events-none absolute inset-0 hidden lg:block" aria-hidden>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={bgSrc} alt="" width={1920} height={820} fetchPriority="high" decoding="async" className="h-full w-full object-cover object-right [[data-theme=dark]_&]:hidden" />
          {bgDark && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={bgDark} alt="" width={1920} height={820} decoding="async" className="hidden h-full w-full object-cover object-right [[data-theme=dark]_&]:block" />
          )}
        </div>
      )}
      {!artSrc && !artContent && <div className="pointer-events-none absolute inset-0" aria-hidden>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`/selfrun/photos/${photo}.jpg`} alt="" className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 bg-background/[0.93] lg:hidden" />
        <div className="absolute inset-0 hidden bg-background lg:block" style={{ maskImage: "linear-gradient(to right, black 0%, black 42%, rgba(0,0,0,.78) 100%)", WebkitMaskImage: "linear-gradient(to right, black 0%, black 42%, rgba(0,0,0,.78) 100%)" }} />
        <div className="absolute inset-0 hidden bg-background lg:block" style={{ maskImage: "linear-gradient(to top, black 0%, transparent 35%)", WebkitMaskImage: "linear-gradient(to top, black 0%, transparent 35%)" }} />
      </div>}
      {!bgSrc && !artContent && <Blobs strong />}
      {bgSrc && <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,color-mix(in_oklch,var(--primary)_7%,var(--background)),var(--background)_70%)] [[data-theme=dark]_&]:bg-[linear-gradient(180deg,color-mix(in_oklch,var(--primary)_16%,var(--background)),var(--background)_75%)] lg:hidden" aria-hidden />}
      {/* a light tint over the background keeps the heading and text clearly readable */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-slate-900/[0.10] via-slate-900/[0.05] to-slate-900/[0.02] [[data-theme=dark]_&]:from-black/30 [[data-theme=dark]_&]:via-black/10 [[data-theme=dark]_&]:to-transparent" aria-hidden />
      <div className="sr-grid-bg" aria-hidden />
      <div className={`sr-container relative grid items-center gap-10 ${hasArtwork ? "lg:grid-cols-[1fr_1.22fr]" : "gap-14 lg:grid-cols-[1fr_1.08fr]"}`}>
        <div className="max-w-2xl">
          <Reveal>
            <span className="mb-7 inline-flex items-center gap-2 rounded-full border border-border/50 bg-background/70 px-4 py-2 text-sm font-medium text-foreground shadow-sm backdrop-blur-md">
              <Sparkles className="h-4 w-4 animate-pulse text-primary" /> {eyebrow}
            </span>
          </Reveal>
          <Reveal delay={80}>
            <h1 className={`mb-6 font-black leading-[1.08] tracking-tighter text-foreground ${home ? "text-5xl sm:text-7xl" : compact ? "text-3xl sm:text-4xl" : "text-4xl sm:text-6xl"}`}>
              {title}
              {accent && <><br /><span className="sr-grad">{accent}</span></>}
            </h1>
          </Reveal>
          <Reveal delay={160}><div className={`max-w-xl leading-relaxed text-foreground/75 ${home ? "text-lg sm:text-xl" : "text-lg"}`}>{lead}</div></Reveal>
          {children && <Reveal delay={240} className="flex flex-row flex-wrap items-center gap-3 pt-9 sm:gap-4">{children}</Reveal>}
          {notes && (
            <Reveal delay={300} className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
              {notes.map((t) => <span key={t} className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-primary" />{t}</span>)}
            </Reveal>
          )}
        </div>
        <Reveal delay={200} className="relative">
          {artSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={artSrc} alt={`${shotName} — the real product, on its own artwork`} width={2240} height={1568} fetchPriority="high" decoding="async" className="sr-hero-art h-auto w-full lg:-mr-8 lg:w-[calc(100%+2rem)] lg:max-w-none" />
          ) : artContent ? artContent : marketingFor(shot) ? <MarketingShot screenKey={shot} name={shotName} priority /> : <PanelShot moduleKey={shot} name={shotName} priority variant={hero} />}
          {chip && !hasArtwork && (
            <div className="sr-float absolute -left-5 bottom-10 hidden items-center gap-3 rounded-2xl border border-border/50 bg-background/90 p-4 shadow-xl backdrop-blur-xl sm:flex">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-primary to-brand-accent"><Zap className="h-5 w-5 text-white" /></span>
              <span><span className="block text-sm font-bold">{chip.title}</span><span className="block text-xs text-muted-foreground">{chip.text}</span></span>
            </div>
          )}
        </Reveal>
      </div>
    </section>
  );
}

/** Primary and secondary hero buttons, as the default theme draws them. */
export function HeroCtas({ primary = { label: "Get started free", href: "/signup" }, secondary = { label: "Request a demo", href: "/demo" } }: { primary?: { label: string; href: string }; secondary?: { label: string; href: string } | null }) {
  return (
    <>
      <Link href={primary.href} className="group inline-flex flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-full bg-foreground px-4 py-4 text-sm font-bold text-background shadow-xl shadow-foreground/20 transition-all hover:scale-105 active:scale-95 sm:flex-none sm:px-8">
        {primary.label} <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
      </Link>
      {secondary && (
        <Link href={secondary.href} className="group inline-flex flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-full border border-border/50 bg-background/60 px-4 py-4 text-sm font-bold text-foreground shadow-sm backdrop-blur-sm transition-all hover:bg-muted/60 sm:flex-none sm:px-8">
          <Play className="h-4 w-4 text-primary transition-transform group-hover:scale-110" fill="currentColor" /> {secondary.label}
        </Link>
      )}
    </>
  );
}

/** The default theme's glass feature cards: gradient icon tile, faint index number, hover lift. */
export function FeatureGrid({ items, cols = 3 }: { items: Feature[]; cols?: 2 | 3 | 4 }) {
  const grid = cols === 4 ? "lg:grid-cols-4" : cols === 3 ? "lg:grid-cols-3" : "";
  return (
    <div className={`grid grid-cols-1 gap-5 sm:grid-cols-2 ${grid}`}>
      {items.map((f, i) => (
        <Reveal key={f.title} delay={(i % 4) * 80} className="group relative">
          <div className="pointer-events-none absolute -inset-1 rounded-[1.75rem] bg-gradient-to-br from-primary/25 via-primary/0 to-brand-accent/25 opacity-0 blur-lg transition-opacity duration-500 group-hover:opacity-100" />
          <div className="sr-card relative h-full overflow-hidden group-hover:-translate-y-1 group-hover:border-primary/40 group-hover:shadow-xl group-hover:shadow-primary/10">
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-brand-accent/10 opacity-70" />
            <span className="pointer-events-none absolute -right-1 -top-3 select-none text-5xl font-black text-muted-foreground/[0.07] transition-colors duration-500 group-hover:text-primary/10">0{i + 1}</span>
            <div className="relative">
              <span className="sr-icon mb-5"><Icon name={f.icon as IconKey} className="h-5 w-5" /></span>
              <h3 className="mb-2 font-bold leading-snug text-foreground">{f.title}</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">{f.body}</p>
            </div>
          </div>
        </Reveal>
      ))}
    </div>
  );
}

export function Checklist({ items }: { items: string[] }) {
  return (
    <ul className="space-y-2.5">
      {items.map((i) => (
        <li key={i} className="flex gap-2.5 text-[15px] leading-relaxed">
          <CheckCircle2 className="sr-check mt-0.5 h-4.5 w-4.5" aria-hidden />
          <span>{i}</span>
        </li>
      ))}
    </ul>
  );
}

export function EmptyState({ title, body, children }: { title: string; body: string; children?: React.ReactNode }) {
  return (
    <div className="relative overflow-hidden rounded-[2rem] border border-dashed border-border bg-muted/20 px-6 py-16 text-center">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent" />
      <div className="relative space-y-3">
        <span className="sr-icon mx-auto"><Sparkles className="h-5 w-5" /></span>
        <h3 className="text-xl font-bold">{title}</h3>
        <p className="mx-auto max-w-md text-[15px] leading-relaxed text-muted-foreground">{body}</p>
        {children && <div className="flex flex-wrap justify-center gap-3 pt-3">{children}</div>}
      </div>
    </div>
  );
}

/** Closing call to action over a faded photo, in the style of the default theme's final CTA section. */
export function CtaBand({ title = "Your business, running itself — starting today.", lead = "Every feature, your own brand. Start free in minutes, or let us show you the platform with your own business scenarios.", photo = "success" }: { title?: string; lead?: string; photo?: string }) {
  return (
    <section className="relative overflow-hidden border-t border-border/50 py-24 sm:py-32">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`/selfrun/photos/${photo}.jpg`} alt="" className="absolute inset-0 h-full w-full object-cover" aria-hidden />
      <div className="absolute inset-0 bg-gradient-to-br from-[color-mix(in_oklch,var(--primary)_92%,black)] via-[color-mix(in_oklch,var(--primary)_80%,black)]/95 to-[color-mix(in_oklch,var(--brand-gradient)_70%,black)]/90" />
      <div className="sr-container relative text-center">
        <Reveal className="mx-auto max-w-3xl space-y-6">
          <h2 className="text-4xl font-black leading-[1.1] tracking-tight text-white sm:text-6xl">{title}</h2>
          <p className="mx-auto max-w-2xl text-lg leading-8 text-white/80 sm:text-xl">{lead}</p>
          <div className="flex flex-col items-center justify-center gap-4 pt-4 sm:flex-row">
            <Link href="/signup" className="group inline-flex items-center gap-2 rounded-full bg-white px-8 py-4 text-sm font-bold text-black shadow-xl transition-all hover:scale-105">Get started free <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" /></Link>
            <Link href="/demo" className="inline-flex items-center gap-2 rounded-full border border-white/30 px-8 py-4 text-sm font-bold text-white transition-all hover:bg-white/10">Request a demo</Link>
          </div>
          <div className="flex flex-wrap justify-center gap-6 pt-2 text-sm text-white/80">
            {["Full access, free forever", "AI built in", "No card needed"].map((t) => (
              <span key={t} className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-white" />{t}</span>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}
