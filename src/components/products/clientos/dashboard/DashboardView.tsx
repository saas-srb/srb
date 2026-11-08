"use client";

import PanelTabs from "@/components/platform/panel/PanelTabs";
import PanelDashboardHeader from "@/components/platform/panel/PanelDashboardHeader";
import Link from "next/link";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import {
  AlertTriangle, ArrowUpRight, Award, BarChart3, Bell, BookOpen, Briefcase, Calendar, CalendarClock, CheckCircle2, ClipboardList, Clock, Coins, FileText, FolderKanban,
  Flag, Gift, Lightbulb, MessageSquare, ReceiptText, Settings2, Shield, Sparkles, Target, TrendingDown, TrendingUp, Users, Wallet, Eye, EyeOff,
} from "lucide-react";
import { CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { brandify } from "@/lib/brand";
import ChartCard from "@/components/products/clientos/dashboard/DashboardCharts";
import DataTableCard from "@/components/products/clientos/dashboard/DataTableCard";
import { RANGES, formatValue, timeAgo, formatDate, type RangeId } from "@/components/products/clientos/dashboard/format";
import type { DashboardModel, IconKey, Insight, Tone } from "@/lib/products/clientos/dashboard/types";
import { cn } from "@/lib/utils";

const ICONS: Record<IconKey, React.ComponentType<{ className?: string }>> = {
  trending: TrendingUp, calendar: Calendar, award: Award, clipboard: ClipboardList, wallet: Wallet, coins: Coins, gift: Gift, users: Users, folder: FolderKanban,
  flag: Flag, receipt: ReceiptText, briefcase: Briefcase, file: FileText, clock: Clock, check: CheckCircle2, alert: AlertTriangle, book: BookOpen, chart: BarChart3,
  message: MessageSquare, target: Target, sparkles: Sparkles, bell: Bell, shield: Shield,
};

const TONE: Record<Tone, string> = {
  default: "bg-primary/10 text-primary",
  good: "bg-green-500/15 text-green-600 dark:text-green-400",
  warn: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  bad: "bg-destructive/15 text-destructive",
};

const INSIGHT_META: Record<Insight["type"], { icon: React.ComponentType<{ className?: string }>; cls: string; label: string }> = {
  attention: { icon: AlertTriangle, cls: "bg-amber-500/15 text-amber-600 dark:text-amber-400", label: "Needs attention" },
  good: { icon: CheckCircle2, cls: "bg-green-500/15 text-green-600 dark:text-green-400", label: "On track" },
  changed: { icon: TrendingUp, cls: "bg-blue-500/15 text-blue-600 dark:text-blue-400", label: "What changed" },
  tip: { icon: Lightbulb, cls: "bg-primary/10 text-primary", label: "Tip" },
};

const WIDGETS = [
  { id: "quick", label: "Quick actions" },
  { id: "kpis", label: "Key metrics" },
  { id: "summary", label: "At a glance" },
  { id: "charts", label: "Analytics & charts" },
  { id: "wallet", label: "Wallet & credits" },
  { id: "activity", label: "Pending, upcoming & alerts" },
  { id: "insights", label: "Insights & recommendations" },
  { id: "tables", label: "Data tables" },
  { id: "timeline", label: "Activity timeline" },
];

// Per-viewer widget visibility, kept in localStorage (a convenience only — the dashboard renders fully without it).
const subscribers = new Set<() => void>();
const storageKey = (kind: string) => `portal-dash-hidden:${kind}`;
function readHidden(kind: string): string {
  try {
    return window.localStorage.getItem(storageKey(kind)) ?? "[]";
  } catch {
    return "[]";
  }
}
function useHidden(kind: string): [Set<string>, (id: string) => void] {
  const raw = useSyncExternalStore(
    (cb) => {
      subscribers.add(cb);
      return () => subscribers.delete(cb);
    },
    () => readHidden(kind),
    () => "[]"
  );
  const hidden = useMemo(() => {
    try {
      return new Set<string>(JSON.parse(raw));
    } catch {
      return new Set<string>();
    }
  }, [raw]);
  const toggle = (id: string) => {
    const next = new Set(hidden);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    try {
      window.localStorage.setItem(storageKey(kind), JSON.stringify([...next]));
    } catch {
      /* storage unavailable */
    }
    subscribers.forEach((f) => f());
  };
  return [hidden, toggle];
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 rounded-3xl border border-border/50 bg-muted/70 p-5 sm:p-6 dark:border-border/40 dark:bg-transparent">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">{title}</h2>
        {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      </div>
      {children}
    </section>
  );
}

function MiniList({ title, icon: Icon, tone, empty, children }: { title: string; icon: React.ComponentType<{ className?: string }>; tone: string; empty: string; children: React.ReactNode[] }) {
  return (
    <GlassCard interactive={false}>
      <CardHeader className="pb-1">
        <CardTitle className="flex items-center gap-2 text-sm">
          <span className={cn("flex size-7 items-center justify-center rounded-lg", tone)}><Icon className="size-3.5" /></span>
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {children.length === 0 ? <p className="py-3 text-xs text-muted-foreground">{empty}</p> : <ul className="space-y-1.5">{children}</ul>}
      </CardContent>
    </GlassCard>
  );
}

function Row({ href, title, detail, right, dot }: { href?: string; title: string; detail?: string | null; right?: string; dot?: string }) {
  const inner = (
    <>
      {dot && <span className={cn("mt-1.5 size-1.5 shrink-0 rounded-full", dot)} />}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-foreground">{title}</span>
        {detail && <span className="block truncate text-xs text-muted-foreground">{detail}</span>}
      </span>
      {right && <span className="shrink-0 text-[11px] text-muted-foreground">{right}</span>}
    </>
  );
  return (
    <li>
      {href ? (
        <Link href={href} className="flex items-start gap-2 rounded-lg px-1.5 py-1 hover:bg-muted/50">{inner}</Link>
      ) : (
        <div className="flex items-start gap-2 px-1.5 py-1">{inner}</div>
      )}
    </li>
  );
}

const PRIORITY_DOT = { high: "bg-destructive", medium: "bg-amber-500", low: "bg-blue-500" } as const;

export default function DashboardView({ model }: { model: DashboardModel }) {
  const [range, setRange] = useState<RangeId>("all");
  const [tab, setTab] = useState(model.tables[0]?.id ?? "");
  const [customize, setCustomize] = useState(false);
  const [hidden, toggle] = useHidden(model.kind);
  const show = (id: string) => !hidden.has(id);
  // keep the selected tab valid if the model changes (role/lead switch)
  useEffect(() => {
    if (!model.tables.some((t) => t.id === tab)) setTab(model.tables[0]?.id ?? ""); // eslint-disable-line react-hooks/set-state-in-effect
  }, [model.tables, tab]);

  const attention = model.insights.filter((i) => i.type === "attention");
  const changed = model.insights.filter((i) => i.type === "changed" || i.type === "good");
  const highPending = model.pending.filter((p) => p.priority === "high");
  const walletCharts = model.charts.filter((c) => c.section === "wallet");
  // Charts that have no data at all are dropped (a fresh account shouldn't see a wall of empty boxes); range-filtered emptiness is handled inside each chart.
  const hasData = (c: DashboardModel["charts"][number]) => (c.series ? (c.rows?.length ?? 0) > 0 : (c.categories ?? []).some((x) => x.value > 0));
  const otherCharts = model.charts.filter((c) => c.section !== "wallet" && hasData(c));
  const activeTable = model.tables.find((t) => t.id === tab) ?? model.tables[0];

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
      <PanelDashboardHeader
        breadcrumbs={[{ label: "Portal", href: "/clientos" }, { label: "Dashboard" }]}
        title={brandify(model.title)}
        description={`${model.subtitle}${model.badge ? ` · ${model.badge}` : ""}`}
        filters={
            <PanelTabs label="Date range" active={range} onSelect={(k) => setRange(k as typeof range)} tabs={RANGES.map((r) => ({ key: r.id, label: r.label }))} />
        }
        actions={
            <button type="button" onClick={() => setCustomize((v) => !v)} aria-expanded={customize} className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3 py-1.5 text-xs font-medium hover:border-primary">
              <Settings2 className="size-3.5" /> Customize
            </button>
        }
      />

      {customize && (
        <GlassCard interactive={false}>
          <CardContent className="py-3">
            <p className="mb-2 text-xs text-muted-foreground">Choose which sections appear on your dashboard. This is saved on this device.</p>
            <div className="flex flex-wrap gap-2">
              {WIDGETS.map((w) => (
                <button key={w.id} type="button" onClick={() => toggle(w.id)} aria-pressed={show(w.id)} className={cn("inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium", show(w.id) ? "border-primary/40 bg-primary/10 text-primary" : "border-border text-muted-foreground")}>
                  {show(w.id) ? <Eye className="size-3" /> : <EyeOff className="size-3" />} {w.label}
                </button>
              ))}
            </div>
          </CardContent>
        </GlassCard>
      )}

      {model.notice && <div className="rounded-xl border border-border/60 bg-secondary/40 px-4 py-3 text-sm text-secondary-foreground">{model.notice}</div>}

      {model.journey && model.journey.steps.length > 0 && (
        <Link href="/clientos/journey" className="block">
          <GlassCard interactive={false}>
            <CardContent className="space-y-3 py-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-foreground">
                  Your journey · <span className="text-primary">{model.journey.stageLabel}</span>
                  <span className="ml-2 text-xs font-normal text-muted-foreground">{model.journey.code}</span>
                </p>
                {model.journey.nextLabel && <p className="text-xs text-muted-foreground">Next: <span className="font-medium text-foreground">{model.journey.nextLabel}</span></p>}
              </div>
              <ol className="flex items-center gap-1 overflow-x-auto pb-1">
                {model.journey.steps.map((st, i) => (
                  <li key={`${st.label}-${i}`} className="flex min-w-0 flex-1 items-center gap-1">
                    <span className={cn("h-1.5 min-w-8 flex-1 rounded-full", st.state === "done" ? "bg-green-500" : st.state === "current" ? "bg-primary" : st.state === "skipped" ? "bg-destructive/40" : "bg-muted")} title={st.label} />
                  </li>
                ))}
              </ol>
              <p className="text-[11px] text-muted-foreground">{model.journey.steps.filter((x) => x.state === "done").length} of {model.journey.steps.length} stages complete</p>
            </CardContent>
          </GlassCard>
        </Link>
      )}

      {show("quick") && model.quickActions.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {model.quickActions.map((a) => {
            const Icon = ICONS[a.icon];
            return (
              <Link key={a.id} href={a.href} className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-sm font-medium hover:border-primary hover:text-primary">
                <Icon className="size-4" /> {a.label}
              </Link>
            );
          })}
        </div>
      )}

      {show("kpis") && (
        <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(230px,1fr))]">
          {model.kpis.map((k) => {
            const Icon = ICONS[k.icon];
            const body = (
              <GlassCard interactive={false}>
                <CardContent className="flex h-full items-start gap-3 py-4">
                  <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-xl", TONE[k.tone ?? "default"])}><Icon className="size-4" /></span>
                  <div className="min-w-0">
                    <p className="text-[11px] text-muted-foreground">{k.label}</p>
                    <p className="truncate text-xl font-black tabular-nums tracking-tight text-foreground">{formatValue(k.value, k.format)}</p>
                    {(k.hint || k.delta) && (
                      <p className="mt-0.5 flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground">
                        {k.delta && (
                          <span className={cn("inline-flex items-center gap-0.5 font-medium", k.delta.pct >= 0 ? "text-green-600 dark:text-green-400" : "text-destructive")}>
                            {k.delta.pct >= 0 ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
                            {Math.abs(k.delta.pct)}% {k.delta.label}
                          </span>
                        )}
                        {k.hint}
                      </p>
                    )}
                  </div>
                  {k.href && <ArrowUpRight className="ml-auto size-3.5 shrink-0 text-muted-foreground/60" />}
                </CardContent>
              </GlassCard>
            );
            return k.href ? <Link key={k.id} href={k.href} className="block">{body}</Link> : <div key={k.id}>{body}</div>;
          })}
        </div>
      )}

      {show("summary") && (
        <Section title="At a glance" hint="What's happening, what needs you, what's next">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <MiniList title="Needs attention" icon={AlertTriangle} tone="bg-amber-500/15 text-amber-600 dark:text-amber-400" empty="Nothing urgent — you're all caught up.">
              {[
                ...highPending.slice(0, 3).map((p) => <Row key={p.id} href={p.href} title={p.title} detail={p.detail} dot="bg-destructive" />),
                ...attention.slice(0, 3).map((i) => <Row key={i.id} href={i.href} title={i.title} detail={i.body} dot="bg-amber-500" />),
              ]}
            </MiniList>
            <MiniList title="What changed" icon={TrendingUp} tone="bg-blue-500/15 text-blue-600 dark:text-blue-400" empty="No notable changes yet.">
              {changed.slice(0, 4).map((i) => <Row key={i.id} href={i.href} title={i.title} detail={i.body} dot={i.type === "good" ? "bg-green-500" : "bg-blue-500"} />)}
            </MiniList>
            <MiniList title="Coming next" icon={CalendarClock} tone="bg-primary/10 text-primary" empty="Nothing scheduled.">
              {model.upcoming.slice(0, 4).map((e) => <Row key={e.id} href={e.href} title={e.title} detail={e.detail} right={formatDate(e.at)} />)}
            </MiniList>
            <MiniList title="Recently completed" icon={CheckCircle2} tone="bg-green-500/15 text-green-600 dark:text-green-400" empty="Completed items will appear here.">
              {model.completed.slice(0, 4).map((c) => <Row key={c.id} href={c.href} title={c.title} detail={c.detail} right={timeAgo(c.at)} />)}
            </MiniList>
          </div>
        </Section>
      )}

      {show("charts") && otherCharts.length > 0 && (
        <Section title="Analytics" hint="Click any chart or slice to drill in">
          <div className="grid gap-3 lg:grid-cols-2">
            {otherCharts.map((c) => <ChartCard key={c.id} chart={c} range={range} />)}
          </div>
        </Section>
      )}

      {show("wallet") && model.wallet && (
        <Section title="Wallet & credits" hint="Where your credits come from and go">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {[
              { l: "Available", v: model.wallet.available, h: "/clientos/wallet" },
              { l: "Pending / locked", v: model.wallet.pending + model.wallet.locked, h: "/clientos/wallet" },
              { l: "Lifetime earned", v: model.wallet.lifetimeEarned, h: "/clientos/wallet" },
              { l: "Lifetime used", v: model.wallet.lifetimeRedeemed, h: "/clientos/wallet" },
              { l: "Referral earnings", v: model.wallet.referral.credits, h: "/clientos/referrals" },
            ].map((x) => (
              <Link key={x.l} href={x.h} className="block">
                <GlassCard interactive={false}>
                  <CardContent className="py-3">
                    <p className="text-[11px] text-muted-foreground">{x.l}</p>
                    <p className="text-xl font-black tabular-nums text-foreground">{formatValue(x.v, "credits")}</p>
                  </CardContent>
                </GlassCard>
              </Link>
            ))}
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            {walletCharts.map((c, i) => <div key={c.id} className={i === 0 ? "lg:col-span-2" : ""}><ChartCard chart={c} range={range} /></div>)}
          </div>
        </Section>
      )}

      {show("activity") && (
        <Section title="Actions & alerts">
          <div className="grid gap-3 lg:grid-cols-3">
            <MiniList title="Pending actions" icon={ClipboardList} tone="bg-amber-500/15 text-amber-600 dark:text-amber-400" empty="No pending actions.">
              {model.pending.map((p) => <Row key={p.id} href={p.href} title={p.title} detail={p.detail} dot={PRIORITY_DOT[p.priority]} />)}
            </MiniList>
            <MiniList title="Upcoming events & deadlines" icon={CalendarClock} tone="bg-primary/10 text-primary" empty="No upcoming events.">
              {model.upcoming.map((e) => <Row key={e.id} href={e.href} title={e.title} detail={e.detail} right={formatDate(e.at)} />)}
            </MiniList>
            <MiniList title={`Notifications${model.unreadCount ? ` · ${model.unreadCount} new` : ""}`} icon={Bell} tone="bg-blue-500/15 text-blue-600 dark:text-blue-400" empty="You're all caught up.">
              {model.notifications.slice(0, 6).map((n) => <Row key={n.id} href={n.href ?? "/clientos/notifications"} title={n.title} detail={n.body} right={timeAgo(n.at)} dot={n.read ? undefined : "bg-primary"} />)}
            </MiniList>
          </div>
        </Section>
      )}

      {show("insights") && (model.insights.length > 0 || model.recommendations.length > 0) && (
        <Section title="Insights & recommendations">
          <div className="grid gap-3 lg:grid-cols-2">
            <GlassCard interactive={false}>
              <CardHeader className="pb-1"><CardTitle className="text-sm">Performance insights</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {model.insights.length === 0 && <p className="py-3 text-xs text-muted-foreground">Insights appear as you use the platform.</p>}
                {model.insights.map((i) => {
                  const meta = INSIGHT_META[i.type];
                  const Icon = meta.icon;
                  const inner = (
                    <div className="flex items-start gap-3 rounded-xl border border-border/50 p-3 hover:border-primary/40">
                      <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-lg", meta.cls)}><Icon className="size-4" /></span>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-foreground">{i.title}</p>
                        <p className="text-xs text-muted-foreground">{i.body}</p>
                      </div>
                    </div>
                  );
                  return i.href ? <Link key={i.id} href={i.href} className="block">{inner}</Link> : <div key={i.id}>{inner}</div>;
                })}
              </CardContent>
            </GlassCard>
            <GlassCard interactive={false}>
              <CardHeader className="pb-1"><CardTitle className="text-sm">Recommended for you</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {model.recommendations.length === 0 && <p className="py-3 text-xs text-muted-foreground">No recommendations right now.</p>}
                {model.recommendations.map((r) => (
                  <Link key={r.id} href={r.href} className="flex items-center justify-between gap-3 rounded-xl border border-border/50 p-3 hover:border-primary/40">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-foreground">{r.title}</p>
                      <p className="text-xs text-muted-foreground">{r.body}</p>
                    </div>
                    <span className="shrink-0 rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground">{r.cta}</span>
                  </Link>
                ))}
              </CardContent>
            </GlassCard>
          </div>
        </Section>
      )}

      {show("tables") && activeTable && (
        <Section title="Detailed reports" hint="Search, sort, filter by date range and export">
          <PanelTabs active={activeTable.id} onSelect={setTab} tabs={model.tables.map((t) => ({ key: t.id, label: t.title }))} />
          <DataTableCard key={activeTable.id} table={activeTable} range={range} />
        </Section>
      )}

      {show("timeline") && (
        <Section title="Activity timeline">
          <GlassCard interactive={false}>
            <CardContent className="py-4">
              {model.timeline.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">Your activity will appear here.</p>
              ) : (
                <ol className="relative ml-2 space-y-4 border-l-2 border-border/60 pl-5">
                  {model.timeline.slice(0, 14).map((f) => (
                    <li key={f.id} className="relative">
                      <span className={cn("absolute -left-[27px] top-1 size-3 rounded-full ring-4 ring-background", f.kind === "credit" ? "bg-green-500" : f.kind === "spend" ? "bg-primary" : f.kind === "message" ? "bg-blue-500" : "bg-muted-foreground/60")} />
                      {f.href ? <Link href={f.href} className="text-sm font-medium text-foreground hover:text-primary">{f.title}</Link> : <p className="text-sm font-medium text-foreground">{f.title}</p>}
                      {f.detail && <p className="text-xs text-muted-foreground">{f.detail}</p>}
                      <p className="text-[11px] text-muted-foreground/80">{timeAgo(f.at)}</p>
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          </GlassCard>
        </Section>
      )}
    </div>
  );
}
