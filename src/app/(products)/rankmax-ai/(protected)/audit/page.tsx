import PanelListFilters from "@/components/platform/panel/PanelListFilters";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ScanSearch } from "lucide-react";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { PageHeader, SectionCard, SeverityBadge, CategoryBadge, ScoreBadge, EmptyState } from "@/components/products/rankmax-ai/SeoUi";
import AuditRunSummary from "@/components/products/rankmax-ai/AuditRunSummary";
import JobButton from "@/components/products/rankmax-ai/JobButton";
import { getViewer, can } from "@/lib/products/rankmax-ai/viewer";
import { listRuns } from "@/lib/products/rankmax-ai/crawler";
import { COLLECTIONS, seoCollection } from "@/lib/products/rankmax-ai/db";
import { CHECKS, isCheckId, SEVERITY_META, type Severity } from "@/lib/products/rankmax-ai/checks";
import { getSettings } from "@/lib/products/rankmax-ai/settings";
import type { SeoIssue } from "@/lib/products/rankmax-ai/types";
import { formatDateTime } from "@/lib/utils";

export const maxDuration = 300;

const RANK: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3 };

export default async function AuditPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/rankmax-ai/login");
  const [runs, settings, byCheck] = await Promise.all([
    listRuns(30),
    getSettings(),
    (await seoCollection<SeoIssue>(COLLECTIONS.issues))
      .aggregate<{ _id: string; pages: number }>([{ $match: { status: { $in: ["open", "in_progress"] }, source: { $in: ["audit", "pagespeed"] } } }, { $group: { _id: "$checkId", pages: { $sum: 1 } } }])
      .toArray(),
  ]);
  const latest = runs.find((r) => r.status !== "running") ?? null;
  const running = runs.find((r) => r.status === "running");
  const checks = byCheck.filter((c) => isCheckId(c._id)).map((c) => ({ ...CHECKS[c._id as keyof typeof CHECKS], id: c._id, pages: c.pages })).sort((a, b) => RANK[a.severity] - RANK[b.severity] || b.pages - a.pages);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Website Audit"
        crumbs={[{ label: "Website Audit" }]}
        description={<>Crawls {settings.siteOrigin} (up to {settings.crawl.maxPages} pages) and checks {Object.keys(CHECKS).length} technical, on-page, content, link, mobile, performance and structured-data rules. Scheduled: {settings.schedule.auditFrequency}.</>}
        actions={can(viewer, "RUN_AUDIT") && <JobButton endpoint="/api/rankmax-ai/audit" label="Run audit now" busyLabel="Auditing… (up to a few minutes)" icon={<ScanSearch className="size-3.5" data-icon="inline-start" />} variant="default" disabled={!!running} successMessage="Audit complete" />}
      />
      <PanelListFilters>
{running && <Badge className="bg-sky-500/15 text-sky-700">An audit started {formatDateTime(running.startedAt)} is running…</Badge>}

      {latest ? <AuditRunSummary run={latest} /> : <SectionCard title="No audits yet"><EmptyState icon={<ScanSearch className="size-5" />} title="Run the first audit">The crawler reads robots.txt and the sitemap, then follows internal links.</EmptyState></SectionCard>}

      <SectionCard title="Findings by check" description="Open problems grouped by rule, with the fix. Click a row to see the affected URLs.">
        {checks.length === 0 ? (
          <EmptyState title="No open findings" />
        ) : (
          <div className="max-h-[70vh] overflow-auto">
            <Table>
              <TableHeader>
                <TableRow><TableHead>Severity</TableHead><TableHead>Check</TableHead><TableHead>Category</TableHead><TableHead className="text-right">URLs</TableHead><TableHead>Recommendation</TableHead></TableRow>
              </TableHeader>
              <TableBody>
                {checks.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell><SeverityBadge severity={c.severity} /></TableCell>
                    <TableCell className="font-medium"><Link href={`/rankmax-ai/issues?status=active&checkId=${c.id}`} className="hover:underline">{c.title}</Link></TableCell>
                    <TableCell><CategoryBadge category={c.category} /></TableCell>
                    <TableCell className="text-right tabular-nums">{c.pages}</TableCell>
                    <TableCell className="max-w-md whitespace-normal text-xs text-muted-foreground">{c.recommendation}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </SectionCard>

      <SectionCard title="Audit history">
        <div className="max-h-[50vh] overflow-auto">
          <Table>
            <TableHeader>
              <TableRow><TableHead>Started</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Pages</TableHead><TableHead>Score</TableHead>{(["critical", "high", "medium", "low"] as const).map((s) => <TableHead key={s} className="text-right">{SEVERITY_META[s].label}</TableHead>)}<TableHead className="text-right">New / fixed</TableHead><TableHead>By</TableHead></TableRow>
            </TableHeader>
            <TableBody>
              {runs.length === 0 && <TableRow><TableCell colSpan={10} className="text-center text-muted-foreground">No runs yet.</TableCell></TableRow>}
              {runs.map((r) => (
                <TableRow key={r._id}>
                  <TableCell><Link href={`/rankmax-ai/audit/${r._id}`} className="font-medium hover:underline">{formatDateTime(r.startedAt)}</Link></TableCell>
                  <TableCell><Badge className={r.status === "completed" ? "bg-emerald-500/15 text-emerald-700" : r.status === "failed" ? "bg-rose-500/15 text-rose-600" : "bg-sky-500/15 text-sky-700"}>{r.status}</Badge></TableCell>
                  <TableCell className="text-right tabular-nums">{r.pagesCrawled}</TableCell>
                  <TableCell><ScoreBadge score={r.scores?.overall} /></TableCell>
                  {(["critical", "high", "medium", "low"] as const).map((s) => <TableCell key={s} className="text-right tabular-nums">{r.issueCounts[s]}</TableCell>)}
                  <TableCell className="text-right tabular-nums">{r.newIssues} / {r.resolvedIssues}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{r.actorEmail ?? (r.trigger === "schedule" ? "Schedule" : "—")}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </SectionCard>
</PanelListFilters>
    </div>
  );
}
