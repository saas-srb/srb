import PanelTabs from "@/components/platform/panel/PanelTabs";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ExternalLink, Gauge, SearchCheck, Send, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import EditDialog from "@/components/products/playbook-ai/EditDialog";
import { PageHeader, SectionCard, ScoreRing, SeverityBadge, IssueStatusBadge, Stat, EmptyState, TrustBadge, Notice, fmtNum, fmtPct } from "@/components/products/rankmax-ai/SeoUi";
import PageSeoEditor from "@/components/products/rankmax-ai/PageSeoEditor";
import ContentAnalysisView from "@/components/products/rankmax-ai/ContentAnalysisView";
import JobButton from "@/components/products/rankmax-ai/JobButton";
import ActionButton from "@/components/products/rankmax-ai/ActionButton";
import { getViewer, can } from "@/lib/products/rankmax-ai/viewer";
import { getPage } from "@/lib/products/rankmax-ai/pages";
import { getSettings } from "@/lib/products/rankmax-ai/settings";
import { contentForPage } from "@/lib/products/rankmax-ai/content";
import { linkGraphFor } from "@/lib/products/rankmax-ai/links";
import { listIssues } from "@/lib/products/rankmax-ai/issues";
import { listAudit, AUDIT_ACTION_LABEL } from "@/lib/products/rankmax-ai/audit";
import { topQueries } from "@/lib/products/rankmax-ai/integrations/gsc";
import { cwvVerdict } from "@/lib/products/rankmax-ai/integrations/pagespeed";
import { saveSitemapSettingsAction, requestIndexingAction, deletePageAction } from "@/app/(products)/rankmax-ai/(protected)/actions";
import { companySiteUrl } from "@/lib/platform/tenancy/site-url";
import { formatDateTime, cn } from "@/lib/utils";

export const maxDuration = 300;

const TABS = [
  ["overview", "Overview"],
  ["on-page", "On-page SEO"],
  ["content", "Content SEO"],
  ["links", "Links"],
  ["history", "History"],
] as const;

