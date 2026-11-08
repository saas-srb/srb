import PanelFilterBar from "@/components/platform/panel/PanelFilterBar";
import PanelDashboardHeader from "@/components/platform/panel/PanelDashboardHeader";
import Link from "next/link";
import {
  Files, Image as ImageIcon, Menu as MenuIcon, Palette, ArrowRight, FileCheck2, Activity, Plus, Upload,
  BadgeInfo, Database, CircleCheck, CircleDashed, PenLine, Archive, Newspaper, Briefcase, Users, Boxes, LayoutDashboard,
} from "lucide-react";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import KpiCard from "@/components/products/dealflow-ai/KpiCard";
import CmsPageHeader from "@/components/products/sitecraft-ai/ui/CmsPageHeader";
import { ContentStatusBadge, PendingChangesBadge } from "@/components/products/sitecraft-ai/ui/StatusBadge";
import { buttonVariants } from "@/components/ui/button";
import { listPages } from "@/lib/products/sitecraft-ai/pages";
import { listThemes, getActiveThemeKey } from "@/lib/products/sitecraft-ai/theme";
import { getSettings } from "@/lib/products/sitecraft-ai/settings";
import { listMedia } from "@/lib/products/sitecraft-ai/media";
import { listNavItems } from "@/lib/products/sitecraft-ai/nav";
import { listAudit, AUDIT_ACTION_LABEL } from "@/lib/products/sitecraft-ai/audit";
import { listAdminRecords } from "@/lib/products/sitecraft-ai/collections/store";
import { COLLECTIONS } from "@/lib/products/sitecraft-ai/collections/registry";
import type { CollectionKey } from "@/lib/products/sitecraft-ai/collections/types";
import { SITE_AREAS, areaOf, timeAgo, displayTitle } from "@/lib/products/sitecraft-ai/site-areas";
import { getViewer, can } from "@/lib/products/sitecraft-ai/viewer";
import { cn } from "@/lib/utils";
import { seoIssues } from "@/lib/products/sitecraft-ai/seo-checks";
import DashboardWidgets, { type DashboardWidget } from "@/components/products/sitecraft-ai/dashboard/DashboardWidgets";
import QuickDraft from "@/components/products/sitecraft-ai/dashboard/QuickDraft";
import { CheckCircle2, AlertTriangle, HeartPulse, Paintbrush, ExternalLink, Sparkles, SearchCheck, PanelBottom } from "lucide-react";

const COLLECTION_ICON: Record<CollectionKey, React.ComponentType<{ className?: string }>> = { blog: Newspaper, jobs: Briefcase, engagement: Users, products: Boxes };

