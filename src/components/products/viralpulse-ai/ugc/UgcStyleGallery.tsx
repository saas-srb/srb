"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Check, Clock, Search, Sparkles, Users, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import OptionSelect from "@/components/products/playbook-ai/OptionSelect";
import { Chip } from "@/components/products/viralpulse-ai/ugc/UgcBits";
import StyleThumb from "@/components/products/viralpulse-ai/ugc/StyleThumb";
import UgcStyleSample from "@/components/products/viralpulse-ai/ugc/UgcStyleSample";
import { listStyleSamplesAction, pollStyleSamplesAction } from "@/app/(products)/viralpulse-ai/(protected)/ugc/actions";
import { SAMPLE_BADGE, sampleKeyFor, type SampleView } from "@/lib/products/viralpulse-ai/ugc/sample";
import { pickVariation } from "@/lib/products/viralpulse-ai/ugc/styles";
import { previewSeed } from "@/lib/products/viralpulse-ai/ugc/styles/preview";
import { mediaSrc } from "@/components/products/viralpulse-ai/SmmsBits";
import { listStyles, suggestStyles, HOOK_FORMULAS, normalizeLanguage, planBeats, STYLE_CATEGORIES, PLATFORMS, PLATFORM_LABEL } from "@/lib/products/viralpulse-ai/ugc/styles";
import type { UgcStyle } from "@/lib/products/viralpulse-ai/ugc/styles";
import { DURATION_BANDS, filterStyles, groupByCategory, titleCase, type StyleFilter } from "@/lib/products/viralpulse-ai/ugc/ui-helpers";
import { LANGUAGE_LABEL } from "@/lib/products/viralpulse-ai/ugc/styles/language";
import { ILLUSTRATIVE_NOTICE } from "@/lib/products/viralpulse-ai/ugc/policy";
import { cn } from "@/lib/utils";

const StoryboardPlayer = dynamic(() => import("@/components/products/viralpulse-ai/ugc/StoryboardPlayer"), {
  ssr: false,
  loading: () => <div className="mx-auto aspect-[9/16] w-full max-w-[15rem] animate-pulse rounded-[1.75rem] bg-muted" role="status" aria-label="Loading preview" />,
});

type Samples = SampleView[];
const sampleFor = (samples: Samples, style: UgcStyle, seedN: number) => {
  const key = sampleKeyFor(style.id, pickVariation(style, previewSeed(seedN)));
  return samples.find((x) => x.key === key) ?? null;
};
const latestReady = (samples: Samples, styleId: string) => samples.filter((x) => x.styleId === styleId && x.status === "ready" && x.mediaId).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))[0] ?? null;

/** Storyboard first (always free); the real sample clip is one toggle away, and where it can be made when asked. */
function StylePreviewPanel({ style, samples, refresh, showGenerate }: { style: UgcStyle; samples: Samples; refresh: () => void; showGenerate: boolean }) {
  const [seedN, setSeedN] = useState(1);
  const [tab, setTab] = useState<"story" | "real">("story");
  const sample = sampleFor(samples, style, seedN);
  const others = samples.filter((x) => x.styleId === style.id && x.status === "ready" && x !== sample);
  const hasReal = !!sample || showGenerate;
  return (
    <div className="space-y-3">
      {hasReal && (
        <div role="tablist" aria-label="Preview type" className="inline-flex rounded-lg bg-muted p-0.5 text-xs font-semibold">
          {(["story", "real"] as const).map((t) => (
            <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={cn("rounded-md px-3 py-1 outline-none focus-visible:ring-2 focus-visible:ring-primary/50", tab === t ? "bg-background shadow-sm" : "text-muted-foreground")}>
              {t === "story" ? "Storyboard" : sample?.status === "ready" ? "Real sample" : "Real sample clip"}
            </button>
          ))}
        </div>
      )}
      {tab === "story" || !hasReal ? (
        <StoryboardPlayer style={style} seedN={seedN} onSeedChange={setSeedN} />
      ) : (
        <div className="space-y-2">
          <UgcStyleSample style={style} seedN={seedN} sample={sample} onChanged={refresh} />
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" size="sm" variant="secondary" onClick={() => setSeedN((n) => n + 1)}>Another look</Button>
            <span className="text-[11px] text-muted-foreground">{`Look ${seedN}: a sample belongs to one look.`}</span>
          </div>
          {others.length > 0 && !sample && <p className="text-[11px] text-muted-foreground">{`${others.length} other look${others.length === 1 ? " has" : "s have"} a sample already.`} <button type="button" className="font-semibold underline" onClick={() => { const m = others[0].seed.match(/(\d+)$/); if (m) setSeedN(Number(m[1])); }}>Show it</button></p>}
        </div>
      )}
    </div>
  );
}

