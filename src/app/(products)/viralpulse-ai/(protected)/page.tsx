import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { BarChart3, CalendarDays, Images, Megaphone, Plus, Send, Sparkles, Clapperboard, Wallet, BookOpen, CreditCard } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { PageHeader } from "@/components/products/viralpulse-ai/SmmsUi";
import { AccountsSection, ActivitySection, AdsSection, AttentionSection, HighlightsSection, PublishedSection, ScheduleSection, SectionSkeleton, SetupSection, StatsSection, StudiosSection } from "@/components/products/viralpulse-ai/dashboard/DashboardSections";
import { getViewer, can } from "@/lib/products/viralpulse-ai/viewer";
import { dashPerms, headerActions } from "@/lib/products/viralpulse-ai/dashboard-core";
import { companyTz, last30, type DashCtx } from "@/lib/products/viralpulse-ai/dashboard";
import { loadAnalytics, type AnalyticsData } from "@/lib/products/viralpulse-ai/metrics/queries";
import { getViralPulseHealth, type ViralPulseHealth } from "@/lib/products/viralpulse-ai/health";

export const dynamic = "force-dynamic";

const ACTION_ICON = { post: Plus, campaign: Megaphone, image: Sparkles, ugc: Clapperboard } as const;

export default async function ViralPulseDashboardPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/viralpulse-ai/login");
  const perms = dashPerms((p) => can(viewer, p));

  // One analytics read and one health probe per request, shared by every section that needs them.
  const now = new Date();
  let analytics: Promise<AnalyticsData> | undefined;
  let health: Promise<ViralPulseHealth | null> | undefined;
  const ctx: DashCtx = {
    now, perms, viewerId: viewer.userId,
    analytics: () => (analytics ??= companyTz().then((tz) => { const r = last30({ now }, tz); return loadAnalytics({ from: r.from, to: r.to }, now); })),
    health: () => (health ??= getViralPulseHealth().catch(() => null)),
  };

  const actions = headerActions(perms);
  const quick = [
    perms.viewPosts && { href: "/viralpulse-ai/posts?view=month", label: "Content calendar", icon: CalendarDays },
    perms.viewPosts && { href: "/viralpulse-ai/posts?tab=drafts", label: "Draft posts", icon: Send },
    { href: "/viralpulse-ai/brochures", label: "Brochures", icon: BookOpen },
    { href: "/viralpulse-ai/vcards", label: "Visiting Cards", icon: CreditCard },
    perms.viewStudios && { href: "/viralpulse-ai/image-studio?tab=library", label: "Media library", icon: Images },
    perms.viewCampaigns && { href: "/viralpulse-ai/campaigns", label: "All campaigns", icon: Megaphone },
    perms.manageLimits && { href: "/viralpulse-ai/campaigns/limits", label: "Ad spending limits", icon: Wallet },
    perms.viewAnalytics && { href: "/viralpulse-ai/analytics", label: "Analytics", icon: BarChart3 },
  ].filter((x): x is { href: string; label: string; icon: typeof Send } => Boolean(x));

  const showStats = perms.viewPosts || perms.viewCampaigns || perms.viewStudios || perms.viewUgc || perms.settings;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Dashboard"
        crumbs={[{ label: "Dashboard" }]}
        description="Everything in ViralPulse at a glance: what is going out, how your ads and content are doing, and what needs you."
        actions={actions.map((a, i) => {
          const Icon = ACTION_ICON[a.key];
          return (
            <Button key={a.key} variant={i === 0 ? "default" : "outline"} nativeButton={false} render={<Link href={a.href} />}>
              <Icon className="size-4" /> {a.label}
            </Button>
          );
        })}
      />

      {/* <Suspense fallback={null}><SetupSection ctx={ctx} /></Suspense> */}
      <Suspense fallback={null}><AttentionSection ctx={ctx} /></Suspense>

      {showStats && (
        <Suspense fallback={<SectionSkeleton title="Key numbers" rows={2} />}>
          <StatsSection ctx={ctx} />
        </Suspense>
      )}

      {quick.length > 0 && (
        <nav aria-label="Quick actions" className="flex flex-wrap gap-2">
          {quick.map((q) => (
            <Link key={q.href} href={q.href} className={buttonVariants({ variant: "outline", size: "sm" })}>
              <q.icon className="size-3.5" aria-hidden /> {q.label}
            </Link>
          ))}
        </nav>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {perms.viewPosts && <Suspense fallback={<SectionSkeleton title="Upcoming schedule" />}><ScheduleSection ctx={ctx} canCreate={perms.newPost} /></Suspense>}
        {perms.viewPosts && <Suspense fallback={<SectionSkeleton title="Recently published" />}><PublishedSection ctx={ctx} /></Suspense>}
        {perms.viewCampaigns && <Suspense fallback={<SectionSkeleton title="Campaigns & Ads" />}><AdsSection ctx={ctx} /></Suspense>}
        {(perms.viewStudios || perms.viewUgc) && <Suspense fallback={<SectionSkeleton title="Creative studios" />}><StudiosSection ctx={ctx} /></Suspense>}
        {perms.viewAnalytics && <Suspense fallback={<SectionSkeleton title="Analytics highlights" className="lg:col-span-2" rows={5} />}><HighlightsSection ctx={ctx} /></Suspense>}
        {(perms.viewPosts || perms.settings) && <Suspense fallback={<SectionSkeleton title="Accounts health" />}><AccountsSection ctx={ctx} /></Suspense>}
        {perms.audit && <Suspense fallback={<SectionSkeleton title="Recent activity" />}><ActivitySection ctx={ctx} /></Suspense>}
      </div>
    </div>
  );
}
