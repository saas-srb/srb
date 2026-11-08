import Link from "next/link";
import { cn } from "@/lib/utils";
import { WORK_VIEWS, type WorkView } from "@/lib/products/cashflow-ai/work/grouping";

/** The "My work" bar: jumps to Today / This week / This month / This quarter / This year on the My work page. */
export default function WorkTabs({ counts }: { counts?: Partial<Record<WorkView, number>> }) {
  return (
    <nav aria-label="My work" className="sticky top-0 z-10 -mx-1 flex gap-1 overflow-x-auto rounded-xl border border-border/50 bg-background/90 p-1 backdrop-blur">
      {WORK_VIEWS.map((v) => {
        const n = counts?.[v.key] ?? 0;
        return (
          <Link key={v.key} href={`/cashflow-ai/work#${v.key}`} className={cn("flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground")}>
            {v.label}
            {n > 0 && <span className="rounded-full bg-primary/10 px-1.5 text-xs text-primary">{n}</span>}
          </Link>
        );
      })}
    </nav>
  );
}
