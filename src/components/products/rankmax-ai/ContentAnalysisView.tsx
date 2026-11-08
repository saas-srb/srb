import { Check, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { SectionCard, ScoreRing, Stat } from "@/components/products/rankmax-ai/SeoUi";
import type { ContentAnalysis } from "@/lib/products/rankmax-ai/content";

/** Full content-SEO breakdown for one page. */
export default function ContentAnalysisView({ a }: { a: ContentAnalysis }) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-[auto_1fr]">
        <SectionCard title="Content score">
          <ScoreRing score={a.score} label={a.focusKeyword ? `for “${a.focusKeyword}”` : "no focus keyword"} size={120} />
        </SectionCard>
        <SectionCard title="Recommendations" description="Ordered roughly by impact">
          {a.recommendations.length === 0 ? (
            <p className="text-sm text-emerald-600">No content issues found for this page.</p>
          ) : (
            <ol className="list-decimal space-y-1 pl-5 text-sm">
              {a.recommendations.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ol>
          )}
        </SectionCard>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
        <Stat label="Words" value={a.wordCount} />
        <Stat label="Readability" value={a.readability ?? "—"} hint={a.readabilityLabel} />
        <Stat label="Keyword uses" value={a.focusKeyword ? a.occurrences : "—"} />
        <Stat label="Density" value={a.density !== null ? `${a.density}%` : "—"} />
        <Stat label="H1 / H2 / H3" value={`${a.structure.h1}/${a.structure.h2}/${a.structure.h3}`} />
        <Stat label="Links in / out" value={`${a.linksIn}/${a.linksOut}`} />
        <Stat label="Last updated" value={a.freshness.days !== null ? `${a.freshness.days}d` : "—"} hint={a.freshness.date?.slice(0, 10)} />
        <Stat label="Intent" value={a.intents.length ? a.intents.join(", ") : "—"} />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <SectionCard title="Keyword placement">
          {a.placements.length === 0 ? (
            <p className="text-sm text-muted-foreground">Set a focus keyword (On-page tab) to check placement.</p>
          ) : (
            <ul className="space-y-1.5 text-sm">
              {a.placements.map((p) => (
                <li key={p.label} className="flex items-center gap-2">
                  {p.ok ? <Check className="size-4 text-emerald-600" /> : <X className="size-4 text-rose-600" />}
                  {p.label}
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
        <SectionCard title="Keyword coverage" description="Secondary, related and same-cluster terms">
          {a.coverage.length === 0 ? (
            <p className="text-sm text-muted-foreground">No secondary or related keywords are linked to this page yet.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {a.coverage.map((t) => (
                <Badge key={t.term} className={t.present ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" : "bg-rose-500/10 text-rose-600"} title={t.source}>
                  {t.present ? "✓" : "✗"} {t.term}
                </Badge>
              ))}
            </div>
          )}
        </SectionCard>
        <SectionCard title="Featured snippet opportunities">
          {a.snippetOpportunities.length === 0 ? (
            <p className="text-sm text-muted-foreground">None detected. Question-style H2s and keywords ranking #2–10 create opportunities.</p>
          ) : (
            <ul className="list-disc space-y-1 pl-4 text-sm">
              {a.snippetOpportunities.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>
      <SectionCard title="Heading structure" description={a.structure.orderOk ? "Heading levels are in order." : "Headings skip a level somewhere."}>
        {a.structure.outline.length === 0 ? (
          <p className="text-sm text-muted-foreground">No headings found.</p>
        ) : (
          <ul className="space-y-0.5 text-sm">
            {a.structure.outline.map((h, i) => (
              <li key={`${h.level}-${i}`} style={{ paddingLeft: (h.level - 1) * 16 }} className="flex items-center gap-2">
                <Badge variant="outline" className="h-4 px-1 text-[9px]">H{h.level}</Badge>
                <span className="truncate">{h.text || <em className="text-muted-foreground">(empty)</em>}</span>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}
