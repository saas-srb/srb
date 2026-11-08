import PanelListFilters from "@/components/platform/panel/PanelListFilters";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { PageHeader, SectionCard, ScoreRing, SeverityBadge, TrustBadge, Position, EmptyState, Stat } from "@/components/products/rankmax-ai/SeoUi";
import { DonutChart, BarsChart } from "@/components/products/rankmax-ai/SeoCharts";
import { getViewer } from "@/lib/products/rankmax-ai/viewer";
import { getDashboard } from "@/lib/products/rankmax-ai/analytics";
import { listIssues } from "@/lib/products/rankmax-ai/issues";
import { allActiveKeywords } from "@/lib/products/rankmax-ai/keywords";
import { CATEGORIES, CATEGORY_LABEL, SEVERITIES, SEVERITY_META } from "@/lib/products/rankmax-ai/checks";
import { PROVIDERS } from "@/lib/products/rankmax-ai/integrations/providers";
import { integrationEnv } from "@/lib/products/rankmax-ai/settings";
import { formatDateTime } from "@/lib/utils";

const SEV_COLOR = { critical: "#ef4444", high: "#f97316", medium: "#f59e0b", low: "#0ea5e9" } as const;

export default async function OverviewPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/rankmax-ai/login");
  const [d, priorities, keywords] = await Promise.all([getDashboard(viewer.userId), listIssues({ status: "active", pageSize: 12 }), allActiveKeywords()]);
  const env = await integrationEnv();
  const striking = keywords.filter((k) => k.currentPosition !== null && k.currentPosition > 3 && k.currentPosition <= 20).sort((a, b) => (b.volume ?? 0) - (a.volume ?? 0)).slice(0, 10);

  const freshness: Record<string, { status: string; when: string | null; ok: boolean }> = {
    crawler: { status: d.run ? `${d.run.pagesCrawled} pages` : "Never run", when: d.run ? formatDateTime(d.run.startedAt) : null, ok: !!d.run },
    gsc: { status: !env.google ? "No credentials" : d.integrations.gsc.enabled ? (d.integrations.gsc.lastError ? "Error" : "Enabled") : "Disabled", when: d.integrations.gsc.lastSyncAt ? formatDateTime(d.integrations.gsc.lastSyncAt) : null, ok: !!d.integrations.gsc.lastSyncAt && !d.integrations.gsc.lastError },
    ga4: { status: !env.google ? "No credentials" : d.integrations.ga4.enabled ? (d.integrations.ga4.lastError ? "Error" : "Enabled") : "Disabled", when: d.integrations.ga4.lastSyncAt ? formatDateTime(d.integrations.ga4.lastSyncAt) : null, ok: !!d.integrations.ga4.lastSyncAt && !d.integrations.ga4.lastError },
    psi: { status: env.pagespeedKey ? "API key set" : "Keyless (low quota)", when: null, ok: true },
    import: { status: "Available", when: null, ok: true },
    manual: { status: "Available", when: null, ok: true },
  };

  return (
    <div className="space-y-4">
      <PageHeader title="SEO Overview" crumbs={[{ label: "SEO Overview" }]} description="Where the site stands, what to fix first, and how fresh each data source is." />

      <PanelListFilters>
<SectionCard title="SEO health" description={d.run ? `From the audit of ${formatDateTime(d.run.startedAt)} · ${d.run.passedChecks}/${d.run.totalChecks} checks passed` : "Run a website audit to score the site."}>
        <div className="flex flex-wrap items-center justify-around gap-6 py-2">
          <Link href="/rankmax-ai/pages?sortBy=score"><ScoreRing score={d.scores?.overall ?? null} label="Overall" size={128} /></Link>
          <Link href="/rankmax-ai/technical"><ScoreRing score={d.scores?.technical ?? null} label="Technical" /></Link>
          <Link href="/rankmax-ai/on-page"><ScoreRing score={d.scores?.onPage ?? null} label="On-page" /></Link>
          <Link href="/rankmax-ai/content"><ScoreRing score={d.scores?.content ?? null} label="Content" /></Link>
          <div className="grid grid-cols-2 gap-2">
            <Stat label="Pages crawled" value={d.run?.pagesCrawled ?? "—"} />
            <Stat label="Indexable" value={d.run?.indexablePages ?? "—"} />
            <Stat label="Open tasks" value={d.tasks.open} hint={d.tasks.overdue ? `${d.tasks.overdue} overdue` : undefined} />
            <Stat label="Fixed (30d)" value={d.tasks.doneLast30} />
          </div>
        </div>
      </SectionCard>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="Open issues by severity" description="Click a slice to open the list">
          <DonutChart
            data={SEVERITIES.map((s) => ({ key: s, label: SEVERITY_META[s].label, value: d.issues.bySeverity[s], color: SEV_COLOR[s], href: `/rankmax-ai/issues?status=active&severity=${s}` }))}
            emptyLabel="No open issues."
          />
        </SectionCard>
        <SectionCard title="Open issues by category" description="Click a bar to open the list">
          <BarsChart data={CATEGORIES.map((c) => ({ key: c, label: CATEGORY_LABEL[c], value: d.issues.byCategory[c], href: `/rankmax-ai/issues?status=active&category=${c}` })).filter((x) => x.value > 0)} emptyLabel="No open issues." />
        </SectionCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="Fix first" description="Highest-severity open issues" action={<Link href="/rankmax-ai/issues?status=active" className="text-xs text-primary hover:underline">All issues</Link>}>
          {priorities.items.length === 0 ? (
            <EmptyState title="Nothing open">No open SEO issues — run an audit to check again.</EmptyState>
          ) : (
            <ul className="divide-y divide-border/40">
              {priorities.items.map((i) => (
                <li key={i._id}>
                  <Link href={`/rankmax-ai/issues/${i._id}`} className="flex items-center gap-3 py-2 text-sm hover:text-primary">
                    <SeverityBadge severity={i.severity} />
                    <span className="min-w-0 flex-1 truncate">{i.title}</span>
                    <span className="max-w-[40%] shrink-0 truncate text-xs text-muted-foreground">{i.path}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
        <SectionCard title="Striking distance" description="Tracked keywords at positions 4–20 — the quickest ranking wins" action={<Link href="/rankmax-ai/keywords?position=11-20" className="text-xs text-primary hover:underline">Keywords</Link>}>
          {striking.length === 0 ? (
            <EmptyState title="No striking-distance keywords">Keywords appear here once positions are recorded or synced from Search Console.</EmptyState>
          ) : (
            <ul className="divide-y divide-border/40">
              {striking.map((k) => (
                <li key={k._id}>
                  <Link href={`/rankmax-ai/keywords/${k._id}`} className="flex items-center gap-3 py-2 text-sm hover:text-primary">
                    <Position value={k.currentPosition} />
                    <span className="min-w-0 flex-1 truncate">{k.keyword}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{k.volume !== null ? `${k.volume}/mo` : ""} {k.targetUrl}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>

      <SectionCard title="Data sources" description="Where every number in the product comes from, and how much it can be trusted">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {PROVIDERS.map((p) => {
            const f = freshness[p.id];
            return (
              <div key={p.id} className="rounded-xl border border-border/40 bg-background/60 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold">{p.label}</span>
                  <TrustBadge trust={p.trust} />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{p.provides.join(" · ")}</p>
                <div className="mt-2 flex items-center gap-2 text-xs">
                  <Badge className={f?.ok ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" : "bg-muted text-muted-foreground"}>{f?.status}</Badge>
                  {f?.when && <span className="text-muted-foreground">Last: {f.when}</span>}
                </div>
              </div>
            );
          })}
        </div>
        <Link href="/rankmax-ai/settings#integrations" className="mt-3 inline-flex items-center gap-1 text-xs text-primary hover:underline">
          Integration settings <ArrowRight className="size-3" />
        </Link>
      </SectionCard>
</PanelListFilters>
    </div>
  );
}