const ALL_STYLES = listStyles() as UgcStyle[];
const INDUSTRIES = [...new Set(ALL_STYLES.flatMap((s) => s.industries))].filter((i) => i !== "any").sort();

/** Mounts its children only once the box has scrolled near the viewport, so ~150 cards do not all compose and draw thumbnails at once. */
function LazyThumb({ style, active }: { style: UgcStyle; active: boolean }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || seen) return;
    if (typeof IntersectionObserver === "undefined") { const t = window.setTimeout(() => setSeen(true), 0); return () => window.clearTimeout(t); }
    const io = new IntersectionObserver((entries) => { if (entries.some((e) => e.isIntersecting)) { setSeen(true); io.disconnect(); } }, { rootMargin: "300px" });
    io.observe(el);
    return () => io.disconnect();
  }, [seen]);
  return <span ref={ref} className="block shrink-0">{seen ? <StyleThumb style={style} active={active} /> : <span className="block aspect-[9/16] w-[3.9rem] rounded-lg border border-border/50 bg-muted" aria-hidden />}</span>;
}

function StyleCard({ style, selected, reasons, sample, onOpen, onPick }: { style: UgcStyle; selected: boolean; reasons?: string[]; sample: SampleView | null; onOpen: () => void; onPick: () => void }) {
  const [active, setActive] = useState(false);
  return (
    <div onMouseEnter={() => setActive(true)} onMouseLeave={() => setActive(false)} onFocus={() => setActive(true)} onBlur={() => setActive(false)} className={cn("group flex flex-col gap-2 rounded-2xl border bg-card/70 p-3 transition-colors", selected ? "border-primary ring-1 ring-primary/40" : "border-border/50 hover:border-primary/40")}>
      <button type="button" onClick={onOpen} className="flex items-start gap-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded-xl" aria-label={`${style.label}: view details`}>
        {sample?.mediaId ? (
          <span className="relative aspect-[9/16] w-[3.9rem] shrink-0 overflow-hidden rounded-lg border border-border/50 bg-black">
            <video src={mediaSrc(sample.mediaId)} poster={sample.thumbnailId ? mediaSrc(sample.thumbnailId) : undefined} muted loop playsInline preload="none" className="size-full object-cover" ref={(el) => { if (el) { if (active) void el.play().catch(() => {}); else el.pause(); } }} aria-label={`${SAMPLE_BADGE} of ${style.label}`} />
            <span className="absolute inset-x-0 bottom-0 bg-black/65 px-0.5 text-center text-[7px] leading-tight font-bold text-white">{SAMPLE_BADGE}</span>
          </span>
        ) : <LazyThumb style={style} active={active} />}
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-1.5">
            <span className="text-sm font-semibold leading-tight">{style.label}</span>
            {style.illustrative && <Chip tone="warn" title={ILLUSTRATIVE_NOTICE}>Illustrative</Chip>}
          </span>
          <span className="mt-0.5 line-clamp-2 block text-xs text-muted-foreground">{style.description}</span>
        </span>
      </button>
      <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1"><Users className="size-3" />{style.actorCount === 1 ? "1 person" : `${style.actorCount} people`}</span>
        <span className="inline-flex items-center gap-1"><Clock className="size-3" />{`${style.durationRange[0]}-${style.durationRange[1]} s`}</span>
        <span>{style.aspects[0]}</span>
      </div>
      {reasons && reasons.length > 0 && <p className="text-[11px] text-primary">{`Why: ${reasons.slice(0, 3).join(" · ")}`}</p>}
      <div className="mt-auto flex gap-2">
        <Button type="button" size="sm" variant={selected ? "default" : "outline"} className="flex-1" onClick={onPick} aria-pressed={selected}>
          {selected ? <><Check className="size-3.5" /> Selected</> : "Use this style"}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onOpen} aria-label={`Details of ${style.label}`}><Info className="size-3.5" /></Button>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-1.5">
      <h4 className="text-xs font-bold tracking-wide text-muted-foreground uppercase">{title}</h4>
      {children}
    </section>
  );
}

