import Link from "next/link";
import { ChevronRight, ListChecks } from "lucide-react";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { TodayWork } from "@/lib/products/cashflow-ai/home/today-work";

/** Home: "Today's work" from My work. Shows nothing when the work could not be read. */
export default function TodayWorkCard({ work }: { work: TodayWork | null }) {
  if (!work) return null;
  if (!work.started) {
    return (
      <GlassCard interactive={false}>
        <CardContent className="flex flex-wrap items-center gap-3 pt-6">
          <ListChecks className="size-5 shrink-0 text-primary" />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium">Start your work plan</div>
            <div className="text-xs text-muted-foreground">What to do every day, week, month and year, step by step, so nothing is missed.</div>
          </div>
          <Link href="/cashflow-ai/work" className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">Open My work <ChevronRight className="size-4" /></Link>
        </CardContent>
      </GlassCard>
    );
  }
  return (
    <GlassCard interactive={false}>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center justify-between gap-2">
          <span>Today&apos;s work</span>
          <span className="flex items-center gap-3 text-sm font-normal">
            {work.overdue > 0 && (
              <span className="flex items-center gap-2 font-medium text-destructive">
                {work.overdue} overdue
                <Link href="/cashflow-ai/work" className="rounded-md bg-destructive/10 px-2 py-0.5 text-xs hover:bg-destructive/20">Catch up</Link>
              </span>
            )}
            <Link href="/cashflow-ai/work" className="text-primary hover:underline">See all my work</Link>
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {work.items.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing is due today. Well done.</p>
        ) : (
          <>
            <p className="mb-1 text-xs text-muted-foreground">{work.summary}</p>
            <ul className="divide-y divide-border/40">
              {work.items.map((i) => (
                <li key={`${i.taskId}|${i.periodKey}`}>
                  <Link href={`/cashflow-ai/work/${i.taskId}/${i.periodKey}`} className="flex items-center gap-3 rounded-lg py-2.5 hover:bg-muted/50">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{i.title}</div>
                      <div className="text-xs text-muted-foreground">{i.periodLabel} · {i.stepsDone} of {i.stepsTotal} steps done</div>
                    </div>
                    <span className={i.state === "overdue" ? "text-xs font-medium text-destructive" : "text-xs font-medium text-amber-600"}>{i.state === "overdue" ? "Overdue" : "Due today"}</span>
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </CardContent>
    </GlassCard>
  );
}