export default async function CmsDashboardPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const keys = Object.keys(COLLECTIONS) as CollectionKey[];
  const [viewer, allPages, themes, activeKey, settings, media, nav, audit, collections] = await Promise.all([
    getViewer(),
    listPages(),
    listThemes(),
    getActiveThemeKey(),
    getSettings(),
    listMedia(),
    listNavItems(),
    listAudit({ pageSize: 10 }),
    Promise.all(keys.map(async (k) => ({ key: k, rows: await listAdminRecords(k) }))),
  ]);

  // The search box narrows the page counts and lists to pages whose title or URL contains the text.
  const needle = sp.q?.trim().toLowerCase();
  const pages = needle ? allPages.filter((p) => p.title.toLowerCase().includes(needle) || p.path.toLowerCase().includes(needle)) : allPages;
  const count = (status: string) => pages.filter((p) => p.status === status).length;
  const published = count("published");
  const drafts = count("draft");
  const archived = count("archived");
  const pending = pages.filter((p) => p.hasUnpublishedChanges).sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt));
  const activeTheme = themes.find((t) => t._id === activeKey);
  const records = collections.flatMap((c) => c.rows);
  const recordsLive = records.filter((r) => r.state === "published").length;
  const byArea = SITE_AREAS.map((a) => ({ ...a, count: pages.filter((p) => areaOf(p.path) === a.key).length })).filter((a) => a.count > 0);

  const pct = (n: number) => (pages.length ? (n / pages.length) * 100 : 0);
  const quick = [
    { href: "/sitecraft-ai/pages", label: "New page", icon: Plus, show: viewer ? can(viewer, "PAGES_CREATE") : false },
    { href: "/sitecraft-ai/media", label: "Upload media", icon: Upload, show: true },
    { href: "/sitecraft-ai/navigation", label: "Edit menu", icon: MenuIcon, show: true },
    { href: "/sitecraft-ai/site-identity", label: "Site identity", icon: BadgeInfo, show: true },
  ].filter((q) => q.show);


  // Site Health (WordPress-style): each check passes or points at the screen that fixes it.
  const seoProblems = pages
    .filter((p) => p.status === "published")
    .filter((p) => {
      const seo = p.live?.seo ?? p.draft.seo ?? null;
      return seoIssues({ title: seo?.title ?? "", description: seo?.description ?? "", canonical: seo?.canonical ?? null, noindex: seo?.robots?.index === false }).length > 0;
    }).length;
  const noAlt = media.filter((m) => !m.altText?.trim()).length;
  const themeDraftPending = !!activeTheme && JSON.stringify(activeTheme.draftTokens) !== JSON.stringify(activeTheme.tokens);
  const recordChanges = records.filter((r) => r.hasUnpublishedChanges && r.state !== "archived").length;
  const health: HealthCheck[] = [
    { ok: !settings.maintenanceMode.enabled, critical: true, good: "The website is open to visitors", bad: "Maintenance mode is on — visitors can't see the site", href: "/sitecraft-ai/settings" },
    { ok: pending.length === 0, good: "Every page change is published", bad: `${pending.length} page${pending.length === 1 ? " has" : "s have"} unpublished changes`, href: "/sitecraft-ai/pages?status=pending" },
    { ok: recordChanges === 0, good: "Blog, careers and other records are all published", bad: `${recordChanges} record${recordChanges === 1 ? " has" : "s have"} unpublished changes`, href: "/sitecraft-ai/collections" },
    { ok: seoProblems === 0, good: "Every published page's search appearance looks good", bad: `${seoProblems} published page${seoProblems === 1 ? " needs" : "s need"} SEO attention`, href: "/sitecraft-ai/seo" },
    { ok: noAlt === 0, good: "Every image has alt text", bad: `${noAlt} image${noAlt === 1 ? " is" : "s are"} missing alt text`, href: "/sitecraft-ai/media?filter=no-alt" },
    { ok: !!settings.defaultOgImage, good: "A default social sharing image is set", bad: "No default social sharing image", href: "/sitecraft-ai/settings" },
    { ok: !themeDraftPending, good: "The active theme has no unpublished customizations", bad: "The active theme has unpublished customizations", href: `/sitecraft-ai/customize/${activeKey}` },
  ];
  const recentDrafts = (collections.find((c) => c.key === "blog")?.rows ?? [])
    .filter((r) => r.state === "draft")
    .sort((a, b) => +new Date(b.updatedAt ?? 0) - +new Date(a.updatedAt ?? 0))
    .slice(0, 3)
    .map((r) => ({ slug: r.slug, title: r.title, edited: r.updatedAt ? timeAgo(r.updatedAt) : "" }));

  const widgets: DashboardWidget[] = [
    { id: "glance", label: "At a glance", span: "full", node: (
      <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Link href="/sitecraft-ai/pages"><KpiCard label="Published pages" value={published} icon={<Files className="size-4" />} accent /></Link>
        <Link href="/sitecraft-ai/pages?status=pending"><KpiCard label="Awaiting publish" value={pending.length} icon={<PenLine className="size-4" />} /></Link>
        <Link href="/sitecraft-ai/collections"><KpiCard label="Live records" value={recordsLive} icon={<Database className="size-4" />} /></Link>
        <Link href="/sitecraft-ai/media"><KpiCard label="Media files" value={media.length} icon={<ImageIcon className="size-4" />} /></Link>
      </div>

      </>
    ) },
    { id: "publishing", label: "Publishing status", span: "full", node: (
      <>
      <GlassCard interactive={false} className="space-y-3 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold text-foreground">Publishing status</p>
          <p className="text-xs text-muted-foreground">{pages.length} pages in the CMS</p>
        </div>
        <div className="flex h-2.5 overflow-hidden rounded-full bg-muted" role="img" aria-label={`${published} published, ${drafts} draft, ${archived} archived`}>
          <div className="bg-emerald-500" style={{ width: `${pct(published)}%` }} />
          <div className="bg-sky-500" style={{ width: `${pct(drafts)}%` }} />
          <div className="bg-muted-foreground/40" style={{ width: `${pct(archived)}%` }} />
        </div>
        <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5"><CircleCheck className="size-3.5 text-emerald-500" /> {published} published</span>
          <span className="flex items-center gap-1.5"><CircleDashed className="size-3.5 text-sky-500" /> {drafts} draft</span>
          <span className="flex items-center gap-1.5"><PenLine className="size-3.5 text-amber-500" /> {pending.length} with unpublished changes</span>
          <span className="flex items-center gap-1.5"><Archive className="size-3.5" /> {archived} archived</span>
        </div>
      </GlassCard>

      </>
    ) },
    { id: "needs-publishing", label: "Needs publishing", span: "wide", node: (
      <>
        <GlassCard interactive={false} className="h-full p-5">
          <div className="flex items-center justify-between gap-2">
            <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <PenLine className="size-4 text-primary" /> Needs publishing
            </p>
            {pending.length > 0 && (
              <Link href="/sitecraft-ai/pages?status=pending" className="text-xs font-medium text-primary hover:underline">View all</Link>
            )}
          </div>
          {pending.length === 0 ? (
            <div className="mt-6 flex flex-col items-center gap-2 pb-4 text-center text-sm text-muted-foreground">
              <FileCheck2 className="size-8 text-emerald-500" />
              Everything in the CMS is published.
            </div>
          ) : (
            <ul className="mt-3 divide-y divide-border/60">
              {pending.slice(0, 7).map((p) => (
                <li key={p._id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">{displayTitle(p.title, p.path)}</p>
                    <p className="truncate font-mono text-xs text-muted-foreground">{p.path} · edited {timeAgo(p.updatedAt)}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {p.live ? <PendingChangesBadge className="hidden sm:inline-flex" /> : <ContentStatusBadge status="draft" />}
                    <Link href={`/sitecraft-ai/pages/${p._id}`} className={buttonVariants({ variant: "outline", size: "xs" })}>Edit</Link>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </GlassCard>

      </>
    ) },
    { id: "activity", label: "Recent activity", span: "narrow", node: (
      <>
        <GlassCard interactive={false} className="h-full p-5">
          <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Activity className="size-4 text-primary" /> Recent activity
          </p>
          {audit.items.length === 0 ? (
            <p className="mt-6 text-center text-sm text-muted-foreground">No activity yet.</p>
          ) : (
            <ol className="relative mt-4 space-y-3 border-l border-border/60 pl-4">
              {audit.items.map((a) => (
                <li key={a._id} className="relative text-sm">
                  <span className="absolute -left-[21px] top-1.5 size-2 rounded-full bg-primary/70 ring-4 ring-background" />
                  <p className="text-foreground">
                    <span className="font-medium">{AUDIT_ACTION_LABEL[a.action] ?? a.action}</span>{" "}
                    <span className="text-muted-foreground">{a.entity}</span>
                    {a.entityLabel ? <span className="text-foreground"> “{a.entityLabel}”</span> : null}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {a.actorEmail ?? "system"} · <time dateTime={new Date(a.createdAt).toISOString()} title={new Date(a.createdAt).toLocaleString()}>{timeAgo(a.createdAt)}</time>
                  </p>
                </li>
              ))}
            </ol>
          )}
          <Link href="/commandos/settings/audit-log?source=products&module=cms" className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
            Full audit log <ArrowRight className="size-3" />
          </Link>
        </GlassCard>
      </>
    ) },
    { id: "health", label: "Site Health", span: "half", node: <SiteHealth checks={health} /> },
    { id: "quick-draft", label: "Quick Draft", span: "half", node: <QuickDraft recent={recentDrafts} /> },
    { id: "areas", label: "Pages by site area", span: "half", node: (
      <>
        <GlassCard interactive={false} className="h-full p-5">
          <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Files className="size-4 text-primary" /> Pages by site area
          </p>
          <ul className="mt-3 space-y-1">
            {byArea.map((a) => (
              <li key={a.key}>
                <Link href={`/sitecraft-ai/pages?area=${a.key}`} className="group flex items-center gap-3 rounded-lg px-2 py-1.5 text-sm transition-colors hover:bg-primary/5">
                  <span className="flex-1 text-foreground group-hover:text-primary">{a.label}</span>
                  <span className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
                    <span className="block h-full rounded-full bg-primary/60" style={{ width: `${pct(a.count)}%` }} />
                  </span>
                  <span className="w-8 text-right text-xs tabular-nums text-muted-foreground">{a.count}</span>
                </Link>
              </li>
            ))}
          </ul>
        </GlassCard>

      </>
    ) },
    { id: "collections", label: "Collections", span: "half", node: (
      <>
        <GlassCard interactive={false} className="h-full p-5">
          <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Database className="size-4 text-primary" /> Collections
          </p>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {collections.map(({ key, rows }) => {
              const Icon = COLLECTION_ICON[key];
              const live = rows.filter((r) => r.state === "published").length;
              const changes = rows.filter((r) => r.hasUnpublishedChanges).length;
              return (
                <li key={key}>
                  <Link href={`/sitecraft-ai/collections/${key}`} className="group flex items-center gap-3 rounded-xl border border-border/50 p-3 transition-colors hover:border-primary/40 hover:bg-primary/5">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><Icon className="size-4" /></span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-foreground group-hover:text-primary">{COLLECTIONS[key].label}</span>
                      <span className={cn("block text-xs", changes ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground")}>
                        {live} live{changes ? ` · ${changes} unpublished` : ""}
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
          <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 border-t border-border/60 pt-3 text-xs text-muted-foreground">
            <Link href="/sitecraft-ai/navigation" className="flex items-center gap-1.5 hover:text-primary"><MenuIcon className="size-3.5" /> {nav.length} menu items</Link>
            <Link href="/sitecraft-ai/theme" className="flex items-center gap-1.5 hover:text-primary"><Palette className="size-3.5" /> Theme: {activeTheme?.name ?? activeKey}</Link>
          </div>
        </GlassCard>
      </>
    ) },
  ];

  return (
    <div className="space-y-4">
      <PanelDashboardHeader
        filters={
          <PanelFilterBar
            fields={[{ key: "q", label: "Search", type: "search", placeholder: "Search pages by title or URL…" }]}
          />
        }
        breadcrumbs={[{ label: "CMS", href: "/sitecraft-ai" }, { label: "Dashboard" }]}
        title="Website Content Overview"
        description="Manage your website content in one place: track published pages, review pending changes and keep an eye on site health and recent activity."
        actions={quick.map((q) => (
          <Link key={q.href + q.label} href={q.href} className={buttonVariants({ variant: q.label === "New page" ? "default" : "outline", size: "sm" })}>
            <q.icon className="size-3.5" /> {q.label}
          </Link>
        ))}
      />


      <DashboardWidgets welcome={<WelcomePanel activeTheme={activeKey} canCreate={viewer ? can(viewer, "PAGES_CREATE") : false} />} widgets={widgets} />
    </div>
  );
}

interface HealthCheck {
  ok: boolean;
  critical?: boolean;
  good: string;
  bad: string;
  href: string;
}

function SiteHealth({ checks }: { checks: HealthCheck[] }) {
  const passed = checks.filter((c) => c.ok).length;
  const score = Math.round((passed / checks.length) * 100);
  const critical = checks.some((c) => !c.ok && c.critical);
  const good = !critical && score >= 70;
  const r = 26;
  const circ = 2 * Math.PI * r;
  const failing = checks.filter((c) => !c.ok).sort((a, b) => Number(!!b.critical) - Number(!!a.critical));
  return (
    <GlassCard interactive={false} className="h-full space-y-4 p-5">
      <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <HeartPulse className="size-4 text-primary" /> Site Health
      </p>
      <div className="flex items-center gap-4">
        <svg viewBox="0 0 64 64" className="size-16 shrink-0 -rotate-90" role="img" aria-label={`Site health ${score}%`}>
          <circle cx="32" cy="32" r={r} fill="none" strokeWidth="6" className="stroke-muted" />
          <circle cx="32" cy="32" r={r} fill="none" strokeWidth="6" strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={circ * (1 - score / 100)} className={good ? "stroke-emerald-500" : critical ? "stroke-destructive" : "stroke-amber-500"} />
        </svg>
        <div>
          <p className={cn("text-base font-semibold", good ? "text-emerald-600 dark:text-emerald-400" : critical ? "text-destructive" : "text-amber-600 dark:text-amber-400")}>
            {good ? "Good" : critical ? "Needs attention" : "Should be improved"}
          </p>
          <p className="text-xs text-muted-foreground">{passed} of {checks.length} checks passed</p>
        </div>
      </div>
      <ul className="space-y-1.5">
        {[...failing, ...checks.filter((c) => c.ok)].map((c) => (
          <li key={c.good}>
            <Link href={c.href} className="group flex items-start gap-2 rounded-lg px-2 py-1 text-sm transition-colors hover:bg-primary/5">
              {c.ok ? (
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-500" />
              ) : (
                <AlertTriangle className={cn("mt-0.5 size-4 shrink-0", c.critical ? "text-destructive" : "text-amber-500")} />
              )}
              <span className={cn("flex-1", c.ok ? "text-muted-foreground" : "text-foreground")}>{c.ok ? c.good : c.bad}</span>
              {!c.ok && <ArrowRight className="mt-0.5 size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />}
            </Link>
          </li>
        ))}
      </ul>
    </GlassCard>
  );
}

function WelcomePanel({ activeTheme, canCreate }: { activeTheme: string; canCreate: boolean }) {
  const col = "space-y-2.5";
  const link = "flex items-center gap-2 text-sm text-foreground transition-colors hover:text-primary";
  return (
    <GlassCard interactive={false} className="overflow-hidden p-0">
      <div className="bg-gradient-to-r from-primary/10 via-secondary/40 to-transparent px-6 pt-6 pb-4">
        <p className="flex items-center gap-2 text-lg font-semibold text-foreground"><Sparkles className="size-5 text-primary" /> Welcome to your website CMS</p>
        <p className="mt-1 text-sm text-muted-foreground">Everything on the public website is managed here. Some links to get you going:</p>
      </div>
      <div className="grid gap-6 px-6 pt-2 pb-6 sm:grid-cols-3">
        <div className={col}>
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Get started</p>
          <Link href={`/sitecraft-ai/customize/${activeTheme}`} className={buttonVariants({ size: "sm" })}><Paintbrush className="size-3.5" /> Customize your site</Link>
          <p className="text-xs text-muted-foreground">or <Link href="/sitecraft-ai/theme" className="text-primary hover:underline">change your theme completely</Link></p>
        </div>
        <div className={col}>
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Next steps</p>
          <Link href="/sitecraft-ai/collections/blog?new=1" className={link}><Newspaper className="size-4 text-primary" /> Write a blog post</Link>
          {canCreate && <Link href="/sitecraft-ai/pages?new=1" className={link}><Plus className="size-4 text-primary" /> Add a page</Link>}
          <a href="/" target="_blank" rel="noopener noreferrer" className={link}><ExternalLink className="size-4 text-primary" /> View your site</a>
        </div>
        <div className={col}>
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">More actions</p>
          <Link href="/sitecraft-ai/navigation" className={link}><MenuIcon className="size-4 text-primary" /> Manage menus</Link>
          <Link href="/sitecraft-ai/footer" className={link}><PanelBottom className="size-4 text-primary" /> Edit the footer</Link>
          <Link href="/sitecraft-ai/seo" className={link}><SearchCheck className="size-4 text-primary" /> Review SEO</Link>
        </div>
      </div>
    </GlassCard>
  );
}
