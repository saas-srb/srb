import Link from "next/link";
import { AlertTriangle, ArrowRight, BookOpenCheck, CheckCircle2, Clock, Download, FilePlus2, FileText, Library, Palette, Percent, Send, Target } from "lucide-react";
import PanelDashboardHeader from "@/components/platform/panel/PanelDashboardHeader";
import KpiGrid from "@/components/products/dealflow-ai/KpiGrid";
import KpiLink from "@/components/products/playbook-ai/KpiLink";
import ExecutiveSection from "@/components/products/commandos/ExecutiveSection";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Donut, Histogram, MiniBars, StackedBars, TrendLine } from "@/components/dashboard-kit/Charts";
import { AttentionCard, BarList, DASH_RANGE_CHIPS, Funnel, Section, SectionDivider } from "@/components/dashboard-kit/Blocks";
import PanelFilterBar from "@/components/platform/panel/PanelFilterBar";
import { PB_SOURCE_OPTIONS, PB_STATUS_OPTIONS, PB_TYPE_OPTIONS } from "@/lib/products/playbook-ai/dashboard/filters";
import { nf } from "@/lib/products/playbook-ai/dashboard/format";
import type { AttentionItem, CountItem, DashboardData, Tile } from "@/lib/products/playbook-ai/dashboard/types";

export interface BrandStatusItem { label: string; ok: boolean; hint: string }


const ist = (ms: number): string => new Date(ms).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: true });
const rel = (ms: number, now: number): string => {
  const m = Math.max(Math.round((now - ms) / 60000), 0);
  return m < 60 ? `${m || 1} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`;
};

const TILE_ICON: Record<string, React.ReactNode> = {
  sops: <BookOpenCheck className="size-4" />, documents: <FileText className="size-4" />, kpis: <Target className="size-4" />, drafts: <FilePlus2 className="size-4" />,
  sent: <Send className="size-4" />, signed: <CheckCircle2 className="size-4" />, turnaround: <Clock className="size-4" />, completion: <Percent className="size-4" />,
};

/** The platform's shared KPI card (icon tile, label, value, change badge) for one figure. */
function StatTile({ t }: { t: Tile }) {
  const label = t.key === "sops" || t.key === "documents" || t.key === "kpis" ? `${t.label} · ${t.note}` : t.label;
  const value = t.value === null ? <span className="text-muted-foreground">No data</span> : t.format === "days" ? <span>{nf.format(t.value)} d</span> : t.format === "pct" ? <span>{nf.format(t.value)}%</span> : t.value;
  return <KpiLink href={t.href} label={label} value={value} icon={TILE_ICON[t.key]} trend={t.deltaPct} trendInvert={t.good === "down"} tone={t.key === "completion" && t.value !== null ? (t.value >= 70 ? "up" : t.value < 40 ? "down" : undefined) : undefined} />;
}