export default async function PageDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const viewer = await getViewer();
  if (!viewer) redirect("/rankmax-ai/login");
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const page = await getPage(id);
  if (!page) notFound();
  const tab = TABS.some(([k]) => k === sp.tab) ? sp.tab! : "overview";
  const [settings, siteUrl] = await Promise.all([getSettings(), companySiteUrl()]);
  const c = page.crawl;
  const liveUrl = `${siteUrl}${page.path === "/" ? "" : page.path}`;

  return (
    <div className="space-y-4">
      <PageHeader
        title={page.path}
        crumbs={[{ label: "Pages", href: "/rankmax-ai/pages" }, { label: page.path }]}
        description={<>{c?.title || "Not crawled yet"} · <a href={liveUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">Open live page <ExternalLink className="size-3" /></a></>}
        actions={
          <>
            {can(viewer, "RUN_AUDIT") && <JobButton body={{ job: "pagespeed", paths: [page.path] }} label="Test PageSpeed" busyLabel="Testing…" icon={<Gauge className="size-3.5" data-icon="inline-start" />} successMessage="PageSpeed results saved" />}
            {can(viewer, "MANAGE_TECHNICAL_SEO") && settings.integrations.gsc.enabled && <JobButton body={{ job: "index-status", paths: [page.path] }} label="Check index status" busyLabel="Inspecting…" icon={<SearchCheck className="size-3.5" data-icon="inline-start" />} successMessage="Index status updated" />}
            {can(viewer, "MANAGE_TECHNICAL_SEO") && (
              <ActionButton
                action={async () => {
                  "use server";
                  return requestIndexingAction(page._id);
                }}
                success="Indexing notice sent to Google"
                confirm={{ title: "Notify Google Indexing API?", description: "Google officially supports the Indexing API only for JobPosting and livestream pages and may ignore other URLs. Use it for job pages; for others, rely on the sitemap." }}
              >
                <Send className="size-3.5" data-icon="inline-start" />
                Request indexing
              </ActionButton>
            )}
            {can(viewer, "DELETE") && (
              <ActionButton
                action={async () => {
                  "use server";
                  return deletePageAction(page._id);
                }}
                success="Page removed"
                redirectTo="/rankmax-ai/pages"
                variant="ghost"
                aria-label="Remove page"
                confirm={{ title: "Remove this page from the inventory?", description: page.override ? "Its live metadata override is removed too, so the page falls back to its code-defined metadata. A later audit re-adds the URL if it is still linked." : "A later audit re-adds the URL if it is still linked or in the sitemap." }}
              >
                <Trash2 className="size-3.5" />
              </ActionButton>
            )}
          </>
        }
      />

      <PanelTabs active={tab} tabs={TABS.map(([k, label]) => ({ key: k, label, href: `/rankmax-ai/pages/${page._id}?tab=${k}` }))} />

      {tab === "overview" && <Overview pageId={page._id} path={page.path} viewerCanSitemap={can(viewer, "MANAGE_SITEMAP")} />}
      {tab === "on-page" && (
        <PageSeoEditor
          pageId={page._id}
          path={page.path}
          siteUrl={siteUrl}
          canEdit={can(viewer, "MANAGE_ON_PAGE_SEO")}
          limits={settings.thresholds}
          initial={{
            title: page.override?.title ?? "",
            description: page.override?.description ?? "",
            canonical: page.override?.canonical ?? "",
            robots: page.override?.robots ? `${page.override.robots.index ? "index" : "noindex"},${page.override.robots.follow ? "follow" : "nofollow"}` : "",
            keywords: page.override?.keywords?.join(", ") ?? "",
            ogTitle: page.override?.og?.title ?? "",
            ogDescription: page.override?.og?.description ?? "",
            ogImage: page.override?.og?.image ?? "",
            twitterTitle: page.override?.twitter?.title ?? "",
            twitterDescription: page.override?.twitter?.description ?? "",
            twitterImage: page.override?.twitter?.image ?? "",
            focusKeyword: page.focusKeyword,
            secondaryKeywords: page.secondaryKeywords.join(", "),
            notes: page.notes,
          }}
          live={{
            title: page.override?.title ? "" : c?.title ?? "",
            description: page.override?.description ? "" : c?.description ?? "",
            canonical: c?.canonical ?? "",
            robots: c?.robotsMeta ?? "",
            ogTitle: c?.og.title ?? "",
            ogDescription: c?.og.description ?? "",
            ogImage: c?.og.image ?? "",
            twitterTitle: c?.twitter.title ?? "",
            twitterDescription: c?.twitter.description ?? "",
            twitterImage: c?.twitter.image ?? "",
          }}
        />
      )}
      {tab === "content" && (c ? <ContentAnalysisView a={await contentForPage(page)} /> : <Notice>Run an audit to analyse this page&apos;s content.</Notice>)}
      {tab === "links" && <Links path={page.path} />}
      {tab === "history" && <History path={page.path} />}
    </div>
  );

  async function Overview({ pageId, path, viewerCanSitemap }: { pageId: string; path: string; viewerCanSitemap: boolean }) {
    const [issues, queries] = await Promise.all([listIssues({ path, pageSize: 100, sortBy: "severity" }), topQueries(15, path)]);
    const perf = page!.performance;
    const verdict = perf ? cwvVerdict(perf) : null;
    return (
      <div className="space-y-4">
        <div className="grid gap-4 lg:grid-cols-3">
          <SectionCard title="Scores" className="lg:col-span-2" description={page!.lastCrawledAt ? `Crawled ${formatDateTime(page!.lastCrawledAt)}` : "Not crawled yet"}>
            <div className="flex flex-wrap justify-around gap-4">
              <ScoreRing score={page!.scores?.overall ?? null} label="Overall" />
              <ScoreRing score={page!.scores?.technical ?? null} label="Technical" />
              <ScoreRing score={page!.scores?.onPage ?? null} label="On-page" />
              <ScoreRing score={page!.scores?.content ?? null} label="Content" />
            </div>
          </SectionCard>
          <SectionCard
            title="Sitemap"
            action={
              viewerCanSitemap && (
                <EditDialog
                  trigger={<Button size="xs" variant="outline">Edit</Button>}
                  title="Sitemap settings"
                  description="Applies to the live /sitemap.xml."
                  fields={[
                    { key: "exclude", label: "Exclude this page from the sitemap", type: "checkbox" },
                    { key: "priority", label: "Priority (0.0–1.0)", type: "number", min: 0, max: 1, step: 0.1, hint: "Empty = the site's default" },
                    { key: "changeFrequency", label: "Change frequency", type: "select", noneLabel: "Default", options: ["always", "hourly", "daily", "weekly", "monthly", "yearly", "never"].map((x) => ({ value: x, label: x })) },
                  ]}
                  initial={{ exclude: !!page!.sitemap?.exclude, priority: page!.sitemap?.priority !== undefined ? String(page!.sitemap.priority) : "", changeFrequency: page!.sitemap?.changeFrequency ?? "" }}
                  onSubmit={async (v) => {
                    "use server";
                    return saveSitemapSettingsAction(pageId, v);
                  }}
                />
              )
            }
          >
            <dl className="grid grid-cols-2 gap-y-1.5 text-sm">
              <dt className="text-muted-foreground">Listed</dt>
              <dd>{page!.sitemap?.exclude ? <Badge className="bg-muted text-muted-foreground">Excluded</Badge> : page!.inSitemap ? "Yes" : "No"}</dd>
              <dt className="text-muted-foreground">Priority</dt>
              <dd>{page!.sitemap?.priority ?? "default"}</dd>
              <dt className="text-muted-foreground">Change freq.</dt>
              <dd>{page!.sitemap?.changeFrequency ?? "default"}</dd>
              <dt className="text-muted-foreground">Google index</dt>
              <dd>{page!.indexStatus ? <Badge className={page!.indexStatus.verdict === "PASS" ? "bg-emerald-500/15 text-emerald-700" : "bg-amber-500/15 text-amber-700"}>{page!.indexStatus.coverageState ?? page!.indexStatus.verdict}</Badge> : <span className="text-muted-foreground">Not inspected</span>}</dd>
            </dl>
          </SectionCard>
        </div>

        {c && (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
            <Stat label="HTTP" value={c.status || "ERR"} hint={c.redirectChain.length ? `${c.redirectChain.length} redirect(s)` : undefined} />
            <Stat label="Indexable" value={c.indexable ? "Yes" : "No"} hint={c.indexabilityReason ?? undefined} />
            <Stat label="Response" value={`${c.responseMs} ms`} />
            <Stat label="HTML" value={`${Math.round(c.htmlBytes / 1024)} KB`} />
            <Stat label="Words" value={c.wordCount} />
            <Stat label="Click depth" value={c.depth} />
            <Stat label="Links in / out" value={`${c.linksIn} / ${c.linksOut}`} hint={`${c.externalOut} external`} />
            <Stat label="Images" value={c.images} hint={c.imagesMissingAlt ? `${c.imagesMissingAlt} without alt` : "all have alt"} />
          </div>
        )}

        <div className="grid gap-4 lg:grid-cols-2">
          <SectionCard title={<span className="flex items-center gap-2">Search performance <TrustBadge trust="verified" label="GSC 28d" /></span>}>
            {page!.search ? (
              <>
                <div className="mb-3 grid grid-cols-4 gap-2">
                  <Stat label="Clicks" value={fmtNum(page!.search.clicks)} />
                  <Stat label="Impressions" value={fmtNum(page!.search.impressions)} />
                  <Stat label="CTR" value={fmtPct(page!.search.ctr)} />
                  <Stat label="Avg pos." value={page!.search.position.toFixed(1)} />
                </div>
                {queries.length > 0 && (
                  <Table>
                    <TableHeader><TableRow><TableHead>Query</TableHead><TableHead className="text-right">Clicks</TableHead><TableHead className="text-right">Impr.</TableHead><TableHead className="text-right">Pos.</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {queries.map((q) => (
                        <TableRow key={q.query}><TableCell className="max-w-[220px] truncate">{q.query}</TableCell><TableCell className="text-right tabular-nums">{q.clicks}</TableCell><TableCell className="text-right tabular-nums">{q.impressions}</TableCell><TableCell className="text-right tabular-nums">{q.position.toFixed(1)}</TableCell></TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </>
            ) : (
              <EmptyState title="No Search Console data">Connect Search Console in Settings and sync.</EmptyState>
            )}
          </SectionCard>
          <SectionCard title={<span className="flex items-center gap-2">Performance <TrustBadge trust="measured" label="PageSpeed" /></span>} description={perf ? `${perf.strategy} · ${formatDateTime(perf.checkedAt)}` : undefined}>
            {perf ? (
              perf.error ? <Notice tone="error">{perf.error}</Notice> : (
                <div className="space-y-2">
                  <div className="grid grid-cols-3 gap-2">
                    <Stat label="Score" value={perf.score ?? "—"} />
                    <Stat label="LCP" value={perf.lcpMs !== null ? `${(perf.lcpMs / 1000).toFixed(2)}s` : "—"} />
                    <Stat label="CLS" value={perf.cls ?? "—"} />
                    <Stat label="TBT" value={perf.tbtMs !== null ? `${Math.round(perf.tbtMs)}ms` : "—"} />
                    <Stat label="FCP" value={perf.fcpMs !== null ? `${(perf.fcpMs / 1000).toFixed(2)}s` : "—"} />
                    <Stat label="Real users" value={perf.fieldCategory ?? "—"} />
                  </div>
                  {verdict && verdict.details.length > 1 && <p className="text-xs text-muted-foreground">{verdict.details.join(" · ")}</p>}
                </div>
              )
            ) : (
              <EmptyState title="Not tested yet">Use “Test PageSpeed” above.</EmptyState>
            )}
          </SectionCard>
        </div>

        <SectionCard title={`Issues on this page (${issues.total})`} action={<Link href={`/rankmax-ai/issues?path=${encodeURIComponent(path)}`} className="text-xs text-primary hover:underline">Open in Issues</Link>}>
          {issues.items.length === 0 ? <EmptyState title="No issues recorded for this page" /> : (
            <ul className="divide-y divide-border/40">
              {issues.items.map((i) => (
                <li key={i._id}>
                  <Link href={`/rankmax-ai/issues/${i._id}`} className="flex items-center gap-3 py-2 text-sm hover:text-primary">
                    <SeverityBadge severity={i.severity} />
                    <span className="min-w-0 flex-1 truncate">{i.title}</span>
                    <IssueStatusBadge status={i.status} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>
    );
  }
}

async function Links({ path }: { path: string }) {
  const { incoming, outgoing } = await linkGraphFor(path);
  const internalOut = outgoing.filter((l) => l.internal);
  const externalOut = outgoing.filter((l) => !l.internal);
  const statusBadge = (s: number | null) => (s === null ? <span className="text-xs text-muted-foreground">—</span> : <Badge className={s >= 200 && s < 300 ? "bg-emerald-500/15 text-emerald-700" : s >= 300 && s < 400 ? "bg-sky-500/15 text-sky-700" : "bg-rose-500/15 text-rose-600"}>{s || "ERR"}</Badge>);
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <SectionCard title={`Incoming internal links (${incoming.length})`} description="Pages that link here, with anchor text">
        {incoming.length === 0 ? <EmptyState title="Orphan page — nothing links here" /> : (
          <div className="max-h-[60vh] overflow-auto">
            <Table>
              <TableHeader><TableRow><TableHead>From</TableHead><TableHead>Anchor</TableHead></TableRow></TableHeader>
              <TableBody>{incoming.map((l) => <TableRow key={l._id}><TableCell>{l.from}</TableCell><TableCell className="max-w-[220px] truncate text-xs">{l.anchor || <em className="text-muted-foreground">(no text)</em>}{l.nofollow && <Badge className="ml-1 h-4 px-1 text-[9px]">nofollow</Badge>}</TableCell></TableRow>)}</TableBody>
            </Table>
          </div>
        )}
      </SectionCard>
      <SectionCard title={`Outgoing links (${internalOut.length} internal · ${externalOut.length} external)`}>
        {outgoing.length === 0 ? <EmptyState title="No links out" /> : (
          <div className="max-h-[60vh] overflow-auto">
            <Table>
              <TableHeader><TableRow><TableHead>To</TableHead><TableHead>Anchor</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
              <TableBody>{outgoing.map((l) => <TableRow key={l._id}><TableCell className="max-w-[240px] truncate">{l.internal ? l.to : <span className="text-muted-foreground">{l.to}</span>}</TableCell><TableCell className="max-w-[180px] truncate text-xs">{l.anchor}{l.nofollow && <Badge className="ml-1 h-4 px-1 text-[9px]">nofollow</Badge>}</TableCell><TableCell>{statusBadge(l.status)}{l.redirects && <Badge className="ml-1 bg-sky-500/15 text-sky-700">redirects</Badge>}</TableCell></TableRow>)}</TableBody>
            </Table>
          </div>
        )}
      </SectionCard>
    </div>
  );
}

async function History({ path }: { path: string }) {
  const { items } = await listAudit({ path, pageSize: 100 });
  return (
    <SectionCard title="Change history" description="Metadata, sitemap and other SEO changes to this page">
      {items.length === 0 ? <EmptyState title="No changes recorded" /> : (
        <Table>
          <TableHeader><TableRow><TableHead>When</TableHead><TableHead>Who</TableHead><TableHead>Action</TableHead><TableHead>Details</TableHead></TableRow></TableHeader>
          <TableBody>
            {items.map((a) => (
              <TableRow key={a._id}>
                <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{formatDateTime(a.createdAt)}</TableCell>
                <TableCell className="text-xs">{a.actorEmail}</TableCell>
                <TableCell><Badge className="bg-primary/10 text-primary">{AUDIT_ACTION_LABEL[a.action]} {a.entity}</Badge></TableCell>
                <TableCell className="max-w-lg whitespace-normal text-xs text-muted-foreground">{a.summary}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </SectionCard>
  );
}
