import Link from "next/link";
import { Clock, FileQuestion, Target, CalendarClock, Award, Trophy, Layers, AlertTriangle, CalendarX2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { CardContent } from "@/components/ui/card";
import StartTestButton from "@/components/products/evaliq/StartTestButton";
import { AssignmentStatusBadge, Chip, EmptyState, PassBadge } from "@/components/products/evaliq/OtsUi";
import { fmtPct, labelOf, PRIORITIES } from "@/lib/products/evaliq/constants";
import { formatDateTime } from "@/lib/utils";
import type { CandidateCard, Bucket } from "@/lib/products/evaliq/candidate";
import type { Channel, CandidatePaths } from "@/lib/products/evaliq/taker";

/** "My Tests" for every candidate type — the same cards in the OTS product and the Portal. */

const BUCKETS: { key: Bucket; title: string; empty: string }[] = [
  { key: "in_progress", title: "In Progress", empty: "" },
  { key: "open", title: "Pending — ready to start", empty: "Nothing waiting for you right now." },
  { key: "upcoming", title: "Upcoming", empty: "" },
  { key: "completed", title: "Completed", empty: "" },
  { key: "expired", title: "Expired", empty: "" },
];

export function TestCard({ card, channel, paths }: { card: CandidateCard; channel: Channel; paths: CandidatePaths }) {
  const remaining = Math.max(card.attemptsAllowed - card.attemptsUsed, 0);
  return (
    <GlassCard interactive={false}>
      <CardContent className="flex h-full flex-col gap-3 py-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <Link href={`${paths.tests}/${card.assignmentId}`} className="line-clamp-2 font-semibold text-foreground hover:text-primary">{card.testName}</Link>
            <p className="text-[11px] text-muted-foreground">{[card.testType, card.category].filter(Boolean).join(" · ")}</p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <AssignmentStatusBadge status={card.status} />
            {card.priority !== "normal" && <Chip tone={card.priority === "urgent" ? "rose" : card.priority === "high" ? "amber" : "slate"}>{labelOf(PRIORITIES, card.priority)}</Chip>}
          </div>
        </div>
        <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
          <div className="flex items-center gap-1.5 text-muted-foreground"><Clock className="size-3.5" /><span className="text-foreground">{card.durationMinutes ? `${card.durationMinutes} min` : "Untimed"}</span></div>
          <div className="flex items-center gap-1.5 text-muted-foreground"><FileQuestion className="size-3.5" /><span className="text-foreground">{card.questions ? `${card.questions} questions` : "—"}</span></div>
          <div className="flex items-center gap-1.5 text-muted-foreground"><Layers className="size-3.5" /><span className="text-foreground">{card.totalMarks !== null ? `${card.marksVary ? "≈" : ""}${card.totalMarks} marks` : "—"}</span></div>
          <div className="flex items-center gap-1.5 text-muted-foreground"><Target className="size-3.5" /><span className="text-foreground">{`Pass ${card.passing}`}</span></div>
          <div className="col-span-2 flex items-center gap-1.5 text-muted-foreground">
            <CalendarClock className="size-3.5" />
            <span className="text-foreground">{`${card.opensAt ? `From ${formatDateTime(card.opensAt)}` : "Available now"}${card.dueAt ? ` · due ${formatDateTime(card.dueAt)}` : ""}`}</span>
          </div>
          <div className="col-span-2 text-muted-foreground">{`Attempts: ${card.attemptsUsed} used · ${remaining} remaining`}</div>
        </dl>
        {card.result && (
          <div className="flex items-center gap-2 rounded-xl bg-muted/40 px-3 py-2 text-sm">
            <Trophy className="size-4 text-primary" />
            <span className="font-semibold">{`${card.result.score}/${card.result.total}`}</span>
            <span className="text-muted-foreground">{fmtPct(card.result.percentage)}</span>
            <PassBadge passed={card.result.passed} />
          </div>
        )}
        {!card.result && card.resultHiddenReason && <p className="text-xs text-muted-foreground">{card.resultHiddenReason}</p>}
        {card.blockedReason && card.bucket !== "completed" && (
          <p className="flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-400">
            {card.bucket === "expired" ? <CalendarX2 className="size-3.5" /> : <AlertTriangle className="size-3.5" />} {card.blockedReason}
          </p>
        )}
        {card.late && card.canStart && <p className="text-xs text-amber-700 dark:text-amber-400">Past the due date — late start allowed.</p>}
        <div className="mt-auto flex flex-wrap gap-2 pt-1">
          {card.canResume && <StartTestButton channel={channel} assignmentId={card.assignmentId} examBase={paths.exam} mode="continue" size="sm" />}
          {card.canStart && (
            <Button size="sm" nativeButton={false} render={<Link href={`${paths.tests}/${card.assignmentId}`} />}>
              {card.attemptsUsed > 0 ? "Retake Test" : "Start Test"}
            </Button>
          )}
          {card.latestAttemptId && !card.canResume && (
            <Button size="sm" variant="outline" nativeButton={false} render={<Link href={`${paths.results}/${card.latestAttemptId}`} />}>
              Review Answers
            </Button>
          )}
          {card.certificate && card.certificate.state !== "revoked" && (
            <Button size="sm" variant="outline" nativeButton={false} render={<Link href={paths.certificates} />}>
              <Award className="size-3.5" /> Certificate
            </Button>
          )}
        </div>
      </CardContent>
    </GlassCard>
  );
}

export default function CandidateTests({ cards, channel, paths, emptyHint }: { cards: CandidateCard[]; channel: Channel; paths: CandidatePaths; emptyHint?: string }) {
  if (cards.length === 0)
    return (
      <GlassCard interactive={false}>
        <CardContent>
          <EmptyState icon={<FileQuestion className="size-5" />} title="No tests assigned to you yet">{emptyHint ?? "When a test is assigned to you, it appears here and you get a notification."}</EmptyState>
        </CardContent>
      </GlassCard>
    );
  return (
    <div className="space-y-6">
      {BUCKETS.map((b) => {
        const list = cards.filter((c) => c.bucket === b.key);
        if (list.length === 0) return null;
        return (
          <section key={b.key} className="space-y-3">
            <h2 className="text-sm font-bold tracking-wide text-muted-foreground uppercase">{`${b.title} (${list.length})`}</h2>
            <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
              {list.map((c) => <TestCard key={c.assignmentId} card={c} channel={channel} paths={paths} />)}
            </div>
          </section>
        );
      })}
    </div>
  );
}