function StyleDrawer({ style, samples, refresh, language, brandName, selected, onClose, onPick }: { style: UgcStyle | null; samples: Samples; refresh: () => void; language: string; brandName: string; selected: boolean; onClose: () => void; onPick: (s: UgcStyle) => void }) {
  const lang = normalizeLanguage(language);
  return (
    <Sheet open={!!style} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        {style && (
          <>
            <SheetHeader>
              <SheetTitle className="flex flex-wrap items-center gap-2">{style.label}{style.illustrative && <Chip tone="warn">Illustrative</Chip>}</SheetTitle>
              <SheetDescription>{style.description}</SheetDescription>
            </SheetHeader>
            <div className="space-y-5 px-4 pb-6">
              <div className="flex flex-wrap gap-1.5">
                <Chip>{titleCase(style.category)}</Chip>
                <Chip>{style.actorCount === 1 ? "1 person" : `${style.actorCount} people`}</Chip>
                <Chip>{`${style.durationRange[0]}-${style.durationRange[1]} s`}</Chip>
                {style.aspects.map((a) => <Chip key={a}>{a}</Chip>)}
              </div>
              {style.illustrative && (
                <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-900 dark:text-amber-200">
                  This style looks like a customer testimonial, but the people are AI characters. The video will carry the notice &ldquo;{ILLUSTRATIVE_NOTICE}&rdquo; and can&apos;t claim real results.
                </p>
              )}
              <Section title="Preview">
                <StylePreviewPanel key={style.id} style={style} samples={samples} refresh={refresh} showGenerate />
              </Section>
              <Section title="Example structure of scenes">
                <ol className="space-y-1.5">
                  {planBeats(style).map((b, i) => (
                    <li key={i} className="flex gap-2 rounded-lg bg-muted/40 p-2 text-xs">
                      <span className="mt-0.5 shrink-0"><Chip tone={b.role === "hook" ? "info" : b.role === "cta" ? "ok" : "neutral"}>{b.role}</Chip></span>
                      <span className="min-w-0 flex-1">{b.purpose.replaceAll("{product}", brandName || "your product")}</span>
                      <span className="shrink-0 tabular-nums text-muted-foreground">{b.durationSecs}s</span>
                    </li>
                  ))}
                </ol>
                <p className="text-[11px] text-muted-foreground">A starting shape. The script is written from your brief, and you can edit every scene.</p>
              </Section>
              <Section title="Hook formulas">
                <ul className="space-y-1.5">
                  {style.hookFormulas.map((id) => {
                    const h = HOOK_FORMULAS[id];
                    return (
                      <li key={id} className="text-xs"><span className="font-semibold">{h.label}.</span> {h.how} <span className="text-muted-foreground">Shape: &ldquo;{h.example}&rdquo;</span></li>
                    );
                  })}
                </ul>
              </Section>
              <Section title="Camera language">
                <p className="text-xs">{style.camera.primary}</p>
                {style.camera.alternates.length > 0 && <p className="text-xs text-muted-foreground">{`Also: ${style.camera.alternates.join("; ")}`}</p>}
              </Section>
              <Section title={`How people speak in ${LANGUAGE_LABEL[lang]}`}>
                <p className="text-xs">{lang === "en" ? style.speech.en : lang === "hi" ? style.speech.hi : lang === "hinglish" ? style.speech.hinglish : style.speech.regional}</p>
              </Section>
              <Section title="Realism notes">
                <ul className="list-disc space-y-0.5 pl-4 text-xs">{style.realismCues.slice(0, 8).map((c) => <li key={c}>{c}</li>)}</ul>
                <p className="pt-1 text-[11px] font-semibold text-muted-foreground">Never shown</p>
                <ul className="list-disc space-y-0.5 pl-4 text-xs text-muted-foreground">{style.negativeCues.slice(0, 6).map((c) => <li key={c}>{c}</li>)}</ul>
              </Section>
              <Section title="Best for">
                <p className="text-xs text-muted-foreground">{`Goals: ${style.goals.join(", ")}. Platforms: ${style.platforms.join(", ")}.`}</p>
              </Section>
              <Button type="button" className="w-full" onClick={() => { onPick(style); onClose(); }}>{selected ? "Keep this style" : "Use this style"}</Button>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

export default function UgcStyleGallery({ value, onPick, industry, goal, platform, language, brandName, error }: { value: string; onPick: (s: UgcStyle) => void; industry: string; goal: string; platform: string; language: string; brandName: string; error?: string }) {
  const [f, setF] = useState<StyleFilter>({ q: "", category: "", industry: "", actors: "", duration: "", platform: "" });
  const [open, setOpen] = useState<UgcStyle | null>(null);
  const [samples, setSamples] = useState<Samples>([]);
  const refresh = useCallback(() => { void listStyleSamplesAction().then((r) => { if (r.ok) setSamples(r.samples); }); }, []);
  useEffect(() => { refresh(); }, [refresh]);
  const generating = samples.some((x) => x.status === "generating");
  useEffect(() => {
    if (!generating) return;
    const t = window.setInterval(() => { void pollStyleSamplesAction().then((r) => { if (r.ok) setSamples(r.samples); }); }, 8000);
    return () => window.clearInterval(t);
  }, [generating]);
  const set = (patch: Partial<StyleFilter>) => setF((x) => ({ ...x, ...patch }));
  const filtered = useMemo(() => filterStyles(ALL_STYLES, f), [f]);
  const suggestions = useMemo(() => suggestStyles({ industry, goal, platform, language, limit: 6 }), [industry, goal, platform, language]);
  const byId = useMemo(() => new Map(ALL_STYLES.map((s) => [s.id, s])), []);
  const filtering = !!(f.q || f.category || f.industry || f.actors || f.duration || f.platform);
  const groups = useMemo(() => groupByCategory(filtered), [filtered]);
  const hasSignal = !!(industry.trim() || suggestions[0]?.score);

  return (
    <div className="space-y-5">
      {error && <p role="alert" className="text-xs font-medium text-rose-600 dark:text-rose-400">{error}</p>}
      {hasSignal && !filtering && (
        <section aria-label="Suggested for you" className="space-y-2">
          <h3 className="flex items-center gap-1.5 text-sm font-bold"><Sparkles className="size-4 text-primary" /> Suggested for you</h3>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {suggestions.map((sg) => {
              const s = byId.get(sg.styleId);
              return s ? <StyleCard key={s.id} style={s} sample={latestReady(samples, s.id)} selected={value === s.id} reasons={sg.reasons} onOpen={() => setOpen(s)} onPick={() => onPick(s)} /> : null;
            })}
          </div>
        </section>
      )}

      <div className="grid gap-2 rounded-2xl border border-border/40 bg-background/50 p-3 sm:grid-cols-2 lg:grid-cols-5">
        <div className="relative lg:col-span-2">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={f.q} onChange={(e) => set({ q: e.target.value })} placeholder="Search styles" aria-label="Search styles" className="pl-8" />
        </div>
        <OptionSelect value={f.category} onChange={(v) => set({ category: v })} noneLabel="All categories" options={STYLE_CATEGORIES.map((c) => ({ value: c, label: titleCase(c) }))} aria-label="Category" />
        <OptionSelect value={f.industry} onChange={(v) => set({ industry: v })} noneLabel="Any industry" options={INDUSTRIES.map((c) => ({ value: c, label: titleCase(c) }))} aria-label="Industry" />
        <div className="grid grid-cols-2 gap-2">
          <OptionSelect value={f.actors} onChange={(v) => set({ actors: v })} noneLabel="Any cast" options={[{ value: "1", label: "1 person" }, { value: "2", label: "2 people" }, { value: "3", label: "3 people" }]} aria-label="Number of people" />
          <OptionSelect value={f.duration} onChange={(v) => set({ duration: v })} noneLabel="Any length" options={DURATION_BANDS.map((b) => ({ value: b.value, label: b.label }))} aria-label="Length" />
        </div>
      </div>
      <div role="group" aria-label="Platform" className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs font-semibold text-muted-foreground">Platform</span>
        {[{ value: "", label: "All" }, ...PLATFORMS.map((p) => ({ value: p, label: PLATFORM_LABEL[p] }))].map((p) => (
          <button key={p.value || "all"} type="button" aria-pressed={f.platform === p.value} onClick={() => set({ platform: p.value })} className={cn("rounded-full border px-3 py-1 text-xs font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary/40", f.platform === p.value ? "border-primary bg-primary text-primary-foreground" : "border-border/60 bg-background hover:bg-muted")}>{p.label}</button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground" aria-live="polite">{`${filtered.length} of ${ALL_STYLES.length} styles`}</p>

      {groups.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-10 text-center">
          <p className="text-sm font-semibold">No style matches those filters</p>
          <Button type="button" variant="outline" size="sm" onClick={() => setF({ q: "", category: "", industry: "", actors: "", duration: "", platform: "" })}>Clear filters</Button>
        </div>
      ) : (
        groups.map((g) => (
          <section key={g.category} aria-label={titleCase(g.category)} className="space-y-2 [contain-intrinsic-size:auto_480px] [content-visibility:auto]">
            <h3 className="text-sm font-bold">{titleCase(g.category)} <span className="font-normal text-muted-foreground">{`· ${g.styles.length}`}</span></h3>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {g.styles.map((s) => <StyleCard key={s.id} style={s} sample={latestReady(samples, s.id)} selected={value === s.id} onOpen={() => setOpen(s)} onPick={() => onPick(s)} />)}
            </div>
          </section>
        ))
      )}
      <StyleDrawer style={open} samples={samples} refresh={refresh} language={language} brandName={brandName} selected={!!open && open.id === value} onClose={() => setOpen(null)} onPick={onPick} />
    </div>
  );
}
