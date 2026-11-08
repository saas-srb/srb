import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { SectionCard, ScoreRing, Notice } from "@/components/products/rankmax-ai/SeoUi";
import { CATEGORIES, CATEGORY_LABEL, SEVERITY_META, SEVERITIES } from "@/lib/products/rankmax-ai/checks";
import type { CrawlRun } from "@/lib/products/rankmax-ai/types";
import { formatDateTime } from "@/lib/utils";

/** Severity tiles (incl. Passed), scores, category counts and crawler notes for one audit run. */
export default function AuditRunSummary({ run }: { run: CrawlRun }) {
  const duration = run.finishedAt ? Math.round((run.finishedAt.getTime() - run.startedAt.getTime()) / 1000) : null;
  return (
    <div className="space-y-4">
      {run.status === "failed" && <Notice tone="error">This run failed: {run.error}</Notice>}
      {run.status === "running" && <Notice tone="info">This audit is still running.</Notice>}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {SEVERITIES.map((s) => (
          <Link key={s} href={`/rankmax-ai/issues?status=active&severity=${s}`} className="rounded-2xl border border-border/40 bg-card/90 p-4 transition-colors hover:border-primary/40">
            <Badge className={SEVERITY_META[s].className}>{SEVERITY_META[s].label}</Badge>
            <p className="mt-2 text-2xl font-black tabular-nums">{run.issueCounts[s]}</p>
            <p className="text-[11px] text-muted-foreground">findings</p>
          </Link>
        ))}
        <div className="rounded-2xl border border-border/40 bg-card/90 p-4">
          <Badge className={SEVERITY_META.passed.className}>Passed</Badge>
          <p className="mt-2 text-2xl font-black tabular-nums">{run.passedChecks}</p>
          <p className="text-[11px] text-muted-foreground">of {run.totalChecks} checks</p>
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <SectionCard title="Scores" className="lg:col-span-2">
          <div className="flex flex-wrap items-center justify-around gap-4">
            <ScoreRing score={run.scores?.overall ?? null} label="Overall" />
            <ScoreRing score={run.scores?.technical ?? null} label="Technical" />
            <ScoreRing score={run.scores?.onPage ?? null} label="On-page" />
            <ScoreRing score={run.scores?.content ?? null} label="Content" />
          </div>
        </SectionCard>
        <SectionCard title="Run">
          <dl className="grid grid-cols-2 gap-y-1.5 text-sm">
            <dt className="text-muted-foreground">Started</dt>
            <dd>{formatDateTime(run.startedAt)}</dd>
            <dt className="text-muted-foreground">Duration</dt>
            <dd>{duration !== null ? `${duration}s` : "—"}</dd>
            <dt className="text-muted-foreground">Origin</dt>
            <dd className="truncate">{run.origin}</dd>
            <dt className="text-muted-foreground">Pages</dt>
            <dd>{run.pagesCrawled} crawled · {run.indexablePages} indexable</dd>
            <dt className="text-muted-foreground">Sitemap URLs</dt>
            <dd>{run.sitemapUrls}</dd>
            <dt className="text-muted-foreground">External links</dt>
            <dd>{run.externalChecked} checked</dd>
            <dt className="text-muted-foreground">Issues</dt>
            <dd>{run.newIssues} new · {run.resolvedIssues} fixed</dd>
            <dt className="text-muted-foreground">Triggered by</dt>
            <dd className="truncate">{run.actorEmail ?? (run.trigger === "schedule" ? "Schedule" : "—")}</dd>
          </dl>
        </SectionCard>
      </div>
      <div className="flex flex-wrap gap-2">
        {CATEGORIES.filter((c) => run.byCategory[c]).map((c) => (
          <Link key={c} href={`/rankmax-ai/issues?status=active&category=${c}`}>
            <Badge variant="outline" className="h-7 px-3 hover:border-primary/40">
              {CATEGORY_LABEL[c]} · {run.byCategory[c]}
            </Badge>
          </Link>
        ))}
      </div>
      {run.notes.length > 0 && (
        <Notice tone="warn">
          <ul className="list-disc pl-4">
            {run.notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </Notice>
      )}
    </div>
  );
}