export default function DashboardView({ data, brand, canCreate, rangeHrefBase = "/playbook-ai/dashboard", csvHref, custom }: {
  data: DashboardData; brand: BrandStatusItem[]; canCreate: boolean; rangeHrefBase?: string; csvHref?: string; custom?: { from: string; to: string };
}) {
  const r = data.range;
  const brandOk = brand.every((b) => b.ok);
  const o = data.options;
  const bar = (
    <PanelFilterBar
      description="Search and segment your documents, SOPs and KPI sheets"
      ranges={DASH_RANGE_CHIPS}
      fields={[
        { key: "q", label: "Search", type: "search", placeholder: "Title or author" },
        { key: "type", label: "Type", type: "select", options: PB_TYPE_OPTIONS, allLabel: "All" },
        { key: "category", label: "Category", type: "select", options: o.categories.map((c) => ({ value: c, label: c })), allLabel: "All" },
        { key: "department", label: "Department", type: "select", options: o.departments.map((c) => ({ value: c, label: c })), allLabel: "All" },
        { key: "status", label: "Status", type: "select", options: PB_STATUS_OPTIONS, allLabel: "All" },
        { key: "creator", label: "Created by", type: "select", options: o.creators.map((c) => ({ value: c.id, label: c.name })), allLabel: "Everyone" },
        { key: "source", label: "Source", type: "select", options: PB_SOURCE_OPTIONS, allLabel: "All" },
      ]}
    />
  );

  return (
    <div className="min-w-0 space-y-4">
      <PanelDashboardHeader
        breadcrumbs={[{ label: "Playbook", href: "/playbook-ai" }, { label: "Dashboard" }]}
        title="Dashboard"
        description={<>SOPs, documents and KPI sheets at a glance. <strong className="font-semibold text-foreground">{r.label}</strong>, compared with the {r.days} days before. {data.scope === "all" ? "Showing the whole company." : "Showing your own items only."}</>}
        actions={<>
          {csvHref && <a href={csvHref} className={buttonVariants({ size: "sm", variant: "outline" })}><Download className="size-3.5" data-icon="inline-start" aria-hidden />Export CSV</a>}
          {canCreate && <Link href="/playbook-ai/documents/new" className={buttonVariants({ size: "sm" })}><FilePlus2 className="size-3.5" data-icon="inline-start" aria-hidden />New document</Link>}
        </>}
        filters={bar}
      />

      {data.noMatch && (
        <Section title="No match">
          <p className="text-sm text-muted-foreground">Nothing matches these filters in this period. Change the range or use Clear filters.</p>
        </Section>
      )}

      {data.empty && !data.noMatch && (
        <GlassCard interactive={false}>
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <BookOpenCheck className="size-8 text-primary" aria-hidden />
            <p className="text-base font-semibold">Nothing here yet</p>
            <p className="max-w-md text-sm text-muted-foreground">Create your first SOP, document or KPI sheet, or start from the library. The figures and charts fill in as your team works.</p>
            <div className="flex flex-wrap justify-center gap-2">
              {canCreate && <Link href="/playbook-ai/sops/new" className={buttonVariants({ size: "sm" })}>Create an SOP</Link>}
              {canCreate && <Link href="/playbook-ai/documents/new" className={buttonVariants({ size: "sm", variant: "outline" })}>Create a document</Link>}
              {canCreate && <Link href="/playbook-ai/kpis/new" className={buttonVariants({ size: "sm", variant: "outline" })}>Create a KPI sheet</Link>}
              <Link href="/playbook-ai/documents/library" className={buttonVariants({ size: "sm", variant: "ghost" })}>Open the Document Library</Link>
            </div>
          </CardContent>
        </GlassCard>
      )}

      <ExecutiveSection title="Key figures" description={`${r.label}, with the change against the ${r.days} days before.`}>
        <KpiGrid>{data.tiles.map((t) => <StatTile key={t.key} t={t} />)}</KpiGrid>
      </ExecutiveSection>

      <SectionDivider label="Trends and breakdowns" />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Section title="Created over time" description={`New SOPs, documents and KPI sheets per ${data.created.granularity}`} className="lg:col-span-2"><StackedBars points={data.created.points} series={[{ key: "sop", name: "SOPs", color: "#6366f1" }, { key: "document", name: "Documents", color: "#06b6d4" }, { key: "kpi", name: "KPI sheets", color: "#f59e0b" }]} label="Created over time" noun="items created" emptyText="Nothing was created in this period." /></Section>
        <Section title="Signing funnel" description="How far the items created in this period got"><Funnel steps={data.funnel} /></Section>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Section title="By category" description="Top 10 in this period"><BarList items={data.byCategory} empty="Nothing created in this period." /></Section>
        <Section title="By department or role" description="Where the work is"><Donut data={data.byDepartment} label="Items by department" emptyText="Nothing created in this period." /></Section>
        <Section title="Top templates" description="Library and template use"><BarList items={data.topTemplates} empty="No library or template was used in this period." /></Section>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Section title="Time to sign" description={data.turnaround.count ? `${data.turnaround.count} signed · average ${data.turnaround.avgDays} d · median ${data.turnaround.medianDays} d` : "How long signers take"}>
          <Histogram data={data.turnaround.buckets} label="Signing turnaround" emptyText="Nothing was signed in this period." />
        </Section>
        <Section title="Turnaround trend" description="Average days from sent to signed"><TrendLine data={data.turnaround.trend} unit="days" label="Average time to sign" emptyText="Nothing was signed in this period." /></Section>
        <Section title="Library or from scratch" description="Where new items start"><Donut data={[{ label: "From the library or a template", value: data.source.fromLibrary }, { label: "From scratch", value: data.source.scratch }]} label="Source of new items" emptyText="Nothing created in this period." /></Section>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Section title="AI use" description="Edit with AI and drafting runs" className="lg:col-span-1">
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div><dt className="text-xs text-muted-foreground">AI runs</dt><dd className="text-xl font-black tabular-nums">{nf.format(data.ai.runs)}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Items with AI help</dt><dd className="text-xl font-black tabular-nums">{data.ai.sharePct === null ? "No data" : `${data.ai.sharePct}%`}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Proposals / failed</dt><dd className="font-semibold tabular-nums">{nf.format(data.ai.proposed)} / {nf.format(data.ai.failed)}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Tokens in / out</dt><dd className="font-semibold tabular-nums">{nf.format(data.ai.inputTokens)} / {nf.format(data.ai.outputTokens)}</dd></div>
          </dl>
          <div className="mt-3"><MiniBars data={data.ai.series} label="AI runs over time" /></div>
          <p className="mt-1 text-[11px] text-muted-foreground">{data.ai.docsWithAi} of {data.ai.docsActive} items worked on in this period had AI help. Credits are not tracked per run, so tokens are shown.</p>
        </Section>
        <Section title="Versions per item" description="How often items are saved as versions"><Histogram data={data.versions} label="Versions per item" emptyText="No items yet." /></Section>
        <Section title="Downloads" description="PDF and Word exports in this period">
          <Donut data={[{ label: "PDF", value: data.exports.pdf }, { label: "Word", value: data.exports.docx }, { label: "Other", value: data.exports.other }].filter((x) => x.value > 0)} label="Exports by format" emptyText="Nothing was downloaded in this period." />
        </Section>
      </div>

      <SectionDivider label="Needs attention" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
        <AttentionCard title="Drafts untouched for 14+ days" empty="No stale drafts." items={data.attention.staleDrafts} tone="warn" />
        <AttentionCard title="Waiting for a signature (over 7 days or expired)" empty="Nothing is overdue." items={data.attention.awaitingSignature} tone="warn" />
        <AttentionCard title="Legal review not yet confirmed" empty="No legal document is waiting." items={data.attention.legalPending} tone="warn" />
        <AttentionCard title="SOPs not reviewed in 12 months" empty="All SOPs were reviewed within a year." items={data.attention.sopsDueReview} tone="info" />
        <AttentionCard title="Employees with unsigned letters" empty="No employee letter is waiting." items={data.attention.employeesUnsigned} tone="info" />
        <GlassCard interactive={false}>
          <CardHeader className="pb-1"><CardTitle className="flex items-center gap-2 text-sm font-bold"><Palette className="size-4 text-primary" aria-hidden />Brand and letterhead</CardTitle></CardHeader>
          <CardContent>
            <ul className="space-y-1.5 text-sm">
              {brand.map((b) => <li key={b.label} className="flex items-start gap-2"><CheckCircle2 className={cn("mt-0.5 size-4 shrink-0", b.ok ? "text-emerald-500" : "text-muted-foreground/40")} aria-hidden /><span><span className={b.ok ? "" : "font-medium"}>{b.label}</span>{!b.ok && <span className="block text-xs text-muted-foreground">{b.hint}</span>}</span></li>)}
            </ul>
            <Link href="/playbook-ai/brand" className={cn(buttonVariants({ size: "sm", variant: brandOk ? "outline" : "default" }), "mt-3")}>{brandOk ? "Review the brand" : "Finish the brand setup"}</Link>
          </CardContent>
        </GlassCard>
      </div>

      <SectionDivider label="Activity" />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Section title="Recent activity" description="Latest actions" className="lg:col-span-2">
          {data.activity.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">No activity yet.</p> : (
            <ul className="divide-y divide-border/50">
              {data.activity.map((a, i) => (
                <li key={i} className="flex items-start justify-between gap-3 py-2 text-sm">
                  <span className="min-w-0"><span className="font-medium">{a.actor}</span> <span className="text-muted-foreground">{a.summary}</span>{a.documentId && <> · <Link className="text-primary hover:underline" href={`/playbook-ai/documents/${encodeURIComponent(a.documentId)}`}>open</Link></>}</span>
                  <time className="shrink-0 text-xs text-muted-foreground" dateTime={new Date(a.at).toISOString()} title={ist(a.at)}>{rel(a.at, data.generatedAt)}</time>
                </li>
              ))}
            </ul>
          )}
        </Section>
        <Section title={data.scope === "all" ? "Team" : "You"} description="Created and sent in this period">
          {data.leaderboard.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">Nobody has created or sent anything in this period.</p> : (
            <table className="w-full text-sm">
              <thead className="text-left text-[11px] uppercase tracking-wide text-muted-foreground"><tr><th className="py-1 font-semibold">Person</th><th className="py-1 text-right font-semibold">Created</th><th className="py-1 text-right font-semibold">Sent</th><th className="py-1 text-right font-semibold">Signed</th></tr></thead>
              <tbody className="divide-y divide-border/50">
                {data.leaderboard.map((l, i) => <tr key={l.userId}><td className="py-1.5"><span className="mr-1.5 text-xs text-muted-foreground">{i + 1}</span>{l.name}</td><td className="py-1.5 text-right tabular-nums">{nf.format(l.created)}</td><td className="py-1.5 text-right tabular-nums">{nf.format(l.sent)}</td><td className="py-1.5 text-right tabular-nums">{nf.format(l.signed)}</td></tr>)}
              </tbody>
            </table>
          )}
        </Section>
      </div>

      <Section title="Quick actions">
        <div className="flex flex-wrap gap-2">
          {canCreate && <Link href="/playbook-ai/sops/new" className={buttonVariants({ size: "sm" })}><FilePlus2 className="size-3.5" data-icon="inline-start" aria-hidden />Create SOP</Link>}
          {canCreate && <Link href="/playbook-ai/documents/new" className={buttonVariants({ size: "sm", variant: "outline" })}><FileText className="size-3.5" data-icon="inline-start" aria-hidden />Create document</Link>}
          {canCreate && <Link href="/playbook-ai/kpis/new" className={buttonVariants({ size: "sm", variant: "outline" })}><Target className="size-3.5" data-icon="inline-start" aria-hidden />Create KPI sheet</Link>}
          <Link href="/playbook-ai/documents/library" className={buttonVariants({ size: "sm", variant: "outline" })}><Library className="size-3.5" data-icon="inline-start" aria-hidden />Document Library</Link>
        </div>
      </Section>
    </div>
  );
}
