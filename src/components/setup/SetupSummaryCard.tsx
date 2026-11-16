import Link from "next/link";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import SetupRing from "@/components/setup/SetupRing";
import type { SetupProgress } from "@/lib/platform/setup-progress/types";

/**
 * The dashboard's top card: the percentage, "X of Y steps", the next three best steps as buttons, and View all. At 100% it is only a quiet "Setup complete"
 * chip. Pure presentation: the page passes the computed progress.
 */
export default function SetupSummaryCard({ progress }: { progress: SetupProgress }) {
  const s = progress.summary;
  if (s.complete) {
    return (
      <Link href="/commandos/setup" data-setup-complete className="inline-flex w-fit items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-300">
        <CheckCircle2 className="size-3.5" aria-hidden /> Setup complete
      </Link>
    );
  }
  return (
    <section aria-label="Setup progress" data-setup-card className="flex flex-col gap-4 rounded-2xl border border-border/60 bg-card p-4 shadow-sm sm:flex-row sm:items-center sm:p-5">
      <SetupRing percent={s.percent} size={96} />
      <div className="min-w-0 flex-1 space-y-2">
        <div>
          <h2 className="text-base font-semibold">Finish setting up your company</h2>
          <p className="text-sm text-muted-foreground">{s.done} of {s.applicable} steps done{s.minutesLeft > 0 ? `, about ${s.minutesLeft} minutes left` : ""}. Complete when all steps that apply to you are done.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {progress.next.map((n) => (
            <Link key={n.id} href={n.href} className="inline-flex h-9 max-w-full items-center gap-1 truncate rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90" title={n.why}>
              <span className="truncate">{n.title}</span><ArrowRight className="size-3.5 shrink-0" aria-hidden />
            </Link>
          ))}
          <Link href="/commandos/setup" className="inline-flex h-9 items-center rounded-lg border border-border px-3 text-sm font-medium hover:bg-muted">View all</Link>
        </div>
      </div>
    </section>
  );
}
